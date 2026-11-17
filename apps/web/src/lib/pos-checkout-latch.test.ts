// Run: pnpm --filter ./apps/web test:unit
// P-F11 (latch) and P-F8 (key lifetime) regression tests for the POS checkout flow.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCheckoutLatch } from "./pos-checkout-latch.ts";

test("the second trigger in the same tick is refused until the first leaves", () => {
  const latch = createCheckoutLatch();
  assert.equal(latch.tryEnter(), true);
  assert.equal(latch.tryEnter(), false); // double click / Enter + F9 / voucher button twice
  assert.equal(latch.tryEnter(), false);
  assert.equal(latch.busy, true);
  latch.leave();
  assert.equal(latch.busy, false);
  assert.equal(latch.tryEnter(), true); // next sale
});

test("leave is idempotent and never opens a second slot", () => {
  const latch = createCheckoutLatch();
  assert.equal(latch.tryEnter(), true);
  latch.leave();
  latch.leave();
  assert.equal(latch.tryEnter(), true);
  assert.equal(latch.tryEnter(), false);
});

test("simulated race: 50 concurrent triggers start exactly one checkout", async () => {
  const latch = createCheckoutLatch();
  let started = 0;
  const trigger = async () => {
    if (!latch.tryEnter()) return;
    started += 1;
    try {
      await new Promise((r) => setTimeout(r, 5));
    } finally {
      latch.leave();
    }
  };
  await Promise.all(Array.from({ length: 50 }, () => trigger()));
  assert.equal(started, 1);
});

test("an exception inside the checkout still releases the latch (the cashier can retry)", async () => {
  const latch = createCheckoutLatch();
  await assert.rejects(async () => {
    assert.equal(latch.tryEnter(), true);
    try {
      throw new Error("boom");
    } finally {
      latch.leave();
    }
  });
  assert.equal(latch.tryEnter(), true);
});

// ── P-F8: structural guard on the real component until the browser phase proves it end to end ──────────────────
// The sale's idempotency key must live until the cart is reset. It used to be cleared right after the API answered,
// before ~60 lines of local post-sale work; an exception there left the cart intact with a FRESH key, so the retry
// created a second sale. These checks pin the ordering in the component source.
const overlay = readFileSync(new URL("../components/pos/pos-overlay.tsx", import.meta.url), "utf8").split("\r\n").join("\n"); // CRLF on Windows checkouts
const start = overlay.indexOf("const handleCheckout = React.useCallback");
const end = overlay.indexOf("/** Quick Pay reload: post as its own cash sale immediately");
const checkout = overlay.slice(start, end);

test("handleCheckout is found and uses the synchronous latch", () => {
  assert.ok(start > 0 && end > start, "handleCheckout block located");
  assert.match(checkout, /checkoutLatchRef\.current\.tryEnter\(\)/);
  assert.match(checkout, /checkoutLatchRef\.current\.leave\(\)/);
});

test("the sale key is cleared only AFTER the cart is reset, never straight after the API call", () => {
  const post = checkout.indexOf('api.post<{id?:string;invoiceNumber:string');
  const reset = checkout.indexOf("clearCart();\n      setTaxRate(0);");
  const clears = [...checkout.matchAll(/clearCheckoutRequestKey\(\)/g)].map((m) => m.index!);
  assert.ok(post > 0 && reset > post, "api call precedes cart reset");
  assert.equal(clears.length, 1, "exactly one clearCheckoutRequestKey() in the sale checkout");
  assert.ok(clears[0] > reset, "the key is cleared after clearCart(), not between the API response and the reset");
});

test("a failure after the server confirmed the sale never reports 'Checkout failed' and never loses the key", () => {
  assert.match(checkout, /saleConfirmedRef\.current = /);
  assert.match(checkout, /if \(saleConfirmedRef\.current\)/);
  assert.match(checkout, /not charge(d)? (the customer )?twice|will not be charged twice/i);
});
