import {
  areSaleLinesFullyReturned,
  fractionalReturnQuantityRejection,
  priceReturn,
  refundApprovalLimit,
  ReturnPricingError,
  DEFAULT_REFUND_MANAGER_APPROVAL_ABOVE,
  canChangeReturnStatus,
} from './returns-pricing.helper';

const lines = [
  { variantId: 'anchor', quantity: 2, total: 2300, productName: 'Anchor 400g' },   // 1,150 each
  { variantId: 'rice', quantity: 0.5, total: 130, productName: 'Rice (loose)' },    // 260 / kg
];

describe('priceReturn (F-02)', () => {
  it('prices from the sale, never from the client: 1 × Anchor refunds 1,150 (client may send 99,999)', () => {
    const r = priceReturn(lines, 2430, [{ variantId: 'anchor', quantity: 1 }], new Map());
    expect(r.lines[0].unitPrice).toBe(1150);
    expect(r.totalAmount).toBe(1150);
  });

  it('spreads a bill-level discount proportionally', () => {
    // 10% bill discount: sale.total 2,187 on lines worth 2,430
    const r = priceReturn(lines, 2187, [{ variantId: 'anchor', quantity: 2 }], new Map());
    expect(r.totalAmount).toBe(2070);
  });

  it('returning everything refunds exactly the sale total', () => {
    const r = priceReturn(lines, 2187, [{ variantId: 'anchor', quantity: 2 }, { variantId: 'rice', quantity: 0.5 }], new Map());
    expect(r.totalAmount).toBe(2187);
  });

  it('handles decimal quantities (0.25 kg of rice)', () => {
    const r = priceReturn(lines, 2430, [{ variantId: 'rice', quantity: 0.25 }], new Map());
    expect(r.totalAmount).toBe(65);
  });

  it('blocks returning more than sold in one request', () => {
    expect(() => priceReturn(lines, 2430, [{ variantId: 'anchor', quantity: 3 }], new Map())).toThrow(ReturnPricingError);
  });

  it('blocks cumulative over-returns across several returns (1 + 2 of 2 sold)', () => {
    expect(() => priceReturn(lines, 2430, [{ variantId: 'anchor', quantity: 2 }], new Map([['anchor', 1]]))).toThrow(/already returned 1, left 1/);
    expect(priceReturn(lines, 2430, [{ variantId: 'anchor', quantity: 1 }], new Map([['anchor', 1]])).totalAmount).toBe(1150);
  });

  it('combines duplicate rows for the same item before checking', () => {
    expect(() => priceReturn(lines, 2430, [{ variantId: 'anchor', quantity: 1 }, { variantId: 'anchor', quantity: 2 }], new Map())).toThrow(ReturnPricingError);
  });

  it('rejects items that were not on the invoice, and zero / negative quantities', () => {
    expect(() => priceReturn(lines, 2430, [{ variantId: 'kist', quantity: 1 }], new Map())).toThrow(/not on the original invoice/);
    expect(() => priceReturn(lines, 2430, [{ variantId: 'anchor', quantity: 0 }], new Map())).toThrow(ReturnPricingError);
    expect(() => priceReturn(lines, 2430, [{ variantId: 'anchor', quantity: -1 }], new Map())).toThrow(ReturnPricingError);
  });

  it('never refunds more than the remaining sale value (rounding guard)', () => {
    const three = [{ variantId: 'x', quantity: 3, total: 100, productName: 'X' }]; // 33.333… each
    const a = priceReturn(three, 100, [{ variantId: 'x', quantity: 2 }], new Map());
    const b = priceReturn(three, 100, [{ variantId: 'x', quantity: 1 }], new Map([['x', 2]]));
    expect(a.totalAmount + b.totalAmount).toBeLessThanOrEqual(100.01);
  });

  it('refunds nothing for a zero-value sale', () => {
    expect(priceReturn([{ variantId: 'free', quantity: 1, total: 0, productName: 'Free' }], 0, [{ variantId: 'free', quantity: 1 }], new Map()).totalAmount).toBe(0);
  });
});

describe('fractionalReturnQuantityRejection (P-F16)', () => {
  const piece = { productKind: 'STANDARD', allowDecimalSelling: false, unit: 'pcs' };
  const saleLines = [{ variantId: 'item', quantity: 2, total: 200, productName: 'Item' }];

  it('rejects fractional and accepts whole-number returns for piece/count products', () => {
    expect(fractionalReturnQuantityRejection('Item', 'item', 0.5, piece, saleLines)).toMatch(/whole units/);
    expect(fractionalReturnQuantityRejection('Item', 'item', 1, piece, saleLines)).toBeNull();
  });

  it('allows fractional returns for weighted or explicitly fraction-enabled products', () => {
    expect(fractionalReturnQuantityRejection(
      'Rice', 'item', 0.25, { ...piece, productKind: 'WEIGHTED' }, saleLines,
    )).toBeNull();
    expect(fractionalReturnQuantityRejection(
      'Fabric', 'item', 0.25, { ...piece, allowDecimalSelling: true }, saleLines,
    )).toBeNull();
  });

  it('preserves fractional return eligibility for a legacy sale line after product settings change', () => {
    const legacyLines = [{ variantId: 'item', quantity: 0.5, total: 50, productName: 'Item' }];
    expect(fractionalReturnQuantityRejection('Item', 'item', 0.25, piece, legacyLines)).toBeNull();
    expect(() => priceReturn(legacyLines, 50, [{ variantId: 'item', quantity: 0.6 }], new Map()))
      .toThrow(/exceeds what can still be returned/);
  });
});

describe('areSaleLinesFullyReturned', () => {
  it('aggregates duplicate sale lines by variant before deciding the sale is fully returned', () => {
    const saleLines = [
      { variantId: 'item', quantity: 1 },
      { variantId: 'item', quantity: 2 },
    ];

    expect(areSaleLinesFullyReturned(saleLines, new Map([['item', 2]]))).toBe(false);
    expect(areSaleLinesFullyReturned(saleLines, new Map([['item', 3]]))).toBe(true);
  });

  it('uses the return flow quantity precision when comparing fractional totals', () => {
    const saleLines = [
      { variantId: 'item', quantity: 0.1 },
      { variantId: 'item', quantity: 0.2 },
    ];

    expect(areSaleLinesFullyReturned(saleLines, new Map([['item', 0.3]]))).toBe(true);
  });
});

describe('refundApprovalLimit', () => {
  it('defaults to LKR 5,000 and honours a tenant setting', () => {
    expect(refundApprovalLimit({})).toBe(DEFAULT_REFUND_MANAGER_APPROVAL_ABOVE);
    expect(DEFAULT_REFUND_MANAGER_APPROVAL_ABOVE).toBe(5000);
    expect(refundApprovalLimit({ pos: { refundManagerApprovalAbove: 2000 } })).toBe(2000);
    expect(refundApprovalLimit({ pos: { refundManagerApprovalAbove: 'abc' } })).toBe(5000);
  });
});

describe('canChangeReturnStatus', () => {
  it('allows only the UI flow', () => {
    expect(canChangeReturnStatus('INITIATED', 'APPROVED')).toBe(true);
    expect(canChangeReturnStatus('INITIATED', 'REJECTED')).toBe(true);
    expect(canChangeReturnStatus('APPROVED', 'COMPLETED')).toBe(true);
    expect(canChangeReturnStatus('APPROVED', 'REFUND_PROCESSED')).toBe(true);
  });
  it('never un-approves or re-opens a return (would allow a second refund)', () => {
    for (const to of ['REJECTED', 'INITIATED', 'APPROVED']) expect(canChangeReturnStatus('APPROVED', to)).toBe(false);
    for (const from of ['REJECTED', 'COMPLETED', 'REFUND_PROCESSED']) {
      for (const to of ['INITIATED', 'APPROVED', 'REJECTED', 'COMPLETED', 'REFUND_PROCESSED']) expect(canChangeReturnStatus(from, to)).toBe(false);
    }
  });
});
