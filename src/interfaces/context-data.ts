import { CompanyProfile, NewsItem, SentimentData } from '../models/data';

export interface ContextDataProvider {
  /**
   * Get profile data: Sector, Industry, Description, Employees, etc.
   */
  getCompanyProfile(symbol: string): Promise<CompanyProfile>;

  /**
   * Get key metrics: Market Cap, Float, PE, EPS, Dividend Yield.
   */
  getFinancialMetrics(symbol: string): Promise<Record<string, any>>;

  /**
   * Get earnings announcements for a date range.
   */
  getEarningsCalendar(
    startDate: Date,
    endDate: Date
  ): Promise<Array<Record<string, any>>>;

  /**
   * Get recent news headlines for symbols.
   */
  getNews(
    symbols: string[],
    limit?: number // default 5
  ): Promise<Record<string, NewsItem[]>>;

  /**
   * Get sentiment data for a symbol.
   */
  getSentiment(symbol: string): Promise<SentimentData>;
}
