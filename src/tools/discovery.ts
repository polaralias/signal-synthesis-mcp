import { Router } from '../routing/index';
import { MarketSnapshot } from '../models/data';

export async function discoverCandidates(
  router: Router,
  intent: 'day_trade' | 'swing' | 'long_term' = 'day_trade',
  limit: number = 20
): Promise<MarketSnapshot[]> {
  const provider = router.getDiscoveryProvider();

  if (intent === 'day_trade') {
    // For day trade, we want active movers (gainers/volatility)
    const candidates = await provider.getMovers(limit * 2);
    return candidates
      .filter(c => c.price > 1 && c.volume > 100000) // Ensure basic liquidity and price
      .slice(0, limit);
  } else {
    // For swing/long_term, ideally we'd use a screener (marketCap > X, Volume > Y)
    // But current MVP providers (Alpaca/Polygon/FMP) implementation of "Screener" isn't fully unified in `getMovers`.
    // Polygon `getMovers` returns gainers.
    // For now, we fallback to getMovers for all intents, but we filter out very low price stocks
    // to simulate a basic screener for quality.

    const candidates = await provider.getMovers(limit * 2); // Fetch more to allow for filtering

    return candidates
      .filter(c => c.price > 5 && c.volume > 50000) // Avoid penny stocks and illiquid stocks
      .slice(0, limit);
  }
}
