import { Request } from 'express';

/**
 * Derives the base URL of the server.
 * Prioritizes BASE_URL environment variable.
 * Fallbacks to deriving from request protocol and host (respecting trust proxy settings in Express).
 */
export function getBaseUrl(req: Request): string {
    if (process.env.BASE_URL) {
        return process.env.BASE_URL.replace(/\/$/, '');
    }
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}`;
}
