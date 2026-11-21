import { ExchangeSettlementError, loyaltyAdjustmentForRefund, settleExchange } from './exchange-loyalty.helper';

describe('settleExchange', () => {
  it('equal value: nothing moves, and no payment may be sent', () => {
    expect(settleExchange(400, 400)).toEqual({ returned: 400, issued: 400, due: 0, collected: [], change: 0, excess: 0, excessAs: null });
    expect(() => settleExchange(400, 400, [{ method: 'CASH', amount: 10 }])).toThrow(ExchangeSettlementError);
  });

  it('customer owes the difference: collected by tender; cash may exceed (change), card cannot', () => {
    const s = settleExchange(200, 450, [{ method: 'CASH', amount: 300 }]);
    expect(s).toMatchObject({ due: 250, change: 50, collected: [{ method: 'CASH', amount: 250 }] });
    const split = settleExchange(200, 450, [{ method: 'CARD', amount: 150, cardLast4: '4242' }, { method: 'CASH', amount: 100 }]);
    expect(split.collected).toEqual([{ method: 'CASH', amount: 100 }, { method: 'CARD', amount: 150, cardLast4: '4242' }]);
    expect(() => settleExchange(200, 450, [{ method: 'CARD', amount: 300, cardLast4: '4242' }])).toThrow(/exceed/);
    expect(() => settleExchange(200, 450, [{ method: 'CASH', amount: 100 }])).toThrow(/Collect LKR 250.00/);
    expect(() => settleExchange(200, 450)).toThrow(/Collect/);
  });

  it('shop owes the excess: refund (default) or store credit; nothing collected', () => {
    expect(settleExchange(600, 450)).toMatchObject({ due: 0, excess: 150, excessAs: 'REFUND', collected: [] });
    expect(settleExchange(600, 450, [], 'STORE_CREDIT')).toMatchObject({ excess: 150, excessAs: 'STORE_CREDIT' });
    expect(() => settleExchange(600, 450, [{ method: 'CASH', amount: 1 }])).toThrow(/No payment/);
  });

  it('refuses other tenders (e.g. customer credit) for the difference', () => {
    expect(() => settleExchange(100, 200, [{ method: 'CUSTOMER_CREDIT' as never, amount: 100 }])).toThrow(/not accepted/);
  });
});

describe('loyaltyAdjustmentForRefund', () => {
  const base = { pointsEarned: 10, pointsRedeemed: 50, saleTotal: 1000, alreadyReversed: 0, alreadyRestored: 0, balance: 100 };

  it('full refund reverses all earned and restores all redeemed points', () => {
    expect(loyaltyAdjustmentForRefund({ ...base, refundedSoFar: 1000 })).toEqual({ reverse: 10, restore: 50, shortfall: 0 });
  });

  it('partial refunds are proportional and cumulative; together they equal the full refund', () => {
    const a = loyaltyAdjustmentForRefund({ ...base, refundedSoFar: 333 });
    expect(a).toEqual({ reverse: 3, restore: 16, shortfall: 0 });
    const b = loyaltyAdjustmentForRefund({ ...base, refundedSoFar: 666, alreadyReversed: a.reverse, alreadyRestored: a.restore });
    expect(b).toEqual({ reverse: 3, restore: 17, shortfall: 0 });
    const c = loyaltyAdjustmentForRefund({ ...base, refundedSoFar: 1000, alreadyReversed: 6, alreadyRestored: 33 });
    expect(c).toEqual({ reverse: 4, restore: 17, shortfall: 0 });
  });

  it('repeating the same computation applies nothing more (no duplicate adjustment)', () => {
    expect(loyaltyAdjustmentForRefund({ ...base, refundedSoFar: 1000, alreadyReversed: 10, alreadyRestored: 50 })).toEqual({ reverse: 0, restore: 0, shortfall: 0 });
  });

  it('never takes the balance below zero; the unrecovered part is reported', () => {
    const r = loyaltyAdjustmentForRefund({ ...base, pointsRedeemed: 0, refundedSoFar: 1000, balance: 4 });
    expect(r).toEqual({ reverse: 4, restore: 0, shortfall: 6 });
    // restored points in the same refund can cover the reversal
    expect(loyaltyAdjustmentForRefund({ ...base, refundedSoFar: 1000, balance: 0 })).toEqual({ reverse: 10, restore: 50, shortfall: 0 });
  });

  it('no points on the sale → nothing', () => {
    expect(loyaltyAdjustmentForRefund({ ...base, pointsEarned: 0, pointsRedeemed: 0, refundedSoFar: 500 })).toEqual({ reverse: 0, restore: 0, shortfall: 0 });
  });
});
