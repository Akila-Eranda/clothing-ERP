import { BadRequestException } from '@nestjs/common';
import { InventoryReservationStatus, Prisma, StockMovementType } from '@prisma/client';

export type LotClient = Prisma.TransactionClient;

/** FEFO = earliest expiry first; FIFO = earliest receipt first */
export type LotAllocationStrategy = 'FEFO' | 'FIFO';

export type LotAllocation = {
  lotId: string;
  quantity: number;
  batchNumber: string | null;
  expiryDate: Date | null;
  manufactureDate?: Date | null;
};

export type LotLike = {
  id: string;
  quantity: number;
  reservedQty: number;
  batchNumber: string | null;
  expiryDate: Date | null;
  manufactureDate?: Date | null;
  receivedAt?: Date;
};

export type ReconcileRow = {
  variantId: string;
  branchId: string;
  inventoryQty: number;
  lotQty: number;
  reservedInventory: number;
  reservedLots: number;
  delta: number;
  status: 'MATCHED' | 'LOT_SHORT' | 'LOT_OVER' | 'NO_LOTS';
};

const INBOUND: StockMovementType[] = [
  StockMovementType.PURCHASE,
  StockMovementType.RETURN,
  StockMovementType.TRANSFER_IN,
  StockMovementType.OPENING_STOCK,
];

const OUTBOUND: StockMovementType[] = [
  StockMovementType.SALE,
  StockMovementType.TRANSFER_OUT,
  StockMovementType.DAMAGE,
];

/** FEFO: earliest expiry first; null expiry last; then oldest receipt. */
export function fefoOrderBy(): Prisma.InventoryLotOrderByWithRelationInput[] {
  return [
    { expiryDate: { sort: 'asc', nulls: 'last' } },
    { receivedAt: 'asc' },
    { id: 'asc' },
  ];
}

/** FIFO: oldest received lot first (ignores expiry order). */
export function fifoOrderBy(): Prisma.InventoryLotOrderByWithRelationInput[] {
  return [
    { receivedAt: 'asc' },
    { id: 'asc' },
  ];
}

export function lotOrderBy(strategy: LotAllocationStrategy = 'FEFO') {
  return strategy === 'FIFO' ? fifoOrderBy() : fefoOrderBy();
}

export function normalizeLotStrategy(value: unknown): LotAllocationStrategy {
  const v = String(value ?? '').toUpperCase();
  return v === 'FIFO' ? 'FIFO' : 'FEFO';
}

/** Tenant setting: block POS/sale allocation from expired lots (default ON). */
export function normalizeBlockExpired(value: unknown): boolean {
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return true;
}

/** Calendar-day start in local time — expiry is sellable through that day. */
export function startOfLocalDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

/** Whole days from today until expiry (negative = already past expiry day). */
export function daysUntilExpiry(expiryDate: Date, now = new Date()): number {
  const exp = startOfLocalDay(expiryDate);
  const today = startOfLocalDay(now);
  return Math.floor((exp.getTime() - today.getTime()) / 86400000);
}

/** Null expiry = no shelf-life constraint (always sellable). */
export function isLotExpired(expiryDate: Date | null | undefined, now = new Date()): boolean {
  if (!expiryDate) return false;
  return daysUntilExpiry(expiryDate, now) < 0;
}

export function filterSellableLots<T extends { expiryDate: Date | null }>(
  lots: T[],
  blockExpired = true,
  now = new Date(),
): T[] {
  if (!blockExpired) return lots;
  return lots.filter((lot) => !isLotExpired(lot.expiryDate, now));
}

export function availableQtyOnLots(lots: LotLike[]): number {
  return lots.reduce((sum, lot) => sum + Math.max(0, lot.quantity - lot.reservedQty), 0);
}

/**
 * Pure allocator — used by FEFO/FIFO and unit tests.
 * Does not mutate; returns planned draws from lots in given order.
 */
export function allocateFromLots(
  lots: LotLike[],
  quantity: number,
): LotAllocation[] {
  if (quantity <= 0 || !lots.length) return [];

  const allocations: LotAllocation[] = [];
  let remaining = quantity;

  for (const lot of lots) {
    if (remaining <= 0) break;
    const available = Math.max(0, lot.quantity - lot.reservedQty);
    if (available <= 0) continue;
    const take = Math.min(available, remaining);
    allocations.push({
      lotId: lot.id,
      quantity: take,
      batchNumber: lot.batchNumber,
      expiryDate: lot.expiryDate,
      manufactureDate: lot.manufactureDate ?? null,
    });
    remaining -= take;
  }

  return allocations;
}

/** Pure reconciliation: inventory on-hand vs sum of lot quantities. */
export function reconcileLotTotals(
  inventoryRows: { variantId: string; branchId: string; quantity: number; reservedQty: number }[],
  lotRows: { variantId: string; branchId: string; quantity: number; reservedQty: number }[],
): ReconcileRow[] {
  const lotMap = new Map<string, { qty: number; reserved: number }>();
  for (const lot of lotRows) {
    const key = `${lot.branchId}:${lot.variantId}`;
    const cur = lotMap.get(key) ?? { qty: 0, reserved: 0 };
    cur.qty += lot.quantity;
    cur.reserved += lot.reservedQty;
    lotMap.set(key, cur);
  }

  return inventoryRows.map((inv) => {
    const key = `${inv.branchId}:${inv.variantId}`;
    const lots = lotMap.get(key);
    if (!lots) {
      return {
        variantId: inv.variantId,
        branchId: inv.branchId,
        inventoryQty: inv.quantity,
        lotQty: 0,
        reservedInventory: inv.reservedQty,
        reservedLots: 0,
        delta: inv.quantity,
        status: inv.quantity === 0 ? 'MATCHED' : 'NO_LOTS',
      };
    }
    const delta = inv.quantity - lots.qty;
    let status: ReconcileRow['status'] = 'MATCHED';
    if (delta > 0) status = 'LOT_SHORT';
    else if (delta < 0) status = 'LOT_OVER';
    return {
      variantId: inv.variantId,
      branchId: inv.branchId,
      inventoryQty: inv.quantity,
      lotQty: lots.qty,
      reservedInventory: inv.reservedQty,
      reservedLots: lots.reserved,
      delta,
      status,
    };
  });
}

export type LotPlanOptions = {
  /** When true, expired lots are excluded from allocation (POS Block Expired). */
  blockExpired?: boolean;
  now?: Date;
};

export async function listActiveLots(
  client: LotClient,
  tenantId: string,
  branchId: string,
  variantId: string,
  strategy: LotAllocationStrategy = 'FEFO',
  options: LotPlanOptions = {},
) {
  const lots = await client.inventoryLot.findMany({
    where: {
      tenantId,
      branchId,
      variantId,
      isActive: true,
      quantity: { gt: 0 },
    },
    orderBy: lotOrderBy(strategy),
  });
  return filterSellableLots(lots, options.blockExpired === true, options.now);
}

export async function availableOnLots(
  client: LotClient,
  tenantId: string,
  branchId: string,
  variantId: string,
  options: LotPlanOptions = {},
) {
  const lots = await listActiveLots(client, tenantId, branchId, variantId, 'FEFO', options);
  return availableQtyOnLots(lots);
}

/**
 * Allocate qty across lots using FEFO or FIFO (or a specific lot).
 * Does not mutate — caller applies updates.
 * When `blockExpired` is true, expired lots cannot be sold (POS Block Expired).
 */
export async function planLotAllocation(
  client: LotClient,
  tenantId: string,
  branchId: string,
  variantId: string,
  quantity: number,
  preferredLotId?: string,
  strategy: LotAllocationStrategy = 'FEFO',
  options: LotPlanOptions = {},
): Promise<LotAllocation[]> {
  if (quantity <= 0) return [];
  const blockExpired = options.blockExpired === true;
  const now = options.now ?? new Date();

  if (preferredLotId) {
    const lot = await client.inventoryLot.findFirst({
      where: { id: preferredLotId, tenantId, branchId, variantId, isActive: true },
    });
    if (!lot) throw new BadRequestException('Lot not found for this branch/variant');
    if (blockExpired && isLotExpired(lot.expiryDate, now)) {
      const label = lot.batchNumber || lot.id.slice(0, 8);
      throw new BadRequestException(
        `Cannot sell expired lot ${label}: expiry ${lot.expiryDate?.toISOString().slice(0, 10) ?? 'unknown'}`,
      );
    }
    const available = Math.max(0, lot.quantity - lot.reservedQty);
    if (available < quantity) {
      throw new BadRequestException(
        `Insufficient quantity on lot ${lot.batchNumber || lot.id.slice(0, 8)}: ${available} available, ${quantity} requested`,
      );
    }
    return [{
      lotId: lot.id,
      quantity,
      batchNumber: lot.batchNumber,
      expiryDate: lot.expiryDate,
      manufactureDate: lot.manufactureDate,
    }];
  }

  const allLots = await client.inventoryLot.findMany({
    where: {
      tenantId,
      branchId,
      variantId,
      isActive: true,
      quantity: { gt: 0 },
    },
    orderBy: lotOrderBy(strategy),
  });
  const lots = filterSellableLots(allLots, blockExpired, now);
  if (!lots.length) {
    if (blockExpired && allLots.some((l) => isLotExpired(l.expiryDate, now))) {
      throw new BadRequestException(
        'Insufficient non-expired stock: available lots are past expiry (POS Block Expired)',
      );
    }
    return [];
  }

  // Partial coverage allowed when legacy unlotted stock still exists on Inventory.quantity.
  const plan = allocateFromLots(lots, quantity);
  if (
    blockExpired
    && plan.reduce((s, a) => s + a.quantity, 0) < quantity
    && availableQtyOnLots(allLots) >= quantity
  ) {
    throw new BadRequestException(
      `Insufficient non-expired stock: ${availableQtyOnLots(lots)} sellable, ${quantity} requested`,
    );
  }
  return plan;
}

/** @deprecated Prefer planLotAllocation — kept for call-site compatibility */
export async function planFefoAllocation(
  client: LotClient,
  tenantId: string,
  branchId: string,
  variantId: string,
  quantity: number,
  preferredLotId?: string,
): Promise<LotAllocation[]> {
  return planLotAllocation(client, tenantId, branchId, variantId, quantity, preferredLotId, 'FEFO', {
    blockExpired: true,
  });
}

export async function applyOutboundLots(
  client: LotClient,
  allocations: LotAllocation[],
) {
  for (const a of allocations) {
    const lot = await client.inventoryLot.findUnique({ where: { id: a.lotId } });
    if (!lot) throw new BadRequestException(`Lot ${a.lotId} not found`);
    const nextQty = lot.quantity - a.quantity;
    if (nextQty < 0) {
      throw new BadRequestException(`Lot ${lot.batchNumber || lot.id} would go negative`);
    }
    await client.inventoryLot.update({
      where: { id: a.lotId },
      data: {
        quantity: nextQty,
        isActive: nextQty > 0 || lot.reservedQty > 0,
      },
    });
  }
}

export async function addToLot(
  client: LotClient,
  params: {
    tenantId: string;
    branchId: string;
    variantId: string;
    quantity: number;
    batchNumber?: string | null;
    expiryDate?: Date | null;
    manufactureDate?: Date | null;
    unitCost?: number;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
    lotId?: string;
  },
) {
  const {
    tenantId, branchId, variantId, quantity,
    batchNumber, expiryDate, manufactureDate, unitCost,
    referenceType, referenceId, notes, lotId,
  } = params;

  if (quantity <= 0) return null;

  if (lotId) {
    return client.inventoryLot.update({
      where: { id: lotId },
      data: {
        quantity: { increment: quantity },
        isActive: true,
        ...(unitCost != null ? { unitCost } : {}),
        ...(manufactureDate ? { manufactureDate } : {}),
      },
    });
  }

  const existing = await client.inventoryLot.findFirst({
    where: {
      tenantId,
      branchId,
      variantId,
      isActive: true,
      batchNumber: batchNumber ?? null,
      ...(expiryDate
        ? {
            expiryDate: {
              gte: new Date(new Date(expiryDate).setHours(0, 0, 0, 0)),
              lt: new Date(new Date(expiryDate).setHours(24, 0, 0, 0)),
            },
          }
        : { expiryDate: null }),
    },
    orderBy: { receivedAt: 'desc' },
  });

  if (existing) {
    const nextCost = unitCost != null && unitCost > 0
      ? ((existing.unitCost * existing.quantity) + (unitCost * quantity)) / (existing.quantity + quantity)
      : existing.unitCost;
    return client.inventoryLot.update({
      where: { id: existing.id },
      data: {
        quantity: { increment: quantity },
        unitCost: nextCost,
        isActive: true,
        ...(manufactureDate && !existing.manufactureDate ? { manufactureDate } : {}),
      },
    });
  }

  return client.inventoryLot.create({
    data: {
      tenantId,
      branchId,
      variantId,
      batchNumber: batchNumber ?? null,
      expiryDate: expiryDate ?? null,
      manufactureDate: manufactureDate ?? null,
      quantity,
      unitCost: unitCost ?? 0,
      referenceType,
      referenceId,
      notes,
      isActive: true,
    },
  });
}

export async function reserveLots(
  client: LotClient,
  tenantId: string,
  branchId: string,
  variantId: string,
  quantity: number,
  sourceType: string,
  sourceId: string,
  strategy: LotAllocationStrategy = 'FEFO',
  options: LotPlanOptions = { blockExpired: true },
) {
  const allocations = await planLotAllocation(
    client, tenantId, branchId, variantId, quantity, undefined, strategy, options,
  );
  if (!allocations.length) return [];

  for (const a of allocations) {
    await client.inventoryLot.update({
      where: { id: a.lotId },
      data: { reservedQty: { increment: a.quantity } },
    });
    await client.inventoryLotReservation.create({
      data: {
        tenantId,
        lotId: a.lotId,
        quantity: a.quantity,
        sourceType,
        sourceId,
      },
    });
  }
  return allocations;
}

/** @deprecated Prefer reserveLots */
export async function reserveLotsFefo(
  client: LotClient,
  tenantId: string,
  branchId: string,
  variantId: string,
  quantity: number,
  sourceType: string,
  sourceId: string,
) {
  return reserveLots(client, tenantId, branchId, variantId, quantity, sourceType, sourceId, 'FEFO');
}

export async function releaseLotReservations(
  client: LotClient,
  tenantId: string,
  sourceType: string,
  sourceId: string,
  consume: boolean,
) {
  const rows = await client.inventoryLotReservation.findMany({
    where: {
      tenantId,
      sourceType,
      sourceId,
      status: InventoryReservationStatus.ACTIVE,
    },
  });

  // Mirror InventoryReservation: free reservedQty only. Quantity is deducted later by adjustStock.
  for (const r of rows) {
    const lot = await client.inventoryLot.findUnique({ where: { id: r.lotId } });
    if (lot) {
      await client.inventoryLot.update({
        where: { id: r.lotId },
        data: { reservedQty: Math.max(0, lot.reservedQty - r.quantity) },
      });
    }
    await client.inventoryLotReservation.update({
      where: { id: r.id },
      data: {
        status: consume ? InventoryReservationStatus.CONSUMED : InventoryReservationStatus.RELEASED,
        releasedAt: new Date(),
      },
    });
  }

  return rows;
}

export function isInboundMovement(type: StockMovementType) {
  return INBOUND.includes(type);
}

export function isOutboundMovement(type: StockMovementType) {
  return OUTBOUND.includes(type);
}

export type ExpiryBucket = 'expired' | '7d' | '30d' | '90d' | 'ok';

export function classifyExpiry(expiryDate: Date | null, now = new Date()): ExpiryBucket | null {
  if (!expiryDate) return null;
  const days = daysUntilExpiry(expiryDate, now);
  if (days < 0) return 'expired';
  if (days <= 7) return '7d';
  if (days <= 30) return '30d';
  if (days <= 90) return '90d';
  return 'ok';
}

/** Report status labels for batch expiry reports. */
export function expiryReportStatus(
  expiryDate: Date | null,
  now = new Date(),
): 'NO_EXPIRY' | 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'WATCH' {
  if (!expiryDate) return 'NO_EXPIRY';
  const days = daysUntilExpiry(expiryDate, now);
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'CRITICAL';
  if (days <= 30) return 'WARNING';
  return 'WATCH';
}
