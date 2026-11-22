/**
 * Part 4 - WhatsApp session reliability, exercised through WhatsappService with a fake Baileys (no network, no real
 * WhatsApp account, nothing is ever sent): timeout, logout, restart recovery, invalid credentials, concurrent
 * reconnects, two API instances competing for one session, ownership loss, graceful shutdown, no duplicate sends.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { WhatsappService } from './whatsapp.service';
import type { WhatsappSessionLock } from './whatsapp-session-lock';

const T1 = 'tenant-one';
const T2 = 'tenant-two';

type FakeSock = {
  handlers: Record<string, (u: any) => unknown>;
  ev: { on: (e: string, h: (u: any) => unknown) => void };
  end: jest.Mock;
  logout: jest.Mock;
  sendMessage: jest.Mock;
  user: { id: string; name: string };
};

function makeFakeBaileys() {
  const socks: FakeSock[] = [];
  const makeWASocket = jest.fn(() => {
    const handlers: FakeSock['handlers'] = {};
    const sock: FakeSock = {
      handlers,
      ev: { on: (e, h) => { handlers[e] = h; } },
      end: jest.fn(),
      logout: jest.fn(),
      sendMessage: jest.fn(),
      user: { id: '94770000000:1@s.whatsapp.net', name: 'Shop' },
    };
    socks.push(sock);
    return sock;
  });
  const baileys = {
    makeWASocket,
    useMultiFileAuthState: jest.fn(async () => ({ state: {}, saveCreds: jest.fn() })),
    fetchLatestWaWebVersion: jest.fn(async () => ({ version: [2, 3000, 1] })),
    fetchLatestBaileysVersion: jest.fn(async () => ({ version: [2, 3000, 1] })),
    DisconnectReason: { loggedOut: 401, timedOut: 408, connectionReplaced: 440 },
    Browsers: { macOS: () => ['Mac OS', 'Chrome', '14'] },
  };
  return { baileys, socks, makeWASocket };
}

/** One lock store shared by several "instances" (stands in for Redis). */
function sharedLockStore() {
  const owners = new Map<string, string>();
  const lockFor = (ownerId: string): WhatsappSessionLock & { failNext?: boolean } => ({
    ownerId,
    async acquire(tenantId) {
      const cur = owners.get(tenantId);
      if (!cur || cur === ownerId) { owners.set(tenantId, ownerId); return true; }
      return false;
    },
    async renew(tenantId) { return owners.get(tenantId) === ownerId; },
    async release(tenantId) { if (owners.get(tenantId) === ownerId) owners.delete(tenantId); },
  });
  return { owners, lockFor };
}

describe('WhatsappService reliability (QA-004 / Part 4)', () => {
  let authRoot: string;
  const services: WhatsappService[] = [];

  const build = (fake: ReturnType<typeof makeFakeBaileys>, lock?: WhatsappSessionLock) => {
    const cfg: Record<string, string> = { 'app.env': 'development', WHATSAPP_AUTH_DIR: authRoot, LOCAL_UPLOAD_DIR: path.join(authRoot, '..', 'uploads-x') };
    const prisma = { tenant: { findUnique: jest.fn(async () => ({ settings: {} })), update: jest.fn(async () => ({})) }, notification: { create: jest.fn() } };
    const svc = new WhatsappService(prisma as never, { get: (k: string) => cfg[k] } as never);
    (svc as any).baileys = fake.baileys;
    if (lock) svc.setSessionLock(lock);
    services.push(svc);
    return { svc, prisma };
  };
  const putCreds = (tenant: string, creds: unknown) => {
    fs.mkdirSync(path.join(authRoot, tenant), { recursive: true });
    fs.writeFileSync(path.join(authRoot, tenant, 'creds.json'), typeof creds === 'string' ? creds : JSON.stringify(creds));
  };
  const credsExist = (tenant: string) => fs.existsSync(path.join(authRoot, tenant, 'creds.json'));
  const open = async (sock: FakeSock) => sock.handlers['connection.update']({ connection: 'open' });
  const close = async (sock: FakeSock, statusCode: number, message = '') =>
    sock.handlers['connection.update']({ connection: 'close', lastDisconnect: { error: { output: { statusCode }, message } } });

  const savedRedisHost = process.env.REDIS_HOST;
  beforeEach(() => {
    delete process.env.REDIS_HOST; // never open a real Redis connection from a unit test (the lock is injected)
    authRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-svc-'));
    jest.useFakeTimers();
  });
  afterEach(async () => {
    for (const s of services.splice(0)) await s.onModuleDestroy();
    jest.useRealTimers();
    if (savedRedisHost !== undefined) process.env.REDIS_HOST = savedRedisHost;
    fs.rmSync(authRoot, { recursive: true, force: true });
  });

  it('TIMEOUT: a 408 drop keeps the saved login, reconnects automatically and sends nothing', async () => {
    const fake = makeFakeBaileys();
    const { svc } = build(fake);
    putCreds(T1, { me: { id: '94770000000@s.whatsapp.net' } });
    await svc.connect(T1);
    await open(fake.socks[0]);
    expect(svc.getStatus(T1).status).toBe('connected');

    await close(fake.socks[0], 408, 'Timed Out');
    expect(credsExist(T1)).toBe(true); // THE bug: this used to be deleted
    expect(svc.getStatus(T1).status).toBe('disconnected');

    await jest.advanceTimersByTimeAsync(40_000); // jittered back-off, well under the cap
    expect(fake.makeWASocket).toHaveBeenCalledTimes(2);
    await open(fake.socks[1]);
    expect(svc.getStatus(T1).status).toBe('connected');
    expect(fake.socks.every((s) => s.sendMessage.mock.calls.length === 0)).toBe(true); // no unsolicited / duplicate messages
  });

  it('TRANSIENT DISCONNECT (any non-logout code): credentials kept, back-off retries, gives up after the cap but never wipes', async () => {
    const fake = makeFakeBaileys();
    const { svc } = build(fake);
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await svc.connect(T1);
    for (let i = 0; i < 12; i++) {
      const sock = fake.socks[fake.socks.length - 1];
      await close(sock, 500, 'connection lost');
      await jest.advanceTimersByTimeAsync(70_000);
    }
    expect(credsExist(T1)).toBe(true);
    // bounded: the reconnect budget (8) is not exceeded by a flapping connection
    expect(fake.makeWASocket.mock.calls.length).toBeLessThanOrEqual(1 + 8);
    expect(svc.getStatus(T1).status).not.toBe('logged_out');
  });

  it('EXPLICIT LOGOUT (401): the session is invalidated, credentials removed, ownership released, no reconnect', async () => {
    const fake = makeFakeBaileys();
    const store = sharedLockStore();
    const { svc } = build(fake, store.lockFor('A'));
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await svc.connect(T1);
    await open(fake.socks[0]);
    expect(store.owners.get(T1)).toBe('A');

    await close(fake.socks[0], 401, 'logged out from phone');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(svc.getStatus(T1).status).toBe('logged_out');
    expect(credsExist(T1)).toBe(false);
    expect(store.owners.has(T1)).toBe(false);
    expect(fake.makeWASocket).toHaveBeenCalledTimes(1); // no reconnect attempt after a genuine logout
  });

  it('RESTART: paired sessions are resumed automatically; unpaired / corrupt ones are not (INVALID CREDENTIALS)', async () => {
    const fake = makeFakeBaileys();
    const { svc } = build(fake);
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    putCreds(T2, '{this is not json');
    putCreds('tenant-unpaired', { registered: false });
    await svc.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(fake.makeWASocket).toHaveBeenCalledTimes(1);
    expect(credsExist(T2)).toBe(true); // corrupt file is left for a human, never silently deleted
    await open(fake.socks[0]);
    expect(svc.getStatus(T1).status).toBe('connected');
  });

  it('RESTART: resume can be switched off', async () => {
    const fake = makeFakeBaileys();
    const { svc } = build(fake);
    (svc as any).config = { get: (k: string) => ({ 'app.env': 'development', WHATSAPP_AUTH_DIR: authRoot, WHATSAPP_AUTO_RESUME: 'false' } as Record<string, string>)[k] };
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await svc.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(5_000);
    expect(fake.makeWASocket).not.toHaveBeenCalled();
  });

  it('CONCURRENT CONNECT: ten simultaneous connect() calls open exactly one socket', async () => {
    const fake = makeFakeBaileys();
    const { svc } = build(fake);
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await Promise.all(Array.from({ length: 10 }, () => svc.connect(T1)));
    expect(fake.makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('CONCURRENT RECONNECT: a reconnect timer and a manual connect racing each other still yield one socket', async () => {
    const fake = makeFakeBaileys();
    const { svc } = build(fake);
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await svc.connect(T1);
    await close(fake.socks[0], 408, 'Timed Out');
    const manual = svc.connect(T1);
    await jest.advanceTimersByTimeAsync(40_000);
    await manual;
    const alive = fake.socks.filter((_s, i) => i > 0);
    expect(alive.length).toBe(1);
  });

  it('TWO INSTANCES: only the instance that owns the tenant\'s lock opens a socket', async () => {
    const store = sharedLockStore();
    const fakeA = makeFakeBaileys();
    const fakeB = makeFakeBaileys();
    const a = build(fakeA, store.lockFor('instance-A'));
    const b = build(fakeB, store.lockFor('instance-B'));
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await a.svc.connect(T1);
    await b.svc.connect(T1);
    expect(fakeA.makeWASocket).toHaveBeenCalledTimes(1);
    expect(fakeB.makeWASocket).not.toHaveBeenCalled();
    expect(b.svc.getStatus(T1)).toMatchObject({ status: 'disconnected', lastError: expect.stringMatching(/another server instance/) });
    // B cannot send either
    await expect(b.svc.sendText(T1, 'u1', { phone: '0770000000', message: 'hi' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('TWO INSTANCES: when the owner shuts down gracefully the lock is released and the other instance can take over', async () => {
    const store = sharedLockStore();
    const fakeA = makeFakeBaileys();
    const fakeB = makeFakeBaileys();
    const a = build(fakeA, store.lockFor('instance-A'));
    const b = build(fakeB, store.lockFor('instance-B'));
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await a.svc.connect(T1);
    await a.svc.onModuleDestroy();
    expect(credsExist(T1)).toBe(true); // shutdown never touches credentials
    expect(store.owners.has(T1)).toBe(false);
    await b.svc.connect(T1);
    expect(fakeB.makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('OWNERSHIP LOST: the heartbeat stops our socket (no logout, credentials kept) when another instance took the lock', async () => {
    const store = sharedLockStore();
    const fake = makeFakeBaileys();
    const { svc } = build(fake, store.lockFor('instance-A'));
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await svc.connect(T1);
    await open(fake.socks[0]);
    store.owners.set(T1, 'instance-B'); // lock expired and B took it
    await svc.heartbeatTick();
    expect(fake.socks[0].end).toHaveBeenCalled();
    expect(fake.socks[0].logout).not.toHaveBeenCalled();
    expect(svc.getStatus(T1).status).toBe('disconnected');
    expect(credsExist(T1)).toBe(true);
    // stale events from the closed socket are ignored (no reconnect storm)
    await close(fake.socks[0], 440, 'replaced');
    await jest.advanceTimersByTimeAsync(120_000);
    expect(fake.makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('LOCK STORE DOWN: an unverifiable ownership never opens a socket and never wipes anything; it retries later', async () => {
    const fake = makeFakeBaileys();
    let down = true;
    const flaky: WhatsappSessionLock = {
      ownerId: 'A',
      acquire: async () => { if (down) throw new Error('redis down'); return true; },
      renew: async () => true,
      release: async () => undefined,
    };
    const { svc } = build(fake, flaky);
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await svc.connect(T1);
    expect(fake.makeWASocket).not.toHaveBeenCalled();
    expect(credsExist(T1)).toBe(true);
    down = false;
    await jest.advanceTimersByTimeAsync(40_000);
    expect(fake.makeWASocket).toHaveBeenCalledTimes(1);
  });

  it('SHUTDOWN: sockets are closed without logout; the health summary reports sessions that need attention without secrets', async () => {
    const fake = makeFakeBaileys();
    const { svc } = build(fake);
    putCreds(T1, { me: { id: 'x@s.whatsapp.net' } });
    await svc.connect(T1);
    await close(fake.socks[0], 500, 'x');
    const health = svc.getHealthSummary();
    expect(health.attention).toEqual([expect.objectContaining({ tenantId: T1, status: 'disconnected' })]);
    expect(JSON.stringify(health)).not.toMatch(/creds|token|secret/i);
    await svc.onModuleDestroy();
    expect(fake.socks[0].logout).not.toHaveBeenCalled();
  });
});
