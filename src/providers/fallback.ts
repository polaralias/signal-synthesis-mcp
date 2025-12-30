import { MarketDataProvider, ContextDataProvider } from '../interfaces/index';
import { Quote, Bar, MarketSnapshot, CompanyProfile, NewsItem } from '../models/data';

export class FallbackMarketDataProvider implements MarketDataProvider {
  constructor(private providers: MarketDataProvider[]) {}

  private async execute<T>(operation: (provider: MarketDataProvider) => Promise<T>): Promise<T> {
    let lastError: any;
    for (const provider of this.providers) {
      try {
        return await operation(provider);
      } catch (error) {
        lastError = error;
        // Continue to next provider
        continue;
      }
    }
    throw lastError || new Error('No providers available');
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return this.execute(p => p.getQuotes(symbols));
  }

  async getBars(symbols: string[], timeframe: string, limit?: number, start?: Date, end?: Date): Promise<Record<string, Bar[]>> {
    return this.execute(p => p.getBars(symbols, timeframe, limit, start, end));
  }

  async getMovers(limit?: number): Promise<MarketSnapshot[]> {
    return this.execute(p => p.getMovers(limit));
  }
}

export class FallbackContextDataProvider implements ContextDataProvider {
  constructor(private providers: ContextDataProvider[]) {}

  private async execute<T>(operation: (provider: ContextDataProvider) => Promise<T>): Promise<T> {
    let lastError: any;
    for (const provider of this.providers) {
      try {
        return await operation(provider);
      } catch (error) {
        lastError = error;
        continue;
      }
    }
    throw lastError || new Error('No providers available');
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    return this.execute(p => p.getCompanyProfile(symbol));
  }

  async getFinancialMetrics(symbol: string): Promise<Record<string, any>> {
    return this.execute(p => p.getFinancialMetrics(symbol));
  }

  async getEarningsCalendar(startDate: Date, endDate: Date): Promise<Array<Record<string, any>>> {
    return this.execute(p => p.getEarningsCalendar(startDate, endDate));
  }

  async getNews(symbols: string[], limit?: number): Promise<Record<string, NewsItem[]>> {
    return this.execute(p => p.getNews(symbols, limit));
  }
}
