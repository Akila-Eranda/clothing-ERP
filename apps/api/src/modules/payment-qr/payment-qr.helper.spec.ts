import { PaymentMethod } from '@prisma/client';
import {
  assertQrCodesForPayments, buildDynamicEmvPayload, crc16Ccitt, emvMerchantName, parseEmvPayload, validateEmvPayload,
} from './payment-qr.helper';

const tlv = (tag: string, v: string) => `${tag}${String(v.length).padStart(2, '0')}${v}`;
function staticPayload(): string {
  const body = [
    tlv('00', '01'), tlv('01', '11'),
    tlv('26', tlv('00', 'lk.lankaqr') + tlv('01', '1234567890')),
    tlv('52', '5411'), tlv('53', '144'), tlv('58', 'LK'), tlv('59', 'ACME STORE'), tlv('60', 'COLOMBO'),
  ].join('') + '6304';
  return body + crc16Ccitt(body);
}

describe('payment-qr.helper', () => {
  it('CRC-16/CCITT-FALSE matches the standard check value', () => {
    expect(crc16Ccitt('123456789')).toBe('29B1');
  });

  it('accepts a well-formed static payload and reads the merchant name', () => {
    const p = staticPayload();
    expect(validateEmvPayload(p)).toBeNull();
    expect(emvMerchantName(p)).toBe('ACME STORE');
  });

  it('rejects broken payloads with a clear reason', () => {
    const p = staticPayload();
    expect(validateEmvPayload('')).toMatch(/empty/);
    expect(validateEmvPayload('hello world')).toMatch(/not a valid/);
    expect(validateEmvPayload(p.slice(0, -4) + '0000')).toMatch(/checksum/);
    expect(validateEmvPayload(p.slice(0, -8))).toMatch(/CRC|valid/);
  });

  it('builds a dynamic payload: point of initiation 12, exact amount, valid CRC', () => {
    const d = buildDynamicEmvPayload(staticPayload(), 1234.5);
    expect(validateEmvPayload(d)).toBeNull();
    const fields = parseEmvPayload(d)!;
    expect(fields[0]).toEqual({ tag: '00', value: '01' });
    expect(fields.find((f) => f.tag === '01')!.value).toBe('12');
    expect(fields.find((f) => f.tag === '54')!.value).toBe('1234.50');
    // amount sits right after the currency, merchant fields kept in order
    const tags = fields.map((f) => f.tag);
    expect(tags.indexOf('54')).toBe(tags.indexOf('53') + 1);
    expect(tags[tags.length - 1]).toBe('63');
    expect(emvMerchantName(d)).toBe('ACME STORE');
  });

  it('replaces an existing amount instead of adding a second one', () => {
    const once = buildDynamicEmvPayload(staticPayload(), 100);
    const twice = buildDynamicEmvPayload(once, 250.75);
    expect(parseEmvPayload(twice)!.filter((f) => f.tag === '54').map((f) => f.value)).toEqual(['250.75']);
  });

  it('refuses a zero / negative amount or an invalid payload', () => {
    expect(() => buildDynamicEmvPayload(staticPayload(), 0)).toThrow(/greater than zero/);
    expect(() => buildDynamicEmvPayload('bad', 10)).toThrow();
  });

  describe('assertQrCodesForPayments', () => {
    const db = (codes: { id: string; bankAccountId: string }[]) => ({ paymentQrCode: { findMany: jest.fn().mockResolvedValue(codes) } });

    it('allows QR payments without a code, and other methods', async () => {
      const d = db([]);
      await expect(assertQrCodesForPayments(d as never, 't1', 'b1', [
        { method: PaymentMethod.QR, bankAccountId: 'bank1' }, { method: PaymentMethod.CASH },
      ])).resolves.toBeUndefined();
      expect(d.paymentQrCode.findMany).not.toHaveBeenCalled();
    });

    it('checks the code is this tenant + branch, active, and for the same bank account', async () => {
      const d = db([{ id: 'qr1', bankAccountId: 'bank1' }]);
      await assertQrCodesForPayments(d as never, 't1', 'b1', [{ method: PaymentMethod.QR, bankAccountId: 'bank1', qrCodeId: 'qr1' }]);
      const where = d.paymentQrCode.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ tenantId: 't1', isActive: true, OR: [{ branchId: null }, { branchId: 'b1' }] });
      await expect(assertQrCodesForPayments(d as never, 't1', 'b1', [{ method: PaymentMethod.QR, bankAccountId: 'bank2', qrCodeId: 'qr1' }]))
        .rejects.toThrow(/different bank account/);
      await expect(assertQrCodesForPayments(db([]) as never, 't1', 'b1', [{ method: PaymentMethod.QR, bankAccountId: 'bank1', qrCodeId: 'other-shop' }]))
        .rejects.toThrow(/not available/);
    });
  });
});
