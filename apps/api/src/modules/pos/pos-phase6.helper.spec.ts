import {
  applyGiftVoucherRedeem,
  computeHelperCommission,
  generateGiftVoucherCode,
  scanCycleBudgetMs,
  stackCartQuantity,
} from './pos-phase6.helper';

function localSubtotal(items: { unitPrice: number; quantity: number }[]) {
  return items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
}

describe('Phase 6 POS — high-speed & accuracy', () => {
  describe('Helper commission', () => {
    it('computes percent of sale', () => {
      expect(computeHelperCommission(10000, 5)).toBe(500);
      expect(computeHelperCommission(0, 5)).toBe(0);
      expect(computeHelperCommission(1000, 0)).toBe(0);
    });
  });

  describe('Gift voucher redeem', () => {
    it('fully redeems when balance covers due', () => {
      const r = applyGiftVoucherRedeem(5000, 3200);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.applied).toBe(3200);
        expect(r.remainingBalance).toBe(1800);
        expect(r.status).toBe('PARTIALLY_USED');
      }
    });

    it('marks REDEEMED when balance exhausted', () => {
      const r = applyGiftVoucherRedeem(1000, 2500);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.applied).toBe(1000);
        expect(r.remainingBalance).toBe(0);
        expect(r.status).toBe('REDEEMED');
      }
    });

    it('rejects empty balance', () => {
      const r = applyGiftVoucherRedeem(0, 100);
      expect(r.ok).toBe(false);
    });
  });

  describe('Cart quantity stacking (scan speed)', () => {
    it('stacks qty up to stock', () => {
      expect(stackCartQuantity(1, 1, 10)).toBe(2);
      expect(stackCartQuantity(9, 5, 10)).toBe(10);
      expect(stackCartQuantity(0, 3, 5)).toBe(3);
    });

    it('generates unique-ish voucher codes', () => {
      const a = generateGiftVoucherCode();
      const b = generateGiftVoucherCode();
      expect(a).toMatch(/^GV-/);
      expect(a).not.toBe(b);
    });
  });

  describe('High-speed scan budget', () => {
    it('allows ~5 scans/sec under 200ms/cycle', () => {
      expect(scanCycleBudgetMs(5)).toBe(200);
      expect(scanCycleBudgetMs(10)).toBe(100);
    });

    it('keeps cart totals stable under rapid line adds', () => {
      const items: { unitPrice: number; quantity: number }[] = [];
      for (let i = 0; i < 50; i++) {
        const q = stackCartQuantity(0, 1 + (i % 3), 100);
        items.push({ unitPrice: 100 + (i % 7), quantity: q });
      }
      const sub = localSubtotal(items);
      expect(sub).toBeGreaterThan(0);
      expect(Number.isFinite(sub)).toBe(true);
    });
  });
});
