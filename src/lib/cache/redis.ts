import Redis from 'ioredis';

// Singleton Redis client
let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    console.warn('REDIS_URL not configured, caching disabled');
    return null;
  }

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    return redisClient;
  } catch (error) {
    console.error('Failed to create Redis client:', error);
    return null;
  }
}

// Cache TTL presets (in seconds)
export const CacheTTL = {
  QUOTE: 30,           // Stock quotes: 30 seconds
  PROFILE: 3600,       // Company profiles: 1 hour
  FILINGS: 300,        // SEC filings: 5 minutes
  HISTORICAL: 3600,    // Historical data: 1 hour
  NEWS: 300,           // News: 5 minutes
  SECTORS: 60,         // Sector performance: 1 minute
  MOVERS: 60,          // Market movers: 1 minute
  ECONOMIC: 3600,      // Economic data: 1 hour
};

export interface CacheOptions {
  ttl?: number;
  prefix?: string;
}

class Cache {
  private prefix = 'finsyt:';

  private buildKey(key: string, customPrefix?: string): string {
    return `${this.prefix}${customPrefix || ''}${key}`;
  }

  async get<T>(key: string, options?: CacheOptions): Promise<T | null> {
    const client = getRedisClient();
    if (!client) return null;

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const data = await client.get(fullKey);
      if (!data) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.error('Cache get error:', error);
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      const ttl = options?.ttl || CacheTTL.QUOTE;
      await client.setex(fullKey, ttl, JSON.stringify(value));
    } catch (error) {
      console.error('Cache set error:', error);
    }
  }

  async delete(key: string, options?: CacheOptions): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    try {
      const fullKey = this.buildKey(key, options?.prefix);
      await client.del(fullKey);
    } catch (error) {
      console.error('Cache delete error:', error);
    }
  }

  async deletePattern(pattern: string): Promise<void> {
    const client = getRedisClient();
    if (!client) return;

    try {
      const keys = await client.keys(this.buildKey(pattern));
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (error) {
      console.error('Cache deletePattern error:', error);
    }
  }

  // Wrapper to get or fetch data
  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try cache first
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetcher();

    // Store in cache
    await this.set(key, data, options);

    return data;
  }
}

export const cache = new Cache();

// Helper function for creating cache keys
export function cacheKey(...parts: (string | number)[]): string {
  return parts.map(String).join(':');
}
