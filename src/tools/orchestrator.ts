import { Router } from '../routing/index';
import { discoverCandidates } from './discovery';
import { filterTradeable } from './filters';
import { enrichIntraday, enrichContext, enrichEod, EodStats } from './enrichment';
import { rankSetups } from './ranking';
import { TradeSetup } from '../models/data';
import { prisma } from '../services/database';

export interface PlanResult {
  intent: string;
  timestamp: string;
  candidatesFound: number;
  candidatesFiltered: number;
  setups: TradeSetup[];
}

export async function planAndRun(
  router: Router,
  intent: 'day_trade' | 'swing' | 'long_term' = 'day_trade'
): Promise<PlanResult> {
  // 1. Discovery
  console.log(`[Orchestrator] Starting discovery for ${intent}...`);
  const candidates = await discoverCandidates(router, intent);
  console.log(`[Orchestrator] Found ${candidates.length} candidates.`);

  // 2. Filter
  console.log(`[Orchestrator] Filtering candidates...`);
  const filterResult = await filterTradeable(router, candidates);
  const validSymbols = filterResult.validSymbols;
  console.log(`[Orchestrator] ${validSymbols.length} valid symbols passed filtering.`);

  if (validSymbols.length === 0) {
    return {
      intent,
      timestamp: new Date().toISOString(),
      candidatesFound: candidates.length,
      candidatesFiltered: 0,
      setups: [],
    };
  }

  // 3. Enrichment
  console.log(`[Orchestrator] Enriching data for ${validSymbols.length} symbols...`);

  const promises: [Promise<any>, Promise<any>] = [
      enrichIntraday(router, validSymbols),
      enrichContext(router, validSymbols)
  ];

  let eodData: Record<string, EodStats> = {};

  if (intent === 'swing' || intent === 'long_term') {
      console.log(`[Orchestrator] Fetching EOD data for ${intent}...`);
      const eodResult = await enrichEod(router, validSymbols);
      eodData = eodResult;
  }

  const [intradayData, contextData] = await Promise.all(promises);

  // 4. Ranking
  console.log(`[Orchestrator] Ranking setups...`);

  const setups = rankSetups(intradayData, contextData, eodData);

  // 5. Persistence
  if (setups.length > 0) {
    console.log(`[Orchestrator] Persisting ${setups.length} setups to database...`);
    try {
      await prisma.tradeSetup.createMany({
        data: setups.map(s => ({
          symbol: s.symbol,
          setupType: s.setupType,
          triggerPrice: s.triggerPrice,
          stopLoss: s.stopLoss,
          targetPrice: s.targetPrice || null,
          confidence: s.confidence,
          reasoning: s.reasoning,
          validUntil: s.validUntil,
          intent: intent
        }))
      });
      console.log(`[Orchestrator] Successfully saved setups.`);
    } catch (error) {
      console.error(`[Orchestrator] Failed to save setups:`, error);
      // We don't throw here to ensure we return the result even if persistence fails
    }
  }

  return {
    intent,
    timestamp: new Date().toISOString(),
    candidatesFound: candidates.length,
    candidatesFiltered: validSymbols.length,
    setups,
  };
}
