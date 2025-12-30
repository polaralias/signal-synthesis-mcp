# Financial MCP Server

A specialized Model Context Protocol (MCP) server for financial market data analysis and trade setup generation. This server aggregates data from multiple providers (Alpaca, Polygon, FMP, Finnhub), runs a screening and enrichment pipeline, and outputs ranked trade setups.

## Features

*   **Multi-Provider Support:** Integrates with Alpaca, Polygon, Financial Modeling Prep (FMP), and Finnhub.
*   **Resilient Routing:** Automatically falls back to alternative providers or mock data if primary providers fail.
*   **Smart Screening:** Filters stocks based on price, volume, sector, and market cap. Falls back to in-memory filtering if the provider doesn't support native screening.
*   **Technical Analysis:** Calculates intraday indicators (VWAP, RSI, MACD, Bollinger Bands, ATR) and EOD metrics (SMA50, SMA200).
*   **Orchestration Pipeline:** "Plan and Run" tool automates the entire flow: Discovery -> Filtering -> Enrichment -> Ranking.
*   **Caching:** Built-in Redis caching for market data to reduce API calls and latency.
*   **Secure Connection Management:** Web-based UI for managing API keys and connections securely.

## Prerequisites

*   Node.js (v18 or higher)
*   PostgreSQL (for connection/session storage)
*   Redis (for caching and auth flow)

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd financial-mcp-server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Environment Setup:**
    Create a `.env` file in the root directory:
    ```env
    DATABASE_URL="postgresql://user:password@localhost:5432/financial_mcp"
    REDIS_URL="redis://localhost:6379"
    PORT=3000
    ```
    *   `DATABASE_URL`: Connection string for your PostgreSQL database.
    *   `REDIS_URL`: Connection string for Redis.
    *   `PORT`: Port for the HTTP server (default: 3000).

4.  **Database Migration:**
    ```bash
    npm run postinstall
    # If using Prisma Migrate in the future:
    # npx prisma migrate dev
    # For now, `prisma db push` is often sufficient for dev:
    npx prisma db push
    ```

## Running the Server

### Development Mode
```bash
npm start
```
The server will start on port 3000 (or the port specified in `.env`).

### MCP Connection
You can connect to this server using any MCP client (e.g., Claude Desktop, specialized IDE plugins).

**SSE Transport:**
Endpoint: `http://localhost:3000/mcp`

To secure the connection, use the Web UI at `http://localhost:3000` to create a Connection and Session. The UI will provide you with the full SSE URL including the Session ID and the Authorization header.

## Architecture

The system is built around a central **Orchestrator** that executes a pipeline:

1.  **Discovery:** Finds potential candidates (e.g., top gainers/losers) using the `SmartScreener`.
2.  **Filtering:** Removes untradeable assets (low price, wide spreads).
3.  **Enrichment:** Fetches detailed data:
    *   **Intraday:** 1-minute bars for VWAP, RSI, MACD.
    *   **Context:** Company profile, sector, market cap.
    *   **EOD:** Daily bars for long-term averages (SMA).
4.  **Ranking:** Scores the candidates based on technical setups (Trend, Reversion, Momentum) and produces a confidence score.

## Available MCP Tools

*   `plan_and_run`: Execute the full analysis pipeline.
    *   `intent`: 'day_trade', 'swing', 'long_term'
*   `discover_candidates`: Find potential stocks based on criteria.
*   `filter_tradeable`: Check list of symbols for tradeability.
*   `enrich_intraday`: Get technical indicators (RSI, VWAP, etc.).
*   `enrich_context`: Get fundamental data (Sector, Market Cap).
*   `enrich_eod`: Get daily moving averages.
*   `rank_setups`: Score and rank a list of enriched symbols.
*   `get_quotes`: Fetch real-time quotes.
*   `explain_routing`: Debug current provider configuration.

## Testing

Run the test suite:
```bash
npm test
```
