import { randomBytes } from 'crypto';
import Redis from 'ioredis';

type Entry = { token: string; expiresAt: number };

const memoryStore = new Map<string, Entry>();
const TTL_MS = 10 * 60 * 1000;
const REDIS_PREFIX = 'impersonation:';

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;
  const host = process.env.REDIS_HOST;
  if (!host) return null;

  redisClient = new Redis({
    host,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'fashion_erp:',
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  redisClient.on('error', () => {
    /* fall back to memory on transient redis errors */
  });

  return redisClient;
}

function pruneExpiredMemory() {
  const now = Date.now();
  for (const [key, entry] of memoryStore) {
    if (entry.expiresAt <= now) memoryStore.delete(key);
  }
}

export async function createImpersonationCode(
  token: string,
  ttlMs = TTL_MS,
): Promise<string> {
  pruneExpiredMemory();
  const code = randomBytes(24).toString('base64url');
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`${REDIS_PREFIX}${code}`, token, 'EX', ttlSeconds);
      return code;
    } catch {
      /* memory fallback below */
    }
  }

  memoryStore.set(code, { token, expiresAt: Date.now() + ttlMs });
  return code;
}

export async function consumeImpersonationCode(code: string): Promise<string | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const key = `${REDIS_PREFIX}${code}`;
      const token = await redis.get(key);
      if (token) {
        await redis.del(key);
        return token;
      }
    } catch {
      /* try memory fallback */
    }
  }

  const entry = memoryStore.get(code);
  if (!entry) return null;
  memoryStore.delete(code);
  if (Date.now() > entry.expiresAt) return null;
  return entry.token;
}
