import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ioredis
vi.mock('ioredis', () => {
  const mockRedis = {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
    keys: vi.fn(),
    on: vi.fn(),
  };
  return { default: vi.fn(() => mockRedis) };
});

describe('Cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset module cache
    vi.resetModules();
  });

  describe('getOrFetch', () => {
    it('should return cached value if available', async () => {
      // Set REDIS_URL for this test
      process.env.REDIS_URL = 'redis://localhost:6379';

      const Redis = (await import('ioredis')).default;
      const mockInstance = new Redis();
      (mockInstance.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        JSON.stringify({ test: 'cached' })
      );

      const { cache } = await import('../../lib/cache/redis');

      const result = await cache.getOrFetch(
        'test-key',
        async () => ({ test: 'fresh' }),
        { ttl: 60 }
      );

      expect(result).toEqual({ test: 'cached' });
    });

    it('should fetch and cache if not available', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379';

      const Redis = (await import('ioredis')).default;
      const mockInstance = new Redis();
      (mockInstance.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

      const { cache } = await import('../../lib/cache/redis');

      const fetcher = vi.fn().mockResolvedValue({ test: 'fresh' });
      const result = await cache.getOrFetch('test-key', fetcher, { ttl: 60 });

      expect(result).toEqual({ test: 'fresh' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });

  describe('without Redis configured', () => {
    it('should fallback gracefully', async () => {
      // Remove REDIS_URL
      delete process.env.REDIS_URL;

      // Reset modules to clear singleton
      vi.resetModules();

      const { cache } = await import('../../lib/cache/redis');

      const fetcher = vi.fn().mockResolvedValue({ test: 'data' });
      const result = await cache.getOrFetch('test-key', fetcher);

      expect(result).toEqual({ test: 'data' });
      expect(fetcher).toHaveBeenCalledTimes(1);
    });
  });
});
