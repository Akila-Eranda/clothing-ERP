// Run: pnpm --filter ./apps/web test:unit
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultGrnLineCost, grnLineCostPayload, isGrnCostEdit } from "./grn-line-cost.ts";

test("a line starts at the catalogue cost, then the last buying price, then 0", () => {
  assert.equal(defaultGrnLineCost({ costPrice: 60, lastBuyingPrice: 75 }), 60);
  assert.equal(defaultGrnLineCost({ costPrice: 0, lastBuyingPrice: 75 }), 75);
  assert.equal(defaultGrnLineCost({ costPrice: null, lastBuyingPrice: null }), 0);
  assert.equal(defaultGrnLineCost({}), 0);
});

test("an untouched cost is not an edit and sends nothing (the server uses the catalogue cost)", () => {
  assert.deepEqual(grnLineCostPayload(60, 60), {});
  assert.deepEqual(grnLineCostPayload(60.004, 60), {});
  assert.equal(isGrnCostEdit(60, 60), false);
});

test("a changed cost is sent so the API can authorise it", () => {
  assert.deepEqual(grnLineCostPayload(61, 60), { unitCost: 61 });
  assert.deepEqual(grnLineCostPayload(59.99, 60), { unitCost: 59.99 });
  assert.equal(isGrnCostEdit(1, 60), true);
});

test("a product with no catalogue cost: any typed cost is an edit", () => {
  assert.deepEqual(grnLineCostPayload(40, 0), { unitCost: 40 });
  assert.deepEqual(grnLineCostPayload(40, null), { unitCost: 40 });
});
