import { SmartScreener } from '../src/services/screener';
import { MarketDataProvider } from '../src/interfaces/market-data';
import { ContextProvider } from '../src/interfaces/context-data';
import { MarketSnapshot, CompanyProfile, FinancialMetrics } from '../src/models/data';

describe('SmartScreener', () => {
  let mockMarketProvider: jest.Mocked<MarketDataProvider>;
  let mockContextProvider: jest.Mocked<ContextProvider>;
  let screener: SmartScreener;

  const mockSnapshot: MarketSnapshot = {
    symbol: 'AAPL',
    price: 150,
    changePercent: 1.5,
    volume: 1000000,
    source: 'mock'
  };

  const mockSnapshot2: MarketSnapshot = {
    symbol: 'MSFT',
    price: 300,
    changePercent: 2.0,
    volume: 500000,
    source: 'mock'
  };

  const mockSnapshot3: MarketSnapshot = {
    symbol: 'PENNY',
    price: 0.5,
    changePercent: -10,
    volume: 20000,
    source: 'mock'
  };

  beforeEach(() => {
    mockMarketProvider = {
      getQuotes: jest.fn(),
      getBars: jest.fn(),
      getMovers: jest.fn().mockResolvedValue([mockSnapshot, mockSnapshot2, mockSnapshot3]),
      screen: jest.fn(),
    } as any;

    mockContextProvider = {
      getCompanyProfile: jest.fn(),
      getFinancialMetrics: jest.fn(),
    } as any;

    screener = new SmartScreener(mockMarketProvider, mockContextProvider);
  });

  test('should use native screening if available', async () => {
    (mockMarketProvider.screen as jest.Mock).mockResolvedValue([mockSnapshot]);

    const results = await screener.screen({ minPrice: 100 });

    expect(mockMarketProvider.screen).toHaveBeenCalledWith({ minPrice: 100 });
    expect(results).toHaveLength(1);
    expect(results[0].symbol).toBe('AAPL');
  });

  test('should fallback to in-memory filtering if native screening is missing', async () => {
    mockMarketProvider.screen = undefined;

    const results = await screener.screen({ minPrice: 100 });

    expect(mockMarketProvider.getMovers).toHaveBeenCalled();
    expect(results).toHaveLength(2); // AAPL and MSFT
    expect(results.map(r => r.symbol)).toContain('AAPL');
    expect(results.map(r => r.symbol)).toContain('MSFT');
  });

  test('should fallback to in-memory filtering if native screening returns nothing/fails', async () => {
     (mockMarketProvider.screen as jest.Mock).mockResolvedValue([]);

     const results = await screener.screen({ minPrice: 100 });

     // Should have tried screen, then fallback
     expect(mockMarketProvider.screen).toHaveBeenCalled();
     expect(mockMarketProvider.getMovers).toHaveBeenCalled();
     expect(results).toHaveLength(2);
  });

  test('should filter by volume', async () => {
      mockMarketProvider.screen = undefined;
      const results = await screener.screen({ minVolume: 800000 });
      expect(results).toHaveLength(1);
      expect(results[0].symbol).toBe('AAPL');
  });

  test('should filter by sector', async () => {
      mockMarketProvider.screen = undefined;

      (mockContextProvider.getCompanyProfile as jest.Mock).mockImplementation(async (symbol) => {
          if (symbol === 'AAPL') return { symbol, name: 'Apple', sector: 'Technology' } as CompanyProfile;
          if (symbol === 'MSFT') return { symbol, name: 'Microsoft', sector: 'Technology' } as CompanyProfile;
          if (symbol === 'PENNY') return { symbol, name: 'Penny', sector: 'Basic Materials' } as CompanyProfile;
          return { symbol, name: 'Unknown' } as CompanyProfile;
      });

      const results = await screener.screen({ sector: 'Technology' });
      expect(results).toHaveLength(2);
      expect(results.map(r => r.symbol)).toContain('AAPL');
      expect(results.map(r => r.symbol)).toContain('MSFT');
  });
});

import { enrichIntraday } from '../src/tools/enrichment';
import { Router } from '../src/routing';

// Mock Router for Enrichment Test
describe('Enrichment Tools', () => {
    let mockRouter: any;
    let mockBarsProvider: any;

    beforeEach(() => {
        mockBarsProvider = {
            getBars: jest.fn()
        };
        mockRouter = {
            getBarsProvider: () => mockBarsProvider,
            getContextProvider: () => ({})
        };
    });

    test('should calculate RSI and MACD correctly', async () => {
        // Create 30 bars of data (rising price)
        const bars = [];
        for (let i = 0; i < 50; i++) {
            bars.push({
                timestamp: new Date(),
                open: 100 + i,
                high: 101 + i,
                low: 99 + i,
                close: 100 + i,
                volume: 1000
            });
        }

        mockBarsProvider.getBars.mockResolvedValue({ 'AAPL': bars });

        const result = await enrichIntraday(mockRouter, ['AAPL']);
        const stats = result['AAPL'];

        expect(stats).toBeDefined();
        expect(stats.rsi).toBeDefined();
        expect(stats.macd).toBeDefined();

        // With constantly rising price, RSI should be high (100 or close to it)
        expect(stats.rsi).toBeGreaterThan(70);

        // MACD should be positive
        expect(stats.macd!.macd).toBeGreaterThan(0);
    });
});
