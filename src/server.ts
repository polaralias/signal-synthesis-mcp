import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { Router } from './routing/index';
import { z } from 'zod';
import { discoverCandidates } from './tools/discovery';
import { filterTradeable } from './tools/filters';
import { enrichIntraday, enrichContext, enrichEod } from './tools/enrichment';
import { rankSetups } from './tools/ranking';
import { explainRouting } from './tools/debug';
import { planAndRun } from './tools/orchestrator';
import { hashToken, verifyToken, generateRandomString, hashCode } from './services/security';
import { isMasterKeyPresent } from './security/masterKey';
import connectRouter from './routes/connect';
import tokenRouter from './routes/token';
import wellKnownRouter from './routes/well-known';
import registerRouter from './routes/register';
import apiKeysRouter from './routes/api-keys';
import { ApiKeyService } from './services/api-key';
import { decrypt, encrypt } from './security/crypto';
import { prisma } from './services/database';
import { requestContext } from './context';
import { validateApiKey } from './utils/auth';
import { renderConnectPage } from './templates/connect-ui';
import cookieParser from 'cookie-parser';
import { unauthorized } from './utils/oauth-discovery';

export class SignalSynthesisServer {
  private server: Server | null = null;
  // Keep a default router for Stdio or fallback
  private defaultRouter: Router;
  private sessions = new Map<string, StreamableHTTPServerTransport>();
  private routerCache = new Map<string, Router>();

  constructor() {
    this.defaultRouter = new Router();
  }

  private createMcpServer(): Server {
    const server = new Server(
      {
        name: 'signal-synthesis-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers(server);

    // Error handling
    server.onerror = (error) => console.error('[MCP Error]', error);

    return server;
  }

  private setupToolHandlers(server: Server) {
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'plan_and_run',
          description: 'Execute a full analysis pipeline: Discovery -> Filter -> Enrich -> Rank',
          inputSchema: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                enum: ['day_trade', 'swing', 'long_term'],
                description: 'Trading intent',
              },
            },
          },
        },
        {
          name: 'get_quotes',
          description: 'Get real-time quotes for a list of symbols',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of stock symbols (e.g. ["AAPL", "TSLA"])',
              },
            },
            required: ['symbols'],
          },
        },
        {
          name: 'discover_candidates',
          description: 'Discover potential trade candidates based on intent (day_trade, swing, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              intent: {
                type: 'string',
                enum: ['day_trade', 'swing', 'long_term'],
                description: 'Trading intent',
              },
              limit: {
                type: 'number',
                description: 'Max number of candidates',
              },
              minPrice: { type: 'number', description: 'Minimum price' },
              maxPrice: { type: 'number', description: 'Maximum price' },
              minVolume: { type: 'number', description: 'Minimum volume' },
              sector: { type: 'string', description: 'Filter by sector' },
              minMarketCap: { type: 'number', description: 'Minimum market cap' },
            },
          },
        },
        {
          name: 'filter_tradeable',
          description: 'Filter candidates for tradeability (price, spread, volume)',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of symbols to filter',
              },
            },
            required: ['symbols'],
          },
        },
        {
          name: 'enrich_intraday',
          description: 'Enrich symbols with intraday data (VWAP, ATR)',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of symbols',
              },
            },
            required: ['symbols'],
          },
        },
        {
          name: 'enrich_eod',
          description: 'Enrich symbols with End-of-Day data (SMA, etc.)',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of symbols',
              },
            },
            required: ['symbols'],
          },
        },
        {
          name: 'enrich_context',
          description: 'Enrich symbols with fundamental context (Profile, Metrics)',
          inputSchema: {
            type: 'object',
            properties: {
              symbols: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of symbols',
              },
            },
            required: ['symbols'],
          },
        },
        {
          name: 'rank_setups',
          description: 'Rank trade setups based on technicals',
          inputSchema: {
            type: 'object',
            properties: {
              intradayData: {
                type: 'object',
                description: 'JSON object of IntradayStats keyed by symbol',
              },
              contextData: {
                type: 'object',
                description: 'JSON object of ContextData keyed by symbol',
              },
              eodData: {
                type: 'object',
                description: 'JSON object of EodStats keyed by symbol',
              },
            },
            required: ['intradayData'],
          },
        },
        {
          name: 'explain_routing',
          description: 'Debug tool to explain current routing configuration',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ],
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const context = requestContext.getStore();

      // If no context is available (e.g. stdio), fallback to defaultRouter
      const router = context ? context.router : this.defaultRouter;

      if (name === 'plan_and_run') {
        const schema = z.object({
          intent: z.enum(['day_trade', 'swing', 'long_term']).optional(),
        });
        const { intent } = schema.parse(args);
        const results = await planAndRun(router, intent);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'get_quotes') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const quotes = await router.getQuotesProvider().getQuotes(symbols);
        return { content: [{ type: 'text', text: JSON.stringify(quotes, null, 2) }] };
      }

      if (name === 'discover_candidates') {
        const schema = z.object({
          intent: z.enum(['day_trade', 'swing', 'long_term']).optional(),
          limit: z.number().optional(),
          minPrice: z.number().optional(),
          maxPrice: z.number().optional(),
          minVolume: z.number().optional(),
          sector: z.string().optional(),
          minMarketCap: z.number().optional(),
        });
        const { intent, limit, minPrice, maxPrice, minVolume, sector, minMarketCap } = schema.parse(args);
        const criteria = { minPrice, maxPrice, minVolume, sector, minMarketCap };
        const results = await discoverCandidates(router, intent, limit, criteria);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'filter_tradeable') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await filterTradeable(router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'enrich_intraday') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await enrichIntraday(router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'enrich_context') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await enrichContext(router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'enrich_eod') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await enrichEod(router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'rank_setups') {
        const schema = z.object({
          intradayData: z.record(z.any()),
          contextData: z.record(z.any()).optional().default({}),
          eodData: z.record(z.any()).optional().default({}),
        });
        const { intradayData, contextData, eodData } = schema.parse(args);
        const results = rankSetups(intradayData, contextData, eodData);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'explain_routing') {
        const results = explainRouting(router);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`
      );
    });
  }

  async start() {
    // Create the MCP Server instance once at startup
    this.server = this.createMcpServer();

    const port = process.env.PORT;

    if (port) {
      const app = express();

      // Trust proxy for correct protocol/IP handling behind reverse proxies
      app.set('trust proxy', 1);

      app.use(cookieParser());

      // GET /
      app.get('/', async (req, res) => {
        const { redirect_uri, state, code_challenge, code_challenge_method, client_id } = req.query;

        // If OAuth PKCE parameters are present, render the Connect UI
        if (redirect_uri && state && code_challenge && code_challenge_method === 'S256' && client_id) {
          try {
            // Validate client
            const client = await prisma.oAuthClient.findUnique({
              where: { id: client_id as string }
            });

            if (!client || !client.redirectUris.includes(redirect_uri as string)) {
              return res.status(400).send('Invalid client_id or redirect_uri');
            }

            // CSRF Protection (matching connect.ts logic)
            const csrfToken = generateRandomString(32);
            res.cookie('csrfToken', csrfToken, {
              httpOnly: true,
              secure: process.env.NODE_ENV === 'production',
              sameSite: 'lax',
              maxAge: 3600000 // 1 hour
            });

            const html = renderConnectPage(
              redirect_uri as string,
              state as string,
              code_challenge as string,
              code_challenge_method as string,
              csrfToken,
              client_id as string
            );
            return res.send(html);
          } catch (error: any) {
            console.error('Error in landing page OAuth handling', error);
            return res.status(500).send('Internal Server Error');
          }
        }

        // Otherwise, serve the Dashboard UI
        res.sendFile(path.join(__dirname, '../public/index.html'));
      });

      // Health Check
      app.get('/health', (req, res) => {
        res.json({ status: 'ok' });
      });

      // Enable CORS
      app.use(cors({
        origin: true, // Reflect the request origin
        credentials: true
      }));

      app.use(express.json());

      // Register Auth Routes
      app.use(connectRouter);
      app.use(tokenRouter);
      app.use(wellKnownRouter);
      app.use(registerRouter);
      console.log('Mounting API Keys Router at /api');
      app.use("/api", apiKeysRouter);

      // --- Standardized Dashboard API ---

      app.get('/api/config-status', (req: Request, res: Response) => {
        res.json({
          status: isMasterKeyPresent() ? 'present' : 'missing',
          mode: process.env.API_KEY_MODE || 'disabled'
        });
      });

      app.get('/api/master-key-status', (req: Request, res: Response) => {
        res.json({ configured: isMasterKeyPresent() });
      });

      app.get('/api/connections', async (req: Request, res: Response) => {
        try {
          const connections = await prisma.connection.findMany({
            select: { id: true, displayName: true }
          });
          res.json(connections.map(c => ({ id: c.id, name: c.displayName })));
        } catch (error) {
          console.error('[API] Failed to fetch connections:', error);
          res.status(500).json({ error: 'Failed to fetch connections' });
        }
      });

      app.post('/api/connections', async (req: Request, res: Response) => {
        if (!isMasterKeyPresent()) {
          return res.status(403).json({ error: 'MASTER_KEY is not configured' });
        }
        try {
          const { name, credentials, config } = req.body;
          // Support both {name, credentials} and {name, config} formats
          const configData = credentials ?? config ?? {};
          const configJson = JSON.stringify(configData);
          const configEncrypted = encrypt(configJson);

          const connection = await prisma.connection.create({
            data: {
              displayName: name || 'New Connection',
              configEncrypted,
              configVersion: 1,
            }
          });
          res.json({ id: connection.id, name: connection.displayName });
        } catch (error) {
          console.error('[API] Failed to create connection:', error);
          res.status(500).json({ error: 'Failed to create connection' });
        }
      });

      app.post('/api/connections/:id/sessions', async (req: Request, res: Response) => {
        if (!isMasterKeyPresent()) {
          return res.status(403).json({ error: 'MASTER_KEY is not configured' });
        }
        try {
          const connectionId = req.params.id;

          // Verify connection exists
          const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
          if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
          }

          const token = generateRandomString(64);
          const tokenHash = await hashToken(token);
          const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

          await prisma.session.create({
            data: {
              connectionId,
              tokenHash,
              expiresAt,
            }
          });
          res.json({ token });
        } catch (error) {
          console.error('[API] Failed to create session:', error);
          res.status(500).json({ error: 'Failed to create session' });
        }
      });

      // New ClickUp-compatible endpoint: POST /api/sessions
      app.post('/api/sessions', async (req: Request, res: Response) => {
        if (!isMasterKeyPresent()) {
          return res.status(403).json({ error: 'MASTER_KEY is not configured' });
        }
        try {
          const { connectionId } = req.body;

          // Verify connection exists
          const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
          if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
          }

          const token = generateRandomString(64);
          const tokenHash = await hashToken(token);
          const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

          await prisma.session.create({
            data: {
              connectionId,
              tokenHash,
              expiresAt,
            }
          });
          res.json({ accessToken: token });
        } catch (error) {
          console.error('[API] Failed to create session:', error);
          res.status(500).json({ error: 'Failed to create session' });
        }
      });

      // GET /api/connections/:id - Return safe connection metadata
      app.get('/api/connections/:id', async (req: Request, res: Response) => {
        try {
          const connectionId = req.params.id;
          const connection = await prisma.connection.findUnique({ 
            where: { id: connectionId } 
          });

          if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
          }

          // Sanitize config (redact secrets)
          let sanitizedConfig = {};
          try {
            const configJson = decrypt(connection.configEncrypted);
            const config = JSON.parse(configJson);
            
            // Redact sensitive fields
            sanitizedConfig = Object.entries(config).reduce((acc, [key, value]) => {
              const lowerKey = key.toLowerCase();
              if (lowerKey.includes('key') || lowerKey.includes('secret') || 
                  lowerKey.includes('password') || lowerKey.includes('token')) {
                acc[key] = '***REDACTED***';
              } else {
                acc[key] = value;
              }
              return acc;
            }, {} as Record<string, any>);
          } catch (e) {
            console.error('Failed to decrypt config for connection', connectionId, e);
          }

          res.json({
            id: connection.id,
            name: connection.displayName,
            createdAt: connection.createdAt,
            config: sanitizedConfig
          });
        } catch (error) {
          console.error('[API] Failed to fetch connection:', error);
          res.status(500).json({ error: 'Failed to fetch connection' });
        }
      });

      // GET /api/connections/:id/sessions - List sessions for a connection
      app.get('/api/connections/:id/sessions', async (req: Request, res: Response) => {
        try {
          const connectionId = req.params.id;
          const sessions = await prisma.session.findMany({
            where: { connectionId },
            orderBy: { createdAt: 'desc' }
          });

          res.json(sessions.map(s => ({
            id: s.id,
            expiresAt: s.expiresAt,
            revoked: !!s.revokedAt,
            revokedAt: s.revokedAt,
            createdAt: s.createdAt
          })));
        } catch (error) {
          console.error('[API] Failed to fetch sessions:', error);
          res.status(500).json({ error: 'Failed to fetch sessions' });
        }
      });

      // POST /api/sessions/:id/revoke - Revoke a session
      app.post('/api/sessions/:id/revoke', async (req: Request, res: Response) => {
        if (!isMasterKeyPresent()) {
          return res.status(403).json({ error: 'MASTER_KEY is not configured' });
        }
        try {
          const sessionId = req.params.id;
          await prisma.session.update({
            where: { id: sessionId },
            data: { revokedAt: new Date() }
          });
          res.json({ success: true });
        } catch (error) {
          console.error('[API] Failed to revoke session:', error);
          res.status(500).json({ error: 'Failed to revoke session' });
        }
      });

      // DELETE /api/connections/:id - Delete a connection
      app.delete('/api/connections/:id', async (req: Request, res: Response) => {
        if (!isMasterKeyPresent()) {
          return res.status(403).json({ error: 'MASTER_KEY is not configured' });
        }
        try {
          const connectionId = req.params.id;
          await prisma.connection.delete({ where: { id: connectionId } });
          res.json({ success: true });
        } catch (error) {
          console.error('[API] Failed to delete connection:', error);
          res.status(500).json({ error: 'Failed to delete connection' });
        }
      });

      // Adapter for Dashboard OAuth flow
      app.post('/api/authorize', async (req: Request, res: Response) => {
        if (!isMasterKeyPresent()) {
          return res.status(403).json({ error: 'MASTER_KEY is not configured' });
        }
        try {
          const { connectionId, callbackUrl, state, clientId } = req.body;

          const connection = await prisma.connection.findUnique({ where: { id: connectionId } });
          if (!connection) {
            return res.status(404).json({ error: 'Connection not found' });
          }

          // Use provided clientId or create/find a default internal client
          let effectiveClientId = clientId;
          if (!effectiveClientId) {
            // Create or find a default internal client for dashboard flows
            const defaultClient = await prisma.oAuthClient.upsert({
              where: { id: 'internal-dashboard' },
              create: {
                id: 'internal-dashboard',
                clientName: 'Internal Dashboard',
                redirectUris: [callbackUrl],
                tokenEndpointAuthMethod: 'none'
              },
              update: {
                redirectUris: [callbackUrl]
              }
            });
            effectiveClientId = defaultClient.id;
          }

          // Generate Auth Code (mirrors connect.ts logic)
          const code = generateRandomString(32);
          const codeHash = hashCode(code);
          const expiresAt = new Date(Date.now() + 90 * 1000); // 90 seconds

          await prisma.authCode.create({
            data: {
              codeHash,
              connectionId,
              clientId: effectiveClientId,
              redirectUri: callbackUrl,
              state: state || '',
              codeChallenge: '', // Standard dashboard flow might not use PKCE if it's internal
              codeChallengeMethod: 'S256',
              expiresAt,
            }
          });

          const redirectUrl = new URL(callbackUrl);
          redirectUrl.searchParams.append('code', code);
          if (state) redirectUrl.searchParams.append('state', state);

          res.json({ redirectUrl: redirectUrl.toString() });
        } catch (error) {
          console.error('[API] Authorization failed:', error);
          res.status(500).json({ error: 'Authorization failed' });
        }
      });

      // Serve static files for UI (if any other than dynamically served)
      app.use(express.static(path.join(__dirname, '../public')));

      app.all('/mcp', async (req, res) => {
        const authHeader = req.headers.authorization;
        const apiKeyHeader = req.headers['x-api-key'] as string;
        const apiKeyQuery = req.query.apiKey as string;
        const apiKey = apiKeyHeader || apiKeyQuery;

        let requestRouter: Router | null = null;

        // 1. Try OAuth Bearer token
        if (authHeader && authHeader.startsWith('Bearer ')) {
          const token = authHeader.substring(7);
          const tokenHash = await hashToken(token);

          // Verify token against database
          const session = await prisma.session.findUnique({
            where: { tokenHash },
            include: { connection: true }
          });

          if (session && new Date() <= session.expiresAt) {
            const connectionId = session.connection.id;

            if (this.routerCache.has(connectionId)) {
              if (process.env.DEBUG_MCP) {
                console.log(`[MCP] Reusing cached router for connection ${connectionId}`);
              }
              requestRouter = this.routerCache.get(connectionId)!;
            } else {
              if (process.env.DEBUG_MCP) {
                console.log(`[MCP] Creating new router for connection ${connectionId}`);
              }
              // Decrypt configuration
              try {
                // Determine if we are using new crypto or old
                // For connection config, we assume it's using the same master key logic
                // The import `decrypt` is from `./security/crypto` now.
                const configString = decrypt(session.connection.configEncrypted);
                const connectionConfig = JSON.parse(configString);
                requestRouter = new Router(connectionConfig);
                this.routerCache.set(connectionId, requestRouter);
              } catch (e) {
                console.error('Failed to decrypt config for connection', session.connection.id, e);
                res.status(500).json({ error: 'Internal Server Error', message: 'Failed to load configuration' });
                return;
              }
            }
          } else if (session) {
            return unauthorized(req, res, 'Token expired');
          }
        }

        // 2. Fallback to API Key if no valid OAuth router found
        if (!requestRouter && apiKey) {
          // Check if it's a user-bound API key
          if (process.env.API_KEY_MODE === 'user_bound') {
            const apiKeyService = new ApiKeyService();
            const validKey = await apiKeyService.validateApiKey(apiKey);
            if (validKey && validKey.userConfig) {
              try {
                const configJson = decrypt(validKey.userConfig.configEncrypted);
                const userConfig = JSON.parse(configJson);

                const routerKey = `user_bound:${validKey.id}`;
                if (this.routerCache.has(routerKey)) {
                  requestRouter = this.routerCache.get(routerKey)!;
                } else {
                  requestRouter = new Router(userConfig);
                  this.routerCache.set(routerKey, requestRouter);
                }

                // Async Usage recording
                apiKeyService.recordUsage(validKey.id, req.ip);

              } catch (e) {
                console.error("Failed to load user bound config", e);
                // Don't leak error details
                // Proceed to check legacy keys or fail
              }
            }
          }

          // If we still don't have a router, check for legacy API Key
          if (!requestRouter && validateApiKey(apiKey)) {
            if (process.env.DEBUG_MCP) {
              console.log('[MCP] Authed via Legacy API Key');
            }
            requestRouter = this.defaultRouter;
          } else if (!requestRouter) {
            return unauthorized(req, res, 'Invalid API Key');
          }
        }

        // 3. Fallback to 401
        if (!requestRouter) {
          return unauthorized(req, res, 'Authentication required');
        }

        // Accept header normalization
        const accept = (req.headers.accept || "").toLowerCase().trim();
        if (
          !accept ||
          accept === '*/*' ||
          !accept.includes('application/json') ||
          !accept.includes('text/event-stream')
        ) {
          req.headers.accept = 'application/json, text/event-stream';
        }

        const sessionId = req.headers['mcp-session-id'] as string;
        let transport: StreamableHTTPServerTransport;

        if (sessionId && this.sessions.has(sessionId)) {
          transport = this.sessions.get(sessionId)!;
        } else {
          transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: () => generateRandomString(16),
            onsessioninitialized: (id) => {
              this.sessions.set(id, transport);
            },
            onsessionclosed: (id) => {
              this.sessions.delete(id);
            },
          });

          transport.onclose = () => {
            for (const [id, t] of this.sessions.entries()) {
              if (t === transport) {
                this.sessions.delete(id);
                break;
              }
            }
          };

          await this.server!.connect(transport);
        }

        await requestContext.run({ router: requestRouter }, async () => {
          await transport.handleRequest(req, res, req.body);
        });
      });

      app.listen(port, () => {
        console.error(`Signal Synthesis MCP Server running on HTTP port ${port}`);
      });

      process.on('SIGINT', async () => {
        if (this.server) {
          await this.server.close();
        }
        process.exit(0);
      });

    } else {
      // Stdio mode
      const transport = new StdioServerTransport();
      await this.server!.connect(transport);
      console.error('Signal Synthesis MCP Server running on stdio');

      process.on('SIGINT', async () => {
        await this.server!.close();
        process.exit(0);
      });
    }
  }
}
