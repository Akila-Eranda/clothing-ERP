// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAdvanceProblem, defaultAdvanceToApply, paymentSplit } from "./supplier-advance.ts";

test("payment split: exact and partial payments have no excess", () => {
  assert.deepEqual(paymentSplit(1000, 1000), { toBills: 1000, excess: 0 });
  assert.deepEqual(paymentSplit(400, 1000), { toBills: 400, excess: 0 });
  assert.deepEqual(paymentSplit(1000.005, 1000), { toBills: 1000, excess: 0 });
});

test("payment split: the excess becomes the advance", () => {
  assert.deepEqual(paymentSplit(2000, 1100), { toBills: 1100, excess: 900 });
  assert.deepEqual(paymentSplit(250.25, 0), { toBills: 0, excess: 250.25 });
  assert.deepEqual(paymentSplit(Number.NaN, 100), { toBills: 0, excess: 0 });
});

test("default advance to apply never exceeds the advance or the bills", () => {
  assert.equal(defaultAdvanceToApply(900, 400), 400);
  assert.equal(defaultAdvanceToApply(300, 1000), 300);
  assert.equal(defaultAdvanceToApply(0, 500), 0);
});

test("apply-advance validation", () => {
  assert.equal(applyAdvanceProblem(300, 900, 1000, 2), null);
  assert.match(applyAdvanceProblem(0, 900, 1000, 1) ?? "", /Enter the amount/);
  assert.match(applyAdvanceProblem(-5, 900, 1000, 1) ?? "", /Enter the amount/);
  assert.match(applyAdvanceProblem(10.123, 900, 1000, 1) ?? "", /2 decimal/);
  assert.match(applyAdvanceProblem(300, 900, 1000, 0) ?? "", /Select at least one bill/);
  assert.match(applyAdvanceProblem(950, 900, 1000, 1) ?? "", /Only LKR 900.00 of advance/);
  assert.match(applyAdvanceProblem(500, 900, 400, 1) ?? "", /only owe LKR 400.00/);
});
