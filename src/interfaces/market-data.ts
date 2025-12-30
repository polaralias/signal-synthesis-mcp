import { Bar, Quote, MarketSnapshot } from '../models/data';

export interface ScreeningCriteria {
  minPrice?: number;
  maxPrice?: number;
  minVolume?: number;
  sector?: string;
  minMarketCap?: number;
}

export interface MarketDataProvider {
  getQuotes(symbols: string[]): Promise<Quote[]>;
  /**
   * Get the latest bid/ask/trade for a list of symbols.
   * Used for tradeability checks (spread, last price).
   */

  getBars(
    symbols: string[],
    timeframe: string,
    limit?: number, // default 200
    start?: Date,
    end?: Date
  ): Promise<Record<string, Bar[]>>;
  /**
   * Get historical bars (OHLCV) for a list of symbols.
   * Timeframe examples: '1m', '5m', '1d'.
   */

  getMovers(limit?: number): Promise<MarketSnapshot[]>; // default 20
  /**
   * Get top gainers/losers/active symbols.
   * Used for discovery.
   */

  screen?(criteria: ScreeningCriteria): Promise<MarketSnapshot[]>;
  /**
   * Filter the market for candidates matching the criteria.
   * If a provider doesn't support screening, it can return undefined or implement a fallback.
   */
}
