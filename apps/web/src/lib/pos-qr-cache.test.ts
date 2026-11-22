// Run: pnpm --filter ./apps/web test:unit
// QA-002: the POS QR list must not stay stale after an admin changes a QR code / bank account.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPosQrCache } from "./pos-qr-cache.ts";

test("serves the cached list within the TTL, then expires", () => {
  let t = 1000;
  const c = createPosQrCache<string>(60_000, () => t);
  assert.equal(c.get(), null);
  c.set(["a"]);
  t += 59_000; assert.deepEqual(c.get(), ["a"]);
  t += 2_000; assert.equal(c.get(), null);
});

test("invalidate() drops the list immediately (admin saved a QR / bank account)", () => {
  const c = createPosQrCache<string>();
  c.set(["a", "b"]);
  c.invalidate();
  assert.equal(c.get(), null);
});

test("force bypasses the cache", () => {
  const c = createPosQrCache<string>();
  c.set(["a"]);
  assert.equal(c.get(true), null);
});
