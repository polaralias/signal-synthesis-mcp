# Routing Logic & Configuration

This document details the logic for the `Router` component, which decides which provider to use for each task.

## Configuration

Configuration is loaded from environment variables (and potentially a config file in the future).

### Environment Variables

*   `ALPACA_API_KEY`, `ALPACA_SECRET_KEY`
*   `POLYGON_API_KEY`
*   `FMP_API_KEY`
*   `FINNHUB_API_KEY`
*   `TWELVE_DATA_API_KEY`
*   `DEFAULT_DISCOVERY_PROVIDER` (default: `polygon`)
*   `DEFAULT_QUOTES_PROVIDER` (default: `alpaca`)
*   `DEFAULT_BARS_PROVIDER` (default: `alpaca`)
*   `DEFAULT_CONTEXT_PROVIDER` (default: `fmp`)

## Routing Strategy

The router operates in three layers:

1.  **Configuration Check**: Only consider providers that have valid API keys configured.
2.  **Health Check**: Filter out providers that are currently in a "down" or "rate-limited" state.
3.  **Selection**: Pick the best remaining provider based on "strength" or stickiness.

### Provider Jobs

We define four distinct jobs:
1.  **Discovery**: Finding symbols. Best: Polygon (movers), FMP (screeners).
2.  **Quotes**: Real-time price checks. Best: Alpaca (IEX), Polygon (delayed/real-time).
3.  **Bars**: History. Best: Polygon (quality), Alpaca.
4.  **Context**: Fundamentals. Best: FMP, Finnhub.

### Stickiness Logic

To ensure data consistency, the `planAndRun` orchestrator creates a `RoutingContext` at the start of a request.

1.  **Plan Phase**: The Router selects a provider for each job *once* at the beginning.
2.  **Run Phase**: All subsequent tool calls in that execution pass the `RoutingContext`.
    *   If `enrichIntraday` is called, it asks the router: `getBarsProvider(context)`.
    *   The router returns the provider saved in the context.

### Health & Circuit Breaking

The `Router` maintains a `ProviderHealth` registry.

*   **Success**: Decrements error count.
*   **429 (Rate Limit)**: Marks provider as `RATE_LIMITED` for a backoff period (e.g., 60s).
*   **5xx (Server Error)**: Increments error count. If count > threshold, mark `UNHEALTHY` for a backoff period.
*   **Fallback**: If the assigned provider is `RATE_LIMITED` or `UNHEALTHY`, the router selects the next best available provider and updates the context (logging a warning).

## Implementation Sketch

```typescript
class Router {
    private providers: Map<string, Provider>;
    private health: Map<string, HealthState>;

    constructor(config: Config) {
        this.providers = this.initProviders(config);
        this.health = new Map();
        // Initialize health for each provider
    }

    public planRoute(intent: string): RoutingContext {
        // Simple logic for MVP: use defaults if healthy
        return {
            sessionId: uuidv4(),
            discoveryProvider: this.pickProvider("discovery"),
            quotesProvider: this.pickProvider("quotes"),
            barsProvider: this.pickProvider("bars"),
            contextProvider: this.pickProvider("context"),
        };
    }

    private pickProvider(jobType: JobType): string {
        const candidates = this.providerMap[jobType];
        for (const name of candidates) {
            if (this.health.get(name)?.isHealthy()) {
                return name;
            }
        }
        throw new Error(`No healthy providers for ${jobType}`);
    }
}
```
