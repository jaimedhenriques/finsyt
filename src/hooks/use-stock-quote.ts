import { useQuery } from '@tanstack/react-query';
import { StockQuote, CompanyInfo, FinancialMetrics } from '@/types';

interface UseStockQuoteOptions {
  symbol: string;
  includeCompany?: boolean;
  includeMetrics?: boolean;
  enabled?: boolean;
}

interface StockQuoteResponse {
  quote: StockQuote;
  company?: CompanyInfo;
  metrics?: FinancialMetrics;
}

export function useStockQuote({
  symbol,
  includeCompany = false,
  includeMetrics = false,
  enabled = true,
}: UseStockQuoteOptions) {
  return useQuery<StockQuoteResponse>({
    queryKey: ['stock-quote', symbol, includeCompany, includeMetrics],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol });
      if (includeCompany) params.set('company', 'true');
      if (includeMetrics) params.set('metrics', 'true');

      const response = await fetch(`/api/quote?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch quote');
      }
      return response.json();
    },
    enabled: enabled && !!symbol,
    staleTime: 30000, // 30 seconds
  });
}

export function useMarketNews(symbol?: string, limit: number = 10) {
  return useQuery({
    queryKey: ['market-news', symbol, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (symbol) params.set('symbol', symbol);

      const response = await fetch(`/api/news?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch news');
      }
      return response.json();
    },
    staleTime: 60000, // 1 minute
  });
}
