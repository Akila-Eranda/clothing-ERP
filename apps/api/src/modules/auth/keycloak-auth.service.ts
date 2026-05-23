import { Injectable, Logger, UnauthorizedException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KcTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: string;
  session_state: string;
}

@Injectable()
export class KeycloakAuthService {
  private readonly logger = new Logger(KeycloakAuthService.name);

  constructor(private readonly config: ConfigService) {}

  private get kcUrl() { return this.config.get<string>('keycloak.url') ?? 'https://auth.hexalyte.com'; }
  private get realm() { return this.config.get<string>('keycloak.realm') ?? 'fashion-erp'; }
  private get clientId() { return this.config.get<string>('keycloak.clientId') ?? ''; }
  private get clientSecret() { return this.config.get<string>('keycloak.clientSecret') ?? ''; }

  private tokenUrl() { return `${this.kcUrl}/realms/${this.realm}/protocol/openid-connect/token`; }
  private logoutUrl() { return `${this.kcUrl}/realms/${this.realm}/protocol/openid-connect/logout`; }

  private assertConfigured() {
    if (!this.clientId) throw new ServiceUnavailableException('Keycloak not configured');
  }

  // ── Login (Resource Owner Password Grant) ─────────────────────────────────
  async kcLogin(username: string, password: string): Promise<KcTokenResponse> {
    this.assertConfigured();
    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        username,
        password,
        scope: 'openid profile email',
      }).toString(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      this.logger.warn(`KC login failed: ${err?.error_description}`);
      throw new UnauthorizedException(err?.error_description ?? 'Invalid credentials');
    }
    return res.json();
  }

  // ── Refresh ────────────────────────────────────────────────────────────────
  async kcRefresh(refreshToken: string): Promise<KcTokenResponse> {
    this.assertConfigured();
    const res = await fetch(this.tokenUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!res.ok) throw new UnauthorizedException('Invalid or expired refresh token');
    return res.json();
  }

  // ── Logout (revoke refresh token) ──────────────────────────────────────────
  async kcLogout(refreshToken: string): Promise<void> {
    if (!this.clientId) return;
    await fetch(this.logoutUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: refreshToken,
      }).toString(),
    }).catch(() => { /* ignore — token may already be expired */ });
  }
}
