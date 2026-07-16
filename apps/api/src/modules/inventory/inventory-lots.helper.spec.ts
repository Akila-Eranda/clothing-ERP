import {
  allocateFromLots,
  normalizeLotStrategy,
  reconcileLotTotals,
  type LotLike,
} from './inventory-lots.helper';

describe('Inventory lot foundation', () => {
  const d = (iso: string) => new Date(iso);

  const lots: LotLike[] = [
    {
      id: 'lot-old-exp-late',
      quantity: 10,
      reservedQty: 0,
      batchNumber: 'B1',
      expiryDate: d('2026-12-01'),
      manufactureDate: d('2026-01-01'),
      receivedAt: d('2026-01-10'),
    },
    {
      id: 'lot-new-exp-soon',
      quantity: 5,
      reservedQty: 1,
      batchNumber: 'B2',
      expiryDate: d('2026-08-01'),
      manufactureDate: d('2026-02-01'),
      receivedAt: d('2026-02-10'),
    },
    {
      id: 'lot-no-expiry',
      quantity: 8,
      reservedQty: 0,
      batchNumber: 'B3',
      expiryDate: null,
      manufactureDate: d('2025-12-01'),
      receivedAt: d('2025-12-15'),
    },
  ];

  describe('allocateFromLots (batch quantity accuracy)', () => {
    it('respects reserved qty when allocating', () => {
      // B2 has 5 on hand, 1 reserved → 4 available
      const orderedFefo = [lots[1], lots[0], lots[2]];
      const plan = allocateFromLots(orderedFefo, 4);
      expect(plan).toEqual([
        expect.objectContaining({ lotId: 'lot-new-exp-soon', quantity: 4, batchNumber: 'B2' }),
      ]);
    });

    it('splits across multiple lots for large draws', () => {
      const orderedFefo = [lots[1], lots[0], lots[2]]; // expiry soon first
      const plan = allocateFromLots(orderedFefo, 7);
      expect(plan).toEqual([
        expect.objectContaining({ lotId: 'lot-new-exp-soon', quantity: 4 }),
        expect.objectContaining({ lotId: 'lot-old-exp-late', quantity: 3 }),
      ]);
      expect(plan.reduce((s, a) => s + a.quantity, 0)).toBe(7);
    });

    it('FIFO order consumes oldest receipt first', () => {
      const orderedFifo = [lots[2], lots[0], lots[1]]; // receivedAt ascending
      const plan = allocateFromLots(orderedFifo, 6);
      expect(plan[0].lotId).toBe('lot-no-expiry');
      expect(plan[0].quantity).toBe(6);
    });

    it('FEFO order consumes earliest expiry first', () => {
      const orderedFefo = [lots[1], lots[0], lots[2]];
      const plan = allocateFromLots(orderedFefo, 3);
      expect(plan[0].lotId).toBe('lot-new-exp-soon');
      expect(plan[0].expiryDate).toEqual(d('2026-08-01'));
    });

    it('returns partial when lots cannot fully cover (legacy unlotted remainder)', () => {
      const plan = allocateFromLots([lots[1]], 10); // only 4 available
      expect(plan).toHaveLength(1);
      expect(plan[0].quantity).toBe(4);
    });

    it('returns empty for zero/negative qty', () => {
      expect(allocateFromLots(lots, 0)).toEqual([]);
      expect(allocateFromLots(lots, -1)).toEqual([]);
    });
  });

  describe('normalizeLotStrategy', () => {
    it('defaults to FEFO', () => {
      expect(normalizeLotStrategy(undefined)).toBe('FEFO');
      expect(normalizeLotStrategy('')).toBe('FEFO');
      expect(normalizeLotStrategy('fefo')).toBe('FEFO');
    });

    it('accepts FIFO', () => {
      expect(normalizeLotStrategy('FIFO')).toBe('FIFO');
      expect(normalizeLotStrategy('fifo')).toBe('FIFO');
    });
  });

  describe('reconcileLotTotals (inventory reconciliation)', () => {
    it('marks MATCHED when inventory equals lot sum', () => {
      const rows = reconcileLotTotals(
        [{ variantId: 'v1', branchId: 'b1', quantity: 20, reservedQty: 2 }],
        [
          { variantId: 'v1', branchId: 'b1', quantity: 12, reservedQty: 1 },
          { variantId: 'v1', branchId: 'b1', quantity: 8, reservedQty: 1 },
        ],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        inventoryQty: 20,
        lotQty: 20,
        delta: 0,
        status: 'MATCHED',
        reservedLots: 2,
      });
    });

    it('marks LOT_SHORT when inventory has more than lots (unlotted stock)', () => {
      const rows = reconcileLotTotals(
        [{ variantId: 'v1', branchId: 'b1', quantity: 30, reservedQty: 0 }],
        [{ variantId: 'v1', branchId: 'b1', quantity: 25, reservedQty: 0 }],
      );
      expect(rows[0].status).toBe('LOT_SHORT');
      expect(rows[0].delta).toBe(5);
    });

    it('marks LOT_OVER when lots exceed inventory (integrity issue)', () => {
      const rows = reconcileLotTotals(
        [{ variantId: 'v1', branchId: 'b1', quantity: 10, reservedQty: 0 }],
        [{ variantId: 'v1', branchId: 'b1', quantity: 15, reservedQty: 0 }],
      );
      expect(rows[0].status).toBe('LOT_OVER');
      expect(rows[0].delta).toBe(-5);
    });

    it('marks NO_LOTS when inventory exists without lot rows', () => {
      const rows = reconcileLotTotals(
        [{ variantId: 'v1', branchId: 'b1', quantity: 7, reservedQty: 0 }],
        [],
      );
      expect(rows[0].status).toBe('NO_LOTS');
      expect(rows[0].delta).toBe(7);
    });

    it('marks MATCHED for zero inventory with no lots', () => {
      const rows = reconcileLotTotals(
        [{ variantId: 'v1', branchId: 'b1', quantity: 0, reservedQty: 0 }],
        [],
      );
      expect(rows[0].status).toBe('MATCHED');
    });
  });
});
