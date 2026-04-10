import { BaseProvider } from './base';
import {
  StockQuote,
  CompanyProfile,
  FinancialStatement,
  NewsArticle,
  ProviderConfig,
  HistoricalPrice,
} from './types';

interface FMPQuote {
  symbol: string;
  name: string;
  price: number;
  changesPercentage: number;
  change: number;
  dayLow: number;
  dayHigh: number;
  yearHigh: number;
  yearLow: number;
  marketCap: number;
  priceAvg50: number;
  priceAvg200: number;
  volume: number;
  avgVolume: number;
  exchange: string;
  open: number;
  previousClose: number;
  eps: number;
  pe: number;
  timestamp: number;
}

interface FMPProfile {
  symbol: string;
  companyName: string;
  currency: string;
  cik: string;
  isin: string;
  exchange: string;
  exchangeShortName: string;
  industry: string;
  website: string;
  description: string;
  ceo: string;
  sector: string;
  country: string;
  fullTimeEmployees: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  image: string;
  ipoDate: string;
  defaultImage: boolean;
  isEtf: boolean;
  isActivelyTrading: boolean;
}

interface FMPIncomeStatement {
  date: string;
  symbol: string;
  reportedCurrency: string;
  cik: string;
  fillingDate: string;
  acceptedDate: string;
  calendarYear: string;
  period: string;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  grossProfitRatio: number;
  researchAndDevelopmentExpenses: number;
  generalAndAdministrativeExpenses: number;
  sellingAndMarketingExpenses: number;
  sellingGeneralAndAdministrativeExpenses: number;
  otherExpenses: number;
  operatingExpenses: number;
  costAndExpenses: number;
  interestIncome: number;
  interestExpense: number;
  depreciationAndAmortization: number;
  ebitda: number;
  ebitdaratio: number;
  operatingIncome: number;
  operatingIncomeRatio: number;
  totalOtherIncomeExpensesNet: number;
  incomeBeforeTax: number;
  incomeBeforeTaxRatio: number;
  incomeTaxExpense: number;
  netIncome: number;
  netIncomeRatio: number;
  eps: number;
  epsdiluted: number;
  weightedAverageShsOut: number;
  weightedAverageShsOutDil: number;
  link: string;
  finalLink: string;
}

interface FMPBalanceSheet {
  date: string;
  symbol: string;
  totalAssets: number;
  totalLiabilities: number;
  totalStockholdersEquity: number;
  cashAndCashEquivalents: number;
  shortTermInvestments: number;
  netReceivables: number;
  inventory: number;
  totalCurrentAssets: number;
  totalNonCurrentAssets: number;
  totalCurrentLiabilities: number;
  totalNonCurrentLiabilities: number;
  totalDebt: number;
}

interface FMPCashFlow {
  date: string;
  symbol: string;
  operatingCashFlow: number;
  capitalExpenditure: number;
  freeCashFlow: number;
  dividendsPaid: number;
  netCashUsedForInvestingActivites: number;
  netCashUsedProvidedByFinancingActivities: number;
  netChangeInCash: number;
}

interface FMPNews {
  symbol: string;
  publishedDate: string;
  title: string;
  image: string;
  site: string;
  text: string;
  url: string;
}

interface FMPHistoricalPrice {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  adjClose: number;
  volume: number;
  unadjustedVolume: number;
  change: number;
  changePercent: number;
  vwap: number;
  label: string;
  changeOverTime: number;
}

interface FMPSearchResult {
  symbol: string;
  name: string;
  currency: string;
  stockExchange: string;
  exchangeShortName: string;
}

export class FMPProvider extends BaseProvider {
  private readonly BASE_URL = 'https://financialmodelingprep.com/api/v3';
  private apiKey: string;

  constructor(config: ProviderConfig = {}) {
    super('Financial Modeling Prep', config);
    this.apiKey = config.apiKey || process.env.FMP_API_KEY || '';
  }

  private getUrl(endpoint: string, params: Record<string, string> = {}): string {
    const searchParams = new URLSearchParams({
      apikey: this.apiKey,
      ...params,
    });
    return `${this.BASE_URL}${endpoint}?${searchParams.toString()}`;
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const url = this.getUrl(`/quote/${symbol}`);
    const data = await this.fetchWithRetry<FMPQuote[]>(url);

    if (!data.length) {
      throw this.createError('NOT_FOUND', `Symbol not found: ${symbol}`, false);
    }

    return this.parseQuote(data[0]);
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    const symbolsParam = symbols.join(',');
    const url = this.getUrl(`/quote/${symbolsParam}`);
    const data = await this.fetchWithRetry<FMPQuote[]>(url);

    return data.map((q) => this.parseQuote(q));
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const url = this.getUrl(`/profile/${symbol}`);
    const data = await this.fetchWithRetry<FMPProfile[]>(url);

    if (!data.length) {
      throw this.createError('NOT_FOUND', `Profile not found: ${symbol}`, false);
    }

    return this.parseProfile(data[0]);
  }

  async getIncomeStatements(
    symbol: string,
    period: 'annual' | 'quarter' = 'annual',
    limit: number = 5
  ): Promise<FinancialStatement[]> {
    const url = this.getUrl(`/income-statement/${symbol}`, {
      period,
      limit: limit.toString(),
    });
    const data = await this.fetchWithRetry<FMPIncomeStatement[]>(url);

    return data.map((stmt) => ({
      period: stmt.period,
      date: new Date(stmt.date),
      revenue: stmt.revenue,
      netIncome: stmt.netIncome,
      grossProfit: stmt.grossProfit,
      operatingIncome: stmt.operatingIncome,
      eps: stmt.epsdiluted,
      ebitda: stmt.ebitda,
    }));
  }

  async getBalanceSheets(
    symbol: string,
    period: 'annual' | 'quarter' = 'annual',
    limit: number = 5
  ): Promise<FinancialStatement[]> {
    const url = this.getUrl(`/balance-sheet-statement/${symbol}`, {
      period,
      limit: limit.toString(),
    });
    const data = await this.fetchWithRetry<FMPBalanceSheet[]>(url);

    return data.map((stmt) => ({
      period: period === 'annual' ? 'FY' : 'Q',
      date: new Date(stmt.date),
      totalAssets: stmt.totalAssets,
      totalLiabilities: stmt.totalLiabilities,
      totalEquity: stmt.totalStockholdersEquity,
      cashAndEquivalents: stmt.cashAndCashEquivalents,
    }));
  }

  async getCashFlowStatements(
    symbol: string,
    period: 'annual' | 'quarter' = 'annual',
    limit: number = 5
  ): Promise<FinancialStatement[]> {
    const url = this.getUrl(`/cash-flow-statement/${symbol}`, {
      period,
      limit: limit.toString(),
    });
    const data = await this.fetchWithRetry<FMPCashFlow[]>(url);

    return data.map((stmt) => ({
      period: period === 'annual' ? 'FY' : 'Q',
      date: new Date(stmt.date),
      operatingCashFlow: stmt.operatingCashFlow,
      freeCashFlow: stmt.freeCashFlow,
    }));
  }

  async getStockNews(
    symbols: string[],
    limit: number = 20
  ): Promise<NewsArticle[]> {
    const url = this.getUrl('/stock_news', {
      tickers: symbols.join(','),
      limit: limit.toString(),
    });
    const data = await this.fetchWithRetry<FMPNews[]>(url);

    return data.map((article) => ({
      title: article.title,
      url: article.url,
      source: article.site,
      publishedAt: new Date(article.publishedDate),
      summary: article.text,
      symbols: [article.symbol],
      image: article.image,
    }));
  }

  async getMarketMovers(type: 'gainers' | 'losers' | 'actives'): Promise<StockQuote[]> {
    const endpoint = type === 'actives' ? '/actives' : `/${type}`;
    const url = this.getUrl(endpoint);
    const data = await this.fetchWithRetry<FMPQuote[]>(url);

    return data.slice(0, 20).map((q) => this.parseQuote(q));
  }

  async getSectorPerformance(): Promise<
    Array<{ sector: string; changesPercentage: number }>
  > {
    const url = this.getUrl('/sectors-performance');
    return this.fetchWithRetry(url);
  }

  async getEarningsCalendar(
    from?: Date,
    to?: Date
  ): Promise<
    Array<{
      symbol: string;
      date: Date;
      eps?: number;
      epsEstimated?: number;
      revenue?: number;
      revenueEstimated?: number;
    }>
  > {
    const params: Record<string, string> = {};
    if (from) params.from = this.formatDate(from);
    if (to) params.to = this.formatDate(to);

    const url = this.getUrl('/earning_calendar', params);
    const data = await this.fetchWithRetry<
      Array<{
        symbol: string;
        date: string;
        eps: number | null;
        epsEstimated: number | null;
        revenue: number | null;
        revenueEstimated: number | null;
      }>
    >(url);

    return data.map((e) => ({
      symbol: e.symbol,
      date: new Date(e.date),
      eps: e.eps ?? undefined,
      epsEstimated: e.epsEstimated ?? undefined,
      revenue: e.revenue ?? undefined,
      revenueEstimated: e.revenueEstimated ?? undefined,
    }));
  }

  async getHistoricalPrices(
    symbol: string,
    options?: { from?: Date; to?: Date }
  ): Promise<HistoricalPrice[]> {
    const params: Record<string, string> = {};
    if (options?.from) params.from = this.formatDate(options.from);
    if (options?.to) params.to = this.formatDate(options.to);

    const url = this.getUrl(`/historical-price-full/${symbol}`, params);
    const data = await this.fetchWithRetry<{
      symbol: string;
      historical: FMPHistoricalPrice[];
    }>(url);

    if (!data.historical) {
      throw this.createError('NOT_FOUND', `Historical data not found: ${symbol}`, false);
    }

    return data.historical.map((h) => ({
      date: new Date(h.date),
      open: h.open,
      high: h.high,
      low: h.low,
      close: h.close,
      adjustedClose: h.adjClose,
      volume: h.volume,
    })).sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  async searchSymbol(
    query: string
  ): Promise<Array<{ symbol: string; name: string; type: string; region: string }>> {
    const url = this.getUrl('/search', { query, limit: '10' });
    const data = await this.fetchWithRetry<FMPSearchResult[]>(url);

    return data.map((result) => ({
      symbol: result.symbol,
      name: result.name,
      type: 'stock',
      region: result.exchangeShortName,
    }));
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.getQuote('AAPL');
      return true;
    } catch {
      return false;
    }
  }

  private parseQuote(quote: FMPQuote): StockQuote {
    return {
      symbol: quote.symbol,
      name: quote.name,
      price: quote.price,
      change: quote.change,
      changePercent: quote.changesPercentage,
      volume: quote.volume,
      marketCap: quote.marketCap,
      high: quote.dayHigh,
      low: quote.dayLow,
      open: quote.open,
      previousClose: quote.previousClose,
      timestamp: new Date(quote.timestamp * 1000),
    };
  }

  private parseProfile(profile: FMPProfile): CompanyProfile {
    return {
      symbol: profile.symbol,
      name: profile.companyName,
      description: profile.description,
      exchange: profile.exchangeShortName,
      sector: profile.sector,
      industry: profile.industry,
      website: profile.website,
      logo: profile.image,
      ceo: profile.ceo,
      employees: parseInt(profile.fullTimeEmployees) || undefined,
      headquarters: [profile.city, profile.state, profile.country]
        .filter(Boolean)
        .join(', '),
    };
  }
}

export const fmp = new FMPProvider();
