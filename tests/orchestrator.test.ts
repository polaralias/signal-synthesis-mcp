import { Router } from '../src/routing/index.js';
import { planAndRun } from '../src/tools/orchestrator.js';

// Mock database service
jest.mock('../src/services/database', () => ({
  prisma: {
    tradeSetup: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
  },
}));

// Mock Router to force Mock Provider usage
jest.mock('../src/routing/index.js', () => {
  return {
    Router: jest.fn().mockImplementation(() => {
      return {
        getDiscoveryProvider: jest.fn().mockReturnValue({
          getMovers: jest.fn().mockResolvedValue([
            { symbol: 'AAPL', price: 150, change: 2, changePercent: 1.5, volume: 1000000 },
            { symbol: 'TSLA', price: 250, change: 5, changePercent: 2.0, volume: 500000 },
          ]),
        }),
        getQuotesProvider: jest.fn().mockReturnValue({
          getQuotes: jest.fn().mockResolvedValue([
            { symbol: 'AAPL', askPrice: 150.05, bidPrice: 150.00, lastPrice: 150.02 },
            { symbol: 'TSLA', askPrice: 250.10, bidPrice: 250.00, lastPrice: 250.05 },
          ]),
        }),
        getBarsProvider: jest.fn().mockReturnValue({
          getBars: jest.fn().mockResolvedValue({
            AAPL: Array(20).fill({ high: 152, low: 148, close: 150, volume: 1000, open: 149 }),
            TSLA: Array(20).fill({ high: 255, low: 245, close: 250, volume: 2000, open: 248 }),
          }),
        }),
        getContextProvider: jest.fn().mockReturnValue({
          getCompanyProfile: jest.fn().mockResolvedValue({ sector: 'Technology', description: 'Tech Company' }),
          getFinancialMetrics: jest.fn().mockResolvedValue({ marketCap: 2000000000 }),
          getSentiment: jest.fn().mockResolvedValue({
            symbol: 'TEST',
            score: 0.5,
            label: 'Bullish',
            source: 'Mock',
          }),
        }),
      };
    }),
  };
});

describe('Orchestrator Tool', () => {
  let router: Router;

  beforeEach(() => {
    router = new Router();
  });

  test('planAndRun executes full pipeline', async () => {
    const result = await planAndRun(router, 'day_trade');

    expect(result).toBeDefined();
    expect(result.intent).toBe('day_trade');
    expect(result.candidatesFound).toBe(2);
    expect(result.candidatesFiltered).toBe(2);
    expect(result.setups).toHaveLength(2);

    const aaplSetup = result.setups.find((s) => s.symbol === 'AAPL');
    expect(aaplSetup).toBeDefined();
    expect(aaplSetup?.setupType).toBeDefined();
  });

  test('planAndRun executes pipeline with swing intent (fetching EOD)', async () => {
    const result = await planAndRun(router, 'swing');

    expect(result).toBeDefined();
    expect(result.intent).toBe('swing');
    expect(result.candidatesFound).toBe(2);
    expect(result.setups).toHaveLength(2);
    // Since we mocked getBarsProvider to return bars, EOD enrichment will use them (though simulated)
    // Here we mainly check that it runs without error and returns setups
  });
});
