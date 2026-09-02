import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { ExecutionContext } from '@nestjs/common';

describe('TenantGuard', () => {
  const reflector = new Reflector();
  const prisma = {
    tenant: { findFirst: jest.fn() },
  };
  let guard: TenantGuard;

  beforeEach(() => {
    guard = new TenantGuard(reflector, prisma as never);
    jest.clearAllMocks();
  });

  function buildContext(options: {
    isPublic?: boolean;
    user?: { tenantId: string; roles: string[] };
    tenantHeader?: string;
  }): ExecutionContext {
    const handler = () => undefined;
    if (options.isPublic) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    } else {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
    }

    return {
      getHandler: () => handler,
      getClass: () => handler,
      switchToHttp: () => ({
        getRequest: () => ({
          user: options.user,
          headers: { 'x-tenant-id': options.tenantHeader },
        }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows public routes', async () => {
    const ctx = buildContext({ isPublic: true });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows super admin regardless of tenant header', async () => {
    const ctx = buildContext({
      user: { tenantId: 'tenant-a', roles: ['SUPER_ADMIN'] },
      tenantHeader: 'other-tenant',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects mismatched tenant header', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-b' });
    const ctx = buildContext({
      user: { tenantId: 'tenant-a', roles: ['CASHIER'] },
      tenantHeader: 'tenant-b-slug',
    });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('allows matching tenant header', async () => {
    prisma.tenant.findFirst.mockResolvedValue({ id: 'tenant-a' });
    const ctx = buildContext({
      user: { tenantId: 'tenant-a', roles: ['CASHIER'] },
      tenantHeader: 'my-shop',
    });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
