import { describe, expect, test } from '@jest/globals';
import { explainRouting } from '../src/tools/debug.js';
import { Router } from '../src/routing/router.js';

describe('explainRouting', () => {
    test('should return routing configuration', () => {
        const router = new Router();
        const info = explainRouting(router);

        expect(info.config).toBeDefined();
        expect(info.activeProviders).toBeDefined();

        // Check structure
        expect(info.config).toHaveProperty('discovery');
        expect(info.config).toHaveProperty('quotes');
        expect(info.config).toHaveProperty('bars');
        expect(info.config).toHaveProperty('context');

        // Since default is mock, and caching is enabled by default now
        expect(info.activeProviders.quotes).toContain('CachingMarketDataProvider');
    });
});
