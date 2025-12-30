import { rankSetups } from '../src/tools/ranking';
import { IntradayStats, ContextData } from '../src/tools/enrichment';
import { Bar } from '../src/models/data';

describe('Ranking Logic with Sentiment', () => {
    const mockBar: Bar = {
        timestamp: new Date(),
        open: 100,
        high: 105,
        low: 99,
        close: 102,
        volume: 1000
    };

    const mockIntraday: Record<string, IntradayStats> = {
        'AAPL': {
            vwap: 101, // Price > VWAP (+1)
            bars: [mockBar],
            rsi: 50, // Neutral
        },
        'TSLA': {
            vwap: 101, // Price > VWAP (+1)
            bars: [mockBar],
            rsi: 50
        }
    };

    const mockContext: Record<string, ContextData> = {
        'AAPL': {
            profile: { symbol: 'AAPL', name: 'Apple' },
            metrics: {},
            sentiment: {
                symbol: 'AAPL',
                score: 0.8, // High positive sentiment
                label: 'Bullish',
                source: 'Test'
            }
        },
        'TSLA': {
            profile: { symbol: 'TSLA', name: 'Tesla' },
            metrics: {},
            sentiment: {
                symbol: 'TSLA',
                score: -0.5, // Negative sentiment
                label: 'Bearish',
                source: 'Test'
            }
        }
    };

    test('Positive sentiment boosts ranking score', () => {
        const setups = rankSetups(mockIntraday, mockContext);

        const aapl = setups.find(s => s.symbol === 'AAPL');
        const tsla = setups.find(s => s.symbol === 'TSLA');

        expect(aapl).toBeDefined();
        expect(tsla).toBeDefined();

        // AAPL: Base 1 (Price > VWAP) + Sentiment (0.8 * 1.5 = 1.2) = 2.2
        // TSLA: Base 1 (Price > VWAP) - Sentiment (0.5 * 1.5 = 0.75) = 0.25

        expect(aapl!.confidence).toBeGreaterThan(tsla!.confidence);
        expect(aapl!.reasoning).toContain('Positive Sentiment (Bullish)');
        expect(tsla!.reasoning).toContain('Negative Sentiment (Bearish)');
    });
});
