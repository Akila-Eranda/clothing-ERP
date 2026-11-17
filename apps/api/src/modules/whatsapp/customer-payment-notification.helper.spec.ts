import {
  buildCustomerPaymentMessage,
  normalizeCustomerWhatsappPhone,
  whatsappConsent,
  withWhatsappConsent,
} from './customer-payment-notification.helper';

describe('customer payment WhatsApp notification helper', () => {
  it('requires an explicit customer opt-in', () => {
    expect(whatsappConsent({})).toBe(false);
    expect(whatsappConsent({ whatsappConsent: true })).toBe(true);
    expect(whatsappConsent({ whatsapp: { consent: true } })).toBe(true);
    expect(whatsappConsent({ whatsappConsent: 'true' })).toBe(false);
  });

  it('treats the current opt-out as authoritative over stale legacy consent', () => {
    expect(whatsappConsent({ whatsappConsent: false, whatsapp: { consent: true } })).toBe(false);
  });

  it('updates only the explicit consent value and preserves existing customer metadata', () => {
    const updated = withWhatsappConsent({ loyaltySegment: 'regular', whatsappConsent: true }, false);

    expect(updated).toEqual({ loyaltySegment: 'regular', whatsappConsent: false });
    expect(whatsappConsent(updated)).toBe(false);
    expect(withWhatsappConsent(null, true)).toEqual({ whatsappConsent: true });
  });

  it('revokes consent stored in the legacy nested metadata shape', () => {
    const updated = withWhatsappConsent({ whatsapp: { consent: true, source: 'customer-form' } }, false);

    expect(updated).toEqual({
      whatsappConsent: false,
      whatsapp: { consent: false, source: 'customer-form' },
    });
    expect(whatsappConsent(updated)).toBe(false);
  });

  it('normalizes and validates customer phone numbers', () => {
    expect(normalizeCustomerWhatsappPhone('0771234567')).toBe('94771234567');
    expect(normalizeCustomerWhatsappPhone('not-a-phone')).toBeNull();
  });

  it('builds a receipt without sensitive payment data', () => {
    const message = buildCustomerPaymentMessage({
      customerName: 'Nimal',
      amount: 1500,
      appliedToCredit: 1200,
      advanceToWallet: 300,
      remainingCredit: 800,
      paymentMethod: 'CARD',
      paymentTxnId: 'payment-id',
    });

    expect(message).toContain('LKR 1500.00');
    expect(message).toContain('Remaining credit balance: LKR 800.00');
    expect(message).not.toContain('payment-id');
    expect(message).not.toContain('CVV');
  });
});
