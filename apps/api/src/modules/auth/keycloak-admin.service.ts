import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TokenCache { token: string; expiresAt: number }

export interface KcCreateUserOpts {
  dbUserId: string;
  tenantId: string;
  tenantSlug: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  password: string;
  groupId?: string;
}

@Injectable()
export class KeycloakAdminService {
  private readonly logger = new Logger(KeycloakAdminService.name);
  private tokenCache: TokenCache | null = null;

  constructor(private readonly config: ConfigService) {}

  private kcBase() { return this.config.get<string>('keycloak.url') ?? ''; }
  private kcRealm() { return this.config.get<string>('keycloak.realm') ?? 'fashion-erp'; }
  private adminBase() { return `${this.kcBase()}/admin/realms/${this.kcRealm()}`; }

  isConfigured(): boolean {
    return !!(
      this.config.get('keycloak.url') &&
      this.config.get('keycloak.clientId') &&
      this.config.get('keycloak.clientSecret')
    );
  }

  // ── Admin token (cached 30 min) ────────────────────────────────────────
  async getAdminToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }
    const url = `${this.kcBase()}/realms/${this.kcRealm()}/protocol/openid-connect/token`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.get<string>('keycloak.adminClientId') || this.config.get<string>('keycloak.clientId')!,
        client_secret: this.config.get<string>('keycloak.adminClientSecret') || this.config.get<string>('keycloak.clientSecret')!,
      }).toString(),
    });
    if (!res.ok) throw new Error(`KC admin token failed: ${res.status}`);
    const data = await res.json() as { access_token: string; expires_in: number };
    this.tokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 30) * 1000,
    };
    return this.tokenCache.token;
  }

  private async kc(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.getAdminToken();
    return fetch(`${this.adminBase()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  }

  // ── Groups (one KC group = one tenant) ─────────────────────────────────
  async createOrGetGroup(slug: string, name: string): Promise<string> {
    if (!this.isConfigured()) return '';
    try {
      const res = await this.kc(`/groups?search=${encodeURIComponent(slug)}&exact=true`);
      const groups = await res.json() as { id: string }[];
      if (groups.length > 0) return groups[0].id;
      const cr = await this.kc('/groups', {
        method: 'POST',
        body: JSON.stringify({ name: slug, attributes: { tenantName: [name] } }),
      });
      const loc = cr.headers.get('Location') ?? '';
      return loc.split('/').pop() ?? '';
    } catch (err) {
      this.logger.warn(`KC createOrGetGroup failed: ${err}`);
      return '';
    }
  }

  async addUserToGroup(kcUserId: string, groupId: string): Promise<void> {
    if (!this.isConfigured() || !kcUserId || !groupId) return;
    await this.kc(`/users/${kcUserId}/groups/${groupId}`, { method: 'PUT' });
  }

  async deleteGroup(slug: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const res = await this.kc(`/groups?search=${encodeURIComponent(slug)}&exact=true`);
      const groups = await res.json() as { id: string }[];
      if (groups.length > 0) {
        await this.kc(`/groups/${groups[0].id}`, { method: 'DELETE' });
      }
    } catch (err) {
      this.logger.warn(`KC deleteGroup failed: ${err}`);
    }
  }

  // ── Users ───────────────────────────────────────────────────────────────
  async findKcUserByDbId(dbUserId: string): Promise<string | null> {
    if (!this.isConfigured()) return null;
    try {
      const res = await this.kc(`/users?q=db_user_id:${dbUserId}`);
      const users = await res.json() as { id: string; attributes?: Record<string, string[]> }[];
      const match = users.find(u => u.attributes?.db_user_id?.[0] === dbUserId);
      return match?.id ?? null;
    } catch {
      return null;
    }
  }

  async createKcUser(opts: KcCreateUserOpts): Promise<string> {
    if (!this.isConfigured()) return '';
    try {
      const body = {
        username: `${opts.tenantSlug}__${opts.email}`,
        email: opts.email,
        firstName: opts.firstName,
        lastName: opts.lastName,
        enabled: true,
        credentials: [{ type: 'password', value: opts.password, temporary: false }],
        attributes: {
          db_user_id: [opts.dbUserId],
          tenant_id: [opts.tenantId],
          tenant_slug: [opts.tenantSlug],
          user_role: [opts.role],
        },
      };
      const res = await this.kc('/users', { method: 'POST', body: JSON.stringify(body) });
      const loc = res.headers.get('Location') ?? '';
      const kcId = loc.split('/').pop() ?? '';
      if (kcId && opts.groupId) await this.addUserToGroup(kcId, opts.groupId);
      return kcId;
    } catch (err) {
      this.logger.warn(`KC createKcUser failed for ${opts.email}: ${err}`);
      return '';
    }
  }

  async updateKcUser(dbUserId: string, updates: {
    firstName?: string;
    lastName?: string;
    role?: string;
    isActive?: boolean;
  }): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const kcId = await this.findKcUserByDbId(dbUserId);
      if (!kcId) return;
      const body: Record<string, unknown> = {};
      if (updates.firstName !== undefined) body.firstName = updates.firstName;
      if (updates.lastName !== undefined) body.lastName = updates.lastName;
      if (updates.isActive !== undefined) body.enabled = updates.isActive;
      if (updates.role) body.attributes = { user_role: [updates.role] };
      await this.kc(`/users/${kcId}`, { method: 'PUT', body: JSON.stringify(body) });
    } catch (err) {
      this.logger.warn(`KC updateKcUser failed for dbId ${dbUserId}: ${err}`);
    }
  }

  async updateKcPassword(dbUserId: string, newPassword: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const kcId = await this.findKcUserByDbId(dbUserId);
      if (!kcId) return;
      await this.kc(`/users/${kcId}/reset-password`, {
        method: 'PUT',
        body: JSON.stringify({ type: 'password', value: newPassword, temporary: false }),
      });
    } catch (err) {
      this.logger.warn(`KC updateKcPassword failed: ${err}`);
    }
  }

  async deleteKcUser(dbUserId: string): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      const kcId = await this.findKcUserByDbId(dbUserId);
      if (!kcId) return;
      await this.kc(`/users/${kcId}`, { method: 'DELETE' });
    } catch (err) {
      this.logger.warn(`KC deleteKcUser failed: ${err}`);
    }
  }
}
