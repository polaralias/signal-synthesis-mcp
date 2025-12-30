import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { config } from './config';
import { Router, CacheProviderFactory } from './routing/index';
import { z } from 'zod';
import { discoverCandidates } from './tools/discovery';
import { filterTradeable } from './tools/filters';
import { enrichIntraday, enrichContext, enrichEod } from './tools/enrichment';
import { rankSetups } from './tools/ranking';
import { explainRouting } from './tools/debug';
import { planAndRun } from './tools/orchestrator';
import apiRouter from './routes/api';
import { ConnectionManager } from './models/connection';
import { RedisCachingMarketDataProvider } from './providers/redis';

export class FinancialServer {
  private server: Server | null = null;
  // Keep a default router for Stdio or fallback, but we will create per-request routers for HTTP
  private defaultRouter: Router;

  constructor() {
    this.defaultRouter = new Router();
  }

  private createMcpServer(router: Router): Server {
    const server = new Server(
      {
        name: 'financial-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers(server, router);

    // Error handling
    server.onerror = (error) => console.error('[MCP Error]', error);

    return server;
  }

  private setupToolHandlers(server: Server, router: Router) {
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
    const port = process.env.PORT;

    if (port) {
      const app = express();

      // Trust proxy for correct protocol/IP handling behind reverse proxies
      app.set('trust proxy', true);

      // Enable CORS
      app.use(cors({
        origin: true, // Reflect the request origin
        credentials: true
      }));

      const transports = new Map<string, SSEServerTransport>();

      // Mount API routes
      app.use('/api', apiRouter);

      // Serve static files for UI
      app.use(express.static(path.join(__dirname, '../public')));

      app.get('/mcp', async (req, res) => {
        // Set headers for SSE to avoid buffering
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Crucial for Nginx

        // Authenticate Session
        let token = req.query.token as string;
        if (!token && req.headers.authorization) {
          const auth = req.headers.authorization;
          if (auth.startsWith('Bearer ')) {
            token = auth.substring(7);
          }
        }

        let session;
        let configToUse: Record<string, any> = {};
        let cacheFactory: CacheProviderFactory | undefined;

        if (token) {
           session = await ConnectionManager.validateSession(token);
           if (!session) {
             res.status(401).send('Invalid or expired session token');
             return;
           }

           // Merge config and credentials
           configToUse = {
             ...(session.connection.config as Record<string, any>),
             ...session.connection.decryptedCredentials
           };

           // Configure Cache Factory for Redis
           // We capture session ID here for isolation
           const sessionId = session.id;
           cacheFactory = (provider, ttlMs) => {
               return new RedisCachingMarketDataProvider(provider, sessionId, '1', ttlMs);
           };

        } else {
           // Fallback to legacy query params
           const query = req.query as Record<string, string>;
           const configKeys = [
            'ALPACA_API_KEY', 'ALPACA_SECRET_KEY',
            'POLYGON_API_KEY', 'FMP_API_KEY', 'FINNHUB_API_KEY',
            'ENABLE_CACHING', 'CACHE_TTL'
           ];
           configKeys.forEach(key => {
             if (query[key]) {
                if (key === 'ENABLE_CACHING') configToUse[key] = query[key] === 'true';
                else if (key === 'CACHE_TTL') configToUse[key] = parseInt(query[key], 10);
                else configToUse[key] = query[key];
             }
           });
        }

        // Create a new router with the session config and cache factory
        const router = new Router(configToUse, cacheFactory);

        // Create a new MCP Server instance for this session
        const server = this.createMcpServer(router);

        // Generate session ID (use the persistent session ID if available, else random)
        const transportSessionId = session ? session.id : crypto.randomUUID();

        const transport = new SSEServerTransport(`/messages?sessionId=${transportSessionId}`, res);
        await server.connect(transport);

        transports.set(transportSessionId, transport);

        transport.onclose = () => {
             transports.delete(transportSessionId);
             server.close(); // Clean up server resources
        };
      });

      app.post('/messages', async (req, res) => {
        const sessionId = req.query.sessionId as string;
        const transport = transports.get(sessionId);
        if (transport) {
          await transport.handlePostMessage(req, res);
        } else {
          res.status(404).send('Session not found');
        }
      });

      app.listen(port, () => {
        console.error(`Financial MCP Server running on HTTP port ${port}`);
      });

      process.on('SIGINT', async () => {
        // We can't easily close all dynamic servers, but the process exit will handle it.
        process.exit(0);
      });

    } else {
      // Stdio mode
      const server = this.createMcpServer(this.defaultRouter);
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('Financial MCP Server running on stdio');

      process.on('SIGINT', async () => {
        await server.close();
        process.exit(0);
      });
    }
  }
}
