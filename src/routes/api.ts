import express from 'express';
import { z } from 'zod';
import { ConnectionManager } from '../models/connection';
import { prisma } from '../services/database';

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

export default router;
