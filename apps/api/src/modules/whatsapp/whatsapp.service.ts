import {
  BadRequestException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { WhatsappSendBillDto, WhatsappSendDto, WhatsappSendSaleBillDto } from './whatsapp.dto';
import { buildSaleBillMessage } from '@/shared/sale-bill-message';
import { toWhatsappJid } from './whatsapp-phone.util';
import { assertWhatsappConnectAllowed } from './whatsapp-connect.guard';
import { publicExposureWarning, resolveWhatsappAuthRoot } from './whatsapp-auth-dir.helper';
import { listResumableTenants, MAX_AUTO_RECONNECT, reconnectDelayMs, shouldResetAuth } from './whatsapp-reconnect.helper';
import Redis from 'ioredis';
import {
  LocalWhatsappSessionLock,
  RedisWhatsappSessionLock,
  SESSION_LOCK_RENEW_MS,
  type WhatsappSessionLock,
} from './whatsapp-session-lock';
import type { WhatsappConnectionStatus, WhatsappStatusResponse } from './whatsapp.types';

type SessionState = {
  status: WhatsappConnectionStatus;
  phone?: string | null;
  displayName?: string | null;
  qrDataUrl?: string | null;
  lastError?: string | null;
  connectedAt?: string | null;
  sock?: any;
  starting?: boolean;
  reconnectTimer?: ReturnType<typeof setTimeout> | null;
  reconnectAttempts?: number;
  generation?: number;
  /** In-flight start: a second start for the same tenant joins it instead of opening a second socket. */
  startPromise?: Promise<void>;
  /** This process currently owns the tenant's session (cross-instance lock). */
  lockHeld?: boolean;
  /**
   * Recently sent messages by id. Baileys asks for these (getMessage) when the recipient's phone could not decrypt
   * one and requests a retry; without them the recipient is stuck on "Waiting for this message".
   */
  sentMessages?: Map<string, unknown>;
};

/** How many sent messages are kept per tenant for retry requests (oldest are dropped first). */
const SENT_MESSAGE_CACHE_MAX = 500;

/** Minimal in-memory cache with the shape Baileys expects for msgRetryCounterCache. */
function createRetryCounterCache() {
  const store = new Map<string, number>();
  return {
    get: <T>(key: string) => store.get(key) as T | undefined,
    set: <T>(key: string, value: T) => {
      if (store.size > 5000) store.clear();
      store.set(key, value as unknown as number);
    },
    del: (key: string) => {
      store.delete(key);
    },
    flushAll: () => store.clear(),
  };
}

@Injectable()
export class WhatsappService implements OnModuleDestroy, OnApplicationBootstrap {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly sessions = new Map<string, SessionState>();
  private baileys: any | null = null;
  private baileysLoadError: string | null = null;

  private sessionLock: WhatsappSessionLock;
  private lockRedis: Redis | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private heartbeatTicks = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.sessionLock = this.createSessionLock();
  }

  /**
   * Cross-instance ownership: with Redis configured, only the instance holding the tenant's lock may open its
   * socket. Without Redis (single process, tests) a local always-granting lock is used - single-instance assumption.
   */
  private createSessionLock(): WhatsappSessionLock {
    const host = process.env.REDIS_HOST?.trim();
    if (!host || this.config.get<string>('app.env') === 'test') return new LocalWhatsappSessionLock();
    this.lockRedis = new Redis({
      host,
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0', 10),
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    this.lockRedis.on('error', (e) => this.logger.warn(`WhatsApp session-lock Redis error: ${e.message}`));
    return new RedisWhatsappSessionLock(this.lockRedis);
  }

  /** Test seam: replace the ownership lock. */
  setSessionLock(lock: WhatsappSessionLock) {
    this.sessionLock = lock;
  }

  /**
   * QA-004: after an API restart / deploy the in-memory sessions are gone but the paired logins are still on
   * disk. Reconnect them (one at a time, in the background) so the shop does not have to scan the QR again and
   * bill / payment messages keep working. Never wipes anything; skipped in test mode or when disabled.
   */
  async onApplicationBootstrap() {
    if (this.config.get<string>('app.env') === 'test') return;
    this.startHeartbeat();
    if (this.config.get<string>('WHATSAPP_AUTO_RESUME')?.trim().toLowerCase() === 'false') return;
    const root = resolveWhatsappAuthRoot({
      configured: this.config.get<string>('WHATSAPP_AUTH_DIR'),
      cwd: process.cwd(),
    });
    const tenants = listResumableTenants(root);
    if (!tenants.length) return;
    this.logger.log(`Resuming ${tenants.length} saved WhatsApp session(s)`);
    void (async () => {
      for (const tenantId of tenants) {
        const session = this.getOrCreate(tenantId);
        if (session.status === 'connected' || session.starting) continue;
        try {
          session.starting = true;
          session.status = 'connecting';
          await this.startSocket(tenantId, { resetAuth: false });
        } catch (e) {
          session.starting = false;
          session.status = 'disconnected';
          session.lastError = (e as Error).message;
          this.logger.warn(`WhatsApp resume failed for ${tenantId}: ${(e as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, 2000)); // stagger connections
      }
    })();
  }

  // ── ownership heartbeat / health ────────────────────────────────────────────

  private startHeartbeat() {
    if (this.heartbeat) return;
    this.heartbeat = setInterval(() => void this.heartbeatTick(), SESSION_LOCK_RENEW_MS);
    this.heartbeat.unref?.();
  }

  /** Renew every owned session's lock; drop sessions whose ownership moved to another instance. */
  async heartbeatTick() {
    this.heartbeatTicks++;
    for (const [tenantId, session] of this.sessions) {
      if (!session.lockHeld) continue;
      try {
        const stillOwner = await this.sessionLock.renew(tenantId);
        if (!stillOwner) await this.stopOwned(tenantId, 'Session ownership moved to another server instance.');
      } catch (e) {
        // cannot reach the lock store right now: keep the socket (do NOT drop a healthy session over a Redis blip)
        this.logger.warn(`WhatsApp ownership renew failed for ${tenantId}: ${(e as Error).message}`);
      }
    }
    if (this.heartbeatTicks % 15 === 0) this.logger.log(`WhatsApp health: ${JSON.stringify(this.getHealthSummary())}`);
  }

  /** Close our socket without logging out and without touching saved credentials (ownership lost / shutdown). */
  private async stopOwned(tenantId: string, reason: string) {
    const session = this.getOrCreate(tenantId);
    this.clearReconnect(session);
    session.generation = (session.generation ?? 0) + 1; // ignore events of the socket we are closing
    try {
      await session.sock?.end?.(undefined);
    } catch {
      /* noop */
    }
    session.sock = undefined;
    session.starting = false;
    session.lockHeld = false;
    session.status = 'disconnected';
    session.lastError = reason;
    this.logger.warn(`WhatsApp session for ${tenantId} stopped: ${reason}`);
  }

  /** Operational health, no secrets: counts per status plus the sessions that need attention. */
  getHealthSummary() {
    const counts: Record<string, number> = {};
    const attention: { tenantId: string; status: string; attempts: number; lastError: string | null }[] = [];
    for (const [tenantId, s] of this.sessions) {
      counts[s.status] = (counts[s.status] ?? 0) + 1;
      if (s.status !== 'connected') {
        attention.push({ tenantId, status: s.status, attempts: s.reconnectAttempts ?? 0, lastError: s.lastError ?? null });
      }
    }
    return { sessions: this.sessions.size, counts, owner: this.sessionLock.ownerId, attention };
  }

  /** Graceful shutdown: stop timers, close sockets WITHOUT logging out (credentials stay), release ownership. */
  async onModuleDestroy() {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    for (const [tenantId, session] of this.sessions) {
      this.clearReconnect(session);
      session.generation = (session.generation ?? 0) + 1;
      try {
        await session.sock?.end?.(undefined);
      } catch {
        /* noop */
      }
      if (session.lockHeld) {
        try {
          await this.sessionLock.release(tenantId);
        } catch {
          /* the lock expires by itself */
        }
      }
      this.sessions.delete(tenantId);
    }
    try {
      await this.lockRedis?.quit();
    } catch {
      /* noop */
    }
  }

  private uploadRoot() {
    return path.resolve(
      this.config.get<string>('LOCAL_UPLOAD_DIR')?.trim() ||
        this.config.get<string>('UPLOAD_DIR')?.trim() ||
        path.join(process.cwd(), 'uploads'),
    );
  }

  private authDir(tenantId: string) {
    const root = resolveWhatsappAuthRoot({
      configured: this.config.get<string>('WHATSAPP_AUTH_DIR'),
      cwd: process.cwd(),
    });
    return path.join(root, tenantId);
  }

  private ensureAuthDir(tenantId: string) {
    const dir = this.authDir(tenantId);
    const exposure = publicExposureWarning(dir, this.uploadRoot());
    if (exposure) this.logger.warn(exposure);
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      return dir;
    } catch (e) {
      const code = (e as NodeJS.ErrnoException)?.code;
      if (code === 'EACCES' || code === 'EPERM') {
        const fallback = path.join('/tmp', 'whatsapp-sessions', tenantId);
        try {
          fs.mkdirSync(fallback, { recursive: true });
          this.logger.warn(
            `WhatsApp auth dir not writable (${dir}); using ${fallback}`,
          );
          return fallback;
        } catch {
          /* fall through */
        }
      }
      throw new ServiceUnavailableException(
        `Cannot create WhatsApp session folder (${dir}): ${(e as Error).message}`,
      );
    }
  }

  private getOrCreate(tenantId: string): SessionState {
    let s = this.sessions.get(tenantId);
    if (!s) {
      s = {
        status: 'disconnected',
        phone: null,
        displayName: null,
        qrDataUrl: null,
        lastError: null,
        reconnectAttempts: 0,
        generation: 0,
      };
      this.sessions.set(tenantId, s);
    }
    return s;
  }

  private clearReconnect(session: SessionState) {
    if (session.reconnectTimer) {
      clearTimeout(session.reconnectTimer);
      session.reconnectTimer = null;
    }
  }

  private async loadBaileys() {
    if (this.baileys) return this.baileys;
    if (this.baileysLoadError) {
      throw new ServiceUnavailableException(this.baileysLoadError);
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@whiskeysockets/baileys');
      this.baileys =
        mod?.default && typeof mod.default === 'object'
          ? { ...mod, ...mod.default }
          : mod;
      if (!this.baileys?.useMultiFileAuthState) {
        throw new Error('Baileys exports missing useMultiFileAuthState');
      }
      return this.baileys;
    } catch (e) {
      this.baileysLoadError =
        'WhatsApp QR package not installed. Run: pnpm add @whiskeysockets/baileys@6.7.22 in apps/api';
      this.logger.error((e as Error).message);
      throw new ServiceUnavailableException(this.baileysLoadError);
    }
  }

  /** Prefer live WA Web version — fetchLatestBaileysVersion is often months stale. */
  private async resolveWaVersion(baileys: any): Promise<number[]> {
    try {
      if (typeof baileys.fetchLatestWaWebVersion === 'function') {
        const r = await baileys.fetchLatestWaWebVersion();
        if (Array.isArray(r?.version) && r.version.length >= 3) {
          this.logger.log(`WhatsApp Web version ${r.version.join('.')}`);
          return r.version;
        }
      }
    } catch (e) {
      this.logger.warn(
        `fetchLatestWaWebVersion failed: ${(e as Error).message}`,
      );
    }
    const r = await baileys.fetchLatestBaileysVersion();
    this.logger.warn(
      `Falling back to Baileys version ${r?.version?.join?.('.') ?? r?.version}`,
    );
    return r.version;
  }

  getStatus(tenantId: string): WhatsappStatusResponse {
    const s = this.getOrCreate(tenantId);
    return {
      status: s.status,
      phone: s.phone ?? null,
      displayName: s.displayName ?? null,
      // Keep QR visible while waiting for scan even if status flickers
      qrDataUrl:
        s.status === 'qr' || s.status === 'connecting'
          ? s.qrDataUrl ?? null
          : null,
      lastError: s.lastError ?? null,
      connectedAt: s.connectedAt ?? null,
      provider: 'web-qr',
    };
  }

  async connect(tenantId: string): Promise<WhatsappStatusResponse> {
    assertWhatsappConnectAllowed(this.config.get<string>('app.env'));
    const session = this.getOrCreate(tenantId);
    if (session.status === 'connected' && session.sock) {
      return this.getStatus(tenantId);
    }
    // Already showing a live QR — keep it (polling / double-click safe).
    if (session.status === 'qr' && session.qrDataUrl && session.sock) {
      return this.getStatus(tenantId);
    }

    this.clearReconnect(session);
    // After API restart status is "disconnected" but creds on disk are still valid.
    // Never wipe auth here — only Disconnect / logged_out should clear the session folder.
    const resetAuth = session.status === 'logged_out';

    session.starting = true;
    session.status = 'connecting';
    session.lastError = null;
    session.reconnectAttempts = 0;

    try {
      await this.startSocket(tenantId, { resetAuth });
    } catch (e) {
      session.status = 'error';
      session.lastError = (e as Error).message;
      session.starting = false;
      throw e;
    }
    return this.getStatus(tenantId);
  }

  /**
   * Start the tenant's socket. Joins an in-flight start (never two sockets for one tenant in this process) and takes
   * the cross-instance ownership lock first (never two instances for one tenant).
   */
  private startSocket(tenantId: string, opts: { resetAuth?: boolean } = {}): Promise<void> {
    const session = this.getOrCreate(tenantId);
    if (session.startPromise) return session.startPromise;
    const run = this.startSocketOwned(tenantId, opts).finally(() => {
      if (session.startPromise === run) session.startPromise = undefined;
    });
    session.startPromise = run;
    return run;
  }

  private async startSocketOwned(tenantId: string, opts: { resetAuth?: boolean }) {
    const session = this.getOrCreate(tenantId);
    let owned = false;
    try {
      owned = await this.sessionLock.acquire(tenantId);
    } catch (e) {
      session.starting = false;
      session.status = 'disconnected';
      session.lastError = 'Cannot verify which server owns this WhatsApp session right now. Retrying.';
      this.logger.warn(`WhatsApp ownership check failed for ${tenantId}: ${(e as Error).message}`);
      this.scheduleReconnect(tenantId, {});
      return;
    }
    if (!owned) {
      session.starting = false;
      session.status = 'disconnected';
      session.lastError = 'This WhatsApp session is active on another server instance.';
      this.logger.warn(`WhatsApp session for ${tenantId} is owned by another instance; not connecting here`);
      return;
    }
    session.lockHeld = true;
    await this.startSocketUnsafe(tenantId, opts);
  }

  private async startSocketUnsafe(
    tenantId: string,
    opts: { resetAuth?: boolean } = {},
  ) {
    const baileys = await this.loadBaileys();
    const {
      default: makeWASocketDefault,
      makeWASocket: makeWASocketNamed,
      useMultiFileAuthState,
      DisconnectReason,
      Browsers,
    } = baileys;
    const makeWASocket = makeWASocketNamed || makeWASocketDefault;

    const session = this.getOrCreate(tenantId);
    this.clearReconnect(session);
    const generation = (session.generation ?? 0) + 1;
    session.generation = generation;

    if (session.sock) {
      try {
        await session.sock.end?.(undefined);
      } catch {
        /* noop */
      }
      session.sock = undefined;
    }

    if (opts.resetAuth) {
      this.clearAuth(tenantId);
    }

    const authPath = this.ensureAuthDir(tenantId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const version = await this.resolveWaVersion(baileys);
    const browser =
      Browsers?.macOS?.('Chrome') ||
      Browsers?.ubuntu?.('Chrome') ||
      ['Mac OS', 'Chrome', '14.4.1'];

    let quietLogger: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      quietLogger = require('pino')({ level: 'silent' });
    } catch {
      quietLogger = undefined;
    }

    // Cache signal keys in memory (fewer disk reads/races while encrypting) when Baileys + a logger are available.
    const keys =
      baileys.makeCacheableSignalKeyStore && quietLogger
        ? baileys.makeCacheableSignalKeyStore(state.keys, quietLogger)
        : state.keys;

    session.sentMessages ??= new Map();
    const sentMessages = session.sentMessages;
    const sock = makeWASocket({
      version,
      auth: { creds: state.creds, keys },
      msgRetryCounterCache: createRetryCounterCache(),
      // Lets Baileys re-send a message when the recipient asks for a retry (fixes "Waiting for this message").
      getMessage: async (key: { id?: string | null }) =>
        (key?.id ? (sentMessages.get(key.id) as any) : undefined) ?? undefined,
      browser,
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      connectTimeoutMs: 60_000,
      defaultQueryTimeoutMs: 60_000,
      qrTimeout: 90_000,
      ...(quietLogger ? { logger: quietLogger } : {}),
    });
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      // Ignore events from an older socket after reconnect/replace.
      if (session.generation !== generation || session.sock !== sock) return;

      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        try {
          session.qrDataUrl = await QRCode.toDataURL(qr, {
            margin: 1,
            width: 320,
          });
          session.status = 'qr';
          session.starting = false;
          session.lastError = null;
          session.reconnectAttempts = 0;
          this.logger.log(`WhatsApp QR ready for tenant ${tenantId}`);
        } catch (e) {
          session.lastError = (e as Error).message;
          session.status = 'error';
          session.starting = false;
        }
      }
      if (connection === 'open') {
        session.status = 'connected';
        session.qrDataUrl = null;
        session.starting = false;
        session.lastError = null;
        session.reconnectAttempts = 0;
        session.connectedAt = new Date().toISOString();
        const user = sock.user;
        session.phone =
          user?.id?.split(':')[0] ?? user?.id?.split('@')[0] ?? null;
        session.displayName = user?.name ?? user?.verifiedName ?? null;
        this.logger.log(
          `WhatsApp connected for tenant ${tenantId} (${session.phone})`,
        );
        void this.persistTenantMeta(tenantId, {
          connected: true,
          phone: session.phone,
          displayName: session.displayName,
          connectedAt: session.connectedAt,
        });
      }
      if (connection === 'close') {
        const code = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        const timedOut =
          code === DisconnectReason.timedOut ||
          code === 408 ||
          /timed?\s*out/i.test(String(lastDisconnect?.error?.message ?? ''));

        session.sock = undefined;
        session.starting = false;

        if (loggedOut) {
          this.clearReconnect(session);
          session.status = 'logged_out';
          session.phone = null;
          session.displayName = null;
          session.connectedAt = null;
          session.qrDataUrl = null;
          this.clearAuth(tenantId);
          session.lockHeld = false;
          void this.sessionLock.release(tenantId).catch(() => undefined);
          void this.persistTenantMeta(tenantId, { connected: false });
          return;
        }

        // Keep QR on screen while pairing; don't thrash reconnects.
        if (session.qrDataUrl && session.status === 'qr') {
          session.lastError =
            'Connection dropped while waiting for scan — click Show QR again if it expires.';
          this.scheduleReconnect(tenantId, {
            resetAuth: shouldResetAuth({ timedOut }),
            timedOut,
          });
          return;
        }

        session.status = 'disconnected';
        session.lastError = timedOut
          ? 'WhatsApp connection timed out. Click Show QR / Connect to retry.'
          : lastDisconnect?.error?.message ?? 'Connection closed';

        this.scheduleReconnect(tenantId, {
          resetAuth: shouldResetAuth({ timedOut }),
          timedOut,
        });
      }
    });
  }

  private scheduleReconnect(
    tenantId: string,
    opts: { resetAuth?: boolean; timedOut?: boolean } = {},
  ) {
    const session = this.getOrCreate(tenantId);
    this.clearReconnect(session);

    const attempts = session.reconnectAttempts ?? 0;
    if (attempts >= MAX_AUTO_RECONNECT) {
      session.status = session.qrDataUrl ? 'qr' : 'error';
      session.lastError =
        session.lastError ||
        'Could not keep WhatsApp connected. Click Show QR / Connect to try again.';
      this.logger.warn(
        `WhatsApp auto-reconnect stopped for ${tenantId} after ${attempts} attempts`,
      );
      return;
    }

    session.reconnectAttempts = attempts + 1;
    const delay = reconnectDelayMs(attempts, !!opts.timedOut);
    session.reconnectTimer = setTimeout(() => {
      session.reconnectTimer = null;
      if (session.status === 'connected') return;
      session.starting = true;
      session.status = session.qrDataUrl ? 'qr' : 'connecting';
      void this.startSocket(tenantId, { resetAuth: opts.resetAuth }).catch(
        (err) => {
          session.starting = false;
          session.status = 'error';
          session.lastError = (err as Error).message;
          this.logger.warn(
            `WhatsApp reconnect failed: ${(err as Error).message}`,
          );
        },
      );
    }, delay);
  }

  private clearAuth(tenantId: string) {
    const dir = this.authDir(tenantId);
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* noop */
    }
  }

  private async persistTenantMeta(
    tenantId: string,
    meta: Record<string, unknown>,
  ) {
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { settings: true },
      });
      const settings = (tenant?.settings as Record<string, unknown>) ?? {};
      const whatsapp = {
        ...((settings.whatsapp as Record<string, unknown>) ?? {}),
        ...meta,
        provider: 'web-qr',
        updatedAt: new Date().toISOString(),
      };
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: { settings: { ...settings, whatsapp } as any },
      });
    } catch (e) {
      this.logger.warn(
        `Failed to persist WhatsApp meta: ${(e as Error).message}`,
      );
    }
  }

  async disconnect(tenantId: string): Promise<WhatsappStatusResponse> {
    const session = this.getOrCreate(tenantId);
    this.clearReconnect(session);
    try {
      await session.sock?.logout?.();
    } catch {
      try {
        await session.sock?.end?.(undefined);
      } catch {
        /* noop */
      }
    }
    session.sock = undefined;
    session.status = 'disconnected';
    session.qrDataUrl = null;
    session.phone = null;
    session.displayName = null;
    session.connectedAt = null;
    session.starting = false;
    session.lastError = null;
    session.reconnectAttempts = 0;
    this.clearAuth(tenantId);
    session.lockHeld = false;
    await this.sessionLock.release(tenantId).catch(() => undefined);
    await this.persistTenantMeta(tenantId, { connected: false, phone: null });
    return this.getStatus(tenantId);
  }

  async sendText(
    tenantId: string,
    userId: string,
    dto: WhatsappSendDto,
    options: { recordNotification?: boolean } = {},
  ) {
    assertWhatsappConnectAllowed(this.config.get<string>('app.env'));
    const session = this.getOrCreate(tenantId);
    if (session.status !== 'connected' || !session.sock) {
      throw new BadRequestException(
        'WhatsApp is not connected. Scan the QR code in Settings → WhatsApp.',
      );
    }
    const jid = toWhatsappJid(dto.phone);
    const sent = await session.sock.sendMessage(jid, { text: dto.message });
    if (sent?.key?.id && sent.message) {
      const cache = (session.sentMessages ??= new Map());
      cache.set(sent.key.id, sent.message);
      if (cache.size > SENT_MESSAGE_CACHE_MAX) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }
    if (options.recordNotification !== false) {
      await this.prisma.notification.create({
        data: {
          tenantId,
          title: 'WhatsApp message',
          message: `[${dto.phone}] ${dto.message.slice(0, 200)}`,
          type: NotificationType.INFO,
          channel: NotificationChannel.WHATSAPP,
          recipients: [userId],
          data: { phone: dto.phone, status: 'sent', kind: 'text' },
        },
      });
    }
    return { ok: true, phone: dto.phone };
  }

  /** Sends the same text the "copy bill message" button shows: shop template + real invoice + current credit balance. */
  async sendSaleBill(tenantId: string, userId: string, dto: WhatsappSendSaleBillDto) {
    const built = await buildSaleBillMessage(this.prisma, tenantId, dto.saleId);
    const phone = (dto.phone ?? built.phone ?? '').trim();
    if (!phone) throw new BadRequestException('This sale has no customer phone number');
    return this.sendText(tenantId, userId, { phone, message: built.message });
  }

  async sendBill(tenantId: string, userId: string, dto: WhatsappSendBillDto) {
    const shop = dto.shopName?.trim() || 'Store';
    const lines = [
      `*${shop}*`,
      `Bill: ${dto.invoiceNumber}`,
      dto.customerName ? `Customer: ${dto.customerName}` : null,
      dto.itemsSummary ? `Items:\n${dto.itemsSummary}` : null,
      `Total: LKR ${dto.total}`,
      dto.paymentMethod ? `Payment: ${dto.paymentMethod}` : null,
      '',
      'Thank you for shopping with us!',
    ].filter(Boolean) as string[];

    return this.sendText(tenantId, userId, {
      phone: dto.phone,
      message: lines.join('\n'),
    });
  }
}
