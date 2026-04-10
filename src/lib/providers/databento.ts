import { BaseProvider } from './base';
import type { StockQuote, HistoricalPrice, ProviderConfig } from './types';

interface DatabentoBar {
  ts_event: number;
  rtype: number;
  publisher_id: number;
  instrument_id: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface DatabentoQuote {
  ts_event: number;
  bid_px_00: number;
  ask_px_00: number;
  bid_sz_00: number;
  ask_sz_00: number;
  bid_ct_00: number;
  ask_ct_00: number;
}

interface DatabentoTrade {
  ts_event: number;
  price: number;
  size: number;
  side: string;
}

/**
 * Databento Provider
 *
 * Real-time and historical market data provider.
 * Supports multiple data feeds: OHLCV bars, quotes, trades.
 *
 * API Docs: https://databento.com/docs
 */
export class DatabentoProvider extends BaseProvider {
  private apiKey: string;
  private baseUrl = 'https://hist.databento.com/v0';
  private liveUrl = 'wss://live.databento.com/v0/live';

  constructor(config: ProviderConfig = {}) {
    super('Databento', config);
    this.apiKey = process.env.DATABENTO_API_KEY || '';
  }

  private get headers(): Record<string, string> {
    return {
      'Authorization': `Basic ${Buffer.from(this.apiKey + ':').toString('base64')}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Get historical OHLCV bars
   */
  async getHistoricalBars(
    symbol: string,
    options: {
      start: Date;
      end: Date;
      timeframe?: '1m' | '5m' | '15m' | '1h' | '1d';
      dataset?: string;
    }
  ): Promise<HistoricalPrice[]> {
    const { start, end, timeframe = '1d', dataset = 'XNAS.ITCH' } = options;

    const schemaMap = {
      '1m': 'ohlcv-1m',
      '5m': 'ohlcv-5m',
      '15m': 'ohlcv-15m',
      '1h': 'ohlcv-1h',
      '1d': 'ohlcv-1d',
    };

    const url = `${this.baseUrl}/timeseries.get_range`;

    const response = await this.fetchWithRetry<{ data: DatabentoBar[] }>(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        dataset,
        symbols: [symbol],
        schema: schemaMap[timeframe],
        start: start.toISOString(),
        end: end.toISOString(),
        encoding: 'json',
      }),
    });

    return response.data.map((bar) => ({
      date: new Date(bar.ts_event / 1000000),
      open: bar.open / 1e9,
      high: bar.high / 1e9,
      low: bar.low / 1e9,
      close: bar.close / 1e9,
      volume: bar.volume,
      adjustedClose: bar.close / 1e9,
    }));
  }

  /**
   * Get latest quote for a symbol
   */
  async getQuote(symbol: string, dataset: string = 'XNAS.ITCH'): Promise<StockQuote> {
    const end = new Date();
    const start = new Date(end.getTime() - 5 * 60 * 1000); // Last 5 minutes

    const url = `${this.baseUrl}/timeseries.get_range`;

    const response = await this.fetchWithRetry<{ data: DatabentoTrade[] }>(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        dataset,
        symbols: [symbol],
        schema: 'trades',
        start: start.toISOString(),
        end: end.toISOString(),
        encoding: 'json',
        limit: 1,
      }),
    });

    const trade = response.data[0];
    if (!trade) {
      throw this.createError('NOT_FOUND', `No trade data for ${symbol}`, false);
    }

    const price = trade.price / 1e9;

    return {
      symbol,
      name: symbol, // Will be enriched by profile lookup
      price,
      change: 0, // Would need previous close to calculate
      changePercent: 0,
      volume: trade.size,
      previousClose: price,
      open: price,
      high: price,
      low: price,
      marketCap: 0,
      timestamp: new Date(trade.ts_event / 1000000),
    };
  }

  /**
   * Get available datasets
   */
  async getDatasets(): Promise<string[]> {
    const url = `${this.baseUrl}/metadata.list_datasets`;

    const response = await this.fetchWithRetry<{ result: string[] }>(url, {
      method: 'GET',
      headers: this.headers,
    });

    return response.result;
  }

  /**
   * Get available symbols in a dataset
   */
  async getSymbols(
    dataset: string,
    options?: { start?: Date; end?: Date }
  ): Promise<string[]> {
    const url = `${this.baseUrl}/metadata.list_symbols`;
    const start = options?.start || new Date(Date.now() - 24 * 60 * 60 * 1000);
    const end = options?.end || new Date();

    const response = await this.fetchWithRetry<{ result: string[] }>(url, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        dataset,
        start_date: this.formatDate(start),
        end_date: this.formatDate(end),
      }),
    });

    return response.result;
  }

  /**
   * Get intraday bars for a symbol
   */
  async getIntradayBars(
    symbol: string,
    date: Date,
    timeframe: '1m' | '5m' | '15m' = '1m',
    dataset: string = 'XNAS.ITCH'
  ): Promise<HistoricalPrice[]> {
    const start = new Date(date);
    start.setHours(9, 30, 0, 0); // Market open

    const end = new Date(date);
    end.setHours(16, 0, 0, 0); // Market close

    return this.getHistoricalBars(symbol, {
      start,
      end,
      timeframe,
      dataset,
    });
  }

  /**
   * Check API health and quota
   */
  async getUsage(): Promise<{
    requests_used: number;
    requests_limit: number;
    data_used_gb: number;
    data_limit_gb: number;
  }> {
    const url = `${this.baseUrl}/metadata.get_usage`;

    const response = await this.fetchWithRetry<{
      result: {
        requests_used: number;
        requests_limit: number;
        data_used_gb: number;
        data_limit_gb: number;
      };
    }>(url, {
      method: 'GET',
      headers: this.headers,
    });

    return response.result;
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.getDatasets();
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton instance
export const databento = new DatabentoProvider();
