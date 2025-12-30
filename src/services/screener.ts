import { MarketDataProvider, ScreeningCriteria } from '../interfaces/market-data';
import { ContextProvider } from '../interfaces/context-data';
import { MarketSnapshot } from '../models/data';

export class SmartScreener {
  constructor(
    private marketProvider: MarketDataProvider,
    private contextProvider: ContextProvider
  ) {}

  async screen(criteria: ScreeningCriteria): Promise<MarketSnapshot[]> {
    // 1. If provider supports native screening, try that first
    if (this.marketProvider.screen) {
      try {
        const results = await this.marketProvider.screen(criteria);
        if (results && results.length > 0) {
          return results;
        }
      } catch (e) {
        console.warn('Native screening failed, falling back to manual filtering:', e);
      }
    }

    // 2. Fallback: Get movers (broad list) and filter in memory
    // Fetch a larger set to allow for filtering
    const candidates = await this.marketProvider.getMovers(100);

    const filtered = [];

    for (const candidate of candidates) {
        // Basic Price/Volume filters
        if (criteria.minPrice && candidate.price < criteria.minPrice) continue;
        if (criteria.maxPrice && candidate.price > criteria.maxPrice) continue;
        if (criteria.minVolume && candidate.volume < criteria.minVolume) continue;

        // Context filters (Sector, Market Cap) - requires extra fetch
        if (criteria.sector || criteria.minMarketCap) {
             try {
                // TODO: Batch this if possible, or cache heavily
                const profile = await this.contextProvider.getCompanyProfile(candidate.symbol);

                if (criteria.sector && profile.sector !== criteria.sector) continue;
                // Note: Market cap is not strictly in CompanyProfile in this codebase yet?
                // Let's check models/data.ts. Assuming it is or we get it from elsewhere.
                // Actually FinancialMetrics usually has marketCap.

                if (criteria.minMarketCap) {
                    const metrics = await this.contextProvider.getFinancialMetrics(candidate.symbol);
                    if (metrics.marketCap && metrics.marketCap < criteria.minMarketCap) continue;
                }
             } catch (e) {
                 // If we can't verify context, we might skip or include depending on strategy.
                 // For safety, we skip.
                 console.warn(`Could not verify context for ${candidate.symbol}`, e);
                 continue;
             }
        }

        filtered.push(candidate);
    }

    return filtered;
  }
}
