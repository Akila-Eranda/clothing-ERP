import { CashMovementType, CashRegisterStatus } from '@prisma/client';
import { planHandover, walletDrawerAmount } from './cash-handover.helper';

const mv = (type: CashMovementType, amount: number) => ({ type, amount });
const wallet = (id: string, minutes: number, status: CashRegisterStatus, opening: number, movements: { type: CashMovementType; amount: number }[], actualCash: number | null = null) => ({
  id, status, actualCash, openingCash: opening, openingTime: new Date(Date.UTC(2026, 10, 9, 8, minutes)), movements,
});

describe('cash-handover.helper', () => {
  it('drawer amount: open wallet = expected from movements; closed wallet = counted at close', () => {
    const open = wallet('a', 0, CashRegisterStatus.OPEN, 5000, [mv('OPENING', 5000), mv('SALE', 2500), mv('REFUND', 500), mv('WITHDRAWAL', 1000)]);
    expect(walletDrawerAmount(open)).toEqual({ expectedCash: 6000, drawerCash: 6000 });
    const closed = wallet('b', 0, CashRegisterStatus.CLOSED, 5000, [mv('SALE', 2500)], 7400);
    expect(walletDrawerAmount(closed)).toEqual({ expectedCash: 7500, drawerCash: 7400 });
  });

  it('never resets the counter to zero: the incoming cashier gets the exact remaining balance', () => {
    const plan = planHandover([wallet('a', 0, CashRegisterStatus.OPEN, 5000, [mv('SALE', 12345.67)])]);
    expect(plan).toMatchObject({ expectedTotal: 17345.67, countedTotal: 17345.67, variance: 0, counted: false });
    expect(plan.wallets).toEqual([{ id: 'a', expected: 17345.67, counted: 17345.67, variance: 0 }]);
  });

  it('sums every uncleared wallet on the counter (e.g. PIN-switched cashiers)', () => {
    const plan = planHandover([
      wallet('late', 30, CashRegisterStatus.OPEN, 0, [mv('SALE', 300)]),
      wallet('early', 0, CashRegisterStatus.CLOSED, 1000, [], 1200),
    ]);
    expect(plan.expectedTotal).toBe(1500);
    expect(plan.wallets.map((w) => w.id)).toEqual(['early', 'late']);
  });

  it('a shortage is booked on the latest wallet first, without taking a wallet below zero', () => {
    const plan = planHandover([
      wallet('early', 0, CashRegisterStatus.CLOSED, 0, [], 1000),
      wallet('late', 30, CashRegisterStatus.OPEN, 0, [mv('SALE', 200)]),
    ], 900);
    expect(plan.variance).toBe(-300);
    expect(plan.wallets).toEqual([
      { id: 'early', expected: 1000, counted: 900, variance: -100 },
      { id: 'late', expected: 200, counted: 0, variance: -200 },
    ]);
    expect(plan.wallets.reduce((s, w) => s + w.counted, 0)).toBe(plan.countedTotal);
  });

  it('an overage goes to the latest wallet', () => {
    const plan = planHandover([wallet('a', 0, CashRegisterStatus.OPEN, 0, [mv('SALE', 100)]), wallet('b', 5, CashRegisterStatus.OPEN, 0, [mv('SALE', 100)])], 250);
    expect(plan.wallets.find((w) => w.id === 'b')).toEqual({ id: 'b', expected: 100, counted: 150, variance: 50 });
    expect(plan.counted).toBe(true);
  });

  it('rejects a negative count and an empty handover', () => {
    expect(() => planHandover([wallet('a', 0, CashRegisterStatus.OPEN, 0, [])], -1)).toThrow(/zero or more/);
    expect(() => planHandover([])).toThrow();
  });

  it('rejects non-finite counted cash', () => {
    expect(() => planHandover([wallet('a', 0, CashRegisterStatus.OPEN, 0, [])], Number.NaN)).toThrow(/zero or more/);
    expect(() => planHandover([wallet('a', 0, CashRegisterStatus.OPEN, 0, [])], Number.POSITIVE_INFINITY)).toThrow(/zero or more/);
  });
});
