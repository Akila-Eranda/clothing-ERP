import { ABSOLUTE_MAX_CASH_AMOUNT, DEFAULT_MAX_OPENING_FLOAT, countedCashError, openingFloatError, resolveMaxOpeningFloat } from './opening-float.helper';

describe('opening float limit', () => {
  it('branch overrides shop, shop overrides the default', () => {
    expect(resolveMaxOpeningFloat({ pos: { maxOpeningFloat: 50_000 } }, { maxOpeningFloat: 20_000 })).toEqual({ max: 20_000, source: 'BRANCH' });
    expect(resolveMaxOpeningFloat({ pos: { maxOpeningFloat: 50_000 } }, {})).toEqual({ max: 50_000, source: 'SHOP' });
    expect(resolveMaxOpeningFloat({}, null)).toEqual({ max: DEFAULT_MAX_OPENING_FLOAT, source: 'DEFAULT' });
    expect(resolveMaxOpeningFloat(null, undefined)).toEqual({ max: DEFAULT_MAX_OPENING_FLOAT, source: 'DEFAULT' });
  });

  it('ignores invalid settings and never goes above the absolute cap', () => {
    expect(resolveMaxOpeningFloat({ pos: { maxOpeningFloat: -5 } }, { maxOpeningFloat: 'abc' }).source).toBe('DEFAULT');
    expect(resolveMaxOpeningFloat({ pos: { maxOpeningFloat: 0 } }, {}).source).toBe('DEFAULT');
    expect(resolveMaxOpeningFloat({ pos: { maxOpeningFloat: 1e15 } }, {}).max).toBe(ABSOLUTE_MAX_CASH_AMOUNT);
    expect(resolveMaxOpeningFloat({}, { maxOpeningFloat: '75000' })).toEqual({ max: 75_000, source: 'BRANCH' });
  });
});

describe('opening float amount', () => {
  const shop = { max: 100_000, source: 'SHOP' as const };
  it('accepts zero, normal floats and 2 decimals up to the maximum', () => {
    for (const ok of [0, 5000, 10_000.5, 99_999.99, 100_000]) expect(openingFloatError(ok, shop)).toBeNull();
  });
  it('rejects negative, malformed and over-precise amounts', () => {
    expect(openingFloatError(-1, shop)).toMatch(/negative/);
    expect(openingFloatError(Number.NaN, shop)).toMatch(/number/);
    expect(openingFloatError(Number.POSITIVE_INFINITY, shop)).toMatch(/number/);
    expect(openingFloatError('5000' as unknown as number, shop)).toMatch(/number/);
    expect(openingFloatError(10.123, shop)).toMatch(/2 decimal/);
  });
  it('rejects unreasonable amounts with the limit and where it comes from', () => {
    expect(openingFloatError(4_111_212_121, shop)).toBe(
      'Opening float LKR 4,111,212,121 is above the maximum of LKR 100,000 for this shop. Count the drawer again, or ask an admin to change the limit (Settings → POS).',
    );
    expect(openingFloatError(100_000.01, shop)).toMatch(/above the maximum/);
    expect(openingFloatError(25_000, { max: 20_000, source: 'BRANCH' })).toMatch(/for this branch/);
  });
});

describe('counted cash (handover / wallet clear)', () => {
  it('a count at or near the recorded balance is always fine, even above the absolute cap', () => {
    expect(countedCashError(0, 5000)).toBeNull();
    expect(countedCashError(4_800, 5_000)).toBeNull();
    expect(countedCashError(4_111_211_421, 4_111_212_021)).toBeNull(); // existing balance far above any float limit
    expect(countedCashError(2 * 4_111_212_021, 4_111_212_021)).toBeNull();
  });
  it('refuses negative, non-finite and absurd counts', () => {
    expect(countedCashError(-1, 5000)).toMatch(/zero or more/);
    expect(countedCashError(Number.NaN, 5000)).toMatch(/zero or more/);
    expect(countedCashError(ABSOLUTE_MAX_CASH_AMOUNT + 1, 5000)).toMatch(/not a realistic/);
    expect(countedCashError(1e15, 4_111_212_021)).toMatch(/not a realistic/);
    expect(countedCashError(1, Number.NaN)).toMatch(/not a valid number/);
    expect(countedCashError(1, Number.POSITIVE_INFINITY)).toMatch(/not a valid number/);
  });
});
