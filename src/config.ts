import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.string().default('3000'),
  ALPACA_API_KEY: z.string().optional(),
  ALPACA_SECRET_KEY: z.string().optional(),
  POLYGON_API_KEY: z.string().optional(),
  FMP_API_KEY: z.string().optional(),
  FINNHUB_API_KEY: z.string().optional(),
  TWELVE_DATA_API_KEY: z.string().optional(),
  DEFAULT_DISCOVERY_PROVIDER: z.string().default('mock'),
  DEFAULT_QUOTES_PROVIDER: z.string().default('mock'),
  DEFAULT_BARS_PROVIDER: z.string().default('mock'),
  DEFAULT_CONTEXT_PROVIDER: z.string().default('mock'),
  ENABLE_CACHING: z.string().transform(v => v === 'true').default('true'),
  CACHE_TTL: z.string().transform(v => parseInt(v, 10)).default('60000'),
  MCP_API_KEY: z.string().optional(),
  MCP_API_KEYS: z.string().optional(),
});

export const config = ConfigSchema.parse(process.env);
