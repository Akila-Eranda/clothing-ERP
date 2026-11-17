/** Pure procurement cycle helpers — unit-tested without DB. */

import { roundQty } from '@/modules/inventory/inventory-engine.helper';
import { PurchaseOrderStatus, RoleType } from '@prisma/client';

export type PoReceiveLine = {
  orderedQty: number;
  receivedQty: number;
  thisReceive: number;
};

export type PoReceiveResult = {
  nextReceived: number[];
  status: 'RECEIVED' | 'PARTIALLY_RECEIVED' | 'UNCHANGED';
  fullyReceived: boolean;
};

export function applyPartialReceive(lines: PoReceiveLine[]): PoReceiveResult {
  const nextReceived = lines.map((l) => {
    if (l.thisReceive < 0) throw new Error('Receive qty cannot be negative');
    const next = roundQty(l.receivedQty + l.thisReceive);
    if (next > roundQty(l.orderedQty)) {
      throw new Error(`Cannot receive beyond ordered qty (${l.orderedQty})`);
    }
    return next;
  });

  const fullyReceived = nextReceived.every((n, i) => n >= roundQty(lines[i].orderedQty));
  const anyReceived = nextReceived.some((n, i) => n > lines[i].receivedQty || lines[i].receivedQty > 0);

  if (fullyReceived) {
    return { nextReceived, status: 'RECEIVED', fullyReceived: true };
  }
  if (anyReceived || nextReceived.some((n) => n > 0)) {
    return { nextReceived, status: 'PARTIALLY_RECEIVED', fullyReceived: false };
  }
  return { nextReceived, status: 'UNCHANGED', fullyReceived: false };
}

export type InvoicePayResult = {
  paidAmount: number;
  status: 'POSTED' | 'PARTIALLY_PAID' | 'PAID';
};

export function applyInvoicePayment(
  total: number,
  alreadyPaid: number,
  payment: number,
): InvoicePayResult {
  if (payment <= 0) throw new Error('Payment must be positive');
  const due = Math.max(0, total - alreadyPaid);
  if (payment > due + 0.01) throw new Error('Payment exceeds invoice balance');
  const paidAmount = alreadyPaid + payment;
  if (paidAmount >= total - 0.01) return { paidAmount: total, status: 'PAID' };
  if (paidAmount > 0) return { paidAmount, status: 'PARTIALLY_PAID' };
  return { paidAmount, status: 'POSTED' };
}

export type PoPayableLine = {
  id: string;
  orderedQty: number;
  receivedQty: number;
  unitCost: number;
  discount?: number | null;
};

export function calculatePoReceiptPayable(
  poItems: readonly PoPayableLine[],
  received: readonly { itemId: string; receivedQty: number }[],
) {
  return Math.round(received.reduce((sum, line) => {
    const poItem = poItems.find((item) => item.id === line.itemId);
    if (!poItem || line.receivedQty <= 0) return sum;
    const alreadyPaidQty = Math.min(poItem.receivedQty, poItem.orderedQty);
    const paidQty = Math.min(
      line.receivedQty,
      Math.max(0, poItem.orderedQty - alreadyPaidQty),
    );
    const discountPerUnit = poItem.orderedQty > 0
      ? Math.min(Math.max(0, poItem.discount ?? 0), poItem.unitCost * poItem.orderedQty) / poItem.orderedQty
      : 0;
    return sum + paidQty * Math.max(0, poItem.unitCost - discountPerUnit);
  }, 0) * 100) / 100;
}

/** Spread paid PO cost over all received units, including free units. */
export function effectivePoReceiptUnitCost(
  poItem: { orderedQty: number; receivedQty: number; unitCost: number; discount?: number | null },
  receiptQty: number,
) {
  if (receiptQty <= 0) return 0;
  const alreadyPaidQty = Math.min(Math.max(0, poItem.receivedQty), Math.max(0, poItem.orderedQty));
  const paidQty = Math.min(receiptQty, Math.max(0, poItem.orderedQty - alreadyPaidQty));
  const discountPerUnit = poItem.orderedQty > 0
    ? Math.min(Math.max(0, poItem.discount ?? 0), poItem.unitCost * poItem.orderedQty) / poItem.orderedQty
    : 0;
  const paidUnitCost = Math.max(0, poItem.unitCost - discountPerUnit);
  return Math.round((paidQty * paidUnitCost / receiptQty) * 100) / 100;
}

export function grnRequestMatches(
  existing: readonly {
    variantId: string;
    purchaseItemId: string | null;
    receivedQty: number;
    rejectedQty: number;
    unitCost: number;
    batchNumber: string | null;
    expiryDate: Date | null;
  }[],
  requested: readonly {
    variantId: string;
    purchaseItemId?: string | null;
    receivedQty: number;
    rejectedQty?: number;
    unitCost: number;
    batchNumber?: string | null;
    expiryDate?: string | null;
  }[],
) {
  const normalize = (rows: readonly {
    variantId: string;
    purchaseItemId?: string | null;
    receivedQty: number;
    rejectedQty?: number;
    unitCost: number;
    batchNumber?: string | null;
    expiryDate?: Date | string | null;
  }[]) => rows.map((row) => ({
    variantId: row.variantId,
    purchaseItemId: row.purchaseItemId ?? null,
    receivedQty: Math.round(row.receivedQty * 1000) / 1000,
    rejectedQty: Math.round((row.rejectedQty ?? 0) * 1000) / 1000,
    unitCost: Math.round(row.unitCost * 100) / 100,
    batchNumber: row.batchNumber ?? null,
    expiryDate: row.expiryDate ? new Date(row.expiryDate).toISOString().slice(0, 10) : null,
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return JSON.stringify(normalize(existing)) === JSON.stringify(normalize(requested));
}

export function nextDocNumber(prefix: string, seq: number, year = new Date().getFullYear()) {
  return `${prefix}-${year}-${String(seq).padStart(5, '0')}`;
}

export function canConvertPurchaseRequest(status: string) {
  return status === 'APPROVED';
}

export function canReceiveAgainstPo(status: string) {
  return status === PurchaseOrderStatus.CONFIRMED || status === PurchaseOrderStatus.PARTIALLY_RECEIVED;
}

const PO_STATUS_TRANSITIONS: Readonly<Record<PurchaseOrderStatus, readonly PurchaseOrderStatus[]>> = {
  [PurchaseOrderStatus.DRAFT]: [PurchaseOrderStatus.SENT, PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.PENDING_APPROVAL]: [],
  [PurchaseOrderStatus.SENT]: [PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.CONFIRMED]: [PurchaseOrderStatus.CANCELLED],
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: [],
  [PurchaseOrderStatus.RECEIVED]: [],
  [PurchaseOrderStatus.CLOSED]: [],
  [PurchaseOrderStatus.CANCELLED]: [],
};

export function isAllowedPurchaseOrderStatusTransition(
  current: PurchaseOrderStatus,
  next: PurchaseOrderStatus,
) {
  return PO_STATUS_TRANSITIONS[current].includes(next);
}

export function canEditGrnPricing(roles: readonly string[]) {
  const allowedRoles: readonly string[] = [
    RoleType.SUPER_ADMIN,
    RoleType.TENANT_ADMIN,
    RoleType.BRANCH_MANAGER,
    RoleType.INVENTORY_MANAGER,
    RoleType.ACCOUNTANT,
  ];
  return roles.some((role) => [
    ...allowedRoles,
  ].includes(role));
}

export type ProcurementCycleStep =
  | 'PR_CREATED'
  | 'PR_APPROVED'
  | 'PO_CREATED'
  | 'PO_APPROVED'
  | 'GRN_POSTED'
  | 'INVOICE_POSTED'
  | 'PAYMENT_RECORDED'
  | 'RETURN_POSTED';

export function procurementCycleProgress(done: ProcurementCycleStep[]) {
  const order: ProcurementCycleStep[] = [
    'PR_CREATED',
    'PR_APPROVED',
    'PO_CREATED',
    'PO_APPROVED',
    'GRN_POSTED',
    'INVOICE_POSTED',
    'PAYMENT_RECORDED',
  ];
  const set = new Set(done);
  const completed = order.filter((s) => set.has(s));
  const next = order.find((s) => !set.has(s)) ?? null;
  return {
    completed,
    next,
    percent: Math.round((completed.length / order.length) * 100),
    hasReturn: set.has('RETURN_POSTED'),
  };
}

/** True when a Prisma error is a unique violation on the given column (e.g. a GRN number drawn twice). */
export function isUniqueConflictOn(error: unknown, column: string): boolean {
  const e = error as { code?: string; meta?: { target?: unknown } } | null;
  if (!e || e.code !== 'P2002') return false;
  const target = e.meta?.target;
  const fields = Array.isArray(target) ? target.map(String) : [String(target ?? '')];
  return fields.some((f) => f.includes(column));
}

/**
 * Lines whose selling price is above their MRP (only checked when MRP > 0; no MRP or no selling price = fine).
 * The retail price a supermarket may charge can never exceed the printed maximum retail price.
 */
export function findSellingPriceAboveMrp<T extends { sellingPrice?: number | null; mrp?: number | null }>(lines: T[]): T[] {
  return lines.filter((l) => {
    const mrp = l.mrp ?? 0;
    const sell = l.sellingPrice ?? 0;
    return mrp > 0 && sell > 0 && Math.round(sell * 100) > Math.round(mrp * 100);
  });
}

type GrnLineKey = { variantId: string; purchaseItemId?: string | null; batchNumber?: string | null; expiryDate?: string | Date | null; receivedQty: number; unitCost: number };

function grnLineKey(l: GrnLineKey): string {
  const exp = l.expiryDate ? new Date(l.expiryDate).toISOString().slice(0, 10) : '';
  return [l.variantId, l.purchaseItemId ?? '', l.batchNumber ?? '', exp, roundQty(l.receivedQty), l.unitCost].join('|');
}

/**
 * Pairs each GRN line with the goods-receipt item row created from it (index of `items` per line, -1 if none).
 * The same variant may appear on several lines (different batches / expiries / PO lines), so the match uses the
 * full line identity and hands every item out once - never "first item of this variant".
 */
export function matchGrnItemsToLines(lines: GrnLineKey[], items: (GrnLineKey & { id: string })[]): number[] {
  const used = new Set<number>();
  return lines.map((line) => {
    const key = grnLineKey(line);
    let idx = items.findIndex((it, i) => !used.has(i) && grnLineKey(it) === key);
    if (idx < 0) idx = items.findIndex((it, i) => !used.has(i) && it.variantId === line.variantId);
    if (idx >= 0) used.add(idx);
    return idx;
  });
}

export type MrpWarning = { lineIndex: number; variantId: string; productName: string; sellingPrice: number; mrp: number; message: string };

/** Non-blocking MRP warnings for GRN lines (same comparison as findSellingPriceAboveMrp, with line index). */
export function buildMrpWarnings(lines: { variantId: string; productName?: string; variantName?: string; sellingPrice?: number | null; mrp?: number | null }[]): MrpWarning[] {
  const out: MrpWarning[] = [];
  lines.forEach((l, lineIndex) => {
    if (findSellingPriceAboveMrp([l]).length === 0) return;
    const name = `${l.productName ?? l.variantId}${l.variantName ? ` - ${l.variantName}` : ''}`;
    out.push({
      lineIndex, variantId: l.variantId, productName: l.productName ?? '', sellingPrice: l.sellingPrice as number, mrp: l.mrp as number,
      message: `Selling price ${l.sellingPrice} is above MRP ${l.mrp} for ${name}. Stock was received; please review the price.`,
    });
  });
  return out;
}
