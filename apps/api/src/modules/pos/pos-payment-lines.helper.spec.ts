import { PaymentMethod as M } from '@prisma/client';
import { PAYMENT_REFERENCE_MAX, paymentLineReferences, preparePaymentLines } from './pos-payment-lines.helper';

describe('preparePaymentLines (audit H1)', () => {
  it('validates card digits on EVERY line, including zero-amount lines', () => {
    expect(() => preparePaymentLines([{ method: M.CASH, amount: 100 }, { method: M.CARD, amount: 0, reference: '4111111111111111' }]))
      .toThrow(/last 4 digits/);
    for (const bad of ['', '123', '12345', '12a4', '4111 1111 1111 1111']) {
      expect(() => preparePaymentLines([{ method: M.CARD, amount: 50, cardLast4: bad }])).toThrow(/Payment line 1/);
    }
  });

  it('stores only the 4 digits on card lines, in cardLast4 and reference', () => {
    expect(preparePaymentLines([{ method: M.CARD, amount: 50, cardLast4: ' 4242 ' }])).toEqual([{ method: M.CARD, amount: 50, cardLast4: '4242', reference: '4242' }]);
    expect(preparePaymentLines([{ method: M.CARD, amount: 50, reference: '1111' }])[0]).toMatchObject({ cardLast4: '1111' });
  });

  it('refuses references longer than 64 characters', () => {
    const long = 'X'.repeat(PAYMENT_REFERENCE_MAX + 1);
    expect(() => preparePaymentLines([{ method: M.CHEQUE, amount: 10, reference: long }])).toThrow(/longer than 64/);
    expect(preparePaymentLines([{ method: M.CHEQUE, amount: 10, reference: 'X'.repeat(64) }])[0].reference).toHaveLength(64);
  });

  it('never stores card digits, bank accounts or QR codes on the wrong method', () => {
    const out = preparePaymentLines([
      { method: M.CASH, amount: 10, cardLast4: '9999', bankAccountId: 'b1', qrCodeId: 'q1' },
      { method: M.BANK_TRANSFER, amount: 5, bankAccountId: 'b1', qrCodeId: 'q1', cardLast4: '1234' },
    ]);
    expect(out).toEqual([
      { method: M.CASH, amount: 10 },
      { method: M.BANK_TRANSFER, amount: 5, bankAccountId: 'b1' },
    ]);
  });

  it('drops zero-amount lines; keeps the first line when every line is zero', () => {
    expect(preparePaymentLines([{ method: M.CASH, amount: 300 }, { method: M.QR, amount: 0, bankAccountId: 'b1' }])).toEqual([{ method: M.CASH, amount: 300 }]);
    expect(preparePaymentLines([{ method: M.CASH, amount: 0 }, { method: M.CARD, amount: 0, cardLast4: '1234' }])).toEqual([{ method: M.CASH, amount: 0 }]);
  });

  it('keeps valid split payments in order', () => {
    const out = preparePaymentLines([
      { method: M.CASH, amount: 100 },
      { method: M.CARD, amount: 200, cardLast4: '4242' },
      { method: M.QR, amount: 50, bankAccountId: 'b1', qrCodeId: 'q1' },
    ]);
    expect(out.map((p) => [p.method, p.amount])).toEqual([[M.CASH, 100], [M.CARD, 200], [M.QR, 50]]);
  });

  it('rejects an empty payment list and negative amounts', () => {
    expect(() => preparePaymentLines([])).toThrow(/At least one/);
    expect(() => preparePaymentLines([{ method: M.CASH, amount: -1 }])).toThrow(/zero or more/);
  });

  it('collects bank / QR references from every bank line, including zero-amount ones', () => {
    expect(paymentLineReferences([
      { method: M.CASH, amount: 10, bankAccountId: 'ignored' },
      { method: M.QR, amount: 0, bankAccountId: 'other-shop-bank', qrCodeId: 'other-shop-qr' },
      { method: M.BANK_TRANSFER, amount: 0, bankAccountId: 'b2' },
    ])).toEqual({ bankAccountIds: ['other-shop-bank', 'b2'], qr: [{ qrCodeId: 'other-shop-qr', bankAccountId: 'other-shop-bank' }] });
  });
});
