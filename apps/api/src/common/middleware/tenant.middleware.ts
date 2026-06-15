import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export interface TenantRequest extends Request {
  tenantId?: string;
  branchId?: string;
}

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: TenantRequest, _res: Response, next: NextFunction): void {
    const skip =
      req.path.endsWith('/health') ||
      req.path.includes('/auth/login') ||
      req.path.includes('/auth/platform-login') ||
      req.path.includes('/auth/refresh') ||
      req.path.includes('/auth/kc-') ||
      req.path.includes('/tenants/register') ||
      req.path.includes('/tenants/platform-status') ||
      req.path.includes('/tenants/resolve/') ||
      req.path.includes('/tenants/shop-types');

    if (skip) return next();

    const tenantId =
      (req.headers['x-tenant-id'] as string) ||
      this.extractTenantFromHost(req.hostname);

    if (!tenantId) {
      throw new BadRequestException('Tenant identifier is required. Provide x-tenant-id header.');
    }

    req.tenantId = tenantId;
    req.branchId = req.headers['x-branch-id'] as string | undefined;
    next();
  }

  private extractTenantFromHost(hostname: string): string | undefined {
    const parts = hostname.split('.');
    if (parts.length >= 3) return parts[0];
    return undefined;
  }
}
