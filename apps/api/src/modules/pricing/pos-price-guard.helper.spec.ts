import { RoleType } from '@prisma/client';
import {
  canOverridePosPrice,
  describePosPriceViolation,
  findPosPriceViolation,
  maxAllowedUnitPrice,
  minAllowedUnitPrice,
  netUnitPrice,
  PosCatalogPriceContext,
} from './pos-price-guard.helper';

const ctx = (over: Partial<PosCatalogPriceContext> = {}): PosCatalogPriceContext => ({
  knownPrices: [100],
  mrp: 120,
  costPrice: 80,
  isWeighted: false,
  ...over,
});

describe('POS price guard', () => {
  it('allows catalog, PO and MRP prices', () => {
    expect(findPosPriceViolation({ unitPrice: 100, quantity: 2 }, ctx())).toBeNull();
    expect(findPosPriceViolation({ unitPrice: 115, quantity: 1 }, ctx({ knownPrices: [100, 115] }))).toBeNull();
    expect(findPosPriceViolation({ unitPrice: 120, quantity: 1 }, ctx())).toBeNull();
  });

  it('allows cashier price cuts down to cost', () => {
    expect(findPosPriceViolation({ unitPrice: 85, quantity: 1 }, ctx())).toBeNull();
    expect(findPosPriceViolation({ unitPrice: 80, quantity: 3 }, ctx())).toBeNull();
  });

  it('blocks prices above MRP and every known price', () => {
    expect(findPosPriceViolation({ unitPrice: 121, quantity: 1 }, ctx())).toEqual({
      kind: 'ABOVE_MAX_PRICE',
      unitPrice: 121,
      limit: 120,
    });
  });

  it('uses the highest known price when catalog price is above a stale MRP', () => {
    expect(maxAllowedUnitPrice(ctx({ knownPrices: [150], mrp: 120 }))).toBe(150);
    expect(findPosPriceViolation({ unitPrice: 150, quantity: 1 }, ctx({ knownPrices: [150] }))).toBeNull();
  });

  it('blocks net price below cost including line discounts', () => {
    expect(netUnitPrice({ unitPrice: 100, quantity: 2, discount: 50, discountType: 'FIXED' })).toBe(75);
    expect(
      findPosPriceViolation({ unitPrice: 100, quantity: 2, discount: 50, discountType: 'FIXED' }, ctx()),
    ).toEqual({ kind: 'BELOW_COST', unitPrice: 75, limit: 80 });
    expect(
      findPosPriceViolation({ unitPrice: 100, quantity: 1, discount: 25, discountType: 'PERCENTAGE' }, ctx()),
    ).toEqual({ kind: 'BELOW_COST', unitPrice: 75, limit: 80 });
    expect(findPosPriceViolation({ unitPrice: 1, quantity: 1 }, ctx())?.kind).toBe('BELOW_COST');
  });

  it('allows a catalog price the shop set below cost, but not lower', () => {
    const clearance = ctx({ knownPrices: [100], mrp: 0, costPrice: 120 });
    expect(minAllowedUnitPrice(clearance)).toBe(100);
    expect(findPosPriceViolation({ unitPrice: 100, quantity: 1 }, clearance)).toBeNull();
    expect(findPosPriceViolation({ unitPrice: 90, quantity: 1 }, clearance)).toEqual({
      kind: 'BELOW_COST',
      unitPrice: 90,
      limit: 100,
    });
  });

  it('skips cost check when cost is unknown and max check when no prices exist', () => {
    expect(findPosPriceViolation({ unitPrice: 1, quantity: 1 }, ctx({ costPrice: 0 }))).toBeNull();
    expect(
      findPosPriceViolation({ unitPrice: 999, quantity: 1 }, ctx({ knownPrices: [], mrp: 0, costPrice: 0 })),
    ).toBeNull();
  });

  it('applies catalog price and cost limits to weighed goods', () => {
    const weighted = ctx({ isWeighted: true });
    expect(findPosPriceViolation({ unitPrice: 100, quantity: 0.25 }, weighted)).toBeNull();
    expect(findPosPriceViolation({ unitPrice: 750, quantity: 1 }, weighted)?.kind).toBe('ABOVE_MAX_PRICE');
    expect(findPosPriceViolation({ unitPrice: 50, quantity: 0.25 }, weighted)?.kind).toBe('BELOW_COST');
    expect(
      findPosPriceViolation({ unitPrice: 50, quantity: 0.25 }, ctx({ isWeighted: true, costPrice: 0 }))?.kind,
    ).toBe('BELOW_COST');
  });

  it('tolerates rounding noise', () => {
    expect(findPosPriceViolation({ unitPrice: 120.005, quantity: 1 }, ctx())).toBeNull();
    expect(findPosPriceViolation({ unitPrice: 79.995, quantity: 1 }, ctx())).toBeNull();
  });

  it('lets managers and admins override', () => {
    expect(canOverridePosPrice([RoleType.CASHIER])).toBe(false);
    expect(canOverridePosPrice([RoleType.BRANCH_MANAGER])).toBe(true);
    expect(canOverridePosPrice([RoleType.TENANT_ADMIN])).toBe(true);
  });

  it('describes violations for the cashier', () => {
    expect(
      describePosPriceViolation('Milk 1L', { kind: 'BELOW_COST', unitPrice: 75, limit: 80 }),
    ).toContain('below cost LKR 80.00');
  });
});
