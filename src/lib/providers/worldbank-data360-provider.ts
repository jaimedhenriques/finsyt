import type { DataProvider, DataProviderStatus, MarketQuote } from "@/lib/providers/base";

// World Bank Data360 indicator codes for economic data
export const DATA360_INDICATORS = {
  GDP_PPP: "NY.GDP.MKTP.PP.CD", // GDP, PPP (current international $)
  GDP_GROWTH: "NY.GDP.MKTP.KD.ZG", // GDP growth (annual %)
  INFLATION: "FP.CPI.TOTL.ZG", // Inflation, consumer prices (annual %)
  UNEMPLOYMENT: "SL.UEM.TOTL.ZS", // Unemployment, total (% of labor force)
  TRADE_BALANCE: "NE.RSB.GNFS.ZS", // External balance on goods and services (% of GDP)
  FOREIGN_RESERVES: "FI.RES.TOTL.CD", // Total reserves (includes gold, current US$)
  INTEREST_RATE: "FR.INR.RINR", // Real interest rate (%)
  EXCHANGE_RATE: "PA.NUS.FCRF", // Official exchange rate (LCU per US$, period average)
} as const;

export type Data360Indicator = (typeof DATA360_INDICATORS)[keyof typeof DATA360_INDICATORS];

export type Data360DataPoint = {
  country: string;
  countryCode: string;
  indicator: string;
  indicatorCode: string;
  year: number;
  value: number | null;
};

export type Data360Series = {
  indicator: string;
  indicatorCode: string;
  countries: string[];
  data: Data360DataPoint[];
  lastUpdated: string;
};

export class WorldBankData360Provider implements DataProvider {
  id = "worldbank_data360";
  displayName = "World Bank Data360";
  configured = true; // Public API, no key required

  private baseUrl = "https://api.worldbank.org/v2";
  private data360Url = "https://datacatalogapi.worldbank.org/dexapps/efi/data";

  async health(): Promise<DataProviderStatus> {
    try {
      const response = await fetch(`${this.baseUrl}/country?format=json&per_page=1`, {
        next: { revalidate: 300 },
      });
      return response.ok ? "healthy" : "unconfigured";
    } catch {
      return "unconfigured";
    }
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    // For Data360, we interpret "symbol" as a country code
    // and return latest GDP PPP as the "price" for economic comparison
    try {
      const data = await this.getIndicator(DATA360_INDICATORS.GDP_PPP, [symbol]);
      if (!data || data.data.length === 0) return null;

      const latest = data.data
        .filter((d) => d.value !== null)
        .sort((a, b) => b.year - a.year)[0];

      if (!latest) return null;

      return {
        provider: this.id,
        symbol: `${symbol}:GDP_PPP`,
        price: latest.value!,
        currency: "USD",
        asOf: `${latest.year}-12-31T00:00:00Z`,
      };
    } catch {
      return null;
    }
  }

  async getIndicator(
    indicatorCode: string,
    countryCodes: string[] = ["USA", "CHN", "DEU", "JPN", "GBR"],
    dateRange?: { start: number; end: number }
  ): Promise<Data360Series | null> {
    try {
      const countries = countryCodes.join(";");
      const currentYear = new Date().getFullYear();
      const startYear = dateRange?.start ?? currentYear - 10;
      const endYear = dateRange?.end ?? currentYear;

      const url = `${this.baseUrl}/country/${countries}/indicator/${indicatorCode}?format=json&per_page=1000&date=${startYear}:${endYear}`;

      const response = await fetch(url, {
        next: { revalidate: 3600 }, // Cache for 1 hour
      });

      if (!response.ok) return null;

      const json = await response.json();

      // World Bank API returns [metadata, data] array
      if (!Array.isArray(json) || json.length < 2) return null;

      const [metadata, rawData] = json;

      if (!Array.isArray(rawData) || rawData.length === 0) return null;

      const data: Data360DataPoint[] = rawData.map(
        (item: {
          country?: { value?: string; id?: string };
          indicator?: { value?: string; id?: string };
          date?: string;
          value?: number | null;
        }) => ({
          country: item.country?.value ?? "",
          countryCode: item.country?.id ?? "",
          indicator: item.indicator?.value ?? "",
          indicatorCode: item.indicator?.id ?? indicatorCode,
          year: parseInt(item.date ?? "0", 10),
          value: item.value ?? null,
        })
      );

      return {
        indicator: rawData[0]?.indicator?.value ?? indicatorCode,
        indicatorCode,
        countries: [...new Set(data.map((d) => d.countryCode))],
        data,
        lastUpdated: metadata?.lastupdated ?? new Date().toISOString(),
      };
    } catch {
      return null;
    }
  }

  async getMultipleIndicators(
    indicatorCodes: string[],
    countryCodes: string[] = ["USA", "CHN", "DEU"]
  ): Promise<Map<string, Data360Series>> {
    const results = new Map<string, Data360Series>();

    const promises = indicatorCodes.map(async (code) => {
      const data = await this.getIndicator(code, countryCodes);
      if (data) {
        results.set(code, data);
      }
    });

    await Promise.all(promises);
    return results;
  }

  async getEconomicSnapshot(
    countryCodes: string[] = ["USA", "CHN", "DEU"]
  ): Promise<{
    countries: string[];
    indicators: Map<string, Data360Series>;
    fetchedAt: string;
  }> {
    const indicators = await this.getMultipleIndicators(
      [
        DATA360_INDICATORS.GDP_PPP,
        DATA360_INDICATORS.GDP_GROWTH,
        DATA360_INDICATORS.INFLATION,
        DATA360_INDICATORS.UNEMPLOYMENT,
      ],
      countryCodes
    );

    return {
      countries: countryCodes,
      indicators,
      fetchedAt: new Date().toISOString(),
    };
  }

  // Data360-specific endpoint for enhanced financial indicators
  async getData360EFI(
    indicator: string = "IMF.WEO.PPPGDP",
    countries: string[] = ["USA", "CHN", "DEU"]
  ): Promise<{ data: Record<string, number[]>; metadata: Record<string, unknown> } | null> {
    try {
      const params = new URLSearchParams({
        indicator,
        countries: countries.join(","),
        format: "json",
      });

      const response = await fetch(`${this.data360Url}?${params}`, {
        next: { revalidate: 3600 },
      });

      if (!response.ok) {
        // Fallback to standard World Bank API
        return null;
      }

      const json = await response.json();
      return json;
    } catch {
      return null;
    }
  }
}
