# Financial MCP Server

A specialized MCP server for financial analysis and trading signal generation.

## Features
- Real-time stock quotes
- Technical indicator calculation (RSI, MACD, Bollinger Bands)
- Intelligent candidate discovery based on trading intent
- Automated trade setup ranking
- Multi-provider support (Alpaca, Polygon, FMP, Finnhub)
- Secure OAuth-style Authentication

## Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- API Keys for at least one provider (Alpaca, Polygon, etc.)

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up the database:
   ```bash
   docker compose up -d
   npx prisma db push
   ```

### Configuration & Authentication

The server requires secure configuration for authentication.

**Environment Variables:**

- `MASTER_KEY`: **Required**. A string used to derive the encryption key for storing configuration at rest. Must be kept secret.
- `REDIRECT_URI_ALLOWLIST`: **Required**. Comma-separated list of allowed redirect URIs for the auth flow.
- `CODE_TTL_SECONDS`: (Optional) Expiry time for auth codes in seconds (default: 90).
- `TOKEN_TTL_SECONDS`: (Optional) Expiry time for access tokens in seconds (default: 3600).
- `REDIRECT_URI_ALLOWLIST_MODE`: (Optional) Validation mode: `exact` (default) or `prefix`.
- `DATABASE_URL`: Connection string for PostgreSQL.
- `REDIS_URL`: Connection string for Redis.

**Docker Compose Example:**

The provided `docker-compose.yml` includes **unsafe example values** for development:
- `MASTER_KEY=CHANGE_THIS_TO_A_SECURE_32_BYTE_KEY_FOR_AES_GCM_ENCRYPTION`
- `REDIRECT_URI_ALLOWLIST=http://localhost:3000/callback,http://localhost:8080/callback`
- `CODE_TTL_SECONDS=90`
- `TOKEN_TTL_SECONDS=3600`
- `REDIRECT_URI_ALLOWLIST_MODE=exact`

**IMPORTANT:** You **MUST** change these values in a production environment.

### Smoke Test

A PowerShell script is provided to verify the authentication flow and server status.

1. Navigate to `http://localhost:3000/connect...` in your browser and complete the flow to get a `code`.
2. Run `scripts/smoke-test.ps1`.
3. Enter the `BaseUrl`, `Code`, and `CodeVerifier` when prompted.
4. The script will exchange the code for a token and verify access to MCP tools.

### Connect Flow

1. Navigate to `http://localhost:3000/connect` (with required PKCE parameters).
   - Example: `http://localhost:3000/connect?redirect_uri=http://localhost:3000/callback&state=123&code_challenge=...&code_challenge_method=S256`
2. Enter your API keys and configuration in the UI.
3. Upon submission, you will be redirected to your client with an authorization code.
4. Exchange the code for an access token via `POST /token`.

### Running the Server

#### HTTP Streamable Transport
The server runs on HTTP by default.
```bash
npm start
```
- Endpoint: `http://localhost:3000/mcp`
- Authentication: `Authorization: Bearer <access_token>`

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
