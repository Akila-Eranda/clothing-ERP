import { CashMovementType, CashRegisterStatus, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

export const CASH_VARIANCE_APPROVAL_THRESHOLD = 500;

type Db = PrismaService | Prisma.TransactionClient;

const INFLOW_TYPES: CashMovementType[] = [
  CashMovementType.OPENING,
  CashMovementType.SALE,
  CashMovementType.DEPOSIT,
  CashMovementType.PAYMENT,
];

const OUTFLOW_TYPES: CashMovementType[] = [
  CashMovementType.EXPENSE,
  CashMovementType.REFUND,
  CashMovementType.WITHDRAWAL,
];

export function computeExpectedCashFromMovements(
  openingCash: number,
  movements: { type: CashMovementType; amount: number }[],
): number {
  let expected = openingCash;
  for (const m of movements) {
    if (INFLOW_TYPES.includes(m.type)) {
      if (m.type === CashMovementType.OPENING) continue;
      expected += m.amount;
    } else if (OUTFLOW_TYPES.includes(m.type)) {
      expected -= m.amount;
    }
  }
  return Math.round(expected * 100) / 100;
}

export function summarizeMovements(movements: { type: CashMovementType; amount: number }[]) {
  const sum = (types: CashMovementType[]) =>
    movements.filter((m) => types.includes(m.type)).reduce((s, m) => s + m.amount, 0);

  return {
    cashSales: sum([CashMovementType.SALE]),
    cashReceived: sum([CashMovementType.DEPOSIT, CashMovementType.PAYMENT]),
    cashExpenses: sum([CashMovementType.EXPENSE, CashMovementType.WITHDRAWAL]),
    cashRefunds: sum([CashMovementType.REFUND]),
  };
}

export async function findOpenRegister(
  db: Db,
  tenantId: string,
  branchId: string,
  cashierId: string,
) {
  return db.cashRegister.findFirst({
    where: {
      tenantId,
      branchId,
      cashierId,
      status: { in: [CashRegisterStatus.OPEN, CashRegisterStatus.PENDING_APPROVAL] },
    },
    orderBy: { openingTime: 'desc' },
    include: {
      movements: { orderBy: { createdAt: 'asc' } },
      cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
    },
  });
}

/** Any open shift on the branch — shared terminal float when PIN-switching cashiers. */
export async function findAnyOpenRegisterOnBranch(
  db: Db,
  tenantId: string,
  branchId: string,
) {
  return db.cashRegister.findFirst({
    where: {
      tenantId,
      branchId,
      status: CashRegisterStatus.OPEN,
    },
    orderBy: { openingTime: 'desc' },
    include: {
      movements: { orderBy: { createdAt: 'asc' } },
      cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
    },
  });
}

export async function recordCashMovement(
  db: Db,
  data: {
    tenantId: string;
    registerId: string;
    type: CashMovementType;
    amount: number;
    reference?: string;
    description?: string;
    createdById?: string;
  },
) {
  if (data.amount <= 0) return null;
  return db.cashMovement.create({
    data: {
      tenantId: data.tenantId,
      registerId: data.registerId,
      type: data.type,
      amount: Math.round(data.amount * 100) / 100,
      reference: data.reference,
      description: data.description,
      createdById: data.createdById,
    },
  });
}

/** Net cash effect of a POS sale (cash in minus change given). */
export function netCashFromSalePayments(
  payments: { method: PaymentMethod; amount: number }[],
  changeDue: number,
): number {
  const cashPaid = payments
    .filter((p) => p.method === PaymentMethod.CASH)
    .reduce((s, p) => s + p.amount, 0);
  if (cashPaid <= 0) return 0;
  return Math.max(0, Math.round((cashPaid - changeDue) * 100) / 100);
}

export async function recordSaleCashMovement(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  cashierId: string,
  saleId: string,
  invoiceNumber: string,
  payments: { method: PaymentMethod; amount: number }[],
  changeDue: number,
) {
  const netCash = netCashFromSalePayments(payments, changeDue);
  if (netCash <= 0) return;

  let register = await findOpenRegister(prisma, tenantId, branchId, cashierId);
  if (!register || register.status !== CashRegisterStatus.OPEN) {
    register = await findAnyOpenRegisterOnBranch(prisma, tenantId, branchId);
  }
  if (!register || register.status !== CashRegisterStatus.OPEN) return;

  await recordCashMovement(prisma, {
    tenantId,
    registerId: register.id,
    type: CashMovementType.SALE,
    amount: netCash,
    reference: saleId,
    description: `Sale ${invoiceNumber}`,
    createdById: cashierId,
  });
}

export async function recordRefundCashMovement(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  cashierId: string,
  returnId: string,
  returnNumber: string,
  amount: number,
) {
  if (amount <= 0) return;

  let register = await findOpenRegister(prisma, tenantId, branchId, cashierId);
  if (!register || register.status !== CashRegisterStatus.OPEN) {
    register = await findAnyOpenRegisterOnBranch(prisma, tenantId, branchId);
  }
  if (!register || register.status !== CashRegisterStatus.OPEN) return;

  await recordCashMovement(prisma, {
    tenantId,
    registerId: register.id,
    type: CashMovementType.REFUND,
    amount,
    reference: returnId,
    description: `Refund ${returnNumber}`,
    createdById: cashierId,
  });
}

/**
 * Resolve open drawer for cashier — own shift first, else shared terminal float (PIN switch).
 */
async function resolveOpenDrawerForCashier(
  db: Db,
  tenantId: string,
  branchId: string,
  cashierId: string,
) {
  let register = await findOpenRegister(db, tenantId, branchId, cashierId);
  if (!register || register.status !== CashRegisterStatus.OPEN) {
    register = await findAnyOpenRegisterOnBranch(db, tenantId, branchId);
  }
  if (!register || register.status !== CashRegisterStatus.OPEN) return null;
  return register;
}

/**
 * When a cashier pays a supplier in cash from POS / counter,
 * deduct the amount from their open cash drawer (shift).
 * Falls back to shared branch float when PIN-switching cashiers.
 * No-ops if no open register (e.g. office AP payment).
 */
export async function recordSupplierCashOutflow(
  db: Db,
  opts: {
    tenantId: string;
    branchId?: string;
    cashierId: string;
    paymentId: string;
    amount: number;
    description: string;
  },
) {
  if (opts.amount <= 0.009 || !opts.branchId) return null;

  const register = await resolveOpenDrawerForCashier(
    db,
    opts.tenantId,
    opts.branchId,
    opts.cashierId,
  );
  if (!register) return null;

  return recordCashMovement(db, {
    tenantId: opts.tenantId,
    registerId: register.id,
    type: CashMovementType.EXPENSE,
    amount: opts.amount,
    reference: opts.paymentId,
    description: opts.description,
    createdById: opts.cashierId,
  });
}

/**
 * When a cashier records a cash shop expense from POS / counter,
 * deduct from the open drawer (own or shared float).
 * No-ops if no open register (office expense without shift).
 */
export async function recordExpenseCashOutflow(
  db: Db,
  opts: {
    tenantId: string;
    branchId?: string;
    cashierId: string;
    expenseId: string;
    amount: number;
    description: string;
  },
) {
  if (opts.amount <= 0.009 || !opts.branchId) return null;

  const register = await resolveOpenDrawerForCashier(
    db,
    opts.tenantId,
    opts.branchId,
    opts.cashierId,
  );
  if (!register) return null;

  return recordCashMovement(db, {
    tenantId: opts.tenantId,
    registerId: register.id,
    type: CashMovementType.EXPENSE,
    amount: opts.amount,
    reference: opts.expenseId,
    description: opts.description,
    createdById: opts.cashierId,
  });
}

export function denominationTotal(counts: Record<string, number>): number {
  return Object.entries(counts).reduce((sum, [denom, qty]) => {
    const d = parseFloat(denom);
    const q = Number(qty) || 0;
    if (!Number.isFinite(d) || d <= 0 || q <= 0) return sum;
    return sum + d * q;
  }, 0);
}
