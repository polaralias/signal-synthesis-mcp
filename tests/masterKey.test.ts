import { getMasterKeyBytes } from '../src/security/masterKey';
import crypto from 'crypto';

describe('Master Key Utility', () => {
    const originalKey = process.env.MASTER_KEY;

    afterAll(() => {
        process.env.MASTER_KEY = originalKey;
    });

    it('should throw error if MASTER_KEY is missing or empty', () => {
        delete process.env.MASTER_KEY;
        expect(() => getMasterKeyBytes()).toThrow('MASTER_KEY is missing or empty');

        process.env.MASTER_KEY = '';
        expect(() => getMasterKeyBytes()).toThrow('MASTER_KEY is missing or empty');
    });

    it('should decode 64 hex characters into 32 bytes', () => {
        const hex32 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
        process.env.MASTER_KEY = hex32;
        const bytes = getMasterKeyBytes();

        expect(bytes.length).toBe(32);
        expect(bytes.toString('hex')).toBe(hex32);
    });

    it('should derive 32-byte key from passphrase using SHA-256', () => {
        const passphrase = 'this-is-a-secure-passphrase';
        process.env.MASTER_KEY = passphrase;
        const bytes = getMasterKeyBytes();

        expect(bytes.length).toBe(32);
        const expected = crypto.createHash('sha256').update(passphrase, 'utf8').digest();
        expect(bytes.equals(expected)).toBe(true);
    });

    it('should handle uppercase hex characters', () => {
        const hex32 = 'ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789';
        process.env.MASTER_KEY = hex32;
        const bytes = getMasterKeyBytes();

        expect(bytes.length).toBe(32);
        expect(bytes.toString('hex')).toBe(hex32.toLowerCase());
    });

    it('should trim whitespace from MASTER_KEY', () => {
        const passphrase = '  passphrase  ';
        process.env.MASTER_KEY = passphrase;
        const bytes = getMasterKeyBytes();

        const expected = crypto.createHash('sha256').update('passphrase', 'utf8').digest();
        expect(bytes.equals(expected)).toBe(true);
    });
});
