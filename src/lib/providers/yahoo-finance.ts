import { BaseProvider } from './base';
import {
  StockQuote,
  HistoricalPrice,
  CompanyProfile,
  NewsArticle,
  ProviderConfig,
  TimeFrame,
} from './types';

interface YahooQuoteResult {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  regularMarketVolume: number;
  marketCap?: number;
  regularMarketDayHigh: number;
  regularMarketDayLow: number;
  regularMarketOpen: number;
  regularMarketPreviousClose: number;
  regularMarketTime: number;
}

interface YahooChartResult {
  chart: {
    result: Array<{
      timestamp: number[];
      indicators: {
        quote: Array<{
          open: number[];
          high: number[];
          low: number[];
          close: number[];
          volume: number[];
        }>;
        adjclose?: Array<{
          adjclose: number[];
        }>;
      };
    }>;
  };
}

interface YahooProfileResult {
  quoteSummary: {
    result: Array<{
      assetProfile?: {
        longBusinessSummary?: string;
        sector?: string;
        industry?: string;
        website?: string;
        fullTimeEmployees?: number;
        city?: string;
        state?: string;
        country?: string;
      };
      summaryProfile?: {
        sector?: string;
        industry?: string;
        website?: string;
      };
      price?: {
        regularMarketPrice?: { raw: number };
        marketCap?: { raw: number };
      };
      summaryDetail?: {
        trailingPE?: { raw: number };
        forwardPE?: { raw: number };
        dividendYield?: { raw: number };
        beta?: { raw: number };
        fiftyTwoWeekHigh?: { raw: number };
        fiftyTwoWeekLow?: { raw: number };
      };
      defaultKeyStatistics?: {
        trailingEps?: { raw: number };
        forwardEps?: { raw: number };
      };
    }>;
  };
}

export class YahooFinanceProvider extends BaseProvider {
  private readonly BASE_URL = 'https://query1.finance.yahoo.com';

  constructor(config: ProviderConfig = {}) {
    super('Yahoo Finance', config);
  }

  async getQuote(symbol: string): Promise<StockQuote> {
    const url = `${this.BASE_URL}/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

    const data = await this.fetchWithRetry<{
      quoteResponse: { result: YahooQuoteResult[] };
    }>(url);

    if (!data.quoteResponse.result.length) {
      throw this.createError('NOT_FOUND', `Symbol not found: ${symbol}`, false);
    }

    return this.parseQuote(data.quoteResponse.result[0]);
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    const symbolsParam = symbols.join(',');
    const url = `${this.BASE_URL}/v7/finance/quote?symbols=${encodeURIComponent(symbolsParam)}`;

    const data = await this.fetchWithRetry<{
      quoteResponse: { result: YahooQuoteResult[] };
    }>(url);

    return data.quoteResponse.result.map((result) => this.parseQuote(result));
  }

  async getHistoricalPrices(
    symbol: string,
    timeframe: TimeFrame = '1Y',
    interval: '1d' | '1wk' | '1mo' = '1d'
  ): Promise<HistoricalPrice[]> {
    const { period1, period2 } = this.getTimeframeDates(timeframe);

    const url = `${this.BASE_URL}/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=${interval}`;

    const data = await this.fetchWithRetry<YahooChartResult>(url);

    if (!data.chart.result?.length) {
      throw this.createError('NOT_FOUND', `No data for symbol: ${symbol}`, false);
    }

    return this.parseHistoricalData(data.chart.result[0]);
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const modules = 'assetProfile,summaryProfile,price,summaryDetail,defaultKeyStatistics';
    const url = `${this.BASE_URL}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;

    const data = await this.fetchWithRetry<YahooProfileResult>(url);

    if (!data.quoteSummary.result?.length) {
      throw this.createError('NOT_FOUND', `Profile not found: ${symbol}`, false);
    }

    return this.parseProfile(symbol, data.quoteSummary.result[0]);
  }

  async searchSymbols(
    query: string,
    limit: number = 10
  ): Promise<Array<{ symbol: string; name: string; exchange: string; type: string }>> {
    const url = `${this.BASE_URL}/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=${limit}&newsCount=0`;

    const data = await this.fetchWithRetry<{
      quotes: Array<{
        symbol: string;
        shortname?: string;
        longname?: string;
        exchange: string;
        quoteType: string;
      }>;
    }>(url);

    return data.quotes.map((q) => ({
      symbol: q.symbol,
      name: q.longname || q.shortname || q.symbol,
      exchange: q.exchange,
      type: q.quoteType,
    }));
  }

  async getTrending(region: string = 'US'): Promise<string[]> {
    const url = `${this.BASE_URL}/v1/finance/trending/${region}`;

    const data = await this.fetchWithRetry<{
      finance: {
        result: Array<{
          quotes: Array<{ symbol: string }>;
        }>;
      };
    }>(url);

    return data.finance.result[0]?.quotes.map((q) => q.symbol) || [];
  }

  private parseQuote(result: YahooQuoteResult): StockQuote {
    return {
      symbol: result.symbol,
      name: result.longName || result.shortName || result.symbol,
      price: result.regularMarketPrice,
      change: result.regularMarketChange,
      changePercent: result.regularMarketChangePercent,
      volume: result.regularMarketVolume,
      marketCap: result.marketCap,
      high: result.regularMarketDayHigh,
      low: result.regularMarketDayLow,
      open: result.regularMarketOpen,
      previousClose: result.regularMarketPreviousClose,
      timestamp: new Date(result.regularMarketTime * 1000),
    };
  }

  private parseHistoricalData(
    result: YahooChartResult['chart']['result'][0]
  ): HistoricalPrice[] {
    const { timestamp, indicators } = result;
    const quote = indicators.quote[0];
    const adjclose = indicators.adjclose?.[0]?.adjclose;

    return timestamp.map((ts, i) => ({
      date: new Date(ts * 1000),
      open: quote.open[i],
      high: quote.high[i],
      low: quote.low[i],
      close: quote.close[i],
      adjustedClose: adjclose?.[i] ?? quote.close[i],
      volume: quote.volume[i],
    }));
  }

  private parseProfile(
    symbol: string,
    result: YahooProfileResult['quoteSummary']['result'][0]
  ): CompanyProfile {
    const profile = result.assetProfile || {};
    const summaryProfile = result.summaryProfile || {};
    const price = result.price || {};
    const summaryDetail = result.summaryDetail || {};
    const keyStats = result.defaultKeyStatistics || {};

    return {
      symbol,
      name: symbol,
      description: profile.longBusinessSummary,
      exchange: '',
      sector: profile.sector || summaryProfile.sector,
      industry: profile.industry || summaryProfile.industry,
      website: profile.website || summaryProfile.website,
      employees: profile.fullTimeEmployees,
      headquarters: [profile.city, profile.state, profile.country]
        .filter(Boolean)
        .join(', '),
      marketCap: price.marketCap?.raw,
      peRatio: summaryDetail.trailingPE?.raw,
      eps: keyStats.trailingEps?.raw,
      dividendYield: summaryDetail.dividendYield?.raw,
      beta: summaryDetail.beta?.raw,
      fiftyTwoWeekHigh: summaryDetail.fiftyTwoWeekHigh?.raw,
      fiftyTwoWeekLow: summaryDetail.fiftyTwoWeekLow?.raw,
    };
  }

  private getTimeframeDates(timeframe: TimeFrame): {
    period1: number;
    period2: number;
  } {
    const now = Math.floor(Date.now() / 1000);
    const day = 24 * 60 * 60;

    const timeframeMap: Record<TimeFrame, number> = {
      '1D': day,
      '1W': 7 * day,
      '1M': 30 * day,
      '3M': 90 * day,
      '6M': 180 * day,
      '1Y': 365 * day,
      '5Y': 5 * 365 * day,
      'MAX': 50 * 365 * day,
    };

    return {
      period1: now - timeframeMap[timeframe],
      period2: now,
    };
  }
}

export const yahooFinance = new YahooFinanceProvider();
