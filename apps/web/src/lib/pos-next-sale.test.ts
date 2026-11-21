// Run: pnpm --filter ./apps/web test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { createNextSaleGuard } from "./pos-next-sale.ts";

test("first acknowledge wins, repeats (double click / click + F9) are ignored", () => {
  const g = createNextSaleGuard();
  assert.equal(g.tryAcknowledge("INV-1"), true);
  assert.equal(g.tryAcknowledge("INV-1"), false);
  assert.equal(g.tryAcknowledge("INV-1"), false);
});

test("a different completed sale is acknowledged independently", () => {
  const g = createNextSaleGuard();
  assert.equal(g.tryAcknowledge("INV-1"), true);
  assert.equal(g.tryAcknowledge("INV-2"), true);
});

test("empty key never acknowledges; reset re-arms", () => {
  const g = createNextSaleGuard();
  assert.equal(g.tryAcknowledge(null), false);
  assert.equal(g.tryAcknowledge(""), false);
  g.tryAcknowledge("INV-1");
  g.reset();
  assert.equal(g.tryAcknowledge("INV-1"), true);
});
