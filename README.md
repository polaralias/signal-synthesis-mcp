# Financial MCP Server

A comprehensive Financial Model Context Protocol (MCP) server that provides AI agents with professional-grade stock market analysis capabilities.

## Features

- **Intelligent Screening**: Filter stocks based on technical and fundamental criteria (Price, Volume, Sector, Market Cap).
- **Multi-Provider Support**: Seamlessly integrates with Alpaca, Polygon.io, Financial Modeling Prep (FMP), and Finnhub.
- **Advanced Analysis**: Calculates RSI, MACD, Bollinger Bands, and SMA.
- **Sentiment Analysis**: Analyzes news sentiment using Finnhub.
- **Trade Setup Ranking**: Ranks opportunities based on a weighted scoring system.
- **Secure Authentication**: End-to-end redirect-based authentication flow.
- **Docker Ready**: Easy deployment with Docker and Docker Compose.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/)
- API Keys for at least one provider (Alpaca, Polygon, FMP, or Finnhub)
- `MASTER_KEY` (32-byte hex string) for credential encryption

## Quick Start (Local Docker Deployment)

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd financial-mcp-server
    ```

2.  **Generate a Master Key:**
    You can generate a secure 32-byte hex key using OpenSSL:
    ```bash
    openssl rand -hex 32
    ```

3.  **Create `.env` file (Optional but recommended):**
    Create a `.env` file in the root directory to store your secrets.
    ```env
    MASTER_KEY=your_generated_hex_key_here
    # Optional default provider keys (can also be configured via UI)
    ALPACA_API_KEY=...
    ALPACA_SECRET_KEY=...
    POLYGON_API_KEY=...
    ```

4.  **Run with Docker Compose:**
    ```bash
    export MASTER_KEY=your_generated_hex_key_here # If not in .env
    docker compose up --build
    ```

5.  **Access the UI:**
    Open your browser and navigate to `http://localhost:3000`.

## Configuration via UI

1.  Go to `http://localhost:3000`.
2.  Fill in the "Create New Connection" form.
3.  Enter a name (e.g., "My Portfolio") and your API keys.
4.  Click "Create Connection".
5.  Once created, click "Generate Token" to get a session token for your AI agent.

## Authentication Flow

This server supports a redirect-based authentication flow, ideal for integrating with third-party MCP clients.

1.  **Initiate Auth**: Point your browser or client to:
    ```
    http://localhost:3000?callback_url=https://your-client-app.com/callback
    ```
2.  **Authorize**: The UI will show an "Authorize & Connect" button instead of "Generate Token".
3.  **Redirect**: Upon clicking, the server validates the request and redirects to your `callback_url` with a one-time authorization `code` and the original `state`.
    ```
    https://your-client-app.com/callback?code=AUTH_CODE&state=STATE
    ```
4.  **Exchange Token**: Your client application exchanges the `code` for a session token via `POST /api/token`.

## Reverse Proxy Setup (Nginx Proxy Manager)

This server is designed to work seamlessly behind a reverse proxy like Nginx Proxy Manager (NPM).

### Requirements
- **Websockets/SSE**: The MCP protocol uses Server-Sent Events (SSE), which requires specific headers and timeout settings.
- **Headers**: `X-Accel-Buffering: no` is handled by the application, but you must ensure your proxy supports long-lived connections.

### Nginx Proxy Manager Configuration

1.  **Add Proxy Host**:
    - **Domain Names**: `mcp.yourdomain.com`
    - **Scheme**: `http`
    - **Forward Hostname / IP**: `financial-mcp-app` (container name) or your host IP.
    - **Forward Port**: `3000`
    - **Block Common Exploits**: Enabled (Optional)
    - **Websockets Support**: **Enabled** (Required)

2.  **Custom Locations (Optional)**:
    - If you are deploying under a subpath (e.g., `yourdomain.com/mcp/`), ensure you strip the path prefix if the app expects root, or rely on the relative path support in the UI. *Note: Subpath deployment is supported by the UI using relative paths (`./api`), but root domain deployment is recommended for simplicity.*

3.  **SSL/TLS**:
    - Enable SSL via Let's Encrypt in the "SSL" tab.
    - Force SSL: Enabled.

4.  **Advanced Configuration**:
    - If you encounter buffering issues (events not arriving immediately), add this to the "Advanced" tab:
      ```nginx
      proxy_set_header X-Accel-Buffering no;
      proxy_read_timeout 86400s;
      proxy_send_timeout 86400s;
      ```

## API Endpoints

- `GET /api/connections`: List all connections.
- `POST /api/connections`: Create a new connection.
- `POST /api/authorize`: Start OAuth-like flow.
- `POST /api/token`: Exchange auth code for token.
- `GET /mcp`: The SSE endpoint for MCP agents.

## Development

- **Install**: `npm install`
- **Build**: `npm run build`
- **Test**: `npm test`
- **Local Database**: The `docker-compose.yml` includes Postgres and Redis. Ensure you have them running for local dev without Docker.

