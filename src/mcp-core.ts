import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Router } from './routing/index';
import { discoverCandidates } from './tools/discovery';
import { filterTradeable } from './tools/filters';
import { enrichIntraday, enrichContext, enrichEod } from './tools/enrichment';
import { rankSetups } from './tools/ranking';
import { planAndRun } from './tools/orchestrator';
import { explainRouting } from './tools/debug';

export class McpCore {
  private server: Server;
  private router: Router;

  constructor(router: Router) {
    this.router = router;
    this.server = new Server(
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

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);
  }

  public getServer(): Server {
    return this.server;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
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
          name: 'explain_routing',
          description: 'Debug tool to explain current routing configuration',
          inputSchema: {
            type: 'object',
            properties: {},
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
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === 'plan_and_run') {
        const schema = z.object({
          intent: z.enum(['day_trade', 'swing', 'long_term']).optional(),
        });
        const { intent } = schema.parse(args);
        const results = await planAndRun(this.router, intent);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'get_quotes') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const quotes = await this.router.getQuotesProvider().getQuotes(symbols);
        return { content: [{ type: 'text', text: JSON.stringify(quotes, null, 2) }] };
      }

      if (name === 'discover_candidates') {
        const schema = z.object({
          intent: z.enum(['day_trade', 'swing', 'long_term']).optional(),
          limit: z.number().optional(),
        });
        const { intent, limit } = schema.parse(args);
        const results = await discoverCandidates(this.router, intent, limit);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'filter_tradeable') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await filterTradeable(this.router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'enrich_intraday') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await enrichIntraday(this.router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'enrich_context') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await enrichContext(this.router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'enrich_eod') {
        const schema = z.object({
          symbols: z.array(z.string()),
        });
        const { symbols } = schema.parse(args);
        const results = await enrichEod(this.router, symbols);
        return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
      }

      if (name === 'explain_routing') {
         const results = explainRouting(this.router);
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

      throw new McpError(
        ErrorCode.MethodNotFound,
        `Unknown tool: ${request.params.name}`
      );
    });
  }
}
