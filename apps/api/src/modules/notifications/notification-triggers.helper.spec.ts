import {
  buildDedupeKey,
  dateKey,
  daysUntil,
  extractDedupeKey,
  isDueWithin,
  isExpiryAlert,
  isLowStock,
  isOverdue,
  isReorderNeeded,
  notificationTypeFor,
  planChequeDueAlert,
  planCustomerDueAlert,
  planDailySummaryAlert,
  planExpiryAlert,
  planGrnPendingAlert,
  planLowStockAlert,
  planPoPendingAlert,
  planReorderAlert,
  planSupplierDueAlert,
  shouldSendNotification,
} from './notification-triggers.helper';

describe('Phase 12 Notifications — trigger eligibility', () => {
  const now = new Date('2026-07-16T10:00:00');

  describe('stock / reorder', () => {
    it('uses reorderPoint when set', () => {
      expect(isLowStock(8, { reorderPoint: 10 })).toBe(true);
      expect(isLowStock(11, { reorderPoint: 10 })).toBe(false);
    });

    it('falls back to minStock then 5', () => {
      expect(isLowStock(3, { minStockLevel: 4 })).toBe(true);
      expect(isLowStock(5, {})).toBe(true);
      expect(isLowStock(6, {})).toBe(false);
    });

    it('reorder uses available qty vs reorder point', () => {
      expect(isReorderNeeded(10, 6, 5)).toBe(true); // available 4
      expect(isReorderNeeded(20, 0, 5)).toBe(false);
    });
  });

  describe('due / expiry windows', () => {
    it('flags expiry within window and already expired', () => {
      expect(isExpiryAlert(new Date('2026-07-18'), 7, now)).toBe(true);
      expect(isExpiryAlert(new Date('2026-07-10'), 7, now)).toBe(true);
      expect(isExpiryAlert(new Date('2026-08-20'), 7, now)).toBe(false);
      expect(isExpiryAlert(null, 7, now)).toBe(false);
    });

    it('due within / overdue day bounds', () => {
      expect(isDueWithin(new Date('2026-07-20'), 7, now)).toBe(true);
      expect(isDueWithin(new Date('2026-08-01'), 7, now)).toBe(false);
      expect(isOverdue(new Date('2026-07-15'), now)).toBe(true);
      expect(isOverdue(new Date('2026-07-16'), now)).toBe(false);
      expect(daysUntil(new Date('2026-07-18'), now)).toBe(2);
    });
  });

  describe('dedupe', () => {
    it('builds stable keys and blocks duplicates', () => {
      const key = buildDedupeKey('LOW_STOCK', ['b1', 'v1', '2026-07-16']);
      expect(key).toBe('LOW_STOCK:b1:v1:2026-07-16');
      expect(shouldSendNotification(key, [key])).toBe(false);
      expect(shouldSendNotification(key, [])).toBe(true);
    });

    it('extracts dedupeKey from notification data', () => {
      expect(extractDedupeKey({ dedupeKey: 'A:1' })).toBe('A:1');
      expect(extractDedupeKey({})).toBeNull();
      expect(extractDedupeKey(null)).toBeNull();
    });
  });

  describe('planned alerts', () => {
    it('plans low stock / reorder / expiry with links', () => {
      const low = planLowStockAlert({
        variantId: 'v1', branchId: 'b1', sku: 'SKU', productName: 'Milk', quantity: 2,
      });
      expect(low.kind).toBe('LOW_STOCK');
      expect(low.link).toBe('/inventory');
      expect(low.dedupeKey).toContain('LOW_STOCK');

      const reorder = planReorderAlert({
        variantId: 'v1', branchId: 'b1', sku: 'SKU', productName: 'Milk', available: 3, reorderPoint: 5,
      });
      expect(reorder.kind).toBe('REORDER');
      expect(notificationTypeFor(reorder.kind)).toBe('REORDER');

      const exp = planExpiryAlert({
        lotId: 'l1', productName: 'Yogurt', batchNumber: 'B1', daysToExpiry: 2, quantity: 4,
      });
      expect(exp.title).toBe('Expiry Alert');
      expect(notificationTypeFor(exp.kind)).toBe('EXPIRY_ALERT');
    });

    it('plans customer / supplier / cheque due alerts', () => {
      const cust = planCustomerDueAlert({
        customerId: 'c1', customerName: 'Ada', amount: 1500, dueDate: new Date('2026-07-10'), now,
      });
      expect(cust.title).toBe('Customer Overdue');
      expect(notificationTypeFor(cust.kind)).toBe('PAYMENT_DUE');

      const sup = planSupplierDueAlert({
        invoiceId: 'inv1', supplierName: 'Acme', amount: 900, dueDate: new Date('2026-07-18'), now,
      });
      expect(sup.title).toBe('Supplier Payment Due');
      expect(notificationTypeFor(sup.kind)).toBe('SUPPLIER_DUE');

      const chq = planChequeDueAlert({
        chequeId: 'q1', chequeNumber: '1001', amount: 500, dueDate: new Date('2026-07-12'), partyName: 'Bob', now,
      });
      expect(chq.title).toBe('Cheque Overdue');
      expect(notificationTypeFor(chq.kind)).toBe('CHEQUE_DUE');
    });

    it('plans PO / GRN pending and daily summary', () => {
      const po = planPoPendingAlert({
        poId: 'p1', poNumber: 'PO-1', supplierName: 'Acme', status: 'PENDING_APPROVAL',
      });
      expect(notificationTypeFor(po.kind)).toBe('PO_PENDING');

      const grn = planGrnPendingAlert({
        poId: 'p1', poNumber: 'PO-1', supplierName: 'Acme', orderedQty: 100, receivedQty: 40,
      });
      expect(grn.message).toContain('60 units');
      expect(notificationTypeFor(grn.kind)).toBe('GRN_PENDING');

      const day = planDailySummaryAlert({ salesCount: 12, revenue: 45000, day: dateKey(now) });
      expect(day.kind).toBe('DAILY_SUMMARY');
      expect(day.dedupeKey).toBe(`DAILY_SUMMARY:${dateKey(now)}`);
    });
  });
});
