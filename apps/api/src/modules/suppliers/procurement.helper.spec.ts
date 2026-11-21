import {
  applyInvoicePayment,
  applyPartialReceive,
  canConvertPurchaseRequest,
  canReceiveAgainstPo,
  canEditGrnPricing,
  calculatePoReceiptPayable,
  effectivePoReceiptUnitCost,
  grnRequestMatches,
  isAllowedPurchaseOrderStatusTransition,
  nextDocNumber,
  procurementCycleProgress,
} from './procurement.helper';
import { PurchaseOrderStatus, RoleType } from '@prisma/client';

describe('Procurement Phase 3 foundation', () => {
  describe('partial receiving', () => {
    it('marks PARTIALLY_RECEIVED when some qty remains', () => {
      const r = applyPartialReceive([
        { orderedQty: 10, receivedQty: 0, thisReceive: 4 },
        { orderedQty: 5, receivedQty: 0, thisReceive: 5 },
      ]);
      expect(r.status).toBe('PARTIALLY_RECEIVED');
      expect(r.nextReceived).toEqual([4, 5]);
      expect(r.fullyReceived).toBe(false);
    });

    it('marks RECEIVED when all lines complete', () => {
      const r = applyPartialReceive([
        { orderedQty: 10, receivedQty: 6, thisReceive: 4 },
        { orderedQty: 2, receivedQty: 2, thisReceive: 0 },
      ]);
      expect(r.status).toBe('RECEIVED');
      expect(r.fullyReceived).toBe(true);
    });

    it('rejects over-receive', () => {
      expect(() =>
        applyPartialReceive([{ orderedQty: 3, receivedQty: 2, thisReceive: 2 }]),
      ).toThrow(/beyond ordered/);
    });
  });

  describe('supplier invoice payments', () => {
    it('moves POSTED → PARTIALLY_PAID → PAID', () => {
      const p1 = applyInvoicePayment(1000, 0, 400);
      expect(p1.status).toBe('PARTIALLY_PAID');
      const p2 = applyInvoicePayment(1000, p1.paidAmount, 600);
      expect(p2.status).toBe('PAID');
      expect(p2.paidAmount).toBe(1000);
    });

    describe('PO receipt payable and GRN retry identity', () => {
      it('allocates fixed line discounts proportionally across partial receipts', () => {
        expect(calculatePoReceiptPayable(
          [{ id: 'line-1', orderedQty: 10, receivedQty: 0, unitCost: 100, discount: 20 }],
          [{ itemId: 'line-1', receivedQty: 5 }],
        )).toBe(490);
      });

      it('rejects a retry key when the GRN payload changes', () => {
        const existing = [{
          variantId: 'v1',
          purchaseItemId: 'line-1',
          receivedQty: 2,
          rejectedQty: 0,
          unitCost: 100,
          batchNumber: 'B1',
          expiryDate: new Date('2026-12-01'),
        }];
        const request = [{ ...existing[0], expiryDate: '2026-12-01' }];
        expect(grnRequestMatches(existing, request)).toBe(true);
        expect(grnRequestMatches(existing, [{ ...request[0], receivedQty: 3 }])).toBe(false);
      });

      it('spreads paid cost over paid and free received quantities', () => {
        expect(effectivePoReceiptUnitCost({ orderedQty: 10, receivedQty: 0, unitCost: 100 }, 12)).toBe(83.33);
        expect(effectivePoReceiptUnitCost({ orderedQty: 10, receivedQty: 10, unitCost: 100 }, 2)).toBe(0);
        expect(effectivePoReceiptUnitCost({ orderedQty: 10, receivedQty: 0, unitCost: 100, discount: 20 }, 12)).toBe(81.67);
      });
    });

    it('rejects overpayment', () => {
      expect(() => applyInvoicePayment(100, 80, 30)).toThrow(/exceeds/);
    });
  });

  describe('gates', () => {
    it('blocks receive on draft/pending PO', () => {
      expect(canReceiveAgainstPo('DRAFT')).toBe(false);
      expect(canReceiveAgainstPo('PENDING_APPROVAL')).toBe(false);
      expect(canReceiveAgainstPo('SENT')).toBe(false);
      expect(canReceiveAgainstPo('CONFIRMED')).toBe(true);
      expect(canReceiveAgainstPo('PARTIALLY_RECEIVED')).toBe(true);
      expect(canReceiveAgainstPo('RECEIVED')).toBe(false);
    });

    it('allows convert only when PR approved', () => {
      expect(canConvertPurchaseRequest('APPROVED')).toBe(true);
      expect(canConvertPurchaseRequest('DRAFT')).toBe(false);
    });

    it('allows only workflow-safe PO status transitions', () => {
      expect(isAllowedPurchaseOrderStatusTransition(PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.SENT)).toBe(true);
      expect(isAllowedPurchaseOrderStatusTransition(PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.PENDING_APPROVAL)).toBe(false);
      expect(isAllowedPurchaseOrderStatusTransition(PurchaseOrderStatus.DRAFT, PurchaseOrderStatus.RECEIVED)).toBe(false);
      expect(isAllowedPurchaseOrderStatusTransition(PurchaseOrderStatus.RECEIVED, PurchaseOrderStatus.CLOSED)).toBe(false);
    });

    it('limits GRN pricing edits to finance/inventory managers', () => {
      expect(canEditGrnPricing([RoleType.CASHIER])).toBe(false);
      expect(canEditGrnPricing([RoleType.BRANCH_MANAGER])).toBe(true);
    });
  });

  describe('doc numbers + cycle', () => {
    it('formats sequential document numbers', () => {
      expect(nextDocNumber('GRN', 12, 2026)).toBe('GRN-2026-00012');
    });

    it('tracks complete procurement cycle progress', () => {
      const mid = procurementCycleProgress(['PR_CREATED', 'PR_APPROVED', 'PO_CREATED', 'PO_APPROVED']);
      expect(mid.next).toBe('GRN_POSTED');
      expect(mid.percent).toBe(Math.round((4 / 7) * 100));

      const done = procurementCycleProgress([
        'PR_CREATED', 'PR_APPROVED', 'PO_CREATED', 'PO_APPROVED',
        'GRN_POSTED', 'INVOICE_POSTED', 'PAYMENT_RECORDED', 'RETURN_POSTED',
      ]);
      expect(done.next).toBeNull();
      expect(done.percent).toBe(100);
      expect(done.hasReturn).toBe(true);
    });
  });
});

import { findSellingPriceAboveMrp, matchGrnItemsToLines } from './procurement.helper';

describe('findSellingPriceAboveMrp', () => {
  it('flags only selling price above a positive MRP', () => {
    const lines = [
      { id: 1, sellingPrice: 130, mrp: 120 },
      { id: 2, sellingPrice: 120, mrp: 120 },
      { id: 3, sellingPrice: 90, mrp: 120 },
      { id: 4, sellingPrice: 500, mrp: null },
      { id: 5, sellingPrice: 500, mrp: 0 },
      { id: 6, sellingPrice: null, mrp: 100 },
    ];
    expect(findSellingPriceAboveMrp(lines).map((l) => l.id)).toEqual([1]);
  });
});

describe('matchGrnItemsToLines (lot linking)', () => {
  const L = (variantId: string, batchNumber: string, receivedQty: number) => ({ variantId, batchNumber, receivedQty, unitCost: 10 });
  it('pairs same-variant lines with the right item even when item order differs', () => {
    const lines = [L('v1', 'A', 5), L('v1', 'B', 7), L('v2', 'A', 1)];
    const items = [{ id: 'i3', ...L('v2', 'A', 1) }, { id: 'i2', ...L('v1', 'B', 7) }, { id: 'i1', ...L('v1', 'A', 5) }];
    expect(matchGrnItemsToLines(lines, items).map((i) => items[i].id)).toEqual(['i1', 'i2', 'i3']);
  });
  it('identical lines each get their own item', () => {
    const items = [{ id: 'a', ...L('v1', 'A', 5) }, { id: 'b', ...L('v1', 'A', 5) }];
    expect(matchGrnItemsToLines([L('v1', 'A', 5), L('v1', 'A', 5)], items)).toEqual([0, 1]);
  });
  it('returns -1 when there is no item', () => {
    expect(matchGrnItemsToLines([L('v1', 'A', 1)], [])).toEqual([-1]);
  });
});

import { buildMrpWarnings } from './procurement.helper';
describe('buildMrpWarnings (non-blocking)', () => {
  it('returns line index, variant, prices and a message; nothing for fine lines', () => {
    const w = buildMrpWarnings([
      { variantId: 'v0', productName: 'A', sellingPrice: 100, mrp: 120 },
      { variantId: 'v1', productName: 'B', variantName: 'Large', sellingPrice: 130, mrp: 120 },
      { variantId: 'v2', productName: 'C', sellingPrice: 130, mrp: 0 },
    ]);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ lineIndex: 1, variantId: 'v1', sellingPrice: 130, mrp: 120 });
    expect(w[0].message).toMatch(/above MRP/);
  });
});
