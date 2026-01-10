
// Simple in-memory rate limiter for demo purposes
// In production, this should be backed by Redis
const limits = new Map<string, number[]>();

export function checkRateLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  const windowStart = now - (windowSeconds * 1000);

  let timestamps = limits.get(key) || [];

  // Clean up old timestamps
  timestamps = timestamps.filter(t => t > windowStart);

  if (timestamps.length >= limit) {
    limits.set(key, timestamps);
    return false;
  }

  timestamps.push(now);
  limits.set(key, timestamps);
  return true;
}
