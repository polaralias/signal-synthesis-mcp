import { MarketDataProvider } from '../interfaces/market-data';
import { Quote, Bar, MarketSnapshot } from '../models/data';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

export class CachingMarketDataProvider implements MarketDataProvider {
  private wrapped: MarketDataProvider;
  private ttl: number;
  private quotesCache: Map<string, CacheEntry<Quote[]>> = new Map();
  private barsCache: Map<string, CacheEntry<Record<string, Bar[]>>> = new Map();
  private moversCache: CacheEntry<MarketSnapshot[]> | null = null;

  constructor(wrapped: MarketDataProvider, ttlMs: number = 60000) {
    this.wrapped = wrapped;
    this.ttl = ttlMs;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const key = [...symbols].sort().join(',');
    const cached = this.quotesCache.get(key);

    if (cached && (Date.now() - cached.timestamp < this.ttl)) {
      return cached.data;
    }

    const data = await this.wrapped.getQuotes(symbols);
    this.quotesCache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  async getBars(
    symbols: string[],
    timeframe: string,
    limit?: number,
    start?: Date,
    end?: Date
  ): Promise<Record<string, Bar[]>> {
    // Create a cache key based on all parameters
    const keyParts = [
      [...symbols].sort().join(','),
      timeframe,
      limit?.toString() || 'default',
      start?.toISOString() || 'none',
      end?.toISOString() || 'none'
    ];
    const key = keyParts.join('|');

    const cached = this.barsCache.get(key);
    if (cached && (Date.now() - cached.timestamp < this.ttl)) {
      return cached.data;
    }

    const data = await this.wrapped.getBars(symbols, timeframe, limit, start, end);
    this.barsCache.set(key, { data, timestamp: Date.now() });
    return data;
  }

  async getMovers(limit?: number): Promise<MarketSnapshot[]> {
    if (this.moversCache && (Date.now() - this.moversCache.timestamp < this.ttl)) {
        return this.moversCache.data;
    }

    const data = await this.wrapped.getMovers(limit);
    this.moversCache = { data, timestamp: Date.now() };
    return data;
  }
}
