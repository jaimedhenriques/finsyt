import { env } from "@/lib/config/env";
import type { DataProvider, DataProviderStatus } from "@/lib/providers/base";

export class FredProvider implements DataProvider {
  id = "fred";
  displayName = "FRED";
  configured = Boolean(env.FRED_API_KEY);

  async health(): Promise<DataProviderStatus> {
    if (!this.configured) return "unconfigured";
    return "healthy";
  }

  async getQuote() {
    return null;
  }
}
