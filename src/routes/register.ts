import express from "express";
import { z } from "zod";
import { prisma } from "../services/database";
import { generateRandomString } from "../services/security";

const router = express.Router();

const RegisterRequestSchema = z.object({
    redirect_uris: z.array(z.string().url()).min(1).max(20),
    client_name: z.string().min(1).max(200).optional(),
    token_endpoint_auth_method: z.literal("none").optional(),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional()
});

router.post("/register", express.json(), async (req, res) => {
    try {
        const body = RegisterRequestSchema.parse(req.body);

        // Validate redirect URIs (deny non-http/https)
        for (const uri of body.redirect_uris) {
            try {
                const url = new URL(uri);
                if (url.protocol !== 'http:' && url.protocol !== 'https:') {
                    res.status(400).json({
                        error: "invalid_client_metadata",
                        error_description: "Redirect URIs must use http or https"
                    });
                    return;
                }
            } catch {
                res.status(400).json({ error: "invalid_client_metadata" });
                return;
            }
        }

        if (body.grant_types && !body.grant_types.includes("authorization_code")) {
            res.status(400).json({ error: "invalid_client_metadata" });
            return;
        }

        if (body.response_types && !body.response_types.includes("code")) {
            res.status(400).json({ error: "invalid_client_metadata" });
            return;
        }

        const clientId = generateRandomString(32);

        const created = await prisma.oAuthClient.create({
            data: {
                id: clientId,
                clientName: body.client_name,
                redirectUris: body.redirect_uris,
                tokenEndpointAuthMethod: body.token_endpoint_auth_method ?? "none"
            }
        });

        res.status(201).json({
            client_id: created.id,
            client_id_issued_at: Math.floor(Date.now() / 1000),
            client_name: created.clientName ?? undefined,
            redirect_uris: created.redirectUris,
            token_endpoint_auth_method: created.tokenEndpointAuthMethod,
            grant_types: ["authorization_code"],
            response_types: ["code"]
        });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({
                error: "invalid_client_metadata",
                error_description: error.errors.map(e => e.message).join(', ')
            });
        } else {
            console.error('Error in POST /register', error);
            res.status(500).json({ error: "server_error" });
        }
    }
});

export default router;
