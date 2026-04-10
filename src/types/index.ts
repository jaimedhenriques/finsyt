// Stock/Market Types
export interface StockQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  marketCap: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: Date;
}

export interface HistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  adjustedClose?: number;
}

export interface CompanyInfo {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  website: string;
  employees: number;
  headquarters: string;
  ceo: string;
  founded: string;
}

export interface FinancialMetrics {
  symbol: string;
  peRatio: number;
  pegRatio: number;
  eps: number;
  revenue: number;
  revenueGrowth: number;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
  roe: number;
  roa: number;
  debtToEquity: number;
  currentRatio: number;
  quickRatio: number;
  dividendYield: number;
  payoutRatio: number;
  freeCashFlow: number;
}

// AI Chat Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  sources?: Source[];
  timestamp: Date;
}

export interface Source {
  title: string;
  url?: string;
  type: 'sec_filing' | 'earnings_call' | 'news' | 'analysis' | 'data';
  date?: string;
}

export interface ResearchQuery {
  query: string;
  context?: string;
  symbols?: string[];
  includeNews?: boolean;
  includeSECFilings?: boolean;
  includeAnalystReports?: boolean;
}

export interface ResearchResponse {
  answer: string;
  sources: Source[];
  relatedQuestions?: string[];
  charts?: ChartData[];
  tokens: number;
}

// Chart Types
export interface ChartData {
  type: 'line' | 'bar' | 'candlestick' | 'pie';
  title: string;
  data: ChartDataPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
}

export interface ChartDataPoint {
  x: string | number;
  y: number;
  label?: string;
  color?: string;
}

// Dashboard Types
export interface DashboardStats {
  totalQueries: number;
  queriesThisMonth: number;
  savedReports: number;
  watchlistCount: number;
  creditsRemaining: number;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

// News Types
export interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: string;
  url: string;
  publishedAt: Date;
  symbols?: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// Screener Types
export interface ScreenerCriteria {
  minMarketCap?: number;
  maxMarketCap?: number;
  minPE?: number;
  maxPE?: number;
  minDividendYield?: number;
  sector?: string;
  industry?: string;
  minRevenueGrowth?: number;
  minROE?: number;
}

export interface ScreenerResult {
  symbol: string;
  name: string;
  sector: string;
  marketCap: number;
  price: number;
  peRatio: number;
  dividendYield: number;
  revenueGrowth: number;
  roe: number;
}
