import { PIN_LOCK_MS, PIN_MAX_FAILS, PinLockoutService } from './pin-lockout.service';

/** In-process mode (no REDIS_HOST): the same rules the Redis scripts apply. Redis itself is covered by e2e. */
describe('PinLockoutService (in-process fallback)', () => {
  let saved: string | undefined;
  let svc: PinLockoutService;
  beforeAll(() => {
    saved = process.env.REDIS_HOST;
    delete process.env.REDIS_HOST;
  });
  afterAll(() => {
    if (saved !== undefined) process.env.REDIS_HOST = saved;
  });
  beforeEach(() => { svc = new PinLockoutService(); });

  const failOnce = async (scope: string, now: number) => {
    const a = await svc.begin(scope, now);
    if (a.allowed) await svc.fail(scope, now);
    return a;
  };

  it('5 wrong PINs lock the scope for 15 minutes; then it opens again', async () => {
    const now = 1_000_000;
    for (let i = 0; i < PIN_MAX_FAILS; i++) expect((await failOnce('t:u', now)).allowed).toBe(true);
    expect(await svc.begin('t:u', now + 1)).toEqual({ allowed: false, lockedUntil: now + PIN_LOCK_MS });
    expect((await svc.begin('t:u', now + PIN_LOCK_MS + 1)).allowed).toBe(true);
  });

  it('a correct PIN gives back only its own attempt: interleaving your own PIN does not reset the count', async () => {
    const now = 2_000_000;
    for (let i = 0; i < PIN_MAX_FAILS - 1; i++) await failOnce('t:u', now);
    // the cashier's OWN correct PIN
    expect((await svc.begin('t:u', now)).allowed).toBe(true);
    await svc.succeed('t:u');
    // one more wrong PIN is the 5th failure → locked (was: count reset, unlimited guessing)
    expect((await failOnce('t:u', now)).allowed).toBe(true);
    expect((await svc.begin('t:u', now)).allowed).toBe(false);
    expect((await svc.begin('t:other', now)).allowed).toBe(true);
  });

  it('legitimate repeated correct PINs never lock', async () => {
    const now = 2_500_000;
    for (let i = 0; i < 50; i++) {
      expect((await svc.begin('t:busy', now)).allowed).toBe(true);
      await svc.succeed('t:busy');
    }
  });

  it('a larger limit can be used per purpose (e.g. cashier switch)', async () => {
    const now = 2_700_000;
    for (let i = 0; i < 10; i++) expect((await svc.begin('t:sw', now, 10)).allowed).toBe(true);
    expect((await svc.begin('t:sw', now, 10)).allowed).toBe(false);
  });

  it('parallel attempts are reserved up front: never more than 5 PIN checks per window', async () => {
    const now = 3_000_000;
    const results = await Promise.all(Array.from({ length: 12 }, () => svc.begin('t:race', now)));
    expect(results.filter((r) => r.allowed)).toHaveLength(PIN_MAX_FAILS);
  });

  it('old failures expire after the window', async () => {
    const now = 4_000_000;
    for (let i = 0; i < PIN_MAX_FAILS - 1; i++) await failOnce('t:u', now);
    for (let i = 0; i < PIN_MAX_FAILS - 1; i++) expect((await failOnce('t:u', now + PIN_LOCK_MS + 1)).allowed).toBe(true);
  });
});

describe('PinLockoutService when Redis is configured but unreachable', () => {
  const saved = { host: process.env.REDIS_HOST, port: process.env.REDIS_PORT, open: process.env.PIN_LOCKOUT_FAIL_OPEN };
  afterAll(() => {
    for (const [k, v] of [['REDIS_HOST', saved.host], ['REDIS_PORT', saved.port], ['PIN_LOCKOUT_FAIL_OPEN', saved.open]] as const) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });

  it('fails closed by default: 503, no PIN is checked', async () => {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '1';
    delete process.env.PIN_LOCKOUT_FAIL_OPEN;
    const svc = new PinLockoutService();
    await expect(svc.begin('t:u')).rejects.toMatchObject({ status: 503 });
    await svc.onModuleDestroy();
  }, 20_000);

  it('PIN_LOCKOUT_FAIL_OPEN=true falls back to in-process limits', async () => {
    process.env.REDIS_HOST = '127.0.0.1';
    process.env.REDIS_PORT = '1';
    process.env.PIN_LOCKOUT_FAIL_OPEN = 'true';
    const svc = new PinLockoutService();
    for (let i = 0; i < PIN_MAX_FAILS; i++) {
      expect((await svc.begin('t:u')).allowed).toBe(true);
      await svc.fail('t:u');
    }
    expect((await svc.begin('t:u')).allowed).toBe(false);
    await svc.onModuleDestroy();
  }, 60_000);
});
