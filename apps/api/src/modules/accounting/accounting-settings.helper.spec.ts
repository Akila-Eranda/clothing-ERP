import {
  assertDecimalPlaces,
  assertFiscalYearStartMonth,
  assertNextValue,
  assertPadLength,
  computeResetKey,
  DEFAULT_NUMBER_SERIES,
  formatDocumentNumber,
  previewDocumentNumber,
} from './accounting-settings.helper';

describe('Phase 06 Sprint 13 — Accounting Settings', () => {
  it('seeds default number series for all document types', () => {
    const keys = DEFAULT_NUMBER_SERIES.map((d) => d.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'JOURNAL', 'INVOICE', 'PURCHASE_ORDER', 'GRN', 'DEBIT_NOTE', 'PAYSLIP', 'RETURN',
      ]),
    );
  });

  it('computes reset keys by policy', () => {
    const d = new Date(Date.UTC(2026, 6, 17)); // Jul 17 2026
    expect(computeResetKey('NEVER', d)).toBe('NEVER');
    expect(computeResetKey('YEARLY', d)).toBe('2026');
    expect(computeResetKey('MONTHLY', d)).toBe('2026-07');
    expect(computeResetKey('DAILY', d)).toBe('2026-07-17');
  });

  it('formats document numbers', () => {
    const d = new Date(Date.UTC(2026, 0, 5));
    expect(formatDocumentNumber({
      prefix: 'JE', includeYear: true, includeMonth: false, padLength: 5, seq: 1, date: d,
    })).toBe('JE-2026-00001');
    expect(formatDocumentNumber({
      prefix: 'INV', includeYear: true, includeMonth: true, padLength: 4, seq: 12, date: d,
    })).toBe('INV-2026-01-0012');
  });

  it('previews next number', () => {
    expect(previewDocumentNumber({
      prefix: 'PO', includeYear: true, includeMonth: false, padLength: 5, nextValue: 7,
    }, new Date(Date.UTC(2026, 0, 1)))).toBe('PO-2026-00007');
  });

  it('validates preference bounds', () => {
    expect(assertFiscalYearStartMonth(4)).toBe(4);
    expect(() => assertFiscalYearStartMonth(13)).toThrow(/1–12/);
    expect(assertDecimalPlaces(2)).toBe(2);
    expect(() => assertDecimalPlaces(5)).toThrow(/0–4/);
    expect(assertPadLength(5)).toBe(5);
    expect(() => assertPadLength(0)).toThrow();
    expect(assertNextValue(1)).toBe(1);
    expect(() => assertNextValue(0)).toThrow();
  });
});
