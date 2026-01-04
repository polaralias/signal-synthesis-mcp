import { encrypt, decrypt, hashToken, verifyToken } from '../src/services/security';
import crypto from 'crypto';

// Mock getMasterKeyBytes to avoid modifying global env or relying on implementation details of masterKey.ts
// However, since we are testing service integration, we can set env var.

describe('Security Services', () => {
  const TEST_MASTER_KEY = crypto.randomBytes(32).toString('hex');

  beforeAll(() => {
    process.env.MASTER_KEY = TEST_MASTER_KEY;
  });

  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const original = 'super-secret-api-key';
      const encrypted = encrypt(original);

      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(original);
      // Format is iv:authTag:encrypted (hex:hex:hex)
      const parts = encrypted.split(':');
      expect(parts.length).toBe(3);

      const decrypted = decrypt(encrypted);
      expect(decrypted).toBe(original);
    });

    it('should NOT throw error with short key (derives via SHA-256)', () => {
        // Backup original key
        const originalKey = process.env.MASTER_KEY;
        process.env.MASTER_KEY = 'short-key';

        // Should NOT throw, because it falls back to SHA-256 derivation
        expect(() => encrypt('test')).not.toThrow();

        // Restore key
        process.env.MASTER_KEY = originalKey;
    });

    it('should throw error if MASTER_KEY is missing', () => {
        const originalKey = process.env.MASTER_KEY;
        delete process.env.MASTER_KEY;

        expect(() => encrypt('test')).toThrow('MASTER_KEY is missing or empty');

        process.env.MASTER_KEY = originalKey;
    });
  });

  describe('Session Tokens', () => {
    it('should hash and verify token correctly', async () => {
      const token = 'some-random-token-string';
      const hash = await hashToken(token);

      expect(hash).not.toBe(token);

      const isValid = await verifyToken(token, hash);
      expect(isValid).toBe(true);

      const isInvalid = await verifyToken('wrong-token', hash);
      expect(isInvalid).toBe(false);
    });
  });
});
