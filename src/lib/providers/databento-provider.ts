import { env } from "@/lib/config/env";
import type { DataProvider, DataProviderStatus, MarketQuote } from "@/lib/providers/base";

export class DatabentoProvider implements DataProvider {
  id = "databento";
  displayName = "Databento";
  configured = Boolean(env.DATABENTO_API_KEY && env.DATABENTO_USER_ID);

  async health(): Promise<DataProviderStatus> {
    if (!this.configured) return "unconfigured";
    return "healthy";
  }

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    if (!this.configured || !env.DATABENTO_API_KEY) return null;

    const response = await fetch("https://hist.databento.com/v0/timeseries.get_range", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.DATABENTO_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dataset: "XNAS.ITCH",
        schema: "ohlcv-1m",
        symbols: [symbol],
        start: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
        limit: 1,
      }),
      next: { revalidate: 15 },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as {
      data?: Array<{ close?: number | string }>;
    };

    const latest = payload.data?.[0];
    const close = latest?.close;
    if (close === undefined || close === null) return null;

    return {
      provider: this.id,
      symbol,
      price: Number(close),
      currency: "USD",
      asOf: new Date().toISOString(),
    };
  }
}
