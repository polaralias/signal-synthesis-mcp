import { PrismaClient, ApiKey, UserConfig } from '@prisma/client';
import { hashToken, generateRandomString } from '../security/crypto';
import { prisma } from './database';

type ApiKeyWithUserConfig = ApiKey & { userConfig: UserConfig };

export class ApiKeyService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async createApiKey(userConfigId: string, ip?: string): Promise<{ apiKey: string, model: ApiKey }> {
        const rawKey = 'sk-' + generateRandomString(48);
        const keyHash = hashToken(rawKey);

        const apiKey = await this.prisma.apiKey.create({
            data: {
                userConfigId,
                keyHash,
                createdIp: ip,
            },
        });

        return { apiKey: rawKey, model: apiKey };
    }

    async validateApiKey(rawKey: string): Promise<ApiKeyWithUserConfig | null> {
        const keyHash = hashToken(rawKey);
        const apiKey = await this.prisma.apiKey.findUnique({
            where: { keyHash },
            include: { userConfig: true },
        });

        if (!apiKey || apiKey.revokedAt || (apiKey.userConfig && apiKey.userConfig.revokedAt)) {
            return null;
        }

        return apiKey;
    }

    async recordUsage(id: string, ip?: string) {
        // Fire and forget update to avoid blocking
        try {
            await this.prisma.apiKey.update({
                where: { id },
                data: {
                    lastUsedAt: new Date(),
                    lastUsedIp: ip
                }
            });
        } catch (e) {
            // Ignore stats errors
        }
    }

    async revokeApiKey(id: string): Promise<void> {
        await this.prisma.apiKey.update({
            where: { id },
            data: { revokedAt: new Date() },
        });
    }
}
