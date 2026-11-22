/**
 * Part 6 - bank account administration against REAL PostgreSQL: optimistic locking under concurrency, rename /
 * disable without re-entering details, controlled deactivation (history can never be deleted - enforced by the
 * database), tenant isolation, audit history, and the add-only role review that never touches custom roles.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditLogService } from '@/modules/audit-log/audit-log.service';
import { FinanceService } from '@/modules/accounting/finance.service';
import { applySystemRoleReview, reviewSystemRoles } from '@/modules/roles/system-role-review';
import { PERMISSION_CATALOGUE } from '@/shared/security/permission-catalogue';
import { connectPrisma, describeInt, seedTenant, SeededTenant } from './helpers/db';

describeInt('bank accounts (real DB)', () => {
  let prisma: PrismaService;
  let finance: FinanceService;
  let shop: SeededTenant;

  beforeAll(async () => {
    prisma = await connectPrisma();
    finance = new FinanceService(prisma, {} as never, {} as never, new AuditLogService(prisma));
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { shop = await seedTenant(prisma, 'bank'); });

  const create = (over: Record<string, unknown> = {}) =>
    finance.createBankAccount(shop.tenantId, shop.branchId, {
      code: `BK-${Math.random().toString(36).slice(2, 7)}`, name: 'BOC Main', type: 'CURRENT' as never, bankName: 'Bank of Ceylon',
      accountNumber: `0081${Math.floor(Math.random() * 1e8)}`, accountHolderName: 'Shop Ltd', branchName: 'Fort', branchCode: '001', ...over,
    } as never, shop.userId);

  it('rename and disable / enable work WITHOUT re-entering any bank detail, even on a legacy account with incomplete details', async () => {
    const legacy = await prisma.bankAccount.create({ data: { tenantId: shop.tenantId, code: 'LEG-1', name: 'Old', type: 'CURRENT', bankName: 'BOC', accountNumber: '12345678' } });
    const renamed = await finance.updateBankAccount(shop.tenantId, legacy.id, { name: 'Renamed' }, shop.userId);
    expect(renamed.name).toBe('Renamed');
    const off = await finance.updateBankAccount(shop.tenantId, legacy.id, { isActive: false }, shop.userId);
    expect(off.isActive).toBe(false);
    const on = await finance.updateBankAccount(shop.tenantId, legacy.id, { isActive: true }, shop.userId);
    expect(on.isActive).toBe(true);
    expect(on.accountHolderName).toBeNull(); // untouched
  });

  it('optimistic locking: of 6 simultaneous edits made from the same loaded version exactly ONE wins, the rest get 409', async () => {
    const acct = await create();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => finance.updateBankAccount(shop.tenantId, acct.id, { name: `Edit ${i}`, expectedUpdatedAt: acct.updatedAt.toISOString() }, shop.userId)),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason instanceof ConflictException)).toBe(true);
    const row = await prisma.bankAccount.findUniqueOrThrow({ where: { id: acct.id } });
    const winner = results.find((r) => r.status === 'fulfilled') as PromiseFulfilledResult<{ name: string }>;
    expect(row.name).toBe(winner.value.name);
    // exactly one UPDATE audit row for the winning edit
    expect(await prisma.auditLog.count({ where: { tenantId: shop.tenantId, resource: 'bank_accounts', resourceId: acct.id, action: 'UPDATE' } })).toBe(1);
  });

  it('a stale editor is refused after someone else saved', async () => {
    const acct = await create();
    const loaded = acct.updatedAt.toISOString();
    await finance.updateBankAccount(shop.tenantId, acct.id, { name: 'Saved by A', expectedUpdatedAt: loaded }, shop.userId);
    await expect(finance.updateBankAccount(shop.tenantId, acct.id, { name: 'Saved by B', expectedUpdatedAt: loaded }, shop.userId)).rejects.toBeInstanceOf(ConflictException);
    expect((await prisma.bankAccount.findUniqueOrThrow({ where: { id: acct.id } })).name).toBe('Saved by A');
  });

  it('HISTORY IS PROTECTED BY THE DATABASE: an account with transactions or a QR code cannot be deleted; deactivation is the only path', async () => {
    const acct = await create();
    await prisma.bankTransaction.create({ data: { tenantId: shop.tenantId, bankAccountId: acct.id, type: 'DEPOSIT', amount: 100, txnDate: new Date() } });
    await expect(prisma.bankAccount.delete({ where: { id: acct.id } })).rejects.toThrow();
    expect(await prisma.bankTransaction.count({ where: { bankAccountId: acct.id } })).toBe(1);

    const withQr = await create();
    await prisma.paymentQrCode.create({ data: { tenantId: shop.tenantId, label: 'QR', mode: 'STATIC', bankAccountId: withQr.id } });
    await expect(prisma.bankAccount.delete({ where: { id: withQr.id } })).rejects.toThrow();

    const off = await finance.updateBankAccount(shop.tenantId, acct.id, { isActive: false }, shop.userId);
    expect(off.isActive).toBe(false);
    // an account with no history at all can still be removed by an operator (nothing to lose)
    const empty = await create();
    await expect(prisma.bankAccount.delete({ where: { id: empty.id } })).resolves.toBeDefined();
  });

  it('duplicate bank + account number (ignoring spaces / hyphens) is refused within a shop but allowed in another shop', async () => {
    await create({ bankName: 'HNB', accountNumber: '0099 8877-66' });
    await expect(create({ code: 'DUP-2', bankName: 'HNB', accountNumber: '00998877 66' })).rejects.toThrow();
    const other = await seedTenant(prisma, 'bank-other');
    await expect(finance.createBankAccount(other.tenantId, other.branchId, {
      code: 'X-1', name: 'Other shop', type: 'CURRENT', bankName: 'HNB', accountNumber: '0099 8877-66', accountHolderName: 'Other', branchName: 'Fort', branchCode: '001',
    } as never, other.userId)).resolves.toBeDefined();
  });

  it('tenant isolation: another shop can neither read nor edit this account', async () => {
    const acct = await create();
    const other = await seedTenant(prisma, 'bank-iso');
    await expect(finance.updateBankAccount(other.tenantId, acct.id, { name: 'Steal' }, other.userId)).rejects.toBeInstanceOf(NotFoundException);
    expect((await finance.listBankAccounts(other.tenantId, true)).some((a) => a.id === acct.id)).toBe(false);
  });

  it('audit history: create / update / disable are recorded without the full account number', async () => {
    const acct = await create({ accountNumber: '0081-9999-1234' });
    await finance.updateBankAccount(shop.tenantId, acct.id, { isActive: false }, shop.userId);
    const rows = await prisma.auditLog.findMany({ where: { tenantId: shop.tenantId, resource: 'bank_accounts', resourceId: acct.id } });
    expect(rows.map((r) => r.action).sort()).toEqual(['CREATE', 'UPDATE']);
    const text = JSON.stringify(rows);
    expect(text).not.toContain('0081-9999-1234');
    expect(text).not.toContain('008199991234');
  });

  describe('role review: add-only, custom roles untouched', () => {
    it('adds the missing default permissions to Tenant Admin, never removes any, never touches a custom role', async () => {
      const perms = await Promise.all(PERMISSION_CATALOGUE.map((k) => {
        const [resource, action] = k.split(':');
        return prisma.permission.upsert({ where: { resource_action: { resource, action } }, update: {}, create: { resource, action } });
      }));
      const id = (k: string) => perms.find((p) => `${p.resource}:${p.action}` === k)!.id;
      // an OLD shop: Tenant Admin without accounting:update / delete (the incident) but with one extra custom right
      const admin = await prisma.role.create({
        data: { tenantId: shop.tenantId, name: 'Tenant Admin', type: 'TENANT_ADMIN', isSystem: true, permissions: { create: ['accounting:create', 'accounting:read', 'sales:read'].map((k) => ({ permissionId: id(k) })) } },
      });
      const custom = await prisma.role.create({
        data: { tenantId: shop.tenantId, name: 'Night Auditor', type: 'CUSTOM' as never, permissions: { create: [{ permissionId: id('reports:read') }] } },
      });
      const before = await reviewSystemRoles(prisma as never, shop.tenantId);
      expect(before.changes).toBeGreaterThan(0);

      await expect(applySystemRoleReview(prisma as never, shop.tenantId, { confirmTenantId: 'wrong', actor: 't', addOnly: true })).rejects.toThrow(/confirmTenantId/);
      await applySystemRoleReview(prisma as never, shop.tenantId, { confirmTenantId: shop.tenantId, actor: 'int-test', addOnly: true });

      const adminKeys = (await prisma.rolePermission.findMany({ where: { roleId: admin.id }, include: { permission: true } })).map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
      expect(adminKeys).toEqual(expect.arrayContaining(['accounting:update', 'accounting:delete', 'accounting:create', 'accounting:read', 'sales:read']));
      const customKeys = (await prisma.rolePermission.findMany({ where: { roleId: custom.id }, include: { permission: true } })).map((rp) => `${rp.permission.resource}:${rp.permission.action}`);
      expect(customKeys).toEqual(['reports:read']);
      // idempotent: a second run changes nothing
      expect((await reviewSystemRoles(prisma as never, shop.tenantId)).plans.find((p) => p.role === 'Tenant Admin')!.add).toEqual([]);
    });
  });
});
