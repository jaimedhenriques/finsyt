export * from './types';
export * from './base';
export { secEdgar, SECEdgarProvider } from './sec-edgar';
export { yahooFinance, YahooFinanceProvider } from './yahoo-finance';
export { fmp, FMPProvider } from './fmp';
export { fred, FREDProvider, FRED_SERIES } from './fred';
export { databento, DatabentoProvider } from './databento';
export { alphaVantage, AlphaVantageProvider } from './alpha-vantage';

import { secEdgar } from './sec-edgar';
import { yahooFinance } from './yahoo-finance';
import { fmp } from './fmp';
import { fred } from './fred';
import { databento } from './databento';
import { alphaVantage } from './alpha-vantage';
import type { StockQuote, CompanyProfile, SECFiling, NewsArticle, HistoricalPrice } from './types';

/**
 * Unified Financial Data Service
 *
 * Provider Priority (per user requirements):
 * 1. FMP (primary) - Ultimate plan
 * 2. Databento (real-time/historical)
 * 3. Alpha Vantage (fallback)
 * 4. Yahoo Finance (fallback)
 */
export class FinancialDataService {
  // Get quote with fallback - FMP is primary
  async getQuote(symbol: string): Promise<StockQuote> {
    try {
      return await fmp.getQuote(symbol);
    } catch {
      try {
        return await alphaVantage.getQuote(symbol);
      } catch {
        return await yahooFinance.getQuote(symbol);
      }
    }
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    try {
      return await fmp.getQuotes(symbols);
    } catch {
      return await yahooFinance.getQuotes(symbols);
    }
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    try {
      // FMP is primary for company profiles
      return await fmp.getCompanyProfile(symbol);
    } catch {
      try {
        return await alphaVantage.getCompanyProfile(symbol);
      } catch {
        return await yahooFinance.getCompanyProfile(symbol);
      }
    }
  }

  async getHistoricalPrices(
    symbol: string,
    options?: { from?: Date; to?: Date }
  ): Promise<HistoricalPrice[]> {
    try {
      // FMP is primary for historical data
      return await fmp.getHistoricalPrices(symbol, options);
    } catch {
      try {
        // Databento for detailed historical data
        if (options?.from && options?.to) {
          return await databento.getHistoricalBars(symbol, {
            start: options.from,
            end: options.to,
          });
        }
        throw new Error('Databento requires date range');
      } catch {
        return await alphaVantage.getHistoricalPrices(symbol);
      }
    }
  }

  async getIntradayPrices(
    symbol: string,
    interval: '1min' | '5min' | '15min' | '30min' | '60min' = '5min'
  ): Promise<HistoricalPrice[]> {
    try {
      // Databento for real-time intraday
      return await databento.getIntradayBars(symbol, new Date(), interval.replace('min', 'm') as '1m' | '5m' | '15m');
    } catch {
      return await alphaVantage.getIntradayPrices(symbol, interval);
    }
  }

  async getSECFilings(
    cikOrTicker: string,
    options?: { formTypes?: string[]; limit?: number }
  ): Promise<SECFiling[]> {
    return secEdgar.getCompanyFilings(
      cikOrTicker,
      options?.formTypes,
      options?.limit
    );
  }

  async getNews(symbols: string[], limit: number = 20): Promise<NewsArticle[]> {
    return fmp.getStockNews(symbols, limit);
  }

  async searchSymbols(query: string) {
    try {
      return await fmp.searchSymbol(query);
    } catch {
      try {
        return await alphaVantage.searchSymbols(query);
      } catch {
        return await yahooFinance.searchSymbols(query);
      }
    }
  }

  async getEarnings(symbol: string) {
    // Alpha Vantage has per-symbol earnings, FMP has calendar-based
    return await alphaVantage.getEarnings(symbol);
  }

  // Provider health check
  async healthCheck(): Promise<Record<string, boolean>> {
    const [fmpHealth, databentoHealth, alphaVantageHealth] = await Promise.all([
      fmp.healthCheck().catch(() => false),
      databento.healthCheck().catch(() => false),
      alphaVantage.healthCheck().catch(() => false),
    ]);

    return {
      fmp: fmpHealth,
      databento: databentoHealth,
      alphaVantage: alphaVantageHealth,
    };
  }
}

export const financialData = new FinancialDataService();
