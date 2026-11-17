// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  accountTypeNeedsBankDetails,
  bankDetailProblems,
  bankFieldsForSave,
  canManageBankAccounts,
  EMPTY_BANK_DETAILS,
  maskAccountNumber,
  missingBankDetails,
  normalizeAccountNumber,
  permissionsFromToken,
} from "./bank-account.ts";

const GOOD = { bankName: "Bank of Ceylon", accountNumber: "0081 2345 6789", accountHolderName: "Lanka Traders (Pvt) Ltd", branchName: "Colombo Fort", branchCode: "001" };

test("complete valid details have no problems", () => {
  assert.deepEqual(bankDetailProblems(GOOD, { requireAll: true }), {});
});

test("every detail is required for bank accounts, with a message per field", () => {
  const p = bankDetailProblems(EMPTY_BANK_DETAILS, { requireAll: true });
  assert.deepEqual(Object.keys(p).sort(), ["accountHolderName", "accountNumber", "bankName", "branchCode", "branchName"]);
  assert.equal(p.branchCode, "Branch code is required");
  assert.deepEqual(bankDetailProblems({ ...GOOD, branchName: "   " }, { requireAll: true }), { branchName: "Branch is required" });
});

test("cash accounts need no details, but whatever is typed is still checked", () => {
  assert.deepEqual(bankDetailProblems(EMPTY_BANK_DETAILS, { requireAll: false }), {});
  assert.ok(bankDetailProblems({ accountNumber: "12" }, { requireAll: false }).accountNumber);
  assert.equal(accountTypeNeedsBankDetails("CURRENT"), true);
  assert.equal(accountTypeNeedsBankDetails("SAVINGS"), true);
  assert.equal(accountTypeNeedsBankDetails("CASH_IN_HAND"), false);
  assert.equal(accountTypeNeedsBankDetails("PETTY_CASH"), false);
});

test("format rules match the API: account number, names, branch code, markup", () => {
  const bad = (patch: object) => Object.keys(bankDetailProblems({ ...GOOD, ...patch }, { requireAll: true }));
  assert.deepEqual(bad({ accountNumber: "12345" }), ["accountNumber"]);
  assert.deepEqual(bad({ accountNumber: "1234-5678-90" }), []);
  assert.deepEqual(bad({ accountNumber: "1234 5678 !" }), ["accountNumber"]);
  assert.deepEqual(bad({ branchCode: "AB 12" }), ["branchCode"]);
  assert.deepEqual(bad({ branchCode: "1234567890123" }), ["branchCode"]);
  assert.deepEqual(bad({ accountHolderName: "12345" }), ["accountHolderName"]);
  assert.deepEqual(bad({ accountHolderName: "<b>x</b>" }), ["accountHolderName"]);
  assert.deepEqual(bad({ accountHolderName: "සමන් පෙරේරා" }), []);       // Sinhala (combining vowel signs)
  assert.deepEqual(bad({ accountHolderName: "கணேஷ் குமார்" }), []);       // Tamil
  assert.deepEqual(bad({ bankName: "B" }), ["bankName"]);
});

test("account numbers are masked to the last 4 and compared without spaces / hyphens", () => {
  assert.equal(maskAccountNumber("0081 2345 6789"), "••••6789");
  assert.equal(maskAccountNumber(""), "");
  assert.equal(normalizeAccountNumber("0081-2345 6789"), "008123456789");
});

test("accounts with missing details are identified (shown as incomplete in the admin list)", () => {
  assert.deepEqual(missingBankDetails(GOOD), []);
  assert.deepEqual(missingBankDetails({ bankName: "BOC", accountNumber: "123456" }), ["accountHolderName", "branchName", "branchCode"]);
  assert.deepEqual(missingBankDetails({ ...GOOD, branchCode: null }), ["branchCode"]);
});

test("permissions are read from the access token; only admins with create + update may manage accounts", () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const token = (perms: string[]) => `h.${b64({ permissions: perms })}.s`;
  assert.deepEqual(permissionsFromToken(token(["sales:create", "accounting:read"])), ["sales:create", "accounting:read"]);
  assert.deepEqual(permissionsFromToken("garbage"), []);
  assert.deepEqual(permissionsFromToken(null), []);
  assert.equal(canManageBankAccounts(["accounting:create", "accounting:update", "accounting:read"]), true);
  assert.equal(canManageBankAccounts(["accounting:read", "sales:create"]), false);       // cashier
  assert.equal(canManageBankAccounts(["accounting:update"]), false);
});

test("forms: current / savings send all five validated details; cash accounts send only the optional bank name", () => {
  const ok = bankFieldsForSave("CURRENT", { ...GOOD, bankName: "  Bank of Ceylon " });
  assert.equal(ok.firstProblem, undefined);
  assert.deepEqual(ok.fields, { ...GOOD, bankName: "Bank of Ceylon" });
  const bad = bankFieldsForSave("SAVINGS", { ...GOOD, branchCode: "" });
  assert.equal(bad.firstProblem, "Branch code is required");
  assert.deepEqual(Object.keys(bad.problems), ["branchCode"]);
  assert.equal(bankFieldsForSave("CURRENT", EMPTY_BANK_DETAILS).firstProblem, "Bank name is required");
  assert.deepEqual(bankFieldsForSave("CASH_IN_HAND", EMPTY_BANK_DETAILS, "  ").fields, {});
  assert.deepEqual(bankFieldsForSave("PETTY_CASH", EMPTY_BANK_DETAILS, " Safe  box ").fields, { bankName: "Safe box" });
  assert.equal(bankFieldsForSave("PETTY_CASH", EMPTY_BANK_DETAILS).firstProblem, undefined);
});
