import { env } from "@/lib/config/env";
import type { DataProvider, DataProviderStatus, MarketQuote } from "@/lib/providers/base";

export class AlphaVantageProvider implements DataProvider {
  id = "alphavantage";
  displayName = "Alpha Vantage";
  configured = Boolean(env.ALPHA_VANTAGE_API_KEY);

  async health(): Promise<DataProviderStatus> {
    if (!this.configured) return "unconfigured";
    return "healthy";
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    if (!this.configured || !env.ALPHA_VANTAGE_API_KEY) return null;

    const params = new URLSearchParams({
      function: "GLOBAL_QUOTE",
      symbol,
      apikey: env.ALPHA_VANTAGE_API_KEY,
    });

    const response = await fetch(`https://www.alphavantage.co/query?${params.toString()}`, {
      next: { revalidate: 30 },
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as {
      "Global Quote"?: { "05. price"?: string };
    };

    const rawPrice = payload["Global Quote"]?.["05. price"];
    if (!rawPrice) return null;

    return {
      provider: this.id,
      symbol,
      price: Number(rawPrice),
      currency: "USD",
      asOf: new Date().toISOString(),
    };
  }
}
