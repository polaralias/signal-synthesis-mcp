# Testing Strategy

This document outlines the testing strategy to ensure the system is reliable and correct.

## 1. Unit Tests (`tests/unit/`)

Focus on individual components in isolation.

*   **Models**: Verify Zod validation (e.g., negative prices should raise error).
*   **Utils**: Test indicator calculations (VWAP, SMA) against known values.
*   **Providers**:
    *   Mock the API client (don't make real network calls).
    *   Verify that `getQuotes` returns the correct `Quote[]` object given a mock JSON response.
    *   Verify error handling: Does it raise `ProviderError` when the mock raises an exception?
*   **Router**:
    *   Test provider selection logic.
    *   Test health tracking (simulate 429s and check if provider is skipped).

## 2. Integration Tests (`tests/integration/`)

Focus on the interaction between components.

*   **Tool Chains**:
    *   Mock the Router to return specific Mock Providers.
    *   Run `filterTradeable` with a list of mock candidates and mock quotes. Verify it correctly filters out bad symbols.
    *   Run `planAndRun` with a mock pipeline. Verify the JSON structure of the final response.

## 3. Live/Sandbox Tests (Manual or Automated)

Verification against real APIs.

*   **Scripts**: Create `scripts/verify-alpaca.ts`, `scripts/verify-polygon.ts`.
*   **Execution**:
    *   Load real API keys from `.env`.
    *   Make a single call to `getMovers` or `getQuotes`.
    *   Print the result.
*   **Purpose**: Ensure API keys work, endpoints haven't changed, and network connectivity is good.
*   **Note**: These should *not* run in CI/CD unless using a recorded playback mechanism (like Polly.js) to avoid leaking keys or hitting rate limits.

## 4. Test Stack

*   **Framework**: `Vitest` or `Jest`
*   **Mocking**: Built-in mocking capabilities or `sinon`
*   **Linting**: `eslint`
*   **Formatting**: `prettier`

## 5. Pre-commit Checks

Before committing code:
1.  Run `npm run lint` (or `eslint .`)
2.  Run `npm run typecheck` (or `tsc --noEmit`)
3.  Run `npm test` (unit tests)
