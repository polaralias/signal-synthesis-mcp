## 1) Target outcome

You want to be able to ask an LLM:

* “What stocks look good to day trade today?” (optionally including premarket)
* “What looks good for swing trades over 2–6 weeks?”
* “What are good long-term opportunities?”

…and have the system:

1. Discover candidates (market-wide discovery, including penny/small caps if you choose)
2. Filter for tradeability / sanity
3. Pull the right data for the horizon (intraday or daily/weekly)
4. Add slow-moving context (earnings, float, corporate actions, optionally headlines)
5. Rank and explain in a structured, auditable way
6. Route API usage across providers intelligently to reduce quota burn and handle failures

You then execute trades manually (at least initially), using the output as decision support.

---

## 2) High-level architecture

### Components

1. **MCP Server**

   * Exposes “tools” (functions) to the LLM
   * Contains provider clients, routing logic, caching, and data normalisation
   * Returns structured JSON outputs with provenance

2. **Provider Clients**

   * Alpaca, Polygon, Twelve Data (market data)
   * FMP, Finnhub (context)
   * Each client implements a common internal interface

3. **Routing Engine**

   * Chooses the best provider per “job” (Discovery / Quotes / Bars / Context)
   * Uses “strength-based” preferences plus dynamic quota/health state
   * Maintains stickiness per run

4. **Cache Layer**

   * Short TTL caches for intraday quotes and bars
   * Long TTL caches for context and universe metadata
   * Also caches symbol mappings and “universe” snapshots

5. **Feature Engine**

   * Computes indicators and derived measures
   * Ensures the LLM sees consistent, comparable fields

6. **Orchestrator**

   * A single high-level tool (`plan_and_run`) that:

     * Extracts intent from the user prompt
     * Selects the pipeline and parameters
     * Calls the underlying tools in the right order
     * Returns a final shortlist and explanation bundle

### Data stores (recommended)

* **Redis** (or in-memory cache initially): short TTL caching, rate-limit protection
* **Postgres** (optional initially): long-lived universe/context storage, trade logs, evaluation

You can start with just in-memory + simple file persistence, then move to Redis/Postgres as needed.

---

## 3) Provider strategy (defaults + fallbacks + “strength routing”)

### Provider jobs

Define four “jobs” that the router allocates independently:

* **Discovery**: movers, gainers/losers, unusual volume lists, candidate generation
* **Quotes**: bid/ask, spread, last price checks for tradeability
* **Bars**: intraday 1m bars (including extended hours if requested) and/or daily bars
* **Context**: earnings calendar, float/shares, splits/dividends, sector/industry, optional news

### Strength-based default mapping (when users provide multiple keys)

A good starting point for low cost and spreading load:

* **Discovery**: Polygon (good snapshot/movers style discovery)
* **Quotes**: Alpaca (streaming quotes is efficient for repeated checks)
* **Bars**: Polygon or Alpaca (choose based on user budget and your observed call costs)
* **Context**: FMP (calendar/fundamentals) with Finnhub fallback

If the user config includes many keys, the router should prefer “best tool for the job” rather than using one provider everywhere.

### Dynamic quota/health switching

For each provider:

* Track recent error types (429, 5xx, timeouts)
* Track rolling success rate and latency
* Apply exponential backoff per provider per endpoint category
* If the provider is in backoff or rate-limited, route to fallback

### Stickiness rule (important)

Within a single `plan_and_run` execution:

* Pick one **Bars provider** for that run and use it for all bar requests
* Pick one **Quotes provider** for that run and use it for all quote requests
* Switch only if failures occur

This avoids inconsistent VWAP/RVOL/volatility calculations across symbols.

---

## 4) Symbol normalisation and universe handling

### Canonical symbol system

Maintain:

* `canonical_symbol` (your internal key)
* `provider_symbol_map`: mapping of canonical → provider-specific symbol formats
* `instrument_type`: common stock / ETF / ADR / etc.
* `primary_exchange`

This prevents issues like `BRK.B` vs `BRK-B`.

### Universe (why it exists)

Universe caching is mainly for:

* consistent filtering (exclude ETFs, require exchange-listed, etc.)
* faster scanning funnels (pre-filter before hitting live APIs)
* stable metadata (market cap/float/sector)

Universe is not “live prices”; it’s a controlled list of instruments and metadata.

### Universe refresh cadence

* **Daily refresh** (before US premarket, or early UK afternoon)
* Store the snapshot with a version timestamp
* Allow multiple universes (e.g., “US exchange-listed common shares under $20”)

---

## 5) Caching and cost-control rules

### TTL guidance

* Quotes: 2–5 seconds (unless streaming)
* Intraday bars (1m): 30–120 seconds depending on frequency
* Movers list / discovery outputs: 30–120 seconds
* Context (earnings/float/splits): 6–24 hours
* Universe metadata: 24 hours to 7 days

### Call reduction strategy (funnel)

Never run expensive enrichment on everything.

* Discovery returns ~100–300 symbols (cheap)
* Filter reduces to ~30–120 symbols (quote-based sanity checks)
* Intraday enrichment runs on ~20–80 symbols
* Context enrichment runs on top ~10–30 symbols

This is where most cost savings come from.

---

## 6) Tooling: the full tool set

These tools are the primitives; the orchestrator calls them.

### Tool 1: `discover_candidates`

**Purpose:** Find potentially interesting symbols right now (or in a specified horizon).

**Inputs (typical):**

* `intent_hint`: optional (“day_trade_today”, “swing”, “long_term”) if the orchestrator passes it
* `session`: `premarket | regular | both`
* `price_range`: e.g. `{min: 0.5, max: 20}`
* `include_otc`: bool
* `exclude_etfs`: bool
* `limit`: integer
* `discovery_mode`: `movers | most_active | unusual_volume | blended`

**Output:**

* list of candidates with lightweight fields:

  * symbol, last/premarket last (if available), % change, volume proxy/activity
  * timestamp, source provider, session coverage flags

**Notes:**

* Uses movers endpoints if available
* If using a universe scan, it should be staged/funnelled, not “quote everything”

---

### Tool 2: `filter_tradeable`

**Purpose:** Remove symbols that are not realistically tradable (spread, liquidity, instrument type).

**Inputs:**

* candidate symbols
* thresholds: `max_spread_pct`, `min_dollar_volume`, `min_volume`, `min_price`, etc.
* optional rules: exclude ETFs/ADRs, exclude earnings today, exclude halts (if detectable)

**Output:**

* `tradeable_symbols`
* `rejections`: per symbol reason codes (very useful for debugging)

**Data usage:**

* quotes snapshot or streaming-derived latest
* cached metadata

---

### Tool 3: `enrich_intraday`

**Purpose:** Provide intraday bars and derived features for day trading and short-term decision making.

**Inputs:**

* symbols
* timeframe: usually `1m`
* lookback bars: e.g. 200–600
* `include_extended_hours`: bool
* `asof`: optional timestamp

**Output:**

* For each symbol:

  * bars (OHLCV)
  * computed features: VWAP, RVOL proxy, ATR (intraday), realised vol, gap %, range stats
  * best-available quote snapshot (optional)
  * provenance: provider, asof timestamp, whether extended hours included

---

### Tool 4: `enrich_context`

**Purpose:** Provide slow-moving context that affects risk and interpretation.

**Inputs:**

* symbols
* fields requested: earnings, float, splits/dividends, sector, headlines

**Output:**

* per symbol:

  * earnings date/time, float/shares (if available), sector/industry
  * recent corporate actions
  * optional top headlines
  * provenance and cache age

---

### Tool 5: `enrich_eod`

**Purpose:** Provide daily/weekly bars and longer-horizon technical features.

**Inputs:**

* symbols
* timeframe: `1d` or `1w`
* lookback: e.g. 6–24 months
* include adjusted prices: bool

**Output:**

* bars and derived features:

  * trend measures (e.g. moving averages), drawdown, volatility, relative strength
  * support/resistance proxy levels if you compute them
  * provenance

---

### Tool 6: `rank_setups`

**Purpose:** Rank trade setups that have explicit triggers and invalidation rules (day + swing).

**Inputs:**

* enriched intraday/eod data bundle
* constraints: max stop distance, max spread, risk per trade, max trades/day (if day trade)
* setup families: ORB, gap-and-go, pullback continuation, mean reversion (configurable)

**Output (per symbol):**

* setup type
* entry trigger (condition-based, not “buy now”)
* invalidation point and stop distance
* target logic (or R-multiple guidance)
* “do not trade if…” conditions
* confidence score and reason codes grounded in the computed metrics

---

### Tool 7: `rank_opportunities`

**Purpose:** Rank longer-term opportunities where the output is more thesis/context driven.

**Inputs:**

* eod + context bundle
* investor constraints: sectors to avoid, max volatility, preferred factors

**Output:**

* thesis summary (short)
* key supporting metrics
* key risks and what would invalidate thesis
* suggested monitoring signals (not intraday triggers)

---

## 7) The orchestrator tool

### Tool 0: `plan_and_run`

**Purpose:** Single entry point. The LLM calls this for most user requests.

**Input:**

* `user_request_text` (the natural language prompt)
* optional explicit constraints (if provided by UI):

  * risk tolerance, max symbols, time horizon, include premarket, etc.

**What it does internally**

1. **Intent extraction**

   * Determine horizon: day trade vs swing vs long term
   * Determine session: premarket / regular / both
   * Determine whether penny/small caps are desired
   * Determine constraints (price range, exclude ETFs, etc.)

2. **Routing plan**

   * Assign providers to jobs (Discovery / Quotes / Bars / Context) using:

     * user configured keys
     * strength-based weights
     * quota/health state
     * user “budget mode” preference

3. **Pipeline execution**

   * Day trade request:

     * `discover_candidates` → `filter_tradeable` → `enrich_intraday` → `enrich_context` → `rank_setups`
   * Swing request:

     * `discover_candidates` → `enrich_context` → `enrich_eod` → `filter_tradeable` → `rank_setups`
   * Long-term request:

     * `discover_candidates` → `enrich_context` → `enrich_eod` → `rank_opportunities`

4. **Return final response bundle**

   * shortlist
   * structured details per symbol
   * routing provenance (which providers were used for which job)
   * warnings about data freshness and coverage gaps

### Add a transparency/debug tool (highly recommended)

* `explain_routing()`

  * shows current provider assignments, scores, recent rate limit events, backoffs
  * explains why a provider was chosen

This saves huge time when a user asks “why did today’s list change?”

---

## 8) Provider switching and “budget-aware” routing

### User configuration inputs

Allow users to supply any subset of keys:

* `ALPACA_*`, `POLYGON_API_KEY`, `TWELVEDATA_API_KEY`, `FMP_API_KEY`, `FINNHUB_API_KEY`, etc.

### Automatic provider selection rules

For each job, choose a provider as follows:

1. Filter to providers that:

* are configured (key present)
* support the required capability (eg premarket for discovery if requested)
* are not in backoff

2. Score remaining providers:

* capability match (hard gate)
* strength score for the job (static weights)
* estimated cost per result (static approximation)
* recent 429/timeouts (dynamic penalty)
* latency (dynamic penalty)
* optional remaining quota (dynamic bonus)

3. Pick top scorer.

### Spreading load across providers

If multiple providers are available, prefer to distribute by job:

* Discovery on Provider A
* Quotes on Provider B (streaming if possible)
* Bars on Provider A or C
* Context on Provider D

Avoid mixing bars across providers within a single run.

### Behaviour when only one provider is available

Degrade gracefully:

* still run the pipeline
* tighten limits and reduce symbol counts
* return a “coverage reduced” warning in the response bundle

---

## 9) Day trading specifics (including premarket)

### Premarket usage

Premarket is best treated as:

* discovery and early context
* not a guarantee of tradability

Your `filter_tradeable` should be stricter in premarket:

* tighter spread threshold
* higher minimum volume thresholds
* optionally delay some decisions until regular session begins

### Penny stocks

If you include penny stocks:

* enforce strict spread and volume filters
* optionally exclude OTC by default (allow opt-in)

A sensible default is:

* exchange-listed only (NYSE/Nasdaq/AMEX)
* price floor above $0.50 or $1.00
* reject wide spreads automatically

---

## 10) Output design: keep the LLM honest

Every output the LLM relies on should include:

* `asof_timestamp` in UTC
* `session_covered` (premarket/regular/after-hours)
* `source_provider` per field group
* computed metrics with values (not just labels)
* explicit reason codes for ranking

This forces “opinions” to be anchored to data.

---

## 11) Logging, evaluation, and iteration

### Logging (minimum)

Log each `plan_and_run`:

* user request text
* routing plan (providers chosen)
* candidate list and final shortlist
* key metrics used for ranking

If you want performance evaluation:

* add a “decision log” tool:

  * `log_trade_decision(symbol, action, notes, entry, stop, target)`
* later reconcile outcomes and compute whether the assistant actually helped

This is how you prevent “it feels good” without improvement.

---

## 12) Implementation phases

### Phase 1: MVP (fast, robust)

* Implement provider clients for 2 market-data providers + 1 context provider
* Implement router (static strengths + dynamic backoff)
* Implement tools: `discover_candidates`, `filter_tradeable`, `enrich_intraday`, `enrich_context`, `rank_setups`
* Implement orchestrator `plan_and_run`
* Add provenance everywhere
* Hard cap symbols to control costs

### Phase 2: Longer-term support

* Add `enrich_eod`
* Add `rank_opportunities`
* Improve discovery modes for swing/long-term (relative strength, trend filters)

### Phase 3: Refinement and reliability

* Redis caching
* Postgres logs and universe snapshots
* Better universe builder (daily refresh)
* Add `explain_routing`
* Add robust symbol mapping and corporate actions handling

### Phase 4: Optional execution integration (later)

* Keep execution out initially
* If you add it later, gate it behind:

  * explicit user confirmation per trade, or
  * strict risk engine rules and paper trading first

---

## 13) Concrete “typical workflows” (what the LLM should do)

### Workflow: “What stocks look good to day trade today?”

The LLM calls:

1. `plan_and_run(user_request_text=...)`

Internally, server runs:

* discover → filter → intraday enrich → context → rank setups

Returns:

* top 5–15 tickers
* per ticker: setup type, trigger, invalidation, stop distance, warnings, key numbers

### Workflow: “What looks good for swing trades (2–6 weeks)?”

`plan_and_run` routes:

* discover → context → eod enrich → filter → rank setups

Returns:

* top 10–20 with daily timeframe triggers and risk

### Workflow: “What are good long-term opportunities?”

`plan_and_run` routes:

* discover → context → eod enrich → rank opportunities

Returns:

* thesis-oriented shortlist, monitoring signals, risks

---

## 14) What not to do (to avoid pain)

* Don’t split discovery “first 50 from A, next 50 from B”. Use one discovery authority per run, then enrich with others.
* Don’t scan thousands of tickers via quote calls. Use movers endpoints or staged funnels.
* Don’t mix bars from multiple providers within a run unless forced by failure.
* Don’t let the LLM produce rankings without structured metrics and provenance.

---

## 15) Configuration design (what users will actually enter)

### Required (at least one market data provider)

* One of: Alpaca OR Polygon OR Twelve Data

### Recommended (for cost and resilience)

* 2 market-data providers (to spread load)
* 1 context provider (FMP or Finnhub)

### Optional knobs

* `budget_mode`: minimise_cost / balanced / maximise_quality
* `max_candidates_discovered` (default 200)
* `max_symbols_enriched_intraday` (default 60)
* `max_symbols_enriched_context` (default 20)
* `include_otc` default false
* `default_price_range` for “penny-ish” scanning
