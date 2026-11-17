import { maskCardLast4, parseCardLast4 } from './card-payment.helper';

describe('card-payment.helper', () => {
  it('accepts exactly four digits (spaces around are ignored)', () => {
    expect(parseCardLast4('1234')).toBe('1234');
    expect(parseCardLast4(' 0042 ')).toBe('0042');
    expect(parseCardLast4(1234)).toBe('1234');
  });

  it('rejects anything that is not exactly four digits', () => {
    for (const bad of ['', '123', '12345', '12a4', '**** 1234', '1234 5678', '4111111111111111', '1 234', null, undefined, {}]) {
      expect(parseCardLast4(bad as never)).toBeNull();
    }
  });

  it('never keeps part of a full card number', () => {
    expect(parseCardLast4('4111-1111-1111-1111')).toBeNull();
  });

  it('masks for display', () => {
    expect(maskCardLast4('1234')).toBe('**** 1234');
    expect(maskCardLast4(null)).toBe('');
    expect(maskCardLast4('12345')).toBe('');
  });
});
