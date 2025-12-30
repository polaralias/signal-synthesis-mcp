import express from 'express';
import apiRouter from '../src/routes/api';
import request from 'supertest';
import { AuthFlow } from '../src/services/auth-flow';
import { ConnectionManager } from '../src/models/connection';

// Mock Prisma
jest.mock('../src/services/database', () => ({
  prisma: {
    connection: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    session: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback({
        connection: { create: jest.fn() },
        authCredential: { create: jest.fn() }
    })),
  },
}));

// Mock ConnectionManager
jest.mock('../src/models/connection', () => ({
  ConnectionManager: {
    createConnection: jest.fn(),
    createSession: jest.fn(),
  }
}));

// Mock Redis to force memory fallback in AuthFlow?
// Or just mock it to work.
// We want to test the ROUTER -> AUTHFLOW integration.
// So we do NOT mock AuthFlow.
jest.mock('../src/providers/redis', () => ({
  redis: {
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  }
}));

describe('Auth Flow Integration', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api', apiRouter);
  });

  it('should complete the full flow', async () => {
    // 1. Setup mocks
    (ConnectionManager.createSession as jest.Mock).mockResolvedValue({
      session: { id: 'sess-1' },
      token: 'sess-1:secret'
    });

    // Mock Redis to simulate storage (simplified)
    const redisStore: Record<string, string> = {};
    const redisMock = require('../src/providers/redis').redis;

    redisMock.setex.mockImplementation((key: string, ttl: number, val: string) => {
        redisStore[key] = val;
        return Promise.resolve('OK');
    });

    redisMock.multi.mockReturnValue({
        get: (key: string) => {
             // We need to store the action to be executed later
             return {
                 del: (key: string) => {
                     return {
                         exec: async () => {
                             const val = redisStore[key];
                             delete redisStore[key];
                             // Return generic redis structure [[err, result], [err, result]]
                             return [[null, val], [null, 1]];
                         }
                     }
                 }
             }
        }
    });

    // 2. Authorize
    const resAuth = await request(app)
      .post('/api/authorize')
      .send({
        connectionId: 'conn-1', // UUID validation might fail if checking schema strictly
        callbackUrl: 'https://cb.com',
        state: 'st-1'
      });

    // If UUID check fails, we need a real UUID
    // The schema in api.ts says z.string().uuid()
    if (resAuth.status === 400) {
        // Try again with valid UUID
         const resAuth2 = await request(app)
          .post('/api/authorize')
          .send({
            connectionId: '123e4567-e89b-12d3-a456-426614174000',
            callbackUrl: 'https://cb.com',
            state: 'st-1'
          });
         expect(resAuth2.status).toBe(200);
         var redirectUrl = resAuth2.body.redirectUrl;
    } else {
        expect(resAuth.status).toBe(200);
        var redirectUrl = resAuth.body.redirectUrl;
    }

    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');
    expect(code).toBeDefined();

    // 3. Exchange Token
    const resToken = await request(app)
      .post('/api/token')
      .send({ code });

    expect(resToken.status).toBe(200);
    expect(resToken.body).toEqual({
      sessionId: 'sess-1',
      token: 'sess-1:secret'
    });

    // 4. Try again (should fail)
    const resToken2 = await request(app)
      .post('/api/token')
      .send({ code });

    expect(resToken2.status).toBe(401);

  });
});
