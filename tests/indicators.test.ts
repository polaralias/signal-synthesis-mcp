import { enrichIntraday, IntradayStats } from '../src/tools/enrichment';
import { Router } from '../src/routing/index';
import { BarsProvider } from '../src/interfaces/market-data';
import { Bar } from '../src/models/data';

// Mock Router and BarsProvider
const mockBarsProvider = {
    getBars: jest.fn(),
    getLatestQuote: jest.fn()
} as unknown as BarsProvider;

const mockRouter = {
    getBarsProvider: jest.fn().mockReturnValue(mockBarsProvider),
} as unknown as Router;

describe('Bollinger Bands Calculation', () => {
    it('should calculate Bollinger Bands correctly', async () => {
        // Create 20 bars with constant price 100
        const bars: Bar[] = Array.from({ length: 20 }, (_, i) => ({
            timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString(),
            open: 100,
            high: 100,
            low: 100,
            close: 100,
            volume: 1000
        }));

        (mockBarsProvider.getBars as jest.Mock).mockResolvedValue({
            'TEST': bars
        });

        const result = await enrichIntraday(mockRouter, ['TEST']);
        const stats = result['TEST'];

        expect(stats).toBeDefined();
        expect(stats.bollinger).toBeDefined();
        if (stats.bollinger) {
            expect(stats.bollinger.middle).toBeCloseTo(100);
            expect(stats.bollinger.upper).toBeCloseTo(100);
            expect(stats.bollinger.lower).toBeCloseTo(100);
        }
    });

    it('should calculate bands with variance', async () => {
        // Create 20 bars alternating 90 and 110. Mean = 100.
        // Variance = ((90-100)^2 + (110-100)^2) / 2 = (100 + 100) / 2 = 100.
        // StdDev = 10.
        // Upper = 100 + (10*2) = 120.
        // Lower = 100 - (10*2) = 80.

        const bars: Bar[] = Array.from({ length: 20 }, (_, i) => ({
            timestamp: new Date(Date.now() - (20 - i) * 60000).toISOString(),
            open: i % 2 === 0 ? 90 : 110,
            high: i % 2 === 0 ? 90 : 110,
            low: i % 2 === 0 ? 90 : 110,
            close: i % 2 === 0 ? 90 : 110,
            volume: 1000
        }));

        (mockBarsProvider.getBars as jest.Mock).mockResolvedValue({
            'TEST_VAR': bars
        });

        const result = await enrichIntraday(mockRouter, ['TEST_VAR']);
        const stats = result['TEST_VAR'];

        expect(stats).toBeDefined();
        expect(stats.bollinger).toBeDefined();
        if (stats.bollinger) {
            expect(stats.bollinger.middle).toBeCloseTo(100);
            expect(stats.bollinger.upper).toBeCloseTo(120);
            expect(stats.bollinger.lower).toBeCloseTo(80);
        }
    });

    it('should return undefined if not enough bars', async () => {
        const bars: Bar[] = Array.from({ length: 10 }, (_, i) => ({
            timestamp: new Date().toISOString(),
            open: 100, high: 100, low: 100, close: 100, volume: 100
        }));

        (mockBarsProvider.getBars as jest.Mock).mockResolvedValue({
            'TEST_SHORT': bars
        });

        const result = await enrichIntraday(mockRouter, ['TEST_SHORT']);
        const stats = result['TEST_SHORT'];

        expect(stats).toBeDefined();
        expect(stats.bollinger).toBeUndefined();
    });
});
