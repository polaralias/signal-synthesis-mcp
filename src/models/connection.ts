import { prisma } from '../services/database';
import { encrypt, decrypt, generateSessionToken, hashToken, verifyToken } from '../utils/security';
import { Prisma } from '@prisma/client';

export interface CreateConnectionInput {
  name: string;
  serverType: string;
  config: Record<string, any>;
  credentials?: Record<string, string>; // e.g. { ALPACA_API_KEY: '...' }
}

export class ConnectionManager {
  /**
   * Creates a new connection profile and securely stores credentials.
   */
  static async createConnection(input: CreateConnectionInput) {
    const { name, serverType, config, credentials } = input;

    // Start transaction
    return await prisma.$transaction(async (tx) => {
      // 1. Create Connection
      const connection = await tx.connection.create({
        data: {
          name,
          serverType,
          config: config as Prisma.InputJsonValue,
        },
      });

      // 2. Encrypt and store credentials if any
      if (credentials) {
        for (const [provider, secret] of Object.entries(credentials)) {
          const { encryptedSecret, iv, authTag } = encrypt(secret);
          await tx.authCredential.create({
            data: {
              connectionId: connection.id,
              provider,
              encryptedSecret,
              iv,
              authTag,
            },
          });
        }
      }

      return connection;
    });
  }

  /**
   * Retrieves a connection with its decrypted credentials.
   * WARNING: Use only when initializing a session/router, do not expose to API.
   */
  static async getConnectionWithCredentials(connectionId: string) {
    const connection = await prisma.connection.findUnique({
      where: { id: connectionId },
      include: { credentials: true },
    });

    if (!connection) return null;

    const decryptedCredentials: Record<string, string> = {};

    for (const cred of connection.credentials) {
      try {
        decryptedCredentials[cred.provider] = decrypt(
            cred.encryptedSecret,
            cred.iv,
            cred.authTag
        );
      } catch (error) {
        console.error(`Failed to decrypt credential for ${cred.provider}`, error);
        // Continue, but this credential will be missing
      }
    }

    return {
      ...connection,
      decryptedCredentials,
    };
  }

  /**
   * Creates a new session for a connection.
   * Returns the session object and a composite token string "sessionId:secret".
   */
  static async createSession(connectionId: string, ttlSeconds: number = 86400) {
    const secret = generateSessionToken(); // 32 bytes hex
    const tokenHash = await hashToken(secret);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    const session = await prisma.session.create({
      data: {
        connectionId,
        tokenHash,
        expiresAt,
      },
    });

    const compositeToken = `${session.id}:${secret}`;
    return { session, token: compositeToken };
  }

  /**
   * Validates a composite session token and returns the session details with decrypted connection credentials.
   * Token format: "sessionId:secret"
   */
  static async validateSession(compositeToken: string) {
    const [sessionId, secret] = compositeToken.split(':');

    if (!sessionId || !secret) return null;

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { connection: { include: { credentials: true } } },
    });

    if (!session) return null;
    if (session.revokedAt) return null;
    if (session.expiresAt < new Date()) return null;

    // Verify secret against hash
    const isValid = await verifyToken(session.tokenHash, secret);
    if (!isValid) return null;

    // Update lastUsedAt (async, don't await to block response)
    prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    }).catch(err => console.error('Failed to update session lastUsedAt', err));

    // Decrypt credentials for the connection
    const decryptedCredentials: Record<string, string> = {};
    if (session.connection && session.connection.credentials) {
       for (const cred of session.connection.credentials) {
          try {
             decryptedCredentials[cred.provider] = decrypt(cred.encryptedSecret, cred.iv, cred.authTag);
          } catch (e) {
             console.error(`Failed to decrypt credential for ${cred.provider}`, e);
          }
       }
    }

    return {
      ...session,
      connection: {
        ...session.connection,
        decryptedCredentials
      }
    };
  }
}
