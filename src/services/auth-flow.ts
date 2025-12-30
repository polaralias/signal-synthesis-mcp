import { redis } from '../providers/redis';
import crypto from 'crypto';

interface SessionData {
  sessionId: string;
  token: string;
}

export class AuthFlow {
  /**
   * Generates a short-lived authorization code and stores the session data.
   */
  static async generateAuthCode(sessionData: SessionData): Promise<string> {
    const code = crypto.randomBytes(32).toString('hex');
    const key = `auth_code:${code}`;
    
    // Store for 60 seconds
    try {
        await redis.setex(key, 60, JSON.stringify(sessionData));
    } catch (e) {
        // Fallback to in-memory if Redis fails (mostly for local verification/dev without Redis)
        console.warn('Redis unavailable, using in-memory store for auth code');
        AuthFlow.memoryStore.set(key, { data: sessionData, expires: Date.now() + 60000 });
    }
    
    return code;
  }

  /**
   * Exchanges an authorization code for the stored session data.
   * The code is invalidated immediately after use.
   */
  static async exchangeAuthCode(code: string): Promise<SessionData | null> {
    const key = `auth_code:${code}`;
    let dataStr: string | null = null;
    let data: SessionData | null = null;

    try {
        // Atomic get and delete to prevent race conditions
        const results = await redis.multi().get(key).del(key).exec();
        // results is [[err, getVal], [err, delVal]]
        if (results && results[0] && !results[0][0] && results[0][1]) {
            dataStr = results[0][1] as string;
            data = JSON.parse(dataStr);
        }
    } catch (e) {
         // Fallback check
         const entry = AuthFlow.memoryStore.get(key);
         if (entry && entry.expires > Date.now()) {
             data = entry.data;
             AuthFlow.memoryStore.delete(key);
         }
    }
    
    return data;
  }

  // Simple in-memory fallback
  private static memoryStore = new Map<string, { data: SessionData, expires: number }>();

  /**
   * Cleans up expired entries from the memory store.
   * Can be called periodically or on access.
   */
  static cleanupMemoryStore() {
      const now = Date.now();
      for (const [key, entry] of AuthFlow.memoryStore.entries()) {
          if (entry.expires < now) {
              AuthFlow.memoryStore.delete(key);
          }
      }
  }
}

// Set up periodic cleanup for memory store (every minute)
setInterval(() => {
    AuthFlow.cleanupMemoryStore();
}, 60000).unref(); // unref so it doesn't prevent process exit
