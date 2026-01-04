import { Request } from 'express';

/**
 * Derives the base URL of the server.
 * Prioritizes BASE_URL environment variable.
 * Fallbacks to deriving from request protocol and host (respecting trust proxy settings in Express).
 */
export function getBaseUrl(req: Request): string {
    if (process.env.BASE_URL) {
        let url = process.env.BASE_URL.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            console.warn(`[Config] BASE_URL '${url}' missing scheme, defaulting to https://`);
            url = `https://${url}`;
        }
        return url.replace(/\/$/, '');
    }
    const protocol = req.protocol;
    const host = req.get('host');
    return `${protocol}://${host}`;
}
