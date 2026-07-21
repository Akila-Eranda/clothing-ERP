import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleDestroy,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as QRCode from 'qrcode';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationChannel, NotificationType } from '@prisma/client';
import { WhatsappSendBillDto, WhatsappSendDto } from './whatsapp.dto';
import { toWhatsappJid } from './whatsapp-phone.util';
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
};

const MAX_AUTO_RECONNECT = 3;

@Injectable()
export class WhatsappService implements OnModuleDestroy {
  private readonly logger = new Logger(WhatsappService.name);
  private readonly sessions = new Map<string, SessionState>();
  private baileys: any | null = null;
  private baileysLoadError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleDestroy() {
    for (const [tenantId, session] of this.sessions) {
      this.clearReconnect(session);
      try {
        await session.sock?.end?.(undefined);
      } catch {
        /* noop */
      }
      this.sessions.delete(tenantId);
    }
  }

  private authDir(tenantId: string) {
    const configured = this.config.get<string>('WHATSAPP_AUTH_DIR')?.trim();
    if (configured) return path.join(configured, tenantId);

    const uploadRoot =
      this.config.get<string>('LOCAL_UPLOAD_DIR')?.trim() ||
      this.config.get<string>('UPLOAD_DIR')?.trim() ||
      path.join(process.cwd(), 'uploads');
    return path.join(uploadRoot, 'whatsapp-sessions', tenantId);
  }

  private ensureAuthDir(tenantId: string) {
    const dir = this.authDir(tenantId);
    try {
      fs.mkdirSync(dir, { recursive: true });
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
    const session = this.getOrCreate(tenantId);
    if (session.status === 'connected' && session.sock) {
      return this.getStatus(tenantId);
    }
    // Already showing a live QR — keep it (polling / double-click safe).
    if (session.status === 'qr' && session.qrDataUrl && session.sock) {
      return this.getStatus(tenantId);
    }

    this.clearReconnect(session);
    const resetAuth =
      !session.qrDataUrl ||
      session.status === 'error' ||
      session.status === 'logged_out' ||
      session.status === 'disconnected';

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

  private async startSocket(
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

    const sock = makeWASocket({
      version,
      auth: state,
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
          void this.persistTenantMeta(tenantId, { connected: false });
          return;
        }

        // Keep QR on screen while pairing; don't thrash reconnects.
        if (session.qrDataUrl && session.status === 'qr') {
          session.lastError =
            'Connection dropped while waiting for scan — click Show QR again if it expires.';
          this.scheduleReconnect(tenantId, {
            resetAuth: timedOut,
            delayMs: 4000,
          });
          return;
        }

        session.status = 'disconnected';
        session.lastError = timedOut
          ? 'WhatsApp connection timed out. Click Show QR / Connect to retry.'
          : lastDisconnect?.error?.message ?? 'Connection closed';

        this.scheduleReconnect(tenantId, {
          resetAuth: timedOut,
          delayMs: timedOut ? 5000 : 3000,
        });
      }
    });
  }

  private scheduleReconnect(
    tenantId: string,
    opts: { resetAuth?: boolean; delayMs?: number } = {},
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
    const delay = opts.delayMs ?? 3000;
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
    await this.persistTenantMeta(tenantId, { connected: false, phone: null });
    return this.getStatus(tenantId);
  }

  async sendText(tenantId: string, userId: string, dto: WhatsappSendDto) {
    const session = this.getOrCreate(tenantId);
    if (session.status !== 'connected' || !session.sock) {
      throw new BadRequestException(
        'WhatsApp is not connected. Scan the QR code in Settings → WhatsApp.',
      );
    }
    const jid = toWhatsappJid(dto.phone);
    await session.sock.sendMessage(jid, { text: dto.message });
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
    return { ok: true, phone: dto.phone };
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
