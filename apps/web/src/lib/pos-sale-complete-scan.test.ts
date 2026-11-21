import assert from "node:assert/strict";
import test from "node:test";
import { captureSaleCompleteScanKey } from "./pos-sale-complete-scan.ts";

test("recognizes a rapid barcode scan and requests a notice on Enter", () => {
  let buffer = captureSaleCompleteScanKey("", "A", 500, false).buffer;
  for (const key of ["B", "1"]) {
    buffer = captureSaleCompleteScanKey(buffer, key, 20, false).buffer;
  }

  assert.deepEqual(captureSaleCompleteScanKey(buffer, "Enter", 20, false), {
    buffer: "",
    shouldNotify: true,
  });
});

test("does not notify for ordinary Enter or an incomplete scan", () => {
  assert.equal(captureSaleCompleteScanKey("", "Enter", 20, false).shouldNotify, false);
  assert.equal(captureSaleCompleteScanKey("AB", "Enter", 20, false).shouldNotify, false);
});

test("does not combine characters separated by normal typing intervals", () => {
  const first = captureSaleCompleteScanKey("", "A", 20, false);
  const next = captureSaleCompleteScanKey(first.buffer, "B", 80, false);

  assert.equal(next.buffer, "B");
  assert.equal(next.shouldNotify, false);
});
