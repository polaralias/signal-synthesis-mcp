import { Router } from '../routing/index';
import { MarketSnapshot } from '../models/data';
import { ScreeningCriteria } from '../interfaces/market-data';
import { SmartScreener } from '../services/screener';

export async function discoverCandidates(
  router: Router,
  intent: 'day_trade' | 'swing' | 'long_term' = 'day_trade',
  limit: number = 20,
  criteria?: ScreeningCriteria
): Promise<MarketSnapshot[]> {
  const discoveryProvider = router.getDiscoveryProvider();
  const contextProvider = router.getContextProvider();
  const screener = new SmartScreener(discoveryProvider, contextProvider);

  let searchCriteria: ScreeningCriteria = criteria || {};

  if (intent === 'day_trade') {
     // Default day trade criteria if not specified
     if (!searchCriteria.minPrice) searchCriteria.minPrice = 1;
     if (!searchCriteria.minVolume) searchCriteria.minVolume = 100000;
  } else {
     // Swing/Long term defaults
     if (!searchCriteria.minPrice) searchCriteria.minPrice = 5;
     if (!searchCriteria.minVolume) searchCriteria.minVolume = 50000;
     // if (!searchCriteria.minMarketCap) searchCriteria.minMarketCap = 100000000; // 100M
  }

  const results = await screener.screen(searchCriteria);
  return results.slice(0, limit);
}
