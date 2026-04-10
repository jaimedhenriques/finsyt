import { env } from "@/lib/config/env";
import type { DataProvider, DataProviderStatus, ProviderQuote } from "@/lib/providers/base";

export class FinnhubProvider implements DataProvider {
  id = "finnhub";
  displayName = "Finnhub";
  configured = Boolean(env.FINNHUB_API_KEY);

  async health(): Promise<DataProviderStatus> {
    if (!this.configured) return "unconfigured";
    return "healthy";
  }

  async getQuote(symbol: string): Promise<ProviderQuote | null> {
    if (!this.configured || !env.FINNHUB_API_KEY) return null;

    const params = new URLSearchParams({
      symbol,
      token: env.FINNHUB_API_KEY,
    });

    const response = await fetch(`https://finnhub.io/api/v1/quote?${params.toString()}`, {
      next: { revalidate: 30 },
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { c?: number };
    if (typeof payload.c !== "number") return null;

    return {
      provider: this.id,
      symbol,
      price: payload.c,
      currency: "USD",
      asOf: new Date().toISOString(),
    };
  }
}
