// Run: pnpm --filter ./apps/web test:unit
// QA-007: early (screen) feedback for bill-only / Demo Product lines mirrors the API rule.
import { test } from "node:test";
import assert from "node:assert/strict";
import { canSellBillOnlyItems, cartHasBillOnlyItems, rolesFromToken } from "./pos-custom-items.ts";

const tokenWith = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

test("managers and admins may sell bill-only lines; cashiers may not", () => {
  assert.equal(canSellBillOnlyItems({ tokenRoles: ["TENANT_ADMIN"] }), true);
  assert.equal(canSellBillOnlyItems({ tokenRoles: ["branch-manager"] }), true);
  assert.equal(canSellBillOnlyItems({ tokenRoles: ["CASHIER"] }), false);
  assert.equal(canSellBillOnlyItems({ tokenRoles: [], userRole: "cashier" }), false);
});

test("a user with several roles qualifies if ANY role qualifies (the old check only looked at the first role)", () => {
  assert.equal(canSellBillOnlyItems({ tokenRoles: ["CASHIER", "BRANCH_MANAGER"], userRole: "cashier" }), true);
});

test("the PIN-unlocked operator decides, not the terminal login", () => {
  // manager signed in, cashier unlocked with PIN -> the API attributes the sale to the cashier -> refused
  assert.equal(canSellBillOnlyItems({ pinCashierRole: "CASHIER", tokenRoles: ["TENANT_ADMIN"] }), false);
  // cashier terminal, manager unlocked with PIN -> allowed
  assert.equal(canSellBillOnlyItems({ pinCashierRole: "branch_manager", tokenRoles: ["CASHIER"] }), true);
});

test("no role information never grants permission", () => {
  assert.equal(canSellBillOnlyItems({}), false);
  assert.equal(canSellBillOnlyItems({ tokenRoles: null, userRole: null }), false);
});

test("rolesFromToken reads the roles claim and survives bad tokens", () => {
  assert.deepEqual(rolesFromToken(tokenWith({ roles: ["CASHIER", 7, "TENANT_ADMIN"] })), ["CASHIER", "TENANT_ADMIN"]);
  assert.deepEqual(rolesFromToken("garbage"), []);
  assert.deepEqual(rolesFromToken(null), []);
});

test("cartHasBillOnlyItems: demo/custom lines count, catalog and reload lines do not", () => {
  assert.equal(cartHasBillOnlyItems([{ variantId: "v1" }]), false);
  assert.equal(cartHasBillOnlyItems([{ variantId: "v1" }, { variantId: "custom-abc", isCustom: true }]), true);
  assert.equal(cartHasBillOnlyItems([{ isCustom: true }]), true);
  assert.equal(cartHasBillOnlyItems([{ variantId: "custom-reload-1", isCustom: true, reloadType: "DIGITAL" }]), false);
});
