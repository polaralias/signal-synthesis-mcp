import { Router } from 'express';
import { z } from 'zod';
import { ApiKeyService } from '../services/api-key';
import { UserConfigService } from '../services/user-config';
import { ConfigSchema } from '../config-schema';

const router = Router();
const apiKeyService = new ApiKeyService();
const userConfigService = new UserConfigService();

// Schema for key issuance
const IssueKeySchema = z.object({
    config: ConfigSchema,
    turnstileToken: z.string().optional(),
});

// Middleware to check if user-bound mode is enabled
const requireUserBoundMode = (req: any, res: any, next: any) => {
    if (process.env.API_KEY_MODE !== 'user_bound') {
        return res.status(404).json({ error: 'User-bound API key mode is not enabled' });
    }
    next();
};

router.post('/api-keys', requireUserBoundMode, async (req, res) => {
    try {
        // 1. Rate Limit (IP based) - TODO: Implement proper rate limiting
        // For now, relies on global or Nginx limits

        // 2. Validate Turnstile if configured
        if (process.env.TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY) {
            // TODO: Implement Turnstile validation
        }

        // 3. Validate Config
        const result = IssueKeySchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({ error: 'Invalid configuration', details: result.error.format() });
        }

        const { config } = result.data;

        // 4. Create User Config
        // Provide a default display name or derive from config
        const displayName = `Config ${new Date().toISOString()}`;
        const userConfig = await userConfigService.createConfig(config, displayName);

        // 5. Issue API Key
        const ip = req.ip;
        const { apiKey, model } = await apiKeyService.createApiKey(userConfig.id, ip);

        // 6. Return response
        res.json({
            apiKey,
            message: 'API Key generated successfully. Please copy it now as it will not be shown again.',
            keyId: model.id,
        });

    } catch (error) {
        console.error('Failed to issue API key', error);
        res.status(500).json({ error: 'Internal User Error' });
    }
});

// Get Key Metadata
router.get('/api-keys/me', async (req, res) => {
    // This endpoint expects the user to be authenticated via the key they want to inspect
    // We can reuse the middleware logic or check req.userConfig if it's already attached
    // But this route might be called differently. 
    // For simplicity, let's assume standard auth middleware attaches `req.user` or similar.
    // Since we haven't built the general middleware yet, let's manually check header here for now.

    // Actually, usually this is protected by the main auth middleware. 
    // The plan says: "GET /api-keys/me (requires API key): returns metadata only"
    // So we will assume the key is passed in Authorization header.

    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'] as string;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = await apiKeyService.validateApiKey(token);
    if (!key) return res.status(401).json({ error: 'Invalid key' });

    res.json({
        id: key.id,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        name: key.name,
        // Do NOT return config secrets
    });
});

// Revoke Key
router.post('/api-keys/revoke', async (req, res) => {
    const token = req.headers.authorization?.replace('Bearer ', '') || req.headers['x-api-key'] as string;
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const key = await apiKeyService.validateApiKey(token);
    if (!key) return res.status(401).json({ error: 'Invalid key' });

    await apiKeyService.revokeApiKey(key.id);
    // Optionally revoke config if it's 1:1, but maybe they want to issue a new key for same config?
    // Current requirement: "revokes that key (and optionally linked config)"
    // Let's just revoke the key for now.

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
