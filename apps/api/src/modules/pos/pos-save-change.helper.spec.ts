import {
  SaveChangeInput,
  SaveChangeSettings,
  decideSaveChange,
  resolveSaveChangeSettings,
  walletDebitFloor,
} from './pos-save-change.helper';

const ON: SaveChangeSettings = { enabled: true, min: 0, max: null };

/** Bill 129, customer hands over 200 cash, change 71 (the reference scenario). */
const input = (over: Partial<SaveChangeInput> = {}): SaveChangeInput => ({
  requested: 71,
  consent: true,
  customerId: 'cust-1',
  changeDue: 71,
  cashPaid: 200,
  isPartial: false,
  creditPayTotal: 0,
  settings: ON,
  ...over,
});

describe('pos-save-change.helper', () => {
  describe('resolveSaveChangeSettings', () => {
    it('defaults to disabled, no minimum and no cap when nothing is configured', () => {
      const off = { enabled: false, min: 0, max: null };
      expect(resolveSaveChangeSettings(undefined)).toEqual(off);
      expect(resolveSaveChangeSettings(null)).toEqual(off);
      expect(resolveSaveChangeSettings({})).toEqual(off);
      expect(resolveSaveChangeSettings({ pos: null })).toEqual(off);
      expect(resolveSaveChangeSettings({ pos: {} })).toEqual(off);
      expect(resolveSaveChangeSettings('not-an-object')).toEqual(off);
    });

    it('is enabled only by a literal boolean true (opt-in)', () => {
      expect(resolveSaveChangeSettings({ pos: { saveChangeToWalletEnabled: true } }).enabled).toBe(true);
      for (const v of ['true', 1, 'yes', false, null, undefined]) {
        expect(resolveSaveChangeSettings({ pos: { saveChangeToWalletEnabled: v } }).enabled).toBe(false);
      }
    });

    it('reads min / max from numbers and numeric strings, rounded to 2 decimals', () => {
      expect(resolveSaveChangeSettings({ pos: { saveChangeToWalletEnabled: true, saveChangeMin: 5, saveChangeMax: 1000 } }))
        .toEqual({ enabled: true, min: 5, max: 1000 });
      expect(resolveSaveChangeSettings({ pos: { saveChangeMin: ' 10.5 ', saveChangeMax: '250' } }))
        .toMatchObject({ min: 10.5, max: 250 });
      expect(resolveSaveChangeSettings({ pos: { saveChangeMin: 0.1 + 0.2, saveChangeMax: 99.999 } }))
        .toMatchObject({ min: 0.3, max: 100 });
    });

    it('ignores invalid min (negative / NaN / blank / non-numeric) and falls back to 0', () => {
      for (const v of [-1, NaN, Infinity, '', '   ', 'abc', null, {}, true]) {
        expect(resolveSaveChangeSettings({ pos: { saveChangeMin: v } }).min).toBe(0);
      }
      expect(resolveSaveChangeSettings({ pos: { saveChangeMin: 0 } }).min).toBe(0);
    });

    it('treats max <= 0 or invalid as "no cap" (null)', () => {
      for (const v of [0, -5, NaN, Infinity, '', 'x', null]) {
        expect(resolveSaveChangeSettings({ pos: { saveChangeMax: v } }).max).toBeNull();
      }
    });

    it('does not validate min > max (both are kept as configured)', () => {
      // Documented ambiguity: such a config refuses every save request; see report.
      expect(resolveSaveChangeSettings({ pos: { saveChangeMin: 100, saveChangeMax: 50 } })).toMatchObject({ min: 100, max: 50 });
    });
  });

  describe('decideSaveChange: happy path', () => {
    it('pays 200 on a 129 bill and saves the full 71 change', () => {
      expect(decideSaveChange(input())).toEqual({ ok: true, amount: 71 });
    });

    it('may save only part of the change (the rest is handed back in cash)', () => {
      expect(decideSaveChange(input({ requested: 50 }))).toEqual({ ok: true, amount: 50 });
    });

    it('rounds the requested amount to 2 decimals', () => {
      expect(decideSaveChange(input({ requested: 70.004 }))).toEqual({ ok: true, amount: 70 });
      expect(decideSaveChange(input({ requested: 0.1 + 0.2, changeDue: 0.3, cashPaid: 100 }))).toEqual({ ok: true, amount: 0.3 });
    });

    it('accepts a request that equals the change after rounding (float dust on change)', () => {
      // 200 - 129.1 = 70.9 but floats give 70.90000000000001
      const changeDue = 200 - 129.1;
      expect(decideSaveChange(input({ requested: 70.9, changeDue }))).toEqual({ ok: true, amount: 70.9 });
    });

    it('never returns more than the change', () => {
      for (const requested of [0.01, 1, 35.5, 70.99, 71]) {
        const d = decideSaveChange(input({ requested }));
        expect(d.ok).toBe(true);
        if (d.ok) {
          expect(d.amount).toBeLessThanOrEqual(71);
          expect(d.amount).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('decideSaveChange: nothing requested', () => {
    it('returns amount 0 for undefined / null / 0 / negative / sub-cent requests, even when the feature is off', () => {
      for (const requested of [undefined, null, 0, -10, 0.004]) {
        expect(decideSaveChange(input({ requested, settings: { enabled: false, min: 0, max: null }, consent: false, customerId: null })))
          .toEqual({ ok: true, amount: 0 });
      }
    });
  });

  describe('decideSaveChange: refusals', () => {
    it('refuses when the shop has not enabled the feature', () => {
      const d = decideSaveChange(input({ settings: { enabled: false, min: 0, max: null } }));
      expect(d).toEqual({ ok: false, reason: expect.stringMatching(/not enabled/) });
    });

    it('refuses without explicit consent (only boolean true counts)', () => {
      for (const consent of [false, null, undefined, 'true' as unknown as boolean, 1 as unknown as boolean]) {
        expect(decideSaveChange(input({ consent }))).toEqual({ ok: false, reason: expect.stringMatching(/consent/i) });
      }
    });

    it('refuses without a customer account', () => {
      for (const customerId of [null, undefined, '']) {
        expect(decideSaveChange(input({ customerId }))).toEqual({ ok: false, reason: expect.stringMatching(/Select a customer/) });
      }
    });

    it('checks enabled before consent before customer', () => {
      const d1 = decideSaveChange(input({ settings: { enabled: false, min: 0, max: null }, consent: false, customerId: null }));
      expect(d1.ok === false && d1.reason).toMatch(/not enabled/);
      const d2 = decideSaveChange(input({ consent: false, customerId: null }));
      expect(d2.ok === false && d2.reason).toMatch(/consent/i);
    });

    it('refuses on a partial sale or when any customer-credit tender is used', () => {
      expect(decideSaveChange(input({ isPartial: true }))).toEqual({ ok: false, reason: expect.stringMatching(/partial or credit/) });
      expect(decideSaveChange(input({ creditPayTotal: 0.01 }))).toEqual({ ok: false, reason: expect.stringMatching(/partial or credit/) });
    });

    it('ignores sub-cent credit dust (<= 0.009)', () => {
      expect(decideSaveChange(input({ creditPayTotal: 0.009 }))).toEqual({ ok: true, amount: 71 });
    });

    it('refuses when the sale has no change (exact payment, negative or sub-cent change)', () => {
      for (const changeDue of [0, -5, 0.004]) {
        expect(decideSaveChange(input({ changeDue }))).toEqual({ ok: false, reason: 'This sale has no change to save' });
      }
    });

    it('refuses to save more than the change (no money created)', () => {
      const d = decideSaveChange(input({ requested: 71.01 }));
      expect(d).toEqual({ ok: false, reason: 'Only the change (LKR 71.00) can be saved to the customer account' });
      expect(decideSaveChange(input({ requested: Infinity })).ok).toBe(false);
    });

    it('refuses when the request exceeds the cash tendered (change only from cash)', () => {
      // e.g. a card overpay produced "change" of 71 but only 20 cash was handed over
      const d = decideSaveChange(input({ cashPaid: 20 }));
      expect(d).toEqual({ ok: false, reason: expect.stringMatching(/cash payment/) });
      expect(decideSaveChange(input({ cashPaid: 0 })).ok).toBe(false);
      expect(decideSaveChange(input({ cashPaid: -100 })).ok).toBe(false);
      expect(decideSaveChange(input({ cashPaid: 71 }))).toEqual({ ok: true, amount: 71 });
    });
  });

  describe('decideSaveChange: min / max knobs', () => {
    it('enforces the minimum (inclusive)', () => {
      const settings = { enabled: true, min: 10, max: null };
      expect(decideSaveChange(input({ requested: 9.99, settings }))).toEqual({ ok: false, reason: 'The smallest amount that can be saved is LKR 10.00' });
      expect(decideSaveChange(input({ requested: 10, settings }))).toEqual({ ok: true, amount: 10 });
    });

    it('enforces the per-sale maximum (inclusive)', () => {
      const settings = { enabled: true, min: 0, max: 50 };
      expect(decideSaveChange(input({ requested: 50.01, settings }))).toEqual({ ok: false, reason: 'At most LKR 50.00 can be saved per sale' });
      expect(decideSaveChange(input({ requested: 50, settings }))).toEqual({ ok: true, amount: 50 });
    });

    it('max = null means no cap besides the change itself', () => {
      expect(decideSaveChange(input({ requested: 9999, changeDue: 9999, cashPaid: 10000 }))).toEqual({ ok: true, amount: 9999 });
    });

    it('min > max refuses every request (configuration ambiguity)', () => {
      const settings = { enabled: true, min: 100, max: 50 };
      for (const requested of [40, 60, 71]) {
        expect(decideSaveChange(input({ requested, changeDue: 200, cashPaid: 500, settings })).ok).toBe(false);
      }
    });
  });

  describe('decideSaveChange: non-finite inputs', () => {
    // Fixed: NaN used to slip through every `>` / `<` comparison and be approved. Now fails closed.
    it('refuses a NaN requested amount instead of approving amount NaN', () => {
      expect(decideSaveChange(input({ requested: NaN })).ok).toBe(false);
    });

    it('refuses when the server-computed changeDue is NaN', () => {
      expect(decideSaveChange(input({ changeDue: NaN })).ok).toBe(false);
    });

    it('refuses when cashPaid is NaN (the cash-only guard must not be bypassed)', () => {
      expect(decideSaveChange(input({ cashPaid: NaN })).ok).toBe(false);
    });

    it('refuses when creditPayTotal is NaN (credit-sale guard must not be bypassed)', () => {
      expect(decideSaveChange(input({ creditPayTotal: NaN })).ok).toBe(false);
    });

    it('a NaN request is refused with the invalid-number reason (no longer approved with amount NaN)', () => {
      expect(decideSaveChange(input({ requested: NaN })))
        .toEqual({ ok: false, reason: 'Change cannot be saved: the sale amounts are not valid numbers' });
    });

    it('refuses +/-Infinity in any amount', () => {
      for (const v of [Infinity, -Infinity]) {
        expect(decideSaveChange(input({ requested: v })).ok).toBe(false);
        expect(decideSaveChange(input({ changeDue: v })).ok).toBe(false);
        expect(decideSaveChange(input({ cashPaid: v })).ok).toBe(false);
        expect(decideSaveChange(input({ creditPayTotal: v })).ok).toBe(false);
      }
    });

    it('fails closed even when nothing is requested if a sale amount is non-finite', () => {
      expect(decideSaveChange(input({ requested: 0, changeDue: NaN })).ok).toBe(false);
      expect(decideSaveChange(input({ requested: undefined, cashPaid: NaN })).ok).toBe(false);
    });

    it('a missing (null / undefined) request is not treated as non-finite', () => {
      expect(decideSaveChange(input({ requested: null }))).toEqual({ ok: true, amount: 0 });
      expect(decideSaveChange(input({ requested: undefined }))).toEqual({ ok: true, amount: 0 });
    });
  });

  describe('walletDebitFloor', () => {
    it('is the 2-dp amount minus a sub-cent tolerance', () => {
      expect(walletDebitFloor(20)).toBeCloseTo(19.999999, 9);
      expect(walletDebitFloor(51)).toBeLessThan(51);
      expect(walletDebitFloor(51)).toBeGreaterThan(50.99999);
    });

    it('absorbs float dust: a balance of 51 read as 50.99999999999 still covers a 51 debit', () => {
      const balance = 50.99999999999;
      expect(balance >= walletDebitFloor(51)).toBe(true);
    });

    it('never lets a debit exceed the balance by a real amount (one cent short is refused)', () => {
      expect(50.99 >= walletDebitFloor(51)).toBe(false);
      expect(50.999 >= walletDebitFloor(51)).toBe(false);
    });

    it('rounds the amount first (0.1 + 0.2 debits 0.30)', () => {
      expect(walletDebitFloor(0.1 + 0.2)).toBeCloseTo(0.299999, 9);
      expect(0.3 >= walletDebitFloor(0.1 + 0.2)).toBe(true);
    });

    it('reference scenario: 71 saved, 20 spent, 51 left; a 52 debit is refused, 51 allowed (no double spend)', () => {
      let balance = 0;
      const save = decideSaveChange(input());
      if (save.ok) balance += save.amount;
      expect(balance).toBe(71);
      const debit = (amt: number) => {
        if (balance >= walletDebitFloor(amt)) { balance -= amt; return true; }
        return false;
      };
      expect(debit(20)).toBe(true);
      expect(balance).toBe(51);
      expect(debit(52)).toBe(false);
      expect(debit(51)).toBe(true);
      expect(debit(0.01)).toBe(false);
      expect(balance).toBe(0);
    });

    it('throws for non-finite, zero, negative or sub-cent amounts instead of returning a meaningless floor', () => {
      for (const amt of [0, -20, -0.01, 0.004, NaN, Infinity, -Infinity]) {
        expect(() => walletDebitFloor(amt)).toThrow(/debit amount must be a finite number of at least 0.01/);
      }
    });

    it('accepts the smallest real debit (0.005 rounds to 0.01)', () => {
      expect(walletDebitFloor(0.01)).toBeCloseTo(0.009999, 9);
      expect(walletDebitFloor(0.005)).toBeCloseTo(0.009999, 9);
    });
  });
});
