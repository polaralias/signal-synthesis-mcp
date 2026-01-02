interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const rates = new Map<string, RateLimitEntry>();

/**
 * Checks if a key has exceeded the rate limit.
 * @param key Unique key (e.g. IP address + action)
 * @param limit Max requests allowed
 * @param windowSeconds Time window in seconds
 * @returns true if allowed, false if limit exceeded
 */
export function checkRateLimit(key: string, limit: number, windowSeconds: number): boolean {
  const now = Date.now();
  let entry = rates.get(key);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    rates.set(key, entry);
  }

  if (entry.count >= limit) {
    return false;
  }

  entry.count++;
  return true;
}

function cleanupRateLimits() {
    const now = Date.now();
    for (const [key, entry] of rates.entries()) {
        if (now > entry.resetAt) {
            rates.delete(key);
        }
    }
}

// Clean up periodically
setInterval(cleanupRateLimits, 60000).unref();
