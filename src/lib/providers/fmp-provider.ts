import { env } from "@/lib/config/env";
import type { DataProvider, DataProviderStatus, ProviderQuote } from "@/lib/providers/base";

export class FmpProvider implements DataProvider {
  id = "fmp";
  displayName = "Financial Modeling Prep";
  configured = Boolean(env.FMP_API_KEY);

  async health(): Promise<DataProviderStatus> {
    if (!this.configured) return "unconfigured";
    return "healthy";
  }

  async getQuote(symbol: string): Promise<ProviderQuote | null> {
    if (!this.configured || !env.FMP_API_KEY) return null;

    const endpoint = `https://financialmodelingprep.com/stable/quote?symbol=${encodeURIComponent(symbol)}&apikey=${env.FMP_API_KEY}`;
    const response = await fetch(endpoint, { next: { revalidate: 30 } });

    if (!response.ok) return null;
    const payload = (await response.json()) as Array<{
      symbol?: string;
      price?: number;
      timestamp?: number;
    }>;

    const first = payload[0];
    if (!first?.price) return null;

    return {
      provider: this.id,
      symbol: first.symbol ?? symbol,
      price: first.price,
      currency: "USD",
      asOf: first.timestamp ? new Date(first.timestamp * 1000).toISOString() : new Date().toISOString(),
    };
  }
}
