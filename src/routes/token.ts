import express from 'express';
import { z } from 'zod';
import { hashCode, verifyPkce, generateRandomString, hashToken } from '../services/security';
import { prisma } from '../services/database';
import { checkRateLimit } from '../services/ratelimit';
import { isMasterKeyPresent } from '../security/masterKey';

const router = express.Router();

const TOKEN_TTL_SECONDS = parseInt(process.env.TOKEN_TTL_SECONDS || '3600', 10);

const TokenRequestSchema = z.object({
    grant_type: z.literal('authorization_code'),
    code: z.string(),
    code_verifier: z.string(),
    redirect_uri: z.string().url(),
});

router.post('/token', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
    try {
        if (!isMasterKeyPresent()) {
            res.status(403).json({ error: 'invalid_request', error_description: 'MASTER_KEY is not configured' });
            return;
        }
        const ip = req.ip || 'unknown';
        if (!checkRateLimit(`token:${ip}`, 10, 60)) {
            res.status(429).json({ error: 'invalid_request', error_description: 'Too Many Requests' });
            return;
        }

        const body = TokenRequestSchema.parse(req.body);

        const codeHash = hashCode(body.code);

        // Find the code
        const authCode = await prisma.authCode.findUnique({
            where: { codeHash },
            include: { connection: true } // Ensure connection exists
        });

        if (!authCode) {
            res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid code' });
            return;
        }

        // Check if expired
        if (new Date() > authCode.expiresAt) {
            res.status(400).json({ error: 'invalid_grant', error_description: 'Code expired' });
            return;
        }

        // Check if used
        if (authCode.usedAt) {
            res.status(400).json({ error: 'invalid_grant', error_description: 'Code already used' });
            // Should potentially revoke all tokens associated with this connection if this was a replay attack
            return;
        }

        // Validate redirect_uri
        if (authCode.redirectUri !== body.redirect_uri) {
            res.status(400).json({ error: 'invalid_grant', error_description: 'Redirect URI mismatch' });
            return;
        }

        // Verify PKCE
        if (!verifyPkce(body.code_verifier, authCode.codeChallenge)) {
            res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
            return;
        }

        // Mark code as used
        await prisma.authCode.update({
            where: { id: authCode.id },
            data: { usedAt: new Date() }
        });

        // Issue Access Token
        const accessToken = generateRandomString(64); // Opaque token
        const tokenHash = await hashToken(accessToken);
        const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000);

        await prisma.session.create({
            data: {
                connectionId: authCode.connectionId,
                tokenHash,
                expiresAt,
            }
        });

        res.json({
            access_token: accessToken,
            token_type: 'Bearer',
            expires_in: TOKEN_TTL_SECONDS
        });

    } catch (error) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'invalid_request', error_description: error.errors.map(e => e.message).join(', ') });
        } else {
            console.error('Error in POST /token', error);
            res.status(500).json({ error: 'server_error' });
        }
    }
});

export default router;
