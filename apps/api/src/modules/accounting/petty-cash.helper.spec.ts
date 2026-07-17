import {
  applyPettyCashBalance,
  pettyCashDelta,
  replenishAmount,
  roundMoney,
  summarizePettyCashBook,
} from './petty-cash.helper';

describe('Sprint 8 — Petty Cash helpers', () => {
  it('applies disbursement and replenishment deltas', () => {
    expect(pettyCashDelta('DISBURSEMENT', 250)).toBe(-250);
    expect(pettyCashDelta('REPLENISHMENT', 250)).toBe(250);
    expect(applyPettyCashBalance(1000, 'DISBURSEMENT', 150)).toBe(850);
    expect(applyPettyCashBalance(850, 'REPLENISHMENT', 150)).toBe(1000);
  });

  it('computes replenish shortfall to float', () => {
    expect(replenishAmount(5000, 3200)).toBe(1800);
    expect(replenishAmount(5000, 5000)).toBe(0);
    expect(replenishAmount(5000, 3200, 500)).toBe(500);
  });

  it('summarizes book by category', () => {
    const s = summarizePettyCashBook([
      { type: 'OPENING', amount: 5000 },
      { type: 'DISBURSEMENT', amount: 200, category: 'Transport' },
      { type: 'DISBURSEMENT', amount: 100, category: 'Transport' },
      { type: 'DISBURSEMENT', amount: 50, category: 'Stationery' },
      { type: 'REPLENISHMENT', amount: 350 },
    ]);
    expect(s.disbursements).toBe(350);
    expect(s.replenishments).toBe(350);
    expect(s.byCategory[0].category).toBe('Transport');
    expect(roundMoney(18.005)).toBe(18.01);
  });
});
