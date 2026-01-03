import crypto from 'crypto';
import { argon2id, argon2Verify } from 'hash-wasm'; // Using argon2 from hash-wasm as per package.json
import { getMasterKeyBytes } from '../security/masterKey';

// Constants
const ALGORITHM = 'aes-256-gcm';

/**
 * Encrypts a string using AES-256-GCM
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKeyBytes(), iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string using AES-256-GCM
 */
export function decrypt(text: string): string {
  const parts = text.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];

  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKeyBytes(), iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (err) {
    // Legacy Fallback: If repo previously hashed the hex string
    const rawKey = (process.env.MASTER_KEY || '').trim();
    const isHex = /^[0-9a-fA-F]{64}$/.test(rawKey);

    if (isHex) {
      try {
        // The old way in this repo was SHA-256 hashing the MASTER_KEY regardless of its format
        const legacyKey = crypto.createHash('sha256').update(rawKey).digest();
        const legacyDecipher = crypto.createDecipheriv(ALGORITHM, legacyKey, iv);
        legacyDecipher.setAuthTag(authTag);

        let decrypted = legacyDecipher.update(encrypted, 'hex', 'utf8');
        decrypted += legacyDecipher.final('utf8');

        console.warn('SUCCESS: Decrypted using legacy key derivation. Please re-save this data to update it to the new format.');
        return decrypted;
      } catch (legacyErr) {
        // If legacy also fails, throw the original error
      }
    }
    throw err;
  }
}

/**
 * Hashes a string using SHA-256 (fast, for auth codes)
 */
export function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

/**
 * Verifies a PKCE S256 challenge
 */
export function verifyPkce(verifier: string, challenge: string): boolean {
  const hash = crypto.createHash('sha256').update(verifier).digest('base64url');
  return hash === challenge;
}

/**
 * Hashes a token using SHA-256 (fast, deterministic, for database lookups)
 * We use SHA-256 because we need to look up the session by the token hash.
 * Argon2 is salted and random, making lookups impossible without scanning the table.
 */
export async function hashToken(token: string): Promise<string> {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Verifies a token hash (SHA-256)
 */
export async function verifyToken(token: string, hashed: string): Promise<boolean> {
  const calculated = await hashToken(token);
  return calculated === hashed;
}

/**
 * Generates a random secure string (url safe)
 */
export function generateRandomString(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}
