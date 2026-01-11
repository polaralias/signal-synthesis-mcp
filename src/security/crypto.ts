import crypto from 'crypto';
import { getMasterKeyBytes } from './masterKey';

const ALGORITHM = 'aes-256-gcm';

export function encrypt(text: string): string {
    const key = getMasterKeyBytes();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
    const key = getMasterKeyBytes();
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
