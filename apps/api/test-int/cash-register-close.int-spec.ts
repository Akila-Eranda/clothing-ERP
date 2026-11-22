/**
 * Part 3 - shift / day-end closing against REAL PostgreSQL: a shift closes exactly once (even with simultaneous
 * requests), a shift waiting for approval cannot be re-closed with a different count, the reconciliation formula
 * (opening + inflows - outflows = expected; counted - expected = variance) holds, and a late movement is refused.
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '@/prisma/prisma.service';
import { CashManagementService } from '@/modules/cash-management/cash-management.module';
import { connectPrisma, describeInt, seedTenant, SeededTenant } from './helpers/db';

describeInt('shift close (real DB)', () => {
  let prisma: PrismaService;
  let svc: CashManagementService;
  let shop: SeededTenant;
  const events: { name: string; payload: any }[] = [];
  const workflow = { ensureDefinition: jest.fn(async () => undefined), start: jest.fn(async () => undefined) };

  beforeAll(async () => {
    prisma = await connectPrisma();
    const emitter = new EventEmitter2();
    emitter.onAny((name, payload) => events.push({ name: String(name), payload }));
    svc = new CashManagementService(prisma, emitter, workflow as never, {} as never);
  });
  afterAll(async () => { await prisma.$disconnect(); });
  beforeEach(async () => { shop = await seedTenant(prisma, 'shift'); events.length = 0; workflow.start.mockClear(); });

  const openShift = async (openingCash = 5000, movements: { type: 'SALE' | 'DEPOSIT' | 'WITHDRAWAL' | 'EXPENSE'; amount: number }[] = []) => {
    const r = await prisma.cashRegister.create({ data: { tenantId: shop.tenantId, branchId: shop.branchId, cashierId: shop.userId, openingCash, status: 'OPEN' } });
    for (const m of movements) await prisma.cashMovement.create({ data: { tenantId: shop.tenantId, registerId: r.id, type: m.type, amount: m.amount, createdById: shop.userId } });
    return r;
  };
  const close = (id: string, actualCash: number, roles: string[] = []) =>
    svc.closeRegister(id, shop.tenantId, shop.userId, { actualCash }, { roles });

  it('reconciliation: opening + inflows - outflows = expected; counted - expected = variance (exact match closes the shift)', async () => {
    const r = await openShift(5000, [{ type: 'SALE', amount: 1200 }, { type: 'DEPOSIT', amount: 300 }, { type: 'EXPENSE', amount: 150 }, { type: 'WITHDRAWAL', amount: 50 }]);
    const res = await close(r.id, 6300); // 5000 + 1200 + 300 - 150 - 50
    expect(res.summary.expectedCash).toBe(6300);
    const row = await prisma.cashRegister.findUniqueOrThrow({ where: { id: r.id } });
    expect(row).toMatchObject({ status: 'CLOSED', expectedCash: 6300, actualCash: 6300, variance: 0 });
    expect(res.needsApproval).toBe(false);
  });

  it('a counted shortage / overage is recorded as variance; a large one needs manager approval and starts ONE workflow', async () => {
    const small = await openShift(1000, [{ type: 'SALE', amount: 500 }]);
    await close(small.id, 1499.5);
    expect(await prisma.cashRegister.findUniqueOrThrow({ where: { id: small.id } })).toMatchObject({ variance: -0.5, status: 'CLOSED' });

    const big = await openShift(1000, [{ type: 'SALE', amount: 500 }]);
    const res = await close(big.id, 900);
    expect(res.needsApproval).toBe(true);
    expect(await prisma.cashRegister.findUniqueOrThrow({ where: { id: big.id } })).toMatchObject({ variance: -600, status: 'PENDING_APPROVAL' });
    expect(workflow.start).toHaveBeenCalledTimes(1);
  });

  it('DUPLICATE CLOSE: 8 simultaneous close requests close the shift once, emit one event, start one workflow', async () => {
    const r = await openShift(1000, [{ type: 'SALE', amount: 500 }]);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => close(r.id, 900)));
    expect(results.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((x) => x.status === 'rejected').every((x) => (x as PromiseRejectedResult).reason instanceof BadRequestException)).toBe(true);
    expect(events.filter((e) => e.name === 'cash.shift.closed')).toHaveLength(1);
    expect(workflow.start).toHaveBeenCalledTimes(1);
  });

  it('a shift waiting for approval cannot be re-closed with a different count (cannot hide a variance)', async () => {
    const r = await openShift(1000, [{ type: 'SALE', amount: 500 }]);
    await close(r.id, 900); // -600 => PENDING_APPROVAL
    await expect(close(r.id, 1500)).rejects.toThrow(/waiting for manager approval/);
    expect(await prisma.cashRegister.findUniqueOrThrow({ where: { id: r.id } })).toMatchObject({ actualCash: 900, variance: -600, status: 'PENDING_APPROVAL' });
  });

  it('a closed shift cannot be closed or receive a movement afterwards', async () => {
    const r = await openShift(1000);
    await close(r.id, 1000);
    await expect(close(r.id, 1000)).rejects.toThrow('Shift already closed');
    await expect(svc.addMovement(r.id, shop.tenantId, { userId: shop.userId } as never, { type: 'DEPOSIT', amount: 10 } as never))
      .rejects.toThrow();
    expect(await prisma.cashMovement.count({ where: { registerId: r.id } })).toBe(0);
  });

  it('only the shift owner or a manager may close; another shop cannot see it', async () => {
    const r = await openShift(1000);
    await expect(svc.closeRegister(r.id, shop.tenantId, 'someone-else', { actualCash: 1000 }, { roles: ['CASHIER'] })).rejects.toBeInstanceOf(ForbiddenException);
    const other = await seedTenant(prisma, 'shift-other');
    await expect(svc.closeRegister(r.id, other.tenantId, other.userId, { actualCash: 1000 }, { roles: ['TENANT_ADMIN'] })).rejects.toThrow('Cash register session not found');
    expect((await prisma.cashRegister.findUniqueOrThrow({ where: { id: r.id } })).status).toBe('OPEN');
  });

  describe('physical cash flow report', () => {
    it('is scoped to the shop and (for a branch-bound user) the branch; uses the shop timezone; reconciles; excludes other shops', async () => {
      await prisma.tenant.update({ where: { id: shop.tenantId }, data: { timezone: 'Asia/Colombo' } });
      const branch2 = await prisma.branch.create({ data: { tenantId: shop.tenantId, name: 'Second', code: 'B2' } });
      const mk = async (branchId: string, openingTime: Date, opening: number, sales: number, actual: number | null) => {
        const r = await prisma.cashRegister.create({ data: { tenantId: shop.tenantId, branchId, cashierId: shop.userId, openingCash: opening, openingTime, status: actual == null ? 'OPEN' : 'CLOSED', actualCash: actual, closingTime: actual == null ? null : new Date(openingTime.getTime() + 3_600_000) } });
        await prisma.cashMovement.create({ data: { tenantId: shop.tenantId, registerId: r.id, type: 'SALE', amount: sales, createdById: shop.userId } });
        return r;
      };
      await mk(shop.branchId, new Date('2026-11-10T04:00:00.000Z'), 1000, 500, 1500);          // 10th (Colombo)
      await mk(shop.branchId, new Date('2026-11-10T20:00:00.000Z'), 1000, 200, null);           // 11th in Colombo (01:30)
      await mk(branch2.id, new Date('2026-11-10T05:00:00.000Z'), 300, 100, 390);                // other branch, 10th
      const otherShop = await seedTenant(prisma, 'shift-foreign');
      await prisma.cashRegister.create({ data: { tenantId: otherShop.tenantId, branchId: otherShop.branchId, cashierId: otherShop.userId, openingCash: 99999, openingTime: new Date('2026-11-10T04:00:00.000Z') } });

      const all = await svc.getPhysicalCashFlow(shop.tenantId, undefined, { from: '2026-11-10', to: '2026-11-11' });
      expect(all.timezone).toBe('Asia/Colombo');
      expect(all.days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11']);
      expect(all.totals).toMatchObject({ opening: 2300, cashSales: 800, expectedClosing: 3100, shifts: 3, openShifts: 1 });
      expect(all.reconciles).toBe(true);
      expect(all.byBranch).toHaveLength(2);

      const scoped = await svc.getPhysicalCashFlow(shop.tenantId, branch2.id, { from: '2026-11-10', to: '2026-11-11' });
      expect(scoped.totals).toMatchObject({ opening: 300, expectedClosing: 400, counted: 390, variance: -10, shifts: 1 });
      expect(scoped.byBranch.map((b) => b.branchId)).toEqual([branch2.id]);
      expect(all.totals.opening).not.toBeGreaterThan(2300); // the other shop's 99999 is never included
    });

    it('rejects an invalid or oversized range', async () => {
      await expect(svc.getPhysicalCashFlow(shop.tenantId, undefined, { from: '2026-13-45' })).rejects.toBeInstanceOf(BadRequestException);
      await expect(svc.getPhysicalCashFlow(shop.tenantId, undefined, { from: '2026-12-01', to: '2026-11-01' })).rejects.toThrow('"from" must not be after "to"');
      await expect(svc.getPhysicalCashFlow(shop.tenantId, undefined, { from: '2024-01-01', to: '2026-11-01' })).rejects.toThrow('at most 400 days');
    });
  });
});
