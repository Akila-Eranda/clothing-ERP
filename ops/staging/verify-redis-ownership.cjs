#!/usr/bin/env node
/**
 * Redis connectivity + WhatsApp session-ownership check, run INSIDE an API container (uses the app's own compiled lock):
 *   docker compose ... exec -T api-a node - selfcheck       < ops/staging/verify-redis-ownership.cjs
 *   docker compose ... exec -T api-a node - hold  T1 90     < ops/staging/verify-redis-ownership.cjs   (instance A holds tenant T1 for 90 s)
 *   docker compose ... exec -T api-b node - probe T1        < ops/staging/verify-redis-ownership.cjs   (instance B must be REFUSED)
 * Uses throw-away tenant keys (prefix "stg-check-"); never touches real tenants' keys unless you pass one.
 */
const Redis = require('/app/node_modules/ioredis');
const { RedisWhatsappSessionLock } = require('/app/dist/modules/whatsapp/whatsapp-session-lock.js');
const [, , mode = 'selfcheck', tenant = `stg-check-${Date.now()}`, ttlArg = '60'] = process.argv;
let failed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failed = 1; };

(async () => {
  const redis = new Redis({
    host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT || 6379), password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0), maxRetriesPerRequest: 1, connectTimeout: 5000,
  });
  try {
    check((await redis.ping()) === 'PONG', `Redis reachable at ${process.env.REDIS_HOST}:${process.env.REDIS_PORT} with the configured password`);
    const me = `${require('os').hostname()}-${process.pid}`;
    if (mode === 'selfcheck') {
      const a = new RedisWhatsappSessionLock(redis, `A-${me}`, 3000), b = new RedisWhatsappSessionLock(redis, `B-${me}`, 3000);
      check(await a.acquire(tenant), 'owner A acquires the session');
      check(!(await b.acquire(tenant)), 'owner B is refused while A holds it');
      check(await a.renew(tenant), 'owner A can renew');
      check(!(await b.renew(tenant)), 'owner B cannot renew');
      await b.release(tenant); check(!(await b.acquire(tenant)), 'B cannot release A\'s lock');
      await a.release(tenant); check(await b.acquire(tenant), 'after A releases, B can take over');
      await b.release(tenant);
      const c = new RedisWhatsappSessionLock(redis, `C-${me}`, 400), d = new RedisWhatsappSessionLock(redis, `D-${me}`, 3000);
      await c.acquire(tenant); await new Promise((r) => setTimeout(r, 600));
      check(await d.acquire(tenant), 'a crashed owner (lock expired) can be replaced'); await d.release(tenant);
    } else if (mode === 'hold') {
      const l = new RedisWhatsappSessionLock(redis, `HOLD-${me}`, Number(ttlArg) * 1000);
      check(await l.acquire(tenant), `this instance (${me}) now owns tenant key ${tenant} for ${ttlArg}s`);
      console.log(`OWNER=${l.ownerId}`);
    } else if (mode === 'probe') {
      const l = new RedisWhatsappSessionLock(redis, `PROBE-${me}`, 5000);
      check(!(await l.acquire(tenant)), `this instance (${me}) is REFUSED ownership of ${tenant} (another instance holds it)`);
    }
  } catch (e) { check(false, `error: ${String(e.message).slice(0, 120)}`); }
  finally { redis.disconnect(); process.exit(failed); }
})();
