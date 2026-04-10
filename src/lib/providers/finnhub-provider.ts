import { env } from "@/lib/config/env";
import type { DataProvider, DataProviderStatus } from "@/lib/providers/base";

export class FinnhubProvider implements DataProvider {
  id = "finnhub";
  displayName = "Finnhub";
  configured = Boolean(env.FINNHUB_API_KEY);

  async health(): Promise<DataProviderStatus> {
    if (!this.configured) return "unconfigured";
    return "healthy";
  }
}
