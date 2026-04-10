// Financial data provider types

export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap?: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: Date;
}

export interface HistoricalPrice {
  date: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  adjustedClose: number;
  volume: number;
}

export interface CompanyProfile {
  symbol: string;
  name: string;
  description?: string;
  exchange: string;
  sector?: string;
  industry?: string;
  website?: string;
  logo?: string;
  ceo?: string;
  employees?: number;
  headquarters?: string;
  founded?: string;
  marketCap?: number;
  peRatio?: number;
  eps?: number;
  dividend?: number;
  dividendYield?: number;
  beta?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
}

export interface SECFiling {
  cik: string;
  accessionNumber: string;
  formType: string;
  filedAt: Date;
  reportDate?: Date;
  documentUrl: string;
  description?: string;
  companyName?: string;
  ticker?: string;
}

export interface FinancialStatement {
  period: string;
  date: Date;
  revenue?: number;
  netIncome?: number;
  grossProfit?: number;
  operatingIncome?: number;
  eps?: number;
  ebitda?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  totalEquity?: number;
  cashAndEquivalents?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
}

export interface EconomicIndicator {
  id: string;
  name: string;
  value: number;
  date: Date;
  unit?: string;
  frequency?: string;
}

export interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt: Date;
  summary?: string;
  symbols?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  image?: string;
}

export interface MarketIndex {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retryAttempts?: number;
}

export interface ProviderResponse<T> {
  data: T;
  source: string;
  cached: boolean;
  timestamp: Date;
}

export interface ProviderError {
  code: string;
  message: string;
  provider: string;
  retryable: boolean;
}

export type TimeFrame = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX';
