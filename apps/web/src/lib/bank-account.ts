/**
 * Bank account details (bank, account number, holder, branch, branch code) — client-side mirror of the API rules
 * (apps/api/src/modules/accounting/bank-account.helper.ts). The API is the authority; this gives instant feedback.
 * Pure helpers, unit-tested in bank-account.test.ts.
 */
export const BANK_DETAIL_KEYS = ["bankName", "accountNumber", "accountHolderName", "branchName", "branchCode"] as const;
export type BankDetailKey = (typeof BANK_DETAIL_KEYS)[number];
export type BankDetailsInput = Record<BankDetailKey, string>;

export const EMPTY_BANK_DETAILS: BankDetailsInput = { bankName: "", accountNumber: "", accountHolderName: "", branchName: "", branchCode: "" };

export const BANK_DETAIL_LABELS: Record<BankDetailKey, string> = {
  bankName: "Bank name",
  accountNumber: "Account number",
  accountHolderName: "Account holder name",
  branchName: "Branch",
  branchCode: "Branch code",
};

/** Cash in hand / petty cash are not bank accounts: their bank details stay optional. */
export function accountTypeNeedsBankDetails(type: string | null | undefined): boolean {
  return type === "CURRENT" || type === "SAVINGS";
}

export function cleanText(v: unknown): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
}

export function normalizeAccountNumber(v: string | null | undefined): string {
  return String(v ?? "").replace(/[\s-]+/g, "").toUpperCase();
}

const NAME_CHARS = /^[\p{L}\p{M}\p{N} .,'&()/-]+$/u;
const NO_MARKUP = /[<>\u0000-\u001f\u007f]/;

const RULES: Record<BankDetailKey, { ok: (v: string) => boolean; message: string }> = {
  bankName: { ok: (v) => v.length >= 2 && v.length <= 80 && NAME_CHARS.test(v), message: "Bank name must be 2–80 characters" },
  accountNumber: {
    ok: (v) => /^[A-Za-z0-9][A-Za-z0-9 -]*$/.test(v) && /^[A-Z0-9]{6,30}$/.test(normalizeAccountNumber(v)),
    message: "Account number must be 6–30 letters or digits (spaces and hyphens allowed)",
  },
  accountHolderName: { ok: (v) => v.length >= 2 && v.length <= 100 && NAME_CHARS.test(v) && /\p{L}/u.test(v), message: "Account holder name must be 2–100 characters and contain letters" },
  branchName: { ok: (v) => v.length >= 2 && v.length <= 80 && NAME_CHARS.test(v), message: "Branch must be 2–80 characters" },
  branchCode: { ok: (v) => /^[A-Za-z0-9-]{1,12}$/.test(v), message: "Branch code must be 1–12 letters, digits or hyphens" },
};

/** Field → message for every problem (empty object = valid). `requireAll`: every detail must be filled in. */
export function bankDetailProblems(d: Partial<BankDetailsInput>, opts: { requireAll: boolean }): Partial<Record<BankDetailKey, string>> {
  const out: Partial<Record<BankDetailKey, string>> = {};
  for (const key of BANK_DETAIL_KEYS) {
    const v = cleanText(d[key]);
    if (!v) { if (opts.requireAll) out[key] = `${BANK_DETAIL_LABELS[key]} is required`; continue; }
    if (NO_MARKUP.test(v) || !RULES[key].ok(v)) out[key] = RULES[key].message;
  }
  return out;
}

/** "••••1234" — never the whole number. */
export function maskAccountNumber(v: string | null | undefined): string {
  const n = normalizeAccountNumber(v);
  return n ? `••••${n.slice(-4)}` : "";
}

/** Details that are filled in on a bank account row (to decide whether to flag it as incomplete). */
export function missingBankDetails(row: Partial<Record<BankDetailKey, string | null | undefined>>): BankDetailKey[] {
  return BANK_DETAIL_KEYS.filter((k) => !cleanText(row[k]));
}

/** Permissions carried in the access token (used only to hide controls; the API enforces them). */
export function permissionsFromToken(token: string | null | undefined): string[] {
  try {
    if (!token) return [];
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return Array.isArray(payload.permissions) ? payload.permissions.filter((p: unknown): p is string => typeof p === "string") : [];
  } catch {
    return [];
  }
}

export function canManageBankAccounts(permissions: readonly string[]): boolean {
  return permissions.includes("accounting:create") && permissions.includes("accounting:update");
}

/**
 * The bank fields to send when creating an account from a form: current / savings accounts send all five details
 * (validated); cash accounts send only the optional bank name. `firstProblem` is set when the form must not be saved.
 */
export function bankFieldsForSave(
  type: string,
  details: BankDetailsInput,
  optionalBankName = "",
): { fields: Partial<Record<BankDetailKey, string>>; problems: Partial<Record<BankDetailKey, string>>; firstProblem?: string } {
  if (!accountTypeNeedsBankDetails(type)) {
    const bankName = cleanText(optionalBankName);
    return { fields: bankName ? { bankName } : {}, problems: {} };
  }
  const problems = bankDetailProblems(details, { requireAll: true });
  const fields: Partial<Record<BankDetailKey, string>> = {};
  for (const k of BANK_DETAIL_KEYS) { const v = cleanText(details[k]); if (v) fields[k] = v; }
  const first = BANK_DETAIL_KEYS.map((k) => problems[k]).find(Boolean);
  return { fields, problems, ...(first ? { firstProblem: first } : {}) };
}

/**
 * Bank detail keys whose (cleaned) value differs from what the editor loaded. QA-006: an edit used to send all five
 * details every time, so the API treated every save as "details changed" and enforced the full rules - a legacy
 * account with a missing holder / branch could not even be renamed or disabled. Only changed details are sent now.
 */
export function changedBankDetails(original: Partial<BankDetailsInput>, current: Partial<BankDetailsInput>): BankDetailKey[] {
  return BANK_DETAIL_KEYS.filter((k) => cleanText(current[k]) !== cleanText(original[k]));
}
