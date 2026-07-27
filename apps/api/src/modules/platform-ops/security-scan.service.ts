import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma/prisma.service';
import { UserStatus } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export type ScanSeverity = 'pass' | 'warn' | 'fail' | 'info';

export type SecurityScanCheck = {
  id: string;
  category: string;
  title: string;
  status: ScanSeverity;
  detail: string;
  recommendation?: string;
};

export type SecurityScanResult = {
  scannedAt: string;
  summary: { pass: number; warn: number; fail: number; info: number; score: number };
  checks: SecurityScanCheck[];
};

@Injectable()
export class SecurityScanService {
  private readonly logger = new Logger(SecurityScanService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async runScan(): Promise<SecurityScanResult> {
    const checks: SecurityScanCheck[] = [];
    const push = (c: SecurityScanCheck) => checks.push(c);

    await Promise.all([
      this.checkDatabase(push),
      this.checkJwtSecrets(push),
      this.checkUsersAndLocks(push),
      this.checkSessions(push),
      this.checkTenants(push),
      this.checkAuditNoise(push),
      this.checkUploadDirs(push),
      this.checkPublicEndpoints(push),
    ]);

    const summary = {
      pass: checks.filter((c) => c.status === 'pass').length,
      warn: checks.filter((c) => c.status === 'warn').length,
      fail: checks.filter((c) => c.status === 'fail').length,
      info: checks.filter((c) => c.status === 'info').length,
      score: 100,
    };
    const scored = Math.max(
      0,
      100 - summary.fail * 18 - summary.warn * 6,
    );
    summary.score = scored;

    return {
      scannedAt: new Date().toISOString(),
      summary,
      checks: checks.sort((a, b) => severityRank(a.status) - severityRank(b.status)),
    };
  }

  private async checkDatabase(push: (c: SecurityScanCheck) => void) {
    try {
      const ok = await this.prisma.healthCheck();
      push({
        id: 'db-health',
        category: 'Infrastructure',
        title: 'Database connectivity',
        status: ok ? 'pass' : 'fail',
        detail: ok ? 'PostgreSQL accepting queries' : 'Database health check failed',
        recommendation: ok ? undefined : 'Inspect postgres container and DATABASE_URL',
      });
    } catch (e) {
      push({
        id: 'db-health',
        category: 'Infrastructure',
        title: 'Database connectivity',
        status: 'fail',
        detail: (e as Error).message,
        recommendation: 'Inspect postgres container and DATABASE_URL',
      });
    }
  }

  private checkJwtSecrets(push: (c: SecurityScanCheck) => void) {
    const access = String(this.config.get('jwt.accessSecret') || process.env.JWT_ACCESS_SECRET || '');
    const refresh = String(this.config.get('jwt.refreshSecret') || process.env.JWT_REFRESH_SECRET || '');
    const weak =
      access.length < 32 ||
      refresh.length < 32 ||
      /change.?me|secret|password|123456/i.test(access) ||
      /change.?me|secret|password|123456/i.test(refresh);

    push({
      id: 'jwt-secrets',
      category: 'Auth',
      title: 'JWT signing secrets',
      status: weak ? 'fail' : 'pass',
      detail: weak
        ? 'Access/refresh secrets look short or default-like'
        : `Secrets present (access ${access.length} chars, refresh ${refresh.length} chars)`,
      recommendation: weak
        ? 'Rotate JWT_ACCESS_SECRET and JWT_REFRESH_SECRET to long random values'
        : undefined,
    });

    const nodeEnv = process.env.NODE_ENV || 'development';
    push({
      id: 'node-env',
      category: 'Infrastructure',
      title: 'Runtime environment',
      status: nodeEnv === 'production' ? 'pass' : 'warn',
      detail: `NODE_ENV=${nodeEnv}`,
      recommendation:
        nodeEnv === 'production' ? undefined : 'Production hosts should run with NODE_ENV=production',
    });
  }

  private async checkUsersAndLocks(push: (c: SecurityScanCheck) => void) {
    const now = new Date();
    const [locked, highAttempts, suspendedUsers, superAdmins, pending] = await Promise.all([
      this.prisma.user.count({ where: { lockedUntil: { gt: now } } }),
      this.prisma.user.count({ where: { loginAttempts: { gte: 3 } } }),
      this.prisma.user.count({ where: { status: UserStatus.SUSPENDED } }),
      this.prisma.userRole.count({
        where: { role: { type: 'SUPER_ADMIN' } },
      }),
      this.prisma.user.count({ where: { status: UserStatus.PENDING_VERIFICATION } }),
    ]);

    push({
      id: 'locked-users',
      category: 'Auth',
      title: 'Temporarily locked accounts',
      status: locked > 20 ? 'warn' : locked > 0 ? 'info' : 'pass',
      detail: `${locked} account(s) currently lockout`,
      recommendation: locked > 20 ? 'Review brute-force attempts / IP blocks' : undefined,
    });

    push({
      id: 'login-attempts',
      category: 'Auth',
      title: 'Elevated failed login counters',
      status: highAttempts > 50 ? 'warn' : highAttempts > 0 ? 'info' : 'pass',
      detail: `${highAttempts} user(s) with ≥3 failed attempts`,
    });

    push({
      id: 'suspended-users',
      category: 'Auth',
      title: 'Suspended users',
      status: 'info',
      detail: `${suspendedUsers} suspended · ${pending} pending verification`,
    });

    push({
      id: 'super-admins',
      category: 'Auth',
      title: 'Platform super admins',
      status: superAdmins === 0 ? 'fail' : superAdmins > 5 ? 'warn' : 'pass',
      detail: `${superAdmins} SUPER_ADMIN role binding(s)`,
      recommendation:
        superAdmins === 0
          ? 'No platform admin can manage the system'
          : superAdmins > 5
            ? 'Limit SUPER_ADMIN accounts to trusted operators only'
            : undefined,
    });
  }

  private async checkSessions(push: (c: SecurityScanCheck) => void) {
    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const [active, expiredStillMarked, stale] = await Promise.all([
      this.prisma.session.count({ where: { isActive: true, expiresAt: { gt: now } } }),
      this.prisma.session.count({ where: { isActive: true, expiresAt: { lte: now } } }),
      this.prisma.session.count({
        where: { isActive: true, lastUsedAt: { lt: dayAgo } },
      }),
    ]);

    push({
      id: 'active-sessions',
      category: 'Sessions',
      title: 'Active sessions',
      status: active > 5000 ? 'warn' : 'pass',
      detail: `${active} active session(s)`,
      recommendation: active > 5000 ? 'Consider pruning idle sessions' : undefined,
    });

    push({
      id: 'expired-sessions',
      category: 'Sessions',
      title: 'Expired sessions still marked active',
      status: expiredStillMarked > 0 ? 'warn' : 'pass',
      detail: `${expiredStillMarked} expired-but-active row(s)`,
      recommendation:
        expiredStillMarked > 0
          ? 'Run session cleanup / mark expired sessions inactive'
          : undefined,
    });

    push({
      id: 'stale-sessions',
      category: 'Sessions',
      title: 'Idle sessions (>24h unused)',
      status: stale > 200 ? 'warn' : 'info',
      detail: `${stale} idle active session(s)`,
    });
  }

  private async checkTenants(push: (c: SecurityScanCheck) => void) {
    const [total, suspended, trialExpired] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.tenant.count({
        where: {
          status: 'TRIAL',
          trialEndsAt: { lt: new Date() },
        },
      }).catch(() => 0),
    ]);

    push({
      id: 'tenants',
      category: 'Tenants',
      title: 'Tenant fleet',
      status: 'info',
      detail: `${total} tenants · ${suspended} suspended · ${trialExpired} expired trials`,
    });

    if (trialExpired > 0) {
      push({
        id: 'expired-trials',
        category: 'Tenants',
        title: 'Expired trials still TRIAL',
        status: 'warn',
        detail: `${trialExpired} trial tenant(s) past trialEndsAt`,
        recommendation: 'Convert, suspend, or renew expired trial tenants',
      });
    }
  }

  private async checkAuditNoise(push: (c: SecurityScanCheck) => void) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const recent = await this.prisma.auditLog.count({
        where: { createdAt: { gte: since } },
      });
      push({
        id: 'audit-volume',
        category: 'Audit',
        title: 'Audit log volume (24h)',
        status: recent > 100_000 ? 'warn' : 'pass',
        detail: `${recent} audit event(s) in last 24 hours`,
        recommendation:
          recent > 100_000 ? 'High audit volume — check for scrapers or loops' : undefined,
      });
    } catch (e) {
      push({
        id: 'audit-volume',
        category: 'Audit',
        title: 'Audit log volume (24h)',
        status: 'info',
        detail: `Could not read audit logs: ${(e as Error).message}`,
      });
    }
  }

  private checkUploadDirs(push: (c: SecurityScanCheck) => void) {
    const uploadRoot =
      this.config.get<string>('LOCAL_UPLOAD_DIR')?.trim() ||
      this.config.get<string>('UPLOAD_DIR')?.trim() ||
      path.join(process.cwd(), 'uploads');

    const waDir = path.join(uploadRoot, 'whatsapp-sessions');
    const sslPending = path.join(uploadRoot, '.ssl-pending');

    const uploadOk = fs.existsSync(uploadRoot);
    push({
      id: 'uploads-dir',
      category: 'Filesystem',
      title: 'Uploads directory',
      status: uploadOk ? 'pass' : 'warn',
      detail: uploadOk ? `Present at ${uploadRoot}` : `Missing ${uploadRoot}`,
    });

    let waTenants = 0;
    if (fs.existsSync(waDir)) {
      try {
        waTenants = fs.readdirSync(waDir).filter((n) => !n.startsWith('.')).length;
      } catch {
        /* noop */
      }
    }
    push({
      id: 'whatsapp-sessions',
      category: 'Filesystem',
      title: 'WhatsApp session folders',
      status: 'info',
      detail: `${waTenants} tenant session folder(s)`,
    });

    let pendingSsl = 0;
    if (fs.existsSync(sslPending)) {
      try {
        pendingSsl = fs.readdirSync(sslPending).length;
      } catch {
        /* noop */
      }
    }
    push({
      id: 'ssl-pending',
      category: 'Filesystem',
      title: 'Pending SSL jobs',
      status: pendingSsl > 20 ? 'warn' : 'info',
      detail: `${pendingSsl} pending SSL file(s)`,
      recommendation:
        pendingSsl > 20 ? 'Check SSL pending cron / process_ssl_pending.sh' : undefined,
    });
  }

  private async checkPublicEndpoints(push: (c: SecurityScanCheck) => void) {
    const hosts = [
      'https://shop.hexalyte.com/login',
      'https://grocery.shop.hexalyte.com/login',
      'https://shop.clothing.api.hexalyte.com/api/v1/health',
    ];

    for (const url of hosts) {
      try {
        const res = await headRequest(url, 8000);
        const loc = String(res.headers['location'] || '');
        const suspicious =
          /rebirthstress|return\.st|stresser|booter|DiamWall|ref=NEXT|ref=Q7hw/i.test(loc) ||
          /rebirthstress|return\.st|stresser/i.test(res.bodySnippet);
        const okStatus = res.status > 0 && res.status < 500;

        push({
          id: `endpoint-${Buffer.from(url).toString('base64').slice(0, 12)}`,
          category: 'Public surface',
          title: `Endpoint probe · ${shortHost(url)}`,
          status: suspicious ? 'fail' : okStatus ? 'pass' : 'warn',
          detail: suspicious
            ? `Suspicious redirect/content detected (HTTP ${res.status}) → ${loc || 'body match'}`
            : `HTTP ${res.status}${loc ? ` Location: ${loc.slice(0, 80)}` : ''}`,
          recommendation: suspicious
            ? 'Possible malware hijack — run host malware clean / rebuild web image'
            : undefined,
        });
      } catch (e) {
        push({
          id: `endpoint-${Buffer.from(url).toString('base64').slice(0, 12)}`,
          category: 'Public surface',
          title: `Endpoint probe · ${shortHost(url)}`,
          status: 'warn',
          detail: `Probe failed: ${(e as Error).message}`,
        });
      }
    }
  }
}

function severityRank(s: ScanSeverity) {
  return ({ fail: 0, warn: 1, info: 2, pass: 3 } as const)[s];
}

function shortHost(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function headRequest(
  url: string,
  timeoutMs: number,
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; bodySnippet: string }> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.request(
      url,
      {
        method: 'GET',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'Hexalyte-SecurityScan/1.0', Accept: '*/*' },
      },
      (res) => {
        const headers = res.headers as Record<string, string | string[] | undefined>;
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          if (body.length < 400) body += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode || 0,
            headers,
            bodySnippet: body.slice(0, 400),
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}
