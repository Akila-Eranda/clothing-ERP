import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { IAuthUser } from '@/common/decorators/current-user.decorator';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Ensures the client-provided tenant context matches the authenticated user's tenant.
 * Tenant identity must never be trusted from headers alone — JWT tenantId is authoritative.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<
      Request & { user?: IAuthUser }
    >();
    const user = request.user;
    if (!user?.tenantId) return true;

    // Platform super admins operate across tenants via explicit server-side IDs.
    if (user.roles.includes('SUPER_ADMIN')) return true;

    const headerTenant = request.headers['x-tenant-id'];
    const tenantHint = Array.isArray(headerTenant) ? headerTenant[0] : headerTenant;
    if (!tenantHint) return true;

    const resolved = await this.prisma.tenant.findFirst({
      where: {
        OR: [{ id: tenantHint }, { subdomain: tenantHint.toLowerCase() }],
      },
      select: { id: true },
    });

    if (!resolved) {
      throw new ForbiddenException('Invalid tenant context');
    }

    if (resolved.id !== user.tenantId) {
      throw new ForbiddenException('Tenant context does not match authenticated session');
    }

    return true;
  }
}
