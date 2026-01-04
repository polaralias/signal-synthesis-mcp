import crypto from 'crypto';

/**
 * Standardised Master Key Derivation logic.
 * 
 * 1. If MASTER_KEY is 64 hex characters (32 bytes), decode it directly.
 * 2. Otherwise, treat it as a passphrase and derive a 32-byte key using SHA-256.
 * 
 * Returns a 32-byte Buffer.
 */
export function getMasterKeyBytes(): Buffer {
    const rawKey = (process.env.MASTER_KEY || '').trim();

    if (!rawKey) {
        throw new Error('MASTER_KEY is missing or empty. A 32-byte hex string or a strong passphrase is required.');
    }

    // Check if it's 64 hex characters
    const hexRegex = /^[0-9a-fA-F]{64}$/;
    if (hexRegex.test(rawKey)) {
        return Buffer.from(rawKey, 'hex');
    }

    // Otherwise, derive using SHA-256
    return crypto.createHash('sha256').update(rawKey, 'utf8').digest();
}

/**
 * Provides diagnostic info about the current MASTER_KEY format.
 * Never returns the actual key bytes.
 */
export function getMasterKeyInfo(): { format: 'hex' | 'passphrase'; length: number } {
    const rawKey = (process.env.MASTER_KEY || '').trim();
    const hexRegex = /^[0-9a-fA-F]{64}$/;

    return {
        format: hexRegex.test(rawKey) ? 'hex' : 'passphrase',
        length: rawKey.length,
    };
}
/**
 * Checks if a MASTER_KEY is configured.
 */
export function isMasterKeyPresent(): boolean {
    const rawKey = (process.env.MASTER_KEY || '').trim();
    return rawKey.length > 0;
}
