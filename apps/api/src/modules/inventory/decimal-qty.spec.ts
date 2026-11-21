import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StockMovementType } from '@prisma/client';
import { SaleItemDto, ReturnItemDto as PosReturnItemDto } from '@/modules/pos/pos.module';
import { ReturnItemDto, ExchangeItemDto } from '@/modules/returns/returns.module';
import { PurchaseItemDto, ReceiveItemDto, QuickGrnLineDto } from '@/modules/suppliers/suppliers.module';
import { WarehouseTransferItemDto } from '@/modules/warehouse/warehouse.module';
import { TransferItemDto, LotAdjustDto } from './inventory.dto';
import { assertSufficientStock, computeStockDelta, roundQty } from './inventory-engine.helper';
import { allocateFromLots, availableQtyOnLots, reconcileLotTotals } from './inventory-lots.helper';
import { applyPartialReceive } from '@/modules/suppliers/procurement.helper';

async function errorsFor<T extends object>(cls: new () => T, plain: Record<string, unknown>) {
  const errors = await validate(plainToInstance(cls, plain) as object, { whitelist: true });
  return errors.map((e) => e.property);
}

const lot = (id: string, quantity: number, reservedQty = 0) => ({
  id,
  quantity,
  reservedQty,
  batchNumber: id,
  expiryDate: null,
});

describe('Decimal quantity DTOs (kg / L goods)', () => {
  const sale = { productName: 'Rice', variantName: '1kg', sku: 'R1', unitPrice: 250, costPrice: 200 };

  it('accepts fractional quantities on every stock-moving DTO', async () => {
    expect(await errorsFor(SaleItemDto, { ...sale, variantId: 'v', quantity: 0.375 })).toEqual([]);
    expect(
      await errorsFor(PosReturnItemDto, { ...sale, variantId: 'v', quantity: 0.25 }),
    ).toEqual([]);
    expect(await errorsFor(ReturnItemDto, { variantId: 'v', quantity: 0.25, unitPrice: 250 })).toEqual([]);
    expect(await errorsFor(ExchangeItemDto, { variantId: 'v', quantity: 1.5, unitPrice: 250 })).toEqual([]);
    expect(
      await errorsFor(PurchaseItemDto, {
        variantId: 'v', productName: 'Rice', variantName: 'kg', sku: 'R1',
        orderedQty: 25.5, freeQty: 0.5, unitCost: 200,
      }),
    ).toEqual([]);
    expect(await errorsFor(ReceiveItemDto, { itemId: 'i', receivedQty: 12.3, rejectedQty: 0.2 })).toEqual([]);
    expect(await errorsFor(QuickGrnLineDto, { variantId: 'v', quantity: 2.75, unitCost: 200 })).toEqual([]);
    expect(await errorsFor(TransferItemDto, { variantId: 'v', requestedQty: 3.25 })).toEqual([]);
    expect(await errorsFor(WarehouseTransferItemDto, { variantId: 'v', requestedQty: 3.25 })).toEqual([]);
    expect(
      await errorsFor(LotAdjustDto, { lotId: 'l', quantity: 4.5, movementType: StockMovementType.ADJUSTMENT }),
    ).toEqual([]);
  });

  it('still rejects zero / negative where a minimum applies', async () => {
    expect(await errorsFor(SaleItemDto, { ...sale, variantId: 'v', quantity: 0 })).toContain('quantity');
    expect(await errorsFor(ReturnItemDto, { variantId: 'v', quantity: 0, unitPrice: 1 })).toContain('quantity');
    expect(await errorsFor(TransferItemDto, { variantId: 'v', requestedQty: -1 })).toContain('requestedQty');
    expect(await errorsFor(ReceiveItemDto, { itemId: 'i', receivedQty: -0.5 })).toContain('receivedQty');
    expect(await errorsFor(QuickGrnLineDto, { variantId: 'v', quantity: 'abc', unitCost: 1 })).toContain('quantity');
  });
});

describe('Float-safe stock math', () => {
  it('rounds to gram precision', () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
    expect(roundQty(0.3 - 0.1 - 0.2)).toBe(0);
    expect(roundQty(0.37549)).toBe(0.375);
    expect(roundQty(-0.25)).toBe(-0.25);
  });

  it('does not report a false shortfall when selling the last grams', () => {
    const r = computeStockDelta({ movementType: StockMovementType.SALE, quantity: 0.2, currentQty: 0.3 - 0.1 });
    expect(r.newQty).toBe(0);
    expect(() =>
      assertSufficientStock(r, { movementType: StockMovementType.SALE, quantity: 0.2, currentQty: 0.3 - 0.1 }),
    ).not.toThrow();
  });

  it('still blocks a real shortfall', () => {
    const input = { movementType: StockMovementType.SALE, quantity: 0.301, currentQty: 0.3 };
    expect(() => assertSufficientStock(computeStockDelta(input), input)).toThrow(/Insufficient stock/);
  });

  it('allocates 0.3 kg exactly across 0.1 + 0.2 lots without touching a third lot', () => {
    const plan = allocateFromLots([lot('a', 0.1), lot('b', 0.2), lot('c', 5)], 0.3);
    expect(plan.map((p) => [p.lotId, p.quantity])).toEqual([['a', 0.1], ['b', 0.2]]);
  });

  it('splits a decimal sale across lots FEFO-order and respects reservations', () => {
    const plan = allocateFromLots([lot('a', 0.3), lot('b', 2, 0.5)], 0.5);
    expect(plan.map((p) => [p.lotId, p.quantity])).toEqual([['a', 0.3], ['b', 0.2]]);
    expect(availableQtyOnLots([lot('a', 0.1), lot('b', 0.2)])).toBe(0.3);
  });

  it('reconciles lots that sum with float noise as MATCHED', () => {
    const [row] = reconcileLotTotals(
      [{ variantId: 'v', branchId: 'b', quantity: 0.3, reservedQty: 0 }],
      [
        { variantId: 'v', branchId: 'b', quantity: 0.1, reservedQty: 0 },
        { variantId: 'v', branchId: 'b', quantity: 0.2, reservedQty: 0 },
      ],
    );
    expect(row.status).toBe('MATCHED');
    expect(row.delta).toBe(0);
  });

  it('marks a PO fully received after decimal partial receipts', () => {
    const first = applyPartialReceive([{ orderedQty: 12.3, receivedQty: 0, thisReceive: 12.1 }]);
    expect(first.status).toBe('PARTIALLY_RECEIVED');
    const second = applyPartialReceive([{ orderedQty: 12.3, receivedQty: 12.1, thisReceive: 0.2 }]);
    expect(second.status).toBe('RECEIVED');
    expect(second.nextReceived).toEqual([12.3]);
    expect(() => applyPartialReceive([{ orderedQty: 12.3, receivedQty: 12.1, thisReceive: 0.3 }])).toThrow(
      /beyond ordered/,
    );
  });
});
