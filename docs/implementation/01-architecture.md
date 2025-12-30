# Architecture & Directory Structure

This document describes the high-level architecture and the recommended directory structure for the Financial MCP Server (TypeScript Implementation).

## Directory Structure

```text
financial-mcp-server/
├── README.md
├── package.json         # Dependencies and build config
├── tsconfig.json        # TypeScript configuration
├── smithery.yaml        # Smithery deployment config
├── Dockerfile           # Docker build instructions
├── .env.example         # Template for environment variables
├── src/
│   ├── index.ts         # Entry point for the MCP server
│   ├── config.ts        # Configuration loading (env vars, API keys)
│   ├── server.ts        # MCP server instance setup
│   ├── models/          # Zod schemas and types
│   │   ├── index.ts
│   │   ├── data.ts      # Quote, Bar, Trade, etc.
│   │   ├── internal.ts  # Internal routing state, provenance
│   │   └── api.ts       # Tool input/output schemas
│   ├── interfaces/      # Interfaces
│   │   ├── index.ts
│   │   ├── market-data.ts
│   │   └── context-data.ts
│   ├── providers/       # API Client implementations
│   │   ├── index.ts
│   │   ├── alpaca.ts
│   │   ├── polygon.ts
│   │   ├── fmp.ts
│   │   ├── finnhub.ts
│   │   └── twelve-data.ts
│   ├── routing/         # Routing logic
│   │   ├── index.ts
│   │   ├── router.ts    # Main Router class
│   │   └── health.ts    # Provider health tracking
│   ├── tools/           # Implementation of MCP tools
│   │   ├── index.ts
│   │   ├── discovery.ts # discover_candidates
│   │   ├── filter.ts    # filter_tradeable
│   │   ├── enrichment.ts# enrich_intraday, enrich_context, enrich_eod
│   │   ├── ranking.ts   # rank_setups, rank_opportunities
│   │   ├── debug.ts     # explain_routing
│   │   └── orchestrator.ts # plan_and_run
│   └── utils/
│       ├── index.ts
│       ├── cache.ts     # Caching wrapper
│       └── indicators.ts # Technical indicator calculations
└── tests/
    ├── unit/
    └── integration/
```

## Core Components

### 1. `src/index.ts` & `src/server.ts`
The entry point. It initializes the MCP server, loads configuration, instantiates the Router and Tools, and registers the tools with the MCP server instance.

### 2. `src/models/`
Defines the "canonical" data format using Zod schemas. All providers must convert their API responses into these models before returning data to the core system. This ensures that the Tools don't need to know which provider the data came from.

### 3. `src/interfaces/`
Defines the `MarketDataProvider` and `ContextDataProvider` interfaces. These enforce a common structure for all provider implementations.

### 4. `src/providers/`
Contains the specific implementations for each external API. Each file (e.g., `alpaca.ts`) should contain a class that implements the appropriate interface and handles API authentication, request formatting, and response normalization.

### 5. `src/routing/`
The `Router` class is responsible for:
*   Loading provider configuration.
*   Tracking provider health (success rates, 429s).
*   Selecting the best provider for a given job (Discovery, Quotes, Bars, Context).
*   Handling "stickiness" (using the same provider for related requests in a session).

### 6. `src/tools/`
These are the actual functions exposed to the LLM (or called by the orchestrator). They contain the business logic:
*   **Discovery**: Calling `router.getDiscoveryProvider().getMovers()`.
*   **Filtering**: Applying logic like `spread < 0.1%`.
*   **Orchestrator**: The `planAndRun` function that ties everything together.

### 7. `src/utils/cache.ts`
A simple caching layer. Initially, this can be an in-memory Map with TTL support. Later, it can be swapped for a Redis-backed implementation.

## Data Flow

1.  **User Request**: LLM sends a request to `planAndRun` with a natural language query.
2.  **Orchestrator**:
    *   Parses intent.
    *   Initializes a `RoutingContext` (to track stickiness).
    *   Calls `router.planRoute(context)` to decide which providers to use.
3.  **Tool Execution** (e.g., `discoverCandidates`):
    *   Tool asks Router for the `Discovery` provider.
    *   Router returns the best available provider (e.g., Polygon).
    *   Tool calls `provider.getMovers()`.
    *   Provider calls external API, normalizes response to `SymbolCandidate[]`.
    *   Tool returns candidates.
4.  **Enrichment**:
    *   Orchestrator calls `enrichIntraday`.
    *   Tool asks Router for `Bars` provider (sticking to the plan).
    *   Tool calls `provider.getBars(symbols)`.
    *   Tool computes indicators (VWAP, etc.) on the normalized bars.
5.  **Final Response**: Orchestrator aggregates all data into a structured JSON and returns it to the LLM.
