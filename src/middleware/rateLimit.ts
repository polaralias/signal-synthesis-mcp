import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

const stores: { [key: string]: RateLimitStore } = {};

export const rateLimit = (options: { windowMs: number; max: number; key?: string }) => {
  const storeKey = options.key || 'default';
  if (!stores[storeKey]) {
    stores[storeKey] = {};
  }
  const store = stores[storeKey];

  return (req: Request, res: Response, next: NextFunction) => {
    // With 'trust proxy', req.ip should be the client IP
    const ip = req.ip || 'unknown';
    const now = Date.now();

    if (!store[ip] || now > store[ip].resetTime) {
      store[ip] = {
        count: 0,
        resetTime: now + options.windowMs,
      };
    }

    store[ip].count++;

    if (store[ip].count > options.max) {
       res.status(429).send('Too many requests, please try again later.');
       return;
    }

    next();
  };
};
