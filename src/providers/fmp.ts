import { ContextDataProvider } from '../interfaces/context-data';
import { CompanyProfile, NewsItem } from '../models/data';

interface FMPProfile {
  symbol: string;
  companyName: string;
  sector: string;
  industry: string;
  description: string;
  website: string;
  fullTimeEmployees: string; // FMP returns this as string "154000"
}

interface FMPKeyMetrics {
  symbol: string;
  marketCap: number;
  netIncomePerShare: number; // EPS
  peRatio: number;
  dividendYield: number;
}

interface FMPEarning {
  symbol: string;
  date: string;
  epsEstimated: number;
  epsActual: number;
}

interface FMPStockNews {
  symbol: string;
  publishedDate: string;
  title: string;
  image: string;
  site: string;
  text: string;
  url: string;
}

export class FMPProvider implements ContextDataProvider {
  private baseUrl = 'https://financialmodelingprep.com/api/v3';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get suffix() {
    return `apikey=${this.apiKey}`;
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    try {
      const res = await fetch(`${this.baseUrl}/profile/${symbol}?${this.suffix}`);
      if (!res.ok) throw new Error(`FMP API error: ${res.statusText}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const p = data[0] as FMPProfile;
        return {
          symbol: p.symbol,
          name: p.companyName,
          sector: p.sector,
          industry: p.industry,
          description: p.description,
          website: p.website,
          employees: parseInt(p.fullTimeEmployees) || undefined,
        };
      }
      throw new Error(`No profile found for ${symbol}`);
    } catch (error) {
      console.error(`Error fetching FMP profile for ${symbol}:`, error);
      throw error;
    }
  }

  async getFinancialMetrics(symbol: string): Promise<Record<string, any>> {
    // We can use Key Metrics or Ratios. Key Metrics is good.
    try {
      // Fetch quote for Market Cap and Shares Outstanding (sometimes better there) or Key Metrics
      // Let's use Quote for MarketCap and SharesOutstanding, and Key Metrics for others?
      // Or just Key Metrics.
      // https://financialmodelingprep.com/api/v3/key-metrics-ttm/AAPL

      const res = await fetch(`${this.baseUrl}/key-metrics-ttm/${symbol}?${this.suffix}`);
      if (!res.ok) throw new Error(`FMP API error: ${res.statusText}`);
      const data = await res.json();

      if (Array.isArray(data) && data.length > 0) {
        const m = data[0] as FMPKeyMetrics;
        return {
            symbol,
            marketCap: m.marketCap,
            peRatio: m.peRatio,
            dividendYield: m.dividendYield,
            // FMP often returns sharesOutstanding in 'enterprise-values' or 'profile' or 'quote'
            // We can leave sharesOutstanding undefined if not easily available in this single call for now.
        };
      }
      return { symbol };
    } catch (error) {
      console.error(`Error fetching FMP metrics for ${symbol}:`, error);
      return { symbol };
    }
  }

  async getEarningsCalendar(
    startDate: Date,
    endDate: Date
  ): Promise<Array<Record<string, any>>> {
    try {
        const from = startDate.toISOString().split('T')[0];
        const to = endDate.toISOString().split('T')[0];
        const res = await fetch(`${this.baseUrl}/earning_calendar?from=${from}&to=${to}&${this.suffix}`);

        if (!res.ok) throw new Error(`FMP API error: ${res.statusText}`);
        const data = await res.json();

        // FMP earning calendar is an array of objects
        return (data as FMPEarning[]).map(e => ({
            symbol: e.symbol,
            date: e.date,
            epsEstimate: e.epsEstimated,
            epsActual: e.epsActual
        }));
    } catch (error) {
        console.error('Error fetching FMP earnings calendar:', error);
        return [];
    }
  }

  async getNews(
    symbols: string[],
    limit: number = 5
  ): Promise<Record<string, NewsItem[]>> {
    const result: Record<string, NewsItem[]> = {};
    if (symbols.length === 0) return result;

    const symbolsParam = symbols.join(',');
    try {
        const res = await fetch(`${this.baseUrl}/stock_news?tickers=${symbolsParam}&limit=${limit}&${this.suffix}`);
        if (!res.ok) throw new Error(`FMP API error: ${res.statusText}`);
        const data = await res.json();

        // FMP returns a flat list of news for requested tickers
        // We need to group them by symbol
        const newsList = data as FMPStockNews[];

        for (const symbol of symbols) {
            result[symbol] = [];
        }

        for (const item of newsList) {
            if (result[item.symbol]) {
                result[item.symbol].push({
                    id: item.url, // using URL as ID
                    headline: item.title,
                    summary: item.text,
                    source: item.site,
                    url: item.url,
                    timestamp: new Date(item.publishedDate),
                    sentiment: undefined // FMP news doesn't have explicit sentiment score in this endpoint
                });
            }
        }
    } catch (error) {
        console.error('Error fetching FMP news:', error);
    }
    return result;
  }
}
