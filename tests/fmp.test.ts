import { FMPProvider } from '../src/providers/fmp';

// Mock global fetch
global.fetch = jest.fn();

describe('FMPProvider', () => {
  let provider: FMPProvider;

  beforeEach(() => {
    provider = new FMPProvider('key');
    (global.fetch as jest.Mock).mockClear();
  });

  it('should fetch company profile', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ([{
        symbol: 'AAPL',
        companyName: 'Apple Inc.',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        description: 'Apple Inc. designs...',
        website: 'https://www.apple.com',
        fullTimeEmployees: '154000'
      }])
    });

    const profile = await provider.getCompanyProfile('AAPL');
    expect(profile.symbol).toBe('AAPL');
    expect(profile.name).toBe('Apple Inc.');
    expect(profile.employees).toBe(154000);
  });

  it('should fetch financial metrics', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ([{
            symbol: 'AAPL',
            marketCap: 2000000000000,
            netIncomePerShare: 5.61,
            peRatio: 28.5,
            dividendYield: 0.005
        }])
    });

    const metrics = await provider.getFinancialMetrics('AAPL');
    expect(metrics.symbol).toBe('AAPL');
    expect(metrics.marketCap).toBe(2000000000000);
    expect(metrics.peRatio).toBe(28.5);
  });

  it('should fetch earnings calendar', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ([{
              symbol: 'AAPL',
              date: '2024-05-01',
              epsEstimated: 1.50,
              epsActual: 1.52
          }])
      });

      const calendar = await provider.getEarningsCalendar(new Date('2024-01-01'), new Date('2024-12-31'));
      expect(calendar).toHaveLength(1);
      expect(calendar[0].symbol).toBe('AAPL');
      expect(calendar[0].epsActual).toBe(1.52);
  });

  it('should fetch news', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => ([{
              symbol: 'AAPL',
              publishedDate: '2024-01-01T12:00:00.000Z',
              title: 'Apple News',
              image: '',
              site: 'Apple',
              text: 'Some news text',
              url: 'https://example.com/news'
          }])
      });

      const news = await provider.getNews(['AAPL']);
      expect(news['AAPL']).toHaveLength(1);
      expect(news['AAPL'][0].headline).toBe('Apple News');
  });

  it('should handle API errors gracefully', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          statusText: 'Not Found'
      });

      await expect(provider.getCompanyProfile('INVALID')).rejects.toThrow('FMP API error: Not Found');
  });
});
