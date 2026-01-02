import express from 'express';
import { getMcpConfig } from '../config-schema';

const router = express.Router();

router.get('/.well-known/mcp-config', (req, res) => {
  const metadata = getMcpConfig();
  res.json(metadata);
});

export default router;
