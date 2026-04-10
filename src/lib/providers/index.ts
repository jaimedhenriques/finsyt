export * from './types';
export * from './base';
export { secEdgar, SECEdgarProvider } from './sec-edgar';
export { yahooFinance, YahooFinanceProvider } from './yahoo-finance';
export { fmp, FMPProvider } from './fmp';
export { fred, FREDProvider, FRED_SERIES } from './fred';

import { secEdgar } from './sec-edgar';
import { yahooFinance } from './yahoo-finance';
import { fmp } from './fmp';
import { fred } from './fred';
import type { StockQuote, CompanyProfile, SECFiling, NewsArticle } from './types';

// Unified provider interface for fallback support
export class FinancialDataService {
  // Get quote with fallback between providers
  async getQuote(symbol: string): Promise<StockQuote> {
    try {
      return await yahooFinance.getQuote(symbol);
    } catch {
      // Fallback to FMP
      return await fmp.getQuote(symbol);
    }
  }

  async getQuotes(symbols: string[]): Promise<StockQuote[]> {
    try {
      return await yahooFinance.getQuotes(symbols);
    } catch {
      return await fmp.getQuotes(symbols);
    }
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    try {
      const [yahooProfile, fmpProfile] = await Promise.allSettled([
        yahooFinance.getCompanyProfile(symbol),
        fmp.getCompanyProfile(symbol),
      ]);

      // Merge data from both sources
      const yahoo =
        yahooProfile.status === 'fulfilled' ? yahooProfile.value : null;
      const fmpData = fmpProfile.status === 'fulfilled' ? fmpProfile.value : null;

      if (!yahoo && !fmpData) {
        throw new Error(`Profile not found: ${symbol}`);
      }

      return {
        ...(fmpData || {}),
        ...(yahoo || {}),
        symbol,
      } as CompanyProfile;
    } catch {
      // Single provider fallback
      return fmp.getCompanyProfile(symbol);
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
    return yahooFinance.searchSymbols(query);
  }
}

export const financialData = new FinancialDataService();
