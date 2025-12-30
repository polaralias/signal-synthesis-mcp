import { planAndRun } from '../src/tools/orchestrator';
import { Router } from '../src/routing';
import { MarketDataProvider } from '../src/interfaces/market-data';
import { ContextDataProvider } from '../src/interfaces/context-data';
import { MarketSnapshot, Bar, CompanyProfile, FinancialMetrics, SentimentData } from '../src/models/data';

// Mock database service
jest.mock('../src/services/database', () => ({
  prisma: {
    tradeSetup: {
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

// Mock Provider Implementation
class MockTestProvider implements MarketDataProvider, ContextDataProvider {
  // Market Data
  async getQuotes(symbols: string[]) {
    return symbols.map(s => ({
      symbol: s,
      askPrice: 150.05,
      bidPrice: 149.95,
      lastPrice: 150.00,
      lastSize: 100,
      askSize: 100,
      bidSize: 100,
      timestamp: new Date()
    }));
  }

  async getBars(symbols: string[], timeframe: string, limit: number) {
    const bars: Bar[] = [];
    // Generate simple uptrend bars
    for (let i = 0; i < limit; i++) {
        bars.push({
            timestamp: new Date(Date.now() - (limit - i) * 60000),
            open: 100 + i,
            high: 101 + i,
            low: 99 + i,
            close: 100 + i + 0.5,
            volume: 1000 + i * 10
        });
    }
    const result: Record<string, Bar[]> = {};
    symbols.forEach(s => result[s] = bars);
    return result;
  }

  async getMovers(limit: number) {
    return [
      { symbol: 'AAPL', price: 150, changePercent: 1.5, volume: 1000000, source: 'mock' },
      { symbol: 'MSFT', price: 300, changePercent: 2.0, volume: 800000, source: 'mock' },
      { symbol: 'TSLA', price: 800, changePercent: 3.5, volume: 2000000, source: 'mock' }
    ];
  }

  async screen(criteria: any) {
    return this.getMovers(10);
  }

  // Context Data
  async getCompanyProfile(symbol: string) {
    return {
      symbol,
      name: `Test Company ${symbol}`,
      sector: 'Technology',
      industry: 'Software',
      description: 'Test Description'
    };
  }

  async getFinancialMetrics(symbol: string) {
    return {
      symbol,
      marketCap: 2000000000000,
      peRatio: 30,
      beta: 1.2,
      dividendYield: 0.5
    };
  }

  async getInsiderSentiments(symbol: string) { return null; }
  async getEarningsSurprises(symbol: string) { return []; }

  async getEarningsCalendar(startDate: Date, endDate: Date) { return []; }

  async getNews(symbols: string[]) { return {}; }

  async getSentiment(symbol: string): Promise<SentimentData> {
      return {
          symbol,
          score: 0.5,
          label: 'Bullish',
          source: 'Mock',
          confidence: 1.0
      };
  }
}

describe('E2E Pipeline', () => {
  let router: Router;
  let mockProvider: MockTestProvider;

  beforeEach(() => {
    mockProvider = new MockTestProvider();

    // Create a router that returns our mock provider for everything
    router = {
      getDiscoveryProvider: () => mockProvider,
      getQuotesProvider: () => mockProvider,
      getBarsProvider: () => mockProvider,
      getContextProvider: () => mockProvider,
      getHealthMonitor: () => ({ recordSuccess: jest.fn(), recordFailure: jest.fn() })
    } as any;
  });

  test('full day_trade pipeline should produce ranked setups', async () => {
    const result = await planAndRun(router, 'day_trade');

    expect(result).toBeDefined();
    expect(result.intent).toBe('day_trade');
    expect(result.candidatesFound).toBeGreaterThan(0);
    expect(result.setups.length).toBeGreaterThan(0);

    const firstSetup = result.setups[0];

    // Verify structure
    expect(firstSetup.symbol).toBeDefined();
    expect(firstSetup.confidence).toBeGreaterThan(0);
    expect(firstSetup.stopLoss).toBeLessThan(firstSetup.triggerPrice);
    expect(firstSetup.targetPrice).toBeGreaterThan(firstSetup.triggerPrice);
    expect(firstSetup.reasoning.length).toBeGreaterThan(0);

    // Verify reasoning contains expected elements from our mock data
    // Mock bars are uptrend -> Price > VWAP
    expect(firstSetup.reasoning).toContain('Price above VWAP');
    // Sector is Technology -> Bonus
    expect(firstSetup.reasoning).toContain('Technology sector');
  });

  test('swing pipeline should include EOD data in reasoning', async () => {
     const result = await planAndRun(router, 'swing');

     // Mock bars have 200 items (default limit in orchestrator/enrichment)
     // SMA200 needs 200 items.
     // enrichEod requests 250 daily bars. Our mock returns what's asked.
     // So SMA should be calculated.

     expect(result.setups.length).toBeGreaterThan(0);
     const setup = result.setups[0];

     // Since mock prices are rising (100 to 350 approx), current price > SMAs
     expect(setup.reasoning.some(r => r.includes('SMA'))).toBe(true);
  });
});
