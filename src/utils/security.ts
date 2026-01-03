import crypto from 'crypto';
import { argon2id, argon2Verify } from 'hash-wasm';

import { getMasterKeyBytes } from '../security/masterKey';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypts a text using the master key.
 * Format of return: { encryptedSecret, iv, authTag } (all hex strings)
 */
export function encrypt(text: string): { encryptedSecret: string; iv: string; authTag: string } {
  const keyBuffer = getMasterKeyBytes();

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
export function decrypt(encryptedSecret: string, ivHex: string, authTagHex: string): string {
  const keyBuffer = getMasterKeyBytes();

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
