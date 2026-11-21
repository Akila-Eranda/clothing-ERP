import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isCashManagerRole, managerApprovalRequired } from '@/shared/security/cash-actor';
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

const isTransfer = (m: { reference?: string | null }) => (m.reference ?? '').startsWith('XFER-');
const isHandover = (m: { reference?: string | null }) => (m.reference ?? '').startsWith('HANDOVER-');

export function summarizeMovements(movements: { type: CashMovementType; amount: number; reference?: string | null }[]) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const sum = (pick: (m: { type: CashMovementType; amount: number; reference?: string | null }) => boolean) =>
    r2(movements.filter(pick).reduce((s, m) => s + m.amount, 0));
  const ofType = (...types: CashMovementType[]) => (m: { type: CashMovementType }) => types.includes(m.type);

  return {
    // Existing keys (unchanged meaning, used by the close summary and the UI)
    cashSales: sum(ofType(CashMovementType.SALE)),
    cashReceived: sum(ofType(CashMovementType.DEPOSIT, CashMovementType.PAYMENT)),
    cashExpenses: sum(ofType(CashMovementType.EXPENSE, CashMovementType.WITHDRAWAL)),
    cashRefunds: sum(ofType(CashMovementType.REFUND)),
    // Separate figures for reports (day-end, counter history); transfers are XFER- movements
    handoverIn: sum((m) => m.type === CashMovementType.OPENING && isHandover(m)),
    deposits: sum((m) => (m.type === CashMovementType.DEPOSIT || m.type === CashMovementType.PAYMENT) && !isTransfer(m)),
    withdrawals: sum((m) => m.type === CashMovementType.WITHDRAWAL && !isTransfer(m)),
    expenses: sum(ofType(CashMovementType.EXPENSE)),
    transfersIn: sum((m) => m.type === CashMovementType.DEPOSIT && isTransfer(m)),
    transfersOut: sum((m) => m.type === CashMovementType.WITHDRAWAL && isTransfer(m)),
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

/**
 * The cashier's open (or pending) wallet. `counterId`: a counter id = the wallet on that counter,
 * null = the wallet with no counter, undefined = the latest wallet on any counter.
 */
export async function findOpenRegister(
  db: Db,
  tenantId: string,
  branchId: string,
  cashierId: string,
  counterId?: string | null,
) {
  return db.cashRegister.findFirst({
    where: {
      tenantId,
      branchId,
      cashierId,
      status: { in: [CashRegisterStatus.OPEN, CashRegisterStatus.PENDING_APPROVAL] },
      ...(counterId !== undefined ? { counterId } : {}),
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
 * The cashier's open wallet for a counter — one wallet per cashier per counter, so each counter's
 * cash is exactly what was taken there. Without a counter, the wallet the cashier used last.
 * A wallet is opened with a zero float when none exists.
 */
export async function ensureCashierWallet(
  db: Db,
  tenantId: string,
  branchId: string,
  cashierId: string,
  counterId?: string | null,
) {
  let validCounterId: string | null = null;
  if (counterId) {
    const counter = await db.posCounter.findFirst({
      where: { id: counterId, tenantId, branchId, isActive: true },
      select: { id: true },
    });
    validCounterId = counter?.id ?? null;
  }

  const existing = validCounterId
    ? await db.cashRegister.findFirst({
        where: { tenantId, branchId, cashierId, counterId: validCounterId, status: CashRegisterStatus.OPEN },
        orderBy: { openingTime: 'desc' },
      })
    : await findOwnOpenWallet(db, tenantId, branchId, cashierId);
  if (existing) return existing;

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

/** The cashier's open wallet with the most recent cash activity (any counter). */
async function findOwnOpenWallet(db: Db, tenantId: string, branchId: string, cashierId: string) {
  const lastMovement = await db.cashMovement.findFirst({
    where: {
      tenantId,
      register: { branchId, cashierId, status: CashRegisterStatus.OPEN },
    },
    orderBy: { createdAt: 'desc' },
    select: { registerId: true },
  });
  if (lastMovement) {
    const wallet = await db.cashRegister.findUnique({ where: { id: lastMovement.registerId } });
    if (wallet) return wallet;
  }
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
  changeSavedToWallet = 0,
): number {
  const cashPaid = payments
    .filter((p) => p.method === PaymentMethod.CASH)
    .reduce((s, p) => s + p.amount, 0);
  if (cashPaid <= 0) return 0;
  const cashChange = Math.max(0, changeDue - Math.max(0, changeSavedToWallet));
  return Math.max(0, Math.round((cashPaid - cashChange) * 100) / 100);
}

/**
 * Writes the drawer movement of a cash sale INSIDE the sale's own transaction (P-F17): the sale and its movement
 * commit together or not at all, so a completed cash sale can never exist without the cash it brought into the
 * drawer. Pass the sale transaction client; `preferredRegisterId` is the wallet the sale was stored on.
 * Returns the register id the movement was written to (null when the sale moved no cash). If that wallet was
 * cleared by a counter handover a moment ago the cash goes to the cashier's new wallet and the caller re-points
 * the sale to it.
 */
export async function recordSaleCashMovement(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  cashierId: string,
  saleId: string,
  invoiceNumber: string,
  payments: { method: PaymentMethod; amount: number }[],
  changeDue: number,
  changeSavedToWallet = 0,
  counterId?: string | null,
  preferredRegisterId?: string | null,
): Promise<string | null> {
  const netCash = netCashFromSalePayments(payments, changeDue, changeSavedToWallet);
  if (netCash <= 0) return null;

  const movement = await writeIntoOpenWallet(tx, tenantId, branchId, cashierId, counterId, {
    type: CashMovementType.SALE,
    amount: netCash,
    reference: saleId,
    description: `Sale ${invoiceNumber}`,
  }, preferredRegisterId);
  return movement?.registerId ?? null;
}

/**
 * Writes a sale / refund cash movement into the cashier's open wallet. The wallet row is locked
 * (FOR SHARE) and re-checked first: if a counter handover cleared it a moment ago, the cash goes
 * to the cashier's new wallet instead of a wallet that is already cleared into main cash.
 */
async function recordIntoOpenWallet(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  cashierId: string,
  counterId: string | null | undefined,
  movement: { type: CashMovementType; amount: number; reference: string; description: string },
) {
  return prisma.$transaction((tx) => writeIntoOpenWallet(tx, tenantId, branchId, cashierId, counterId, movement));
}

/** Same as recordIntoOpenWallet but inside a transaction the caller already owns. */
async function writeIntoOpenWallet(
  tx: Prisma.TransactionClient,
  tenantId: string,
  branchId: string,
  cashierId: string,
  counterId: string | null | undefined,
  movement: { type: CashMovementType; amount: number; reference: string; description: string },
  preferredRegisterId?: string | null,
) {
  let walletId: string;
  if (preferredRegisterId) walletId = preferredRegisterId;
  else walletId = (await ensureCashierWallet(tx, tenantId, branchId, cashierId, counterId)).id;
  const usable = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "cash_registers"
    WHERE "id" = ${walletId} AND "status" = 'OPEN' AND "clearedAt" IS NULL
    FOR SHARE`;
  if (!usable.length) walletId = (await ensureCashierWallet(tx, tenantId, branchId, cashierId, counterId)).id;
  return recordCashMovement(tx, { tenantId, registerId: walletId, createdById: cashierId, ...movement });
}

export async function recordRefundCashMovement(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
  cashierId: string,
  returnId: string,
  returnNumber: string,
  amount: number,
  counterId?: string | null,
) {
  if (amount <= 0) return;

  await recordIntoOpenWallet(prisma, tenantId, branchId, cashierId, counterId, {
    type: CashMovementType.REFUND,
    amount,
    reference: returnId,
    description: `Refund ${returnNumber}`,
  });
}

/** The cashier's own open wallet only — cash never moves out of another cashier's wallet. */
export async function resolveOpenDrawerForCashier(
  db: Db,
  tenantId: string,
  branchId: string,
  cashierId: string,
) {
  return findOwnOpenWallet(db, tenantId, branchId, cashierId);
}

/**
 * Takes cash out of the cashier's OWN open wallet for a payment made at the counter (supplier
 * payment, shop expense). Call inside the caller's transaction: the wallet row is locked FOR UPDATE,
 * its balance recomputed under the lock, and the payment refused if the drawer does not hold enough —
 * so concurrent payments can never overdraw it. No open wallet = paid from the office (returns null).
 */
export async function takeCashFromOwnWallet(
  db: Db,
  opts: {
    tenantId: string;
    branchId?: string;
    cashierId: string;
    amount: number;
    reference: string;
    description: string;
    authorizedById?: string | null;
    /** Above this amount the ACTING cashier must be a manager (roles from the database). */
    managerRequiredAbove?: number;
  },
) {
  if (opts.amount <= 0.009 || !opts.branchId) return null;
  const wallet = await resolveOpenDrawerForCashier(db, opts.tenantId, opts.branchId, opts.cashierId);
  if (!wallet) return null;
  if ('$queryRaw' in db) {
    await (db as Prisma.TransactionClient).$queryRaw`SELECT "id" FROM "cash_registers" WHERE "id" = ${wallet.id} FOR UPDATE`;
  }
  const locked = await db.cashRegister.findFirst({
    where: { id: wallet.id, tenantId: opts.tenantId },
    select: { status: true, clearedAt: true, openingCash: true, movements: { select: { type: true, amount: true } } },
  });
  if (!locked || locked.status !== CashRegisterStatus.OPEN || locked.clearedAt) {
    throw new BadRequestException('Your cash drawer was closed or handed over. Reopen the shift and try again.');
  }
  const available = computeExpectedCashFromMovements(locked.openingCash, locked.movements);
  const amount = Math.round(opts.amount * 100) / 100;
  if (amount > available + 0.001) {
    throw new BadRequestException(`Not enough cash in your drawer (available LKR ${available.toFixed(2)})`);
  }
  let authorizedById = opts.authorizedById ?? null;
  if (opts.managerRequiredAbove !== undefined && amount > opts.managerRequiredAbove + 0.001) {
    // Roles of the person actually paying (PIN cashier) — never the terminal login.
    const actor = await db.user.findFirst({
      where: { id: opts.cashierId, tenantId: opts.tenantId, status: 'ACTIVE' },
      select: { roles: { select: { role: { select: { type: true } } } } },
    });
    const actorIsManager = !!actor && isCashManagerRole(actor.roles.map((r) => r.role.type));
    // A manager acting, or a manager's PIN approval (authorizedById comes only from a verified approval
    // token — resolveCashActor — never from the request body). The cashier stays the one who paid.
    if (!actorIsManager && !authorizedById) {
      throw managerApprovalRequired(
        `Cash payments above LKR ${opts.managerRequiredAbove.toFixed(2)} from a drawer need a manager's PIN approval`,
      );
    }
    authorizedById = authorizedById ?? opts.cashierId;
  }
  return db.cashMovement.create({
    data: {
      tenantId: opts.tenantId,
      registerId: wallet.id,
      type: CashMovementType.EXPENSE,
      amount,
      reference: opts.reference,
      description: opts.description,
      createdById: opts.cashierId,
      authorizedById,
    },
  });
}

/**
 * When a cashier pays a supplier in cash from POS / counter, deduct it from their own open wallet
 * (locked, balance-checked). No-ops if no open wallet (e.g. office AP payment).
 */
/**
 * Checked BEFORE a PO receive / Quick GRN posts any stock: a cash payment above the limit from a drawer
 * needs a manager acting or a manager PIN approval. Otherwise the goods would be received and the payment
 * refused, and retrying with an approval would receive them twice.
 */
export function assertSupplierCashAuthority(
  payment: { method?: string | null; amount?: number | null } | null | undefined,
  authorizerId: string | null,
) {
  if (!payment || String(payment.method ?? '').toUpperCase() !== 'CASH') return;
  const threshold = cashOutApprovalThreshold();
  if (Number(payment.amount ?? 0) > threshold + 0.001 && !authorizerId) {
    throw managerApprovalRequired(`Cash payments above LKR ${threshold.toFixed(2)} from a drawer need a manager's PIN approval`);
  }
}

/**
 * Fast pre-check before a PO receive / Quick GRN posts anything: manager authority (above the limit) and
 * enough cash in the paying cashier's open drawer. The authoritative check is repeated under a row lock
 * inside the GRN transaction (takeCashFromOwnWallet), which rolls the whole GRN back if it fails.
 */
export async function assertSupplierCashPayable(
  db: Db,
  payment: { method?: string | null; amount?: number | null } | null | undefined,
  opts: { tenantId: string; branchId?: string | null; cashierId: string; authorizerId: string | null },
) {
  assertSupplierCashAuthority(payment, opts.authorizerId);
  if (!payment || String(payment.method ?? '').toUpperCase() !== 'CASH' || !opts.branchId) return;
  const amount = Math.round(Number(payment.amount ?? 0) * 100) / 100;
  if (!(amount > 0)) return;
  const drawer = await resolveOpenDrawerForCashier(db, opts.tenantId, opts.branchId, opts.cashierId);
  if (!drawer) return; // no open drawer = paid from the office
  const full = await db.cashRegister.findFirst({
    where: { id: drawer.id, tenantId: opts.tenantId },
    select: { openingCash: true, movements: { select: { type: true, amount: true } } },
  });
  const available = full ? computeExpectedCashFromMovements(full.openingCash, full.movements) : 0;
  if (amount > available + 0.001) {
    throw new BadRequestException(`Not enough cash in your drawer (available LKR ${available.toFixed(2)})`);
  }
}

export async function recordSupplierCashOutflow(
  db: Db,
  opts: {
    tenantId: string;
    branchId?: string;
    cashierId: string;
    paymentId: string;
    amount: number;
    description: string;
    authorizedById?: string | null;
  },
) {
  return takeCashFromOwnWallet(db, { ...opts, reference: opts.paymentId, managerRequiredAbove: cashOutApprovalThreshold() });
}

/**
 * When a cashier records a cash shop expense from POS / counter, deduct it from their own open wallet
 * (locked, balance-checked). No-ops if no open wallet (office expense without shift).
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
    authorizedById?: string | null;
  },
) {
  return takeCashFromOwnWallet(db, { ...opts, reference: opts.expenseId });
}

/**
 * Pays the cash part of a refund out of the till cashier's wallet on this counter, inside the return
 * transaction: wallet locked FOR UPDATE, balance recomputed under the lock, refund refused if the drawer
 * does not hold enough (the whole return then rolls back, so no refund is half-recorded).
 */
export async function takeRefundCashFromWallet(
  tx: Prisma.TransactionClient,
  opts: {
    tenantId: string;
    branchId: string;
    cashierId: string;
    counterId?: string | null;
    amount: number;
    returnId: string;
    returnNumber: string;
    authorizedById?: string | null;
  },
) {
  const amount = Math.round(opts.amount * 100) / 100;
  if (!(amount > 0)) return null;
  const wallet = await ensureCashierWallet(tx, opts.tenantId, opts.branchId, opts.cashierId, opts.counterId);
  await tx.$queryRaw`SELECT "id" FROM "cash_registers" WHERE "id" = ${wallet.id} FOR UPDATE`;
  const locked = await tx.cashRegister.findFirst({
    where: { id: wallet.id, tenantId: opts.tenantId },
    select: { status: true, clearedAt: true, openingCash: true, movements: { select: { type: true, amount: true } } },
  });
  if (!locked || locked.status !== CashRegisterStatus.OPEN || locked.clearedAt) {
    throw new BadRequestException('The cash drawer was closed or handed over. Reopen the shift and try again.');
  }
  const available = computeExpectedCashFromMovements(locked.openingCash, locked.movements);
  if (amount > available + 0.001) {
    throw new BadRequestException(
      `Not enough cash in the drawer for this refund (cash part LKR ${amount.toFixed(2)}, available LKR ${available.toFixed(2)})`,
    );
  }
  return tx.cashMovement.create({
    data: {
      tenantId: opts.tenantId,
      registerId: wallet.id,
      type: CashMovementType.REFUND,
      amount,
      reference: opts.returnId,
      description: `Refund ${opts.returnNumber}`,
      createdById: opts.cashierId,
      authorizedById: opts.authorizedById ?? null,
    },
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

/**
 * Manual cash out (withdrawal / expense) above this amount needs a manager (audit H2).
 * Configurable with CASH_OUT_APPROVAL_THRESHOLD (LKR); default 5000.
 */
export function cashOutApprovalThreshold(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.CASH_OUT_APPROVAL_THRESHOLD);
  return Number.isFinite(n) && n >= 0 ? n : 5000;
}

export type CashOutDecision =
  | { ok: true; needsAuthorizer: boolean }
  | { ok: false; code: 'INSUFFICIENT_CASH' | 'MANAGER_REQUIRED'; message: string };

/**
 * Whether a manual cash out may be recorded, given the drawer balance computed under a row lock.
 * Never more than the drawer holds; above the threshold only a manager (who is then recorded as
 * the authoriser) may take cash out.
 */
export function decideCashOut(opts: { amount: number; available: number; isManager: boolean; threshold: number }): CashOutDecision {
  const amount = Math.round(opts.amount * 100) / 100;
  const available = Math.round(opts.available * 100) / 100;
  if (amount > available + 0.001) {
    return { ok: false, code: 'INSUFFICIENT_CASH', message: `Not enough cash in the drawer (available LKR ${available.toFixed(2)})` };
  }
  if (amount > opts.threshold + 0.001 && !opts.isManager) {
    return { ok: false, code: 'MANAGER_REQUIRED', message: `Cash out above LKR ${opts.threshold.toFixed(2)} must be done by a manager` };
  }
  return { ok: true, needsAuthorizer: amount > opts.threshold + 0.001 };
}
