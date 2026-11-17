import {
  auditBankSnapshot,
  bankDetailErrors,
  cleanBankDetails,
  cleanText,
  isSameBankAccount,
  maskAccountNumber,
  normalizeAccountNumber,
  requiresBankDetails,
} from './bank-account.helper';

const GOOD = { bankName: 'Bank of Ceylon', accountNumber: '0081 2345 6789', accountHolderName: 'Lanka Traders (Pvt) Ltd', branchName: 'Colombo Fort', branchCode: '001' };

describe('bank details: required and format rules', () => {
  it('a complete, valid set passes', () => {
    expect(bankDetailErrors(GOOD, { requireAll: true })).toEqual([]);
  });

  it('every detail is required when requireAll', () => {
    const errs = bankDetailErrors({}, { requireAll: true });
    expect(errs).toEqual(['Bank name is required', 'Account number is required', 'Account holder name is required', 'Branch is required', 'Branch code is required']);
    expect(bankDetailErrors({ ...GOOD, branchCode: '   ' }, { requireAll: true })).toEqual(['Branch code is required']);
    expect(bankDetailErrors({ ...GOOD, accountHolderName: null }, { requireAll: true })).toEqual(['Account holder name is required']);
  });

  it('nothing is required when not requireAll (cash / petty cash), but values present are still checked', () => {
    expect(bankDetailErrors({}, { requireAll: false })).toEqual([]);
    expect(bankDetailErrors({ accountNumber: '12' }, { requireAll: false })).toEqual(['Account number must be 6–30 letters or digits (spaces and hyphens allowed)']);
  });

  it('account number: 6–30 alphanumerics, spaces / hyphens allowed, nothing else', () => {
    const ok = (n: string) => bankDetailErrors({ ...GOOD, accountNumber: n }, { requireAll: true }).length === 0;
    expect(ok('123456')).toBe(true);
    expect(ok('1234-5678-90')).toBe(true);
    expect(ok('LK12ABCD34567890')).toBe(true);
    expect(ok('12345')).toBe(false);
    expect(ok('1'.repeat(31))).toBe(false);
    expect(ok('1234 5678 !')).toBe(false);
    expect(ok('-123456')).toBe(false);
    expect(ok('12345678<script>')).toBe(false);
  });

  it('names and codes: length, allowed characters, no markup', () => {
    const errs = (patch: object) => bankDetailErrors({ ...GOOD, ...patch }, { requireAll: true });
    expect(errs({ bankName: 'A' })).toHaveLength(1);
    expect(errs({ bankName: 'B'.repeat(81) })).toHaveLength(1);
    expect(errs({ accountHolderName: '1234' })).toHaveLength(1);               // must contain a letter
    expect(errs({ accountHolderName: '<b>Evil</b>' })).toHaveLength(1);
    expect(errs({ accountHolderName: 'සමන් පෙරේරා' })).toEqual([]);              // non-Latin letters are fine
    expect(errs({ branchName: 'x' })).toHaveLength(1);
    expect(errs({ branchCode: '1234567890123' })).toHaveLength(1);
    expect(errs({ branchCode: 'AB 12' })).toHaveLength(1);
    expect(errs({ branchCode: 'AB-12' })).toEqual([]);
    expect(errs({ bankName: 'Bank\nof Ceylon' })).toEqual([]);                   // inner whitespace is collapsed first
    expect(errs({ bankName: 'Bank\u0000x' })).toHaveLength(1);                   // control characters are not
  });

  it('which account types need full details', () => {
    expect(requiresBankDetails('CURRENT')).toBe(true);
    expect(requiresBankDetails('SAVINGS')).toBe(true);
    expect(requiresBankDetails('CASH_IN_HAND')).toBe(false);
    expect(requiresBankDetails('PETTY_CASH')).toBe(false);
    expect(requiresBankDetails(undefined)).toBe(false);
  });
});

describe('bank details: normalising, masking, duplicates, audit', () => {
  it('cleanText trims, collapses spaces, turns blanks into null', () => {
    expect(cleanText('  Bank   of  Ceylon ')).toBe('Bank of Ceylon');
    expect(cleanText('   ')).toBeNull();
    expect(cleanText(undefined)).toBeNull();
    expect(cleanText(12 as unknown)).toBeNull();
    expect(cleanBankDetails({ bankName: ' BOC ', accountNumber: '' })).toEqual({ bankName: 'BOC', accountNumber: null, accountHolderName: null, branchName: null, branchCode: null });
  });

  it('account numbers compare without spaces, hyphens and case', () => {
    expect(normalizeAccountNumber('0081-2345 6789')).toBe('008123456789');
    expect(normalizeAccountNumber('lk12ab')).toBe('LK12AB');
    expect(isSameBankAccount({ bankName: 'BOC', accountNumber: '0081 2345' }, { bankName: 'boc', accountNumber: '0081-2345' })).toBe(true);
    expect(isSameBankAccount({ bankName: 'BOC', accountNumber: '0081 2345' }, { bankName: 'HNB', accountNumber: '0081-2345' })).toBe(false);
    expect(isSameBankAccount({ bankName: 'BOC', accountNumber: '' }, { bankName: 'BOC', accountNumber: '' })).toBe(false);
  });

  it('masking keeps only the last 4 characters', () => {
    expect(maskAccountNumber('0081 2345 6789')).toBe('••••6789');
    expect(maskAccountNumber('')).toBe('');
    expect(maskAccountNumber(null)).toBe('');
  });

  it('audit snapshot never carries the account number, only its last 4', () => {
    const snap = auditBankSnapshot({ ...GOOD, code: 'BOC1', name: 'BOC Current', type: 'CURRENT', isActive: true });
    expect(JSON.stringify(snap)).not.toContain('008123456789');
    expect(JSON.stringify(snap)).not.toContain('0081 2345');
    expect(snap).toMatchObject({ accountLast4: '••••6789', bankName: 'Bank of Ceylon', branchCode: '001', isActive: true });
    expect(Object.keys(snap)).not.toContain('accountNumber');
  });
});
