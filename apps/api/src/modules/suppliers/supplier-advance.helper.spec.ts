import { advanceRequestFingerprint, decideAdvanceReplay, AdvanceRuleError, planAdvanceApplication, splitPaymentForAdvance } from './supplier-advance.helper';
import type { SupplierApLine } from './supplier-ap.helper';

const d = (iso: string) => new Date(iso);
const lines: SupplierApLine[] = [
  { id: 'inv1', source: 'INVOICE', docNumber: 'AUTO-GRN-1', amount: 300, dueDate: d('2026-11-01'), asOfDate: d('2026-11-12') },
  { id: 'po1', source: 'PO', docNumber: 'PO-1', amount: 1000, dueDate: d('2026-11-03'), asOfDate: d('2026-11-12') },
  { id: 'po2', source: 'PO', docNumber: 'PO-2', amount: 500, dueDate: d('2026-11-09'), asOfDate: d('2026-11-12') },
];

describe('payment vs advance split', () => {
  it('exact and partial payments create no advance', () => {
    expect(splitPaymentForAdvance(1000, 1000, false)).toEqual({ applied: 1000, advance: 0 });
    expect(splitPaymentForAdvance(400, 1000, true)).toEqual({ applied: 400, advance: 0 });
    expect(splitPaymentForAdvance(1000.005, 1000, false).advance).toBe(0); // cent tolerance
  });
  it('overpayment keeps the excess only when asked', () => {
    expect(splitPaymentForAdvance(1500, 1000, true)).toEqual({ applied: 1000, advance: 500 });
    expect(splitPaymentForAdvance(250.5, 0, true)).toEqual({ applied: 0, advance: 250.5 }); // nothing payable: all advance
    expect(() => splitPaymentForAdvance(1500, 1000, false)).toThrow(/exceeds outstanding/);
  });
  it('refuses zero / negative / NaN payments', () => {
    for (const bad of [0, -5, Number.NaN]) expect(() => splitPaymentForAdvance(bad, 100, true)).toThrow(AdvanceRuleError);
  });
  it('applied + advance always equals the amount paid', () => {
    for (const [pay, due] of [[1234.56, 1000.1], [0.01, 5], [99999.99, 0]] as const) {
      const r = splitPaymentForAdvance(pay, due, true);
      expect(Math.round((r.applied + r.advance) * 100) / 100).toBe(pay);
    }
  });
});

describe('applying an advance', () => {
  it('spreads a total over bills oldest first (invoices, then POs by due date), partially', () => {
    const plan = planAdvanceApplication(lines, { amount: 1000 }, 2000);
    expect(plan.allocations).toEqual([
      { lineId: 'inv1', source: 'INVOICE', applied: 300 },
      { lineId: 'po1', source: 'PO', applied: 700 },
    ]);
    expect(plan.total).toBe(1000);
  });
  it('explicit allocations: several bills, partial amounts', () => {
    const plan = planAdvanceApplication(lines, { allocations: [{ purchaseId: 'po1', amount: 250.25 }, { invoiceId: 'inv1', amount: 100 }, { purchaseId: 'po2', amount: 500 }] }, 1000);
    expect(plan.total).toBe(850.25);
    expect(plan.allocations.map((a) => a.lineId)).toEqual(['po1', 'inv1', 'po2']);
  });
  it('can be limited to selected POs', () => {
    const plan = planAdvanceApplication(lines, { amount: 400, purchaseIds: ['po2'] }, 5000);
    expect(plan.allocations).toEqual([{ lineId: 'po2', source: 'PO', applied: 400 }]);
    expect(() => planAdvanceApplication(lines, { amount: 600, purchaseIds: ['po2'] }, 5000)).toThrow(/above the open bills/);
  });
  it('never above the available advance (no negative balance)', () => {
    expect(() => planAdvanceApplication(lines, { amount: 600 }, 500)).toThrow(/Not enough advance: available LKR 500.00, requested LKR 600.00/);
    expect(() => planAdvanceApplication(lines, { allocations: [{ purchaseId: 'po1', amount: 600 }, { purchaseId: 'po2', amount: 450 }] }, 1000)).toThrow(/Not enough advance/);
    expect(() => planAdvanceApplication(lines, { amount: 10 }, 0)).toThrow(/Not enough advance/);
  });
  it('never above what a bill owes, never an unknown or duplicate bill', () => {
    expect(() => planAdvanceApplication(lines, { allocations: [{ purchaseId: 'po2', amount: 600 }] }, 9999)).toThrow(/above what PO-2 still owes/);
    expect(() => planAdvanceApplication(lines, { allocations: [{ purchaseId: 'nope', amount: 1 }] }, 9999)).toThrow(/not open/);
    expect(() => planAdvanceApplication(lines, { allocations: [{ purchaseId: 'po1', amount: 1 }, { purchaseId: 'po1', amount: 2 }] }, 9999)).toThrow(/twice/);
    expect(() => planAdvanceApplication(lines, { amount: 5000 }, 9999)).toThrow(/above the open bills/);
  });
  it('rejects malformed requests', () => {
    expect(() => planAdvanceApplication(lines, {}, 100)).toThrow(/amount of advance/);
    expect(() => planAdvanceApplication(lines, { allocations: [{ purchaseId: 'po1', amount: 0 }] }, 100)).toThrow(/greater than zero/);
    expect(() => planAdvanceApplication(lines, { allocations: [{ purchaseId: 'po1', amount: -5 }] }, 100)).toThrow(/greater than zero/);
    expect(() => planAdvanceApplication(lines, { allocations: [{ amount: 5 }] }, 100)).toThrow(/exactly one/);
    expect(() => planAdvanceApplication(lines, { allocations: [{ purchaseId: 'po1', invoiceId: 'inv1', amount: 5 }] }, 100)).toThrow(/exactly one/);
    expect(() => planAdvanceApplication([], { amount: 5 }, 100)).toThrow(/No open bill/);
  });
});

describe('scenario: GRN 10,000, paid 50,000', () => {
  const bill: SupplierApLine[] = [
    { id: 'po1', source: 'PO', docNumber: 'PO-1', amount: 10000, dueDate: d('2026-11-03'), asOfDate: d('2026-11-12') },
    { id: 'po2', source: 'PO', docNumber: 'PO-2', amount: 30000, dueDate: d('2026-11-09'), asOfDate: d('2026-11-12') },
  ];
  it('keeps 40,000 as advance; applying partially then fully never goes negative', () => {
    const split = splitPaymentForAdvance(50000, 10000, true);
    expect(split).toEqual({ applied: 10000, advance: 40000 });
    let advance = split.advance;
    const first = planAdvanceApplication(bill, { allocations: [{ purchaseId: 'po2', amount: 15000 }] }, advance);
    advance -= first.total;
    expect(advance).toBe(25000);
    const open: SupplierApLine[] = [bill[0], { ...bill[1], amount: 15000 }];
    const second = planAdvanceApplication(open, { amount: 25000 }, advance);
    expect(second.total).toBe(25000);
    advance -= second.total;
    expect(advance).toBe(0);
    expect(() => planAdvanceApplication(open, { amount: 0.5 }, advance)).toThrow(/Not enough advance/);
  });
});

describe('advance request fingerprint / replay', () => {
  const a = { allocations: [{ purchaseId: 'po1', amount: 100 }, { invoiceId: 'inv1', amount: 50.004 }] };
  it('is order-insensitive and stable', () => {
    const b = { allocations: [{ invoiceId: 'inv1', amount: 50 }, { purchaseId: 'po1', amount: 100 }] };
    expect(advanceRequestFingerprint(a)).toBe(advanceRequestFingerprint(b));
    expect(advanceRequestFingerprint({ amount: 10, purchaseIds: ['x', 'y'] })).toBe(advanceRequestFingerprint({ amount: 10, purchaseIds: ['y', 'x', 'x'] }));
  });
  it('changes when amount, bill or mode changes', () => {
    const fp = advanceRequestFingerprint(a);
    expect(advanceRequestFingerprint({ allocations: [{ purchaseId: 'po1', amount: 101 }, { invoiceId: 'inv1', amount: 50 }] })).not.toBe(fp);
    expect(advanceRequestFingerprint({ allocations: [{ purchaseId: 'po2', amount: 100 }, { invoiceId: 'inv1', amount: 50 }] })).not.toBe(fp);
    expect(advanceRequestFingerprint({ amount: 150 })).not.toBe(fp);
  });
  it('replays same / legacy (null) fingerprint, conflicts on a different one', () => {
    const fp = advanceRequestFingerprint(a);
    expect(decideAdvanceReplay(fp, fp)).toBe('REPLAY');
    expect(decideAdvanceReplay(null, fp)).toBe('REPLAY');
    expect(decideAdvanceReplay('other', fp)).toBe('CONFLICT');
  });
});
