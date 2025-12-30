# Master Plan: Financial MCP Server Implementation

This document outlines the phased implementation plan for building the Financial MCP Server. The goal is to create a robust, extensible server that provides financial data and analysis tools to an LLM.

## Tech Stack

*   **Language**: TypeScript
*   **Runtime**: Node.js
*   **Protocol**: Model Context Protocol (MCP) - Streamable HTTP
*   **Validation**: Zod (for data models and schemas)
*   **Dependency Management**: npm / yarn / pnpm

## Phase 1: Foundation & Core Architecture

**Objective:** Set up the project structure, define core interfaces, and implement the basic routing engine and configuration management.

*   [ ] **1.1. Project Setup**: Initialize repository structure, `package.json`, `tsconfig.json`, and basic configuration loading (dotenv).
*   [ ] **1.2. Data Models**: Define Zod schemas for `Quote`, `Bar`, `Trade`, `Symbol`, and `MarketStatus` in `src/models`.
*   [ ] **1.3. Provider Interface**: Create the interfaces/abstract classes for `MarketDataProvider` and `ContextDataProvider` in `src/interfaces`.
*   [ ] **1.4. Routing Engine (Basic)**: Implement a basic router that can select a provider based on configuration.
*   [ ] **1.5. Mock Provider**: Implement a mock provider for testing purposes to ensure the pipeline works without live API keys initially.

## Phase 2: Provider Implementations (MVP)

**Objective:** Implement real client integrations for at least two market data providers and one context provider.

*   [ ] **2.1. Alpaca Integration**: Implement `AlpacaProvider` for Quotes and Bars.
*   [ ] **2.2. Polygon Integration**: Implement `PolygonProvider` for Discovery, Quotes, and Bars.
*   [ ] **2.3. FMP Integration**: Implement `FMPProvider` for Context (earnings, profiles).
*   [ ] **2.4. Finnhub Integration (Fallback)**: Implement `FinnhubProvider` for basic context.
*   [ ] **2.5. Normalization**: Ensure all providers return data in the canonical formats defined in Phase 1.

## Phase 3: Tools & Pipeline Logic

**Objective:** Implement the specific tools that the LLM will interact with and the logic to chain them.

*   [ ] **3.1. `discover_candidates`**: Implement the discovery logic (movers, screeners).
*   [ ] **3.2. `filter_tradeable`**: Implement filtering logic (spread, volume, price checks).
*   [ ] **3.3. `enrich_intraday`**: Implement intraday bar fetching and basic feature calculation (VWAP, RVOL).
*   [ ] **3.4. `enrich_context`**: Implement fetching of earnings, float, and sector data.
*   [ ] **3.5. `rank_setups`**: Implement simple ranking logic based on technicals.

## Phase 4: The Orchestrator (`plan_and_run`)

**Objective:** Create the main entry point tool that parses user intent and executes the tool pipeline.

*   [ ] **4.1. Intent Extraction**: Logic to determine if the request is for day trade, swing, or long-term.
*   [ ] **4.2. Orchestration Logic**: Chain the tools together based on the intent.
*   [ ] **4.3. Error Handling & Fallbacks**: Ensure the pipeline continues (gracefully degrades) if one step fails or a provider errors.
*   [ ] **4.4. Response Formatting**: Structure the final JSON output with provenance and timestamps.

## Phase 5: Advanced Features & Refinement

**Objective:** Add caching, advanced routing, and robustness.

*   [ ] **5.1. Caching Layer**: Implement in-memory (or Redis) caching for quotes and bars to reduce API calls.
*   [ ] **5.2. Advanced Routing**: Implement the "Strength-based" routing and dynamic health tracking (circuit breakers).
*   [ ] **5.3. `enrich_eod`**: Add End-of-Day data and longer-term technicals.
*   [ ] **5.4. `explain_routing`**: Add the debug tool to inspect why providers were chosen.

## Phase 6: Testing & Verification

**Objective:** Comprehensive testing suite.

*   [ ] **6.1. Unit Tests**: Test individual provider implementations and normalization using Jest/Vitest.
*   [ ] **6.2. Integration Tests**: Test the full pipeline with mock data.
*   [ ] **6.3. Live Tests**: Scripts to verify integration with real APIs (using a "sandbox" mode if possible).

## Phase 7: Deployment Configuration

**Objective:** Configure project for deployment on Smithery and local Docker usage.

*   [ ] **7.1. Docker Setup**: Create `Dockerfile` for multi-stage TypeScript build.
*   [ ] **7.2. Smithery Config**: Create `smithery.yaml` for Smithery deployment.
*   [ ] **7.3. Verification**: Verify local Docker build and run.

See [07-deployment.md](./07-deployment.md) for details.

## Future Phases (Post-MVP)

*   **Database Integration**: Move from in-memory/file persistence to Postgres/Redis.
*   **Execution**: Add trading capabilities (paper trading first).
*   **User Management**: Support for multiple user configurations if needed.
