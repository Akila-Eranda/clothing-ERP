import { computeQrFee } from './qr-fee.helper';
import { computeQrFeeCents } from './qr-fee-cents.helper';

const DEF = { threshold: 5000, percent: 1 };

describe('computeQrFeeCents (integer-cent QR fee)', () => {
  it('same threshold rule: below and exactly at the threshold no fee, above it fee on the whole gross', () => {
    expect(computeQrFeeCents(4999.99, DEF)).toEqual({ amount: 4999.99, feePercent: 0, feeAmount: 0, netAmount: 4999.99 });
    expect(computeQrFeeCents(5000, DEF)).toEqual({ amount: 5000, feePercent: 0, feeAmount: 0, netAmount: 5000 });
    expect(computeQrFeeCents(5000.01, DEF)).toEqual({ amount: 5000.01, feePercent: 1, feeAmount: 50, netAmount: 4950.01 });
    expect(computeQrFeeCents(6000, DEF)).toEqual({ amount: 6000, feePercent: 1, feeAmount: 60, netAmount: 5940 });
  });

  it('0 %, negative, NaN and Infinity amounts give no fee', () => {
    expect(computeQrFeeCents(9000, { threshold: 0, percent: 0 }).feeAmount).toBe(0);
    for (const bad of [-10, NaN, Infinity]) expect(computeQrFeeCents(bad, DEF)).toEqual({ amount: 0, feePercent: 0, feeAmount: 0, netAmount: 0 });
  });

  it('exact half cents round UP (the float helper rounds some of them down)', () => {
    expect(computeQrFeeCents(5039, { threshold: 5000, percent: 1.5 }).feeAmount).toBe(75.59); // 75.585
    expect(computeQrFeeCents(5000.5, { threshold: 5000, percent: 3 }).feeAmount).toBe(150.02); // 150.015
    expect(computeQrFeeCents(5046, { threshold: 5000, percent: 2.75 }).feeAmount).toBe(138.77); // 138.765
    // documents the defect being replaced
    expect(computeQrFee(5039, { threshold: 5000, percent: 1.5 }).feeAmount).toBe(75.58);
  });

  it('gross = fee + net to the cent and never differs from the float helper by more than 1 cent', () => {
    const pcts = [0.25, 0.5, 1, 1.25, 1.5, 2, 2.75, 3, 0.33, 20];
    for (let c = 500001; c < 1500000; c += 37) {
      const a = c / 100;
      for (const percent of pcts) {
        const s = { threshold: 5000, percent };
        const x = computeQrFeeCents(a, s);
        expect(Math.round(x.feeAmount * 100) + Math.round(x.netAmount * 100)).toBe(c);
        expect(x.feeAmount).toBeLessThanOrEqual(x.amount);
        expect(Math.abs(x.feeAmount - computeQrFee(a, s).feeAmount)).toBeLessThanOrEqual(0.0100001);
      }
    }
  });

  it('large amounts stay exact', () => {
    expect(computeQrFeeCents(99_999_999.99, { threshold: 0, percent: 20 })).toEqual({
      amount: 99_999_999.99, feePercent: 20, feeAmount: 20_000_000, netAmount: 79_999_999.99,
    });
  });
});
