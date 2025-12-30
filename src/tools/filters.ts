import { Router } from '../routing/index';
import { MarketSnapshot } from '../models/data';

export interface FilterResult {
  validSymbols: string[];
  rejections: Array<{ symbol: string; reason: string }>;
}

export async function filterTradeable(
  router: Router,
  candidates: MarketSnapshot[] | string[]
): Promise<FilterResult> {
  const quotesProvider = router.getQuotesProvider();

  // Normalize input to symbol list
  const symbols = candidates.map((c) => (typeof c === 'string' ? c : c.symbol));

  // Fetch quotes
  const quotes = await quotesProvider.getQuotes(symbols);
  const quotesMap = new Map(quotes.map((q) => [q.symbol, q]));

  const validSymbols: string[] = [];
  const rejections: Array<{ symbol: string; reason: string }> = [];

  for (const symbol of symbols) {
    const quote = quotesMap.get(symbol);

    if (!quote) {
      rejections.push({ symbol, reason: 'No quote data available' });
      continue;
    }

    // Check 1: Price > $1.00 (Avoid penny stocks for standard strategies)
    // Use lastPrice, or mid price if last not available
    const price = quote.lastPrice || (quote.askPrice + quote.bidPrice) / 2;
    if (price < 1.0) {
      rejections.push({ symbol, reason: `Price too low: $${price.toFixed(2)}` });
      continue;
    }

    // Check 2: Spread < 0.5%
    // Spread = (Ask - Bid) / Bid
    // If bid is 0 (shouldn't happen for valid stocks), skip
    if (quote.bidPrice > 0) {
        const spread = (quote.askPrice - quote.bidPrice) / quote.bidPrice;
        if (spread > 0.005) {
             rejections.push({ symbol, reason: `Spread too wide: ${(spread * 100).toFixed(2)}%` });
             continue;
        }
    } else {
        rejections.push({ symbol, reason: 'Invalid bid price (0)' });
        continue;
    }

    // Check 3: Volume
    // If we have access to volume from the quote (some providers might enrich it) or the snapshot
    // For now, quote doesn't strictly guarantee 24h volume.
    // If input was MarketSnapshot, we might have volume there.
    let volume = 0;
    if (typeof candidates[0] !== 'string') {
        const snapshot = (candidates as MarketSnapshot[]).find(c => c.symbol === symbol);
        if (snapshot) volume = snapshot.volume;
    }

    // If volume is known and very low (e.g. < 100k), might be illiquid.
    // But discovery usually returns active movers, so they should have volume.
    // We'll skip strict volume check here unless we are sure we have the data,
    // to avoid false negatives if Quote doesn't carry volume.

    validSymbols.push(symbol);
  }

  return { validSymbols, rejections };
}
