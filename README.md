# Signal Synthesis MCP Server

A specialized MCP server for financial analysis and trading signal generation.

## Features
- Real-time stock quotes
- Technical indicator calculation (RSI, MACD, Bollinger Bands)
- Intelligent candidate discovery based on trading intent
- Automated trade setup ranking
- Multi-provider support (Alpaca, Polygon, FMP, Finnhub)
- Secure OAuth-style Authentication
- Simple API Key fallback for headless clients

### Deployment

The server is optimized for Docker-based deployment and secure exposure via Nginx Proxy Manager.

#### 1. Docker Container Setup
The server is designed to run in a Docker environment using the provided `docker-compose.yml`.

1. **Configure Environment Variables**:
   Update the `environment` section in `docker-compose.yml` or use an `.env` file:
   - `MASTER_KEY`: **Required**. 64 hex characters (generate with `openssl rand -hex 32`).
   - `REDIRECT_URI_ALLOWLIST`: **Required**. Comma-separated list of allowed redirect URIs (e.g., `http://localhost:3012/callback`).
   - `DATABASE_URL`: `postgresql://postgres:postgres@db:5432/financial_mcp`
   - `REDIS_URL`: `redis://cache:6379`
   - `MCP_API_KEY`: A single API key for simple auth.
   - `MCP_API_KEYS`: (Optional) Comma-separated list of additional valid API keys.

2. **Launch**:
   ```bash
   docker compose up -d
   ```
   The server will start and be reachable locally on port `3012`.

#### 2. Nginx Proxy Manager (NPM) Setup
Configure NPM to handle incoming traffic and SSL termination.

**Proxy Host Settings:**
- **Domain Names**: `mcp.yourdomain.com`
- **Scheme**: `http`
- **Forward Host/IP**: The IP of your Docker host or service name (if shared network).
- **Forward Port**: `3012`
- **Websockets Support**: **Enable** (Ensures support for long-lived streams).

**Advanced Nginx Configuration:**
Add the following to the **Advanced** tab to support MCP's Streamable HTTP (SSE) transport:
```nginx
# Disable buffering for SSE (Server-Sent Events)
proxy_set_header Connection "";
proxy_http_version 1.1;
proxy_buffering off;
proxy_cache off;
chunked_transfer_encoding on;

# Increase timeouts for persistent connections
proxy_read_timeout 3600s;
proxy_send_timeout 3600s;
```

### Smoke Test

A PowerShell script is provided to verify the authentication flow and server status.

1. Navigate to `http://localhost:3012/connect...` in your browser and complete the flow to get a `code`.
2. Run `scripts/smoke-test.ps1`.
3. Enter the `BaseUrl`, `Code`, and `CodeVerifier` when prompted.
4. The script will exchange the code for a token and verify access to MCP tools.

### Connect Flow

1. Navigate to `http://localhost:3012/connect` (with required PKCE parameters).
   - Example: `http://localhost:3012/connect?redirect_uri=http://localhost:3012/callback&state=123&code_challenge=...&code_challenge_method=S256`
2. Enter your API keys and configuration in the UI.
3. Upon submission, you will be redirected to your client with an authorization code.
4. Exchange the code for an access token via `POST /token`.

## Authentication Methods

The MCP endpoint (`/mcp`) supports two authentication methods:

1.  **OAuth Bearer Token (Preferred)**:
    - Use the `/connect` flow to configure provider-specific keys.
    - Header: `Authorization: Bearer <access_token>`
    - Provides access to connection-specific configurations stored in the database.

2.  **API Key (Simple Fallback)**:
    - Set `MCP_API_KEY` or `MCP_API_KEYS` in your environment.
    - Header: `x-api-key: <api_key>`
    - OR Query Param: `?apiKey=<api_key>`
    - Uses the server's default environment variables for provider keys.

### Authentication Examples

#### curl (OAuth Bearer)
```bash
curl -X POST http://localhost:3012/mcp \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### curl (API Key Header)
```bash
curl -X POST http://localhost:3012/mcp \
  -H "x-api-key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

#### PowerShell (API Key Query Param)
```powershell
$Params = @{
    Uri = "http://localhost:3012/mcp?apiKey=YOUR_API_KEY"
    Method = "Post"
    ContentType = "application/json"
    Body = @{
        jsonrpc = "2.0"
        id = 1
        method = "tools/list"
    } | ConvertTo-Json
}
Invoke-RestMethod @Params
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
