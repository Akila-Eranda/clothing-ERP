/**
 * Bank account details: validation, normalising, masking, duplicate detection and audit snapshot
 * (pure functions, no I/O). The full account number is never written to the audit trail; only its last 4.
 *
 * NOTE: reconstructed from bank-account.helper.spec.ts because the original file was missing from the
 * remediation/2026-11 branch. Replace with the author's version if it differs; the spec must still pass.
 */

export const BANK_DETAIL_KEYS = ['bankName', 'accountNumber', 'accountHolderName', 'branchName', 'branchCode'] as const;

export type BankDetailsInput = {
  bankName?: unknown;
  accountNumber?: unknown;
  accountHolderName?: unknown;
  branchName?: unknown;
  branchCode?: unknown;
};

export type BankDetailsClean = {
  bankName: string | null;
  accountNumber: string | null;
  accountHolderName: string | null;
  branchName: string | null;
  branchCode: string | null;
};

/** Trims, collapses inner whitespace, turns blanks / non-strings into null. */
export function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const v = value.replace(/\s+/g, ' ').trim();
  return v === '' ? null : v;
}

export function cleanBankDetails(input: BankDetailsInput): BankDetailsClean {
  return {
    bankName: cleanText(input.bankName),
    accountNumber: cleanText(input.accountNumber),
    accountHolderName: cleanText(input.accountHolderName),
    branchName: cleanText(input.branchName),
    branchCode: cleanText(input.branchCode),
  };
}

// \p{M}: vowel signs of Sinhala / Tamil names. No markup characters (< > etc.) and no control characters.
const NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,&'()\-/]*$/u;
const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9 \-]*$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9\-]*$/;
const HAS_LETTER = /\p{L}/u;

/** Cash / petty-cash accounts have no bank details; current and savings accounts need all of them. */
export function requiresBankDetails(type: string | null | undefined): boolean {
  return type === 'CURRENT' || type === 'SAVINGS';
}

/** List of problems with the details (empty = valid). Values are cleaned first; blanks are only an error when requireAll. */
export function bankDetailErrors(input: BankDetailsInput, opts: { requireAll: boolean }): string[] {
  const d = cleanBankDetails(input);
  const errors: string[] = [];

  if (!d.bankName) {
    if (opts.requireAll) errors.push('Bank name is required');
  } else if (d.bankName.length < 2 || d.bankName.length > 80 || !NAME.test(d.bankName)) {
    errors.push('Bank name must be 2–80 characters (letters, numbers and . , & \' ( ) - / only)');
  }

  if (!d.accountNumber) {
    if (opts.requireAll) errors.push('Account number is required');
  } else {
    const compact = d.accountNumber.replace(/[ \-]/g, '');
    if (!ACCOUNT.test(d.accountNumber) || compact.length < 6 || compact.length > 30) {
      errors.push('Account number must be 6–30 letters or digits (spaces and hyphens allowed)');
    }
  }

  if (!d.accountHolderName) {
    if (opts.requireAll) errors.push('Account holder name is required');
  } else if (
    d.accountHolderName.length < 2 ||
    d.accountHolderName.length > 100 ||
    !NAME.test(d.accountHolderName) ||
    !HAS_LETTER.test(d.accountHolderName)
  ) {
    errors.push('Account holder name must be 2–100 characters, contain a letter and have no special symbols');
  }

  if (!d.branchName) {
    if (opts.requireAll) errors.push('Branch is required');
  } else if (d.branchName.length < 2 || d.branchName.length > 80 || !NAME.test(d.branchName)) {
    errors.push('Branch must be 2–80 characters (letters, numbers and . , & \' ( ) - / only)');
  }

  if (!d.branchCode) {
    if (opts.requireAll) errors.push('Branch code is required');
  } else if (d.branchCode.length > 12 || !CODE.test(d.branchCode)) {
    errors.push('Branch code must be letters, digits or hyphens (max 12)');
  }

  return errors;
}

/** "0081-2345 6789" → "008123456789" (spaces / hyphens removed, upper-cased) for comparison. */
export function normalizeAccountNumber(value: string | null | undefined): string {
  return (value ?? '').replace(/[\s\-]/g, '').toUpperCase();
}

/** Same bank (case-insensitive) and same account number (ignoring spaces / hyphens / case). Blank numbers never match. */
export function isSameBankAccount(
  a: { bankName?: string | null; accountNumber?: string | null },
  b: { bankName?: string | null; accountNumber?: string | null },
): boolean {
  const na = normalizeAccountNumber(a.accountNumber);
  const nb = normalizeAccountNumber(b.accountNumber);
  if (!na || !nb || na !== nb) return false;
  return (cleanText(a.bankName) ?? '').toLowerCase() === (cleanText(b.bankName) ?? '').toLowerCase();
}

/** "0081 2345 6789" → "••••6789"; blank → "". */
export function maskAccountNumber(value: string | null | undefined): string {
  const v = normalizeAccountNumber(value);
  if (!v) return '';
  return `••••${v.slice(-4)}`;
}

/** What goes to the audit trail: everything except the account number, of which only the last 4 are kept. */
export function auditBankSnapshot(account: {
  code?: string | null;
  name?: string | null;
  type?: string | null;
  isActive?: boolean | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
}) {
  return {
    code: account.code ?? null,
    name: account.name ?? null,
    type: account.type ?? null,
    isActive: account.isActive ?? null,
    bankName: account.bankName ?? null,
    accountLast4: maskAccountNumber(account.accountNumber),
    accountHolderName: account.accountHolderName ?? null,
    branchName: account.branchName ?? null,
    branchCode: account.branchCode ?? null,
  };
}
