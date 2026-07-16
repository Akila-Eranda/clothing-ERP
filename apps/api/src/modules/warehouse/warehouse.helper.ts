/** Pure helpers for Phase 10 multi-warehouse stock movement. */

export type WarehouseStockRow = {
  warehouseId: string;
  variantId: string;
  quantity: number;
  reservedQty: number;
};

export type WarehouseMovementPlan = {
  fromWarehouseId: string;
  toWarehouseId: string;
  variantId: string;
  quantity: number;
  available: number;
};

export function availableQty(row: Pick<WarehouseStockRow, 'quantity' | 'reservedQty'>): number {
  return Math.max(0, row.quantity - row.reservedQty);
}

export function assertDistinctWarehouses(fromWarehouseId: string, toWarehouseId: string) {
  if (!fromWarehouseId || !toWarehouseId) {
    throw new Error('Source and destination warehouses are required');
  }
  if (fromWarehouseId === toWarehouseId) {
    throw new Error('Cannot transfer to the same warehouse');
  }
}

export function planWarehouseMovement(
  from: WarehouseStockRow | null | undefined,
  toWarehouseId: string,
  variantId: string,
  quantity: number,
): WarehouseMovementPlan {
  if (quantity <= 0) throw new Error('Transfer quantity must be positive');
  if (!from) throw new Error('Source warehouse has no stock for this variant');
  assertDistinctWarehouses(from.warehouseId, toWarehouseId);
  const available = availableQty(from);
  if (available < quantity) {
    throw new Error(
      `Insufficient warehouse stock: ${available} available, ${quantity} requested`,
    );
  }
  return {
    fromWarehouseId: from.warehouseId,
    toWarehouseId,
    variantId,
    quantity,
    available,
  };
}

/** Apply outbound/inbound deltas without mutating inputs. */
export function applyWarehouseMovement(
  fromQty: number,
  toQty: number,
  quantity: number,
): { fromAfter: number; toAfter: number } {
  if (quantity <= 0) throw new Error('Movement quantity must be positive');
  if (fromQty < quantity) throw new Error('Insufficient quantity for movement');
  return { fromAfter: fromQty - quantity, toAfter: toQty + quantity };
}

export type WarehouseDashBucket = {
  warehouseId: string;
  skuCount: number;
  onHandQty: number;
  reservedQty: number;
  availableQty: number;
  stockValue: number;
  lowStockSkus: number;
};

export function summarizeWarehouseStock(
  rows: {
    warehouseId: string;
    quantity: number;
    reservedQty: number;
    avgCost?: number;
    reorderPoint?: number;
  }[],
): Omit<WarehouseDashBucket, 'warehouseId'> {
  let onHandQty = 0;
  let reservedQty = 0;
  let stockValue = 0;
  let lowStockSkus = 0;
  const skus = new Set<string>();

  for (const r of rows) {
    onHandQty += r.quantity;
    reservedQty += r.reservedQty;
    stockValue += r.quantity * (r.avgCost ?? 0);
    if (r.quantity <= (r.reorderPoint ?? 5)) lowStockSkus += 1;
  }

  return {
    skuCount: rows.length,
    onHandQty,
    reservedQty,
    availableQty: Math.max(0, onHandQty - reservedQty),
    stockValue: Math.round(stockValue * 100) / 100,
    lowStockSkus,
  };
}

export function aggregateBranchStockFromWarehouses(
  rows: { variantId: string; quantity: number; reservedQty: number }[],
): Map<string, { quantity: number; reservedQty: number; available: number }> {
  const map = new Map<string, { quantity: number; reservedQty: number; available: number }>();
  for (const r of rows) {
    const cur = map.get(r.variantId) ?? { quantity: 0, reservedQty: 0, available: 0 };
    cur.quantity += r.quantity;
    cur.reservedQty += r.reservedQty;
    cur.available = Math.max(0, cur.quantity - cur.reservedQty);
    map.set(r.variantId, cur);
  }
  return map;
}
