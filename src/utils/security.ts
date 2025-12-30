import crypto from 'crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypts a text using a master key (from env) or a provided key.
 * Format of return: { encryptedSecret, iv, authTag } (all hex strings)
 */
export function encrypt(text: string, masterKeyHex?: string): { encryptedSecret: string; iv: string; authTag: string } {
  const keyHex = masterKeyHex || process.env.MASTER_KEY;
  if (!keyHex) {
    throw new Error('MASTER_KEY is not defined');
  }

  // Ensure key is 32 bytes (256 bits)
  // If key is provided as hex string, use it directly buffer
  const keyBuffer = Buffer.from(keyHex, 'hex');
  if (keyBuffer.length !== 32) {
      throw new Error('MASTER_KEY must be a 32-byte hex string (64 characters)');
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return {
    encryptedSecret: encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
}

/**
 * Decrypts data using the master key.
 */
export function decrypt(encryptedSecret: string, ivHex: string, authTagHex: string, masterKeyHex?: string): string {
  const keyHex = masterKeyHex || process.env.MASTER_KEY;
  if (!keyHex) {
    throw new Error('MASTER_KEY is not defined');
  }

  const keyBuffer = Buffer.from(keyHex, 'hex');
  if (keyBuffer.length !== 32) {
      throw new Error('MASTER_KEY must be a 32-byte hex string (64 characters)');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  let decrypted = decipher.update(encryptedSecret, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a random secure session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hashes a token using Argon2.
 */
export async function hashToken(token: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  return await argon2id({
    password: token,
    salt: salt,
    parallelism: 1,
    iterations: 256,
    memorySize: 512, // 512KB to be safe in Worker environment
    hashLength: 32,
    outputType: 'encoded',
  }) as string;
}

/**
 * Verifies a token against a hash.
 */
export async function verifyToken(hash: string, token: string): Promise<boolean> {
  return await argon2Verify({
    password: token,
    hash: hash,
  });
}
