// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { whatsappNumber, whatsappShareUrl } from "./bill-message.ts";

test("phone numbers become wa.me numbers (Sri Lanka by default)", () => {
  assert.equal(whatsappNumber("077 123 4567"), "94771234567");
  assert.equal(whatsappNumber("+94 77 123 4567"), "94771234567");
  assert.equal(whatsappNumber("0094771234567"), "94771234567");
  assert.equal(whatsappNumber("94771234567"), "94771234567");
  assert.equal(whatsappNumber(""), "");
  assert.equal(whatsappNumber(null), "");
});

test("the share link keeps every line break and special character of the message", () => {
  const message = "Hi Nimal\n\nBill: INV-1\n• Tea — 2 × 250.00 = 500.00\nTotal: LKR 1,500.00 & thanks!";
  const url = whatsappShareUrl("0771234567", message);
  assert.ok(url.startsWith("https://wa.me/94771234567?text="));
  const text = decodeURIComponent(url.split("?text=")[1]);
  assert.equal(text, message);
  assert.equal(text.split("\n").length, 5);
  assert.ok(url.includes("%0A%0A"));          // the blank line survived
  assert.ok(!url.includes(" "));              // nothing left unencoded
});
