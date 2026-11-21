import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { PrismaService } from '@/prisma/prisma.service';
import { BranchContextInterceptor } from './branch-context.interceptor';
import { IAuthUser } from '@/common/decorators/current-user.decorator';

const user = (role: string, branchId = 'branch-a'): IAuthUser => ({
  id: 'user-1',
  sub: 'user-1',
  tenantId: 'tenant-a',
  branchId,
  email: 'user@example.test',
  firstName: 'Test',
  lastName: 'User',
  roles: [role],
  permissions: [],
});

function setup(request: Record<string, unknown>, knownBranches = ['branch-a', 'branch-b']) {
  const prisma = {
    branch: {
      findMany: jest.fn(async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => knownBranches.includes(id)).map((id) => ({ id, isActive: true })),
      ),
    },
  };
  const interceptor = new BranchContextInterceptor(prisma as unknown as PrismaService);
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
  const next = { handle: () => of('ok') } as CallHandler;
  return { interceptor, context, next, prisma };
}

describe('BranchContextInterceptor', () => {
  it.each([
    ['header', { headers: { 'x-branch-id': 'branch-b' } }],
    ['query', { headers: {}, query: { branchId: 'branch-b' } }],
    ['hyphenated query', { headers: {}, query: { 'branch-id': 'branch-b' } }],
    ['body', { headers: {}, body: { branch_id: 'branch-b' } }],
    ['route parameter', { headers: {}, params: { branchId: 'branch-b' } }],
  ])('rejects a forged assigned-branch %s', async (_source, input) => {
    const request = { ...input, user: user('CASHIER'), method: 'GET', originalUrl: '/api/v1/inventory' };
    const { interceptor, context, next } = setup(request);
    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects branch IDs owned by another tenant, including for tenant admins', async () => {
    const request = {
      user: user('TENANT_ADMIN'),
      headers: {},
      query: { branchId: 'branch-outside-tenant' },
      method: 'GET',
      originalUrl: '/api/v1/reports/sales',
    };
    const { interceptor, context, next } = setup(request);
    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects explicit branch selectors for users without an assigned branch', async () => {
    const request = {
      user: { ...user('CASHIER'), branchId: undefined },
      headers: {},
      query: { branchId: 'branch-a' },
      method: 'GET',
      originalUrl: '/api/v1/reports/sales',
    };
    const { interceptor, context, next } = setup(request);
    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows tenant admins to switch to an active branch in their tenant', async () => {
    const request = {
      user: user('TENANT_ADMIN'),
      headers: { 'x-branch-id': 'branch-b' },
      query: {},
      method: 'GET',
      originalUrl: '/api/v1/inventory',
    };
    const { interceptor, context, next } = setup(request);
    await expect(interceptor.intercept(context, next)).resolves.toBeDefined();
    expect(request.user.branchId).toBe('branch-b');
  });

  it('allows a branch user to name a transfer destination only when its source is assigned', async () => {
    const request = {
      user: user('BRANCH_MANAGER'),
      headers: {},
      body: { fromBranchId: 'branch-a', toBranchId: 'branch-b' },
      method: 'POST',
      originalUrl: '/api/v1/inventory/transfers',
    };
    const { interceptor, context, next } = setup(request);
    await expect(interceptor.intercept(context, next)).resolves.toBeDefined();
  });

  it('rejects a transfer with a forged source branch', async () => {
    const request = {
      user: user('BRANCH_MANAGER'),
      headers: {},
      body: { fromBranchId: 'branch-b', toBranchId: 'branch-a' },
      method: 'POST',
      originalUrl: '/api/v1/inventory/transfers',
    };
    const { interceptor, context, next } = setup(request);
    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a transfer destination when no assigned source branch is supplied', async () => {
    const request = {
      user: user('BRANCH_MANAGER'),
      headers: {},
      body: { toBranchId: 'branch-b' },
      method: 'POST',
      originalUrl: '/api/v1/inventory/transfers',
    };
    const { interceptor, context, next } = setup(request);
    await expect(interceptor.intercept(context, next)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
