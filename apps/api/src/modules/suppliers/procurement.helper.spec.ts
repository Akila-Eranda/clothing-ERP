import {
  applyInvoicePayment,
  applyPartialReceive,
  canConvertPurchaseRequest,
  canReceiveAgainstPo,
  nextDocNumber,
  procurementCycleProgress,
} from './procurement.helper';

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

    it('rejects overpayment', () => {
      expect(() => applyInvoicePayment(100, 80, 30)).toThrow(/exceeds/);
    });
  });

  describe('gates', () => {
    it('blocks receive on draft/pending PO', () => {
      expect(canReceiveAgainstPo('DRAFT')).toBe(false);
      expect(canReceiveAgainstPo('PENDING_APPROVAL')).toBe(false);
      expect(canReceiveAgainstPo('CONFIRMED')).toBe(true);
      expect(canReceiveAgainstPo('PARTIALLY_RECEIVED')).toBe(true);
    });

    it('allows convert only when PR approved', () => {
      expect(canConvertPurchaseRequest('APPROVED')).toBe(true);
      expect(canConvertPurchaseRequest('DRAFT')).toBe(false);
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
