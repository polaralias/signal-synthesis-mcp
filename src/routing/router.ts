import { config } from '../config';
import { MarketDataProvider, ContextDataProvider } from '../interfaces/index';
import { MockProvider } from '../providers/mock';
import { AlpacaProvider } from '../providers/alpaca';
import { PolygonProvider } from '../providers/polygon';
import { FMPProvider } from '../providers/fmp';
import { FinnhubProvider } from '../providers/finnhub';
import { CachingMarketDataProvider } from '../providers/caching';
import { HealthMonitor } from './health';
import { ResilientMarketDataProvider, ResilientContextDataProvider } from '../providers/wrapper';
import { FallbackMarketDataProvider, FallbackContextDataProvider } from '../providers/fallback';

export type CacheProviderFactory = (provider: MarketDataProvider, ttlMs: number) => MarketDataProvider;

export class Router {
  private discoveryProvider: MarketDataProvider;
  private quotesProvider: MarketDataProvider;
  private barsProvider: MarketDataProvider;
  private contextProvider: ContextDataProvider;
  private healthMonitor: HealthMonitor;
  private cacheFactory?: CacheProviderFactory;

  constructor(customConfig?: Record<string, any>, cacheFactory?: CacheProviderFactory) {
    this.healthMonitor = new HealthMonitor();
    this.cacheFactory = cacheFactory;
    const currentConfig = { ...config, ...customConfig };

    // --- Initialize Base Providers ---
    const mock = new MockProvider();

    const alpaca = (currentConfig.ALPACA_API_KEY && currentConfig.ALPACA_SECRET_KEY)
      ? new ResilientMarketDataProvider(
          new AlpacaProvider(currentConfig.ALPACA_API_KEY, currentConfig.ALPACA_SECRET_KEY),
          this.healthMonitor,
          'alpaca'
        )
      : null;

    const polygon = (currentConfig.POLYGON_API_KEY)
      ? new ResilientMarketDataProvider(
          new PolygonProvider(currentConfig.POLYGON_API_KEY),
          this.healthMonitor,
          'polygon'
        )
      : null;

    const fmp = (currentConfig.FMP_API_KEY)
      ? new ResilientContextDataProvider(
          new FMPProvider(currentConfig.FMP_API_KEY),
          this.healthMonitor,
          'fmp'
        )
      : null;

    const finnhub = (currentConfig.FINNHUB_API_KEY)
      ? new ResilientContextDataProvider(
          new FinnhubProvider(currentConfig.FINNHUB_API_KEY),
          this.healthMonitor,
          'finnhub'
        )
      : null;

    // --- Build Priority Stacks ---
    // Note: We always include 'mock' as the last resort.

    // Discovery: Polygon is best for movers. Alpaca movers not impl.
    const discoveryList: MarketDataProvider[] = [];
    if (polygon) discoveryList.push(polygon);
    // If we had others for discovery, add here.
    discoveryList.push(mock);

    // Quotes: Alpaca, then Polygon (or configurable).
    const quotesList: MarketDataProvider[] = [];
    // Could use config to change order, but for now fixed priority: Alpaca -> Polygon -> Mock
    if (alpaca) quotesList.push(alpaca);
    if (polygon) quotesList.push(polygon);
    quotesList.push(mock);

    // Bars: Alpaca, then Polygon.
    const barsList: MarketDataProvider[] = [];
    if (alpaca) barsList.push(alpaca);
    if (polygon) barsList.push(polygon);
    barsList.push(mock);

    // Context: FMP, then Finnhub.
    const contextList: ContextDataProvider[] = [];
    if (fmp) contextList.push(fmp);
    if (finnhub) contextList.push(finnhub);
    // Mock for context
    const resilientMockContext = new ResilientContextDataProvider(mock, this.healthMonitor, 'mock');
    contextList.push(resilientMockContext);


    // --- Create Fallback Providers ---
    let discoveryProvider: MarketDataProvider = new FallbackMarketDataProvider(discoveryList);
    let quotesProvider: MarketDataProvider = new FallbackMarketDataProvider(quotesList);
    let barsProvider: MarketDataProvider = new FallbackMarketDataProvider(barsList);
    let contextProvider: ContextDataProvider = new FallbackContextDataProvider(contextList);


    // --- Apply Caching (if enabled) ---
    if (currentConfig.ENABLE_CACHING) {
      const ttl = currentConfig.CACHE_TTL || 60000;
      const applyCache = (p: MarketDataProvider) => {
        if (this.cacheFactory) return this.cacheFactory(p, ttl);
        return new CachingMarketDataProvider(p, ttl);
      };

      discoveryProvider = applyCache(discoveryProvider);
      quotesProvider = applyCache(quotesProvider);
      barsProvider = applyCache(barsProvider);
      // Context caching not implemented in CachingMarketDataProvider (it's for MarketData),
      // but we could implement CachingContextDataProvider if needed.
      // For now, only market data is cached.
    }

    this.discoveryProvider = discoveryProvider;
    this.quotesProvider = quotesProvider;
    this.barsProvider = barsProvider;
    this.contextProvider = contextProvider;
  }

  getDiscoveryProvider(): MarketDataProvider {
    return this.discoveryProvider;
  }

  getQuotesProvider(): MarketDataProvider {
    return this.quotesProvider;
  }

  getBarsProvider(): MarketDataProvider {
    return this.barsProvider;
  }

  getContextProvider(): ContextDataProvider {
    return this.contextProvider;
  }

  getHealthMonitor(): HealthMonitor {
      return this.healthMonitor;
  }
}
