import { CashMovementType as T, PaymentMethod as P } from '@prisma/client';
import { buildDayEndSalesFigures, buildDayEndTotals, shopDateString, shopDayBounds } from './day-end-report.helper';

const shift = (over: Partial<Parameters<typeof buildDayEndTotals>[0][number]> = {}) => ({
  id: 's1', cashierName: 'Kasun', counterName: 'Counter 1', openingTime: new Date(), closingTime: null, status: 'OPEN',
  openingCash: 5000, actualCash: null,
  movements: [
    { type: T.OPENING, amount: 5000 },
    { type: T.SALE, amount: 3000 },
    { type: T.REFUND, amount: 200 },
    { type: T.WITHDRAWAL, amount: 1000 },
    { type: T.EXPENSE, amount: 150 },
    { type: T.DEPOSIT, amount: 500, reference: 'XFER-1' },
    { type: T.WITHDRAWAL, amount: 300, reference: 'XFER-2' },
  ],
  ...over,
});

describe('buildDayEndTotals', () => {
  it('reconciles gross revenue, discount, tax, gross cash and saved change', () => {
    const figures = buildDayEndSalesFigures([
      {
        id: 'sale-1',
        subtotal: 1000,
        discountAmount: 50,
        taxAmount: 171,
        total: 1121,
        changeDue: 79,
        changeSavedToWallet: 20,
        payments: [{ method: P.CASH, amount: 1200 }],
      },
      {
        id: 'sale-2',
        subtotal: 500,
        discountAmount: 0,
        taxAmount: 0,
        total: 500,
        changeDue: 0,
        payments: [{ method: P.CARD, amount: 500 }],
      },
    ]);
    expect(figures).toMatchObject({
      grossRevenue: 1500,
      discounts: 50,
      taxes: 171,
      netRevenue: 1621,
      cashReceived: 1200,
      changeGiven: 59,
      savedChange: 20,
    });
  });

  it('splits cash movements and computes the expected closing cash', () => {
    const t = buildDayEndTotals([shift()], []);
    expect(t).toMatchObject({
      openingCash: 5000, cashSales: 3000, cashRefunds: 200, withdrawals: 1000, expenses: 150,
      transfersIn: 500, transfersOut: 300, expectedClosingCash: 5000 + 3000 - 200 - 1000 - 150 + 500 - 300,
      actualClosingCash: null, difference: null, transactionCount: 0,
    });
  });

  it('collections by payment method (cash from the drawer; card / QR / bank / others from payments)', () => {
    const t = buildDayEndTotals([shift()], [
      { id: 'a', changeDue: 0, payments: [{ method: P.CARD, amount: 1200, cardLast4: '1234' }] },
      { id: 'b', changeDue: 0, payments: [{ method: P.QR, amount: 800 }, { method: P.CASH, amount: 3000 }] },
      { id: 'c', changeDue: 0, payments: [{ method: P.BANK_TRANSFER, amount: 450 }, { method: P.CUSTOMER_CREDIT, amount: 99.5 }, { method: P.GIFT_VOUCHER, amount: 50 }] },
    ]);
    expect(t.collections).toEqual({
      cash: 3000, card: 1200, qr: 800, bankTransfer: 450, other: 149.5,
      others: [{ method: 'CUSTOMER_CREDIT', amount: 99.5 }, { method: 'GIFT_VOUCHER', amount: 50 }],
    });
    expect(t.totalCollections).toBe(3000 + 1200 + 800 + 450 + 149.5);
    expect(t.transactionCount).toBe(3);
  });

  it('counts saved change as cash retained in the drawer, not change handed back', () => {
    const t = buildDayEndTotals([shift()], [
      { id: 'saved', changeDue: 71, changeSavedToWallet: 71, payments: [{ method: P.CASH, amount: 200 }] },
    ]);
    expect(t.collections.cash).toBe(3000);
    expect(t.totalCollections).toBe(3000);
  });

  it('QR fees are shown apart from the QR collections and are not in the total', () => {
    const t = buildDayEndTotals([shift()], [
      { id: 'a', changeDue: 0, payments: [{ method: P.QR, amount: 10000, feeAmount: 100 }] },
      { id: 'b', changeDue: 0, payments: [{ method: P.QR, amount: 4000, feeAmount: 0 }, { method: P.CARD, amount: 500, cardLast4: '1111', feeAmount: null }] },
      { id: 'c', changeDue: 0, payments: [{ method: P.QR, amount: 6000 }] }, // older sale: no stored fee
    ]);
    expect(t.qrFees).toBe(100);
    expect(t.collections.qr).toBe(20000);          // bill amounts
    expect(t.totalCollections).toBe(3000 + 20000 + 500);
    expect(buildDayEndTotals([shift()], []).qrFees).toBe(0);
  });

  it('actual closing cash and difference only when every shift is counted', () => {
    const closed = shift({ actualCash: 6800, status: 'CLOSED' });
    const t = buildDayEndTotals([closed], []);
    expect(t.actualClosingCash).toBe(6800);
    expect(t.difference).toBe(6800 - 6850);
    expect(buildDayEndTotals([closed, shift({ id: 's2' })], []).actualClosingCash).toBeNull();
  });

  it('handover opening is reported separately', () => {
    const t = buildDayEndTotals([shift({ openingCash: 7000, movements: [{ type: T.OPENING, amount: 7000, reference: 'HANDOVER-AB12' }] })], []);
    expect(t.handoverIn).toBe(7000);
    expect(t.expectedClosingCash).toBe(7000);
  });

  it('a handover between two shifts in the same report is counted once (counter day)', () => {
    const giver = shift({ id: 'a', openingCash: 3000, actualCash: 3000, status: 'CLOSED', movements: [{ type: T.OPENING, amount: 3000 }], handedOverWithin: 3000 });
    const taker = shift({ id: 'b', openingCash: 3000, movements: [{ type: T.OPENING, amount: 3000, reference: 'HANDOVER-X' }, { type: T.SALE, amount: 500 }] });
    const t = buildDayEndTotals([giver, taker], []);
    expect(t).toMatchObject({ openingCash: 3000, handoverIn: 0, cashSales: 500, expectedClosingCash: 3500, actualClosingCash: null, handedOverWithin: 3000 });
    const closed = buildDayEndTotals([giver, { ...taker, actualCash: 3500 }], []);
    expect(closed).toMatchObject({ actualClosingCash: 3500, difference: 0 });
  });

  it('day boundaries follow the shop timezone, not the server (UTC)', () => {
    const c = shopDayBounds('2026-11-09', 'Asia/Colombo');
    expect(c.from.toISOString()).toBe('2026-11-08T18:30:00.000Z');
    expect(c.to.toISOString()).toBe('2026-11-09T18:29:59.999Z');
    expect(shopDayBounds('2026-11-09', 'Not/AZone').from.toISOString()).toBe('2026-11-08T18:30:00.000Z');
    expect(() => shopDayBounds('2026-13-45', 'Asia/Colombo')).toThrow();
  });

  it('formats the current shop date in the shop timezone', () => {
    const justAfterColomboMidnight = new Date('2026-11-08T19:00:00.000Z');
    expect(shopDateString(justAfterColomboMidnight, 'Asia/Colombo')).toBe('2026-11-09');
    expect(shopDateString(justAfterColomboMidnight, 'Not/AZone')).toBe('2026-11-09');
  });
});
