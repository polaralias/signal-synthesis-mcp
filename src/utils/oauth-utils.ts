import { Request } from 'express';

const REDIRECT_URI_ALLOWLIST = (process.env.REDIRECT_URI_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
const REDIRECT_URI_ALLOWLIST_MODE = process.env.REDIRECT_URI_ALLOWLIST_MODE || 'prefix';

/**
 * Validates a redirect URI against the configured allowlist.
 * Supports 'exact' and 'prefix' modes.
 */
export function isRedirectUriAllowed(uri: string): boolean {
    try {
        const url = new URL(uri);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    } catch {
        return false;
    }

    if (REDIRECT_URI_ALLOWLIST.length === 0) {
        // Safe default: if no allowlist is configured, block everything to avoid open redirect vulnerabilities
        // UNLESS it's a dev/empty environment? No, requirement says "enforce allowlist if configured".
        // But also "Default deployment MUST use prefix mode".
        // If allowlist is empty, we probably shouldn't allow anything to be safe.
        return false;
    }

    for (const allowed of REDIRECT_URI_ALLOWLIST) {
        if (REDIRECT_URI_ALLOWLIST_MODE === 'prefix') {
            if (uri.startsWith(allowed)) return true;
        } else {
            if (uri === allowed) return true;
        }
    }
    return false;
}

interface RejectionContext {
    redirect_uri: string;
    client_name?: string;
    client_id?: string;
    path: string;
    ip: string;
}

/**
 * Logs a standardized OAuth rejection message.
 */
export function logOAuthRejection(ctx: RejectionContext) {
    // ONE structured line as required
    console.warn(JSON.stringify({
        event: 'oauth_rejection',
        rejected_redirect_uri: ctx.redirect_uri,
        client_name: ctx.client_name,
        client_id: ctx.client_id,
        path: ctx.path,
        requester_ip: ctx.ip,
        timestamp: new Date().toISOString()
    }));
}
