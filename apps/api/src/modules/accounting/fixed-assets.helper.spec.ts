import {
  buildDepreciationSchedule,
  computePeriodDepreciation,
  decliningBalanceMonthly,
  disposalGainLoss,
  roundMoney,
  straightLineMonthly,
} from './fixed-assets.helper';

describe('Sprint 9 — Fixed Assets helpers', () => {
  it('computes straight-line monthly depreciation', () => {
    expect(straightLineMonthly(120000, 0, 60)).toBe(2000);
    expect(straightLineMonthly(100000, 10000, 36)).toBe(2500);
  });

  it('caps declining balance at residual', () => {
    const d = decliningBalanceMonthly(1000, 900, 40);
    expect(d).toBeLessThanOrEqual(100);
    expect(computePeriodDepreciation({
      method: 'STRAIGHT_LINE',
      cost: 12000,
      residualValue: 0,
      usefulLifeMonths: 12,
      accumulatedDep: 11000,
      bookValue: 1000,
    })).toBe(1000);
  });

  it('builds a schedule that reaches residual', () => {
    const rows = buildDepreciationSchedule({
      acquisitionDate: '2026-01-15',
      cost: 12000,
      residualValue: 0,
      usefulLifeMonths: 12,
      method: 'STRAIGHT_LINE',
    });
    expect(rows).toHaveLength(12);
    expect(rows[0].depreciation).toBe(1000);
    expect(rows[11].bookValue).toBe(0);
    expect(rows[0].periodLabel).toBe('2026-01');
  });

  it('computes disposal gain/loss', () => {
    expect(disposalGainLoss(8000, 5000)).toBe(-3000);
    expect(disposalGainLoss(8000, 9000)).toBe(1000);
    expect(roundMoney(1.005)).toBe(1.01);
  });
});
