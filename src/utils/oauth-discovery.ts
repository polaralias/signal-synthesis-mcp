import type { Request, Response } from "express";

export function getBaseUrl(req: Request): string {
    if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/$/, "");
    const protocol = req.protocol;
    const host = req.get("host");
    return `${protocol}://${host}`;
}

export function setOauthDiscoveryHeader(req: Request, res: Response) {
    const baseUrl = getBaseUrl(req);
    res.set("WWW-Authenticate", `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource"`);
}

export function unauthorized(req: Request, res: Response, message: string) {
    setOauthDiscoveryHeader(req, res);
    return res.status(401).json({ error: "Unauthorized", message });
}
