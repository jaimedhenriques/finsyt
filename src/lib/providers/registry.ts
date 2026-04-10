import type { DataProvider } from "@/lib/providers/base";
import { AlphaVantageProvider } from "@/lib/providers/alphavantage-provider";
import { DatabentoProvider } from "@/lib/providers/databento-provider";
import { FinnhubProvider } from "@/lib/providers/finnhub-provider";
import { FmpProvider } from "@/lib/providers/fmp-provider";
import { FredProvider } from "@/lib/providers/fred-provider";
import { WorldBankData360Provider } from "@/lib/providers/worldbank-data360-provider";

export const providerRegistry: DataProvider[] = [
  new FmpProvider(),
  new DatabentoProvider(),
  new AlphaVantageProvider(),
  new FinnhubProvider(),
  new FredProvider(),
  new WorldBankData360Provider(),
];
