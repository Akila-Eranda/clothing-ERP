import { DEFAULT_QR_FEE_PERCENT, DEFAULT_QR_FEE_THRESHOLD, computeQrFee, qrFeeSettingsError, resolveQrFeeSettings } from './qr-fee.helper';

describe('QR fee settings', () => {
  it('defaults to LKR 5,000 and 1 %', () => {
    expect(resolveQrFeeSettings(undefined)).toEqual({ threshold: 5000, percent: 1 });
    expect(resolveQrFeeSettings({})).toEqual({ threshold: DEFAULT_QR_FEE_THRESHOLD, percent: DEFAULT_QR_FEE_PERCENT });
    expect(resolveQrFeeSettings({ pos: {} })).toEqual({ threshold: 5000, percent: 1 });
  });
  it('reads the shop setting, ignores invalid stored values', () => {
    expect(resolveQrFeeSettings({ pos: { qrFeeThreshold: 10000, qrFeePercent: 1.5 } })).toEqual({ threshold: 10000, percent: 1.5 });
    expect(resolveQrFeeSettings({ pos: { qrFeeThreshold: '2500', qrFeePercent: '0.5' } })).toEqual({ threshold: 2500, percent: 0.5 });
    expect(resolveQrFeeSettings({ pos: { qrFeeThreshold: -1, qrFeePercent: 99 } })).toEqual({ threshold: 5000, percent: 1 });
    expect(resolveQrFeeSettings({ pos: { qrFeeThreshold: 'abc', qrFeePercent: null } })).toEqual({ threshold: 5000, percent: 1 });
    expect(resolveQrFeeSettings({ pos: { qrFeePercent: 0 } }).percent).toBe(0); // 0 % = fee switched off
  });
  it('validates new settings', () => {
    expect(qrFeeSettingsError({ threshold: 5000, percent: 1 })).toBeNull();
    expect(qrFeeSettingsError({ threshold: 0, percent: 0 })).toBeNull();
    expect(qrFeeSettingsError({ percent: 2.25 })).toBeNull();
    expect(qrFeeSettingsError({ threshold: -1 })).toMatch(/negative/);
    expect(qrFeeSettingsError({ percent: -0.5 })).toMatch(/negative/);
    expect(qrFeeSettingsError({ percent: 100 })).toMatch(/above 20%/);
    expect(qrFeeSettingsError({ threshold: 1e12 })).toMatch(/cannot be above/);
    expect(qrFeeSettingsError({ threshold: 'abc' })).toMatch(/number/);
    expect(qrFeeSettingsError({ percent: 1.234 })).toMatch(/2 decimal/);
    expect(qrFeeSettingsError({ threshold: 10.005 })).toMatch(/2 decimal/);
  });
});

describe('QR fee calculation (Option A: deducted from the QR payment)', () => {
  const s = { threshold: 5000, percent: 1 };
  it('below and EXACTLY at the threshold: no fee, the business receives the whole amount', () => {
    expect(computeQrFee(4999.99, s)).toEqual({ amount: 4999.99, feePercent: 0, feeAmount: 0, netAmount: 4999.99 });
    expect(computeQrFee(5000, s)).toEqual({ amount: 5000, feePercent: 0, feeAmount: 0, netAmount: 5000 });
    expect(computeQrFee(100, s).feeAmount).toBe(0);
  });
  it('above the threshold: fee on the WHOLE gross amount, net = gross − fee (never more than gross)', () => {
    expect(computeQrFee(6000, s)).toEqual({ amount: 6000, feePercent: 1, feeAmount: 60, netAmount: 5940 });
    expect(computeQrFee(5000.01, s)).toEqual({ amount: 5000.01, feePercent: 1, feeAmount: 50, netAmount: 4950.01 });
    expect(computeQrFee(10000, s)).toEqual({ amount: 10000, feePercent: 1, feeAmount: 100, netAmount: 9900 });
    expect(computeQrFee(12345.67, s)).toEqual({ amount: 12345.67, feePercent: 1, feeAmount: 123.46, netAmount: 12222.21 });
  });
  it('configured threshold and percentage are used', () => {
    expect(computeQrFee(2500, { threshold: 2000, percent: 2.5 })).toEqual({ amount: 2500, feePercent: 2.5, feeAmount: 62.5, netAmount: 2437.5 });
    expect(computeQrFee(2000, { threshold: 2000, percent: 2.5 }).feeAmount).toBe(0);
    expect(computeQrFee(10, { threshold: 0, percent: 1 })).toEqual({ amount: 10, feePercent: 1, feeAmount: 0.1, netAmount: 9.9 }); // threshold 0
  });
  it('0 % switches the fee off; bad amounts give no fee', () => {
    expect(computeQrFee(100000, { threshold: 5000, percent: 0 })).toEqual({ amount: 100000, feePercent: 0, feeAmount: 0, netAmount: 100000 });
    expect(computeQrFee(-5, s)).toEqual({ amount: 0, feePercent: 0, feeAmount: 0, netAmount: 0 });
    expect(computeQrFee(Number.NaN, s).netAmount).toBe(0);
  });
  it('gross = net + fee to the cent, and the result is deterministic (a retry cannot apply a second fee)', () => {
    for (const a of [5000.01, 6000, 7777.77, 9999.99, 123456.78]) {
      const x = computeQrFee(a, s);
      expect(Math.round((x.netAmount + x.feeAmount) * 100)).toBe(Math.round(x.amount * 100));
      expect(computeQrFee(a, s)).toEqual(x);
    }
  });
});
