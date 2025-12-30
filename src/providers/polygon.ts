import { MarketDataProvider } from '../interfaces/market-data';
import { Quote, Bar, MarketSnapshot } from '../models/data';

interface PolygonQuote {
  T: string; // Ticker
  p: number; // Price
  s: number; // Size
  t: number; // Timestamp (nanoseconds)
}

interface PolygonLastTrade {
  T: string;
  p: number;
  s: number;
  t: number;
}

interface PolygonLastQuote {
  T: string;
  bp: number;
  bs: number;
  ap: number;
  as: number;
  t: number;
}

interface PolygonBar {
  t: number; // Timestamp (Unix MS)
  o: number; // Open
  h: number; // High
  l: number; // Low
  c: number; // Close
  v: number; // Volume
  vw: number; // VWAP
  n: number; // Number of trades
}

interface PolygonSnapshot {
    ticker: string;
    day: {
        c: number;
        h: number;
        l: number;
        o: number;
        v: number;
        vw: number;
    };
    todaysChangePerc: number;
    todaysChange: number;
    updated: number;
}

export class PolygonProvider implements MarketDataProvider {
  private baseUrl = 'https://api.polygon.io/v2';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get authParam() {
    return `apiKey=${this.apiKey}`;
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
      // Polygon doesn't have a "batch last quote" endpoint that is cheap/easy in the same way.
      // But it has "Snapshot - All Tickers" which is heavy, or individual "Last Quote" and "Last Trade".
      // For efficiency, if symbols list is small, we iterate.
      // Or we use Snapshot if symbols count is large.
      // Let's assume small batch for now and iterate (parallel).

      const result: Quote[] = [];

      await Promise.all(symbols.map(async (symbol) => {
          try {
              // Fetch Last Quote
              const quoteRes = await fetch(`${this.baseUrl}/last/nbbo/${symbol}?${this.authParam}`);
              // Fetch Last Trade
              const tradeRes = await fetch(`${this.baseUrl}/last/trade/${symbol}?${this.authParam}`);

              const quoteData = await quoteRes.json();
              const tradeData = await tradeRes.json();

              if (quoteData.status === 'OK' && quoteData.results) {
                  const q = quoteData.results as PolygonLastQuote;
                  const t = tradeData.status === 'OK' ? tradeData.results as PolygonLastTrade : undefined;

                  result.push({
                      symbol,
                      bidPrice: q.bp,
                      bidSize: q.bs,
                      askPrice: q.ap,
                      askSize: q.as,
                      lastPrice: t?.p,
                      lastSize: t?.s,
                      timestamp: new Date(q.t / 1000000), // ns to ms
                      provider: 'polygon',
                  });
              }
          } catch (e) {
              console.error(`Error fetching Polygon quote for ${symbol}:`, e);
          }
      }));

      return result;
  }

  async getBars(
    symbols: string[],
    timeframe: string,
    limit: number = 200,
    start?: Date,
    end?: Date
  ): Promise<Record<string, Bar[]>> {
    const result: Record<string, Bar[]> = {};

    // Map timeframe. Polygon uses "multiplier" and "timespan".
    // e.g. 1/minute, 1/day
    let multiplier = 1;
    let timespan = 'day';

    if (timeframe === '1d') {
        timespan = 'day';
    } else if (timeframe.endsWith('m')) {
        timespan = 'minute';
        multiplier = parseInt(timeframe.replace('m', ''));
    }

    // Default dates if not provided: last 30 days
    const endDateStr = (end || new Date()).toISOString().split('T')[0];
    const startDateStr = (start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];

    await Promise.all(symbols.map(async (symbol) => {
        try {
            const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${startDateStr}/${endDateStr}?adjusted=true&sort=desc&limit=${limit}&${this.authParam}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.status === 'OK' && data.results) {
                const bars = (data.results as PolygonBar[]).map(b => ({
                    timestamp: new Date(b.t),
                    open: b.o,
                    high: b.h,
                    low: b.l,
                    close: b.c,
                    volume: b.v,
                    vwap: b.vw
                }));
                // Polygon returns sorted by date (asc or desc). We requested desc, but generally charts want asc.
                // Let's reverse if needed, but standard is usually Oldest -> Newest for array.
                // We requested sort=desc, so index 0 is newest.
                // Let's sort asc.
                result[symbol] = bars.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
            } else {
                result[symbol] = [];
            }
        } catch (e) {
            console.error(`Error fetching Polygon bars for ${symbol}:`, e);
            result[symbol] = [];
        }
    }));

    return result;
  }

  async getMovers(limit: number = 20): Promise<MarketSnapshot[]> {
    // Polygon "Snapshot - All Tickers" is useful, but huge.
    // Or "Gainers/Losers" API which is effectively movers.
    // https://polygon.io/docs/stocks/get_v2_snapshot_locale_us_markets_stocks_direction

    // We fetch gainers and losers. "Active" isn't a direct endpoint, but gainers/losers usually cover high volatility.
    // We will fetch both and merge them.

    try {
        const fetchDirection = async (direction: 'gainers' | 'losers') => {
            const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/${direction}?${this.authParam}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.status === 'OK' && data.tickers) {
                 return (data.tickers as PolygonSnapshot[]);
            }
            return [];
        };

        const [gainers, losers] = await Promise.all([
            fetchDirection('gainers'),
            fetchDirection('losers')
        ]);

        // Combine and limit
        // We take top N/2 from each to ensure variety
        const topGainers = gainers.slice(0, Math.ceil(limit / 2));
        const topLosers = losers.slice(0, Math.ceil(limit / 2));

        const combined = [...topGainers, ...topLosers];

        // Map to MarketSnapshot
        return combined.map(t => ({
            symbol: t.ticker,
            price: t.day.c,
            changePercent: t.todaysChangePerc,
            volume: t.day.v,
            description: undefined,
            source: 'polygon'
        }));

    } catch (e) {
        console.error('Error fetching Polygon movers:', e);
    }
    return [];
  }
}
