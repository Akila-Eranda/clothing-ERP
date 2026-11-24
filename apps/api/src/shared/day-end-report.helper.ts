import { CashMovementType, PaymentMethod, PaymentStatus, SaleStatus } from '@prisma/client';
import * as dayjs from 'dayjs';
import * as utc from 'dayjs/plugin/utc';
import * as timezone from 'dayjs/plugin/timezone';
import { computeExpectedCashFromMovements, summarizeMovements } from './cash-register.helper';

dayjs.extend(utc);
dayjs.extend(timezone);

function resolveShopTimezone(tz: string | null | undefined): string {
  const zone = tz || 'Asia/Colombo';
  try {
    Intl.DateTimeFormat('en', { timeZone: zone });
    return zone;
  } catch {
    return 'Asia/Colombo';
  }
}

/**
 * A shop's business day does not roll over at midnight: shops that trade past 00:00 want those sales on the day
 * they opened. The day runs from this hour (shop time) until the same hour the next morning.
 */
export const BUSINESS_DAY_START_HOUR = 3;

/** The business date (YYYY-MM-DD) that `at` belongs to in the shop's timezone (00:00-02:59 still counts as the previous day). */
export function shopDateString(at: Date, tz: string | null | undefined): string {
  return dayjs(at).tz(resolveShopTimezone(tz)).subtract(BUSINESS_DAY_START_HOUR, 'hour').format('YYYY-MM-DD');
}

/**
 * Start / end of a business day in the shop's timezone (servers run on UTC): 03:00 on `date` until 02:59:59.999 the next
 * morning. Without a date it is the business day that is current now. Invalid / missing timezones fall back to Asia/Colombo.
 */
export function shopDayBounds(date: string | undefined, tz: string | null | undefined): { from: Date; to: Date } {
  const zone = resolveShopTimezone(tz);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Invalid date');
  const day = date ? dayjs.tz(date, 'YYYY-MM-DD', zone) : dayjs().tz(zone).subtract(BUSINESS_DAY_START_HOUR, 'hour');
  // Reject impossible dates (2026-13-45) instead of letting them roll over.
  if (!day.isValid() || (date && day.format('YYYY-MM-DD') !== date)) throw new Error('Invalid date');
  const from = day.startOf('day').add(BUSINESS_DAY_START_HOUR, 'hour');
  return { from: from.toDate(), to: from.add(1, 'day').subtract(1, 'millisecond').toDate() };
}

/** Sales that took money (cancelled / held / pending bills are not collections). */
export const COLLECTED_SALE_STATUSES: SaleStatus[] = [SaleStatus.COMPLETED, SaleStatus.REFUNDED, SaleStatus.PARTIALLY_REFUNDED];

export type DayEndShiftInput = {
  id: string;
  cashierName: string;
  counterName: string | null;
  openingTime: Date;
  closingTime: Date | null;
  status: string;
  openingCash: number;
  actualCash: number | null;
  movements: { type: CashMovementType; amount: number; reference?: string | null; description?: string | null }[];
  /** Cash this shift handed over to another shift that is in the SAME report (counted once, not twice). */
  handedOverWithin?: number;
  clearedAmount?: number | null;
  clearedAt?: Date | null;
};

export type DayEndSaleInput = {
  id: string;
  cashierId?: string | null;
  cashRegisterId?: string | null;
  subtotal?: number;
  discountAmount?: number;
  taxAmount?: number;
  total?: number;
  couponDiscount?: number;
  items?: { discount: number; taxRate: number; taxAmount: number; total: number }[];
  status?: SaleStatus;
  payments: { method: PaymentMethod; amount: number; cardLast4?: string | null; feeAmount?: number | null; status?: PaymentStatus; bankAccount?: { name: string; bankName: string | null } | null }[];
  changeDue: number;
  changeSavedToWallet?: number;
};

export const DAY_END_FORMULAS = {
    grossCashReceived: 'SUM(completed sale payments where method=CASH)',
    changeGiven: 'SUM(MAX(0, sale.changeDue - sale.changeSavedToWallet))',
    expectedCash: 'openingCash + inflows - outflows; internal transfers are netted within the report',
    countedVariance: 'actualClosingCash - expectedClosingCash',
    grossRevenue: 'SUM(completed sale subtotal)',
    discounts: 'SUM(sale discountAmount)',
    returns: 'SUM(completed return refundAmount)',
    netSales: 'grossRevenue - discounts + taxes - returns',
    tax: 'SUM(completed sale taxAmount), with item tax type breakdown where available',
    supplierPayments: 'SUM(supplier payments), split by method; not added to sales cash collections',
    walletBalance: 'opening wallet ledger balance + signed wallet transactions',
    qrNet: 'QR gross - stored QR feeAmount',
} as const;

export function buildDayEndSalesFigures(sales: DayEndSaleInput[]) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const completed = sales.filter((s) => !s.status || COLLECTED_SALE_STATUSES.includes(s.status));
  const cashReceived = r2(completed.reduce(
    (sum, sale) => sum + sale.payments.filter((p) => p.method === PaymentMethod.CASH).reduce((p, x) => p + x.amount, 0),
    0,
  ));
  const changeGiven = r2(completed.reduce((sum, sale) => sum + Math.max(0, sale.changeDue - (sale.changeSavedToWallet ?? 0)), 0));
  const savedChange = r2(completed.reduce((sum, sale) => sum + (sale.changeSavedToWallet ?? 0), 0));
  const itemDiscounts = r2(completed.reduce((sum, sale) => sum + (sale.items ?? []).reduce((itemSum, item) => itemSum + item.discount, 0), 0));
  const billDiscounts = r2(Math.max(0, completed.reduce((sum, sale) => sum + (sale.discountAmount ?? 0), 0) - itemDiscounts));
  const couponDiscounts = r2(completed.reduce((sum, sale) => sum + (sale.couponDiscount ?? 0), 0));
  const taxableSales = r2(completed.reduce((sum, sale) => sum + (sale.items ?? []).filter((item) => item.taxRate > 0).reduce((itemSum, item) => itemSum + item.total, 0), 0));
  const taxExemptSales = r2(completed.reduce((sum, sale) => sum + (sale.items ?? []).filter((item) => item.taxRate <= 0).reduce((itemSum, item) => itemSum + item.total, 0), 0));
  const taxByType = new Map<number, number>();
  for (const sale of completed) for (const item of sale.items ?? []) {
    taxByType.set(item.taxRate, r2((taxByType.get(item.taxRate) ?? 0) + item.taxAmount));
  }
  return {
    grossRevenue: r2(completed.reduce((sum, sale) => sum + (sale.subtotal ?? sale.total ?? 0), 0)),
    discounts: r2(completed.reduce((sum, sale) => sum + (sale.discountAmount ?? 0), 0)),
    taxes: r2(completed.reduce((sum, sale) => sum + (sale.taxAmount ?? 0), 0)),
    netRevenue: r2(completed.reduce((sum, sale) => sum + (sale.total ?? 0), 0)),
    cashReceived,
    changeGiven,
    savedChange,
    itemDiscounts,
    billDiscounts,
    promotionDiscounts: r2(Math.max(0, billDiscounts - couponDiscounts)),
    couponDiscounts,
    taxableSales,
    taxExemptSales,
    taxByType: [...taxByType.entries()].map(([taxRate, amount]) => ({ taxRate, amount })),
    transactionCounts: {
      completed: sales.filter((s) => !s.status || s.status === SaleStatus.COMPLETED).length,
      cancelled: sales.filter((s) => s.status === SaleStatus.CANCELLED).length,
      refunded: sales.filter((s) => s.status === SaleStatus.REFUNDED || s.status === SaleStatus.PARTIALLY_REFUNDED).length,
    },
    averageBillValue: completed.length ? r2(completed.reduce((sum, sale) => sum + (sale.total ?? 0), 0) / completed.length) : 0,
  };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Day-end totals for one or more cashier shifts.
 * Cash figures come from the drawer movements (what is physically in the till); card / QR / bank /
 * other collections come from the sale payments taken on those shifts. CASH tender is shown net of
 * change given, which equals the cash-sale movements for sales recorded on the shift.
 */
export function buildDayEndTotals(shifts: DayEndShiftInput[], sales: DayEndSaleInput[]) {
  const allMovements = shifts.flatMap((s) => s.movements);
  const breakdown = summarizeMovements(allMovements);
  // A handover inside the report moves the same notes from one shift to the next: the receiving
  // shift's opening and the giving shift's closing are the same cash, so it is taken out once.
  const within = r2(shifts.reduce((s, x) => s + (x.handedOverWithin ?? 0), 0));
  const openingCash = r2(shifts.reduce((s, x) => s + x.openingCash, 0) - within);
  const expectedClosingCash = r2(shifts.reduce((s, x) => s + computeExpectedCashFromMovements(x.openingCash, x.movements), 0) - within);
  const allClosed = shifts.length > 0 && shifts.every((s) => s.actualCash !== null && s.actualCash !== undefined);
  const actualClosingCash = allClosed ? r2(shifts.reduce((s, x) => s + (x.actualCash ?? 0), 0) - within) : null;

  const byMethod = new Map<string, number>();
  // QR collections are the GROSS amounts customers paid (they match the invoices). The bank deducts the QR fee,
  // so the bank receives QR − fees: the fees are shown apart, never taken out of the QR or total collections.
  let qrFees = 0;
  for (const sale of sales) {
    for (const p of sale.payments) {
      if (p.status && p.status !== PaymentStatus.COMPLETED) continue;
      if (p.method === PaymentMethod.QR) qrFees += p.feeAmount ?? 0;
      if (p.method === PaymentMethod.CASH) continue;
      byMethod.set(p.method, r2((byMethod.get(p.method) ?? 0) + p.amount));
    }
  }
  const take = (m: PaymentMethod) => {
    const v = byMethod.get(m) ?? 0;
    byMethod.delete(m);
    return v;
  };
  const card = take(PaymentMethod.CARD);
  const qr = take(PaymentMethod.QR);
  const bankTransfer = take(PaymentMethod.BANK_TRANSFER);
  const others = [...byMethod.entries()]
    .filter(([, v]) => Math.abs(v) > 0.004)
    .map(([method, amount]) => ({ method, amount }))
    .sort((a, b) => a.method.localeCompare(b.method));
  const otherTotal = r2(others.reduce((s, o) => s + o.amount, 0));
  const salesFigures = buildDayEndSalesFigures(sales);

  return {
    shiftCount: shifts.length,
    transactionCount: sales.length,
    ...salesFigures,
    openingCash,
    openingCashierFloat: openingCash,
    cashSales: breakdown.cashSales,
    cashRefunds: breakdown.cashRefunds,
    handoverIn: r2(breakdown.handoverIn - within),
    handedOverWithin: within,
    deposits: breakdown.deposits,
    withdrawals: breakdown.withdrawals,
    expenses: breakdown.expenses,
    transfersIn: breakdown.transfersIn,
    transfersOut: breakdown.transfersOut,
    collections: { cash: breakdown.cashSales, card, qr, bankTransfer, other: otherTotal, others },
    /** QR fees the bank deducts from the QR collections (informational; QR net to bank = qr − qrFees). */
    qrFees: r2(qrFees),
    totalCollections: r2(breakdown.cashSales + card + qr + bankTransfer + otherTotal),
    expectedClosingCash,
    actualClosingCash,
    difference: actualClosingCash === null ? null : r2(actualClosingCash - expectedClosingCash),
  };
}
