import { McpCore } from './mcp-core';
import { Router, CacheProviderFactory } from './routing/index';
import { ConnectionManager } from './models/connection';
import { RedisCachingMarketDataProvider } from './providers/redis';
import { WebSseTransport } from './utils/sse-transport';

// Map to store active transports: sessionId -> Transport
const transports = new Map<string, WebSseTransport>();

export default {
  async fetch(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === '/mcp') {
      return handleMcpConnection(request, env, ctx);
    }

    if (path === '/messages') {
        if (request.method !== 'POST') {
            return new Response('Method Not Allowed', { status: 405 });
        }
        return handlePostMessage(request);
    }

    // Handle API routes or UI if necessary, but for now focus on MCP
    // Minimal fallback
    return new Response('Not Found', { status: 404 });
  }
};

async function handleMcpConnection(request: Request, env: any, ctx: any): Promise<Response> {
    const url = new URL(request.url);

    // Authenticate Session (Simplified for Worker)
    // Note: ConnectionManager uses Prisma, so it must work in the worker.
    let token = url.searchParams.get('token');
    if (!token && request.headers.get('Authorization')) {
        const auth = request.headers.get('Authorization') || '';
        if (auth.startsWith('Bearer ')) {
            token = auth.substring(7);
        }
    }

    let configToUse: Record<string, any> = {};
    let session;
    let cacheFactory: CacheProviderFactory | undefined;

    // Use ConnectionManager if token provided
    if (token) {
        try {
            session = await ConnectionManager.validateSession(token);
        } catch (e) {
            console.error("Session validation error:", e);
        }

        if (!session) {
            return new Response('Invalid or expired session token', { status: 401 });
        }

        // Merge config
        configToUse = {
             ...(session.connection.config as Record<string, any>),
             ...session.connection.decryptedCredentials
        };

        // Setup Redis Cache if configured
        const sessionId = session.id;
        cacheFactory = (provider, ttlMs) => {
               // Assuming Redis is accessible via env or direct connection.
               // Redis provider uses 'ioredis'.
               return new RedisCachingMarketDataProvider(provider, sessionId, '1', ttlMs);
        };
    } else {
        // Fallback: Use Query Params
        const params = url.searchParams;
        const configKeys = [
            'ALPACA_API_KEY', 'ALPACA_SECRET_KEY',
            'POLYGON_API_KEY', 'FMP_API_KEY', 'FINNHUB_API_KEY',
            'ENABLE_CACHING', 'CACHE_TTL'
        ];
        configKeys.forEach(key => {
            if (params.has(key)) {
                const val = params.get(key);
                if (key === 'ENABLE_CACHING') configToUse[key] = val === 'true';
                else if (key === 'CACHE_TTL') configToUse[key] = parseInt(val!, 10);
                else configToUse[key] = val;
            }
        });

        // Load env vars if needed (Cloudflare Env)
        if (env.ALPACA_API_KEY) configToUse['ALPACA_API_KEY'] = env.ALPACA_API_KEY;
        if (env.ALPACA_SECRET_KEY) configToUse['ALPACA_SECRET_KEY'] = env.ALPACA_SECRET_KEY;
        // ... add others as needed
    }

    // Initialize Router
    const router = new Router(configToUse, cacheFactory);

    // Initialize MCP Core
    const mcp = new McpCore(router);
    const server = mcp.getServer();

    // Create a new Transport
    const sessionId = session ? session.id : crypto.randomUUID();

    // Create a TransformStream to handle SSE
    const { readable, writable } = new TransformStream();
    const transport = new WebSseTransport(readable, writable); // actually we pass writable to send events

    // Connect server to transport
    await server.connect(transport);

    // Store transport
    transports.set(sessionId, transport);

    transport.onclose = () => {
        transports.delete(sessionId);
        server.close();
    };

    // Return the response stream
    return new Response(readable, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
}

async function handlePostMessage(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');

    if (!sessionId || !transports.has(sessionId)) {
        return new Response('Session not found', { status: 404 });
    }

    const transport = transports.get(sessionId)!;

    try {
        const body = await request.json();
        await transport.handlePostMessage(body as any);
        return new Response('Accepted', { status: 202 });
    } catch (e) {
        console.error("Error processing message:", e);
        return new Response('Bad Request', { status: 400 });
    }
}
