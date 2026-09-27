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

/**
 * Cash the wallet got from main cash rather than from customers: opening float and manual / safe
 * cash-in, less cash dropped back out. Only the rest of the wallet is new money for main cash.
 */
export function walletFloatIssued(
  openingCash: number,
  movements: { type: CashMovementType; amount: number }[],
): number {
  let issued = openingCash;
  for (const m of movements) {
    if (m.type === CashMovementType.DEPOSIT || m.type === CashMovementType.PAYMENT) issued += m.amount;
    else if (m.type === CashMovementType.WITHDRAWAL) issued -= m.amount;
  }
  return Math.round(issued * 100) / 100;
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
      counter: { select: { id: true, name: true, code: true } },
    },
  });
}

/** Any open shift on the branch — shared terminal float when PIN-switching cashiers. */
export async function findAnyOpenRegisterOnBranch(
  db: Db,
  tenantId: string,
  branchId: string,
  counterId?: string | null,
) {
  return db.cashRegister.findFirst({
    where: {
      tenantId,
      branchId,
      status: CashRegisterStatus.OPEN,
      ...(counterId ? { counterId } : {}),
    },
    orderBy: { openingTime: 'desc' },
    include: {
      movements: { orderBy: { createdAt: 'asc' } },
      cashier: { select: { id: true, firstName: true, lastName: true, email: true } },
      branch: { select: { id: true, name: true, code: true } },
      counter: { select: { id: true, name: true, code: true } },
    },
  });
}

/**
 * The cashier's own open wallet (cash shift). Wallets belong to the cashier, never to a counter;
 * one is opened with a zero float when the cashier has none.
 */
export async function ensureCashierWallet(
  db: Db,
  tenantId: string,
  branchId: string,
  cashierId: string,
  counterId?: string | null,
) {
  const existing = await db.cashRegister.findFirst({
    where: { tenantId, branchId, cashierId, status: CashRegisterStatus.OPEN },
    orderBy: { openingTime: 'desc' },
  });
  if (existing) return existing;

  let validCounterId: string | null = null;
  if (counterId) {
    const counter = await db.posCounter.findFirst({
      where: { id: counterId, tenantId, branchId, isActive: true },
      select: { id: true },
    });
    validCounterId = counter?.id ?? null;
  }

  return db.cashRegister.create({
    data: {
      tenantId,
      branchId,
      cashierId,
      counterId: validCounterId,
      openingCash: 0,
      status: CashRegisterStatus.OPEN,
      notes: 'Cashier wallet (auto-opened)',
    },
  });
}

async function findOwnOpenWallet(db: Db, tenantId: string, branchId: string, cashierId: string) {
  return db.cashRegister.findFirst({
    where: { tenantId, branchId, cashierId, status: CashRegisterStatus.OPEN },
    orderBy: { openingTime: 'desc' },
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
  counterId?: string | null,
) {
  const netCash = netCashFromSalePayments(payments, changeDue);
  if (netCash <= 0) return;

  const register = await ensureCashierWallet(prisma, tenantId, branchId, cashierId, counterId);

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

  const register = await ensureCashierWallet(prisma, tenantId, branchId, cashierId);

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

/** The cashier's own open wallet only — cash never moves out of another cashier's wallet. */
async function resolveOpenDrawerForCashier(
  db: Db,
  tenantId: string,
  branchId: string,
  cashierId: string,
) {
  return findOwnOpenWallet(db, tenantId, branchId, cashierId);
}

/**
 * When a cashier pays a supplier in cash from POS / counter,
 * deduct the amount from their own open cashier wallet.
 * No-ops if no open wallet (e.g. office AP payment).
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
 * deduct from the cashier's own open wallet.
 * No-ops if no open wallet (office expense without shift).
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
