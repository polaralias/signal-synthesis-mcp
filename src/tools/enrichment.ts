import { Router } from '../routing/index';
import { Bar, CompanyProfile, FinancialMetrics } from '../models/data';

export interface IntradayStats {
  vwap: number;
  atr?: number;
  bars: Bar[];
}

export interface ContextData {
  profile: CompanyProfile;
  metrics: Record<string, any>;
  earnings?: Record<string, any>;
}

export interface EodStats {
  sma50: number;
  sma200: number;
  dailyBars: Bar[];
}

export async function enrichIntraday(
  router: Router,
  symbols: string[]
): Promise<Record<string, IntradayStats>> {
  const barsProvider = router.getBarsProvider();

  // Fetch 1-minute bars, default limit 200
  const barsMap = await barsProvider.getBars(symbols, '1m', 200);

  const result: Record<string, IntradayStats> = {};

  for (const symbol of symbols) {
    const bars = barsMap[symbol] || [];
    if (bars.length === 0) {
        continue;
    }

    // Calculate VWAP
    // VWAP = Cumulative (Price * Volume) / Cumulative Volume
    let cumPV = 0;
    let cumVol = 0;
    for (const bar of bars) {
        const price = (bar.high + bar.low + bar.close) / 3;
        cumPV += price * bar.volume;
        cumVol += bar.volume;
    }
    const vwap = cumVol > 0 ? cumPV / cumVol : 0;

    // Calculate ATR (Simple 14-period)
    let atr: number | undefined;
    if (bars.length > 14) {
        let sumTR = 0;
        for (let i = 1; i < bars.length; i++) {
             const high = bars[i].high;
             const low = bars[i].low;
             const prevClose = bars[i-1].close;

             const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
             if (i >= bars.length - 14) {
                 sumTR += tr;
             }
        }
        atr = sumTR / 14;
    }

    result[symbol] = {
        vwap,
        atr,
        bars
    };
  }

  return result;
}

export async function enrichContext(
  router: Router,
  symbols: string[]
): Promise<Record<string, ContextData>> {
    const contextProvider = router.getContextProvider();
    const result: Record<string, ContextData> = {};

    // Parallel fetch for each symbol
    await Promise.all(symbols.map(async (symbol) => {
        try {
            const [profile, metrics] = await Promise.all([
                contextProvider.getCompanyProfile(symbol),
                contextProvider.getFinancialMetrics(symbol)
            ]);

            // Optional: Check earnings
            // For MVP, we don't query calendar for every symbol here as it takes start/end date ranges.
            // We could check if metrics has earningsDate.

            result[symbol] = {
                profile,
                metrics
            };
        } catch (e) {
            console.error(`Error enriching context for ${symbol}:`, e);
            // Partial failure acceptable?
            // If profile fails, we might just skip context for this symbol or provide partial.
            // For now, skip.
        }
    }));

    return result;
}

export async function enrichEod(
  router: Router,
  symbols: string[]
): Promise<Record<string, EodStats>> {
  const barsProvider = router.getBarsProvider();

  // Fetch daily bars (250 for ~1 year to cover SMA200)
  const barsMap = await barsProvider.getBars(symbols, '1d', 250);

  const result: Record<string, EodStats> = {};

  for (const symbol of symbols) {
    const bars = barsMap[symbol] || [];
    if (bars.length < 50) {
       // Not enough data for SMA50
       continue;
    }

    // Helper for simple moving average
    const calculateSMA = (data: Bar[], period: number): number => {
       if (data.length < period) return 0;
       // Take last 'period' bars
       const slice = data.slice(data.length - period);
       const sum = slice.reduce((acc, bar) => acc + bar.close, 0);
       return sum / period;
    };

    const sma50 = calculateSMA(bars, 50);
    const sma200 = calculateSMA(bars, 200);

    result[symbol] = {
        sma50,
        sma200,
        dailyBars: bars
    };
  }

  return result;
}
