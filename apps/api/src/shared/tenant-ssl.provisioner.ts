import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';

const TENANT_SHOP_DOMAIN = process.env.TENANT_SHOP_DOMAIN || 'shop.hexalyte.com';

@Injectable()
export class TenantSslProvisioner {
  private readonly logger = new Logger(TenantSslProvisioner.name);

  tenantUrl(subdomain: string): string {
    return `https://${subdomain}.${TENANT_SHOP_DOMAIN}`;
  }

  /** Ensure Cloudflare A record points to origin (DNS-only, not proxied). */
  async ensureTenantDns(subdomain: string): Promise<void> {
    const token = process.env.CLOUDFLARE_API_TOKEN;
    const zoneId = process.env.CLOUDFLARE_ZONE_ID;
    const ip = process.env.SERVER_IP;
    if (!token || !zoneId || !ip) {
      this.logger.warn(
        '[SSL] CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID, and SERVER_IP must all be set — skipping DNS',
      );
      return;
    }

    const recordName = `${subdomain}.shop`;
    const fqdn = `${subdomain}.shop.hexalyte.com`;
    try {
      const listRes = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(fqdn)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const list = (await listRes.json()) as {
        success: boolean;
        result?: { id: string; name: string; content: string; proxied?: boolean }[];
      };

      const existing = list.result?.[0];

      if (existing) {
        if (existing.content !== ip || existing.proxied !== false) {
          await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records/${existing.id}`, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'A', name: recordName, content: ip, ttl: 1, proxied: false }),
          });
          this.logger.log(`[SSL] Updated DNS ${fqdn} → ${ip} (DNS only)`);
        }
        return;
      }

      const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/dns_records`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'A', name: recordName, content: ip, ttl: 1, proxied: false }),
      });
      const data = (await res.json()) as { success: boolean; errors?: unknown[] };
      if (!data.success) {
        this.logger.error('[SSL] Cloudflare DNS create failed:', data.errors);
      } else {
        this.logger.log(`[SSL] Created DNS ${fqdn} → ${ip} (DNS only)`);
      }
    } catch (err) {
      this.logger.error('[SSL] Cloudflare DNS error:', err);
    }
  }

  /** Queue SSL renewal on the VPS (hook URL or pending file for cron). */
  async queueSslRenewal(subdomain: string): Promise<void> {
    const hookUrl = process.env.TENANT_SSL_HOOK_URL;
    const hookSecret = process.env.TENANT_SSL_HOOK_SECRET;

    if (hookUrl) {
      try {
        const res = await fetch(hookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(hookSecret ? { 'X-SSL-Hook-Secret': hookSecret } : {}),
          },
          body: JSON.stringify({ subdomain, action: 'renew' }),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          this.logger.warn(`[SSL] Hook returned ${res.status}: ${await res.text()}`);
        } else {
          this.logger.log(`[SSL] Hook triggered for ${subdomain}`);
          return;
        }
      } catch (err) {
        this.logger.warn('[SSL] Hook call failed, falling back to pending file:', err);
      }
    }

    const pendingDir = process.env.SSL_PENDING_DIR || '/app/uploads/.ssl-pending';
    try {
      await fs.mkdir(pendingDir, { recursive: true });
      await fs.writeFile(path.join(pendingDir, `${subdomain}.pending`), new Date().toISOString());
      this.logger.log(`[SSL] Queued pending SSL renewal for ${subdomain} (${pendingDir})`);
    } catch (err) {
      this.logger.error('[SSL] Could not write pending SSL file:', err);
    }
  }

  /** Full provision flow after tenant registration. */
  async provisionNewTenant(subdomain: string): Promise<void> {
    if (!subdomain || subdomain === 'platform') return;
    await this.ensureTenantDns(subdomain);
    await new Promise((r) => setTimeout(r, 3000));
    await this.queueSslRenewal(subdomain);
  }
}
