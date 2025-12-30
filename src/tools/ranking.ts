import { TradeSetup } from '../models/data';
import { IntradayStats, ContextData, EodStats } from './enrichment';

export const ScoringWeights = {
    priceAboveVwap: 1.0,
    volumeSpike: 1.0,
    sectorBonus: 0.5,
    preferredSector: 'Technology',
    sentimentMultiplier: 1.5,
    rsiOversold: 1.0,
    rsiOverboughtPenalty: -0.5,
    macdBullish: 0.5,
    macdBearishPenalty: -0.5,
    bollingerLower: 1.0,
    bollingerUpperPenalty: -0.5,
    sma50Trend: 1.0,
    sma200Trend: 1.0,
    goldenCross: 0.5
};

export function rankSetups(
  intradayData: Record<string, IntradayStats>,
  contextData: Record<string, ContextData>,
  eodData: Record<string, EodStats> = {}
): TradeSetup[] {
  const setups: TradeSetup[] = [];

  const symbols = Object.keys(intradayData);

  for (const symbol of symbols) {
    const stats = intradayData[symbol];
    // stats.bars coming from JSON might have string dates for timestamp.
    // The code below strictly relies on 'volume', 'close', 'open' which are numbers.
    // So explicit Date hydration isn't strictly necessary for logic, but good for safety if we ever use timestamp.

    const context = contextData[symbol]; // Might be undefined
    const eod = eodData[symbol]; // Might be undefined
    const bars = stats.bars;
    if (!bars || bars.length === 0) continue;

    const lastBar = bars[bars.length - 1];
    const currentPrice = lastBar.close;

    // Scoring logic
    let score = 0;
    const reasoning: string[] = [];
    let setupType = 'Unknown';

    // 1. Price vs VWAP
    if (stats.vwap && currentPrice > stats.vwap) {
        score += ScoringWeights.priceAboveVwap;
        reasoning.push('Price above VWAP');
    }

    // 2. Volume Trend (Last bar vol vs Avg vol of last 10)
    if (bars.length >= 10) {
        const last10Vol = bars.slice(-10).reduce((acc, b) => acc + b.volume, 0) / 10;
        if (lastBar.volume > last10Vol) {
            score += ScoringWeights.volumeSpike;
            reasoning.push('Volume spiking above recent average');
        }
    }

    // 3. Sector/Context (Bonus)
    if (context && context.profile) {
        // Placeholder for sector logic, e.g. "Technology" is hot
        if (context.profile.sector === ScoringWeights.preferredSector) {
            score += ScoringWeights.sectorBonus;
            reasoning.push(`${ScoringWeights.preferredSector} sector`);
        }
    }

    // 3b. Sentiment Analysis
    if (context && context.sentiment) {
        const sentimentScore = context.sentiment.score; // -1 to 1
        if (sentimentScore > 0.2) {
            score += sentimentScore * ScoringWeights.sentimentMultiplier;
            reasoning.push(`Positive Sentiment (${context.sentiment.label})`);
        } else if (sentimentScore < -0.2) {
            score += sentimentScore * ScoringWeights.sentimentMultiplier;
            reasoning.push(`Negative Sentiment (${context.sentiment.label})`);
        }
    }

    // 4. Momentum Indicators (RSI & MACD)
    if (stats.rsi) {
        if (stats.rsi < 30) {
            score += ScoringWeights.rsiOversold;
            reasoning.push(`RSI Oversold (${stats.rsi.toFixed(1)})`);
        } else if (stats.rsi > 70) {
            // Depending on strategy, this could be good (momentum) or bad (reversal)
            // For trend following, we might penalize slightly or just note it
            score += ScoringWeights.rsiOverboughtPenalty;
            reasoning.push(`RSI Overbought (${stats.rsi.toFixed(1)})`);
        }
    }

    if (stats.macd) {
        if (stats.macd.histogram > 0 && stats.macd.macd > stats.macd.signal) {
            score += ScoringWeights.macdBullish;
            reasoning.push('MACD Bullish');
        } else if (stats.macd.histogram < 0 && stats.macd.macd < stats.macd.signal) {
            score += ScoringWeights.macdBearishPenalty;
            reasoning.push('MACD Bearish');
        }
    }

    // 5. Bollinger Bands (Mean Reversion / Squeeze)
    if (stats.bollinger) {
        const { upper, lower, middle } = stats.bollinger;
        // Price touching lower band - potential bounce
        if (currentPrice <= lower * 1.01) {
             score += ScoringWeights.bollingerLower;
             reasoning.push('Price at Bollinger Lower Band (Oversold)');
        }
        // Price touching upper band - potential pullback (or breakout)
        else if (currentPrice >= upper * 0.99) {
             // Context dependent, but generally overextended
             score += ScoringWeights.bollingerUpperPenalty;
             reasoning.push('Price at Bollinger Upper Band (Overbought)');
        }

        // Squeeze detection (Bandwidth narrowing) - Advanced, maybe later
    }

    // 6. EOD / Long Term Checks
    if (eod) {
        // Price vs SMA50 (Bullish trend)
        if (eod.sma50 > 0 && currentPrice > eod.sma50) {
            score += ScoringWeights.sma50Trend;
            reasoning.push('Price above 50-day SMA');
        }
        // Price vs SMA200 (Long term trend)
        if (eod.sma200 > 0 && currentPrice > eod.sma200) {
            score += ScoringWeights.sma200Trend;
            reasoning.push('Price above 200-day SMA');
        }
        // Golden Cross Check (SMA50 > SMA200) - Basic check
        if (eod.sma50 > 0 && eod.sma200 > 0 && eod.sma50 > eod.sma200) {
            score += ScoringWeights.goldenCross;
            reasoning.push('SMA50 above SMA200 (Golden Cross setup)');
        }
    }

    // Identify Setup Type
    // Simple Bullish Trend: Price > VWAP and Price > Open
    if (stats.vwap && currentPrice > stats.vwap && currentPrice > lastBar.open) {
        setupType = 'Bullish Trend';
        if (stats.rsi && stats.rsi < 30) setupType = 'Oversold Bounce';
    } else if (stats.vwap && currentPrice < stats.vwap && currentPrice < lastBar.open) {
        setupType = 'Bearish Trend';
        if (stats.rsi && stats.rsi > 70) setupType = 'Overbought Pullback';
    } else {
        setupType = 'Consolidation';
    }

    // Calculate Confidence (0.0 - 1.0) based on score
    // Max score roughly 2.5 here.
    const confidence = Math.min(Math.max(score / 3, 0.1), 1.0);

    // Stop Loss / Target
    // Simple ATR based: Stop 2*ATR below, Target 3*ATR above
    let stopLoss = currentPrice * 0.98;
    let targetPrice = currentPrice * 1.05;

    if (stats.atr) {
        stopLoss = currentPrice - (2 * stats.atr);
        targetPrice = currentPrice + (3 * stats.atr);
    }

    setups.push({
        symbol,
        setupType,
        triggerPrice: currentPrice,
        stopLoss,
        targetPrice,
        confidence,
        reasoning,
        validUntil: new Date(Date.now() + 30 * 60000) // Valid for 30 mins
    });
  }

  // Sort by confidence desc
  return setups.sort((a, b) => b.confidence - a.confidence);
}
