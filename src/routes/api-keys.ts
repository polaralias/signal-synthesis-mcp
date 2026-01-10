import { Router } from 'express';
import { z } from 'zod';
import { ApiKeyService } from '../services/api-key';
import { UserConfigService } from '../services/user-config';
import { ConfigSchema } from '../config-schema';
import { setOauthDiscoveryHeader } from '../utils/oauth-discovery';
import { checkRateLimit } from '../services/ratelimit';

const router = Router();
const apiKeyService = new ApiKeyService();
const userConfigService = new UserConfigService();


// Middleware to check if user-bound mode is enabled
const requireUserBoundMode = (req: any, res: any, next: any) => {
    if (process.env.API_KEY_MODE !== 'user_bound') {
        return res.status(404).json({ error: 'User-bound API key mode is not enabled' });
    }
    next();
};

router.post('/api-keys', requireUserBoundMode, async (req, res) => {
    try {
        // 1. Rate Limit
        const ip = req.ip || 'unknown';
        const limit = parseInt(process.env.API_KEY_ISSUE_RATELIMIT || '3', 10);
        const window = parseInt(process.env.API_KEY_ISSUE_WINDOW_SECONDS || '3600', 10);

        if (!checkRateLimit(`issue_key:${ip}`, limit, window)) {
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }

        // 2. Unwrap and Validate Config
        const body = req.body ?? {};
        // The frontend sends flattened fields in JSON.

        const result = ConfigSchema.safeParse(body);
        if (!result.success) {
            return res.status(400).json({ error: 'Invalid configuration', details: result.error.format() });
        }

        const config = result.data;

        // 3. Create User Config
        const displayName = `Config ${new Date().toISOString()}`;
        const userConfig = await userConfigService.createConfig(config, displayName);

        // 4. Issue API Key
        const { apiKey, model } = await apiKeyService.createApiKey(userConfig.id, ip);

        // 5. Return response
        res.json({
            apiKey,
            message: 'API Key generated successfully. Please copy it now as it will not be shown again.',
            keyId: model.id,
        });

    } catch (error) {
        console.error('Failed to issue API key', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Get Key Metadata
router.get('/api-keys/me', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'] as string;
    if (!token) {
        setOauthDiscoveryHeader(req, res);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = await apiKeyService.validateApiKey(token);
    if (!key) {
        setOauthDiscoveryHeader(req, res);
        return res.status(401).json({ error: 'Invalid key' });
    }

    res.json({
        id: key.id,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        // name: key.name, // 'name' doesn't exist on ApiKey anymore in my schema
    });
});

// Revoke Key
router.post('/api-keys/revoke', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'] as string;
    if (!token) {
        setOauthDiscoveryHeader(req, res);
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = await apiKeyService.validateApiKey(token);
    if (!key) {
        setOauthDiscoveryHeader(req, res);
        return res.status(401).json({ error: 'Invalid key' });
    }

    await apiKeyService.revokeApiKey(key.id);
    res.json({ success: true, message: 'Key revoked' });
});

router.get('/config-schema', (req, res) => {
    // Only return schema if user bound mode is active
    if (process.env.API_KEY_MODE !== 'user_bound') {
        return res.status(404).json({ error: 'Not available' });
    }
    const { getConfigMetadata } = require('../config-schema');
    res.json(getConfigMetadata());
});

export default router;
