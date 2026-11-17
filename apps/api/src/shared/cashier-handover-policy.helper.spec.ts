import { CashMovementType, CashRegisterStatus } from '@prisma/client';
import { HandoverPlan, planHandover } from './cash-handover.helper';
import { CASH_VARIANCE_APPROVAL_THRESHOLD } from './cash-register.helper';
import {
  CounterWalletState,
  DayEndHandoverRow,
  HandoverVarianceWallet,
  closeShiftBlocker,
  evaluateHandoverVariance,
  handoverConservationErrors,
  handoverReplayDecision,
  handoverVarianceError,
  summarizeHandoversForDayEnd,
  walletsToCarryOver,
} from './cashier-handover-policy.helper';

const { OPEN, CLOSED, PENDING_APPROVAL } = CashRegisterStatus;
const mv = (type: CashMovementType, amount: number) => ({ type, amount });
const at = (minutes: number) => new Date(Date.UTC(2026, 10, 9, 8, minutes));

const row = (id: string, expected: number, counted: number) => ({ id, expected, counted, variance: Math.round((counted - expected) * 100) / 100 });
const plan = (rows: ReturnType<typeof row>[], over: Partial<HandoverPlan> = {}): HandoverPlan => {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const expectedTotal = r2(rows.reduce((s, r) => s + r.expected, 0));
  const countedTotal = r2(rows.reduce((s, r) => s + r.counted, 0));
  return { expectedTotal, countedTotal, variance: r2(countedTotal - expectedTotal), counted: true, wallets: rows, ...over };
};

const vWallet = (over: Partial<HandoverVarianceWallet> & { id: string }): HandoverVarianceWallet => ({
  status: OPEN, openingCash: 0, movements: [], actualCash: null, closeVarianceApproved: false, ...over,
});

describe('cashier-handover-policy.helper', () => {
  describe('handoverConservationErrors', () => {
    it('a plan built by planHandover with the counted total as opening float is consistent', () => {
      const p = planHandover([
        { id: 'early', status: CLOSED, actualCash: 1000, openingCash: 0, openingTime: at(0), movements: [] },
        { id: 'late', status: OPEN, actualCash: null, openingCash: 0, openingTime: at(30), movements: [mv('SALE', 200)] },
      ], 900);
      expect(handoverConservationErrors(p, 900)).toEqual([]);
    });

    it('carries the exact balance: no count means opening float = expected total', () => {
      const p = planHandover([{ id: 'a', status: OPEN, actualCash: null, openingCash: 5000, openingTime: at(0), movements: [mv('SALE', 12345.67)] }]);
      expect(handoverConservationErrors(p, 17345.67)).toEqual([]);
    });

    it('flags an opening float that differs from the cash handed over (cash created / lost)', () => {
      const p = plan([row('a', 1000, 1000)]);
      expect(handoverConservationErrors(p, 0)).toEqual(['Incoming opening float (0) must equal the cash handed over (1000)']);
      expect(handoverConservationErrors(p, 1000.01)).toHaveLength(1);
    });

    it('rounds the opening float to 2 decimals and tolerates float dust (0.1 + 0.2)', () => {
      const p = plan([row('a', 0.1, 0.1), row('b', 0.2, 0.2)]);
      expect(p.countedTotal).toBe(0.3);
      expect(handoverConservationErrors(p, 0.1 + 0.2)).toEqual([]);
      expect(handoverConservationErrors(p, 0.304)).toEqual([]);
    });

    it('flags a negative wallet hand-over (beyond sub-cent tolerance)', () => {
      const p = plan([row('a', 100, -10), row('b', 0, 110)]);
      expect(handoverConservationErrors(p, 100)).toEqual(['A wallet cannot hand over a negative amount']);
      const dust = plan([row('a', 0, -0.003), row('b', 0, 0.003)]);
      expect(handoverConservationErrors(dust, 0)).toEqual([]);
    });

    it('flags wallet counts, balances and variances that do not add up to the totals', () => {
      const p = plan([row('a', 100, 90)], { countedTotal: 95, expectedTotal: 101, variance: -5 });
      const errs = handoverConservationErrors(p, 95);
      expect(errs).toEqual([
        'Wallet counts (90) do not add up to the counted total (95)',
        'Wallet balances (100) do not add up to the expected total (101)',
        'Wallet variances (-10) do not add up to the handover variance (-5)',
      ]);
    });

    it('an empty wallet list with zero totals and zero float is consistent', () => {
      expect(handoverConservationErrors(plan([]), 0)).toEqual([]);
    });

    // Fixed: NaN used to fail every `> EPS` comparison and be reported as consistent.
    it('flags a NaN incoming opening float', () => {
      expect(handoverConservationErrors(plan([row('a', 100, 100)]), NaN)).not.toEqual([]);
    });

    it('reports exactly which figures are non-finite (NaN / Infinity)', () => {
      expect(handoverConservationErrors(plan([row('a', 100, 100)]), Infinity))
        .toEqual(['Handover figures are not valid numbers: incoming opening float']);
      expect(handoverConservationErrors(plan([row('a', 100, 100)], { countedTotal: NaN, expectedTotal: Infinity, variance: -Infinity }), 100))
        .toEqual(['Handover figures are not valid numbers: counted total, expected total, handover variance']);
      const badWallet = plan([row('a', 100, 100), { id: 'b', expected: 0, counted: NaN, variance: 0 }], { countedTotal: 100, variance: 0 });
      expect(handoverConservationErrors(badWallet, 100)).toEqual(['Handover figures are not valid numbers: wallet b']);
      const badVariance = plan([{ id: 'a', expected: Infinity, counted: 100, variance: 0 }], { expectedTotal: 100, variance: 0 });
      expect(handoverConservationErrors(badVariance, 100)).toEqual(['Handover figures are not valid numbers: wallet a']);
    });
  });

  describe('evaluateHandoverVariance', () => {
    it('no difference: nothing required', () => {
      const w = vWallet({ id: 'a', openingCash: 1000, movements: [mv('SALE', 500)] });
      const d = evaluateHandoverVariance([w], plan([row('a', 1500, 1500)]));
      expect(d).toEqual({
        handoverVariance: 0, systemVariance: 0, unapprovedVariance: 0, checkedVariance: 0,
        needsApproval: false, reasonRequired: false, threshold: CASH_VARIANCE_APPROVAL_THRESHOLD,
      });
    });

    it('defaults to the 500 threshold, strictly greater than', () => {
      expect(CASH_VARIANCE_APPROVAL_THRESHOLD).toBe(500);
      const w = vWallet({ id: 'a', openingCash: 1000 });
      const at500 = evaluateHandoverVariance([w], plan([row('a', 1000, 500)]));
      expect(at500).toMatchObject({ handoverVariance: -500, needsApproval: false, reasonRequired: true });
      const over = evaluateHandoverVariance([w], plan([row('a', 1000, 499.99)]));
      expect(over.needsApproval).toBe(true);
      const overage = evaluateHandoverVariance([w], plan([row('a', 1000, 1500.01)]));
      expect(overage).toMatchObject({ handoverVariance: 500.01, needsApproval: true });
    });

    it('any difference needs a reason by default (reasonAbove = 0); a custom reasonAbove raises that bar', () => {
      const w = vWallet({ id: 'a', openingCash: 100 });
      expect(evaluateHandoverVariance([w], plan([row('a', 100, 99.99)])).reasonRequired).toBe(true);
      expect(evaluateHandoverVariance([w], plan([row('a', 100, 90)]), { reasonAbove: 10 }).reasonRequired).toBe(false);
      expect(evaluateHandoverVariance([w], plan([row('a', 100, 89.99)]), { reasonAbove: 10 }).reasonRequired).toBe(true);
    });

    it('honours a custom threshold', () => {
      const w = vWallet({ id: 'a', openingCash: 100 });
      const d = evaluateHandoverVariance([w], plan([row('a', 100, 49)]), { threshold: 50 });
      expect(d).toMatchObject({ threshold: 50, needsApproval: true });
      expect(evaluateHandoverVariance([w], plan([row('a', 100, 50)]), { threshold: 50 }).needsApproval).toBe(false);
    });

    it('approved HANDOVER_ONLY policy: prior close variance is excluded from approval', () => {
      // System expected 5000; outgoing cashier counted 4600 at close (unapproved); incoming counts 4200.
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 5000, actualCash: 4600 });
      const d = evaluateHandoverVariance([w], plan([row('a', 4600, 4200)]));
      expect(d).toMatchObject({ handoverVariance: -400, systemVariance: -800, unapprovedVariance: -800, checkedVariance: -400, needsApproval: false });
    });

    it('defaults to HANDOVER_ONLY when the variance mode is omitted', () => {
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 5000, actualCash: 4600 });
      const d = evaluateHandoverVariance([w], plan([row('a', 4600, 4200)]));
      expect(d.checkedVariance).toBe(d.handoverVariance);
      expect(d.checkedVariance).not.toBe(d.unapprovedVariance);
    });

    it('CUMULATIVE: the same 400 + 400 shortage needs a manager', () => {
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 5000, actualCash: 4600 });
      const d = evaluateHandoverVariance([w], plan([row('a', 4600, 4200)]), { mode: 'CUMULATIVE' });
      expect(d).toMatchObject({ checkedVariance: -800, needsApproval: true, reasonRequired: true });
    });

    it('CUMULATIVE: a close variance already approved by a manager is not counted again', () => {
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 5000, actualCash: 4400, closeVarianceApproved: true });
      const d = evaluateHandoverVariance([w], plan([row('a', 4400, 4300)]), { mode: 'CUMULATIVE' });
      expect(d).toMatchObject({ systemVariance: -700, unapprovedVariance: -100, checkedVariance: -100, needsApproval: false });
    });

    it('approval at close is ignored for an OPEN wallet or one with no close count', () => {
      const open = vWallet({ id: 'a', status: OPEN, openingCash: 1000, actualCash: 0, closeVarianceApproved: true });
      expect(evaluateHandoverVariance([open], plan([row('a', 1000, 300)]), { mode: 'CUMULATIVE' }).unapprovedVariance).toBe(-700);
      const noCount = vWallet({ id: 'a', status: CLOSED, openingCash: 1000, actualCash: null, closeVarianceApproved: true });
      expect(evaluateHandoverVariance([noCount], plan([row('a', 1000, 300)]), { mode: 'CUMULATIVE' }).unapprovedVariance).toBe(-700);
    });

    it('sums system variance over several wallets using the movement-based expected balance', () => {
      const a = vWallet({ id: 'a', openingCash: 1000, movements: [mv('OPENING', 1000), mv('SALE', 0.1), mv('REFUND', 50)] });
      const b = vWallet({ id: 'b', openingCash: 0, movements: [mv('SALE', 0.2), mv('EXPENSE', 0.1)] });
      // expected: a = 950.1, b = 0.1
      const d = evaluateHandoverVariance([a, b], plan([row('a', 950.1, 950.1), row('b', 0.1, 0.1)]));
      expect(d.systemVariance).toBe(0);
      expect(d.reasonRequired).toBe(false);
    });

    it('throws when a wallet is missing from the plan', () => {
      expect(() => evaluateHandoverVariance([vWallet({ id: 'x' })], plan([row('a', 0, 0)]))).toThrow('Wallet x is not in the handover plan');
    });
  });

  describe('handoverVarianceError', () => {
    const base = { handoverVariance: 0, systemVariance: 0, unapprovedVariance: 0, checkedVariance: 0, needsApproval: false, reasonRequired: false, threshold: 500 };

    it('passes when nothing is required', () => {
      expect(handoverVarianceError(base, { performedById: 'c1' })).toBeNull();
    });

    it('requires a non-blank reason', () => {
      const d = { ...base, handoverVariance: -20, checkedVariance: -20, reasonRequired: true };
      const msg = 'Counted cash differs by LKR -20.00. Enter a reason for the difference.';
      expect(handoverVarianceError(d, { performedById: 'c1' })).toBe(msg);
      expect(handoverVarianceError(d, { performedById: 'c1', reason: null })).toBe(msg);
      expect(handoverVarianceError(d, { performedById: 'c1', reason: '   ' })).toBe(msg);
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'Gave wrong change' })).toBeNull();
    });

    it('above the threshold requires a manager who is not the performing cashier', () => {
      const d = { ...base, handoverVariance: -600, checkedVariance: -600, reasonRequired: true, needsApproval: true };
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'short' }))
        .toBe('Counted cash differs by LKR -600.00 (above LKR 500). A manager must approve this handover with their PIN.');
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'short', authorizerId: '' })).toMatch(/manager must approve/);
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'short', authorizerId: 'c1' }))
        .toBe('The manager approving a handover difference cannot be the cashier performing it.');
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'short', authorizerId: 'm1' })).toBeNull();
    });

    it('checks the reason before the approver', () => {
      const d = { ...base, checkedVariance: -600, reasonRequired: true, needsApproval: true };
      expect(handoverVarianceError(d, { performedById: 'c1', authorizerId: 'm1' })).toMatch(/Enter a reason/);
    });

    it('end to end with evaluateHandoverVariance', () => {
      const w = vWallet({ id: 'a', openingCash: 2000 });
      const d = evaluateHandoverVariance([w], plan([row('a', 2000, 1400)]));
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'missing note', authorizerId: 'm1' })).toBeNull();
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'missing note' })).toMatch(/LKR -600.00 \(above LKR 500\)/);
    });

    // Fixed: in CUMULATIVE mode the message used to quote checkedVariance (0.00 here) although the HANDOVER
    // difference triggered the reason (close over +100 unapproved, handover short -100).
    it('CUMULATIVE: quotes the handover difference when that is what requires the reason', () => {
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 1000, actualCash: 1100 });
      const d = evaluateHandoverVariance([w], plan([row('a', 1100, 1000)]), { mode: 'CUMULATIVE' });
      expect(d).toMatchObject({ handoverVariance: -100, checkedVariance: 0, reasonRequired: true });
      expect(handoverVarianceError(d, { performedById: 'c1' })).toBe('Counted cash differs by LKR -100.00. Enter a reason for the difference.');
    });

    it('CUMULATIVE: quotes the unapproved close + handover difference when that is what requires the reason', () => {
      // System 5000, closed at 4600 (unapproved), incoming counts exactly 4600: handover 0, cumulative -400.
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 5000, actualCash: 4600 });
      const d = evaluateHandoverVariance([w], plan([row('a', 4600, 4600)]), { mode: 'CUMULATIVE' });
      expect(d).toMatchObject({ handoverVariance: 0, checkedVariance: -400, reasonRequired: true, needsApproval: false });
      expect(handoverVarianceError(d, { performedById: 'c1' })).toBe('Counted cash differs by LKR -400.00. Enter a reason for the difference.');
    });

    it('CUMULATIVE: with a custom reasonAbove, quotes the figure above the bar (handover), not the one below it', () => {
      // Close over +80 unapproved, handover short -100: checked -20 (below 50), handover -100 (above 50).
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 1000, actualCash: 1080 });
      const d = evaluateHandoverVariance([w], plan([row('a', 1080, 980)]), { mode: 'CUMULATIVE', reasonAbove: 50 });
      expect(d).toMatchObject({ handoverVariance: -100, checkedVariance: -20, reasonRequired: true });
      expect(handoverVarianceError(d, { performedById: 'c1' })).toBe('Counted cash differs by LKR -100.00. Enter a reason for the difference.');
    });

    it('the approval message still quotes checkedVariance (the figure compared with the threshold)', () => {
      const w = vWallet({ id: 'a', status: CLOSED, openingCash: 5000, actualCash: 4600 });
      const d = evaluateHandoverVariance([w], plan([row('a', 4600, 4200)]), { mode: 'CUMULATIVE' });
      expect(handoverVarianceError(d, { performedById: 'c1', reason: 'short' }))
        .toBe('Counted cash differs by LKR -800.00 (above LKR 500). A manager must approve this handover with their PIN.');
    });
  });

  describe('walletsToCarryOver', () => {
    const w = (id: string, cashierId: string, status: CashRegisterStatus, over: Partial<CounterWalletState> = {}): CounterWalletState => ({
      id, cashierId, status, clearedAt: null, counterId: 'C1', ...over,
    });
    const ids = (r: { carry: CounterWalletState[]; blocked: CounterWalletState[] }) => ({ carry: r.carry.map((x) => x.id), blocked: r.blocked.map((x) => x.id) });

    it('carries other cashiers\' uncleared wallets on the same counter only', () => {
      const wallets = [
        w('other-open', 'c2', OPEN),
        w('other-closed', 'c3', CLOSED),
        w('other-cleared', 'c2', CLOSED, { clearedAt: at(0) }),
        w('other-counter', 'c2', OPEN, { counterId: 'C2' }),
        w('no-counter', 'c2', OPEN, { counterId: null }),
      ];
      expect(ids(walletsToCarryOver(wallets, { counterId: 'C1', incomingCashierId: 'c1', includeOwn: false })))
        .toEqual({ carry: ['other-open', 'other-closed'], blocked: [] });
    });

    it('a pending-approval wallet blocks the handover instead of being carried', () => {
      const wallets = [w('ok', 'c2', CLOSED), w('pending', 'c3', PENDING_APPROVAL)];
      expect(ids(walletsToCarryOver(wallets, { counterId: 'C1', incomingCashierId: 'c1', includeOwn: false })))
        .toEqual({ carry: ['ok'], blocked: ['pending'] });
    });

    it('includeOwn=false leaves the incoming cashier\'s own closed wallet behind (current behaviour)', () => {
      const wallets = [w('own-closed', 'c1', CLOSED), w('other', 'c2', CLOSED)];
      expect(ids(walletsToCarryOver(wallets, { counterId: 'C1', incomingCashierId: 'c1', includeOwn: false })))
        .toEqual({ carry: ['other'], blocked: [] });
    });

    it('includeOwn=true carries the own closed wallet too, but never the own OPEN wallet', () => {
      const wallets = [w('own-closed', 'c1', CLOSED), w('own-open', 'c1', OPEN), w('own-pending', 'c1', PENDING_APPROVAL), w('other', 'c2', OPEN)];
      expect(ids(walletsToCarryOver(wallets, { counterId: 'C1', incomingCashierId: 'c1', includeOwn: true })))
        .toEqual({ carry: ['own-closed', 'other'], blocked: ['own-pending'] });
    });

    it('returns empty lists for an empty counter', () => {
      expect(walletsToCarryOver([], { counterId: 'C1', incomingCashierId: 'c1', includeOwn: true })).toEqual({ carry: [], blocked: [] });
    });
  });

  describe('closeShiftBlocker', () => {
    it('allows closing only an OPEN, uncleared shift', () => {
      expect(closeShiftBlocker({ status: OPEN, clearedAt: null })).toBeNull();
    });

    it('blocks a shift waiting for variance approval (pending handover / approval blocks closing)', () => {
      expect(closeShiftBlocker({ status: PENDING_APPROVAL, clearedAt: null })).toBe('This shift is waiting for manager approval of its variance');
    });

    it('blocks an already closed shift', () => {
      expect(closeShiftBlocker({ status: CLOSED, clearedAt: null })).toBe('Shift already closed');
    });

    it('blocks a shift already handed over / cleared, whatever its status (cleared wins)', () => {
      for (const status of [OPEN, CLOSED, PENDING_APPROVAL]) {
        expect(closeShiftBlocker({ status, clearedAt: at(0) })).toBe('This shift was already handed over or cleared; it cannot be closed again');
      }
    });
  });

  describe('handoverReplayDecision', () => {
    const existing = { registerId: 'new-reg', openingTime: at(0), handoverFromRegisterIds: ['a', 'b'], countedCash: 1500 };
    const now = new Date(at(0).getTime() + 30_000);

    it('NEW when the incoming cashier has no open wallet', () => {
      expect(handoverReplayDecision(null, { fromRegisterIds: ['a'], now })).toEqual({ kind: 'NEW' });
    });

    it('REPLAY for the same wallets (any order) and same count within the window', () => {
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['b', 'a'], countedCash: 1500, now })).toEqual({ kind: 'REPLAY', registerId: 'new-reg' });
    });

    it('REPLAY when the retry omits the count, or the count differs only by float dust', () => {
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], now }).kind).toBe('REPLAY');
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], countedCash: null, now }).kind).toBe('REPLAY');
      expect(handoverReplayDecision({ ...existing, countedCash: 0.3 }, { fromRegisterIds: ['a', 'b'], countedCash: 0.1 + 0.2, now }).kind).toBe('REPLAY');
    });

    it('the default window is 2 minutes, inclusive', () => {
      const edge = new Date(at(0).getTime() + 120_000);
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], now: edge }).kind).toBe('REPLAY');
      const late = new Date(at(0).getTime() + 120_001);
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], now: late }).kind).toBe('CONFLICT');
    });

    it('honours a custom window', () => {
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], now, windowMs: 10_000 }).kind).toBe('CONFLICT');
    });

    it('CONFLICT for a different wallet set, a different count, or an existing wallet not opened by handover', () => {
      const conflict = { kind: 'CONFLICT', message: 'You already have an open cash wallet on this counter. Continue with it.' };
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a'], now })).toEqual(conflict);
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b', 'c'], now })).toEqual(conflict);
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'a'], now })).toEqual(conflict);
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], countedCash: 1499.99, now })).toEqual(conflict);
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], countedCash: NaN, now })).toEqual(conflict);
      expect(handoverReplayDecision({ ...existing, handoverFromRegisterIds: [] }, { fromRegisterIds: [], now })).toEqual(conflict);
    });

    it('does not mutate the caller\'s id arrays when comparing', () => {
      const from = ['b', 'a'];
      const ex = { ...existing, handoverFromRegisterIds: ['b', 'a'] };
      handoverReplayDecision(ex, { fromRegisterIds: from, now });
      expect(from).toEqual(['b', 'a']);
      expect(ex.handoverFromRegisterIds).toEqual(['b', 'a']);
    });

    // AMBIGUITY: a request clock earlier than openingTime (negative elapsed) still counts as "recent".
    it('documents current behaviour: a negative elapsed time (clock skew) is treated as within the window', () => {
      const before = new Date(at(0).getTime() - 10 * 60_000);
      expect(handoverReplayDecision(existing, { fromRegisterIds: ['a', 'b'], now: before }).kind).toBe('REPLAY');
    });
  });

  describe('summarizeHandoversForDayEnd', () => {
    const r = (over: Partial<DayEndHandoverRow> & { id: string }): DayEndHandoverRow => ({
      counterId: 'C1', fromRegisterId: 'f', toRegisterId: 't', expectedCash: 1000, countedCash: 1000, variance: 0,
      counted: true, authorizedById: null, notes: null, ...over,
    });
    const clean = { openWallets: 0, pendingApprovalWallets: 0, unclearedWallets: 0 };

    it('empty day with no blockers is complete', () => {
      expect(summarizeHandoversForDayEnd([], clean)).toEqual({
        handoverCount: 0, cashHandedOver: 0, netVariance: 0, shortages: 0, overages: 0, uncounted: 0,
        exceptions: [], blockers: [], dayComplete: true,
      });
    });

    it('totals cash moved and splits shortages / overages; net = shortages + overages', () => {
      const rows = [
        r({ id: '1', countedCash: 900, variance: -100, notes: 'short' }),
        r({ id: '2', countedCash: 1050.5, variance: 50.5, notes: 'over' }),
        r({ id: '3', countedCash: 0.1, variance: 0 }),
        r({ id: '4', countedCash: 0.2, variance: 0 }),
      ];
      const s = summarizeHandoversForDayEnd(rows, clean);
      expect(s).toMatchObject({ handoverCount: 4, cashHandedOver: 1950.8, shortages: -100, overages: 50.5, netVariance: -49.5, exceptions: [] });
      expect(s.netVariance).toBe(Math.round((s.shortages + s.overages) * 100) / 100);
      expect(s.shortages).toBeLessThanOrEqual(0);
      expect(s.overages).toBeGreaterThanOrEqual(0);
    });

    it('rounds float sums (0.1 + 0.2 overage = 0.3)', () => {
      const s = summarizeHandoversForDayEnd([r({ id: '1', variance: 0.1, notes: 'x' }), r({ id: '2', variance: 0.2, notes: 'y' })], clean);
      expect(s.overages).toBe(0.3);
      expect(s.netVariance).toBe(0.3);
    });

    it('lists exceptions: not counted, unapproved variance above threshold, difference without reason', () => {
      const rows = [
        r({ id: 'uncounted', counted: false }),
        r({ id: 'big', variance: -600, notes: 'short' }),
        r({ id: 'big-approved', variance: -600, notes: 'short', authorizedById: 'm1' }),
        r({ id: 'at-threshold', variance: 500, notes: 'over' }),
        r({ id: 'no-reason', variance: -1 }),
        r({ id: 'blank-reason', variance: 1, notes: '   ' }),
        r({ id: 'dust', variance: 0.004 }),
        r({ id: 'all', counted: false, variance: 700 }),
      ];
      const s = summarizeHandoversForDayEnd(rows, clean);
      expect(s.exceptions).toEqual([
        { id: 'uncounted', reasons: ['NOT_COUNTED'] },
        { id: 'big', reasons: ['UNAPPROVED_VARIANCE'] },
        { id: 'no-reason', reasons: ['NO_REASON'] },
        { id: 'blank-reason', reasons: ['NO_REASON'] },
        { id: 'all', reasons: ['NOT_COUNTED', 'UNAPPROVED_VARIANCE', 'NO_REASON'] },
      ]);
      expect(s.uncounted).toBe(2);
    });

    it('honours a custom threshold', () => {
      const s = summarizeHandoversForDayEnd([r({ id: '1', variance: -60, notes: 'x' })], clean, 50);
      expect(s.exceptions).toEqual([{ id: '1', reasons: ['UNAPPROVED_VARIANCE'] }]);
    });

    it('open, pending-approval and uncleared wallets block day completion', () => {
      const s = summarizeHandoversForDayEnd([], { openWallets: 2, pendingApprovalWallets: 1, unclearedWallets: 3 });
      expect(s.blockers).toEqual([
        '2 shift(s) still open',
        '1 shift(s) waiting for variance approval',
        '3 closed wallet(s) not yet cleared to main cash',
      ]);
      expect(s.dayComplete).toBe(false);
      expect(summarizeHandoversForDayEnd([], { ...clean, pendingApprovalWallets: 1 }).dayComplete).toBe(false);
    });

    it('exceptions alone do not block day completion (only wallet state does)', () => {
      const s = summarizeHandoversForDayEnd([r({ id: '1', counted: false })], clean);
      expect(s.exceptions).toHaveLength(1);
      expect(s.dayComplete).toBe(true);
    });
  });
});
