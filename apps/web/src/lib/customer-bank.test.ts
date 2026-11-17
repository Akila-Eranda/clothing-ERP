// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { bankFormProblem, EMPTY_BANK_FORM, isBankFormEmpty } from "./customer-bank.ts";

const ok = { bankName: "Bank of Ceylon", accountNumber: "0012 3456 7890", accountHolderName: "K. Nimal Perera", branchName: "Colombo Fort", branchCode: "7010" };

test("a complete form is valid; branch and code are optional", () => {
  assert.equal(bankFormProblem(ok), null);
  assert.equal(bankFormProblem({ ...ok, branchName: "", branchCode: "" }), null);
});

test("an empty form is valid (saving it clears the details)", () => {
  assert.equal(isBankFormEmpty(EMPTY_BANK_FORM), true);
  assert.equal(bankFormProblem(EMPTY_BANK_FORM), null);
  assert.equal(isBankFormEmpty({ ...EMPTY_BANK_FORM, bankName: "  " }), true);
});

test("required fields and formats", () => {
  assert.equal(bankFormProblem({ ...ok, bankName: "" }), "Bank name is required");
  assert.equal(bankFormProblem({ ...ok, accountNumber: "" }), "Account number is required");
  assert.equal(bankFormProblem({ ...ok, accountHolderName: "" }), "Account holder name is required");
  assert.match(bankFormProblem({ ...ok, accountNumber: "12" }) ?? "", /4 to 34/);
  assert.match(bankFormProblem({ ...ok, accountNumber: "12<34>" }) ?? "", /4 to 34/);
  assert.match(bankFormProblem({ ...ok, branchCode: "AB 12" }) ?? "", /Branch code/);
  assert.match(bankFormProblem({ ...ok, bankName: "<b>x</b>" }) ?? "", /invalid characters/);
  assert.equal(bankFormProblem({ ...ok, accountHolderName: "සුනිල් පෙරේරා" }), null);
});
