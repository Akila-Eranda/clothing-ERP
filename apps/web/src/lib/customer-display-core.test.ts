// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildQrDisplayPayment,
  CUSTOMER_DISPLAY_HEARTBEAT_MS,
  CUSTOMER_DISPLAY_LIVE_MS,
  CUSTOMER_DISPLAY_PAYMENT_TTL_MS,
  isDisplayConnected,
  newPaymentSessionId,
  PAYMENT_LABELS,
  sanitizeDisplayState,
  shouldAcceptDisplayState,
  type QrCodeLike,
  type QrRenderedLike,
} from "./customer-display-core.ts";
import type { CustomerDisplayState } from "./pos-customer-display.ts";

const NOW = 1_800_000_000_000;
const state = (patch: Partial<CustomerDisplayState> = {}): CustomerDisplayState => ({
  updatedAt: NOW, phase: "checkout", shopName: "Shop", tagline: "", logoUrl: "", currency: "LKR",
  items: [{ variantId: "v1", productName: "Rice", variantName: "Default", sku: "R1", unitPrice: 100, quantity: 2, lineTotal: 200 }],
  itemCount: 2, subtotal: 200, discount: 0, tax: 0, taxRate: 0, total: 200, paymentMethod: "QR", ...patch,
});

// ── connection indicator ──
test("heartbeat is more frequent than the Live window, which is shorter than the payment TTL", () => {
  assert.ok(CUSTOMER_DISPLAY_HEARTBEAT_MS * 2 < CUSTOMER_DISPLAY_LIVE_MS);
  assert.ok(CUSTOMER_DISPLAY_LIVE_MS < CUSTOMER_DISPLAY_PAYMENT_TTL_MS);
});

test("connected while the last message (or heartbeat) is recent; not after a long silence; not without any message", () => {
  assert.equal(isDisplayConnected(state({ updatedAt: NOW - 1_000 }), NOW), true);
  assert.equal(isDisplayConnected(state({ updatedAt: NOW - (CUSTOMER_DISPLAY_LIVE_MS - 1) }), NOW), true);
  assert.equal(isDisplayConnected(state({ updatedAt: NOW - CUSTOMER_DISPLAY_LIVE_MS }), NOW), false);
  assert.equal(isDisplayConnected(null, NOW), false);
});

test("an idle cashier on the QR screen stays 'Live' as long as heartbeats arrive (the earlier false 'Reconnecting')", () => {
  // the state content never changes for a minute, only updatedAt moves with each heartbeat
  let last = state({ updatedAt: NOW });
  for (let t = CUSTOMER_DISPLAY_HEARTBEAT_MS; t <= 60_000; t += CUSTOMER_DISPLAY_HEARTBEAT_MS) {
    last = { ...last, updatedAt: NOW + t };
    assert.equal(isDisplayConnected(last, NOW + t + 1_000), true, `at ${t} ms`);
  }
});

// ── stale payment protection ──
test("a fresh checkout is shown as is", () => {
  const s = state({ updatedAt: NOW - 5_000, paymentSessionId: "s1" });
  assert.equal(sanitizeDisplayState(s, NOW), s);
});

test("an old cached checkout / QR (cashier closed the POS mid-payment) becomes 'waiting' with no QR, items or session", () => {
  const qr = { status: "ready" as const, qrCodeId: "q1", bankAccountId: "b1", src: "data:image/png;base64,AAA", mode: "DYNAMIC" as const, label: "BOC", amount: 4000, accountNumber: "0081 2345 6789" };
  const old = state({ updatedAt: NOW - CUSTOMER_DISPLAY_PAYMENT_TTL_MS - 1, qrPayment: qr, paymentSessionId: "old-session" });
  const out = sanitizeDisplayState(old, NOW)!;
  assert.equal(out.phase, "waiting");
  assert.equal(out.qrPayment, undefined);
  assert.equal(out.paymentSessionId, undefined);
  assert.deepEqual(out.items, []);
  assert.equal(out.paymentMethod, undefined);
  assert.equal(JSON.stringify(out).includes("0081 2345 6789"), false);
});

test("non-payment screens are not blanked just because they are old (shopping / idle / thank-you stay)", () => {
  const shopping = state({ phase: "shopping", paymentMethod: undefined, updatedAt: NOW - 10 * 60_000 });
  assert.equal(sanitizeDisplayState(shopping, NOW), shopping);
  assert.equal(sanitizeDisplayState(null, NOW), null);
});

test("out-of-order messages are ignored; equal or newer are accepted", () => {
  assert.equal(shouldAcceptDisplayState({ updatedAt: 100 }, { updatedAt: 99 }), false);
  assert.equal(shouldAcceptDisplayState({ updatedAt: 100 }, { updatedAt: 100 }), true);
  assert.equal(shouldAcceptDisplayState({ updatedAt: 100 }, { updatedAt: 101 }), true);
  assert.equal(shouldAcceptDisplayState(null, { updatedAt: 1 }), true);
  assert.equal(shouldAcceptDisplayState({ updatedAt: 100 }, { updatedAt: 0 }), false);
});

test("each opened checkout gets a different payment session id", () => {
  const ids = new Set(Array.from({ length: 50 }, () => newPaymentSessionId()));
  assert.equal(ids.size, 50);
});

test("QR and bank transfer have their own labels (they used to show as the raw code)", () => {
  assert.equal(PAYMENT_LABELS.QR, "QR");
  assert.equal(PAYMENT_LABELS.BANK_TRANSFER, "Bank transfer");
  assert.equal(PAYMENT_LABELS.CASH, "Cash");
});

// ── QR payment: what the customer sees ──
const BOC = { id: "b-boc", bankName: "Bank of Ceylon", accountNumber: "0081 2345 6789", accountHolderName: "Lanka Traders (Pvt) Ltd", branchName: "Colombo Fort", branchCode: "001" };
const HNB = { id: "b-hnb", bankName: "Hatton National Bank", accountNumber: "9876543210", accountHolderName: "Second Holder", branchName: "Kandy", branchCode: "KDY" };
const qrBoc: QrCodeLike = { id: "q-boc", bankAccountId: "b-boc", label: "BOC LankaQR", mode: "DYNAMIC", merchantName: "BOC SHOP", bankAccount: BOC };
const qrHnb: QrCodeLike = { id: "q-hnb", bankAccountId: "b-hnb", label: "HNB LankaQR", mode: "DYNAMIC", merchantName: "HNB SHOP", bankAccount: HNB };
const rBoc = (amount = 4000): QrRenderedLike => ({ qrCodeId: "q-boc", mode: "DYNAMIC", dataUrl: "data:image/png;base64,BOC", imageUrl: null, merchantName: "BOC SHOP", amount, bankAccount: BOC });
const rHnb = (amount = 4000): QrRenderedLike => ({ qrCodeId: "q-hnb", mode: "DYNAMIC", dataUrl: "data:image/png;base64,HNB", imageUrl: null, merchantName: "HNB SHOP", amount, bankAccount: HNB });
const build = (o: Partial<Parameters<typeof buildQrDisplayPayment>[0]>) =>
  buildQrDisplayPayment({ selected: qrBoc, rendered: rBoc(), rendering: false, error: null, amount: 4000, resolveImage: (u) => `https://shop.test${u}`, ...o });

test("ready: the QR, the exact amount and all five details of the selected bank account", () => {
  const p = build({})!;
  assert.deepEqual(
    { status: p.status, src: p.src, amount: p.amount, qrCodeId: p.qrCodeId, bankAccountId: p.bankAccountId, label: p.label },
    { status: "ready", src: "data:image/png;base64,BOC", amount: 4000, qrCodeId: "q-boc", bankAccountId: "b-boc", label: "BOC LankaQR" },
  );
  assert.deepEqual(
    [p.bankName, p.accountNumber, p.accountHolderName, p.branchName, p.branchCode],
    ["Bank of Ceylon", "0081 2345 6789", "Lanka Traders (Pvt) Ltd", "Colombo Fort", "001"],
  );
  assert.equal(p.merchantName, "BOC SHOP");
});

test("uploaded (static) QR images are resolved to a full URL", () => {
  const p = build({ rendered: { ...rBoc(), mode: "STATIC", dataUrl: null, imageUrl: "/uploads/qr.png" } })!;
  assert.equal(p.status, "ready");
  assert.equal(p.src, "https://shop.test/uploads/qr.png");
  assert.equal(p.mode, "STATIC");
});

test("switching the bank account: until the new QR is ready the old QR and old account details are NOT shown", () => {
  // cashier selects HNB, but the QR on hand is still BOC's
  const mid = build({ selected: qrHnb, rendered: rBoc(), rendering: true })!;
  assert.equal(mid.status, "updating");
  assert.equal(mid.src, "");
  assert.equal(mid.bankAccountId, "b-hnb");
  assert.equal(mid.accountNumber, undefined);
  assert.equal(mid.bankName, undefined);
  // even if the loading flag were not set yet, a QR rendered for another code is never shown
  const stale = build({ selected: qrHnb, rendered: rBoc(), rendering: false })!;
  assert.equal(stale.status, "updating");
  assert.equal(stale.src, "");
  // once HNB's own QR arrives the customer sees HNB's QR and HNB's details only
  const done = build({ selected: qrHnb, rendered: rHnb() })!;
  assert.equal(done.status, "ready");
  assert.equal(done.src, "data:image/png;base64,HNB");
  assert.deepEqual([done.bankName, done.accountNumber, done.accountHolderName, done.branchName, done.branchCode], ["Hatton National Bank", "9876543210", "Second Holder", "Kandy", "KDY"]);
  assert.equal(JSON.stringify(done).includes("0081 2345 6789"), false);
});

test("changing the amount: the old QR is withdrawn until the QR for the new amount arrives", () => {
  const mid = build({ amount: 5000, rendered: rBoc(4000) })!;
  assert.equal(mid.status, "updating");
  assert.equal(mid.src, "");
  assert.equal(mid.amount, 5000);
  const done = build({ amount: 5000, rendered: rBoc(5000) })!;
  assert.equal(done.status, "ready");
  assert.equal(done.amount, 5000);
});

test("an account whose details do not belong to the selected QR code is never mixed in", () => {
  const mixed = build({ rendered: { ...rBoc(), bankAccount: HNB } })!;        // API answered with another account's details
  assert.equal(mixed.status, "ready");
  assert.equal(mixed.accountNumber, null);
  assert.equal(mixed.bankName, null);
});

test("failed render → unavailable; nothing selected or no amount → no QR screen", () => {
  assert.equal(build({ error: "QR code not found or inactive" })!.status, "unavailable");
  assert.equal(build({ error: "x" })!.src, "");
  assert.equal(build({ selected: null }), null);
  assert.equal(build({ amount: 0 }), null);
});

test("the QR fee is never part of what the customer sees (only the gross amount)", () => {
  const p = build({ amount: 6000, rendered: rBoc(6000) })!;
  assert.equal(p.amount, 6000);
  assert.equal(Object.keys(p).some((k) => /fee|net/i.test(k)), false);
});
