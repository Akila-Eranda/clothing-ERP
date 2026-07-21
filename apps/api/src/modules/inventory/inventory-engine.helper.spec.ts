import { StockMovementType } from '@prisma/client';
import {
  assertSufficientStock,
  computeStockDelta,
  isDeductionMovement,
} from './inventory-engine.helper';

describe('Inventory Engine helpers', () => {
  it('marks SALE / TRANSFER_OUT / DAMAGE as deductions', () => {
    expect(isDeductionMovement(StockMovementType.SALE)).toBe(true);
    expect(isDeductionMovement(StockMovementType.TRANSFER_OUT)).toBe(true);
    expect(isDeductionMovement(StockMovementType.DAMAGE)).toBe(true);
    expect(isDeductionMovement(StockMovementType.PURCHASE)).toBe(false);
    expect(isDeductionMovement(StockMovementType.RETURN)).toBe(false);
  });

  it('computes SALE deduction', () => {
    const r = computeStockDelta({
      movementType: StockMovementType.SALE,
      quantity: 3,
      currentQty: 10,
    });
    expect(r.delta).toBe(-3);
    expect(r.newQty).toBe(7);
    expect(r.finalQty).toBe(7);
  });

  it('computes PURCHASE inbound', () => {
    const r = computeStockDelta({
      movementType: StockMovementType.PURCHASE,
      quantity: 5,
      currentQty: 2,
    });
    expect(r.delta).toBe(5);
    expect(r.newQty).toBe(7);
  });

  it('computes ADJUSTMENT as absolute qty', () => {
    const r = computeStockDelta({
      movementType: StockMovementType.ADJUSTMENT,
      quantity: 40,
      currentQty: 10,
    });
    expect(r.newQty).toBe(40);
    expect(r.delta).toBe(30);
  });

  it('DAMAGE increments damaged and reduces on-hand', () => {
    const r = computeStockDelta({
      movementType: StockMovementType.DAMAGE,
      quantity: 2,
      currentQty: 10,
      currentDamaged: 1,
    });
    expect(r.newQty).toBe(8);
    expect(r.newDamaged).toBe(3);
  });

  it('RETURN increments returned and on-hand', () => {
    const r = computeStockDelta({
      movementType: StockMovementType.RETURN,
      quantity: 2,
      currentQty: 10,
      currentReturned: 1,
    });
    expect(r.newQty).toBe(12);
    expect(r.newReturned).toBe(3);
  });

  it('blocks insufficient stock unless allowNegativeSale', () => {
    const input = {
      movementType: StockMovementType.SALE,
      quantity: 5,
      currentQty: 2,
    };
    const r = computeStockDelta(input);
    expect(() => assertSufficientStock(r, input)).toThrow(/Insufficient stock/);
    expect(() =>
      assertSufficientStock(r, { ...input, allowNegativeSale: true }),
    ).not.toThrow();
  });
});
