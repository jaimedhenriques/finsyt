import { env } from "@/lib/config/env";
import type { DataProvider, DataProviderStatus } from "@/lib/providers/base";

export class FmpProvider implements DataProvider {
  id = "fmp";
  displayName = "Financial Modeling Prep";
  configured = Boolean(env.FMP_API_KEY);

  async health(): Promise<DataProviderStatus> {
    if (!this.configured) return "unconfigured";
    return "healthy";
  }
}
