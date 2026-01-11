import express from 'express';
import { z } from 'zod';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { encrypt, generateRandomString, hashCode } from '../services/security';
import { prisma } from '../services/database';
import { checkRateLimit } from '../services/ratelimit';
import { isMasterKeyPresent } from '../security/masterKey';
import { isRedirectUriAllowed, logOAuthRejection } from '../utils/oauth-utils';

const router = express.Router();
router.use(cookieParser());

const CODE_TTL_SECONDS = parseInt(process.env.CODE_TTL_SECONDS || '90', 10);

// Validation for GET /connect
const ConnectQuerySchema = z.object({
    redirect_uri: z.string().url(),
    state: z.string().optional(),
    code_challenge: z.string(),
    code_challenge_method: z.literal('S256'),
    client_id: z.string().min(1),
});

// GET /connect
router.get('/connect', async (req, res) => {
    try {
        const query = ConnectQuerySchema.parse(req.query);

        // Validate client_id and redirect_uri
        const client = await prisma.client.findUnique({
            where: { clientId: query.client_id }
        });

        if (!client) {
            res.status(401).send('Invalid client_id');
            return;
        }

        const registeredUris: string[] = Array.isArray(client.redirectUris)
            ? (client.redirectUris as string[])
            : [];

        if (!registeredUris.includes(query.redirect_uri)) {
            logOAuthRejection({
                redirect_uri: query.redirect_uri,
                client_id: query.client_id,
                path: '/connect',
                ip: req.ip || 'unknown'
            });
            res.status(400).send("This client isn't in the redirect allow list");
            return;
        }

        // Validate redirect_uri against global allowlist (optional extra guard)
        if (!isRedirectUriAllowed(query.redirect_uri)) {
            logOAuthRejection({
                redirect_uri: query.redirect_uri,
                client_id: query.client_id,
                path: '/connect',
                ip: req.ip || 'unknown'
            });
            res.status(400).send("This client isn't in the redirect allow list");
            return;
        }

        // CSRF Protection
        const csrfToken = generateRandomString(32);
        res.cookie('csrf_token', csrfToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 3600000 // 1 hour
        });

        // Read and inject CSRF token into connect.html
        const templatePath = path.join(process.cwd(), 'src', 'public', 'connect.html');
        let html = fs.readFileSync(templatePath, 'utf8');
        html = html.replace('{{CSRF_TOKEN}}', csrfToken);

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
router.post('/connect', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
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
        const csrfCookie = req.cookies.csrf_token;
        const csrfBody = req.body.csrf_token;

        if (!csrfCookie || !csrfBody || csrfCookie !== csrfBody) {
            res.status(403).send('Invalid CSRF token');
            return;
        }

        // Validate hidden fields again
        const body = ConnectQuerySchema.parse(req.body);

        // Validate client_id and redirect_uri
        const client = await prisma.client.findUnique({
            where: { clientId: body.client_id }
        });

        if (!client) {
            res.status(401).send('Invalid client_id');
            return;
        }

        const registeredUris: string[] = Array.isArray(client.redirectUris)
            ? (client.redirectUris as string[])
            : [];

        if (!registeredUris.includes(body.redirect_uri)) {
            res.status(400).send("This client isn't in the redirect allow list");
            return;
        }

        if (!isRedirectUriAllowed(body.redirect_uri)) {
            res.status(400).send("This client isn't in the redirect allow list");
            return;
        }

        // Validate config fields
        let rawConfig: any = req.body.config || {};
        if (typeof rawConfig === 'string') {
            try {
                rawConfig = JSON.parse(rawConfig);
            } catch {
                rawConfig = {};
            }
        }
        const displayName = req.body.name || 'New Connection';

        // Split secrets
        const publicConfig = { ...rawConfig };
        const secrets: any = {};

        Object.keys(publicConfig).forEach(key => {
            const lower = key.toLowerCase();
            if (lower.includes('key') || lower.includes('secret') || lower.includes('token') || lower.includes('password')) {
                secrets[key] = publicConfig[key];
                delete publicConfig[key];
            }
        });

        // Encrypt secrets
        const encryptedSecrets = encrypt(JSON.stringify(secrets));

        // Create Connection
        const connection = await prisma.connection.create({
            data: {
                name: displayName,
                config: publicConfig,
                encryptedSecrets,
            }
        });

        // Generate Auth Code
        const rawCode = generateRandomString(32);
        const codeHash = hashCode(rawCode);
        const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);

        // Store Auth Code
        await prisma.authCode.create({
            data: {
                code: codeHash,
                connectionId: connection.id,
                clientId: body.client_id,
                redirectUri: body.redirect_uri,
                state: body.state,
                codeChallenge: body.code_challenge,
                codeChallengeMethod: body.code_challenge_method,
                expiresAt,
            }
        });

        // Response
        // connect.js expects JSON response with redirectUrl
        const redirectUrl = new URL(body.redirect_uri);
        redirectUrl.searchParams.append('code', rawCode);
        if (body.state) {
            redirectUrl.searchParams.append('state', body.state);
        }

        res.json({ redirectUrl: redirectUrl.toString() });

    } catch (error) {
        if (error instanceof z.ZodError) {
             res.status(400).json({ error: `Invalid request: ${error.errors.map(e => e.message).join(', ')}` });
        } else {
            console.error('Error in POST /connect', error);
             res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

// Expose schema endpoint for the frontend to render dynamic fields
router.get('/api/connect-schema', (req, res) => {
    const { getConfigMetadata } = require('../config-schema');
    res.json(getConfigMetadata());
});

export default router;
