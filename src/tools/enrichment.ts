import { Router } from '../routing/index';
import { Bar, CompanyProfile, FinancialMetrics, SentimentData } from '../models/data';

export interface IntradayStats {
  vwap: number;
  atr?: number;
  rsi?: number;
  macd?: {
    macd: number;
    signal: number;
    histogram: number;
  };
  bollinger?: {
    upper: number;
    middle: number;
    lower: number;
  };
  bars: Bar[];
}

export interface ContextData {
  profile: CompanyProfile;
  metrics: Record<string, any>;
  earnings?: Record<string, any>;
  sentiment?: SentimentData;
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

    // Calculate RSI (14-period)
    const rsi = calculateRSI(bars, 14);

    // Calculate MACD (12, 26, 9)
    const macd = calculateMACD(bars, 12, 26, 9);

    // Calculate Bollinger Bands (20, 2)
    const bollinger = calculateBollingerBands(bars, 20, 2);

    result[symbol] = {
        vwap,
        atr,
        rsi,
        macd,
        bollinger,
        bars
    };
  }

  return result;
}

function calculateBollingerBands(
  bars: Bar[],
  period: number = 20,
  multiplier: number = 2
): { upper: number; middle: number; lower: number } | undefined {
  if (bars.length < period) return undefined;

  const slice = bars.slice(bars.length - period);
  const sum = slice.reduce((acc, bar) => acc + bar.close, 0);
  const middle = sum / period;

  const squaredDiffs = slice.map(bar => Math.pow(bar.close - middle, 2));
  const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
      upper: middle + (stdDev * multiplier),
      middle: middle,
      lower: middle - (stdDev * multiplier)
  };
}

function calculateRSI(bars: Bar[], period: number = 14): number | undefined {
  if (bars.length <= period) return undefined;

  let gains = 0;
  let losses = 0;

  // Initial average gain/loss
  for (let i = 1; i <= period; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) gains += change;
    else losses -= change;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Smoothed averages
  for (let i = period + 1; i < bars.length; i++) {
    const change = bars[i].close - bars[i - 1].close;
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - change) / period;
    }
  }

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function calculateMACD(
  bars: Bar[],
  shortPeriod: number = 12,
  longPeriod: number = 26,
  signalPeriod: number = 9
): { macd: number; signal: number; histogram: number } | undefined {
  if (bars.length <= longPeriod + signalPeriod) return undefined;

  const closes = bars.map(b => b.close);

  const ema = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result = [data[0]];
    for (let i = 1; i < data.length; i++) {
      result.push(data[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  };

  const shortEMA = ema(closes, shortPeriod);
  const longEMA = ema(closes, longPeriod);

  const macdLine: number[] = [];
  for (let i = 0; i < closes.length; i++) {
      macdLine.push(shortEMA[i] - longEMA[i]);
  }

  // Signal line is EMA of MACD line
  // We need to start calculating signal line after we have enough MACD data points
  // Actually standard EMA function assumes starting from index 0.
  // The MACD line values at the beginning are not accurate because of EMA ramp-up,
  // but for simplicity we calculate EMA on the whole MACD series.
  const signalLine = ema(macdLine, signalPeriod);

  const lastIndex = closes.length - 1;

  return {
      macd: macdLine[lastIndex],
      signal: signalLine[lastIndex],
      histogram: macdLine[lastIndex] - signalLine[lastIndex]
  };
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
            const [profile, metrics, sentiment] = await Promise.all([
                contextProvider.getCompanyProfile(symbol),
                contextProvider.getFinancialMetrics(symbol),
                contextProvider.getSentiment(symbol).catch(e => {
                  console.warn(`Failed to fetch sentiment for ${symbol}`, e);
                  return undefined;
                })
            ]);

            // Optional: Check earnings
            // For MVP, we don't query calendar for every symbol here as it takes start/end date ranges.
            // We could check if metrics has earningsDate.

            result[symbol] = {
                profile,
                metrics,
                sentiment
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
