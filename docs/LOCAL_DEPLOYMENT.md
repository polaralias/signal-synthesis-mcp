# Local Deployment Guide

This guide explains how to deploy the Financial MCP Server locally using Docker Compose, featuring a persistent database, secure configuration management, and a web-based Config UI.

## Prerequisites

- Docker and Docker Compose
- Node.js (for local development/testing, optional for running)

## Setup

1.  **Clone the repository.**
2.  **Generate a Master Key.**
    The system uses a master key to encrypt sensitive API keys in the database. Generate a 32-byte hex string (64 characters).
    ```bash
    openssl rand -hex 32
    ```
3.  **Configure Environment.**
    Create a `.env` file (or use the existing one, but `docker-compose.yml` handles defaults).
    Ensure `MASTER_KEY` is set in your environment or passed to Docker.

## Running the Server

Run the stack using Docker Compose:

```bash
export MASTER_KEY=<your_generated_hex_key>
docker-compose up --build
```

This starts:
-   **App**: The MCP Server and API (Port 3000)
-   **DB**: Postgres Database (Port 5432)
-   **Cache**: Redis (Port 6379)

## Using the Config UI

1.  Open your browser to `http://localhost:3000/index.html`.
2.  **Create Connection**:
    -   Enter a name (e.g., "My Trading Profile").
    -   Enter your API keys (Alpaca, Polygon, etc.). Keys are encrypted before storage.
    -   Click "Create Connection".
3.  **Connect**:
    -   In the "Existing Connections" list, click **Connect**.
    -   A modal will appear with your **Session Token**.

## connecting an MCP Client

Configure your MCP Client (e.g., Claude Desktop, or another MCP tool) to connect to the server.

-   **Transport**: HTTP / SSE
-   **URL**: `http://localhost:3000/mcp`
-   **Headers**:
    ```
    Authorization: Bearer <your_session_token>
    ```

### Alternative (Query Parameter)
If your client does not support custom headers, you can append the token to the URL (less secure):
`http://localhost:3000/mcp?token=<your_session_token>`

## Persistence & Security

-   **Database**: Connections and Sessions are stored in Postgres (`postgres_data` volume).
-   **Cache**: Market data is cached in Redis (`redis_data` volume) and persists across restarts.
-   **Security**: API keys are encrypted at rest using AES-256-GCM. Session tokens are hashed using Argon2.

## Development

-   **Tests**: Run `npm test` to execute the test suite.
-   **Schema**: Prisma schema is located at `prisma/schema.prisma`. Run `npx prisma generate` after changes.
