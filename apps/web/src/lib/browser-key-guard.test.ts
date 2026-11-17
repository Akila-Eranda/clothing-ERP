// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { isFunctionKey, shouldBlockBrowserDefault } from "./browser-key-guard.ts";

test("F9 never reaches the browser (Edge Reading mode), on any page", () => {
  assert.equal(shouldBlockBrowserDefault("F9", false), true);
  assert.equal(shouldBlockBrowserDefault("F9", true), true);
});

test("outside the POS only F9 is blocked: reload, full screen and DevTools keep working", () => {
  for (const k of ["F1", "F3", "F5", "F7", "F10", "F11", "F12"]) assert.equal(shouldBlockBrowserDefault(k, false), false, k);
});

test("inside the POS every function key is a POS shortcut", () => {
  for (let i = 1; i <= 12; i++) assert.equal(shouldBlockBrowserDefault(`F${i}`, true), true, `F${i}`);
});

test("ordinary keys are never blocked", () => {
  for (const k of ["a", "Enter", "Escape", "Tab", "9", "F", "F13", "F0", "", undefined, null]) {
    assert.equal(shouldBlockBrowserDefault(k as string, true), false, String(k));
    assert.equal(shouldBlockBrowserDefault(k as string, false), false, String(k));
  }
  assert.equal(isFunctionKey("F12"), true);
  assert.equal(isFunctionKey("F13"), false);
});
