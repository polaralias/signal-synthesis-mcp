import { Bar, Quote, MarketSnapshot } from '../models/data';

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
}
