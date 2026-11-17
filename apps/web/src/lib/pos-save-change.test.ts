import test from "node:test";
import assert from "node:assert/strict";
import { validateSaveChangeInput } from "./pos-save-change.ts";

const base = {
  enabled: true,
  consent: true,
  amountInput: "71",
  customerId: "customer-1",
  changeDue: 71,
};

test("accepts the reference Rs.129 bill with Rs.71 saved", () => {
  assert.deepEqual(validateSaveChangeInput(base), { ok: true, amount: 71 });
});

test("requires a customer and explicit consent", () => {
  assert.equal(validateSaveChangeInput({ ...base, customerId: undefined }).ok, false);
  assert.equal(validateSaveChangeInput({ ...base, consent: false }).ok, false);
  assert.equal(validateSaveChangeInput({ ...base, consent: false, amountInput: "20" }).ok, false);
});

test("rejects amounts above change and accepts a partial wallet credit", () => {
  assert.equal(validateSaveChangeInput({ ...base, amountInput: "72" }).ok, false);
  assert.deepEqual(validateSaveChangeInput({ ...base, amountInput: "20" }), { ok: true, amount: 20 });
});
