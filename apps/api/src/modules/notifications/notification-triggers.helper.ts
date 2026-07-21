/** Notification Engine — pure trigger eligibility, templates, channel/role routing. */

export type TriggerKind =
  | 'LOW_STOCK'
  | 'REORDER'
  | 'EXPIRY'
  | 'CUSTOMER_DUE'
  | 'SUPPLIER_DUE'
  | 'CHEQUE_DUE'
  | 'GRN_PENDING'
  | 'PO_PENDING'
  | 'DAILY_SUMMARY';

/** Default delivery channel for engine-planned alerts (IN_APP only for now). */
export function defaultChannelFor(_kind?: TriggerKind | string): 'IN_APP' {
  return 'IN_APP';
}

/** Role types that receive operational alerts (managers). Include cashiers for birthday-style blasts. */
export const MANAGER_ROLE_TYPES = [
  'SUPER_ADMIN',
  'TENANT_ADMIN',
  'BRANCH_MANAGER',
  'INVENTORY_MANAGER',
  'ACCOUNTANT',
] as const;

export const MANAGER_PLUS_CASHIER_ROLE_TYPES = [
  ...MANAGER_ROLE_TYPES,
  'CASHIER',
] as const;

export function recipientRoleTypes(includeCashier = false): readonly string[] {
  return includeCashier ? MANAGER_PLUS_CASHIER_ROLE_TYPES : MANAGER_ROLE_TYPES;
}
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function daysUntil(date: Date, now = new Date()): number {
  const a = startOfLocalDay(date).getTime();
  const b = startOfLocalDay(now).getTime();
  return Math.floor((a - b) / 86400000);
}

/** Low stock when on-hand is at/below reorder point (fallback minStock / 5). */
export function isLowStock(
  quantity: number,
  opts?: { reorderPoint?: number | null; minStockLevel?: number | null },
): boolean {
  const threshold = opts?.reorderPoint && opts.reorderPoint > 0
    ? opts.reorderPoint
    : opts?.minStockLevel && opts.minStockLevel > 0
      ? opts.minStockLevel
      : 5;
  return quantity <= threshold;
}

/** Reorder when available qty is at/below reorder point and still sellable (>0 or zero). */
export function isReorderNeeded(
  quantity: number,
  reservedQty: number,
  reorderPoint: number | null | undefined,
): boolean {
  const available = Math.max(0, quantity - reservedQty);
  const point = reorderPoint && reorderPoint > 0 ? reorderPoint : 5;
  return available <= point;
}

export function isExpiryAlert(expiryDate: Date | null | undefined, withinDays = 7, now = new Date()): boolean {
  if (!expiryDate) return false;
  const d = daysUntil(expiryDate, now);
  return d < 0 || d <= withinDays;
}

export function isDueWithin(
  dueDate: Date | null | undefined,
  withinDays: number,
  now = new Date(),
): boolean {
  if (!dueDate) return false;
  const d = daysUntil(dueDate, now);
  return d <= withinDays;
}

export function isOverdue(dueDate: Date | null | undefined, now = new Date()): boolean {
  if (!dueDate) return false;
  return daysUntil(dueDate, now) < 0;
}

/** Stable idempotency key for scheduled alerts. */
export function buildDedupeKey(kind: TriggerKind, parts: Array<string | number | null | undefined>): string {
  const tail = parts.map((p) => String(p ?? '')).filter(Boolean).join(':');
  return `${kind}:${tail}`;
}

export function dateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Skip re-send when the same dedupeKey was already sent inside the cooldown window.
 * `existingKeys` should contain recent notification data.dedupeKey values.
 */
export function shouldSendNotification(
  dedupeKey: string,
  existingKeys: Set<string> | string[],
): boolean {
  const set = existingKeys instanceof Set ? existingKeys : new Set(existingKeys);
  return !set.has(dedupeKey);
}

export type PlannedAlert = {
  kind: TriggerKind;
  dedupeKey: string;
  title: string;
  message: string;
  link: string;
  data?: Record<string, unknown>;
};

export function planLowStockAlert(input: {
  variantId: string;
  branchId: string;
  sku: string;
  productName: string;
  quantity: number;
  reorderPoint?: number | null;
}): PlannedAlert {
  return {
    kind: 'LOW_STOCK',
    dedupeKey: buildDedupeKey('LOW_STOCK', [input.branchId, input.variantId, dateKey()]),
    title: 'Low Stock Alert',
    message: `${input.productName} (${input.sku}) has only ${input.quantity} units left`,
    link: '/inventory',
    data: { variantId: input.variantId, branchId: input.branchId, quantity: input.quantity },
  };
}

export function planReorderAlert(input: {
  variantId: string;
  branchId: string;
  sku: string;
  productName: string;
  available: number;
  reorderPoint: number;
}): PlannedAlert {
  return {
    kind: 'REORDER',
    dedupeKey: buildDedupeKey('REORDER', [input.branchId, input.variantId, dateKey()]),
    title: 'Reorder Suggested',
    message: `${input.productName} (${input.sku}) available ${input.available} ≤ reorder point ${input.reorderPoint}`,
    link: '/purchases/procurement',
    data: { ...input },
  };
}

export function planExpiryAlert(input: {
  lotId: string;
  productName: string;
  batchNumber: string | null;
  daysToExpiry: number;
  quantity: number;
}): PlannedAlert {
  const label = input.daysToExpiry < 0
    ? `expired ${Math.abs(input.daysToExpiry)}d ago`
    : `expires in ${input.daysToExpiry}d`;
  return {
    kind: 'EXPIRY',
    dedupeKey: buildDedupeKey('EXPIRY', [input.lotId, dateKey()]),
    title: 'Expiry Alert',
    message: `${input.productName} batch ${input.batchNumber ?? '—'} ${label} · qty ${input.quantity}`,
    link: '/inventory/expiry',
    data: { ...input },
  };
}

export function planCustomerDueAlert(input: {
  customerId: string;
  customerName: string;
  amount: number;
  dueDate: Date;
  now?: Date;
}): PlannedAlert {
  const overdue = isOverdue(input.dueDate, input.now);
  return {
    kind: 'CUSTOMER_DUE',
    dedupeKey: buildDedupeKey('CUSTOMER_DUE', [input.customerId, dateKey(input.now)]),
    title: overdue ? 'Customer Overdue' : 'Customer Due Soon',
    message: `${input.customerName} owes LKR ${round2(input.amount).toFixed(2)} (due ${input.dueDate.toISOString().slice(0, 10)})`,
    link: '/accounting/credit',
    data: { customerId: input.customerId, amount: input.amount },
  };
}

export function planSupplierDueAlert(input: {
  invoiceId: string;
  supplierName: string;
  amount: number;
  dueDate: Date;
  now?: Date;
}): PlannedAlert {
  const overdue = isOverdue(input.dueDate, input.now);
  return {
    kind: 'SUPPLIER_DUE',
    dedupeKey: buildDedupeKey('SUPPLIER_DUE', [input.invoiceId, dateKey(input.now)]),
    title: overdue ? 'Supplier Invoice Overdue' : 'Supplier Payment Due',
    message: `${input.supplierName}: LKR ${round2(input.amount).toFixed(2)} due ${input.dueDate.toISOString().slice(0, 10)}`,
    link: '/purchases/procurement',
    data: { invoiceId: input.invoiceId, amount: input.amount },
  };
}

export function planChequeDueAlert(input: {
  chequeId: string;
  chequeNumber: string;
  amount: number;
  dueDate: Date;
  partyName?: string | null;
  now?: Date;
}): PlannedAlert {
  const overdue = isOverdue(input.dueDate, input.now);
  return {
    kind: 'CHEQUE_DUE',
    dedupeKey: buildDedupeKey('CHEQUE_DUE', [input.chequeId, dateKey(input.now)]),
    title: overdue ? 'Cheque Overdue' : 'Cheque Due Soon',
    message: `Cheque #${input.chequeNumber}${input.partyName ? ` (${input.partyName})` : ''} · LKR ${round2(input.amount).toFixed(2)}`,
    link: '/accounting/finance',
    data: { chequeId: input.chequeId, amount: input.amount },
  };
}

export function planPoPendingAlert(input: {
  poId: string;
  poNumber: string;
  supplierName: string;
  status: string;
  expectedDate?: Date | null;
}): PlannedAlert {
  return {
    kind: 'PO_PENDING',
    dedupeKey: buildDedupeKey('PO_PENDING', [input.poId, dateKey()]),
    title: 'Purchase Order Pending',
    message: `PO ${input.poNumber} (${input.supplierName}) is ${input.status}`,
    link: '/purchases',
    data: { ...input, expectedDate: input.expectedDate?.toISOString() ?? null },
  };
}

export function planGrnPendingAlert(input: {
  poId: string;
  poNumber: string;
  supplierName: string;
  orderedQty: number;
  receivedQty: number;
}): PlannedAlert {
  const remaining = Math.max(0, input.orderedQty - input.receivedQty);
  return {
    kind: 'GRN_PENDING',
    dedupeKey: buildDedupeKey('GRN_PENDING', [input.poId, dateKey()]),
    title: 'GRN Pending',
    message: `PO ${input.poNumber} (${input.supplierName}) awaiting receipt · ${remaining} units outstanding`,
    link: '/purchases/procurement',
    data: { ...input, remaining },
  };
}

export function planDailySummaryAlert(input: {
  salesCount: number;
  revenue: number;
  day: string;
}): PlannedAlert {
  return {
    kind: 'DAILY_SUMMARY',
    dedupeKey: buildDedupeKey('DAILY_SUMMARY', [input.day]),
    title: `Daily Summary — ${input.day}`,
    message: `${input.salesCount} sales · LKR ${round2(input.revenue).toFixed(2)} revenue`,
    link: '/reports?tab=sales',
    data: { ...input },
  };
}

/** Map trigger kind → Prisma NotificationType name (extended enums). */
export function notificationTypeFor(kind: TriggerKind): string {
  switch (kind) {
    case 'LOW_STOCK': return 'LOW_STOCK';
    case 'REORDER': return 'REORDER';
    case 'EXPIRY': return 'EXPIRY_ALERT';
    case 'CUSTOMER_DUE': return 'PAYMENT_DUE';
    case 'SUPPLIER_DUE': return 'SUPPLIER_DUE';
    case 'CHEQUE_DUE': return 'CHEQUE_DUE';
    case 'GRN_PENDING': return 'GRN_PENDING';
    case 'PO_PENDING': return 'PO_PENDING';
    case 'DAILY_SUMMARY': return 'DAILY_SUMMARY';
    default: return 'INFO';
  }
}

export function extractDedupeKey(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const key = (data as Record<string, unknown>).dedupeKey;
  return typeof key === 'string' && key.length > 0 ? key : null;
}
