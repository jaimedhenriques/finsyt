import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

describe('FMP Provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockReset();
  });

  describe('getQuote', () => {
    it('should parse quote response correctly', async () => {
      const mockResponse = [
        {
          symbol: 'AAPL',
          name: 'Apple Inc.',
          price: 185.5,
          changesPercentage: 1.25,
          change: 2.3,
          dayLow: 183.0,
          dayHigh: 186.0,
          yearHigh: 199.62,
          yearLow: 164.08,
          marketCap: 2850000000000,
          priceAvg50: 180.0,
          priceAvg200: 175.0,
          volume: 50000000,
          avgVolume: 45000000,
          exchange: 'NASDAQ',
          open: 184.0,
          previousClose: 183.2,
          eps: 6.42,
          pe: 28.9,
          timestamp: 1699920000,
        },
      ];

      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Import dynamically to use mocked fetch
      const { FMPProvider } = await import('../../lib/providers/fmp');
      const provider = new FMPProvider({ apiKey: 'test-key' });

      const quote = await provider.getQuote('AAPL');

      expect(quote).toMatchObject({
        symbol: 'AAPL',
        name: 'Apple Inc.',
        price: 185.5,
        changePercent: 1.25,
        change: 2.3,
      });
    });

    it('should throw error for not found symbol', async () => {
      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      const { FMPProvider } = await import('../../lib/providers/fmp');
      const provider = new FMPProvider({ apiKey: 'test-key' });

      await expect(provider.getQuote('INVALID')).rejects.toThrow();
    });
  });

  describe('getMarketMovers', () => {
    it('should fetch gainers correctly', async () => {
      const mockGainers = [
        {
          symbol: 'TEST',
          name: 'Test Stock',
          price: 100,
          changesPercentage: 5.5,
          change: 5,
          volume: 1000000,
          marketCap: 1000000000,
          dayHigh: 102,
          dayLow: 95,
          open: 96,
          previousClose: 95,
          timestamp: 1699920000,
        },
      ];

      (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGainers),
      });

      const { FMPProvider } = await import('../../lib/providers/fmp');
      const provider = new FMPProvider({ apiKey: 'test-key' });

      const gainers = await provider.getMarketMovers('gainers');

      expect(gainers).toHaveLength(1);
      expect(gainers[0]).toMatchObject({
        symbol: 'TEST',
        changePercent: 5.5,
      });
    });
  });
});
