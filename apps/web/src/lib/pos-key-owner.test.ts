// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPosKeyOwnedByWidget, POS_OWN_KEYS_ATTR } from "./pos-key-owner.ts";

// Minimal stand-in for an element: closest() answers whether an ancestor carries the attribute.
const el = (insideOwner: boolean) => ({
  closest: (selector: string) => (insideOwner && selector === `[${POS_OWN_KEYS_ATTR}="true"]` ? {} : null),
});

test("inside an open widget, Escape / Enter / arrows / Home / End belong to the widget", () => {
  for (const k of ["Escape", "Enter", "ArrowUp", "ArrowDown", "Home", "End"]) {
    assert.equal(isPosKeyOwnedByWidget(el(true), k), true, k);
  }
});

test("other keys keep reaching the POS shortcuts (F-keys, letters, Tab)", () => {
  for (const k of ["F2", "F9", "F12", "a", "Tab", "Delete", "Backspace"]) {
    assert.equal(isPosKeyOwnedByWidget(el(true), k), false, k);
  }
});

test("outside an open widget nothing changes (Escape still reaches the POS handler)", () => {
  assert.equal(isPosKeyOwnedByWidget(el(false), "Escape"), false);
  assert.equal(isPosKeyOwnedByWidget(null, "Escape"), false);
  assert.equal(isPosKeyOwnedByWidget({}, "Escape"), false);
  assert.equal(isPosKeyOwnedByWidget(el(true), undefined), false);
});
