import type { DataProvider } from "@/lib/providers/base";
import { FinnhubProvider } from "@/lib/providers/finnhub-provider";
import { FmpProvider } from "@/lib/providers/fmp-provider";
import { FredProvider } from "@/lib/providers/fred-provider";

export const providerRegistry: DataProvider[] = [
  new FmpProvider(),
  new FinnhubProvider(),
  new FredProvider(),
];
