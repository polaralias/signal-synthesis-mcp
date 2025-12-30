import { MarketDataProvider, ContextDataProvider } from '../interfaces/index';
import { Bar, Quote, MarketSnapshot, CompanyProfile, NewsItem, SentimentData } from '../models/data';

export class MockProvider implements MarketDataProvider, ContextDataProvider {
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return symbols.map(symbol => ({
      symbol,
      bidPrice: 150.00,
      bidSize: 100,
      askPrice: 150.10,
      askSize: 100,
      lastPrice: 150.05,
      lastSize: 50,
      timestamp: new Date(),
      provider: 'mock',
    }));
  }

  async getBars(
    symbols: string[],
    timeframe: string,
    limit?: number,
    start?: Date,
    end?: Date
  ): Promise<Record<string, Bar[]>> {
    const result: Record<string, Bar[]> = {};
    for (const symbol of symbols) {
      result[symbol] = Array.from({ length: limit || 10 }).map((_, i) => ({
        timestamp: new Date(Date.now() - i * 60000),
        open: 150 + i,
        high: 155 + i,
        low: 145 + i,
        close: 152 + i,
        volume: 10000 + i * 100,
        vwap: 151 + i,
      }));
    }
    return result;
  }

  async getMovers(limit?: number): Promise<MarketSnapshot[]> {
    return [
      {
        symbol: 'AAPL',
        price: 150.00,
        changePercent: 1.5,
        volume: 50000000,
        description: 'Apple Inc.',
        source: 'mock',
      },
      {
        symbol: 'TSLA',
        price: 250.00,
        changePercent: -2.0,
        volume: 30000000,
        description: 'Tesla, Inc.',
        source: 'mock',
      },
    ];
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    return {
      symbol,
      name: 'Mock Company',
      sector: 'Technology',
      industry: 'Software',
      description: 'A mock company for testing.',
      website: 'https://example.com',
      employees: 1000,
    };
  }

  async getFinancialMetrics(symbol: string): Promise<Record<string, any>> {
    return {
      symbol,
      marketCap: 2000000000000,
      sharesOutstanding: 16000000000,
      floatShares: 15000000000,
      peRatio: 30,
      dividendYield: 0.005,
      earningsDate: new Date('2024-05-01'),
    };
  }

  async getEarningsCalendar(
    startDate: Date,
    endDate: Date
  ): Promise<Array<Record<string, any>>> {
    return [
      {
        symbol: 'AAPL',
        date: '2024-05-01',
        epsEstimate: 1.50,
        epsActual: null,
      },
    ];
  }

  async getNews(
    symbols: string[],
    limit?: number
  ): Promise<Record<string, NewsItem[]>> {
    const result: Record<string, NewsItem[]> = {};
    for (const symbol of symbols) {
      result[symbol] = [
        {
          id: '1',
          headline: `${symbol} hits all-time high`,
          summary: 'The stock price surged today...',
          source: 'mock-news',
          url: 'https://example.com/news/1',
          timestamp: new Date(),
          sentiment: 0.8,
        },
      ];
    }
    return result;
  }

  async getSentiment(symbol: string): Promise<SentimentData> {
      return {
          symbol,
          score: 0.5,
          label: 'Bullish',
          source: 'mock',
          confidence: 0.9
      };
  }
}
