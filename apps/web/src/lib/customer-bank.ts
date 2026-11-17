/**
 * Customer bank details: the same checks as the API (apps/api/src/shared/customer-bank.helper.ts), so a typo is
 * caught on the form. The API is the authority.
 */
export type CustomerBankForm = {
  bankName: string;
  accountNumber: string;
  accountHolderName: string;
  branchName: string;
  branchCode: string;
};

export const EMPTY_BANK_FORM: CustomerBankForm = { bankName: "", accountNumber: "", accountHolderName: "", branchName: "", branchCode: "" };

const NAME = /^[\p{L}\p{N}][\p{L}\p{M}\p{N} .,&'()\-/]*$/u;
const ACCOUNT = /^[A-Za-z0-9][A-Za-z0-9 \-]*$/;
const CODE = /^[A-Za-z0-9][A-Za-z0-9\-]*$/;
const clean = (v: string) => v.replace(/\s+/g, " ").trim();

/** True when every field is empty (saving that removes the details). */
export function isBankFormEmpty(f: CustomerBankForm): boolean {
  return Object.values(f).every((v) => !clean(v));
}

/** The first problem with the form, or null. An empty form is valid (it clears the details). */
export function bankFormProblem(f: CustomerBankForm): string | null {
  if (isBankFormEmpty(f)) return null;
  const bank = clean(f.bankName);
  const acct = clean(f.accountNumber);
  const holder = clean(f.accountHolderName);
  const branch = clean(f.branchName);
  const code = clean(f.branchCode);
  if (!bank) return "Bank name is required";
  if (bank.length > 100 || !NAME.test(bank)) return "Bank name has invalid characters or is too long (max 100)";
  if (!acct) return "Account number is required";
  const digits = acct.replace(/[ \-]/g, "");
  if (!ACCOUNT.test(acct) || digits.length < 4 || digits.length > 34) return "Account number must be 4 to 34 letters or digits (spaces and hyphens allowed)";
  if (!holder) return "Account holder name is required";
  if (holder.length > 100 || !NAME.test(holder)) return "Account holder name has invalid characters or is too long (max 100)";
  if (branch && (branch.length > 100 || !NAME.test(branch))) return "Branch has invalid characters or is too long (max 100)";
  if (code && (code.length > 20 || !CODE.test(code))) return "Branch code must be letters, digits or hyphens (max 20)";
  return null;
}
