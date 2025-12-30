import Redis from 'ioredis';
import { MarketDataProvider } from '../interfaces/market-data';
import { Quote, Bar, MarketSnapshot } from '../models/data';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Global Redis client (connection managed by ioredis)
// We add lazyConnect and error handling to prevent crashing if Redis is not immediately available (e.g., in CI or simple local dev without docker)
export const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  retryStrategy: (times) => {
    // Retry with exponential backoff, max 2 seconds
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  maxRetriesPerRequest: 1 // Don't block requests indefinitely if Redis is down
});

redis.on('error', (err) => {
  // Suppress connection errors to stdout to avoid cluttering logs in environments without Redis
  // But still log them if needed for debugging
  // console.error('Redis Client Error', err);
});

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class RedisCachingMarketDataProvider implements MarketDataProvider {
  private wrapped: MarketDataProvider;
  private ttl: number;
  private sessionId: string;
  private configVersion: string;

  constructor(
    wrapped: MarketDataProvider,
    sessionId: string,
    configVersion: string = '1',
    ttlMs: number = 60000
  ) {
    this.wrapped = wrapped;
    this.sessionId = sessionId;
    this.configVersion = configVersion;
    this.ttl = Math.floor(ttlMs / 1000); // Redis uses seconds
  }

  private getKey(tool: string, hash: string): string {
    return `cache:${this.sessionId}:${this.configVersion}:${tool}:${hash}`;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const symbolsKey = [...symbols].sort().join(',');
    const key = this.getKey('quotes', symbolsKey);

    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.wrapped.getQuotes(symbols);
    await redis.setex(key, this.ttl, JSON.stringify(data));
    return data;
  }

  async getBars(
    symbols: string[],
    timeframe: string,
    limit?: number,
    start?: Date,
    end?: Date
  ): Promise<Record<string, Bar[]>> {
    const keyParts = [
      [...symbols].sort().join(','),
      timeframe,
      limit?.toString() || 'default',
      start?.toISOString() || 'none',
      end?.toISOString() || 'none'
    ];
    const key = this.getKey('bars', keyParts.join('|'));

    const cached = await redis.get(key);
    if (cached) {
      // Need to revive dates in JSON
      const parsed = JSON.parse(cached);
      // TODO: If precise Date objects are needed, revive them.
      // For now, assume downstream handles string dates or we implement a reviver.
      return parsed;
    }

    const data = await this.wrapped.getBars(symbols, timeframe, limit, start, end);
    await redis.setex(key, this.ttl, JSON.stringify(data));
    return data;
  }

  async getMovers(limit?: number): Promise<MarketSnapshot[]> {
    const key = this.getKey('movers', limit?.toString() || 'default');

    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }

    const data = await this.wrapped.getMovers(limit);
    await redis.setex(key, this.ttl, JSON.stringify(data));
    return data;
  }
}
