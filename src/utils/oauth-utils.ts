
export function isRedirectUriAllowed(redirectUri: string): boolean {
  if (!redirectUri) return false;

  const allowlist = process.env.REDIRECT_URI_ALLOWLIST?.split(',').map(u => u.trim()).filter(Boolean) || [];
  if (allowlist.length === 0) return true; // Default to allow all if not configured? No, prompt says 'enforce if allowlist configured'

  const mode = process.env.REDIRECT_URI_ALLOWLIST_MODE || 'prefix'; // default prefix

  for (const allowed of allowlist) {
    if (mode === 'exact') {
      if (redirectUri === allowed) return true;
    } else {
      if (redirectUri.startsWith(allowed)) return true;
    }
  }

  return false;
}

export function logOAuthRejection(details: any) {
  console.warn('[OAuth Rejection]', JSON.stringify(details));
}
