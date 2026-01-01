# Financial MCP Server

A specialized MCP server for financial analysis and trading signal generation.

## Features
- Real-time stock quotes
- Technical indicator calculation (RSI, MACD, Bollinger Bands)
- Intelligent candidate discovery based on trading intent
- Automated trade setup ranking
- Multi-provider support (Alpaca, Polygon, FMP, Finnhub)

## Getting Started

### Prerequisites
- Node.js 18+
- Docker (optional, for Redis/Postgres)
- API Keys for at least one provider (Alpaca, Polygon, etc.)

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env`:
   ```bash
   PORT=3000
   ALPACA_API_KEY=...
   ALPACA_SECRET_KEY=...
   # ... other keys
   MCP_BEARER_TOKEN=my-secret-token # Optional, for auth
   ```

### Running the Server

#### HTTP Streamable Transport
The server runs on HTTP by default.
```bash
npm start
```
- Endpoint: `http://localhost:3000/mcp`
- If `MCP_BEARER_TOKEN` is set, pass it in the `Authorization: Bearer <token>` header.

#### Stdio Transport
To run in Stdio mode (e.g. for direct MCP client usage via command line):
```bash
# Ensure PORT is NOT set in env
npm start
```

## Tools
- `get_quotes`: Fetch real-time quotes
- `discover_candidates`: Find potential trades
- `filter_tradeable`: Filter based on volume/spread
- `enrich_intraday`: Add VWAP/ATR
- `enrich_context`: Add fundamentals
- `rank_setups`: Score trade setups
- `plan_and_run`: Run the full pipeline

## Development
To build:
```bash
npm run build
```
To test:
```bash
npm test
```
