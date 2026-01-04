import express from 'express';
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
import { config } from './config';
import { Router } from './routing/index';
import { z } from 'zod';
import { discoverCandidates } from './tools/discovery';
import { filterTradeable } from './tools/filters';
import { enrichIntraday, enrichContext, enrichEod } from './tools/enrichment';
import { rankSetups } from './tools/ranking';
import { explainRouting } from './tools/debug';
import { planAndRun } from './tools/orchestrator';
import { hashToken, verifyToken, decrypt, generateRandomString } from './services/security';
import connectRouter from './routes/connect';
import tokenRouter from './routes/token';
import wellKnownRouter from './routes/well-known';
import { ConfigType } from './config-schema';
import { prisma } from './services/database';
import { requestContext } from './context';
import { validateApiKey } from './utils/auth';
import { renderLandingPage } from './templates/landing-page';
import { renderConnectPage } from './templates/connect-ui';
import { getBaseUrl } from './utils/url';
import { generateRandomString } from './services/security';
import cookieParser from 'cookie-parser';

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
      app.get('/', (req, res) => {
        const baseUrl = getBaseUrl(req);
        const { redirect_uri, state, code_challenge, code_challenge_method } = req.query;

        // If OAuth PKCE parameters are present, render the Connect UI
        if (redirect_uri && state && code_challenge && code_challenge_method === 'S256') {
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
            csrfToken
          );
          return res.send(html);
        }

        // Otherwise, render the Landing Page
        const html = renderLandingPage(baseUrl);
        res.send(html);
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
            res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
            return;
          }
        }

        // 2. Fallback to API Key if no valid OAuth router found
        if (!requestRouter && apiKey) {
          if (validateApiKey(apiKey)) {
            if (process.env.DEBUG_MCP) {
              console.log('[MCP] Authed via API Key');
            }
            requestRouter = this.defaultRouter;
          } else {
            res.status(401).json({ error: 'Unauthorized', message: 'Invalid API Key' });
            return;
          }
        }

        // 3. Fallback to 401
        if (!requestRouter) {
          res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
          return;
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
            }
          });

          transport.onclose = () => {
            // Clean up defensively - although onsessionclosed should handle it
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
