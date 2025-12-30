import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { enrichEod } from '../src/tools/enrichment.js';
import { Router } from '../src/routing/router.js';
import { Bar } from '../src/models/data.js';

// Mock Router
jest.mock('../src/routing/router.js');

describe('enrichEod', () => {
    let mockBarsProvider: any;
    let router: any;

    beforeEach(() => {
        mockBarsProvider = {
            getBars: jest.fn()
        };
        router = new Router();
        router.getBarsProvider.mockReturnValue(mockBarsProvider);
    });

    test('should calculate SMA50 and SMA200', async () => {
        // Generate 250 bars with close price = index + 1
        const bars: Bar[] = Array.from({ length: 250 }, (_, i) => ({
            timestamp: new Date(),
            open: 10, high: 10, low: 10, close: i + 1, volume: 100
        }));

        mockBarsProvider.getBars.mockResolvedValue({
            AAPL: bars
        });

        const result = await enrichEod(router, ['AAPL']);

        expect(result['AAPL']).toBeDefined();

        // SMA50: Average of 201..250 = (201+250)/2 = 225.5
        expect(result['AAPL'].sma50).toBeCloseTo(225.5);

        // SMA200: Average of 51..250 = (51+250)/2 = 150.5
        expect(result['AAPL'].sma200).toBeCloseTo(150.5);
    });

    test('should skip symbols with insufficient data', async () => {
        const bars: Bar[] = Array.from({ length: 49 }, (_, i) => ({
            timestamp: new Date(),
            open: 10, high: 10, low: 10, close: 10, volume: 100
        }));

        mockBarsProvider.getBars.mockResolvedValue({
            AAPL: bars
        });

        const result = await enrichEod(router, ['AAPL']);
        expect(result['AAPL']).toBeUndefined();
    });

    test('should handle missing symbols', async () => {
        mockBarsProvider.getBars.mockResolvedValue({});
        const result = await enrichEod(router, ['AAPL']);
        expect(result['AAPL']).toBeUndefined();
    });
});
