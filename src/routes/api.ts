import express from 'express';
import { z } from 'zod';
import { ConnectionManager } from '../models/connection';
import { prisma } from '../services/database';
import { AuthFlow } from '../services/auth-flow';

const router = express.Router();

// Middleware to parse JSON bodies
router.use(express.json());

// --- Connections ---

// List all connections
router.get('/connections', async (req, res) => {
  try {
    const connections = await prisma.connection.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        serverType: true,
        config: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      }
    });
    res.json(connections);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch connections' });
  }
});

// Create a new connection
router.post('/connections', async (req, res) => {
  const schema = z.object({
    name: z.string().min(1),
    serverType: z.string().default('financial-mcp'),
    config: z.record(z.any()),
    credentials: z.record(z.string()).optional(),
  });

  try {
    const data = schema.parse(req.body);
    const connection = await ConnectionManager.createConnection(data);
    res.status(201).json({
      id: connection.id,
      name: connection.name,
      message: 'Connection created successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Failed to create connection' });
    }
  }
});

// Get connection details
router.get('/connections/:id', async (req, res) => {
  try {
    const connection = await prisma.connection.findUnique({
      where: { id: req.params.id },
    });
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    res.json(connection);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch connection' });
  }
});

// Delete connection
router.delete('/connections/:id', async (req, res) => {
  try {
    await prisma.connection.delete({ where: { id: req.params.id } });
    res.json({ message: 'Connection deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete connection' });
  }
});

// --- Sessions ---

// Create a session for a connection
router.post('/connections/:id/sessions', async (req, res) => {
  try {
    const { id } = req.params;
    const { session, token } = await ConnectionManager.createSession(id);
    res.status(201).json({
      sessionId: session.id,
      token, // This is the composite token (id:secret)
      expiresAt: session.expiresAt
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// --- Authorization Flow ---

// Step 1: Authorize connection and get redirect URL
router.post('/authorize', async (req, res) => {
  const schema = z.object({
    connectionId: z.string().uuid(),
    callbackUrl: z.string().url(),
    state: z.string().min(1)
  });

  try {
    const { connectionId, callbackUrl, state } = schema.parse(req.body);
    
    // Create session
    const { session, token } = await ConnectionManager.createSession(connectionId);
    
    // Generate short-lived auth code
    const code = await AuthFlow.generateAuthCode({ 
      sessionId: session.id, 
      token 
    });
    
    // Construct redirect URL
    const url = new URL(callbackUrl);
    url.searchParams.set('code', code);
    url.searchParams.set('state', state);
    
    res.json({ redirectUrl: url.toString() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Failed to authorize connection' });
    }
  }
});

// Step 2: Exchange code for token
router.post('/token', async (req, res) => {
  const schema = z.object({
    code: z.string().min(1)
  });

  try {
    const { code } = schema.parse(req.body);
    
    const sessionData = await AuthFlow.exchangeAuthCode(code);
    
    if (!sessionData) {
      return res.status(401).json({ error: 'Invalid or expired authorization code' });
    }
    
    res.json({
      sessionId: sessionData.sessionId,
      token: sessionData.token
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Failed to exchange token' });
    }
  }
});

// --- Trade Setups ---

// Get trade setups history
router.get('/setups', async (req, res) => {
  const schema = z.object({
    limit: z.coerce.number().min(1).max(100).default(50),
    intent: z.enum(['day_trade', 'swing', 'long_term']).optional(),
    symbol: z.string().optional()
  });

  try {
    const { limit, intent, symbol } = schema.parse(req.query);

    const where: any = {};
    if (intent) where.intent = intent;
    if (symbol) where.symbol = symbol;

    const setups = await prisma.tradeSetup.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });

    res.json(setups);
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: error.errors });
    } else {
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch trade setups' });
    }
  }
});

export default router;
