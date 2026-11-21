import { NotFoundException } from '@nestjs/common';
import { CashManagementService } from './cash-management.module';

type TestRegister = {
  id: string;
  tenantId: string;
  branchId: string;
  cashierId: string;
  openingTime: Date;
  closingTime: Date;
  status: string;
  openingCash: number;
  actualCash: number;
  clearedAmount: number;
  clearedAt: Date | null;
  movements: never[];
  cashier: { firstName: string; lastName: string };
  counter: null;
};

function createDayEndService(register: TestRegister | null) {
  const prisma = {
    cashRegister: {
      findFirst: jest.fn(async ({ where }: { where: { id: string; tenantId: string; branchId?: string } }) =>
        register
        && register.id === where.id
        && register.tenantId === where.tenantId
        && (!where.branchId || register.branchId === where.branchId)
          ? register
          : null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    sale: { findMany: jest.fn().mockResolvedValue([]) },
    supplierPayment: { findMany: jest.fn().mockResolvedValue([]) },
    walletTransaction: { findMany: jest.fn().mockResolvedValue([]) },
    supplierReturn: { findMany: jest.fn().mockResolvedValue([]) },
    return: { findMany: jest.fn().mockResolvedValue([]) },
    cashHandover: { findMany: jest.fn().mockResolvedValue([]) },
    tenant: { findUnique: jest.fn().mockResolvedValue({ name: 'Shop', phone: null, email: null }) },
    branch: { findFirst: jest.fn().mockResolvedValue({ name: 'Main', code: 'M01', address: null, phone: null }) },
  };
  const service = new CashManagementService(prisma as never, {} as never, {} as never, {} as never);
  return { prisma, service };
}

function testRegister(branchId: string): TestRegister {
  return {
    id: 'register-1',
    tenantId: 'tenant-1',
    branchId,
    cashierId: 'cashier-1',
    openingTime: new Date('2026-11-12T08:00:00.000Z'),
    closingTime: new Date('2026-11-12T16:00:00.000Z'),
    status: 'CLOSED',
    openingCash: 0,
    actualCash: 0,
    clearedAmount: 0,
    clearedAt: null,
    movements: [],
    cashier: { firstName: 'Cashier', lastName: 'One' },
    counter: null,
  };
}

describe('CashManagementService day-end PDF', () => {
  it('creates a single A4 PDF without mutating dependencies', async () => {
    const prisma = {} as never;
    const service = new CashManagementService(prisma, {} as never, {} as never, {} as never);
    const pdf = await service.buildDayEndPdf({
      business: { name: 'සිංහල වෙළඳසැල' },
      branch: { name: 'Main', code: 'M01' },
      periodFrom: new Date('2026-11-12T00:00:00.000Z'),
      periodTo: new Date('2026-11-12T23:59:59.999Z'),
      totals: {
        grossRevenue: 1500, discounts: 50, taxes: 171, netRevenue: 1621, transactionCount: 2,
        openingCash: 5000, cashReceived: 1200, changeGiven: 200, savedChange: 0, cashRefunds: 0,
        expectedClosingCash: 6000, actualClosingCash: 6000, difference: 0, totalCollections: 1500,
      },
      supplierPayments: { total: 100, cash: 100, nonCash: 0 },
      voids: { count: 1, amount: 25 },
      pendingApprovals: { count: 0, variance: 0 },
      savedChangeWallet: 0,
      safeDrops: 0,
      shifts: [],
    });

    expect(pdf.subarray(0, 5).toString('ascii')).toBe('%PDF-');
    expect((pdf.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(1);
  });

  it('paginates a large mixed-language report with repeated headers and page numbers', async () => {
    const prisma = {} as never;
    const service = new CashManagementService(prisma, {} as never, {} as never, {} as never);
    const pdf = await service.buildDayEndPdf({
      business: { name: 'සිංහල වෙළඳසැල / Sinhala Market' },
      branch: { name: 'Main Branch', code: 'M01' },
      periodFrom: new Date('2026-11-12T00:00:00.000Z'),
      periodTo: new Date('2026-11-12T23:59:59.999Z'),
      reportId: 'DAY-20261112-LARGE',
      preparedBy: 'සඳුනි Silva',
      checkedBy: 'Nimal Perera',
      approvedBy: null,
      totals: {
        grossRevenue: 150000, discounts: 5000, taxes: 15000, netRevenue: 160000, transactionCount: 400,
        openingCash: 50000, openingCashierFloat: 20000, cashReceived: 100000, changeGiven: 5000,
        cashRefunds: 500, expectedClosingCash: 120000, actualClosingCash: 120000, difference: 0, totalCollections: 160000,
      },
      supplierPayments: { total: 10000, cash: 3000, nonCash: 7000 },
      voids: { count: 2, amount: 500 },
      pendingApprovals: { count: 1, variance: 250 },
      savedChangeWallet: 250,
      safeDrops: 20000,
      shifts: Array.from({ length: 90 }, (_, index) => ({
        cashierName: index % 2 ? 'සඳුනි Silva' : 'Nimal Perera',
        counterName: `Counter ${(index % 8) + 1}`,
        status: 'CLOSED',
        expectedClosingCash: 1000 + index,
        actualClosingCash: 1000 + index,
        difference: 0,
      })),
    });

    const raw = pdf.toString('latin1');
    const pageCount = (raw.match(/\/Type \/Page\b/g) ?? []).length;
    expect(pageCount).toBeGreaterThan(1);
    expect((raw.match(/\/Contents\b/g) ?? []).length).toBeGreaterThanOrEqual(pageCount);
    expect(raw).toContain('/MediaBox [0 0 595.28 841.89]');
  });
});

describe('CashManagementService day-end report branch scope', () => {
  it('does not return a same-tenant register from another branch', async () => {
    const { prisma, service } = createDayEndService(testRegister('branch-b'));

    await expect(
      service.getDayEndReport('tenant-1', 'branch-a', { registerId: 'register-1' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.cashRegister.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'register-1', tenantId: 'tenant-1', branchId: 'branch-a' },
    }));
  });

  it('returns a register in the resolved branch', async () => {
    const { prisma, service } = createDayEndService(testRegister('branch-a'));

    const report = await service.getDayEndReport('tenant-1', 'branch-a', { registerId: 'register-1' });

    expect(report.scope).toBe('SHIFT');
    expect(prisma.cashRegister.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'register-1', tenantId: 'tenant-1', branchId: 'branch-a' },
    }));
  });
});
