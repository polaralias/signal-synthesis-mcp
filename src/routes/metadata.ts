import express from 'express';
import { getConfigMetadata } from '../config-schema';

const router = express.Router();

router.get('/.well-known/mcp-config', (req, res) => {
  const metadata = getConfigMetadata();
  res.json(metadata);
});

export default router;
