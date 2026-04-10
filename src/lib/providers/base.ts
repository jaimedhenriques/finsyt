export type DataProviderStatus = "healthy" | "unconfigured";

export type MarketQuote = {
  symbol: string;
  price: number;
  currency?: string;
  asOf: string;
  provider: string;
};

export interface DataProvider {
  id: string;
  displayName: string;
  configured: boolean;
  priority: number;
  health(): Promise<DataProviderStatus>;
  getQuote?(symbol: string): Promise<MarketQuote | null>;
}
