import request from 'supertest';
import express from 'express';
import apiRouter from '../src/routes/api';
import { AuthFlow } from '../src/services/auth-flow';
import { ConnectionManager } from '../src/models/connection';

// Mock dependencies
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

jest.mock('../src/providers/redis', () => ({
  redis: {
    setex: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  },
}));

jest.mock('../src/services/auth-flow');
jest.mock('../src/models/connection');

describe('Auth Flow API', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use('/api', apiRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/authorize', () => {
    it('should generate a code and return redirect URL', async () => {
      // Mock ConnectionManager.createSession
      (ConnectionManager.createSession as jest.Mock).mockResolvedValue({
        session: { id: 'session-123' },
        token: 'session-123:secret'
      });

      // Mock AuthFlow.generateAuthCode
      (AuthFlow.generateAuthCode as jest.Mock).mockResolvedValue('auth-code-123');

      const res = await request(app)
        .post('/api/authorize')
        .send({
          connectionId: '123e4567-e89b-12d3-a456-426614174000', // Valid UUID
          callbackUrl: 'https://app.com/cb',
          state: 'state-xyz'
        });

      if (res.status === 400) {
          console.error(res.body);
      }
      expect(res.status).toBe(200);
      const url = new URL(res.body.redirectUrl);
      expect(url.origin + url.pathname).toBe('https://app.com/cb');
      expect(url.searchParams.get('code')).toBe('auth-code-123');
      expect(url.searchParams.get('state')).toBe('state-xyz');
    });

    it('should validate input', async () => {
      const res = await request(app)
        .post('/api/authorize')
        .send({
          // Missing connectionId
          callbackUrl: 'not-a-url',
          state: ''
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/token', () => {
    it('should exchange code for token', async () => {
      // Mock AuthFlow.exchangeAuthCode
      (AuthFlow.exchangeAuthCode as jest.Mock).mockResolvedValue({
        sessionId: 'session-123',
        token: 'session-123:secret'
      });

      const res = await request(app)
        .post('/api/token')
        .send({ code: 'valid-code' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        sessionId: 'session-123',
        token: 'session-123:secret'
      });
    });

    it('should handle invalid/expired code', async () => {
      (AuthFlow.exchangeAuthCode as jest.Mock).mockResolvedValue(null);

      const res = await request(app)
        .post('/api/token')
        .send({ code: 'invalid-code' });

      expect(res.status).toBe(401);
    });
  });
});
