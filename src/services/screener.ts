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

    // Basic Price/Volume filters first
    const basicFiltered = candidates.filter(candidate => {
        if (criteria.minPrice && candidate.price < criteria.minPrice) return false;
        if (criteria.maxPrice && candidate.price > criteria.maxPrice) return false;
        if (criteria.minVolume && candidate.volume < criteria.minVolume) return false;
        return true;
    });

    if (!criteria.sector && !criteria.minMarketCap) {
        return basicFiltered;
    }

    const filtered: MarketSnapshot[] = [];

    // Process in batches to avoid overwhelming the provider
    const BATCH_SIZE = 10;
    for (let i = 0; i < basicFiltered.length; i += BATCH_SIZE) {
        const batch = basicFiltered.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (candidate) => {
            try {
                let keep = true;

                if (criteria.sector) {
                    const profile = await this.contextProvider.getCompanyProfile(candidate.symbol);
                    if (profile.sector !== criteria.sector) keep = false;
                }

                if (keep && criteria.minMarketCap) {
                    const metrics = await this.contextProvider.getFinancialMetrics(candidate.symbol);
                    if (metrics.marketCap && metrics.marketCap < criteria.minMarketCap) keep = false;
                }

                if (keep) {
                    filtered.push(candidate);
                }
            } catch (e) {
                console.warn(`Could not verify context for ${candidate.symbol}`, e);
            }
        }));
    }

    return filtered;
  }
}
