// Run: pnpm --filter ./apps/web test:unit
// QA-003: "Cashier wallets / Day End - Clear All" must be the LAST section of the Cash & Bank page.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../components/accounting/cash-bank-hub.tsx", import.meta.url), "utf8");
const at = (needle: string) => {
  const i = src.indexOf(needle);
  assert.ok(i >= 0, `${needle} not found`);
  return i;
};

test("the Day End (cashier wallets) section renders after registers, bank accounts, QR settings and other accounts", () => {
  const dayEnd = src.lastIndexOf("{walletSection}");
  assert.ok(dayEnd > at('section("cash-registers"'));
  assert.ok(dayEnd > at("<BankAccountsCard"));
  assert.ok(dayEnd > at("<PaymentQrSettingsTab"));
  assert.ok(dayEnd > at('section("other-accounts"'));
});

test("the Day End section is rendered exactly once", () => {
  assert.equal(src.split("{walletSection}").length - 1, 1);
});
