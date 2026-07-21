/** Inventory Engine — pure stock movement math (no Nest / Prisma). */

import { StockMovementType } from '@prisma/client';

const DEDUCTION_TYPES: StockMovementType[] = [
  StockMovementType.SALE,
  StockMovementType.TRANSFER_OUT,
  StockMovementType.DAMAGE,
];

export type StockDeltaInput = {
  movementType: StockMovementType;
  /** Absolute for ADJUSTMENT; absolute magnitude for other movements. */
  quantity: number;
  currentQty: number;
  currentDamaged?: number;
  currentReturned?: number;
  allowNegativeSale?: boolean;
};

export type StockDeltaResult = {
  delta: number;
  newQty: number;
  newDamaged: number;
  newReturned: number;
  isDeduction: boolean;
  /** Final on-hand qty after allow-negative / clamp rules. */
  finalQty: number;
};

export function isDeductionMovement(type: StockMovementType): boolean {
  return DEDUCTION_TYPES.includes(type);
}

/**
 * Compute on-hand / damaged / returned quantities for a single adjustStock call.
 * Mirrors InventoryService.adjustStock business rules (engine source of truth for math).
 */
export function computeStockDelta(input: StockDeltaInput): StockDeltaResult {
  const qty = Math.abs(input.quantity);
  const currentDamaged = input.currentDamaged ?? 0;
  const currentReturned = input.currentReturned ?? 0;
  const isDeduction = isDeductionMovement(input.movementType);

  let delta = isDeduction ? -qty : qty;
  let newQty =
    input.movementType === StockMovementType.ADJUSTMENT
      ? input.quantity
      : input.currentQty + delta;
  let newDamaged = currentDamaged;
  let newReturned = currentReturned;

  if (input.movementType === StockMovementType.DAMAGE) {
    newDamaged = currentDamaged + qty;
    newQty = input.currentQty - qty;
    delta = -qty;
  }
  if (input.movementType === StockMovementType.RETURN) {
    newReturned = currentReturned + qty;
    newQty = input.currentQty + qty;
    delta = qty;
  }
  if (input.movementType === StockMovementType.ADJUSTMENT) {
    delta = newQty - input.currentQty;
  }

  const allowNegSale =
    !!input.allowNegativeSale && input.movementType === StockMovementType.SALE;

  const finalQty = allowNegSale ? newQty : Math.max(0, newQty);

  return {
    delta,
    newQty,
    newDamaged,
    newReturned,
    isDeduction,
    finalQty,
  };
}

export function assertSufficientStock(result: StockDeltaResult, input: StockDeltaInput): void {
  const allowNegSale =
    !!input.allowNegativeSale && input.movementType === StockMovementType.SALE;
  if (
    result.isDeduction &&
    input.movementType !== StockMovementType.ADJUSTMENT &&
    result.newQty < 0 &&
    !allowNegSale
  ) {
    throw new Error(
      `Insufficient stock: ${input.currentQty} on hand, ${Math.abs(input.quantity)} requested for ${input.movementType}`,
    );
  }
}

/** Opening-stock seed row shape (products → Inventory Engine). */
export type OpeningStockSeed = {
  tenantId: string;
  branchId: string;
  warehouseId: string;
  variantId: string;
  quantity: number;
  reorderPoint?: number;
  minStockLevel?: number;
  maxStockLevel?: number;
};
