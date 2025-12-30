import { FallbackMarketDataProvider } from '../src/providers/fallback';
import { MarketDataProvider } from '../src/interfaces/market-data';
import { Quote, Bar, MarketSnapshot } from '../src/models/data';

// Mock Provider Implementation for testing
class MockTestProvider implements MarketDataProvider {
  constructor(private name: string, private shouldFail: boolean = false) {}

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    if (this.shouldFail) {
      throw new Error(`${this.name} failed`);
    }
    return symbols.map(s => ({
      symbol: s,
      bidPrice: 100,
      bidSize: 100,
      askPrice: 101,
      askSize: 100,
      lastPrice: 100.5,
      lastSize: 10,
      timestamp: new Date(),
      provider: this.name
    }));
  }

  async getBars(symbols: string[], timeframe: string): Promise<Record<string, Bar[]>> {
    if (this.shouldFail) throw new Error(`${this.name} failed`);
    return {};
  }

  async getMovers(): Promise<MarketSnapshot[]> {
    if (this.shouldFail) throw new Error(`${this.name} failed`);
    return [];
  }
}

describe('FallbackMarketDataProvider', () => {
  it('should use the primary provider if it succeeds', async () => {
    const primary = new MockTestProvider('primary', false);
    const secondary = new MockTestProvider('secondary', false);
    const fallback = new FallbackMarketDataProvider([primary, secondary]);

    const quotes = await fallback.getQuotes(['AAPL']);
    expect(quotes[0].provider).toBe('primary');
  });

  it('should fallback to secondary provider if primary fails', async () => {
    const primary = new MockTestProvider('primary', true); // Fails
    const secondary = new MockTestProvider('secondary', false);
    const fallback = new FallbackMarketDataProvider([primary, secondary]);

    const quotes = await fallback.getQuotes(['AAPL']);
    expect(quotes[0].provider).toBe('secondary');
  });

  it('should throw error if all providers fail', async () => {
    const primary = new MockTestProvider('primary', true);
    const secondary = new MockTestProvider('secondary', true);
    const fallback = new FallbackMarketDataProvider([primary, secondary]);

    await expect(fallback.getQuotes(['AAPL'])).rejects.toThrow('secondary failed');
  });
});
