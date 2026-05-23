import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '@/common/decorators/permissions.decorator';
import { IAuthUser } from '@/common/decorators/current-user.decorator';
import { Request } from 'express';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<Request & { user: IAuthUser }>();

    if (!user) throw new ForbiddenException('Authentication required');

    const isSuperAdmin = user.roles.includes('SUPER_ADMIN') || user.roles.includes('TENANT_ADMIN');
    if (isSuperAdmin) return true;

    const hasAllPermissions = requiredPermissions.every((p) =>
      user.permissions.includes(p),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Insufficient permissions. Required: [${requiredPermissions.join(', ')}]`,
      );
    }

    return true;
  }
}
