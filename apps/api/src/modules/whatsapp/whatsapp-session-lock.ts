import { randomUUID } from 'crypto';
import Redis from 'ioredis';

/**
 * Session ownership: at most ONE API instance may hold a tenant's WhatsApp socket at a time. Two instances using the
 * same login make WhatsApp kick one of them ("connection replaced") and they then fight in a reconnect loop, which
 * can end with the account being logged out. The owner takes a time-limited lock, renews it while connected, and
 * releases it on shutdown; if the owner dies the lock simply expires and another instance can take over.
 */
export interface WhatsappSessionLock {
  /** Unique id of this API process (the lock value). */
  readonly ownerId: string;
  /** Take (or keep) ownership. false = another instance owns the session. Throws if ownership cannot be determined. */
  acquire(tenantId: string): Promise<boolean>;
  /** Extend ownership. false = ownership was lost (someone else holds it, or it expired and was taken). */
  renew(tenantId: string): Promise<boolean>;
  /** Give ownership up (only if we own it). */
  release(tenantId: string): Promise<void>;
}

export const SESSION_LOCK_TTL_MS = 60_000;
export const SESSION_LOCK_RENEW_MS = 20_000;

const keyOf = (tenantId: string) => `wa-session-owner:${tenantId}`;

/** Compare-and-extend: only the current owner can extend. KEYS[1]=key ARGV[1]=owner ARGV[2]=ttlMs */
const RENEW_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return 0`;
/** Compare-and-delete: only the current owner can release. */
const RELEASE_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end
return 0`;

export class RedisWhatsappSessionLock implements WhatsappSessionLock {
  readonly ownerId: string;
  constructor(
    private readonly redis: Pick<Redis, 'set' | 'eval'>,
    ownerId: string = `${process.pid}-${randomUUID()}`,
    private readonly ttlMs: number = SESSION_LOCK_TTL_MS,
  ) {
    this.ownerId = ownerId;
  }

  async acquire(tenantId: string): Promise<boolean> {
    const got = await this.redis.set(keyOf(tenantId), this.ownerId, 'PX', this.ttlMs, 'NX');
    if (got === 'OK') return true;
    // already ours (e.g. reconnecting after a drop)? keep it
    return this.renew(tenantId);
  }

  async renew(tenantId: string): Promise<boolean> {
    const r = await this.redis.eval(RENEW_LUA, 1, keyOf(tenantId), this.ownerId, String(this.ttlMs));
    return Number(r) === 1;
  }

  async release(tenantId: string): Promise<void> {
    await this.redis.eval(RELEASE_LUA, 1, keyOf(tenantId), this.ownerId);
  }
}

/** Single-process fallback (no Redis configured): this process owns everything. Documented single-instance assumption. */
export class LocalWhatsappSessionLock implements WhatsappSessionLock {
  readonly ownerId = `local-${process.pid}`;
  async acquire(): Promise<boolean> { return true; }
  async renew(): Promise<boolean> { return true; }
  async release(): Promise<void> { /* nothing to release */ }
}
