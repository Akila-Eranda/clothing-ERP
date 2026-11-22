/**
 * Part 4 - the cross-instance WhatsApp ownership lock against a REAL Redis (throw-away container, localhost only).
 * Requires HEXA_INT_REDIS_PORT (+ HEXA_INT_REDIS_PASSWORD); skipped otherwise.
 */
import Redis from 'ioredis';
import { RedisWhatsappSessionLock } from '@/modules/whatsapp/whatsapp-session-lock';

const port = process.env.HEXA_INT_REDIS_PORT;
const d = port ? describe : describe.skip;

d('RedisWhatsappSessionLock (real Redis)', () => {
  let redis: Redis;
  const tenant = () => `t-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  beforeAll(() => {
    redis = new Redis({ host: '127.0.0.1', port: Number(port), password: process.env.HEXA_INT_REDIS_PASSWORD || undefined, maxRetriesPerRequest: 1 });
  });
  afterAll(async () => { await redis.quit(); });

  it('exactly one of many racing instances wins the session', async () => {
    const t = tenant();
    const locks = Array.from({ length: 12 }, (_, i) => new RedisWhatsappSessionLock(redis, `inst-${i}`, 5_000));
    const results = await Promise.all(locks.map((l) => l.acquire(t)));
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('the owner can re-acquire / renew; others cannot renew or release it', async () => {
    const t = tenant();
    const a = new RedisWhatsappSessionLock(redis, 'A', 5_000);
    const b = new RedisWhatsappSessionLock(redis, 'B', 5_000);
    expect(await a.acquire(t)).toBe(true);
    expect(await a.acquire(t)).toBe(true); // reconnect by the same owner
    expect(await a.renew(t)).toBe(true);
    expect(await b.acquire(t)).toBe(false);
    expect(await b.renew(t)).toBe(false);
    await b.release(t); // must NOT free A's lock
    expect(await b.acquire(t)).toBe(false);
    await a.release(t);
    expect(await b.acquire(t)).toBe(true);
  });

  it('a crashed owner (no release) loses the session when the lock expires, and another instance takes over', async () => {
    const t = tenant();
    const a = new RedisWhatsappSessionLock(redis, 'A', 300);
    const b = new RedisWhatsappSessionLock(redis, 'B', 5_000);
    expect(await a.acquire(t)).toBe(true);
    expect(await b.acquire(t)).toBe(false);
    await new Promise((r) => setTimeout(r, 450));
    expect(await a.renew(t)).toBe(false); // too late: A must stop its socket
    expect(await b.acquire(t)).toBe(true);
  });

  it('renewal keeps a healthy owner alive past the original TTL', async () => {
    const t = tenant();
    const a = new RedisWhatsappSessionLock(redis, 'A', 400);
    const b = new RedisWhatsappSessionLock(redis, 'B', 400);
    await a.acquire(t);
    for (let i = 0; i < 4; i++) { await new Promise((r) => setTimeout(r, 200)); expect(await a.renew(t)).toBe(true); }
    expect(await b.acquire(t)).toBe(false);
  });

  it('tenants are isolated from each other', async () => {
    const a = new RedisWhatsappSessionLock(redis, 'A', 5_000);
    const t1 = tenant(); const t2 = tenant();
    expect(await a.acquire(t1)).toBe(true);
    const b = new RedisWhatsappSessionLock(redis, 'B', 5_000);
    expect(await b.acquire(t2)).toBe(true);
  });
});
