import { BaseProvider } from './base';
import type {
  StockQuote,
  CompanyProfile,
  HistoricalPrice,
  ProviderConfig,
} from './types';

interface AVGlobalQuote {
  '01. symbol': string;
  '02. open': string;
  '03. high': string;
  '04. low': string;
  '05. price': string;
  '06. volume': string;
  '07. latest trading day': string;
  '08. previous close': string;
  '09. change': string;
  '10. change percent': string;
}

interface AVOverview {
  Symbol: string;
  Name: string;
  Description: string;
  Exchange: string;
  Currency: string;
  Country: string;
  Sector: string;
  Industry: string;
  MarketCapitalization: string;
  EBITDA: string;
  PERatio: string;
  PEGRatio: string;
  BookValue: string;
  DividendPerShare: string;
  DividendYield: string;
  EPS: string;
  RevenuePerShareTTM: string;
  ProfitMargin: string;
  OperatingMarginTTM: string;
  ReturnOnAssetsTTM: string;
  ReturnOnEquityTTM: string;
  RevenueTTM: string;
  GrossProfitTTM: string;
  DilutedEPSTTM: string;
  QuarterlyEarningsGrowthYOY: string;
  QuarterlyRevenueGrowthYOY: string;
  AnalystTargetPrice: string;
  AnalystRatingStrongBuy: string;
  AnalystRatingBuy: string;
  AnalystRatingHold: string;
  AnalystRatingSell: string;
  AnalystRatingStrongSell: string;
  TrailingPE: string;
  ForwardPE: string;
  PriceToSalesRatioTTM: string;
  PriceToBookRatio: string;
  EVToRevenue: string;
  EVToEBITDA: string;
  Beta: string;
  '52WeekHigh': string;
  '52WeekLow': string;
  '50DayMovingAverage': string;
  '200DayMovingAverage': string;
  SharesOutstanding: string;
  DividendDate: string;
  ExDividendDate: string;
}

interface AVTimeSeries {
  [date: string]: {
    '1. open': string;
    '2. high': string;
    '3. low': string;
    '4. close': string;
    '5. adjusted close'?: string;
    '5. volume'?: string;
    '6. volume'?: string;
  };
}

interface AVEarnings {
  symbol: string;
  annualEarnings: Array<{
    fiscalDateEnding: string;
    reportedEPS: string;
  }>;
  quarterlyEarnings: Array<{
    fiscalDateEnding: string;
    reportedDate: string;
    reportedEPS: string;
    estimatedEPS: string;
    surprise: string;
    surprisePercentage: string;
  }>;
}

interface AVSearchResult {
  bestMatches: Array<{
    '1. symbol': string;
    '2. name': string;
    '3. type': string;
    '4. region': string;
    '5. marketOpen': string;
    '6. marketClose': string;
    '7. timezone': string;
    '8. currency': string;
    '9. matchScore': string;
  }>;
}

/**
 * Alpha Vantage Provider
 *
 * Free and premium market data provider.
 * Supports: quotes, company overview, historical data, earnings, technical indicators.
 *
 * API Docs: https://www.alphavantage.co/documentation/
 */
export class AlphaVantageProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl = 'https://www.alphavantage.co/query';

  constructor(config: ProviderConfig = {}) {
    super('AlphaVantage', config);
    this.apiKey = process.env.ALPHA_VANTAGE_API_KEY || '';
  }

  private buildUrl(params: Record<string, string>): string {
    const searchParams = new URLSearchParams({
      ...params,
      apikey: this.apiKey,
    });
    return `${this.baseUrl}?${searchParams.toString()}`;
  }

  /**
   * Get real-time quote
   */
  async getQuote(symbol: string): Promise<StockQuote> {
    const url = this.buildUrl({
      function: 'GLOBAL_QUOTE',
      symbol,
    });

    const response = await this.fetchWithRetry<{
      'Global Quote': AVGlobalQuote;
      Note?: string;
    }>(url);

    if (response.Note) {
      throw this.createError('RATE_LIMIT', response.Note, true);
    }

    const quote = response['Global Quote'];
    if (!quote || !quote['05. price']) {
      throw this.createError('NOT_FOUND', `Quote not found for ${symbol}`, false);
    }

    const price = parseFloat(quote['05. price']);
    const previousClose = parseFloat(quote['08. previous close']);
    const change = parseFloat(quote['09. change']);
    const changePercent = parseFloat(quote['10. change percent'].replace('%', ''));

    return {
      symbol: quote['01. symbol'],
      name: quote['01. symbol'], // Will be enriched by profile lookup
      price,
      change,
      changePercent,
      volume: parseInt(quote['06. volume'], 10),
      previousClose,
      open: parseFloat(quote['02. open']),
      high: parseFloat(quote['03. high']),
      low: parseFloat(quote['04. low']),
      marketCap: 0, // Not available in quote
      timestamp: new Date(),
    };
  }

  /**
   * Get company overview/profile
   */
  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    const url = this.buildUrl({
      function: 'OVERVIEW',
      symbol,
    });

    const response = await this.fetchWithRetry<AVOverview & { Note?: string }>(url);

    if (response.Note) {
      throw this.createError('RATE_LIMIT', response.Note, true);
    }

    if (!response.Symbol) {
      throw this.createError('NOT_FOUND', `Company not found: ${symbol}`, false);
    }

    return {
      symbol: response.Symbol,
      name: response.Name,
      description: response.Description,
      sector: response.Sector,
      industry: response.Industry,
      marketCap: parseFloat(response.MarketCapitalization) || 0,
      employees: 0, // Not available
      ceo: '', // Not available
      website: '', // Not available
      exchange: response.Exchange,
      peRatio: parseFloat(response.PERatio) || undefined,
      eps: parseFloat(response.EPS) || undefined,
      beta: parseFloat(response.Beta) || undefined,
      dividendYield: parseFloat(response.DividendYield) || undefined,
      fiftyTwoWeekHigh: parseFloat(response['52WeekHigh']) || undefined,
      fiftyTwoWeekLow: parseFloat(response['52WeekLow']) || undefined,
    };
  }

  /**
   * Get daily historical prices
   */
  async getHistoricalPrices(
    symbol: string,
    options: { outputSize?: 'compact' | 'full'; adjusted?: boolean } = {}
  ): Promise<HistoricalPrice[]> {
    const { outputSize = 'compact', adjusted = true } = options;

    const url = this.buildUrl({
      function: adjusted ? 'TIME_SERIES_DAILY_ADJUSTED' : 'TIME_SERIES_DAILY',
      symbol,
      outputsize: outputSize,
    });

    const response = await this.fetchWithRetry<{
      'Time Series (Daily)'?: AVTimeSeries;
      Note?: string;
    }>(url);

    if (response.Note) {
      throw this.createError('RATE_LIMIT', response.Note, true);
    }

    const timeSeries = response['Time Series (Daily)'];
    if (!timeSeries) {
      throw this.createError('NOT_FOUND', `Historical data not found for ${symbol}`, false);
    }

    return Object.entries(timeSeries)
      .map(([date, data]) => ({
        date: new Date(date),
        open: parseFloat(data['1. open']),
        high: parseFloat(data['2. high']),
        low: parseFloat(data['3. low']),
        close: parseFloat(data['4. close']),
        volume: parseInt(data['5. volume'] || data['6. volume'] || '0', 10),
        adjustedClose: data['5. adjusted close']
          ? parseFloat(data['5. adjusted close'])
          : parseFloat(data['4. close']),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Get intraday prices
   */
  async getIntradayPrices(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '60min' = '5min',
    outputSize: 'compact' | 'full' = 'compact'
  ): Promise<HistoricalPrice[]> {
    const url = this.buildUrl({
      function: 'TIME_SERIES_INTRADAY',
      symbol,
      interval,
      outputsize: outputSize,
    });

    const response = await this.fetchWithRetry<Record<string, unknown>>(url);

    if (response.Note) {
      throw this.createError('RATE_LIMIT', response.Note as string, true);
    }

    const timeSeriesKey = Object.keys(response).find((k) =>
      k.startsWith('Time Series')
    );
    if (!timeSeriesKey) {
      throw this.createError('NOT_FOUND', `Intraday data not found for ${symbol}`, false);
    }

    const timeSeries = response[timeSeriesKey] as AVTimeSeries;

    return Object.entries(timeSeries)
      .map(([datetime, data]) => ({
        date: new Date(datetime),
        open: parseFloat(data['1. open']),
        high: parseFloat(data['2. high']),
        low: parseFloat(data['3. low']),
        close: parseFloat(data['4. close']),
        volume: parseInt(data['5. volume'] || '0', 10),
        adjustedClose: parseFloat(data['4. close']),
      }))
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  /**
   * Get earnings data
   */
  async getEarnings(symbol: string): Promise<AVEarnings> {
    const url = this.buildUrl({
      function: 'EARNINGS',
      symbol,
    });

    const response = await this.fetchWithRetry<AVEarnings & { Note?: string }>(url);

    if (response.Note) {
      throw this.createError('RATE_LIMIT', response.Note, true);
    }

    if (!response.symbol) {
      throw this.createError('NOT_FOUND', `Earnings not found for ${symbol}`, false);
    }

    return response;
  }

  /**
   * Search for symbols
   */
  async searchSymbols(
    query: string
  ): Promise<Array<{ symbol: string; name: string; type: string; region: string }>> {
    const url = this.buildUrl({
      function: 'SYMBOL_SEARCH',
      keywords: query,
    });

    const response = await this.fetchWithRetry<AVSearchResult & { Note?: string }>(url);

    if (response.Note) {
      throw this.createError('RATE_LIMIT', response.Note, true);
    }

    return (response.bestMatches || []).map((match) => ({
      symbol: match['1. symbol'],
      name: match['2. name'],
      type: match['3. type'],
      region: match['4. region'],
    }));
  }

  /**
   * Get technical indicator (SMA, EMA, RSI, MACD, etc.)
   */
  async getTechnicalIndicator(
    symbol: string,
    indicator: 'SMA' | 'EMA' | 'RSI' | 'MACD' | 'BBANDS' | 'STOCH',
    options: {
      interval?: string;
      timePeriod?: number;
      seriesType?: 'close' | 'open' | 'high' | 'low';
    } = {}
  ): Promise<Record<string, Record<string, string>>> {
    const { interval = 'daily', timePeriod = 14, seriesType = 'close' } = options;

    const url = this.buildUrl({
      function: indicator,
      symbol,
      interval,
      time_period: timePeriod.toString(),
      series_type: seriesType,
    });

    const response = await this.fetchWithRetry<Record<string, unknown> & { Note?: string }>(
      url
    );

    if (response.Note) {
      throw this.createError('RATE_LIMIT', response.Note, true);
    }

    const dataKey = Object.keys(response).find((k) =>
      k.startsWith('Technical Analysis')
    );

    if (!dataKey) {
      throw this.createError(
        'NOT_FOUND',
        `Technical indicator data not found for ${symbol}`,
        false
      );
    }

    return response[dataKey] as Record<string, Record<string, string>>;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getQuote('IBM');
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const alphaVantage = new AlphaVantageProvider();
