import {
  assertTotalsMatch,
  crossCheckGroupedRevenue,
  crossCheckPurchaseLine,
  crossCheckSalesPayments,
  crossCheckTaxBreakdown,
  crossCheckTotals,
  dayRange,
  groupByKey,
  marginPct,
  pctChange,
  round2,
  summarizeChequeRows,
  summarizeCommissionRows,
  summarizeCustomerRows,
  summarizeInventoryRows,
  summarizePurchaseRows,
  sumField,
} from './report-engine.helper';

describe('Report Engine', () => {
  describe('date windows', () => {
    it('builds inclusive dayRange', () => {
      const range = dayRange('2026-07-01', '2026-07-15');
      expect(range.gte.getFullYear()).toBe(2026);
      expect(range.gte.getMonth()).toBe(6);
      expect(range.gte.getDate()).toBe(1);
      expect(range.lte.getDate()).toBe(15);
      expect(range.gte.getTime()).toBeLessThan(range.lte.getTime());
    });
  });

  describe('grouping / margins', () => {
    it('groups rows by key', () => {
      const groups = groupByKey(
        [
          { brand: 'A', qty: 1 },
          { brand: 'B', qty: 2 },
          { brand: 'A', qty: 3 },
        ],
        (r) => r.brand,
      );
      expect(groups.A).toHaveLength(2);
      expect(groups.B).toHaveLength(1);
    });

    it('computes margin and pct change', () => {
      expect(marginPct(200, 50)).toBe(75);
      expect(marginPct(0, 10)).toBe(0);
      expect(pctChange(150, 100)).toBe(50);
      expect(pctChange(10, 0)).toBe(100);
      expect(pctChange(0, 0)).toBe(0);
    });
  });

  describe('money helpers', () => {
    it('rounds to 2 decimals stably', () => {
      expect(round2(10.005)).toBe(10.01);
      expect(round2(10.004)).toBe(10);
    });

    it('sumField aggregates correctly', () => {
      expect(sumField([{ a: 1.1 }, { a: 2.2 }], (r) => r.a)).toBe(3.3);
    });
  });

  describe('sales / cashier / tax', () => {
    it('cross-checks payment totals do not exceed sales', () => {
      const sales = [
        { total: 1000, payments: [{ amount: 600 }, { amount: 400 }] },
        { total: 500, payments: [{ amount: 500 }] },
      ];
      const check = crossCheckSalesPayments(sales);
      expect(check.ok).toBe(true);
      expect(check.expected).toBe(1500);
      expect(check.actual).toBe(1500);
    });

    it('flags overpayment vs sales total', () => {
      const check = crossCheckSalesPayments([{ total: 100, payments: [{ amount: 120 }] }]);
      expect(check.ok).toBe(false);
    });

    it('cashier revenue rows reconcile to overall', () => {
      const rows = [{ totalRevenue: 1200 }, { totalRevenue: 800.5 }];
      expect(crossCheckGroupedRevenue(rows, 2000.5).ok).toBe(true);
      expect(crossCheckGroupedRevenue(rows, 2000).ok).toBe(false);
    });

    it('tax breakdown reconciles to summary tax', () => {
      const byTaxRate = [{ _sum: { taxAmount: 100 } }, { _sum: { taxAmount: 50.25 } }];
      expect(crossCheckTaxBreakdown(byTaxRate, 150.25).ok).toBe(true);
      expect(() => assertTotalsMatch('tax', 150, 150.25)).toThrow(/tax mismatch/);
    });
  });

  describe('purchase reports', () => {
    it('PO line formula subtotal - discount + tax = total', () => {
      expect(crossCheckPurchaseLine(1000, 50, 80, 1030).ok).toBe(true);
      expect(crossCheckPurchaseLine(1000, 0, 0, 999).ok).toBe(false);
    });

    it('purchase summary totals equal row sums', () => {
      const rows = [
        { subtotal: 1000, taxAmount: 100, discountAmount: 0, total: 1100, paidAmount: 500 },
        { subtotal: 200, taxAmount: 0, discountAmount: 20, total: 180, paidAmount: 180 },
      ];
      const summary = summarizePurchaseRows(rows);
      expect(summary.orderCount).toBe(2);
      expect(summary.total).toBe(1280);
      expect(summary.paidAmount).toBe(680);
      expect(summary.outstanding).toBe(600);
      expect(crossCheckTotals(summary.total, sumField(rows, (r) => r.total)).ok).toBe(true);
    });
  });

  describe('inventory / customer', () => {
    it('inventory stock value and available qty reconcile', () => {
      const summary = summarizeInventoryRows([
        { quantity: 10, reservedQty: 2, avgCost: 100 },
        { quantity: 0, reservedQty: 0, avgCost: 50 },
        { quantity: 3, reservedQty: 0, variant: { costPrice: 20 } },
      ]);
      expect(summary.skuCount).toBe(3);
      expect(summary.onHandQty).toBe(13);
      expect(summary.availableQty).toBe(11);
      expect(summary.stockValue).toBe(1060);
      expect(summary.outOfStock).toBe(1);
      expect(summary.lowStock).toBe(2);
    });

    it('customer spend totals equal row sums', () => {
      const summary = summarizeCustomerRows([
        { totalSpent: 5000, totalOrders: 3 },
        { totalSpent: 250.5, totalOrders: 1 },
      ]);
      expect(summary.customers).toBe(2);
      expect(summary.totalSpent).toBe(5250.5);
      expect(summary.totalOrders).toBe(4);
    });
  });

  describe('cheque / commission', () => {
    it('cheque status buckets sum to total amount', () => {
      const now = new Date('2026-07-16T12:00:00');
      const rows = [
        { amount: 1000, status: 'RECEIVED', dueDate: '2026-07-10' },
        { amount: 500, status: 'ISSUED', dueDate: '2026-07-18' },
        { amount: 200, status: 'CLEARED', dueDate: '2026-07-01' },
      ];
      const summary = summarizeChequeRows(rows, now);
      expect(summary.count).toBe(3);
      expect(summary.totalAmount).toBe(1700);
      expect(summary.byStatus.RECEIVED.amount).toBe(1000);
      expect(summary.overdue).toBe(1000);
      expect(summary.dueSoon).toBe(500);
      expect(
        crossCheckTotals(
          summary.totalAmount,
          sumField(Object.values(summary.byStatus), (s) => s.amount),
        ).ok,
      ).toBe(true);
    });

    it('commission helper totals reconcile', () => {
      const rows = [
        { salesCount: 2, salesTotal: 10000, commissionTotal: 250 },
        { salesCount: 1, salesTotal: 4000, commissionTotal: 80 },
      ];
      const summary = summarizeCommissionRows(rows);
      expect(summary.helpers).toBe(2);
      expect(summary.salesCount).toBe(3);
      expect(summary.commissionTotal).toBe(330);
      expect(crossCheckTotals(summary.salesTotal, 14000).ok).toBe(true);
    });
  });
});
