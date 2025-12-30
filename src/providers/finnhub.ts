import { ContextDataProvider } from '../interfaces/context-data';
import { CompanyProfile, FinancialMetrics, NewsItem, SentimentData } from '../models/data';

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

  async getSentiment(symbol: string): Promise<SentimentData> {
      // Try to use News Sentiment endpoint first
      if (!this.apiKey) return this.getDefaultSentiment(symbol);

      const url = `${this.baseUrl}/news-sentiment?symbol=${symbol}&token=${this.apiKey}`;

      try {
          const response = await fetch(url);
          if (response.ok) {
             const data = await response.json();
             // Finnhub sentiment object: { buzz: {}, companyNewsScore: 0.5, sectorAverageBullishPercent: 0.6, sentiment: { bearishPercent: 0.1, bullishPercent: 0.7 } }
             if (data && data.sentiment) {
                 const bullish = data.sentiment.bullishPercent;
                 const bearish = data.sentiment.bearishPercent;
                 const score = bullish - bearish; // Rough score -1 to 1

                 let label: SentimentData['label'] = 'Neutral';
                 if (score > 0.5) label = 'Bullish';
                 else if (score > 0.1) label = 'Somewhat Bullish';
                 else if (score < -0.5) label = 'Bearish';
                 else if (score < -0.1) label = 'Somewhat Bearish';

                 return {
                     symbol,
                     score,
                     label,
                     source: 'Finnhub News Sentiment',
                     confidence: data.sectorAverageBullishPercent // Use sector average as a proxy for confidence/relevance? Or just undefined.
                 };
             }
          }
      } catch (e) {
         console.warn(`Error fetching Finnhub sentiment for ${symbol}, falling back to headline analysis`, e);
      }

      // Fallback: Analyze recent news headlines
      const news = await this.getNews([symbol], 10);
      const items = news[symbol] || [];
      if (items.length === 0) return this.getDefaultSentiment(symbol);

      let score = 0;
      const positiveWords = ['beat', 'rise', 'up', 'growth', 'profit', 'gain', 'buy', 'bull', 'upgrade'];
      const negativeWords = ['miss', 'fall', 'down', 'loss', 'drop', 'sell', 'bear', 'downgrade', 'weak'];

      items.forEach(item => {
          const text = (item.headline + ' ' + (item.summary || '')).toLowerCase();
          positiveWords.forEach(w => {
              const regex = new RegExp(`\\b${w}\\b`, 'i');
              if (regex.test(text)) score += 0.1;
          });
          negativeWords.forEach(w => {
              const regex = new RegExp(`\\b${w}\\b`, 'i');
              if (regex.test(text)) score -= 0.1;
          });
      });

      // Clamp score -1 to 1
      score = Math.max(-1, Math.min(1, score));

      let label: SentimentData['label'] = 'Neutral';
      if (score > 0.3) label = 'Bullish';
      else if (score > 0.05) label = 'Somewhat Bullish';
      else if (score < -0.3) label = 'Bearish';
      else if (score < -0.05) label = 'Somewhat Bearish';

      return {
          symbol,
          score,
          label,
          source: 'Headline Analysis',
          confidence: 0.5 // Low confidence for basic keyword matching
      };
  }

  private getDefaultSentiment(symbol: string): SentimentData {
      return {
          symbol,
          score: 0,
          label: 'Neutral',
          source: 'Default'
      };
  }
}
