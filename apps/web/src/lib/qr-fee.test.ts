// Run: pnpm --filter ./apps/web test:unit   (Node's built-in test runner; no extra dependencies)
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQrFee, qrFeeSettingsOf, totalQrFee } from "./qr-fee.ts";

const s = { threshold: 5000, percent: 1 };

test("below and exactly at the threshold: no fee; above it: fee on the whole gross, deducted (net = gross − fee)", () => {
  assert.deepEqual(computeQrFee(4999.99, s), { amount: 4999.99, feePercent: 0, feeAmount: 0, netAmount: 4999.99 });
  assert.deepEqual(computeQrFee(5000, s), { amount: 5000, feePercent: 0, feeAmount: 0, netAmount: 5000 });
  assert.deepEqual(computeQrFee(5000.01, s), { amount: 5000.01, feePercent: 1, feeAmount: 50, netAmount: 4950.01 });
  assert.deepEqual(computeQrFee(6000, s), { amount: 6000, feePercent: 1, feeAmount: 60, netAmount: 5940 });
  assert.equal(computeQrFee(12345.67, s).netAmount, 12222.21);
});

test("configured threshold / percentage; 0 % switches the fee off; bad amounts give nothing", () => {
  assert.deepEqual(computeQrFee(2500, { threshold: 2000, percent: 2.5 }), { amount: 2500, feePercent: 2.5, feeAmount: 62.5, netAmount: 2437.5 });
  assert.equal(computeQrFee(2000, { threshold: 2000, percent: 2.5 }).feeAmount, 0);
  assert.equal(computeQrFee(100000, { threshold: 5000, percent: 0 }).netAmount, 100000);
  assert.equal(computeQrFee(-5, s).netAmount, 0);
  assert.equal(computeQrFee(Number.NaN, s).netAmount, 0);
});

test("fee rounding is half-up at the cent, matching the API", () => {
  assert.deepEqual(computeQrFee(5039, { threshold: 5000, percent: 1.5 }), {
    amount: 5039, feePercent: 1.5, feeAmount: 75.59, netAmount: 4963.41,
  });
  assert.deepEqual(computeQrFee(5000.5, { threshold: 5000, percent: 3 }), {
    amount: 5000.5, feePercent: 3, feeAmount: 150.02, netAmount: 4850.48,
  });
});

test("settings from the POS tenant settings, with defaults for missing or invalid values", () => {
  assert.deepEqual(qrFeeSettingsOf(undefined), { threshold: 5000, percent: 1 });
  assert.deepEqual(qrFeeSettingsOf({ qrFeeThreshold: 10000, qrFeePercent: 1.5 }), { threshold: 10000, percent: 1.5 });
  assert.deepEqual(qrFeeSettingsOf({ qrFeeThreshold: -3, qrFeePercent: Number.NaN }), { threshold: 5000, percent: 1 });
  assert.deepEqual(qrFeeSettingsOf({ qrFeeThreshold: 0, qrFeePercent: 0 }), { threshold: 0, percent: 0 });
});

test("several QR tenders: fee per tender, never on the total; gross = net + fee", () => {
  assert.deepEqual(totalQrFee([6000, 4000], s), { fee: 60, amount: 10000, netAmount: 9940 });
  assert.deepEqual(totalQrFee([4000, 4000], s), { fee: 0, amount: 8000, netAmount: 8000 }); // each tender is below the threshold
  assert.deepEqual(totalQrFee([6000, 3000, 6000], s), { fee: 120, amount: 15000, netAmount: 14880 });
});
