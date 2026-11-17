import { PaymentMethod as M } from '@prisma/client';
import { allocateRefundByTender, cashRefundPart, refundTenders, splitProportional } from './refund-allocation.helper';

describe('splitProportional', () => {
  it('splits by weight, merges repeated keys, adds up exactly', () => {
    expect(splitProportional(100, [{ key: 'A', weight: 300 }, { key: 'B', weight: 100 }])).toEqual([{ key: 'A', amount: 75 }, { key: 'B', amount: 25 }]);
    expect(splitProportional(10, [{ key: 'A', weight: 1 }, { key: 'A', weight: 1 }, { key: 'B', weight: 2 }])).toEqual([{ key: 'A', amount: 5 }, { key: 'B', amount: 5 }]);
    const p = splitProportional(100, [{ key: 1, weight: 1 }, { key: 2, weight: 1 }, { key: 3, weight: 1 }]);
    expect(p.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(100, 10);
  });

  it('nothing to split → no parts', () => {
    expect(splitProportional(0, [{ key: 'A', weight: 1 }])).toEqual([]);
    expect(splitProportional(50, [{ key: 'A', weight: 0 }])).toEqual([]);
    expect(splitProportional(50, [])).toEqual([]);
  });
});

describe('allocateRefundByTender (split-payment refunds)', () => {
  it('a cash-only sale refunds in cash', () => {
    expect(allocateRefundByTender([{ method: M.CASH, amount: 1000 }], 0, 400)).toEqual([{ method: M.CASH, amount: 400 }]);
  });

  it('a card-only sale refunds nothing from the drawer', () => {
    const parts = allocateRefundByTender([{ method: M.CARD, amount: 1000 }], 0, 1000);
    expect(parts).toEqual([{ method: M.CARD, amount: 1000 }]);
    expect(cashRefundPart(parts)).toBe(0);
  });

  it('split card + cash: only the cash share comes from the drawer', () => {
    const parts = allocateRefundByTender([{ method: M.CARD, amount: 600 }, { method: M.CASH, amount: 400 }], 0, 1000);
    expect(parts).toEqual([{ method: M.CARD, amount: 600 }, { method: M.CASH, amount: 400 }]);
    expect(cashRefundPart(allocateRefundByTender([{ method: M.CARD, amount: 600 }, { method: M.CASH, amount: 400 }], 0, 500))).toBe(200);
  });

  it('cash share is what the shop kept (cash paid minus change)', () => {
    // bill 1000: card 500, cash 1000 tendered, change 500 → shop kept 500 cash
    const parts = allocateRefundByTender([{ method: M.CARD, amount: 500 }, { method: M.CASH, amount: 1000 }], 500, 1000);
    expect(cashRefundPart(parts)).toBe(500);
  });

  it('QR / bank / credit shares go back to those tenders', () => {
    const parts = allocateRefundByTender([{ method: M.QR, amount: 300 }, { method: M.BANK_TRANSFER, amount: 200 }, { method: M.CUSTOMER_CREDIT, amount: 500 }], 0, 100);
    expect(parts).toEqual([{ method: M.QR, amount: 30 }, { method: M.BANK_TRANSFER, amount: 20 }, { method: M.CUSTOMER_CREDIT, amount: 50 }]);
  });

  it('parts always add up to the refund (rounding cents on the largest part)', () => {
    const parts = allocateRefundByTender([{ method: M.CASH, amount: 1 }, { method: M.CARD, amount: 1 }, { method: M.QR, amount: 1 }], 0, 100);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBeCloseTo(100, 10);
  });

  it('no refund → no parts; no usable payments → cash (previous behaviour)', () => {
    expect(allocateRefundByTender([{ method: M.CASH, amount: 100 }], 0, 0)).toEqual([]);
    expect(allocateRefundByTender([], 0, 50)).toEqual([{ method: M.CASH, amount: 50 }]);
  });

  it('partial-pay sale: the unpaid balance is customer credit, never paid out in cash', () => {
    const sale = { total: 1000, changeDue: 0, payments: [{ method: M.CASH, amount: 400 }] };
    const parts = allocateRefundByTender(refundTenders(sale), sale.changeDue, 1000);
    expect(parts).toEqual([{ method: M.CASH, amount: 400 }, { method: M.CUSTOMER_CREDIT, amount: 600 }]);
  });

  it('fully paid sale adds no credit tender (change is not "unpaid")', () => {
    expect(refundTenders({ total: 1000, changeDue: 200, payments: [{ method: M.CASH, amount: 1200 }] })).toEqual([{ method: M.CASH, amount: 1200 }]);
  });

  it('sale without payment rows refunds by its payment method (older data)', () => {
    expect(refundTenders({ total: 500, paymentMethod: M.CASH, payments: [] })).toEqual([{ method: M.CASH, amount: 500 }]);
    expect(refundTenders({ total: 500, paymentMethod: M.CARD, payments: [] })).toEqual([{ method: M.CARD, amount: 500 }]);
  });
});
