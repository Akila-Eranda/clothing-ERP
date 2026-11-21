import { Prisma } from '@prisma/client';
import {
  CLIENT_REQUEST_ID_PATTERN,
  decideSaleReplay,
  isClientRequestIdConflict,
  normalizeClientRequestId,
  saleRequestFingerprint,
  SaleFingerprintInput,
} from './pos-idempotency.helper';

const cart = (over: Partial<SaleFingerprintInput> = {}): SaleFingerprintInput => ({
  customerId: null,
  items: [
    { variantId: 'v1', quantity: 2, unitPrice: 100 },
    { variantId: 'v2', quantity: 0.375, unitPrice: 250, discount: 5, discountType: 'FIXED' },
  ],
  payments: [{ method: 'CASH', amount: 300 }],
  ...over,
});

const p2002 = (target: unknown) =>
  new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target },
  });

describe('POS idempotency helpers', () => {
  it('accepts UUID / nanoid style keys and rejects junk', () => {
    expect(CLIENT_REQUEST_ID_PATTERN.test('3f2b8c1e-9a4d-4c7e-8b1a-2d3e4f5a6b7c')).toBe(true);
    expect(CLIENT_REQUEST_ID_PATTERN.test('V1StGXR8_Z5jdHi6B-myT')).toBe(true);
    expect(CLIENT_REQUEST_ID_PATTERN.test('short')).toBe(false);
    expect(CLIENT_REQUEST_ID_PATTERN.test('has space in it')).toBe(false);
    expect(CLIENT_REQUEST_ID_PATTERN.test('x'.repeat(65))).toBe(false);
  });

  it('normalizes blank keys to null', () => {
    expect(normalizeClientRequestId(undefined)).toBeNull();
    expect(normalizeClientRequestId('   ')).toBeNull();
    expect(normalizeClientRequestId(' abcdefgh ')).toBe('abcdefgh');
  });

  it('fingerprints the same cart identically regardless of line order', () => {
    const a = cart();
    const b = cart({ items: [...cart().items].reverse() });
    expect(saleRequestFingerprint(a)).toBe(saleRequestFingerprint(b));
    expect(saleRequestFingerprint(a)).toMatch(/^[a-f0-9]{64}$/);
  });

  it('changes the fingerprint when anything charged changes', () => {
    const base = saleRequestFingerprint(cart());
    expect(saleRequestFingerprint(cart({ customerId: 'c1' }))).not.toBe(base);
    expect(saleRequestFingerprint(cart({ payments: [{ method: 'CARD', amount: 300 }] }))).not.toBe(base);
    expect(
      saleRequestFingerprint(cart({ items: [{ variantId: 'v1', quantity: 3, unitPrice: 100 }] })),
    ).not.toBe(base);
    expect(saleRequestFingerprint(cart({ discountAmount: 10 }))).not.toBe(base);
    expect(saleRequestFingerprint(cart({ couponCode: 'SAVE10' }))).not.toBe(base);
  });

  it('ignores float noise below gram precision', () => {
    expect(
      saleRequestFingerprint(cart({ items: [{ variantId: 'v1', quantity: 0.1 + 0.2, unitPrice: 100 }] })),
    ).toBe(saleRequestFingerprint(cart({ items: [{ variantId: 'v1', quantity: 0.3, unitPrice: 100 }] })));
  });

  it('detects only the clientRequestId unique violation', () => {
    expect(isClientRequestIdConflict(p2002(['tenantId', 'clientRequestId']))).toBe(true);
    expect(isClientRequestIdConflict(p2002('sales_tenantId_clientRequestId_key'))).toBe(true);
    expect(isClientRequestIdConflict(p2002(['tenantId', 'invoiceNumber']))).toBe(false);
    expect(isClientRequestIdConflict(new Error('boom'))).toBe(false);
  });

  it('replays only for the same branch, cashier and cart', () => {
    const fp = saleRequestFingerprint(cart());
    const existing = { branchId: 'b1', cashierId: 'u1', metadata: { requestFingerprint: fp } };
    expect(decideSaleReplay(existing, { branchId: 'b1', cashierId: 'u1', fingerprint: fp })).toEqual({ kind: 'REPLAY' });
    expect(decideSaleReplay(existing, { branchId: 'b2', cashierId: 'u1', fingerprint: fp }).kind).toBe('CONFLICT');
    expect(decideSaleReplay(existing, { branchId: 'b1', cashierId: 'u2', fingerprint: fp }).kind).toBe('CONFLICT');
    expect(decideSaleReplay(existing, { branchId: 'b1', cashierId: 'u1', fingerprint: 'other' })).toEqual({
      kind: 'CONFLICT',
      reason: 'clientRequestId was already used for a different cart',
    });
  });
});

describe('saleRequestFingerprint — card last 4 / QR code (Nov 2026)', () => {
  const base = { items: [{ variantId: 'v1', quantity: 1, unitPrice: 100 }], payments: [{ method: 'CARD', amount: 100, reference: '1234' }] };
  it('is unchanged for requests without the new fields (older clients / stored fingerprints)', () => {
    expect(saleRequestFingerprint(base)).toBe(saleRequestFingerprint({ ...base, payments: [{ method: 'CARD', amount: 100, reference: '1234', cardLast4: null, qrCodeId: '' }] }));
  });
  it('a different card or QR code is a different request', () => {
    const a = saleRequestFingerprint({ ...base, payments: [{ method: 'CARD', amount: 100, cardLast4: '1234' }] });
    const b = saleRequestFingerprint({ ...base, payments: [{ method: 'CARD', amount: 100, cardLast4: '9999' }] });
    expect(a).not.toBe(b);
    const q1 = saleRequestFingerprint({ ...base, payments: [{ method: 'QR', amount: 100, qrCodeId: 'qr1' }] });
    const q2 = saleRequestFingerprint({ ...base, payments: [{ method: 'QR', amount: 100, qrCodeId: 'qr2' }] });
    expect(q1).not.toBe(q2);
  });
});
