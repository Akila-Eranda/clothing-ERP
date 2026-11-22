/**
 * QA-006: updating a bank account. No database: FinanceService runs against a small in-memory fake of Prisma.
 * Covers: details are optional on a rename / disable (legacy accounts), the stale-edit check is atomic, and
 * another tenant's account is never touched.
 */
import { ConflictException, NotFoundException } from '@nestjs/common';
import { FinanceService } from './finance.service';

const T0 = new Date('2026-11-01T10:00:00.000Z');
const baseRow = {
  id: 'ba-1', tenantId: 't1', type: 'CURRENT', name: 'BOC Main', isActive: true, updatedAt: T0,
  bankName: 'BOC', accountNumber: '12345678', accountHolderName: 'Shop Owner', branchName: 'Main', branchCode: '001',
  notes: null, glAccountId: null,
};
// a legacy account with incomplete details
const legacyRow = { ...baseRow, id: 'ba-legacy', accountHolderName: null, branchName: null, branchCode: null };

function setup(rows: any[], opts: { updateManyCount?: number } = {}) {
  const prisma: any = {
    bankAccount: {
      findFirst: jest.fn(async ({ where }: any) => rows.find((r) => r.id === where.id && r.tenantId === where.tenantId) ?? null),
      update: jest.fn(async ({ where, data }: any) => ({ ...rows.find((r) => r.id === where.id), ...data })),
      updateMany: jest.fn(async () => ({ count: opts.updateManyCount ?? 1 })),
      findMany: jest.fn(async () => []),
    },
    account: { findFirst: jest.fn(async () => ({ id: 'gl' })) },
  };
  const audit = { log: jest.fn(async () => undefined) };
  const svc = new FinanceService(prisma, {} as any, {} as any, audit as any);
  return { svc, prisma, audit };
}

describe('FinanceService.updateBankAccount (QA-006)', () => {
  it('renames / disables a legacy account WITHOUT sending details (no forced full validation)', async () => {
    const { svc, prisma } = setup([legacyRow]);
    await expect(svc.updateBankAccount('t1', 'ba-legacy', { name: 'Renamed', isActive: false }, 'u1')).resolves.toBeDefined();
    const data = prisma.bankAccount.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'Renamed', isActive: false });
  });

  it('editing a detail on a legacy account enforces the full rules on the merged result', async () => {
    const { svc } = setup([legacyRow]);
    await expect(svc.updateBankAccount('t1', 'ba-legacy', { bankName: 'HNB' }, 'u1')).rejects.toThrow();
  });

  it('with expectedUpdatedAt the write is conditional on that updatedAt (atomic)', async () => {
    const { svc, prisma } = setup([baseRow]);
    await svc.updateBankAccount('t1', 'ba-1', { name: 'New', expectedUpdatedAt: T0.toISOString() }, 'u1');
    expect(prisma.bankAccount.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'ba-1', tenantId: 't1', updatedAt: T0 },
    }));
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  it('a concurrent save that wins the race makes this one fail with 409 and writes nothing', async () => {
    const { svc, audit } = setup([baseRow], { updateManyCount: 0 });
    await expect(svc.updateBankAccount('t1', 'ba-1', { name: 'Late', expectedUpdatedAt: T0.toISOString() }, 'u1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('a stale editor (updatedAt differs) is refused with 409 before any write', async () => {
    const { svc, prisma } = setup([baseRow]);
    await expect(svc.updateBankAccount('t1', 'ba-1', { name: 'X', expectedUpdatedAt: '2026-10-01T00:00:00.000Z' }, 'u1'))
      .rejects.toBeInstanceOf(ConflictException);
    expect(prisma.bankAccount.updateMany).not.toHaveBeenCalled();
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });

  it('another tenant cannot edit the account (404)', async () => {
    const { svc, prisma } = setup([baseRow]);
    await expect(svc.updateBankAccount('t2', 'ba-1', { name: 'Steal' }, 'u2')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.bankAccount.update).not.toHaveBeenCalled();
  });
});
