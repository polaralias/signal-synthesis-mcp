import express from 'express';
import { z } from 'zod';
import cookieParser from 'cookie-parser';
import { renderConnectPage } from '../templates/connect-ui';
import { ConfigSchema } from '../config-schema';
import { encrypt, generateRandomString, hashCode } from '../services/security';
import { prisma } from '../services/database';
import { checkRateLimit } from '../services/ratelimit';
import { isMasterKeyPresent } from '../security/masterKey';

const router = express.Router();
router.use(cookieParser());

const CODE_TTL_SECONDS = parseInt(process.env.CODE_TTL_SECONDS || '90', 10);
const REDIRECT_URI_ALLOWLIST = (process.env.REDIRECT_URI_ALLOWLIST || '').split(',').map(s => s.trim()).filter(Boolean);
const REDIRECT_URI_ALLOWLIST_MODE = process.env.REDIRECT_URI_ALLOWLIST_MODE || 'exact';

function isRedirectUriAllowed(uri: string): boolean {
    try {
        const url = new URL(uri);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    } catch {
        return false;
    }

    if (REDIRECT_URI_ALLOWLIST.length === 0) return false;

    for (const allowed of REDIRECT_URI_ALLOWLIST) {
        if (REDIRECT_URI_ALLOWLIST_MODE === 'prefix') {
            if (uri.startsWith(allowed)) return true;
        } else {
            if (uri === allowed) return true;
        }
    }
    return false;
}

// Validation for GET /connect
const ConnectQuerySchema = z.object({
    redirect_uri: z.string().url(),
    state: z.string(),
    code_challenge: z.string(),
    code_challenge_method: z.literal('S256'),
});

// GET /connect
router.get('/connect', (req, res) => {
    try {
        const query = ConnectQuerySchema.parse(req.query);

        // Validate redirect_uri against allowlist
        if (!isRedirectUriAllowed(query.redirect_uri)) {
            res.status(400).send('Invalid redirect_uri');
            return;
        }

        // CSRF Protection
        const csrfToken = generateRandomString(32);
        res.cookie('csrfToken', csrfToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 3600000 // 1 hour
        });

        const html = renderConnectPage(
            query.redirect_uri,
            query.state,
            query.code_challenge,
            query.code_challenge_method,
            csrfToken
        );
        res.send(html);
    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).send(`Invalid request: ${error.errors.map(e => e.message).join(', ')}`);
        } else {
            console.error(error);
            res.status(500).send('Internal Server Error');
        }
    }
});

// POST /connect
router.post('/connect', express.urlencoded({ extended: true }), async (req, res) => {
    try {
        if (!isMasterKeyPresent()) {
            res.status(403).send('MASTER_KEY is not configured. Sensitive operations are blocked.');
            return;
        }
        // Rate limiting: 20 req/min per IP
        const ip = req.ip || 'unknown';
        if (!checkRateLimit(`connect:${ip}`, 20, 60)) {
            res.status(429).send('Too Many Requests');
            return;
        }

        // CSRF Verification
        const csrfCookie = req.cookies.csrfToken;
        const csrfBody = req.body.csrfToken;

        if (!csrfCookie || !csrfBody || csrfCookie !== csrfBody) {
            res.status(403).send('Invalid CSRF token');
            return;
        }

        // Validate hidden fields again
        const body = ConnectQuerySchema.parse(req.body);

        // Validate redirect_uri against allowlist
        if (!isRedirectUriAllowed(body.redirect_uri)) {
            res.status(400).send('Invalid redirect_uri');
            return;
        }

        // Validate config fields
        // We allow extra fields in body (like hidden ones), but we only extract config ones
        const configData = ConfigSchema.parse(req.body);
        const displayName = req.body.displayName;

        // Encrypt config
        const configJson = JSON.stringify(configData);
        const configEncrypted = encrypt(configJson);

        // Create Connection
        const connection = await prisma.connection.create({
            data: {
                displayName,
                configEncrypted,
                configVersion: 1,
            }
        });

        // Generate Auth Code
        const code = generateRandomString(32); // 32 bytes -> base64url
        const codeHash = hashCode(code);
        const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

        // Store Auth Code
        await prisma.authCode.create({
            data: {
                codeHash,
                connectionId: connection.id,
                redirectUri: body.redirect_uri,
                state: body.state,
                codeChallenge: body.code_challenge,
                codeChallengeMethod: body.code_challenge_method,
                expiresAt,
            }
        });

        // Redirect
        const redirectUrl = new URL(body.redirect_uri);
        redirectUrl.searchParams.append('code', code);
        redirectUrl.searchParams.append('state', body.state);

        res.redirect(redirectUrl.toString());

    } catch (error) {
        if (error instanceof z.ZodError) {
            // In a real app, we should render the form again with errors
            res.status(400).send(`Invalid request: ${error.errors.map(e => e.message).join(', ')}`);
        } else {
            console.error('Error in POST /connect', error);
            res.redirect(`${req.body.redirect_uri}?error=server_error&state=${req.body.state}`);
        }
    }
});

export default router;
