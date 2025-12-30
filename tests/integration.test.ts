import request from 'supertest';
import express from 'express';
// We need to mock BEFORE importing the routes that use the service
jest.mock('../src/services/database', () => ({
  prisma: {
    connection: {
      findMany: jest.fn(),
      create: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(), // for cleanup in afterAll
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    authCredential: {
      create: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(require('../src/services/database').prisma)),
    $disconnect: jest.fn(),
  }
}));

import apiRouter from '../src/routes/api';
import { prisma } from '../src/services/database';
import { ConnectionManager } from '../src/models/connection';
import { hashToken, encrypt } from '../src/utils/security';
import crypto from 'crypto';

const app = express();
app.use('/api', apiRouter);

describe('Integration: API & Session Flow', () => {
  let connectionId = 'test-conn-id';
  const TEST_MASTER_KEY = crypto.randomBytes(32).toString('hex');

  beforeAll(() => {
    process.env.MASTER_KEY = TEST_MASTER_KEY;
  });

  afterAll(async () => {
    // await prisma.connection.deleteMany();
    // await prisma.$disconnect();
  });

  it('1. Should create a connection profile via API', async () => {
    // Mock return values
    (prisma.connection.create as jest.Mock).mockResolvedValue({
      id: connectionId,
      name: 'Integration Test Connection',
      serverType: 'financial-mcp',
      config: { ENABLE_CACHING: true },
    });

    // AuthCredential create should be called inside transaction

    const res = await request(app)
      .post('/api/connections')
      .send({
        name: 'Integration Test Connection',
        serverType: 'financial-mcp',
        config: { ENABLE_CACHING: true },
        credentials: {
          ALPACA_API_KEY: 'test-key',
          ALPACA_SECRET_KEY: 'test-secret'
        }
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe(connectionId);

    expect(prisma.connection.create).toHaveBeenCalled();
    expect(prisma.authCredential.create).toHaveBeenCalled();
  });

  it('2. Should list the created connection', async () => {
    (prisma.connection.findMany as jest.Mock).mockResolvedValue([
      {
        id: connectionId,
        name: 'Integration Test Connection',
        serverType: 'financial-mcp',
        config: { ENABLE_CACHING: true },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    ]);

    const res = await request(app).get('/api/connections');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);
    expect(res.body[0].name).toBe('Integration Test Connection');
  });

  it('3. Should create a session for the connection', async () => {
    const mockSession = {
      id: 'session-id',
      connectionId: connectionId,
      tokenHash: 'hashed-token',
      expiresAt: new Date(Date.now() + 86400000),
    };
    (prisma.session.create as jest.Mock).mockResolvedValue(mockSession);

    const res = await request(app)
      .post(`/api/connections/${connectionId}/sessions`);

    expect(res.status).toBe(201);
    expect(res.body.sessionId).toBe('session-id');
    expect(res.body.token).toContain('session-id:');
  });

  it('4. Should validate session correctly', async () => {
      // Mock validateSession logic
      // Note: validateSession uses prisma.session.findUnique

      const enc = encrypt('test-key', TEST_MASTER_KEY);

      const mockSessionWithConn = {
          id: 'session-id',
          tokenHash: await hashToken('valid-secret'),
          expiresAt: new Date(Date.now() + 10000),
          connection: {
              config: {},
              credentials: [
                  {
                      provider: 'ALPACA_API_KEY',
                      encryptedSecret: enc.encryptedSecret,
                      iv: enc.iv,
                      authTag: enc.authTag
                  }
              ]
          }
      };

      (prisma.session.findUnique as jest.Mock).mockResolvedValue(mockSessionWithConn);

      // We need to use a real token that matches the hash we just mocked
      const token = `session-id:valid-secret`;

      const session = await ConnectionManager.validateSession(token);
      expect(session).not.toBeNull();
      expect(session?.connection.decryptedCredentials['ALPACA_API_KEY']).toBe('test-key');
  });
});
