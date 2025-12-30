# Tools & Pipeline Specification

This document details the logic for the specific MCP tools and the Orchestrator.

## 1. `discoverCandidates`

**Goal**: Get a list of potential symbols.

**Inputs**:
*   `intent`: "day_trade", "swing", "long_term" (optional)
*   `limit`: default 20

**Logic**:
1.  Get `DiscoveryProvider` from Router.
2.  If `intent` == "day_trade":
    *   Call `provider.getMovers()` (Gainers, High Volume).
3.  If `intent` == "swing" / "long_term":
    *   Call `provider.getScreener(marketCap > 1B, volume > 1M)` (if available, else fallback to movers).
4.  Normalize to `MarketSnapshot[]`.
5.  Return list.

## 2. `filterTradeable`

**Goal**: Remove untradeable garbage.

**Inputs**:
*   `candidates`: List of symbols/snapshots.

**Logic**:
1.  Get `QuotesProvider`.
2.  Fetch quotes for all symbols.
3.  Loop through candidates:
    *   **Check 1**: Price > $1.00 (unless penny stock mode).
    *   **Check 2**: Spread < 0.5% (Calculate `(ask-bid)/bid`).
    *   **Check 3**: Volume (if available in quote/snapshot) > Threshold.
4.  Return `string[]` (valid symbols) and `Array<{symbol: string, reason: string}>` (rejections).

## 3. `enrichIntraday`

**Goal**: Add technical stats for short-term decisions.

**Inputs**:
*   `symbols`: string[]

**Logic**:
1.  Get `BarsProvider`.
2.  Fetch 1-minute bars (last ~200 bars).
3.  For each symbol:
    *   Calculate **VWAP** (Volume Weighted Average Price).
    *   Calculate **RVOL** (Relative Volume) if history allows. *MVP: Skip or simple volume ratio.*
    *   Calculate **ATR** (Average True Range).
4.  Return Dictionary mapping symbol to stats + bars.

## 4. `enrichContext`

**Goal**: Add fundamental context.

**Inputs**:
*   `symbols`: string[]

**Logic**:
1.  Get `ContextProvider`.
2.  Fetch `CompanyProfile` (Sector, Industry).
3.  Fetch `FinancialMetrics` (Float, Market Cap).
4.  Fetch `Earnings` (Is earnings today/tomorrow?).
5.  Return enriched data.

## 5. `rankSetups`

**Goal**: Score and rank the final list.

**Inputs**:
*   `enrichedData`: Result of enrichment steps.

**Logic**:
1.  Define simple scoring function:
    *   `score = 0`
    *   If `price > vwap`: `score += 1`
    *   If `volume > avgVolume`: `score += 1`
    *   If `sector` matches hot sector: `score += 1`
2.  Identify "Setups":
    *   **Bullish Trend**: Price > VWAP & Price > EMA(20).
    *   **Mean Reversion**: Price < Lower Bollinger Band.
3.  Sort by score.
4.  Return top N results as `TradeSetup` objects.

## 6. `planAndRun` (Orchestrator)

**Goal**: The brain.

**Inputs**:
*   `userQuery`: string

**Logic**:
1.  **Analyze Intent**:
    *   Contains "day", "today", "intraday"? -> **Day Trade**.
    *   Contains "swing", "week"? -> **Swing**.
    *   Contains "invest", "long term"? -> **Long Term**.
    *   Default: Day Trade.
2.  **Initialize Route**: `router.planRoute()`.
3.  **Execute Pipeline** (Day Trade Example):
    *   `candidates = discoverCandidates(...)`
    *   `validSymbols, _ = filterTradeable(candidates)`
    *   `intradayData = enrichIntraday(validSymbols)`
    *   `contextData = enrichContext(validSymbols)`
    *   `results = rankSetups(intradayData, contextData)`
4.  **Format Output**:
    *   Construct `PlanAndRunResponse`.
    *   Include "Why": "Chosen because X, Y, Z."
    *   Include "Risks": "Earnings tomorrow."
    *   Include Provenance: "Data from Polygon & FMP."

## 7. `explainRouting` (Debug Tool)

**Goal**: Transparency.

**Logic**:
1.  Return current configuration.
2.  Return `router.health` state.
3.  Return last used route context (if stored).
