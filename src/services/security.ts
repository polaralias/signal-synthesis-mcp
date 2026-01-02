import crypto from 'crypto';
import { argon2id, argon2Verify } from 'hash-wasm'; // Using argon2 from hash-wasm as per package.json

// Constants
const ALGORITHM = 'aes-256-gcm';
const MASTER_KEY = process.env.MASTER_KEY || ''; // Must be 32 bytes for AES-256

if (!MASTER_KEY && process.env.NODE_ENV === 'production') {
  console.warn('WARNING: MASTER_KEY is not set. Encryption will fail.');
}

// Ensure MASTER_KEY is correct length or hash it to be correct length
function getMasterKeyBuffer(): Buffer {
  if (!MASTER_KEY) {
     throw new Error('MASTER_KEY is required');
  }
  // Use SHA-256 to ensure 32 bytes key from any string
  return crypto.createHash('sha256').update(MASTER_KEY).digest();
}

/**
 * Encrypts a string using AES-256-GCM
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getMasterKeyBuffer(), iv);

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

  const decipher = crypto.createDecipheriv(ALGORITHM, getMasterKeyBuffer(), iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
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
