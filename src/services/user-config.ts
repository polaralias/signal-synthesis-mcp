import { PrismaClient, UserConfig, ApiKey } from '@prisma/client';
import { encrypt, decrypt, hashToken } from '../security/crypto';
import { prisma } from './database';
import { ConfigSchema, ConfigType } from '../config-schema';

export class UserConfigService {
    private prisma: PrismaClient;
    private serverId = 'signal-synthesis-mcp';

    constructor() {
        this.prisma = prisma;
    }

    async createConfig(config: ConfigType, displayName?: string): Promise<UserConfig> {
        const configJson = JSON.stringify(config);
        const configEncrypted = encrypt(configJson);
        // Determine fingerprint to prevent duplicates if needed
        // const configFingerprint = hashToken(configJson); 

        return this.prisma.userConfig.create({
            data: {
                serverId: this.serverId,
                configEncrypted,
                displayName,
                // configFingerprint,
            },
        });
    }

    async getConfig(id: string): Promise<ConfigType | null> {
        const userConfig = await this.prisma.userConfig.findUnique({
            where: { id },
        });

        if (!userConfig) return null;

        try {
            const configJson = decrypt(userConfig.configEncrypted);
            return JSON.parse(configJson);
        } catch (error) {
            console.error('Failed to decrypt user config', error);
            return null;
        }
    }

    async revokeConfig(id: string): Promise<void> {
        await this.prisma.userConfig.update({
            where: { id },
            data: { revokedAt: new Date() },
        });
        // Also revoke all associated keys
        await this.prisma.apiKey.updateMany({
            where: { userConfigId: id },
            data: { revokedAt: new Date() },
        });
    }
}
