import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { CachingMarketDataProvider } from '../src/providers/caching.js';
import { MockProvider } from '../src/providers/mock.js';
import { MarketDataProvider } from '../src/interfaces/market-data.js';

describe('CachingMarketDataProvider', () => {
    let mockProvider: MockProvider;
    let cachingProvider: CachingMarketDataProvider;

    beforeEach(() => {
        mockProvider = new MockProvider();
        cachingProvider = new CachingMarketDataProvider(mockProvider, 100); // 100ms TTL
    });

    test('getQuotes should cache results', async () => {
        const spy = jest.spyOn(mockProvider, 'getQuotes');

        // First call
        const result1 = await cachingProvider.getQuotes(['AAPL']);
        expect(result1.length).toBe(1);
        expect(spy).toHaveBeenCalledTimes(1);

        // Second call (within TTL)
        const result2 = await cachingProvider.getQuotes(['AAPL']);
        expect(result2).toBe(result1); // Should be exact same object reference if cached
        expect(spy).toHaveBeenCalledTimes(1); // Provider should not be called again

        // Wait for TTL
        await new Promise(resolve => setTimeout(resolve, 150));

        // Third call (expired)
        const result3 = await cachingProvider.getQuotes(['AAPL']);
        expect(result3.length).toBe(1);
        expect(spy).toHaveBeenCalledTimes(2); // Provider called again
    });

    test('getBars should cache results with same parameters', async () => {
        const spy = jest.spyOn(mockProvider, 'getBars');

        const params = {
            symbols: ['AAPL'],
            timeframe: '1d'
        };

        const result1 = await cachingProvider.getBars(params.symbols, params.timeframe);
        expect(result1['AAPL']).toBeDefined();
        expect(spy).toHaveBeenCalledTimes(1);

        const result2 = await cachingProvider.getBars(params.symbols, params.timeframe);
        expect(spy).toHaveBeenCalledTimes(1); // Cached

        // Different params
        await cachingProvider.getBars(['MSFT'], '1d');
        expect(spy).toHaveBeenCalledTimes(2); // Not cached
    });

    test('getMovers should cache results', async () => {
        const spy = jest.spyOn(mockProvider, 'getMovers');

        await cachingProvider.getMovers();
        expect(spy).toHaveBeenCalledTimes(1);

        await cachingProvider.getMovers();
        expect(spy).toHaveBeenCalledTimes(1); // Cached
    });
});
