import { Injectable, NestMiddleware, BadRequestException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { isPublicRoute } from './public-routes';

export interface TenantRequest extends Request {
  tenantId?: string;
  branchId?: string;
}

/**
 * Requires a tenant hint (x-tenant-id header or a tenant host) on every route except the public ones.
 * This is an early, cheap rejection only: tenant isolation is enforced by TenantGuard against the
 * authenticated user's JWT tenant, never by this hint.
 *
 * Matching uses req.originalUrl. Mounted with forRoutes('*'), req.path inside the middleware is "/",
 * so the previous req.path checks — and the .exclude() list, written with "api/v1/…" while routes are
 * registered as "api/…" + URI version — never matched, and public routes needed a tenant hint.
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: TenantRequest, _res: Response, next: NextFunction): void {
    if (isPublicRoute(req.method, req.originalUrl)) return next();

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
