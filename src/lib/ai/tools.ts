// AI Tool definitions for financial research

import { z } from 'zod';
import { financialData, secEdgar, yahooFinance, fmp, fred, FRED_SERIES } from '@/lib/providers';

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  citations?: Array<{
    type: string;
    title: string;
    url?: string;
    content?: string;
  }>;
}

// Tool schemas for validation
export const toolSchemas = {
  getStockQuote: z.object({
    symbol: z.string().describe('Stock ticker symbol (e.g., AAPL, MSFT)'),
  }),

  getMultipleQuotes: z.object({
    symbols: z.array(z.string()).describe('Array of stock ticker symbols'),
  }),

  getCompanyProfile: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
  }),

  getHistoricalPrices: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
    timeframe: z
      .enum(['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'])
      .default('1Y')
      .describe('Time period for historical data'),
  }),

  getSECFilings: z.object({
    cikOrTicker: z.string().describe('Company CIK number or ticker symbol'),
    formTypes: z
      .array(z.string())
      .optional()
      .describe('Filter by form types (e.g., 10-K, 10-Q, 8-K)'),
    limit: z.number().default(10).describe('Number of filings to return'),
  }),

  searchFilings: z.object({
    query: z.string().describe('Search query for SEC filings'),
    formTypes: z.array(z.string()).optional(),
    limit: z.number().default(10),
  }),

  getFinancials: z.object({
    symbol: z.string().describe('Stock ticker symbol'),
    type: z
      .enum(['income', 'balance', 'cashflow'])
      .describe('Type of financial statement'),
    period: z.enum(['annual', 'quarter']).default('annual'),
    limit: z.number().default(5),
  }),

  getEconomicIndicator: z.object({
    indicator: z
      .string()
      .describe('FRED series ID (e.g., GDP, UNRATE, FEDFUNDS)'),
    limit: z.number().default(12).describe('Number of observations'),
  }),

  getEconomicDashboard: z.object({}),

  getMarketMovers: z.object({
    type: z.enum(['gainers', 'losers', 'actives']).describe('Type of market movers'),
  }),

  getNews: z.object({
    symbols: z.array(z.string()).describe('Stock symbols to get news for'),
    limit: z.number().default(10),
  }),

  searchSymbols: z.object({
    query: z.string().describe('Search query for stock symbols'),
    limit: z.number().default(10),
  }),

  compareCompanies: z.object({
    symbols: z.array(z.string()).min(2).max(5).describe('Stock symbols to compare'),
  }),
};

// Tool execution functions
export const toolExecutors: Record<
  string,
  (params: Record<string, unknown>) => Promise<ToolResult>
> = {
  async getStockQuote({ symbol }: { symbol: string }): Promise<ToolResult> {
    try {
      const quote = await financialData.getQuote(symbol);
      return {
        success: true,
        data: quote,
        citations: [
          {
            type: 'FINANCIAL_DATA',
            title: `${symbol} Stock Quote`,
            content: `Real-time quote data for ${symbol}`,
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get quote for ${symbol}: ${(error as Error).message}`,
      };
    }
  },

  async getMultipleQuotes({
    symbols,
  }: {
    symbols: string[];
  }): Promise<ToolResult> {
    try {
      const quotes = await financialData.getQuotes(symbols);
      return {
        success: true,
        data: quotes,
        citations: symbols.map((s) => ({
          type: 'FINANCIAL_DATA',
          title: `${s} Stock Quote`,
          content: `Real-time quote data`,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get quotes: ${(error as Error).message}`,
      };
    }
  },

  async getCompanyProfile({ symbol }: { symbol: string }): Promise<ToolResult> {
    try {
      const profile = await financialData.getCompanyProfile(symbol);
      return {
        success: true,
        data: profile,
        citations: [
          {
            type: 'FINANCIAL_DATA',
            title: `${symbol} Company Profile`,
            content: `Company information for ${profile.name}`,
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get profile: ${(error as Error).message}`,
      };
    }
  },

  async getHistoricalPrices({
    symbol,
    timeframe,
  }: {
    symbol: string;
    timeframe: '1D' | '1W' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX';
  }): Promise<ToolResult> {
    try {
      const prices = await yahooFinance.getHistoricalPrices(symbol, timeframe);
      return {
        success: true,
        data: prices,
        citations: [
          {
            type: 'FINANCIAL_DATA',
            title: `${symbol} Historical Prices (${timeframe})`,
            content: `Historical price data`,
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get historical prices: ${(error as Error).message}`,
      };
    }
  },

  async getSECFilings({
    cikOrTicker,
    formTypes,
    limit,
  }: {
    cikOrTicker: string;
    formTypes?: string[];
    limit: number;
  }): Promise<ToolResult> {
    try {
      const filings = await secEdgar.getCompanyFilings(
        cikOrTicker,
        formTypes,
        limit
      );
      return {
        success: true,
        data: filings,
        citations: filings.map((f) => ({
          type: 'SEC_FILING',
          title: `${f.formType} - ${f.companyName || cikOrTicker}`,
          url: f.documentUrl,
          content: f.description,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get SEC filings: ${(error as Error).message}`,
      };
    }
  },

  async searchFilings({
    query,
    formTypes,
    limit,
  }: {
    query: string;
    formTypes?: string[];
    limit: number;
  }): Promise<ToolResult> {
    try {
      const filings = await secEdgar.searchFilings(query, { formTypes, limit });
      return {
        success: true,
        data: filings,
        citations: filings.map((f) => ({
          type: 'SEC_FILING',
          title: `${f.formType} - ${f.companyName}`,
          url: f.documentUrl,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search filings: ${(error as Error).message}`,
      };
    }
  },

  async getFinancials({
    symbol,
    type,
    period,
    limit,
  }: {
    symbol: string;
    type: 'income' | 'balance' | 'cashflow';
    period: 'annual' | 'quarter';
    limit: number;
  }): Promise<ToolResult> {
    try {
      let data;
      switch (type) {
        case 'income':
          data = await fmp.getIncomeStatements(symbol, period, limit);
          break;
        case 'balance':
          data = await fmp.getBalanceSheets(symbol, period, limit);
          break;
        case 'cashflow':
          data = await fmp.getCashFlowStatements(symbol, period, limit);
          break;
      }

      return {
        success: true,
        data,
        citations: [
          {
            type: 'FINANCIAL_DATA',
            title: `${symbol} ${type.charAt(0).toUpperCase() + type.slice(1)} Statement`,
            content: `${period === 'annual' ? 'Annual' : 'Quarterly'} financial data`,
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get financials: ${(error as Error).message}`,
      };
    }
  },

  async getEconomicIndicator({
    indicator,
    limit,
  }: {
    indicator: string;
    limit: number;
  }): Promise<ToolResult> {
    try {
      const data = await fred.getSeriesObservations(indicator, { limit });
      return {
        success: true,
        data,
        citations: [
          {
            type: 'FINANCIAL_DATA',
            title: data[0]?.name || indicator,
            url: `https://fred.stlouisfed.org/series/${indicator}`,
            content: `Federal Reserve Economic Data`,
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get indicator: ${(error as Error).message}`,
      };
    }
  },

  async getEconomicDashboard(): Promise<ToolResult> {
    try {
      const data = await fred.getEconomicDashboard();
      return {
        success: true,
        data,
        citations: [
          {
            type: 'FINANCIAL_DATA',
            title: 'Economic Dashboard',
            url: 'https://fred.stlouisfed.org',
            content: 'Key economic indicators from FRED',
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get dashboard: ${(error as Error).message}`,
      };
    }
  },

  async getMarketMovers({
    type,
  }: {
    type: 'gainers' | 'losers' | 'actives';
  }): Promise<ToolResult> {
    try {
      const data = await fmp.getMarketMovers(type);
      return {
        success: true,
        data,
        citations: [
          {
            type: 'FINANCIAL_DATA',
            title: `Market ${type.charAt(0).toUpperCase() + type.slice(1)}`,
            content: `Today's top ${type}`,
          },
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get market movers: ${(error as Error).message}`,
      };
    }
  },

  async getNews({
    symbols,
    limit,
  }: {
    symbols: string[];
    limit: number;
  }): Promise<ToolResult> {
    try {
      const news = await fmp.getStockNews(symbols, limit);
      return {
        success: true,
        data: news,
        citations: news.map((n) => ({
          type: 'NEWS_ARTICLE',
          title: n.title,
          url: n.url,
          content: n.summary,
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to get news: ${(error as Error).message}`,
      };
    }
  },

  async searchSymbols({
    query,
    limit,
  }: {
    query: string;
    limit: number;
  }): Promise<ToolResult> {
    try {
      const results = await yahooFinance.searchSymbols(query, limit);
      return { success: true, data: results };
    } catch (error) {
      return {
        success: false,
        error: `Search failed: ${(error as Error).message}`,
      };
    }
  },

  async compareCompanies({
    symbols,
  }: {
    symbols: string[];
  }): Promise<ToolResult> {
    try {
      const [quotes, profiles] = await Promise.all([
        financialData.getQuotes(symbols),
        Promise.all(symbols.map((s) => financialData.getCompanyProfile(s))),
      ]);

      const comparison = symbols.map((symbol, i) => ({
        symbol,
        quote: quotes[i],
        profile: profiles[i],
      }));

      return {
        success: true,
        data: comparison,
        citations: symbols.map((s) => ({
          type: 'FINANCIAL_DATA',
          title: `${s} Company Data`,
          content: 'Company comparison data',
        })),
      };
    } catch (error) {
      return {
        success: false,
        error: `Comparison failed: ${(error as Error).message}`,
      };
    }
  },
};

// Tool definitions for Claude API
export const claudeTools = [
  {
    name: 'getStockQuote',
    description:
      'Get real-time stock quote including price, change, volume, and market cap for a given ticker symbol.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol (e.g., AAPL, MSFT, GOOGL)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'getMultipleQuotes',
    description: 'Get real-time quotes for multiple stock symbols at once.',
    input_schema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of stock ticker symbols',
        },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'getCompanyProfile',
    description:
      'Get detailed company profile including description, sector, industry, CEO, employees, and key metrics.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Stock ticker symbol',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'getHistoricalPrices',
    description:
      'Get historical price data for a stock over a specified time period.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol' },
        timeframe: {
          type: 'string',
          enum: ['1D', '1W', '1M', '3M', '6M', '1Y', '5Y', 'MAX'],
          description: 'Time period for historical data',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'getSECFilings',
    description:
      'Get SEC filings for a company including 10-K, 10-Q, 8-K, and other forms.',
    input_schema: {
      type: 'object',
      properties: {
        cikOrTicker: {
          type: 'string',
          description: 'Company CIK number or ticker symbol',
        },
        formTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by form types (e.g., 10-K, 10-Q, 8-K)',
        },
        limit: {
          type: 'number',
          description: 'Number of filings to return (default: 10)',
        },
      },
      required: ['cikOrTicker'],
    },
  },
  {
    name: 'searchFilings',
    description:
      'Search SEC filings by keyword across all companies. Useful for finding specific topics in filings.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        formTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by form types',
        },
        limit: { type: 'number', description: 'Number of results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getFinancials',
    description:
      'Get financial statements (income statement, balance sheet, or cash flow) for a company.',
    input_schema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Stock ticker symbol' },
        type: {
          type: 'string',
          enum: ['income', 'balance', 'cashflow'],
          description: 'Type of financial statement',
        },
        period: {
          type: 'string',
          enum: ['annual', 'quarter'],
          description: 'Annual or quarterly data',
        },
        limit: { type: 'number', description: 'Number of periods' },
      },
      required: ['symbol', 'type'],
    },
  },
  {
    name: 'getEconomicIndicator',
    description:
      'Get economic indicator data from FRED (Federal Reserve). Common indicators: GDP, UNRATE (unemployment), CPIAUCSL (inflation), FEDFUNDS (fed funds rate), DGS10 (10-year treasury).',
    input_schema: {
      type: 'object',
      properties: {
        indicator: {
          type: 'string',
          description: 'FRED series ID (e.g., GDP, UNRATE, FEDFUNDS, DGS10)',
        },
        limit: {
          type: 'number',
          description: 'Number of observations (default: 12)',
        },
      },
      required: ['indicator'],
    },
  },
  {
    name: 'getEconomicDashboard',
    description:
      'Get a dashboard of key economic indicators including GDP, unemployment, inflation, interest rates, and consumer sentiment.',
    input_schema: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getMarketMovers',
    description:
      "Get today's top market movers - gainers, losers, or most active stocks.",
    input_schema: {
      type: 'object',
      properties: {
        type: {
          type: 'string',
          enum: ['gainers', 'losers', 'actives'],
          description: 'Type of market movers to retrieve',
        },
      },
      required: ['type'],
    },
  },
  {
    name: 'getNews',
    description: 'Get latest news articles for specified stock symbols.',
    input_schema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          description: 'Stock symbols to get news for',
        },
        limit: { type: 'number', description: 'Number of articles' },
      },
      required: ['symbols'],
    },
  },
  {
    name: 'searchSymbols',
    description:
      'Search for stock symbols by company name or partial ticker.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Number of results' },
      },
      required: ['query'],
    },
  },
  {
    name: 'compareCompanies',
    description:
      'Compare multiple companies side by side with quotes and profiles.',
    input_schema: {
      type: 'object',
      properties: {
        symbols: {
          type: 'array',
          items: { type: 'string' },
          minItems: 2,
          maxItems: 5,
          description: 'Stock symbols to compare (2-5 companies)',
        },
      },
      required: ['symbols'],
    },
  },
];
