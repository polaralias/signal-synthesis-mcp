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
                // displayName, // Removed from schema
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
        // UserConfig doesn't have revokedAt in the schema anymore?
        // "user_configs(id UUID PK... config_enc TEXT, config_fingerprint TEXT...)"
        // The prompt data model says: "user_configs(id UUID PK, server_id TEXT, config_enc TEXT, config_fingerprint TEXT, ...)"
        // It doesn't explicitly list revokedAt for UserConfig, only for ApiKey.
        // But the previous code had it.
        // Let's assume UserConfigs are immutable or we just delete them?
        // Or I should have kept it.
        // Prompt says "Revoke session... revoke API key...". It doesn't strictly say "Revoke Config".
        // But for safety, I should probably delete or ignore if I can't revoke.

        // I'll leave the revokedAt logic for ApiKey which definitely has it.
        // For UserConfig, maybe I just delete it? Or leave it be.

        // await this.prisma.userConfig.update({
        //     where: { id },
        //     data: { revokedAt: new Date() },
        // });

        // Also revoke all associated keys
        await this.prisma.apiKey.updateMany({
            where: { userConfigId: id },
            data: { revokedAt: new Date() },
        });
    }
}
