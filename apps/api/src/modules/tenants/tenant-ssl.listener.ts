import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantSslProvisioner } from '@/shared/tenant-ssl.provisioner';

@Injectable()
export class TenantSslListener {
  private readonly logger = new Logger(TenantSslListener.name);

  constructor(private readonly sslProvisioner: TenantSslProvisioner) {}

  @OnEvent('tenant.registered', { async: true })
  async handleTenantRegistered(payload: { subdomain?: string; name?: string }) {
    const subdomain = payload.subdomain?.trim();
    if (!subdomain) return;
    this.logger.log(`Provisioning DNS + SSL for tenant: ${subdomain}`);
    try {
      await this.sslProvisioner.provisionNewTenant(subdomain);
    } catch (err) {
      this.logger.error(`SSL provision failed for ${subdomain}:`, err);
    }
  }
}
