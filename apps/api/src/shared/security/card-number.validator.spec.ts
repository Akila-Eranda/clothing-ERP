import { IsOptional, IsString, validate } from 'class-validator';
import { containsCardNumber, NoCardNumber } from './card-number.validator';

describe('card number detection in free-text references', () => {
  it('finds full card numbers, written plainly or with spaces / dashes / around text', () => {
    for (const v of ['4111111111111111', '4111 1111 1111 1111', '5555-5555-5555-4444', 'paid with 378282246310005 ok', '6011111111111117', '3530111333300000']) {
      expect(containsCardNumber(v)).toBe(true);
    }
  });

  it('keeps legitimate references: last 4, cheque numbers, short ids, invalid checksums, non-card prefixes', () => {
    for (const v of ['4242', '000123', 'INV-2026-00045', 'TXN 20261109 001', '4111111111111112', '9876543210987654', '1234567890123', 'BOC-ref-77812345', '41111111111111111111111', '20261109123456789012345678', '', undefined, null, 123]) {
      expect(containsCardNumber(v as never)).toBe(false);
    }
  });

  it('decorator refuses card numbers with a clear message', async () => {
    class Dto {
      @IsOptional() @IsString() @NoCardNumber() reference?: string;
    }
    const bad = Object.assign(new Dto(), { reference: '4111 1111 1111 1111' });
    const errors = await validate(bad);
    expect(errors[0].constraints?.noCardNumber).toMatch(/full card number/);
    expect(await validate(Object.assign(new Dto(), { reference: 'BANK-TXN-778812' }))).toEqual([]);
  });
});
