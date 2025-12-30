import { FinnhubProvider } from '../src/providers/finnhub.js';

// Mock fetch globally
global.fetch = jest.fn();

describe('FinnhubProvider', () => {
  let provider: FinnhubProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new FinnhubProvider('test-key');
  });

  describe('getCompanyProfile', () => {
    it('should fetch and map profile data correctly', async () => {
      const mockResponse = {
        name: 'Apple Inc',
        finnhubIndustry: 'Technology',
        weburl: 'https://apple.com',
        country: 'US',
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const profile = await provider.getCompanyProfile('AAPL');

      expect(profile.symbol).toBe('AAPL');
      expect(profile.name).toBe('Apple Inc');
      expect(profile.sector).toBe('Technology');
      expect(profile.website).toBe('https://apple.com');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('finnhub.io/api/v1/stock/profile2?symbol=AAPL')
      );
    });

    it('should throw error if API key is missing', async () => {
      const noKeyProvider = new FinnhubProvider('');
      await expect(noKeyProvider.getCompanyProfile('AAPL')).rejects.toThrow('Finnhub API key missing');
    });

    it('should throw error on empty response (invalid symbol)', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      await expect(provider.getCompanyProfile('INVALID')).rejects.toThrow('No profile found for INVALID');
    });
  });

  describe('getFinancialMetrics', () => {
    it('should fetch and map metrics correctly', async () => {
      const mockResponse = {
        metric: {
          marketCapitalization: 3000000, // 3T
          peBasicExclExtraTTM: 28.5,
          beta: 1.2,
          dividendYieldIndicatedAnnual: 0.5,
          epsTTM: 6.5,
          netProfitMarginTTM: 25.0,
        },
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const metrics = await provider.getFinancialMetrics('AAPL');

      expect(metrics.marketCap).toBe(3000000 * 1000000);
      expect(metrics.peRatio).toBe(28.5);
    });
  });
});
