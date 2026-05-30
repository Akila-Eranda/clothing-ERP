import { Module, Global, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import * as nodemailer from 'nodemailer';

// ── Payloads ──────────────────────────────────────────────────────────────
interface PasswordResetPayload  { email: string; token: string; name: string; }
interface TenantRegisteredPayload { email: string; name: string; subdomain: string; adminName: string; }

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  private from = '"FashionERP" <noreply@fashion-erp.com>';

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('mail.host');
    const user = config.get<string>('mail.user');
    const pass = config.get<string>('mail.pass');
    const port = config.get<number>('mail.port') ?? 587;
    const secure = config.get<boolean>('mail.secure') ?? false;
    this.from = `"${config.get('mail.fromName') ?? 'FashionERP'}" <${config.get('mail.from') ?? 'noreply@fashion-erp.com'}>`;

    if (user && pass) {
      this.transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
      this.logger.log(`Mail transport ready (${host}:${port})`);
    } else {
      this.logger.warn('SMTP not configured — emails will be console-logged only');
    }
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[MAIL] To: ${to} | Subject: ${subject}`);
      return;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
      this.logger.log(`Email sent → ${to}`);
    } catch (err: any) {
      this.logger.error(`Email failed → ${to}: ${err.message}`);
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────
  @OnEvent('auth.password-reset-requested')
  async onPasswordResetRequested({ email, token, name }: PasswordResetPayload) {
    const frontendUrl = this.config.get<string>('app.frontendUrl') ?? 'https://shop.hexalyte.com';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    await this.send(email, 'Reset Your Password — FashionERP', `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#4f46e5;border-radius:14px">
            <span style="font-size:24px">🔐</span>
          </div>
          <h1 style="font-size:22px;font-weight:700;color:#111;margin:12px 0 4px">Reset Your Password</h1>
          <p style="color:#666;font-size:14px;margin:0">FashionERP — Enterprise Retail Platform</p>
        </div>
        <p style="color:#333;line-height:1.6">Hi <strong>${name}</strong>,</p>
        <p style="color:#333;line-height:1.6">We received a request to reset your FashionERP password. Click the button below to choose a new password:</p>
        <div style="text-align:center;margin:28px 0">
          <a href="${resetUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600">
            Reset Password →
          </a>
        </div>
        <p style="color:#888;font-size:13px;line-height:1.6">This link will expire in <strong>1 hour</strong>. If you didn't request this, you can safely ignore this email — your password won't change.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:28px 0"/>
        <p style="color:#aaa;font-size:12px;text-align:center">© FashionERP · Enterprise AI-Powered Retail Platform</p>
      </div>
    `);
  }

  @OnEvent('tenant.registered')
  async onTenantRegistered({ email, name, subdomain, adminName }: TenantRegisteredPayload) {
    const loginUrl = `https://shop.hexalyte.com/login?tenant=${subdomain}`;
    await this.send(email, `Welcome to FashionERP — ${name} is ready!`, `
      <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="text-align:center;margin-bottom:24px">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:56px;height:56px;background:#4f46e5;border-radius:14px">
            <span style="font-size:24px">🎉</span>
          </div>
          <h1 style="font-size:22px;font-weight:700;color:#111;margin:12px 0 4px">Welcome to FashionERP!</h1>
          <p style="color:#666;font-size:14px;margin:0">Your workspace is ready</p>
        </div>
        <p style="color:#333;line-height:1.6">Hi <strong>${adminName}</strong>,</p>
        <p style="color:#333;line-height:1.6">Your <strong>${name}</strong> workspace has been created. Here are your details:</p>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:20px 0">
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#888;font-size:13px;padding:5px 0">Workspace</td><td style="font-weight:600;font-size:14px;color:#111">${name}</td></tr>
            <tr><td style="color:#888;font-size:13px;padding:5px 0">Shop URL</td><td style="font-weight:600;font-size:14px;color:#4f46e5">${subdomain}.shop.hexalyte.com</td></tr>
            <tr><td style="color:#888;font-size:13px;padding:5px 0">Login Email</td><td style="font-weight:600;font-size:14px;color:#111">${email}</td></tr>
          </table>
        </div>
        <div style="text-align:center;margin:28px 0">
          <a href="${loginUrl}" style="display:inline-block;background:#4f46e5;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:600">
            Go to Dashboard →
          </a>
        </div>
        <hr style="border:none;border-top:1px solid #eee;margin:28px 0"/>
        <p style="color:#aaa;font-size:12px;text-align:center">© FashionERP · Enterprise AI-Powered Retail Platform</p>
      </div>
    `);
  }
}

@Global()
@Module({ providers: [MailService], exports: [MailService] })
export class MailModule {}
