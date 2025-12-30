import { rankSetups } from '../src/tools/ranking.js';
import { IntradayStats, ContextData, EodStats } from '../src/tools/enrichment.js';
import { Bar } from '../src/models/data.js';

describe('Ranking EOD Logic', () => {
  const createBar = (close: number, volume: number): Bar => ({
    timestamp: new Date(),
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume,
  });

  const baseIntraday: Record<string, IntradayStats> = {
    AAPL: {
      vwap: 150,
      bars: [createBar(150, 1000)],
    },
  };
  const baseContext: Record<string, ContextData> = {
    AAPL: {
      profile: {
        symbol: 'AAPL',
        name: 'Apple',
        sector: 'Technology',
      },
      metrics: {},
    },
  };

  it('should boost score if price is above SMA50', () => {
    // Current price 150
    const eod: Record<string, EodStats> = {
      AAPL: {
        sma50: 140, // Below current price
        sma200: 130,
        dailyBars: [],
      },
    };

    const setups = rankSetups(baseIntraday, baseContext, eod);
    const reasoning = setups[0].reasoning;

    expect(reasoning).toContain('Price above 50-day SMA');
  });

  it('should boost score if price is above SMA200', () => {
    // Current price 150
    const eod: Record<string, EodStats> = {
      AAPL: {
        sma50: 160,
        sma200: 140, // Below current price
        dailyBars: [],
      },
    };

    const setups = rankSetups(baseIntraday, baseContext, eod);
    const reasoning = setups[0].reasoning;

    expect(reasoning).toContain('Price above 200-day SMA');
  });

  it('should boost score for Golden Cross (SMA50 > SMA200)', () => {
    const eod: Record<string, EodStats> = {
      AAPL: {
        sma50: 145,
        sma200: 140, // SMA50 > SMA200
        dailyBars: [],
      },
    };

    const setups = rankSetups(baseIntraday, baseContext, eod);
    const reasoning = setups[0].reasoning;

    expect(reasoning).toContain('SMA50 above SMA200 (Golden Cross setup)');
  });

  it('should ignore EOD checks if EOD data missing', () => {
    const setups = rankSetups(baseIntraday, baseContext, {});
    const reasoning = setups[0].reasoning;

    // Should NOT have SMA reasons
    expect(reasoning.some(r => r.includes('SMA'))).toBe(false);
  });
});
