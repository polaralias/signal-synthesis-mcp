
export class HealthMonitor {
  private errors: Map<string, number> = new Map();
  private lastReset: number = Date.now();
  private readonly ERROR_THRESHOLD = 5;
  private readonly RESET_INTERVAL = 60000; // 1 minute

  constructor() {}

  recordSuccess(providerName: string): void {
    this.checkReset();
    // Success resets the error count for that provider to 0.
    // This implements a "consecutive error" circuit breaker logic.
    this.errors.set(providerName, 0);
  }

  recordError(providerName: string): void {
    this.checkReset();
    const current = this.errors.get(providerName) || 0;
    this.errors.set(providerName, current + 1);
  }

  isHealthy(providerName: string): boolean {
    this.checkReset();
    const current = this.errors.get(providerName) || 0;
    return current < this.ERROR_THRESHOLD;
  }

  private checkReset(): void {
    if (Date.now() - this.lastReset > this.RESET_INTERVAL) {
      this.errors.clear();
      this.lastReset = Date.now();
    }
  }

  getStats(): Record<string, number> {
    return Object.fromEntries(this.errors);
  }
}
