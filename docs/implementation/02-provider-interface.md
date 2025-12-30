# Provider Interface Specification

This document defines the common interfaces that all provider integrations must implement. This abstraction allows the system to switch providers seamlessly.

## Base Interfaces

### `MarketDataProvider`

This interface handles real-time and historical market data.

```typescript
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
```

### `ContextDataProvider`

This interface handles fundamental data and other "slow-moving" context.

```typescript
import { CompanyProfile, NewsItem } from '../models/data';

export interface ContextDataProvider {
  getCompanyProfile(symbol: string): Promise<CompanyProfile>;
  /**
   * Get profile data: Sector, Industry, Description, Employees, etc.
   */

  getFinancialMetrics(symbol: string): Promise<Record<string, any>>;
  /**
   * Get key metrics: Market Cap, Float, PE, EPS, Dividend Yield.
   */

  getEarningsCalendar(
    startDate: Date,
    endDate: Date
  ): Promise<Array<Record<string, any>>>;
  /**
   * Get earnings announcements for a date range.
   */

  getNews(
    symbols: string[],
    limit?: number // default 5
  ): Promise<Record<string, NewsItem[]>>;
  /**
   * Get recent news headlines for symbols.
   */
}
```

## Provider Specifics & Mapping

### 1. Alpaca (`AlpacaProvider`)
*   **Capabilities**: Quotes, Bars.
*   **API Client**: Use generic HTTP client (e.g. `axios`, `fetch`) or official Node SDK.
*   **Notes**: Good for real-time quotes (IEX) and historical bars.

### 2. Polygon (`PolygonProvider`)
*   **Capabilities**: Discovery (Movers), Quotes, Bars, Context (some).
*   **API Client**: `polygon-api-client` (JS) or raw HTTP.
*   **Notes**: Excellent "Movers" endpoint for discovery. High-quality historical data.

### 3. Financial Modeling Prep (FMP) (`FMPProvider`)
*   **Capabilities**: Context (Profile, Metrics, Earnings), Discovery (Screeners).
*   **API Client**: Raw HTTP.
*   **Notes**: Best source for fundamental data and calendars.

### 4. Finnhub (`FinnhubProvider`)
*   **Capabilities**: Context, Quotes (limited), Discovery.
*   **Notes**: Good fallback for context.

### 5. Twelve Data (`TwelveDataProvider`)
*   **Capabilities**: Quotes, Bars.
*   **Notes**: Good international coverage if needed.

## Error Handling & Normalization

All providers must:
1.  **Catch API Exceptions**: Catch network errors, 429s, etc.
2.  **Raise Internal Exceptions**: Raise `ProviderError`, `RateLimitError` that the Router can catch.
3.  **Normalize**: Convert vendor-specific JSON into the `src/models` Zod objects. **Never return raw API responses.**
