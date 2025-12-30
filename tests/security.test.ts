import { encrypt, decrypt, generateSessionToken, hashToken, verifyToken } from '../src/utils/security';
import crypto from 'crypto';

describe('Security Utilities', () => {
  const TEST_MASTER_KEY = crypto.randomBytes(32).toString('hex');

  beforeAll(() => {
    process.env.MASTER_KEY = TEST_MASTER_KEY;
  });

  describe('Encryption/Decryption', () => {
    it('should encrypt and decrypt a string correctly', () => {
      const original = 'super-secret-api-key';
      const { encryptedSecret, iv, authTag } = encrypt(original);

      expect(encryptedSecret).not.toBe(original);
      expect(iv).toHaveLength(32); // 16 bytes hex
      expect(authTag).toHaveLength(32); // 16 bytes hex

      const decrypted = decrypt(encryptedSecret, iv, authTag);
      expect(decrypted).toBe(original);
    });

    it('should throw error with invalid key length', () => {
        // Backup original key
        const originalKey = process.env.MASTER_KEY;
        process.env.MASTER_KEY = 'short-key';

        expect(() => encrypt('test')).toThrow('MASTER_KEY must be a 32-byte hex string');

        // Restore key
        process.env.MASTER_KEY = originalKey;
    });
  });

  describe('Session Tokens', () => {
    it('should generate a token of correct format', () => {
      const token = generateSessionToken();
      expect(token).toHaveLength(64); // 32 bytes hex
    });

    it('should hash and verify token correctly', async () => {
      const token = generateSessionToken();
      const hash = await hashToken(token);

      expect(hash).not.toBe(token);

      const isValid = await verifyToken(hash, token);
      expect(isValid).toBe(true);

      const isInvalid = await verifyToken(hash, 'wrong-token');
      expect(isInvalid).toBe(false);
    });
  });
});
