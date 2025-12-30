import { AlpacaProvider } from '../src/providers/alpaca';
import { PolygonProvider } from '../src/providers/polygon';
import { Router } from '../src/routing/router';
import { config } from '../src/config';
import { CachingMarketDataProvider } from '../src/providers/caching';
import { MockProvider } from '../src/providers/mock';
import { ResilientMarketDataProvider } from '../src/providers/wrapper';
import { FallbackMarketDataProvider } from '../src/providers/fallback';

// Mock global fetch
global.fetch = jest.fn();

// Mock config
jest.mock('../src/config', () => ({
  config: {
    ALPACA_API_KEY: 'test',
    ALPACA_SECRET_KEY: 'test',
    POLYGON_API_KEY: 'test',
    FMP_API_KEY: 'test',
    DEFAULT_DISCOVERY_PROVIDER: 'mock',
    DEFAULT_QUOTES_PROVIDER: 'mock',
    DEFAULT_BARS_PROVIDER: 'mock',
    DEFAULT_CONTEXT_PROVIDER: 'mock',
    ENABLE_CACHING: false,
    CACHE_TTL: 60000
  }
}));

describe('AlpacaProvider', () => {
  let provider: AlpacaProvider;

  beforeEach(() => {
    provider = new AlpacaProvider('key', 'secret');
    (global.fetch as jest.Mock).mockClear();
  });

  it('should fetch quotes', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          quotes: {
            AAPL: { bp: 150, bs: 100, ap: 151, as: 100, t: '2023-01-01T00:00:00Z' }
          }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          trades: {
            AAPL: { p: 150.5, s: 50, t: '2023-01-01T00:00:00Z' }
          }
        })
      });

    const quotes = await provider.getQuotes(['AAPL']);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe('AAPL');
    expect(quotes[0].bidPrice).toBe(150);
    expect(quotes[0].lastPrice).toBe(150.5);
    expect(quotes[0].provider).toBe('alpaca');
  });

  it('should fetch bars', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        bars: {
          AAPL: [
            { t: '2023-01-01T00:00:00Z', o: 100, h: 110, l: 90, c: 105, v: 1000, vw: 102 }
          ]
        }
      })
    });

    const bars = await provider.getBars(['AAPL'], '1d');
    expect(bars['AAPL']).toHaveLength(1);
    expect(bars['AAPL'][0].close).toBe(105);
  });
});

describe('PolygonProvider', () => {
  let provider: PolygonProvider;

  beforeEach(() => {
    provider = new PolygonProvider('key');
    (global.fetch as jest.Mock).mockClear();
  });

  it('should fetch quotes', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'OK',
          results: { bp: 150, bs: 100, ap: 151, as: 100, t: 1672531200000000000 }
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
            status: 'OK',
            results: { p: 150.5, s: 50, t: 1672531200000000000 }
        })
      });

    const quotes = await provider.getQuotes(['AAPL']);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].symbol).toBe('AAPL');
    expect(quotes[0].bidPrice).toBe(150);
    expect(quotes[0].lastPrice).toBe(150.5);
    expect(quotes[0].provider).toBe('polygon');
  });

  it('should fetch bars', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ({
              status: 'OK',
              results: [
                  { t: 1672531200000, o: 100, h: 110, l: 90, c: 105, v: 1000, vw: 102 }
              ]
          })
      });

      const bars = await provider.getBars(['AAPL'], '1d');
      expect(bars['AAPL']).toHaveLength(1);
      expect(bars['AAPL'][0].close).toBe(105);
  });

  it('should fetch movers', async () => {
    // Mock gainers call
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
            status: 'OK',
            tickers: [
                { ticker: 'AAPL', day: { c: 150, v: 1000 }, todaysChangePerc: 5 }
            ]
        })
    });

    // Mock losers call
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
          status: 'OK',
          tickers: [
              { ticker: 'TSLA', day: { c: 200, v: 2000 }, todaysChangePerc: -5 }
          ]
      })
    });

    const movers = await provider.getMovers(20);
    // Should have 1 from gainers and 1 from losers
    expect(movers).toHaveLength(2);
    const symbols = movers.map(m => m.symbol);
    expect(symbols).toContain('AAPL');
    expect(symbols).toContain('TSLA');
    expect(movers[0].source).toBe('polygon');
  });
});

describe('Router', () => {
    beforeEach(() => {
        // Reset config values
        (config as any).ALPACA_API_KEY = 'test';
        (config as any).ALPACA_SECRET_KEY = 'test';
        (config as any).POLYGON_API_KEY = 'test';
        (config as any).DEFAULT_DISCOVERY_PROVIDER = 'mock';
        (config as any).DEFAULT_QUOTES_PROVIDER = 'mock';
        (config as any).DEFAULT_BARS_PROVIDER = 'mock';
        (config as any).ENABLE_CACHING = false;
    });

    it('should select configured providers', async () => {
        (config as any).DEFAULT_QUOTES_PROVIDER = 'alpaca';
        (config as any).DEFAULT_BARS_PROVIDER = 'polygon';
        (config as any).ENABLE_CACHING = false;

        const router = new Router();

        const quotesProvider = router.getQuotesProvider();
        const barsProvider = router.getBarsProvider();

        // Providers are wrapped in FallbackMarketDataProvider by default now
        expect(quotesProvider).toBeInstanceOf(FallbackMarketDataProvider);
        expect(barsProvider).toBeInstanceOf(FallbackMarketDataProvider);

        // Verify that the fallback provider contains the expected resilient provider
        // FallbackMarketDataProvider has a 'providers' array
        // @ts-ignore
        const quoteProviders = quotesProvider['providers'];
        // @ts-ignore
        const barProviders = barsProvider['providers'];

        // Should have at least one resilient provider
        expect(quoteProviders.some((p: any) => p instanceof ResilientMarketDataProvider)).toBe(true);
        expect(barProviders.some((p: any) => p instanceof ResilientMarketDataProvider)).toBe(true);

        // Alpaca is configured, so it should be in the list wrapped in Resilient
        const alpacaResilient = quoteProviders.find((p: any) => p instanceof ResilientMarketDataProvider && p['providerName'] === 'alpaca');
        expect(alpacaResilient).toBeDefined();
        // @ts-ignore
        expect(alpacaResilient['inner']).toBeInstanceOf(AlpacaProvider);

         // Polygon is configured, so it should be in the list wrapped in Resilient
         const polygonResilient = barProviders.find((p: any) => p instanceof ResilientMarketDataProvider && p['providerName'] === 'polygon');
         expect(polygonResilient).toBeDefined();
         // @ts-ignore
         expect(polygonResilient['inner']).toBeInstanceOf(PolygonProvider);
    });

    it('should fallback to mock if provider not configured', async () => {
        (config as any).DEFAULT_QUOTES_PROVIDER = 'alpaca';
        (config as any).ENABLE_CACHING = false;
        delete (config as any).ALPACA_API_KEY; // Simulate missing config

        const router = new Router();

        const quotesProvider = router.getQuotesProvider();

        // Should be a Fallback containing Mock (or just Fallback since Mock is always added as last resort in Router)
        expect(quotesProvider).toBeInstanceOf(FallbackMarketDataProvider);

        // @ts-ignore
        const providers = quotesProvider['providers'];
        // Last one should be MockProvider (or Resilient wrapped Mock, depending on implementation - Router.ts shows raw Mock is not resilient wrapped, or maybe it is?)
        // Checking Router.ts:
        // quotesList.push(mock);
        // Mock is NOT wrapped in Resilient for Quotes/Bars/Discovery in Router.ts lines 46-56

        expect(providers[providers.length - 1]).toBeInstanceOf(MockProvider);
    });

    it('should use caching provider if enabled', async () => {
        (config as any).DEFAULT_QUOTES_PROVIDER = 'alpaca';
        (config as any).ENABLE_CACHING = true;

        const router = new Router();
        const quotesProvider = router.getQuotesProvider();

        expect(quotesProvider).toBeInstanceOf(CachingMarketDataProvider);
    });
});
