import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const MASTER_KEY_HEX = process.env.MASTER_KEY || '';

function getMasterKey(): Buffer {
    if (!MASTER_KEY_HEX) {
        throw new Error('MASTER_KEY is not defined');
    }
    if (MASTER_KEY_HEX.length === 64) {
        return Buffer.from(MASTER_KEY_HEX, 'hex');
    }
    // Fallback or explicit handling for passphrase could be added here
    // For now, assuming standard 32-byte key as hex
    throw new Error('MASTER_KEY must be a 64-character hex string');
}

export function encrypt(text: string): string {
    const key = getMasterKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
    const key = getMasterKey();
    const parts = encryptedText.split(':');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted text format');
    }

    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

export function generateRandomString(length: number): string {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

export function hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
}
