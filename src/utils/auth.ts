import crypto from 'crypto';
import { config } from '../config';

/**
 * Constant-time comparison to prevent timing attacks
 */
export function constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
        return false;
    }
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Validates an API key against MCP_API_KEY and MCP_API_KEYS
 */
export function validateApiKey(apiKey: string): boolean {
    if (!apiKey) return false;

    const validKeys: string[] = [];

    if (config.MCP_API_KEY) {
        validKeys.push(config.MCP_API_KEY);
    }

    if (config.MCP_API_KEYS) {
        const keysFromList = config.MCP_API_KEYS.split(',').map(k => k.trim()).filter(k => k.length > 0);
        validKeys.push(...keysFromList);
    }

    if (validKeys.length === 0) {
        return false;
    }

    return validKeys.some(validKey => {
        try {
            return constantTimeCompare(apiKey, validKey);
        } catch {
            return false;
        }
    });
}
