import { rankSetups, ScoringWeights } from '../src/tools/ranking';
import { IntradayStats, ContextData, EodStats } from '../src/tools/enrichment';
import { Bar } from '../src/models/data';

describe('Ranking Weights', () => {
    // Helper to generate bars
    const createBars = (price: number, count: number = 20): Bar[] => {
        const bars: Bar[] = [];
        for (let i = 0; i < count; i++) {
            bars.push({
                timestamp: new Date(Date.now() - (count - i) * 60000),
                open: price,
                high: price + 1,
                low: price - 1,
                close: price,
                volume: 1000,
                vwap: price
            });
        }
        return bars;
    };

    const baseSymbol = 'TEST';

    test('should apply priceAboveVwap weight', () => {
        const bars = createBars(100);
        // Make price > VWAP
        bars[bars.length - 1].close = 101;

        const intraday: Record<string, IntradayStats> = {
            [baseSymbol]: {
                bars,
                vwap: 100
            }
        };

        const setups = rankSetups(intraday, {}, {});
        expect(setups.length).toBe(1);
        const setup = setups[0];

        // Base score = priceAboveVwap (1.0)
        // Confidence = score / 3
        // score 1.0 -> confidence 0.33
        expect(setup.reasoning).toContain('Price above VWAP');
        // Confidence calculation is min(max(score/3, 0.1), 1.0)
        expect(setup.confidence).toBeCloseTo(ScoringWeights.priceAboveVwap / 3, 2);
    });

    test('should apply sectorBonus weight', () => {
        const bars = createBars(100);
        const intraday: Record<string, IntradayStats> = {
            [baseSymbol]: { bars, vwap: 100 }
        };

        const context: Record<string, ContextData> = {
            [baseSymbol]: {
                profile: {
                    symbol: baseSymbol,
                    sector: ScoringWeights.preferredSector,
                    name: 'Test Inc',
                    industry: 'Tech',
                    description: 'desc'
                },
                financials: { symbol: baseSymbol },
                news: []
            }
        };

        const setups = rankSetups(intraday, context, {});
        expect(setups[0].reasoning).toContain(`${ScoringWeights.preferredSector} sector`);

        // Score = sectorBonus (0.5)
        // Confidence = 0.5 / 3 = 0.166...
        expect(setups[0].confidence).toBeCloseTo(ScoringWeights.sectorBonus / 3, 2);
    });

    test('should apply RSI oversold weight', () => {
        const bars = createBars(100);
        const intraday: Record<string, IntradayStats> = {
            [baseSymbol]: {
                bars,
                vwap: 100,
                rsi: 25 // Oversold
            }
        };

        const setups = rankSetups(intraday, {}, {});
        expect(setups[0].reasoning.some(r => r.includes('RSI Oversold'))).toBe(true);

        // Score = rsiOversold (1.0)
        expect(setups[0].confidence).toBeCloseTo(ScoringWeights.rsiOversold / 3, 2);
    });

    test('should apply multiple weights cumulatively', () => {
        const bars = createBars(100);
        // Price > VWAP (+1.0)
        bars[bars.length - 1].close = 102;

        const intraday: Record<string, IntradayStats> = {
            [baseSymbol]: {
                bars,
                vwap: 100,
                rsi: 25 // Oversold (+1.0)
            }
        };

        const context: Record<string, ContextData> = {
            [baseSymbol]: {
                profile: {
                    symbol: baseSymbol,
                    sector: ScoringWeights.preferredSector, // (+0.5)
                    name: 'Test Inc',
                    industry: 'Tech',
                    description: 'desc'
                },
                financials: { symbol: baseSymbol },
                news: []
            }
        };

        const setups = rankSetups(intraday, context, {});

        // Total score = 1.0 + 1.0 + 0.5 = 2.5
        // Confidence = 2.5 / 3 = 0.833...
        expect(setups[0].confidence).toBeCloseTo(2.5 / 3, 2);
        expect(setups[0].reasoning).toHaveLength(3);
    });
});
