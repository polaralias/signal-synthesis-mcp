import { ContextDataProvider } from '../interfaces/context-data';
import { CompanyProfile, FinancialMetrics, NewsItem } from '../models/data';

export class FinnhubProvider implements ContextDataProvider {
  private apiKey: string;
  private baseUrl = 'https://finnhub.io/api/v1';

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.FINNHUB_API_KEY || '';
    if (!this.apiKey) {
      console.warn('Finnhub API key not found. Context data will be limited.');
    }
  }

  async getCompanyProfile(symbol: string): Promise<CompanyProfile> {
    if (!this.apiKey) throw new Error('Finnhub API key missing');

    const url = `${this.baseUrl}/stock/profile2?symbol=${symbol}&token=${this.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || Object.keys(data).length === 0) {
       throw new Error(`No profile found for ${symbol}`);
    }

    return {
      symbol: symbol,
      name: data.name,
      sector: data.finnhubIndustry, // Finnhub uses 'finnhubIndustry'
      industry: data.finnhubIndustry, // Mapping sector to industry for now as Finnhub structure is flat
      description: 'N/A', // Finnhub profile2 doesn't always have description
      website: data.weburl,
      employees: undefined, // Not in profile2
    };
  }

  async getFinancialMetrics(symbol: string): Promise<FinancialMetrics> {
    if (!this.apiKey) throw new Error('Finnhub API key missing');

    const url = `${this.baseUrl}/stock/metric?symbol=${symbol}&metric=all&token=${this.apiKey}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.statusText}`);
    }

    const data = await response.json();
    const metrics = data.metric || {};

    return {
        symbol,
        marketCap: metrics['marketCapitalization'] ? metrics['marketCapitalization'] * 1000000 : 0, // Finnhub is in millions
        peRatio: metrics['peBasicExclExtraTTM'],
        dividendYield: metrics['dividendYieldIndicatedAnnual'],
        // Finnhub metric endpoint doesn't always return sharesOutstanding directly in basic,
        // but we fit what we can to the schema.
        sharesOutstanding: undefined,
        floatShares: undefined
    };
  }

  async getNews(symbols: string[], limit: number = 5): Promise<Record<string, NewsItem[]>> {
      if (!this.apiKey) return {};
      const result: Record<string, NewsItem[]> = {};

      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      await Promise.all(symbols.map(async (symbol) => {
          const url = `${this.baseUrl}/company-news?symbol=${symbol}&from=${yesterday}&to=${today}&token=${this.apiKey}`;
          try {
              const response = await fetch(url);
              if (!response.ok) return;

              const data = await response.json();
              result[symbol] = data.slice(0, limit).map((item: any) => ({
                  id: String(item.id),
                  headline: item.headline,
                  summary: item.summary,
                  source: item.source,
                  url: item.url,
                  timestamp: new Date(item.datetime * 1000),
                  sentiment: undefined
              }));
          } catch (e) {
              console.error(`Error fetching news for ${symbol}:`, e);
          }
      }));

      return result;
  }

  async getEarningsCalendar(startDate: Date, endDate: Date): Promise<Array<Record<string, any>>> {
      if (!this.apiKey) return [];

      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];

      const url = `${this.baseUrl}/calendar/earnings?from=${startStr}&to=${endStr}&token=${this.apiKey}`;

      try {
          const response = await fetch(url);
          if (!response.ok) return [];
          const data = await response.json();
          return data.earningsCalendar || [];
      } catch (e) {
          console.error('Error fetching earnings calendar:', e);
          return [];
      }
  }
}
