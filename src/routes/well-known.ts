import express from 'express';
import { getConfigMetadata } from '../config-schema';
import { getBaseUrl } from '../utils/url';

const router = express.Router();

router.get('/.well-known/mcp-config', (req, res) => {
  const metadata = getConfigMetadata();
  res.json(metadata);
});

router.get('/.well-known/oauth-protected-resource', (req, res) => {
  const baseUrl = getBaseUrl(req);
  res.json({
    resource: baseUrl,
    authorization_servers: [baseUrl]
  });
});

router.get('/.well-known/oauth-authorization-server', (req, res) => {
  const baseUrl = getBaseUrl(req);
  const metadata = {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/connect`,
    token_endpoint: `${baseUrl}/token`,
    registration_endpoint: `${baseUrl}/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  };
  res.json(metadata);
});

export default router;
