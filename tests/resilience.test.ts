import { HealthMonitor } from '../src/routing/health';
import { ResilientMarketDataProvider } from '../src/providers/wrapper';
import { MockProvider } from '../src/providers/mock';
import { CircuitOpenError } from '../src/providers/wrapper';

describe('HealthMonitor', () => {
  let monitor: HealthMonitor;

  beforeEach(() => {
    monitor = new HealthMonitor();
  });

  it('should start healthy', () => {
    expect(monitor.isHealthy('test-provider')).toBe(true);
  });

  it('should track errors', () => {
    monitor.recordError('test-provider');
    const stats = monitor.getStats();
    expect(stats['test-provider']).toBe(1);
  });

  it('should become unhealthy after threshold', () => {
    for (let i = 0; i < 5; i++) {
        monitor.recordError('test-provider');
    }
    expect(monitor.isHealthy('test-provider')).toBe(false);
  });

  it('should reset errors on success', () => {
    monitor.recordError('test-provider');
    monitor.recordSuccess('test-provider');
    expect(monitor.getStats()['test-provider']).toBe(0);
    expect(monitor.isHealthy('test-provider')).toBe(true);
  });
});

describe('ResilientMarketDataProvider', () => {
  let monitor: HealthMonitor;
  let mockProvider: MockProvider;
  let resilientProvider: ResilientMarketDataProvider;

  beforeEach(() => {
    monitor = new HealthMonitor();
    mockProvider = new MockProvider();
    resilientProvider = new ResilientMarketDataProvider(mockProvider, monitor, 'mock');
  });

  it('should delegate calls', async () => {
    const quotes = await resilientProvider.getQuotes(['AAPL']);
    expect(quotes).toBeDefined();
    expect(quotes.length).toBeGreaterThan(0);
  });

  it('should record success', async () => {
    const spy = jest.spyOn(monitor, 'recordSuccess');
    await resilientProvider.getQuotes(['AAPL']);
    expect(spy).toHaveBeenCalledWith('mock');
  });

  it('should record error and throw', async () => {
    const spy = jest.spyOn(monitor, 'recordError');
    jest.spyOn(mockProvider, 'getQuotes').mockRejectedValue(new Error('API Error'));

    await expect(resilientProvider.getQuotes(['AAPL'])).rejects.toThrow('API Error');
    expect(spy).toHaveBeenCalledWith('mock');
  });

  it('should break circuit when unhealthy', async () => {
    // Force unhealthy
    for (let i = 0; i < 5; i++) {
        monitor.recordError('mock');
    }

    await expect(resilientProvider.getQuotes(['AAPL'])).rejects.toThrow(CircuitOpenError);
  });
});
