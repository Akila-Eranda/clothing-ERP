// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidCardLast4, maskCardLast4, paymentReferenceText, receiptPaymentLabel, sanitizeCardLast4Input } from "./card-last4.ts";

test("card last 4: exactly four digits only", () => {
  assert.equal(isValidCardLast4("1234"), true);
  assert.equal(isValidCardLast4(" 0042 "), true);
  for (const bad of ["", "123", "12345", "12a4", "4111111111111111", "**** 1234", null, undefined]) {
    assert.equal(isValidCardLast4(bad as string), false, String(bad));
  }
});

test("input keeps digits only, at most four (the field never holds more)", () => {
  assert.equal(sanitizeCardLast4Input("12-34"), "1234");
  assert.equal(sanitizeCardLast4Input("4111 1111 1111 1111"), "4111");
  assert.equal(sanitizeCardLast4Input("ab"), "");
});

test("masked display in history, reports and receipts", () => {
  assert.equal(maskCardLast4("1234"), "**** 1234");
  assert.equal(maskCardLast4(""), "");
  assert.equal(paymentReferenceText({ method: "CARD", cardLast4: "9876" }), "Card **** 9876");
  assert.equal(paymentReferenceText({ method: "CARD", reference: "123" }), "Card **** 123"); // older 3-digit sales
  assert.equal(paymentReferenceText({ method: "QR", qrCode: { label: "BOC LankaQR" }, bankAccount: { name: "BOC Current", bankName: "BOC" } }), "BOC LankaQR · BOC Current · BOC");
  assert.equal(paymentReferenceText({ method: "BANK_TRANSFER", bankAccount: { name: "HNB" }, reference: "TX9" }), "HNB · TX9");
  assert.equal(paymentReferenceText({ method: "CASH" }), "—");
  assert.equal(receiptPaymentLabel({ method: "CARD", cardLast4: "4321" }), "CARD **** 4321");
  assert.equal(receiptPaymentLabel({ method: "CASH" }), "CASH");
});
