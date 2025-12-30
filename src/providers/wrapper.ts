import { MarketDataProvider, ContextDataProvider } from '../interfaces/index';
import { Quote, Bar, MarketSnapshot, CompanyProfile, NewsItem } from '../models/data';
import { HealthMonitor } from '../routing/health';

export class CircuitOpenError extends Error {
  constructor(providerName: string) {
    super(`Circuit breaker open for provider: ${providerName}`);
    this.name = 'CircuitOpenError';
  }
}

export class ResilientMarketDataProvider implements MarketDataProvider {
  constructor(
    private inner: MarketDataProvider,
    private healthMonitor: HealthMonitor,
    private providerName: string
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.healthMonitor.isHealthy(this.providerName)) {
      throw new CircuitOpenError(this.providerName);
    }
    try {
      const result = await operation();
      this.healthMonitor.recordSuccess(this.providerName);
      return result;
    } catch (error) {
      this.healthMonitor.recordError(this.providerName);
      throw error;
    }
  }

  async getQuotes(symbols: string[]): Promise<Quote[]> {
    return this.execute(() => this.inner.getQuotes(symbols));
  }

  async getBars(symbols: string[], timeframe: string, limit?: number, start?: Date, end?: Date): Promise<Record<string, Bar[]>> {
    return this.execute(() => this.inner.getBars(symbols, timeframe, limit, start, end));
  }

  async getMovers(limit?: number): Promise<MarketSnapshot[]> {
    return this.execute(() => this.inner.getMovers(limit));
  }
}

export class ResilientContextDataProvider implements ContextDataProvider {
  constructor(
    private inner: ContextDataProvider,
    private healthMonitor: HealthMonitor,
    private providerName: string
  ) {}

  private async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.healthMonitor.isHealthy(this.providerName)) {
      throw new CircuitOpenError(this.providerName);
    }
    try {
      const result = await operation();
      this.healthMonitor.recordSuccess(this.providerName);
      return result;
    } catch (error) {
      this.healthMonitor.recordError(this.providerName);
      throw error;
    }
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    return this.execute(() => this.inner.getCompanyProfile(symbol));
  }

  async getFinancialMetrics(symbol: string): Promise<Record<string, any>> {
    return this.execute(() => this.inner.getFinancialMetrics(symbol));
  }

  async getEarningsCalendar(startDate: Date, endDate: Date): Promise<Array<Record<string, any>>> {
    return this.execute(() => this.inner.getEarningsCalendar(startDate, endDate));
  }

  async getNews(symbols: string[], limit?: number): Promise<Record<string, NewsItem[]>> {
    return this.execute(() => this.inner.getNews(symbols, limit));
  }
}
