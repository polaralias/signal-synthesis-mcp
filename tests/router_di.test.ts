import { jest } from '@jest/globals';

// Mock ioredis before importing anything that uses it
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    setex: jest.fn(),
  }));
});

import { Router } from '../src/routing/router';
import { MarketDataProvider } from '../src/interfaces/market-data';

describe('Router Dependency Injection', () => {
  it('should use the provided cache factory when ENABLE_CACHING is true', () => {
    const mockCacheProvider = {
      getQuotes: jest.fn(),
      getBars: jest.fn(),
      getMovers: jest.fn(),
    } as unknown as MarketDataProvider;

    const cacheFactory = jest.fn((provider: MarketDataProvider, ttl: number) => {
      return mockCacheProvider;
    });

    const config = {
      ENABLE_CACHING: true,
      CACHE_TTL: 12345
    };

    const router = new Router(config, cacheFactory);

    // Trigger provider selection (e.g. getQuotesProvider)
    const provider = router.getQuotesProvider();

    // Verify factory was called
    expect(cacheFactory).toHaveBeenCalled();
    // Verify it was called with the correct TTL (Router passes directly)
    expect(cacheFactory).toHaveBeenCalledWith(expect.anything(), 12345);

    // Verify the returned provider is our mock
    expect(provider).toBe(mockCacheProvider);
  });

  it('should fallback to default caching if no factory provided', () => {
    const config = {
      ENABLE_CACHING: true,
    };

    // We need to import CachingMarketDataProvider to check instance,
    // or just check name/properties if possible.
    // But since we didn't mock CachingMarketDataProvider, it should be the real class.

    const router = new Router(config);
    const provider = router.getQuotesProvider();

    // It should be an instance of CachingMarketDataProvider
    expect(provider.constructor.name).toBe('CachingMarketDataProvider');
  });
});
