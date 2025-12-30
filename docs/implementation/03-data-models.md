# Data Models & Schemas

This document defines the core Zod schemas and TypeScript interfaces that serve as the "canonical" representation of data within the system.

## 1. Market Data Models

```typescript
import { z } from 'zod';

export const BarSchema = z.object({
  timestamp: z.date(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  vwap: z.number().optional(),
});
export type Bar = z.infer<typeof BarSchema>;

export const QuoteSchema = z.object({
  symbol: z.string(),
  bidPrice: z.number(),
  bidSize: z.number(),
  askPrice: z.number(),
  askSize: z.number(),
  lastPrice: z.number().optional(),
  lastSize: z.number().optional(),
  timestamp: z.date(),
  provider: z.string(), // Provenance
});
export type Quote = z.infer<typeof QuoteSchema>;

export const MarketSnapshotSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  changePercent: z.number(),
  volume: z.number(),
  description: z.string().optional(),
  source: z.string(),
});
export type MarketSnapshot = z.infer<typeof MarketSnapshotSchema>;
```

## 2. Context Data Models

```typescript
export const CompanyProfileSchema = z.object({
  symbol: z.string(),
  name: z.string(),
  sector: z.string().optional(),
  industry: z.string().optional(),
  description: z.string().optional(),
  website: z.string().optional(),
  employees: z.number().optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

export const FinancialMetricsSchema = z.object({
  symbol: z.string(),
  marketCap: z.number().optional(),
  sharesOutstanding: z.number().optional(),
  floatShares: z.number().optional(),
  peRatio: z.number().optional(),
  dividendYield: z.number().optional(),
  earningsDate: z.date().optional(),
});
export type FinancialMetrics = z.infer<typeof FinancialMetricsSchema>;

export const NewsItemSchema = z.object({
  id: z.string(),
  headline: z.string(),
  summary: z.string().optional(),
  source: z.string(),
  url: z.string(),
  timestamp: z.date(),
  sentiment: z.number().optional(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;
```

## 3. Analysis Models (Outputs)

```typescript
export const TradeSetupSchema = z.object({
  symbol: z.string(),
  setupType: z.string(), // e.g., "ORB", "Pullback"
  triggerPrice: z.number(),
  stopLoss: z.number(),
  targetPrice: z.number().optional(),
  confidence: z.number(), // 0.0 to 1.0
  reasoning: z.array(z.string()),
  validUntil: z.date().optional(),
});
export type TradeSetup = z.infer<typeof TradeSetupSchema>;

export const OpportunitySchema = z.object({
  symbol: z.string(),
  thesis: z.string(),
  timeHorizon: z.enum(["swing", "long_term"]),
  risks: z.array(z.string()),
  supportingMetrics: z.record(z.any()),
});
export type Opportunity = z.infer<typeof OpportunitySchema>;
```

## 4. Orchestration Models

```typescript
export const RoutingContextSchema = z.object({
  sessionId: z.string(),
  discoveryProvider: z.string(),
  quotesProvider: z.string(),
  barsProvider: z.string(),
  contextProvider: z.string(),
});
export type RoutingContext = z.infer<typeof RoutingContextSchema>;

export const PlanAndRunRequestSchema = z.object({
  query: z.string(),
  riskProfile: z.enum(["aggressive", "balanced", "conservative"]).optional().default("balanced"),
  horizon: z.enum(["day", "swing", "long"]).optional(),
});
export type PlanAndRunRequest = z.infer<typeof PlanAndRunRequestSchema>;

export const PlanAndRunResponseSchema = z.object({
  candidates: z.array(TradeSetupSchema),
  provenance: RoutingContextSchema,
  warnings: z.array(z.string()),
});
export type PlanAndRunResponse = z.infer<typeof PlanAndRunResponseSchema>;
```
