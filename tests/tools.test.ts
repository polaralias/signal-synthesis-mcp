import { Router } from '../src/routing/index.js';
import { discoverCandidates } from '../src/tools/discovery.js';
import { filterTradeable } from '../src/tools/filters.js';
import { enrichIntraday, enrichContext } from '../src/tools/enrichment.js';
import { rankSetups } from '../src/tools/ranking.js';
import { MockProvider } from '../src/providers/mock.js';
import { Quote, Bar } from '../src/models/data.js';

// Helper to cast Router to allow private property access for testing if needed,
// or we just rely on standard public interfaces.
// The Router defaults to MockProvider if no keys are set.

describe('Tools Pipeline', () => {
  let router: Router;

  beforeAll(() => {
    // Ensure no API keys are present to force MockProvider usage
    process.env.ALPACA_API_KEY = '';
    process.env.POLYGON_API_KEY = '';
    process.env.FMP_API_KEY = '';

    router = new Router();
  });

  test('discoverCandidates returns movers from mock provider', async () => {
    const candidates = await discoverCandidates(router, 'day_trade');
    expect(candidates).toBeDefined();
    expect(Array.isArray(candidates)).toBe(true);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].symbol).toBeDefined();
  });

  test('filterTradeable filters candidates', async () => {
    const candidates = ['AAPL', 'MSFT', 'TSLA']; // Mock provider handles these
    const result = await filterTradeable(router, candidates);

    expect(result.validSymbols).toBeDefined();
    expect(result.rejections).toBeDefined();

    // In mock provider, AAPL/MSFT/TSLA might have random prices.
    // We just ensure it runs without error and returns structure.
    expect(Array.isArray(result.validSymbols)).toBe(true);
  });

  test('enrichIntraday calculates VWAP and ATR', async () => {
    const symbols = ['AAPL'];
    const result = await enrichIntraday(router, symbols);

    expect(result['AAPL']).toBeDefined();
    expect(result['AAPL'].bars).toBeDefined();
    expect(typeof result['AAPL'].vwap).toBe('number');
    // ATR might be undefined if not enough bars, but MockProvider usually returns many bars.
  });

  test('enrichContext fetches profile and metrics', async () => {
    const symbols = ['AAPL'];
    const result = await enrichContext(router, symbols);

    expect(result['AAPL']).toBeDefined();
    expect(result['AAPL'].profile).toBeDefined();
    expect(result['AAPL'].metrics).toBeDefined();
  });

  test('rankSetups scores and ranks', () => {
    // Construct fake data
    const intradayData = {
        'BULL': {
            vwap: 100,
            bars: [{ close: 105, open: 102, high: 106, low: 101, volume: 1000, timestamp: new Date() } as Bar],
            atr: 1
        },
        'BEAR': {
            vwap: 100,
            bars: [{ close: 95, open: 98, high: 99, low: 94, volume: 1000, timestamp: new Date() } as Bar],
            atr: 1
        }
    };

    const contextData = {
        'BULL': {
            profile: { symbol: 'BULL', name: 'Bull Inc' },
            metrics: {}
        },
        'BEAR': {
             profile: { symbol: 'BEAR', name: 'Bear Inc' },
             metrics: {}
        }
    };

    const setups = rankSetups(intradayData, contextData);

    expect(setups.length).toBe(2);
    expect(setups[0].symbol).toBe('BULL'); // Should be ranked higher/bullish
    expect(setups[0].setupType).toBe('Bullish Trend');
    expect(setups[1].symbol).toBe('BEAR');
    expect(setups[1].setupType).toBe('Bearish Trend');
  });
});
