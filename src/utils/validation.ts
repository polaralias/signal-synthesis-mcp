export function validateRedirectUri(uri: string): boolean {
  // 1. Basic URL and Scheme Validation
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
  } catch (e) {
    return false; // Not a valid absolute URL
  }

  // 2. Allowlist Validation
  const allowlistString = process.env.REDIRECT_URI_ALLOWLIST || '';
  const allowlist = allowlistString.split(',').map(s => s.trim()).filter(Boolean);

  // If allowlist is empty, reject everything (secure by default)
  if (allowlist.length === 0) {
    return false;
  }

  const mode = process.env.REDIRECT_URI_ALLOWLIST_MODE || 'exact';

  if (mode === 'prefix') {
    // Prefix mode: uri must start with one of the allowlist entries
    return allowlist.some(allowed => uri.startsWith(allowed));
  } else {
    // Exact mode (default): uri must match exactly
    return allowlist.includes(uri);
  }
}
