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
};

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

    // Prefer the writable uploads volume in Docker (nestjs user owns /app/uploads).
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
        // Last-resort writable path (session won't survive container recreate).
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
      s = { status: 'disconnected', phone: null, displayName: null, qrDataUrl: null, lastError: null };
      this.sessions.set(tenantId, s);
    }
    return s;
  }

  private async loadBaileys() {
    if (this.baileys) return this.baileys;
    if (this.baileysLoadError) {
      throw new ServiceUnavailableException(this.baileysLoadError);
    }
    try {
      // Dynamic import keeps API bootable if package is not installed yet.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require('@whiskeysockets/baileys');
      this.baileys = mod?.default && typeof mod.default === 'object' ? { ...mod, ...mod.default } : mod;
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

  getStatus(tenantId: string): WhatsappStatusResponse {
    const s = this.getOrCreate(tenantId);
    return {
      status: s.status,
      phone: s.phone ?? null,
      displayName: s.displayName ?? null,
      qrDataUrl: s.status === 'qr' ? s.qrDataUrl ?? null : null,
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
    if (session.starting) {
      return this.getStatus(tenantId);
    }
    session.starting = true;
    session.status = 'connecting';
    session.lastError = null;
    session.qrDataUrl = null;

    try {
      await this.startSocket(tenantId);
    } catch (e) {
      session.status = 'error';
      session.lastError = (e as Error).message;
      session.starting = false;
      throw e;
    }
    return this.getStatus(tenantId);
  }

  private async startSocket(tenantId: string) {
    const baileys = await this.loadBaileys();
    const {
      default: makeWASocketDefault,
      makeWASocket: makeWASocketNamed,
      useMultiFileAuthState,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = baileys;
    const makeWASocket = makeWASocketNamed || makeWASocketDefault;

    const session = this.getOrCreate(tenantId);
    if (session.sock) {
      try {
        await session.sock.end?.(undefined);
      } catch {
        /* noop */
      }
      session.sock = undefined;
    }

    const authPath = this.ensureAuthDir(tenantId);
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

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
      printQRInTerminal: false,
      syncFullHistory: false,
      markOnlineOnConnect: false,
      ...(quietLogger ? { logger: quietLogger } : {}),
    });
    session.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        try {
          session.qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
          session.status = 'qr';
          session.starting = false;
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
        session.connectedAt = new Date().toISOString();
        const user = sock.user;
        session.phone = user?.id?.split(':')[0] ?? user?.id?.split('@')[0] ?? null;
        session.displayName = user?.name ?? user?.verifiedName ?? null;
        this.logger.log(`WhatsApp connected for tenant ${tenantId} (${session.phone})`);
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
        session.sock = undefined;
        session.starting = false;
        if (loggedOut) {
          session.status = 'logged_out';
          session.phone = null;
          session.displayName = null;
          session.connectedAt = null;
          this.clearAuth(tenantId);
          void this.persistTenantMeta(tenantId, { connected: false });
        } else {
          session.status = 'disconnected';
          // Auto-reconnect unless logout
          setTimeout(() => {
            void this.connect(tenantId).catch((err) =>
              this.logger.warn(`WhatsApp reconnect failed: ${(err as Error).message}`),
            );
          }, 2500);
        }
      }
    });
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
      this.logger.warn(`Failed to persist WhatsApp meta: ${(e as Error).message}`);
    }
  }

  async disconnect(tenantId: string): Promise<WhatsappStatusResponse> {
    const session = this.getOrCreate(tenantId);
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
    this.clearAuth(tenantId);
    await this.persistTenantMeta(tenantId, { connected: false, phone: null });
    return this.getStatus(tenantId);
  }

  async sendText(tenantId: string, userId: string, dto: WhatsappSendDto) {
    const session = this.getOrCreate(tenantId);
    if (session.status !== 'connected' || !session.sock) {
      throw new BadRequestException('WhatsApp is not connected. Scan the QR code in Settings → WhatsApp.');
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
