import {
  assertCanClosePeriod,
  assertCanReopenPeriod,
  computeNetIncomeForClose,
  datesOverlap,
  evaluateYearEndCloseRules,
  generateMonthlyPeriods,
  startOfUtcDay,
} from './financial-periods.helper';

describe('Phase 01 Sprint 2 — Financial Periods', () => {
  it('generates 12 monthly periods for a calendar year', () => {
    const periods = generateMonthlyPeriods(
      new Date('2026-01-01T00:00:00.000Z'),
      new Date('2026-12-31T00:00:00.000Z'),
    );
    expect(periods).toHaveLength(12);
    expect(periods[0].sequence).toBe(1);
    expect(periods[0].startDate.toISOString().slice(0, 10)).toBe('2026-01-01');
    expect(periods[11].endDate.toISOString().slice(0, 10)).toBe('2026-12-31');
  });

  it('supports Apr–Mar fiscal year', () => {
    const periods = generateMonthlyPeriods(
      new Date('2025-04-01T00:00:00.000Z'),
      new Date('2026-03-31T00:00:00.000Z'),
    );
    expect(periods).toHaveLength(12);
    expect(periods[0].name).toContain('2025');
    expect(periods[11].endDate.toISOString().slice(0, 10)).toBe('2026-03-31');
  });

  it('detects date overlap', () => {
    expect(
      datesOverlap(
        new Date('2026-01-01'),
        new Date('2026-12-31'),
        new Date('2026-06-01'),
        new Date('2026-06-30'),
      ),
    ).toBe(true);
    expect(
      datesOverlap(
        new Date('2026-01-01'),
        new Date('2026-03-31'),
        new Date('2026-04-01'),
        new Date('2026-06-30'),
      ),
    ).toBe(false);
  });

  it('enforces close / reopen rules', () => {
    expect(() =>
      assertCanClosePeriod({ periodStatus: 'OPEN', fiscalYearStatus: 'CLOSED' }),
    ).toThrow(/closed fiscal year/);
    expect(() =>
      assertCanReopenPeriod({ periodStatus: 'LOCKED', fiscalYearStatus: 'OPEN' }),
    ).toThrow(/Locked/);
  });

  it('evaluates year-end close readiness', () => {
    const fail = evaluateYearEndCloseRules({
      fiscalYearStatus: 'OPEN',
      periods: [
        { name: 'Jan', status: 'CLOSED' },
        { name: 'Feb', status: 'OPEN' },
      ],
      hasRetainedEarningsAccount: true,
    });
    expect(fail.ok).toBe(false);
    expect(fail.openPeriodNames).toEqual(['Feb']);

    const ok = evaluateYearEndCloseRules({
      fiscalYearStatus: 'OPEN',
      periods: [{ name: 'Jan', status: 'CLOSED' }],
      hasRetainedEarningsAccount: true,
    });
    expect(ok.ok).toBe(true);
  });

  it('computes net income for closing entry', () => {
    expect(computeNetIncomeForClose(100000, 40000)).toBe(60000);
    expect(computeNetIncomeForClose(10000, 15000)).toBe(-5000);
  });

  it('normalizes start of UTC day', () => {
    expect(startOfUtcDay(new Date('2026-07-17T15:30:00.000Z')).toISOString()).toBe(
      '2026-07-17T00:00:00.000Z',
    );
  });
});
