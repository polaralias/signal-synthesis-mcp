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
      deleteMany: jest.fn(),
    },
    session: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
    },
    authCredential: {
      create: jest.fn(),
    },
    tradeSetup: {
      createMany: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn((callback) => callback(require('../src/services/database').prisma)),
    $disconnect: jest.fn(),
  }
}));

import apiRouter from '../src/routes/api';
import { prisma } from '../src/services/database';

const app = express();
app.use('/api', apiRouter);

describe('Persistence API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/setups should retrieve setups', async () => {
    const mockSetups = [
      {
        id: '1',
        symbol: 'AAPL',
        setupType: 'Bullish Trend',
        triggerPrice: 150,
        stopLoss: 145,
        targetPrice: 160,
        confidence: 0.8,
        reasoning: ['Price above VWAP'],
        validUntil: new Date(),
        intent: 'day_trade',
        createdAt: new Date(),
      }
    ];

    (prisma.tradeSetup.findMany as jest.Mock).mockResolvedValue(mockSetups);

    const res = await request(app).get('/api/setups?limit=10&intent=day_trade');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].symbol).toBe('AAPL');
    expect(prisma.tradeSetup.findMany).toHaveBeenCalledWith({
      where: { intent: 'day_trade' },
      take: 10,
      orderBy: { createdAt: 'desc' }
    });
  });

  it('GET /api/setups should filter by symbol', async () => {
    (prisma.tradeSetup.findMany as jest.Mock).mockResolvedValue([]);

    await request(app).get('/api/setups?symbol=TSLA');

    expect(prisma.tradeSetup.findMany).toHaveBeenCalledWith({
        where: { symbol: 'TSLA' },
        take: 50, // default
        orderBy: { createdAt: 'desc' }
    });
  });
});
