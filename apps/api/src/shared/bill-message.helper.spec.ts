import { BILL_PLACEHOLDERS, DEFAULT_BILL_TEMPLATE, billTemplateError, formatBillItems, renderBillMessage, resolveBillTemplate } from './bill-message.helper';

const base = {
  customerName: 'Nimal Perera',
  customerPhone: '0771234567',
  shopName: 'Hexa Mart',
  shopPhone: '0112223334',
  invoiceNumber: 'INV-20261112-0001',
  date: '2026-11-12T08:30:00.000Z',
  items: [
    { name: 'Tea', variant: 'Default', quantity: 2, unitPrice: 250, total: 500 },
    { name: 'Rice', variant: '5kg', quantity: 1.5, unitPrice: 1234.5, total: 1851.75 },
  ],
  total: 2351.75,
  paymentMethod: 'CASH',
  customerCreditBalance: 12500.5,
};

describe('bill message', () => {
  it('renders the default template with real invoice and customer data', () => {
    expect(renderBillMessage(DEFAULT_BILL_TEMPLATE, base)).toBe(
      [
        'Hi Nimal Perera',
        '',
        'Your Bill',
        '',
        'Hexa Mart',
        'Shop no - 0112223334',
        '',
        'Bill: INV-20261112-0001',
        '',
        'Items:',
        '• Tea — 2 × 250.00 = 500.00',
        '• Rice (5kg) — 1.5 × 1,234.50 = 1,851.75',
        '',
        'Total: LKR 2,351.75',
        'Payment: CASH',
        '',
        'Account Summary:',
        'Total Credit Balance: LKR 12,500.50',
        '',
        'Thank you for shopping with us!',
      ].join('\n'),
    );
  });

  it('each item shows name, unit price, quantity and line total', () => {
    expect(formatBillItems(base.items)).toBe('• Tea — 2 × 250.00 = 500.00\n• Rice (5kg) — 1.5 × 1,234.50 = 1,851.75');
  });

  it('keeps line breaks exactly (copy / share keeps the layout)', () => {
    const out = renderBillMessage('A\n\nB {invoice_number}\r\nC', base);
    expect(out).toBe('A\n\nB INV-20261112-0001\nC');
    expect(out).not.toContain('\r');
  });

  it('handles missing optional data safely', () => {
    const out = renderBillMessage(DEFAULT_BILL_TEMPLATE, { items: [], total: null, customerName: null, shopPhone: '', paymentMethod: undefined });
    expect(out).toContain('Hi Customer');
    expect(out).not.toContain('Shop no');           // line with only an empty placeholder is dropped
    expect(out).not.toContain('Payment:');
    expect(out).toContain('Total: LKR 0.00');
    expect(out).toContain('Total Credit Balance: LKR 0.00');
    expect(out).not.toMatch(/\{[a-z_]+\}/);          // no raw placeholder leaks
    expect(out).not.toMatch(/\n{3,}/);               // no big gaps from dropped lines
  });

  it('a custom template with other placeholders', () => {
    expect(renderBillMessage('{shop_name}: {total} on {date}, paid {amount_paid}, change {change}, wallet {customer_wallet_balance}', { ...base, amountPaid: 3000, change: 648.25, customerWalletBalance: 100 }))
      .toBe('Hexa Mart: 2,351.75 on 2026-11-12, paid 3,000.00, change 648.25, wallet 100.00');
  });

  it('unknown placeholders are refused when saving and left as typed when rendering', () => {
    expect(billTemplateError('Hi {customer_name} {nope}')).toBe('Unknown placeholder: {nope}');
    expect(billTemplateError('{a} {b}')).toMatch(/Unknown placeholders: \{a\}, \{b\}/);
    expect(renderBillMessage('x {nope} y', base)).toBe('x {nope} y');
  });

  it('template validation', () => {
    expect(billTemplateError(DEFAULT_BILL_TEMPLATE)).toBeNull();
    expect(billTemplateError('   ')).toMatch(/empty/);
    expect(billTemplateError('x'.repeat(2001))).toMatch(/longer than/);
    expect(billTemplateError(42 as unknown as string)).toMatch(/text/);
  });

  it('every documented placeholder is accepted', () => {
    const all = BILL_PLACEHOLDERS.map((p) => `{${p.key}}`).join(' ');
    expect(billTemplateError(all)).toBeNull();
    expect(renderBillMessage(all, base)).not.toMatch(/\{[a-z_]+\}/);
  });

  it('uses the shop template when valid, else the default', () => {
    expect(resolveBillTemplate({ billMessageTemplate: 'Hello {customer_name}' })).toBe('Hello {customer_name}');
    expect(resolveBillTemplate({ billMessageTemplate: 'Hello {oops}' })).toBe(DEFAULT_BILL_TEMPLATE);
    expect(resolveBillTemplate({})).toBe(DEFAULT_BILL_TEMPLATE);
    expect(resolveBillTemplate(null)).toBe(DEFAULT_BILL_TEMPLATE);
  });
});
