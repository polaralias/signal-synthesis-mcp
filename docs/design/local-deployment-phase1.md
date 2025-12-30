# Local Deployment Pattern - Phase 1 Design

## 1. Inventory

### MCP Server: Financial MCP Server
*   **Transport**: HTTP/SSE (Server-Sent Events) on `/mcp` (connection) and `/messages` (communication).
*   **Existing Entrypoint**: `src/server.ts` exposes an Express app listening on `process.env.PORT`.
*   **Current Session Model**:
    *   One `Router` and `McpServer` instance created per connection.
    *   Session ID (UUID) generated on connection.
    *   Valid only for the duration of the SSE connection.
    *   No persistent session state.

### Config Requirements
The server requires the following configuration, currently passed via query parameters or environment variables:
*   `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`
*   `POLYGON_API_KEY`
*   `FMP_API_KEY`
*   `FINNHUB_API_KEY`
*   `ENABLE_CACHING` (boolean)
*   `CACHE_TTL` (number)

### Auth Mechanisms
*   **Current**: Implicit via API keys in query parameters (Insecure).
*   **Target**: Bearer Token (Session ID/Access Token) in `Authorization` header.

### Caching
*   **Current**: In-memory `Map` (`CachingMarketDataProvider`). Not persistent.
*   **Target**: Persistent caching (Redis or Postgres) to survive restarts.

---

## 2. Session Model

### Session Object
A persistent session will be stored in the database:
```json
{
  "id": "uuid-v4",
  "connection_id": "uuid-v4 (reference to profile)",
  "token_hash": "argon2_hash_of_access_token",
  "created_at": "timestamp",
  "expires_at": "timestamp",
  "last_used_at": "timestamp",
  "revoked_at": "timestamp (nullable)"
}
```

### Client Identity
Clients will present a Bearer token:
`Authorization: Bearer <session_access_token>`

If the MCP client cannot set headers (legacy/limited clients), a one-time-use short-lived token in the URL can be exchanged, or a long-lived token (less secure, discouraged) can be used as a query parameter.

### Lifecycle
1.  **Connect**: Client calls `POST /api/connections/:id/session` (or via UI).
2.  **Issue**: Backend creates session, returns `session_id` and `access_token`.
3.  **Use**: Client connects to `/mcp` with header. Backend validates token hash.
4.  **Expire/Revoke**: Session expires after TTL or manual revocation.

---

## 3. Persistence Store Selection

**Selected Strategy: Hybrid (Postgres + Redis)**

*   **Postgres**:
    *   **Reason**: Robust, relational structure for Configuration Profiles, Auth Credentials (encrypted), and Session metadata. Ideal for the "Config UI" requirements.
    *   **Tables**: `connections`, `auth_credentials`, `sessions`, `audit_logs`.
*   **Redis** (with AOF enabled):
    *   **Reason**: High-performance caching for market data. AOF (Append Only File) ensures persistence across restarts as required.
    *   **Keys**: `cache:session_id:tool:args_hash`
    *   **TTL**: Managed natively by Redis.

*Alternative (Simpler)*: **Postgres Only**. Use a `cache_entries` table with JSONB column. Acceptable for local deployment if minimizing container count is priority, but Redis is better suited for high-frequency market data caching. I will proceed with **Hybrid** unless directed otherwise, as it's more robust.

---

## 4. Security and Threat Model

### Security Checklist
1.  **Secret Management**:
    *   **Envelope Encryption**: A `MASTER_KEY` (env var) encrypts Data Keys. Data Keys encrypt API Keys in Postgres.
    *   **Never Log Secrets**: Redact keys in logs.
2.  **Session Security**:
    *   **Argon2 Hashing**: Store only the hash of the session access token.
    *   **Rotation**: Support token rotation.
3.  **Network Security**:
    *   **TLS**: Local deployment should support HTTPS (via reverse proxy like Caddy or Nginx, or self-signed certs) if exposing outside `localhost`.
    *   **CORS**: Strict same-origin policy for the Config UI.
4.  **Container Security**:
    *   Run as non-root user.
    *   Minimal exposed ports (only API/MCP port).

### Threat Mitigations
*   **Session Fixation**: Generate new tokens on login/connect.
*   **Token Leakage**: Short TTLs, revocable sessions.
*   **SSRF**: Validate user-provided URLs in config (if any). The current server uses fixed provider URLs, reducing SSRF risk unless custom endpoints are added.
