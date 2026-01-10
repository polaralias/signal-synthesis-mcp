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
        // Prompt requirement: "Generate a raw key mcp_sk_<64 hex chars>, hashes it with SHA-256"
        const rawKey = 'mcp_sk_' + generateRandomString(32); // 32 bytes -> 64 hex chars
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

        // UserConfig doesn't have revokedAt currently. If I need it, I should update schema.
        // For now, I'll rely on apiKey.revokedAt.
        // If UserConfig revocation is critical, I can check if UserConfig exists?

        if (!apiKey || apiKey.revokedAt) {
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
                    // lastUsedIp is removed from schema
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
