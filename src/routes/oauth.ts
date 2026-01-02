import express from 'express';

const router = express.Router();

function getBaseUrl(req: express.Request): string {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL;
  }
  // Trust proxy must be enabled in app.set() for this to work correctly behind proxies
  return `${req.protocol}://${req.get('host')}`;
}

router.get('/.well-known/oauth-protected-resource', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    resource: baseUrl,
    authorization_servers: [baseUrl]
  });
});

router.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/connect`,
    token_endpoint: `${baseUrl}/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"]
  });
});

export default router;
