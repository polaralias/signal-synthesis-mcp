import { FinnhubProvider } from '../src/providers/finnhub';
import { NewsItem } from '../src/models/data';

// Mock fetch
global.fetch = jest.fn();

describe('FinnhubProvider Sentiment', () => {
  let provider: FinnhubProvider;

  beforeEach(() => {
    provider = new FinnhubProvider('mock-key');
    (global.fetch as jest.Mock).mockClear();
  });

  test('getSentiment uses News Sentiment API when available', async () => {
    const mockResponse = {
        sentiment: {
            bullishPercent: 0.8,
            bearishPercent: 0.1
        },
        sectorAverageBullishPercent: 0.6
    };

    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse
    });

    const sentiment = await provider.getSentiment('AAPL');

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/news-sentiment?symbol=AAPL'));
    expect(sentiment.score).toBeCloseTo(0.7); // 0.8 - 0.1
    expect(sentiment.label).toBe('Bullish');
    expect(sentiment.source).toBe('Finnhub News Sentiment');
  });

  test('getSentiment falls back to headline analysis on API failure', async () => {
      // First call fails (News Sentiment)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: false,
          statusText: 'Forbidden'
      });

      // Second call (Company News) succeeds
      const mockNews = [
          {
              id: '1',
              headline: 'Apple reports record profit and huge gain',
              datetime: 1600000000,
              source: 'CNBC',
              url: 'http://example.com'
          },
          {
            id: '2',
            headline: 'Analysts upgrade AAPL to buy',
            datetime: 1600000000,
            source: 'Bloomberg',
            url: 'http://example.com'
        }
      ];

      (global.fetch as jest.Mock).mockResolvedValueOnce({
          ok: true,
          json: async () => mockNews
      });

      const sentiment = await provider.getSentiment('AAPL');

      expect(global.fetch).toHaveBeenCalledTimes(2); // Sentiment API then News API
      expect(sentiment.source).toBe('Headline Analysis');
      // "profit", "gain", "upgrade", "buy" -> 4 positive words -> 0.4 score
      expect(sentiment.score).toBeGreaterThan(0);
      expect(sentiment.label).toBe('Bullish');
  });

  test('getSentiment returns neutral default when no data found', async () => {
    // First call fails
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });
    // Second call returns empty news
    (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => []
    });

    const sentiment = await provider.getSentiment('AAPL');
    expect(sentiment.label).toBe('Neutral');
    expect(sentiment.score).toBe(0);
  });
});
