import { maskAccountNumber, validateCustomerBank } from './customer-bank.helper';

const ok = { bankName: 'Bank of Ceylon', accountNumber: '0012 3456 7890', accountHolderName: 'K. Nimal Perera', branchName: 'Colombo Fort', branchCode: '7010' };

describe('customer bank details validation', () => {
  it('accepts a full set and trims / normalises spaces', () => {
    const r = validateCustomerBank({ ...ok, bankName: '  Bank   of Ceylon ' });
    expect(r).toEqual({ ok: true, value: { bankName: 'Bank of Ceylon', accountNumber: '0012 3456 7890', accountHolderName: 'K. Nimal Perera', branchName: 'Colombo Fort', branchCode: '7010' } });
  });
  it('branch and branch code are optional (stored as null)', () => {
    const r = validateCustomerBank({ bankName: 'Sampath Bank', accountNumber: '1234567', accountHolderName: 'A B' });
    expect(r).toMatchObject({ ok: true, value: { branchName: null, branchCode: null } });
  });
  it('bank name, account number and holder are required', () => {
    expect(validateCustomerBank({ ...ok, bankName: ' ' })).toEqual({ ok: false, error: 'Bank name is required' });
    expect(validateCustomerBank({ ...ok, accountNumber: '' })).toEqual({ ok: false, error: 'Account number is required' });
    expect(validateCustomerBank({ ...ok, accountHolderName: undefined })).toEqual({ ok: false, error: 'Account holder name is required' });
  });
  it('rejects malformed values', () => {
    expect(validateCustomerBank({ ...ok, accountNumber: '12' })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, accountNumber: '1234-5678-<script>' })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, accountNumber: '9'.repeat(35) })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, bankName: '<b>Bank</b>' })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, accountHolderName: 'x'.repeat(101) })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, branchCode: 'AB 12' })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, branchCode: '1'.repeat(21) })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, branchName: '$$$' })).toMatchObject({ ok: false });
    expect(validateCustomerBank({ ...ok, accountNumber: 12345678 })).toEqual({ ok: false, error: 'accountNumber must be text' });
  });
  it('accepts international names and IBAN-style numbers', () => {
    expect(validateCustomerBank({ bankName: "People's Bank (Sri Lanka)", accountNumber: 'LK55 1234 5678 9012 3456', accountHolderName: 'සුනිල් පෙරේරා' })).toMatchObject({ ok: true });
  });
});

describe('account number masking', () => {
  it('shows only the last four characters', () => {
    expect(maskAccountNumber('0012 3456 7890')).toBe('********7890');
    expect(maskAccountNumber('1234')).toBe('****');
    expect(maskAccountNumber('12')).toBe('**');
    expect(maskAccountNumber(null)).toBe('');
  });
});
