// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { exactStock, withExactStock } from "./exact-stock.ts";

test("negative stock is shown exactly, never clamped to 0", () => {
  assert.equal(exactStock({ stock: 0, currentStock: -2, reservedStock: 0 }), -2);
  assert.equal(exactStock({ stock: 0, currentStock: 1, reservedStock: 3 }), -2);
  assert.equal(exactStock({ stock: 0, currentStock: -0.5 }), -0.5);
});

test("positive stock: on hand minus reserved", () => {
  assert.equal(exactStock({ stock: 7, currentStock: 10, reservedStock: 3 }), 7);
  assert.equal(exactStock({ stock: 2.25, currentStock: 2.25 }), 2.25);
});

test("falls back to stock when the raw fields are missing", () => {
  assert.equal(exactStock({ stock: 4 }), 4);
  assert.equal(exactStock({ stock: 4, currentStock: null }), 4);
  assert.equal(exactStock(null), 0);
  assert.equal(exactStock({}), 0);
});

test("withExactStock rewrites stock and availableStock only", () => {
  const row = { variantId: "v1", stock: 0, availableStock: 0, currentStock: -2, reservedStock: 0, costPrice: 10 };
  assert.deepEqual(withExactStock(row), { ...row, stock: -2, availableStock: -2 });
});
