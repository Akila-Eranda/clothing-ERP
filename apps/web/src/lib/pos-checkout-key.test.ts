// Run: pnpm --filter ./apps/web test:unit
// P-F8 (audit): the checkout idempotency key must survive until the sale is really finished on screen.
// This file pins the key store semantics; WHEN the overlay calls clearCheckoutRequestKey() is a component
// concern verified in the browser phase (see docs/step-1b-readiness-2026-11.md, P-F8).
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { checkoutRequestKey, checkoutSignature, clearCheckoutRequestKey } from "./pos-checkout-key.ts";

// Minimal in-memory localStorage (the module reads the global).
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
} as Storage;

const cart = {
  items: [{ variantId: "v1", quantity: 2, unitPrice: 100 }, { variantId: "v2", quantity: 1, unitPrice: 50.5 }],
  payments: [{ method: "CASH", amount: 250.5 }],
};

beforeEach(() => store.clear());

test("the same cart retried (double click, timeout, reload) re-sends the same key until it is cleared", () => {
  const sig = checkoutSignature(cart);
  const first = checkoutRequestKey(sig);
  assert.equal(checkoutRequestKey(sig), first);
  assert.equal(checkoutRequestKey(sig), first);
});

test("a key that was NOT cleared (e.g. a local error after the API answered) is reused for the retry => the API replays the first sale", () => {
  const sig = checkoutSignature(cart);
  const first = checkoutRequestKey(sig);
  // ... API confirmed, then the screen failed before the cart was reset: nothing called clear ...
  assert.equal(checkoutRequestKey(sig), first);
});

test("clearing starts a fresh key for the next sale", () => {
  const sig = checkoutSignature(cart);
  const first = checkoutRequestKey(sig);
  clearCheckoutRequestKey();
  const second = checkoutRequestKey(sig);
  assert.notEqual(second, first);
});

test("any change of the cart or payments gets a new key", () => {
  const base = checkoutRequestKey(checkoutSignature(cart));
  assert.notEqual(checkoutRequestKey(checkoutSignature({ ...cart, items: [{ ...cart.items[0], quantity: 3 }, cart.items[1]] })), base);
  const other = checkoutRequestKey(checkoutSignature({ ...cart, payments: [{ method: "CARD", amount: 250.5 }] }));
  assert.notEqual(other, base);
});

test("the signature does not depend on line order and ignores sub-milli rounding noise", () => {
  const a = checkoutSignature(cart);
  const b = checkoutSignature({ ...cart, items: [cart.items[1], cart.items[0]] });
  const c = checkoutSignature({ ...cart, items: [{ ...cart.items[0], unitPrice: 100.0000001 }, cart.items[1]] });
  assert.equal(a, b);
  assert.equal(a, c);
});

test("slots are independent: a reload (Quick Pay) never disturbs the pending main-cart key", () => {
  const sig = checkoutSignature(cart);
  const sale = checkoutRequestKey(sig, "sale");
  const reload = checkoutRequestKey("reload-signature", "reload");
  assert.notEqual(sale, reload);
  clearCheckoutRequestKey("reload");
  assert.equal(checkoutRequestKey(sig, "sale"), sale);
});

test("a stored key older than 24 h is discarded", () => {
  const sig = checkoutSignature(cart);
  const first = checkoutRequestKey(sig);
  const k = [...store.keys()].find((x) => x.endsWith(":sale"))!;
  const entry = JSON.parse(store.get(k)!);
  entry.at = Date.now() - 25 * 60 * 60 * 1000;
  store.set(k, JSON.stringify(entry));
  assert.notEqual(checkoutRequestKey(sig), first);
});

test("unavailable storage still yields a usable key (no crash)", () => {
  const original = globalThis.localStorage;
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => { throw new Error("blocked"); },
  } as unknown as Storage;
  try {
    assert.match(checkoutRequestKey(checkoutSignature(cart)), /^[0-9a-f-]{16,}$/);
    assert.doesNotThrow(() => clearCheckoutRequestKey());
  } finally {
    (globalThis as unknown as { localStorage: Storage }).localStorage = original;
  }
});
