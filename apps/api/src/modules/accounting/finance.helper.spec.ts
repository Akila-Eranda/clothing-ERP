import {
  buildAgingReport,
  cashBookRunningBalance,
  chequeClearEffect,
  classifyAging,
  computeProfitLoss,
  bankReconDifference,
  round2,
} from './finance.helper';

describe('Phase 5 Finance — report accuracy', () => {
  describe('P&L computation', () => {
    it('computes net revenue, gross profit, net profit consistently', () => {
      const pl = computeProfitLoss({
        grossRevenue: 100000,
        returns: 5000,
        cogs: 40000,
        expenses: 15000,
        otherIncome: 1000,
      });
      expect(pl.netRevenue).toBe(95000);
      expect(pl.grossProfit).toBe(55000);
      expect(pl.operatingExpenses).toBe(15000);
      expect(pl.netProfit).toBe(41000); // 55000 - 15000 + 1000
      expect(pl.grossMarginPct).toBe(round2((55000 / 95000) * 100));
      expect(pl.netMarginPct).toBe(round2((41000 / 95000) * 100));
    });

    it('handles zero revenue without NaN', () => {
      const pl = computeProfitLoss({ grossRevenue: 0, returns: 0, cogs: 0, expenses: 100 });
      expect(pl.netMarginPct).toBe(0);
      expect(pl.netProfit).toBe(-100);
    });
  });

  describe('AP/AR aging buckets', () => {
    const asOf = new Date('2026-07-16');

    it('classifies current and overdue buckets', () => {
      expect(classifyAging(-5)).toBe('current');
      expect(classifyAging(0)).toBe('current');
      expect(classifyAging(10)).toBe('1_30');
      expect(classifyAging(45)).toBe('31_60');
      expect(classifyAging(75)).toBe('61_90');
      expect(classifyAging(120)).toBe('90_plus');
    });

    it('builds aging totals that sum to outstanding', () => {
      const report = buildAgingReport(
        [
          { id: '1', partyName: 'A', amount: 1000, asOfDate: asOf, dueOrRefDate: new Date('2026-07-20') },
          { id: '2', partyName: 'B', amount: 2000, asOfDate: asOf, dueOrRefDate: new Date('2026-06-20') },
          { id: '3', partyName: 'C', amount: 3000, asOfDate: asOf, dueOrRefDate: new Date('2026-04-01') },
        ],
        asOf,
      );
      expect(report.total).toBe(6000);
      expect(report.buckets.current.amount).toBe(1000);
      expect(report.buckets['1_30'].amount).toBe(2000);
      expect(report.buckets['90_plus'].amount).toBe(3000);
      const bucketSum = Object.values(report.buckets).reduce((s, b) => s + b.amount, 0);
      expect(bucketSum).toBe(report.total);
    });
  });

  describe('Cash book running balance', () => {
    it('tracks debit/credit to closing balance', () => {
      const { balances, closing } = cashBookRunningBalance(10000, [
        { debit: 5000, credit: 0 },
        { debit: 0, credit: 3000 },
        { debit: 1000, credit: 500 },
      ]);
      expect(balances).toEqual([15000, 12000, 12500]);
      expect(closing).toBe(12500);
    });
  });

  describe('Bank reconciliation & cheques', () => {
    it('computes statement vs system difference', () => {
      expect(bankReconDifference(50000, 48500)).toBe(1500);
      expect(bankReconDifference(100, 100)).toBe(0);
    });

    it('applies cheque clear direction to bank delta', () => {
      expect(chequeClearEffect('RECEIVED', 2500).bankDelta).toBe(2500);
      expect(chequeClearEffect('ISSUED', 2500).bankDelta).toBe(-2500);
    });
  });
});
