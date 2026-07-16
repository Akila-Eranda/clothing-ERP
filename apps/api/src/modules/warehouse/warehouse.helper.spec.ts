import {
  aggregateBranchStockFromWarehouses,
  applyWarehouseMovement,
  assertDistinctWarehouses,
  availableQty,
  planWarehouseMovement,
  summarizeWarehouseStock,
} from './warehouse.helper';

describe('Phase 10 Warehouse — multi-warehouse movement', () => {
  describe('planWarehouseMovement', () => {
    it('plans a valid transfer when source has availability', () => {
      const plan = planWarehouseMovement(
        { warehouseId: 'wh-a', variantId: 'v1', quantity: 20, reservedQty: 2 },
        'wh-b',
        'v1',
        5,
      );
      expect(plan).toMatchObject({
        fromWarehouseId: 'wh-a',
        toWarehouseId: 'wh-b',
        quantity: 5,
        available: 18,
      });
    });

    it('rejects same-warehouse transfer', () => {
      expect(() =>
        planWarehouseMovement(
          { warehouseId: 'wh-a', variantId: 'v1', quantity: 10, reservedQty: 0 },
          'wh-a',
          'v1',
          1,
        ),
      ).toThrow(/same warehouse/i);
    });

    it('rejects oversell from reserved stock', () => {
      expect(() =>
        planWarehouseMovement(
          { warehouseId: 'wh-a', variantId: 'v1', quantity: 10, reservedQty: 8 },
          'wh-b',
          'v1',
          3,
        ),
      ).toThrow(/Insufficient warehouse stock: 2 available, 3 requested/);
    });

    it('rejects missing source row', () => {
      expect(() => planWarehouseMovement(null, 'wh-b', 'v1', 1)).toThrow(/no stock/i);
    });
  });

  describe('applyWarehouseMovement', () => {
    it('moves quantity between warehouses accurately', () => {
      expect(applyWarehouseMovement(50, 10, 15)).toEqual({ fromAfter: 35, toAfter: 25 });
    });

    it('rejects movement that would go negative', () => {
      expect(() => applyWarehouseMovement(4, 0, 5)).toThrow(/Insufficient quantity/);
    });
  });

  describe('assertDistinctWarehouses / availableQty', () => {
    it('computes available qty', () => {
      expect(availableQty({ quantity: 12, reservedQty: 3 })).toBe(9);
      expect(availableQty({ quantity: 2, reservedQty: 5 })).toBe(0);
    });

    it('requires both warehouse ids', () => {
      expect(() => assertDistinctWarehouses('', 'wh-b')).toThrow(/required/i);
    });
  });

  describe('dashboard aggregation', () => {
    it('summarizes warehouse stock value and low-stock SKUs', () => {
      const summary = summarizeWarehouseStock([
        { warehouseId: 'wh-a', quantity: 10, reservedQty: 1, avgCost: 100, reorderPoint: 5 },
        { warehouseId: 'wh-a', quantity: 2, reservedQty: 0, avgCost: 50, reorderPoint: 5 },
      ]);
      expect(summary.skuCount).toBe(2);
      expect(summary.onHandQty).toBe(12);
      expect(summary.availableQty).toBe(11);
      expect(summary.stockValue).toBe(1100);
      expect(summary.lowStockSkus).toBe(1);
    });

    it('aggregates multi-warehouse stock per variant for branch view', () => {
      const map = aggregateBranchStockFromWarehouses([
        { variantId: 'v1', quantity: 5, reservedQty: 1 },
        { variantId: 'v1', quantity: 7, reservedQty: 0 },
        { variantId: 'v2', quantity: 3, reservedQty: 0 },
      ]);
      expect(map.get('v1')).toEqual({ quantity: 12, reservedQty: 1, available: 11 });
      expect(map.get('v2')).toEqual({ quantity: 3, reservedQty: 0, available: 3 });
    });
  });
});
