import {
  assertNextValue,
  assertPadLength,
  computeResetKey,
  DEFAULT_NUMBER_SERIES,
  formatDocumentNumber,
  previewDocumentNumber,
  shouldUseCompactDate,
} from './document-numbering.helper';

describe('Document Numbering Engine helpers', () => {
  it('seeds default series including procurement + exchange keys', () => {
    const keys = DEFAULT_NUMBER_SERIES.map((d) => d.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'JOURNAL',
        'INVOICE',
        'PURCHASE_ORDER',
        'PURCHASE_REQUEST',
        'GRN',
        'SUPPLIER_RETURN',
        'SUPPLIER_INVOICE',
        'RETURN',
        'EXCHANGE',
      ]),
    );
  });

  it('computes reset keys by policy', () => {
    const d = new Date(Date.UTC(2026, 6, 17));
    expect(computeResetKey('NEVER', d)).toBe('NEVER');
    expect(computeResetKey('YEARLY', d)).toBe('2026');
    expect(computeResetKey('MONTHLY', d)).toBe('2026-07');
    expect(computeResetKey('DAILY', d)).toBe('2026-07-17');
  });

  it('formats journal-style numbers', () => {
    const d = new Date(Date.UTC(2026, 0, 5));
    expect(
      formatDocumentNumber({
        prefix: 'JE',
        includeYear: true,
        includeMonth: false,
        padLength: 5,
        seq: 1,
        date: d,
      }),
    ).toBe('JE-2026-00001');
  });

  it('formats POS legacy compact daily invoices', () => {
    const d = new Date(Date.UTC(2026, 0, 5));
    expect(
      formatDocumentNumber({
        prefix: 'INV',
        includeYear: true,
        includeMonth: true,
        padLength: 4,
        seq: 12,
        date: d,
        compactDate: true,
      }),
    ).toBe('INV-20260105-0012');
  });

  it('uses compact date for DAILY year+month series', () => {
    expect(
      shouldUseCompactDate({
        includeYear: true,
        includeMonth: true,
        resetPolicy: 'DAILY',
      }),
    ).toBe(true);
    expect(
      shouldUseCompactDate({
        includeYear: true,
        includeMonth: false,
        resetPolicy: 'YEARLY',
      }),
    ).toBe(false);
  });

  it('previews next compact invoice number', () => {
    expect(
      previewDocumentNumber(
        {
          prefix: 'INV',
          includeYear: true,
          includeMonth: true,
          padLength: 4,
          nextValue: 3,
          resetPolicy: 'DAILY',
        },
        new Date(Date.UTC(2026, 6, 21)),
      ),
    ).toBe('INV-20260721-0003');
  });

  it('validates pad and next value', () => {
    expect(assertPadLength(5)).toBe(5);
    expect(() => assertPadLength(0)).toThrow();
    expect(assertNextValue(1)).toBe(1);
    expect(() => assertNextValue(0)).toThrow();
  });
});
