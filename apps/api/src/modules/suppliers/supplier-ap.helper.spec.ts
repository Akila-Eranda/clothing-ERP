import {
  allocateApPaymentFifo,
  bucketAging,
  buildSupplierStatementFromLedger,
} from './supplier-ap.helper';

describe('Sprint 6 — Supplier AP helpers', () => {
  it('allocates FIFO invoices before POs, oldest due first', () => {
    const asOf = new Date('2026-07-16');
    const alloc = allocateApPaymentFifo(
      [
        {
          id: 'po1',
          source: 'PO',
          docNumber: 'PO-1',
          amount: 500,
          dueDate: new Date('2026-06-01'),
          asOfDate: asOf,
        },
        {
          id: 'inv1',
          source: 'INVOICE',
          docNumber: 'INV-1',
          amount: 400,
          dueDate: new Date('2026-07-01'),
          asOfDate: asOf,
        },
        {
          id: 'inv0',
          source: 'INVOICE',
          docNumber: 'INV-0',
          amount: 300,
          dueDate: new Date('2026-06-15'),
          asOfDate: asOf,
        },
      ],
      500,
    );
    expect(alloc[0]).toEqual({ lineId: 'inv0', source: 'INVOICE', applied: 300 });
    expect(alloc[1]).toEqual({ lineId: 'inv1', source: 'INVOICE', applied: 200 });
  });

  it('builds statement opening/closing from ledger balanceAfter', () => {
    const stmt = buildSupplierStatementFromLedger(
      [
        {
          id: '1',
          entryType: 'INVOICE',
          amount: 1000,
          balanceAfter: 1000,
          createdAt: new Date('2026-06-01'),
        },
        {
          id: '2',
          entryType: 'PAYMENT',
          amount: -400,
          balanceAfter: 600,
          createdAt: new Date('2026-06-20'),
        },
        {
          id: '3',
          entryType: 'INVOICE',
          amount: 200,
          balanceAfter: 800,
          createdAt: new Date('2026-07-05'),
        },
      ],
      { from: new Date('2026-07-01'), to: new Date('2026-07-31T23:59:59') },
    );
    expect(stmt.opening).toBe(600);
    expect(stmt.entries).toHaveLength(1);
    expect(stmt.closing).toBe(800);
  });

  it('buckets aging amounts', () => {
    const asOf = new Date('2026-07-16');
    const buckets = bucketAging(
      [
        {
          id: 'a',
          source: 'INVOICE',
          docNumber: 'A',
          amount: 100,
          dueDate: new Date('2026-07-20'),
          asOfDate: asOf,
        },
        {
          id: 'b',
          source: 'INVOICE',
          docNumber: 'B',
          amount: 200,
          dueDate: new Date('2026-06-20'),
          asOfDate: asOf,
        },
      ],
      asOf,
    );
    expect(buckets.current).toBe(100);
    expect(buckets.days1to30).toBe(200);
    expect(buckets.total).toBe(300);
  });
});
