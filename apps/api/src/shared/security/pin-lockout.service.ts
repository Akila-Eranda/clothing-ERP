/**
 * Brute-force protection for every POS PIN check — manager approvals, cashier PIN unlock (switch user)
 * and PIN set — shared by all API instances through Redis.
 *
 * - An attempt is RESERVED before the PIN is checked (atomic Lua script): the counter is incremented
 *   first, so parallel requests cannot all slip past a "not locked yet" check. At most `max` PINs are
 *   ever verified per window.
 * - A wrong PIN keeps its reservation; reaching `max` locks the scope for 15 minutes.
 * - A correct PIN only RELEASES ITS OWN reservation. It never wipes earlier failures — otherwise a
 *   cashier could guess 4 PINs, unlock with their own PIN, and repeat forever.
 * - Messages never say whether an account exists. No PIN, token or secret is written to Redis or logs:
 *   only counters keyed by scope (purpose + tenant + terminal user).
 *
 * Redis outage (REDIS_HOST set but unreachable): FAIL CLOSED by default — PIN checks answer 503 and no
 * PIN is verified, so a Redis outage can never be used to get unlimited guesses. Managers can still sign
 * in with their password. PIN_LOCKOUT_FAIL_OPEN=true switches to per-instance in-memory limits instead
 * (weaker with several API instances; for single-instance installs only).
 * Without REDIS_HOST (unit tests, single-process dev) the in-memory limits are used.
 */
import { Injectable, Logger, OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';

export const PIN_MAX_FAILS = 5;
export const PIN_LOCK_MS = 15 * 60 * 1000;
export const PIN_CHECKS_UNAVAILABLE =
  'PIN checks are temporarily unavailable. Try again in a minute, or sign in with your password.';

const PREFIX = 'cash-approval-pin:';

/** KEYS: fails, lock · ARGV: max, windowMs → {attemptNo, 0} when allowed, {0, lockMsLeft} when locked. */
const BEGIN_LUA = `
local left = redis.call('PTTL', KEYS[2])
if left > 0 then return {0, left} end
local c = redis.call('INCR', KEYS[1])
redis.call('PEXPIRE', KEYS[1], ARGV[2])
if c > tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[2])
  return {0, tonumber(ARGV[2])}
end
return {c, 0}`;

/** KEYS: fails, lock · ARGV: max, windowMs — a wrong PIN: lock once the reserved count reaches max. */
const FAIL_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c >= tonumber(ARGV[1]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[2])
  redis.call('DEL', KEYS[1])
  return 1
end
return 0`;

/** KEYS: fails — a correct PIN gives back only its own reservation (never below zero). */
const RELEASE_LUA = `
local c = tonumber(redis.call('GET', KEYS[1]) or '0')
if c > 0 then redis.call('DECR', KEYS[1]) end
return c`;

type RedisWithScripts = Redis & {
  pinBegin(fails: string, lock: string, max: number, windowMs: number): Promise<[number, number]>;
  pinFail(fails: string, lock: string, max: number, windowMs: number): Promise<number>;
  pinRelease(fails: string): Promise<number>;
};

export type PinAttempt = { allowed: true } | { allowed: false; lockedUntil: number };

@Injectable()
export class PinLockoutService implements OnModuleDestroy {
  private readonly logger = new Logger(PinLockoutService.name);
  private readonly redis: RedisWithScripts | null;
  private readonly failOpen = process.env.PIN_LOCKOUT_FAIL_OPEN === 'true';
  private readonly memory = new Map<string, { count: number; expires: number; lockedUntil: number }>();

  constructor() {
    const host = process.env.REDIS_HOST;
    if (!host) {
      this.redis = null;
      return;
    }
    const client = new Redis({
      host,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      keyPrefix: process.env.REDIS_KEY_PREFIX || 'fashion_erp:',
      maxRetriesPerRequest: 1,
      commandTimeout: 2000,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    client.on('error', () => {
      /* reported per call (fail closed, or memory when PIN_LOCKOUT_FAIL_OPEN=true) */
    });
    client.defineCommand('pinBegin', { numberOfKeys: 2, lua: BEGIN_LUA });
    client.defineCommand('pinFail', { numberOfKeys: 2, lua: FAIL_LUA });
    client.defineCommand('pinRelease', { numberOfKeys: 1, lua: RELEASE_LUA });
    this.redis = client as RedisWithScripts;
  }

  async onModuleDestroy() {
    // disconnect(), not quit(): quit() waits forever on a client that never connected (Redis down).
    this.redis?.disconnect();
  }

  private keys(scope: string) {
    return [`${PREFIX}fail:${scope}`, `${PREFIX}lock:${scope}`] as const;
  }

  /** Redis failed: refuse (fail closed) unless explicitly configured to fall back to process memory. */
  private onRedisError(err: unknown): void {
    if (!this.failOpen) {
      this.logger.error(`PIN lockout store unavailable — refusing PIN checks (${(err as Error)?.message ?? 'error'})`);
      throw new ServiceUnavailableException({ statusCode: 503, error: 'PIN_CHECKS_UNAVAILABLE', message: PIN_CHECKS_UNAVAILABLE });
    }
    this.logger.warn(`PIN lockout: Redis unavailable, using in-process limits (${(err as Error)?.message ?? 'error'})`);
  }

  /** Reserves one PIN attempt for this scope, or reports the lock. Call BEFORE verifying the PIN. */
  async begin(scope: string, now = Date.now(), max = PIN_MAX_FAILS): Promise<PinAttempt> {
    if (this.redis) {
      try {
        const [fail, lock] = this.keys(scope);
        const [attempt, left] = await this.redis.pinBegin(fail, lock, max, PIN_LOCK_MS);
        return attempt > 0 ? { allowed: true } : { allowed: false, lockedUntil: now + Number(left) };
      } catch (err) {
        this.onRedisError(err);
      }
    }
    const m = this.memory.get(scope);
    if (m && m.lockedUntil > now) return { allowed: false, lockedUntil: m.lockedUntil };
    const count = m && m.expires > now ? m.count + 1 : 1;
    if (count > max) {
      this.memory.set(scope, { count: 0, expires: 0, lockedUntil: now + PIN_LOCK_MS });
      return { allowed: false, lockedUntil: now + PIN_LOCK_MS };
    }
    this.memory.set(scope, { count, expires: now + PIN_LOCK_MS, lockedUntil: 0 });
    return { allowed: true };
  }

  /** The reserved attempt was a wrong PIN. */
  async fail(scope: string, now = Date.now(), max = PIN_MAX_FAILS): Promise<void> {
    if (this.redis) {
      try {
        const [fail, lock] = this.keys(scope);
        await this.redis.pinFail(fail, lock, max, PIN_LOCK_MS);
        return;
      } catch (err) {
        // The attempt was already counted in begin(); losing the lock escalation is logged, not thrown.
        this.logger.error(`PIN lockout: could not record a wrong PIN (${(err as Error)?.message ?? 'error'})`);
        if (!this.failOpen) return;
      }
    }
    const m = this.memory.get(scope);
    if (m && m.count >= max) this.memory.set(scope, { count: 0, expires: 0, lockedUntil: now + PIN_LOCK_MS });
  }

  /** The reserved attempt was a correct PIN: give back only that reservation (earlier failures stay). */
  async succeed(scope: string): Promise<void> {
    const m = this.memory.get(scope);
    if (m && m.count > 0) m.count -= 1;
    if (!this.redis) return;
    try {
      await this.redis.pinRelease(this.keys(scope)[0]);
    } catch {
      /* harmless: the reservation simply expires with the window */
    }
  }
}
