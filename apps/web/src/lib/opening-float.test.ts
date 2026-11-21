// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { openingFloatProblem } from "./opening-float.ts";

test("normal floats pass, up to the maximum", () => {
  for (const ok of ["0", "5000", "5000.5", "99999.99", "100000"]) assert.equal(openingFloatProblem(ok, 100_000), null, ok);
});

test("empty, negative and malformed amounts are refused", () => {
  for (const bad of ["", "  ", "-5", "abc", "1e9", "5,000", "10.123", "1..2", "NaN", "Infinity"]) {
    assert.notEqual(openingFloatProblem(bad, 100_000), null, bad);
  }
});

test("an unreasonable amount is refused with the limit", () => {
  assert.match(openingFloatProblem("4111212121", 1_000_000) ?? "", /above the maximum opening float of LKR 1,000,000/);
  assert.match(openingFloatProblem("100000.01", 100_000) ?? "", /above the maximum/);
});

test("without a known limit only the format is checked (the API still enforces the limit)", () => {
  assert.equal(openingFloatProblem("4111212121", null), null);
});
