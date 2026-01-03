import { z } from 'zod';

// Define the configuration schema using Zod
// This schema will be used to generate the UI and validate inputs
export const ConfigSchema = z.object({
  ALPACA_API_KEY: z.string().optional().describe('Alpaca API Key'),
  ALPACA_SECRET_KEY: z.string().optional().describe('Alpaca Secret Key'),
  POLYGON_API_KEY: z.string().optional().describe('Polygon API Key'),
  FMP_API_KEY: z.string().optional().describe('FMP API Key'),
  FINNHUB_API_KEY: z.string().optional().describe('Finnhub API Key'),
  TWELVE_DATA_API_KEY: z.string().optional().describe('Twelve Data API Key'),
  // Add other necessary config fields here
});

export type ConfigType = z.infer<typeof ConfigSchema>;

// Helper to get schema metadata for UI generation
export function getConfigMetadata() {
  const shape = ConfigSchema.shape;
  const fields = Object.entries(shape).map(([key, schema]) => {
    let description = '';
    let isOptional = false;

    // Handle ZodOptional by unwrapping the inner type
    // Use type guards or any to bypass TS checks if necessary for generic schema traversal
    const s = schema as any;
    if (s instanceof z.ZodOptional || s._def.typeName === 'ZodOptional') {
      isOptional = true;
      const inner = s._def.innerType;
      if (inner instanceof z.ZodString || inner._def.typeName === 'ZodString') {
        description = inner.description || '';
      }
    } else if (s instanceof z.ZodString || s._def.typeName === 'ZodString') {
      description = s.description || '';
    }

    return {
      key: key,
      label: key,
      type: 'string', // Assuming all are strings for simplicity for now
      required: !isOptional,
      secret: key.includes('KEY') || key.includes('SECRET'), // Heuristic for secret fields
      default: "",
      enum: [] as string[],
      help: description || "Where to find this value"
    };
  });

  return {
    id: "signal-synthesis-mcp",
    name: "Signal Synthesis MCP Server",
    description: "Signal synthesis and financial data server",
    version: "1.0.0",
    fields
  };
}
