/**
 * Customer bank details: validation and masking (pure functions).
 * The account number is never logged or sent to the audit trail in full (see maskAccountNumber).
 */

export type CustomerBankInput = {
  bankName?: unknown;
  accountNumber?: unknown;
  accountHolderName?: unknown;
  branchName?: unknown;
  branchCode?: unknown;
};

export type CustomerBankClean = {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string | null;
  branchCode: string | null;
};

const clean = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

const NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,&'()\-/]*$/u; // \p{M}: vowel signs of Sinhala / Tamil names
const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9 \-]*$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9\-]*$/;

/** Cleaned details, or the first validation problem. Bank name, account number and holder are required. */
export function validateCustomerBank(input: CustomerBankInput): { ok: true; value: CustomerBankClean } | { ok: false; error: string } {
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null && typeof v !== 'string') return { ok: false, error: `${k} must be text` };
  }
  const bankName = clean(input.bankName);
  const accountNumber = clean(input.accountNumber);
  const accountHolderName = clean(input.accountHolderName);
  const branchName = clean(input.branchName);
  const branchCode = clean(input.branchCode);

  if (!bankName) return { ok: false, error: 'Bank name is required' };
  if (bankName.length > 100 || !NAME.test(bankName)) return { ok: false, error: 'Bank name has invalid characters or is too long (max 100)' };
  if (!accountNumber) return { ok: false, error: 'Account number is required' };
  const digits = accountNumber.replace(/[ \-]/g, '');
  if (!ACCOUNT.test(accountNumber) || digits.length < 4 || digits.length > 34) {
    return { ok: false, error: 'Account number must be 4 to 34 letters or digits (spaces and hyphens allowed)' };
  }
  if (!accountHolderName) return { ok: false, error: 'Account holder name is required' };
  if (accountHolderName.length > 100 || !NAME.test(accountHolderName)) return { ok: false, error: 'Account holder name has invalid characters or is too long (max 100)' };
  if (branchName && (branchName.length > 100 || !NAME.test(branchName))) return { ok: false, error: 'Branch has invalid characters or is too long (max 100)' };
  if (branchCode && (branchCode.length > 20 || !CODE.test(branchCode))) return { ok: false, error: 'Branch code must be letters, digits or hyphens (max 20)' };

  return { ok: true, value: { bankName, accountNumber, accountHolderName, branchName: branchName || null, branchCode: branchCode || null } };
}

/** "1234567890" → "******7890" (audit trail, logs). */
export function maskAccountNumber(value: string | null | undefined): string {
  const v = (value ?? '').replace(/\s+/g, '');
  if (v.length <= 4) return '*'.repeat(v.length);
  return `${'*'.repeat(v.length - 4)}${v.slice(-4)}`;
}
