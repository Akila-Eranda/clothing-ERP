import {
  PurchaseOrderStatus,
  SupplierInvoiceStatus,
  SupplierLedgerEntryType,
  type PrismaClient,
} from '@prisma/client';

/** Prisma client or interactive transaction client */
export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends' | '$use'
>;

export const AP_PO_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
  PurchaseOrderStatus.RECEIVED,
];

export const AP_INVOICE_STATUSES: SupplierInvoiceStatus[] = [
  SupplierInvoiceStatus.POSTED,
  SupplierInvoiceStatus.PARTIALLY_PAID,
];

export type SupplierApLine = {
  id: string;
  source: 'PO' | 'INVOICE';
  docNumber: string;
  amount: number;
  dueDate: Date;
  asOfDate: Date;
};

export type SupplierAgingBuckets = {
  current: number;
  days1to30: number;
  days31to60: number;
  days61to90: number;
  days90plus: number;
  total: number;
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Outstanding for one supplier = received PO dues + unpaid invoices (no double-count). */
export async function computeSupplierOutstanding(
  db: Tx,
  tenantId: string,
  supplierId: string,
  asOf: Date = new Date(),
): Promise<{ outstanding: number; lines: SupplierApLine[] }> {
  const [pos, invoices, supplier] = await Promise.all([
    db.purchaseOrder.findMany({
      where: { tenantId, supplierId, status: { in: AP_PO_STATUSES } },
      include: { items: { select: { receivedQty: true, unitCost: true } } },
    }),
    db.supplierInvoice.findMany({
      where: { tenantId, supplierId, status: { in: AP_INVOICE_STATUSES } },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        paidAmount: true,
        dueDate: true,
        invoiceDate: true,
        purchaseId: true,
      },
    }),
    db.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { creditDays: true },
    }),
  ]);

  const creditDays = supplier?.creditDays ?? 30;
  const invoicedPoIds = new Set(
    invoices.filter((i) => i.purchaseId).map((i) => i.purchaseId!),
  );

  const lines: SupplierApLine[] = [];

  for (const inv of invoices) {
    const due = round2(Math.max(0, inv.total - inv.paidAmount));
    if (due <= 0.01) continue;
    const dueDate =
      inv.dueDate
      ?? new Date(inv.invoiceDate.getTime() + creditDays * 86400000);
    lines.push({
      id: inv.id,
      source: 'INVOICE',
      docNumber: inv.invoiceNumber,
      amount: due,
      dueDate,
      asOfDate: asOf,
    });
  }

  for (const po of pos) {
    if (invoicedPoIds.has(po.id)) continue;
    const receivedValue = round2(
      po.items.reduce((s, i) => s + i.receivedQty * i.unitCost, 0),
    );
    const liabilityBase = receivedValue > 0.01 ? receivedValue : po.total;
    const due = round2(Math.max(0, liabilityBase - po.paidAmount));
    if (due <= 0.01) continue;
    const dueDate = new Date(po.orderDate.getTime() + creditDays * 86400000);
    lines.push({
      id: po.id,
      source: 'PO',
      docNumber: po.poNumber,
      amount: due,
      dueDate,
      asOfDate: asOf,
    });
  }

  const outstanding = round2(lines.reduce((s, l) => s + l.amount, 0));
  return { outstanding, lines };
}

export function bucketAging(lines: SupplierApLine[], asOf: Date = new Date()): SupplierAgingBuckets {
  const buckets: SupplierAgingBuckets = {
    current: 0,
    days1to30: 0,
    days31to60: 0,
    days61to90: 0,
    days90plus: 0,
    total: 0,
  };
  for (const line of lines) {
    const daysPastDue = Math.floor((asOf.getTime() - line.dueDate.getTime()) / 86400000);
    if (daysPastDue <= 0) buckets.current += line.amount;
    else if (daysPastDue <= 30) buckets.days1to30 += line.amount;
    else if (daysPastDue <= 60) buckets.days31to60 += line.amount;
    else if (daysPastDue <= 90) buckets.days61to90 += line.amount;
    else buckets.days90plus += line.amount;
    buckets.total += line.amount;
  }
  for (const k of Object.keys(buckets) as (keyof SupplierAgingBuckets)[]) {
    buckets[k] = round2(buckets[k]);
  }
  return buckets;
}

/** Recompute AP from docs and persist Supplier.balance. */
export async function syncSupplierBalance(
  db: Tx,
  tenantId: string,
  supplierId: string,
): Promise<number> {
  const { outstanding } = await computeSupplierOutstanding(db, tenantId, supplierId);
  await db.supplier.update({
    where: { id: supplierId },
    data: { balance: outstanding },
  });
  return outstanding;
}

/** Append audit ledger row; does not change balance by itself (call sync after). */
export async function appendSupplierLedger(
  db: Tx,
  data: {
    tenantId: string;
    supplierId: string;
    entryType: SupplierLedgerEntryType;
    amount: number;
    balanceAfter: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
    createdBy?: string;
  },
) {
  return db.supplierLedgerEntry.create({
    data: {
      tenantId: data.tenantId,
      supplierId: data.supplierId,
      entryType: data.entryType,
      amount: round2(data.amount),
      balanceAfter: round2(data.balanceAfter),
      referenceType: data.referenceType,
      referenceId: data.referenceId,
      notes: data.notes,
      createdBy: data.createdBy,
    },
  });
}

export async function syncSupplierBalanceWithLedger(
  db: Tx,
  tenantId: string,
  supplierId: string,
  meta: {
    entryType: SupplierLedgerEntryType;
    amount: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
    createdBy?: string;
  },
) {
  const balanceAfter = await syncSupplierBalance(db, tenantId, supplierId);
  await appendSupplierLedger(db, {
    tenantId,
    supplierId,
    entryType: meta.entryType,
    amount: meta.amount,
    balanceAfter,
    referenceType: meta.referenceType,
    referenceId: meta.referenceId,
    notes: meta.notes,
    createdBy: meta.createdBy,
  });
  return balanceAfter;
}

export async function assertSupplierCreditLimit(
  db: Tx,
  tenantId: string,
  supplierId: string,
  additionalAmount: number,
) {
  const supplier = await db.supplier.findFirst({
    where: { id: supplierId, tenantId },
    select: { creditLimit: true, name: true },
  });
  if (!supplier) return;
  if (!supplier.creditLimit || supplier.creditLimit <= 0) return;
  const { outstanding } = await computeSupplierOutstanding(db, tenantId, supplierId);
  const projected = round2(outstanding + Math.max(0, additionalAmount));
  if (projected > supplier.creditLimit + 0.01) {
    throw new Error(
      `Credit limit exceeded for ${supplier.name}: outstanding LKR ${outstanding.toFixed(2)} + new LKR ${additionalAmount.toFixed(2)} > limit LKR ${supplier.creditLimit.toFixed(2)}`,
    );
  }
}
