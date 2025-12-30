import { MarketDataProvider } from '../interfaces/market-data';
import { Quote, Bar, MarketSnapshot } from '../models/data';

interface AlpacaQuote {
  t: string; // timestamp
  ax: string; // ask exchange
  ap: number; // ask price
  as: number; // ask size
  bx: string; // bid exchange
  bp: number; // bid price
  bs: number; // bid size
  c: string[]; // conditions
  z: string; // tape
}

interface AlpacaTrade {
  t: string; // timestamp
  x: string; // exchange
  p: number; // price
  s: number; // size
  c: string[]; // conditions
  i: number; // id
  z: string; // tape
}

interface AlpacaBar {
  t: string; // timestamp
  o: number; // open
  h: number; // high
  l: number; // low
  c: number; // close
  v: number; // volume
  n: number; // trade count
  vw: number; // vwap
}

export class AlpacaProvider implements MarketDataProvider {
  private baseUrl = 'https://data.alpaca.markets/v2';
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private get headers() {
    return {
      'APCA-API-KEY-ID': this.apiKey,
      'APCA-API-SECRET-KEY': this.apiSecret,
    };
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (symbols.length === 0) return [];

    // https://docs.alpaca.markets/reference/stock-latest-quotes
    // We also need trades for "lastPrice"
    // So we fetch both latest quotes and latest trades

    const symbolsParam = symbols.join(',');

    try {
      const [quotesRes, tradesRes] = await Promise.all([
        fetch(`${this.baseUrl}/stocks/quotes/latest?symbols=${symbolsParam}`, { headers: this.headers }),
        fetch(`${this.baseUrl}/stocks/trades/latest?symbols=${symbolsParam}`, { headers: this.headers })
      ]);

      if (!quotesRes.ok) {
        throw new Error(`Alpaca API error (Quotes): ${quotesRes.statusText}`);
      }
      if (!tradesRes.ok) {
        throw new Error(`Alpaca API error (Trades): ${tradesRes.statusText}`);
      }

      const quotesData = await quotesRes.json();
      const tradesData = await tradesRes.json();

      const result: Quote[] = [];

      for (const symbol of symbols) {
        const quote = quotesData.quotes[symbol] as AlpacaQuote | undefined;
        const trade = tradesData.trades[symbol] as AlpacaTrade | undefined;

        if (quote) {
          result.push({
            symbol,
            bidPrice: quote.bp,
            bidSize: quote.bs,
            askPrice: quote.ap,
            askSize: quote.as,
            lastPrice: trade?.p,
            lastSize: trade?.s,
            timestamp: new Date(quote.t),
            provider: 'alpaca',
          });
        }
      }

      return result;
    } catch (error) {
      console.error('Error fetching quotes from Alpaca:', error);
      throw error;
    }
  }

  async getBars(
    symbols: string[],
    timeframe: string,
    limit: number = 200,
    start?: Date,
    end?: Date
  ): Promise<Record<string, Bar[]>> {
    const result: Record<string, Bar[]> = {};
    if (symbols.length === 0) return result;

    // Map timeframe to Alpaca format: 1Min, 5Min, 15Min, 1Day
    // Simplified mapping for MVP
    let alpacaTimeframe = '1Day';
    if (timeframe.includes('m')) {
        alpacaTimeframe = timeframe.replace('m', 'Min');
    } else if (timeframe.includes('d')) {
        alpacaTimeframe = '1Day';
    }

    const startParam = start ? `&start=${start.toISOString()}` : '';
    const endParam = end ? `&end=${end.toISOString()}` : '';
    const symbolsParam = symbols.join(',');

    try {
      const url = `${this.baseUrl}/stocks/bars?symbols=${symbolsParam}&timeframe=${alpacaTimeframe}&limit=${limit}${startParam}${endParam}`;
      const res = await fetch(url, { headers: this.headers });

      if (!res.ok) {
        throw new Error(`Alpaca API error (Bars): ${res.statusText}`);
      }

      const data = await res.json();

      for (const symbol of symbols) {
        if (data.bars && data.bars[symbol]) {
            result[symbol] = (data.bars[symbol] as AlpacaBar[]).map(b => ({
                timestamp: new Date(b.t),
                open: b.o,
                high: b.h,
                low: b.l,
                close: b.c,
                volume: b.v,
                vwap: b.vw
            }));
        } else {
            result[symbol] = [];
        }
      }

      return result;
    } catch (error) {
      console.error('Error fetching bars from Alpaca:', error);
      throw error;
    }
  }

  async getMovers(limit: number = 20): Promise<MarketSnapshot[]> {
    // Alpaca uses Snapshot API to get all tickers and filter,
    // or we can use the "movers" logic if available.
    // The Snapshot - All Tickers endpoint is heavy.
    // For MVP, Alpaca doesn't have a direct "movers" endpoint like Polygon.
    // We will throw not implemented or return empty for now, as Polygon is preferred for Discovery.
    // Alternatively, we could fetch a small list of popular symbols as a fallback.

    console.warn('getMovers not fully supported by AlpacaProvider in MVP. Returning empty.');
    return [];
  }
}
