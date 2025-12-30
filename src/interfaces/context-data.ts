import { CompanyProfile, NewsItem } from '../models/data';

export interface ContextDataProvider {
  getCompanyProfile(symbol: string): Promise<CompanyProfile>;
  /**
   * Get profile data: Sector, Industry, Description, Employees, etc.
   */

  getFinancialMetrics(symbol: string): Promise<Record<string, any>>;
  /**
   * Get key metrics: Market Cap, Float, PE, EPS, Dividend Yield.
   */

  getEarningsCalendar(
    startDate: Date,
    endDate: Date
  ): Promise<Array<Record<string, any>>>;
  /**
   * Get earnings announcements for a date range.
   */

  getNews(
    symbols: string[],
    limit?: number // default 5
  ): Promise<Record<string, NewsItem[]>>;
  /**
   * Get recent news headlines for symbols.
   */
}
