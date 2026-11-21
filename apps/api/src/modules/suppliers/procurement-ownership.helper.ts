/**
 * Procurement ownership + supplier-return quantity checks (S-F7, S-F8).
 *
 * - `findReturnQtyViolation` is pure (unit-tested without a DB).
 * - The assert* / load* helpers run tenant-scoped reads on a Prisma client or tx and throw Nest exceptions.
 *   They never write. None of them changes how a credit, payable or journal is computed.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupplierReturnStatus, type Prisma } from '@prisma/client';
import { roundQty } from '@/modules/inventory/inventory-lots.helper';

type Db = Pick<
  Prisma.TransactionClient,
  'supplier' | 'purchaseOrder' | 'purchaseOrderItem' | 'goodsReceipt' | 'supplierReturnItem' | 'inventoryLot'
>;

// ── Pure ──────────────────────────────────────────────────────────────

export type QtyRow = { variantId: string; qty: number };
export type ReturnLineQty = { variantId: string; quantity: number; label?: string };

/**
 * Per variant: total requested on this return must not exceed received - already returned on the source document.
 * A variant that is not on the source document is a violation (it was never received there).
 * Returns the first violation message, or null when every line fits.
 */
export function findReturnQtyViolation(
  lines: readonly ReturnLineQty[],
  received: readonly QtyRow[],
  alreadyReturned: readonly QtyRow[],
  sourceLabel: string,
): string | null {
  const sum = (rows: readonly QtyRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.variantId, (m.get(r.variantId) ?? 0) + (Number(r.qty) || 0));
    return m;
  };
  const rec = sum(received);
  const ret = sum(alreadyReturned);
  const want = new Map<string, { qty: number; label: string }>();
  for (const l of lines) {
    const cur = want.get(l.variantId);
    want.set(l.variantId, { qty: (cur?.qty ?? 0) + l.quantity, label: cur?.label ?? l.label ?? l.variantId });
  }
  for (const [variantId, w] of want) {
    if (!rec.has(variantId)) return `${w.label} was not received on ${sourceLabel}`;
    const left = roundQty(Math.max(0, rec.get(variantId)! - (ret.get(variantId) ?? 0)));
    if (roundQty(w.qty) > left) {
      return `Return quantity for ${w.label} (${roundQty(w.qty)}) exceeds what is left to return on ${sourceLabel} (${left})`;
    }
  }
  return null;
}

// ── Tenant-scoped reads ───────────────────────────────────────────────

export async function assertSupplierInTenant(db: Pick<Db, 'supplier'>, tenantId: string, supplierId: string): Promise<void> {
  const s = supplierId
    ? await db.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } })
    : null;
  if (!s) throw new NotFoundException('Supplier not found');
}

/** The PO must be this tenant's and (when given) the same supplier's. */
export async function assertPurchaseOrderInTenant(
  db: Pick<Db, 'purchaseOrder'>, tenantId: string, purchaseId: string, supplierId?: string,
): Promise<void> {
  const po = await db.purchaseOrder.findFirst({ where: { id: purchaseId, tenantId }, select: { id: true, supplierId: true } });
  if (!po) throw new NotFoundException('Purchase order not found');
  if (supplierId && po.supplierId !== supplierId) throw new BadRequestException('Purchase order belongs to a different supplier');
}

/** The GRN must be this tenant's and (when given) the same supplier's. */
export async function assertGoodsReceiptInTenant(
  db: Pick<Db, 'goodsReceipt'>, tenantId: string, goodsReceiptId: string, supplierId?: string,
): Promise<{ purchaseId: string | null }> {
  const grn = await db.goodsReceipt.findFirst({ where: { id: goodsReceiptId, tenantId }, select: { id: true, supplierId: true, purchaseId: true } });
  if (!grn) throw new NotFoundException('Goods receipt not found');
  if (supplierId && grn.supplierId !== supplierId) throw new BadRequestException('Goods receipt belongs to a different supplier');
  return { purchaseId: grn.purchaseId };
}

/** Purchase-order line ids sent on a Direct GRN must be lines of a PO of this tenant, for the same variant. */
export async function assertPurchaseItemsInTenant(
  db: Pick<Db, 'purchaseOrderItem'>, tenantId: string, lines: readonly { purchaseItemId?: string | null; variantId: string }[],
): Promise<void> {
  const wanted = lines.filter((l) => l.purchaseItemId);
  if (!wanted.length) return;
  const rows = await db.purchaseOrderItem.findMany({
    where: { id: { in: [...new Set(wanted.map((l) => l.purchaseItemId!))] }, purchase: { tenantId } },
    select: { id: true, variantId: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r.variantId]));
  for (const l of wanted) {
    if (byId.get(l.purchaseItemId!) !== l.variantId) throw new BadRequestException(`Purchase order line not found: ${l.purchaseItemId}`);
  }
}

/** Lot ids on return lines must be lots of this tenant, of the line's variant (and of the branch when known). */
export async function assertReturnLotsInTenant(
  db: Pick<Db, 'inventoryLot'>, tenantId: string, branchId: string | null | undefined,
  lines: readonly { lotId?: string | null; variantId: string }[],
): Promise<void> {
  const wanted = lines.filter((l) => l.lotId);
  if (!wanted.length) return;
  const lots = await db.inventoryLot.findMany({
    where: { id: { in: [...new Set(wanted.map((l) => l.lotId!))] }, tenantId, ...(branchId ? { branchId } : {}) },
    select: { id: true, variantId: true },
  });
  const byId = new Map(lots.map((l) => [l.id, l.variantId]));
  for (const l of wanted) {
    if (byId.get(l.lotId!) !== l.variantId) throw new BadRequestException('Lot not found for this product at this branch');
  }
}

/**
 * Supplier return against a GRN (preferred) or a PO: the source must be this tenant's and this supplier's, and
 * each variant's quantity must fit in received - already POSTED returns (excluding `excludeReturnId`).
 * Without a GRN or PO nothing is determinable here (posting still refuses to take more stock than is on hand).
 */
export async function assertReturnLinesReturnable(
  db: Db,
  tenantId: string,
  doc: {
    supplierId: string;
    branchId?: string;
    purchaseId?: string | null;
    goodsReceiptId?: string | null;
    items: readonly { variantId: string; quantity: number; sku?: string | null; productName?: string | null }[];
  },
  excludeReturnId?: string,
): Promise<void> {
  const lines = doc.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity, label: i.productName || i.sku || i.variantId }));
  const others = excludeReturnId ? { id: { not: excludeReturnId } } : {};
  let received: QtyRow[];
  let returnedWhere: Prisma.SupplierReturnWhereInput;
  let label: string;

  if (doc.goodsReceiptId) {
    const grn = await db.goodsReceipt.findFirst({
      where: { id: doc.goodsReceiptId, tenantId },
      select: { id: true, grnNumber: true, supplierId: true, branchId: true, purchaseId: true, items: { select: { variantId: true, receivedQty: true } } },
    });
    if (!grn) throw new NotFoundException('Goods receipt not found');
    if (grn.supplierId !== doc.supplierId) throw new BadRequestException('Goods receipt belongs to a different supplier');
    if (doc.branchId && grn.branchId && grn.branchId !== doc.branchId) {
      throw new BadRequestException('Goods receipt belongs to a different branch');
    }
    if (doc.purchaseId && grn.purchaseId && grn.purchaseId !== doc.purchaseId) {
      throw new BadRequestException('Goods receipt is not part of this purchase order');
    }
    received = grn.items.map((i) => ({ variantId: i.variantId, qty: i.receivedQty }));
    returnedWhere = { tenantId, goodsReceiptId: grn.id, status: SupplierReturnStatus.POSTED, ...others };
    label = `GRN ${grn.grnNumber}`;
  } else if (doc.purchaseId) {
    const po = await db.purchaseOrder.findFirst({
      where: { id: doc.purchaseId, tenantId },
      select: { id: true, poNumber: true, supplierId: true, branchId: true, items: { select: { variantId: true, receivedQty: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.supplierId !== doc.supplierId) throw new BadRequestException('Purchase order belongs to a different supplier');
    if (doc.branchId && po.branchId && po.branchId !== doc.branchId) throw new BadRequestException('Purchase order belongs to a different branch');
    received = po.items.map((i) => ({ variantId: i.variantId, qty: i.receivedQty }));
    returnedWhere = {
      tenantId, status: SupplierReturnStatus.POSTED, ...others,
      OR: [{ purchaseId: po.id }, { goodsReceipt: { purchaseId: po.id } }],
    };
    label = `PO ${po.poNumber}`;
  } else {
    return;
  }

  const returnedRows = await db.supplierReturnItem.findMany({
    where: { returnDoc: returnedWhere },
    select: { variantId: true, quantity: true },
  });
  const violation = findReturnQtyViolation(
    lines, received, returnedRows.map((r) => ({ variantId: r.variantId, qty: r.quantity })), label,
  );
  if (violation) throw new BadRequestException(violation);
}
