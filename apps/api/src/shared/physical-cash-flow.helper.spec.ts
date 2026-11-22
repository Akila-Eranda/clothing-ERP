import { buildPhysicalCashFlow, physicalCashFlowToCsv, PhysicalCashShift, shiftCashFlow } from './physical-cash-flow.helper';

const shift = (over: Partial<PhysicalCashShift> = {}): PhysicalCashShift => ({
  id: 's1', branchId: 'b1', branchName: 'Main', cashierId: 'c1', cashierName: 'Ann',
  openingTime: new Date('2026-11-10T04:00:00.000Z'), closingTime: null, status: 'OPEN', openingCash: 1000, actualCash: null,
  movements: [], ...over,
});

describe('physical cash flow (cash basis)', () => {
  it('Opening + inflows - outflows = Expected closing, with every line separated', () => {
    const f = shiftCashFlow(shift({
      movements: [
        { type: 'SALE', amount: 2000 }, { type: 'DEPOSIT', amount: 500 },
        { type: 'DEPOSIT', amount: 300, reference: 'XFER-1' }, { type: 'WITHDRAWAL', amount: 100 },
        { type: 'WITHDRAWAL', amount: 200, reference: 'XFER-2' }, { type: 'EXPENSE', amount: 50 }, { type: 'REFUND', amount: 25 },
      ],
    }));
    expect(f).toMatchObject({ opening: 1000, cashSales: 2000, deposits: 500, transfersIn: 300, inflowTotal: 2800, expenses: 50, refunds: 25, withdrawals: 100, transfersOut: 200, outflowTotal: 375 });
    expect(f.expectedClosing).toBe(1000 + 2800 - 375);
  });

  it('variance = counted - expected for a closed shift; open shifts have no count', () => {
    const open = shiftCashFlow(shift({ movements: [{ type: 'SALE', amount: 100 }] }));
    expect(open).toMatchObject({ counted: null, variance: null, openShifts: 1 });
    const closed = shiftCashFlow(shift({ status: 'CLOSED', actualCash: 1090, movements: [{ type: 'SALE', amount: 100 }] }));
    expect(closed).toMatchObject({ expectedClosing: 1100, counted: 1090, variance: -10, openShifts: 0 });
  });

  it('card / QR / bank / cheque / wallet are not in the physical cash ledger - only drawer movements are', () => {
    // there is no movement type for them; a report built from movements cannot include them
    const f = shiftCashFlow(shift({ movements: [{ type: 'SALE', amount: 100 }] }));
    expect(f.inflowTotal).toBe(100);
  });

  it('groups by SHOP-timezone day, not the server (UTC) day: 20:00Z on the 10th is already the 11th in Colombo', () => {
    const late = shift({ id: 's2', openingTime: new Date('2026-11-10T20:00:00.000Z'), movements: [{ type: 'SALE', amount: 50 }] });
    const early = shift({ id: 's3', openingTime: new Date('2026-11-10T04:00:00.000Z'), movements: [{ type: 'SALE', amount: 70 }] });
    const colombo = buildPhysicalCashFlow([late, early], 'Asia/Colombo');
    expect(colombo.days.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11']);
    const utc = buildPhysicalCashFlow([late, early], 'UTC');
    expect(utc.days.map((d) => d.date)).toEqual(['2026-11-10']);
    expect(colombo.timezone).toBe('Asia/Colombo');
    expect(buildPhysicalCashFlow([], undefined).timezone).toBe('Asia/Colombo'); // explicit default
  });

  it('rolls up per branch and per cashier and the totals equal the sum of the parts (no cents lost)', () => {
    const a = shift({ id: 'a', cashierId: 'c1', cashierName: 'Ann', movements: [{ type: 'SALE', amount: 0.1 }] });
    const b = shift({ id: 'b', cashierId: 'c2', cashierName: 'Bob', branchId: 'b2', branchName: 'Second', movements: [{ type: 'SALE', amount: 0.2 }] });
    const r = buildPhysicalCashFlow([a, b], 'Asia/Colombo');
    expect(r.byBranch).toHaveLength(2);
    expect(r.byCashier.map((c) => c.cashierName).sort()).toEqual(['Ann', 'Bob']);
    expect(r.totals.cashSales).toBe(0.3); // not 0.30000000000000004
    expect(r.totals.expectedClosing).toBe(2000.3);
    expect(r.reconciles).toBe(true);
  });

  it('CSV export: stable columns, a totals row, and spreadsheet-formula injection neutralised', () => {
    const r = buildPhysicalCashFlow([shift({ cashierName: '=HYPERLINK("http://evil")', movements: [{ type: 'SALE', amount: 10 }] })], 'Asia/Colombo');
    const csv = physicalCashFlowToCsv(r);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('scope,key,name,opening,cashSales,deposits,transfersIn,inflowTotal,expenses,refunds,withdrawals,transfersOut,outflowTotal,expectedClosing,counted,variance,shifts,openShifts');
    expect(lines[lines.length - 1].startsWith('total,')).toBe(true);
    expect(csv).toContain("\"'=HYPERLINK(");
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });
});
