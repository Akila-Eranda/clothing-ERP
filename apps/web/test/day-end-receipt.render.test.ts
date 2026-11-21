import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDayEndReceiptHtml, type DayEndReport } from "../src/lib/day-end-receipt";

const report: DayEndReport = {
  scope: "BRANCH_DAY",
  business: { name: "සිංහල වෙළඳසැල" },
  branch: { name: "Main Branch", code: "M01", address: "කොළඹ 01" },
  counters: ["Counter 1", "Counter 2"],
  cashiers: ["Nimal Perera", "සඳුනි Silva"],
  periodFrom: "2026-11-12T00:00:00.000Z",
  periodTo: "2026-11-12T23:59:59.999Z",
  generatedAt: "2026-11-12T23:59:59.999Z",
  generatedBy: "Manager",
  reportId: "DAY-20261112-001",
  totals: {
    shiftCount: 2,
    transactionCount: 42,
    openingCash: 10000,
    openingCashierFloat: 5000,
    cashSales: 75000,
    cashRefunds: 500,
    handoverIn: 10000,
    deposits: 20000,
    withdrawals: 1000,
    expenses: 250,
    transfersIn: 1000,
    transfersOut: 500,
    collections: { cash: 75000, card: 25000, qr: 15000, bankTransfer: 5000, other: 0, others: [] },
    qrFees: 150,
    totalCollections: 125000,
    expectedClosingCash: 64250,
    actualClosingCash: 64250,
    difference: 0,
    grossRevenue: 130000,
    discounts: 5000,
    taxes: 15000,
    netRevenue: 140000,
    cashReceived: 80000,
    changeGiven: 5000,
    savedChange: 250,
    itemDiscounts: 2000,
    billDiscounts: 1000,
    promotionDiscounts: 1500,
    couponDiscounts: 500,
    taxableSales: 120000,
    taxExemptSales: 10000,
    averageBillValue: 3333.33,
  },
  shifts: [
    { id: "s1", cashierName: "Nimal Perera", counterName: "Counter 1", status: "CLOSED", openingTime: "2026-11-12T08:00:00.000Z", closingTime: "2026-11-12T16:00:00.000Z", openingCash: 5000, expectedClosingCash: 40000, actualClosingCash: 40000, difference: 0 },
    { id: "s2", cashierName: "සඳුනි Silva", counterName: "Counter 2", status: "CLOSED", openingTime: "2026-11-12T16:00:00.000Z", closingTime: "2026-11-12T23:59:00.000Z", openingCash: 5000, expectedClosingCash: 24250, actualClosingCash: 24250, difference: 0 },
  ],
  supplierPayments: { total: 10000, cash: 3000, nonCash: 7000, advances: 1000, refunds: 250 },
  voids: { count: 2, amount: 500 },
  returns: { count: 3, itemCount: 4, amount: 1500, cash: 500, nonCash: 1000 },
  netSales: 138500,
  pendingApprovals: { count: 1, variance: 250 },
  savedChangeWallet: 250,
  savedChangeMovements: 250,
  safeDrops: 20000,
  wallet: { openingBalance: 1000, credits: 500, redemptions: 250, refunds: 50, closingBalance: 1300 },
  cashierWallet: { clearingTotal: 60000 },
  qrReconciliation: { gross: 15000, fees: 150, net: 14850, unsettled: 1, failedOrCancelled: 2 },
};

for (const paperWidth of ["58mm", "80mm"] as const) {
  test(`${paperWidth} thermal output keeps Sinhala, totals, and paper width`, () => {
    const html = buildDayEndReceiptHtml(report, { paperWidth, fontSize: "small" });
    assert.match(html, new RegExp(`max-width:${paperWidth}`));
    assert.match(html, /Nirmala UI.*Noto Sans Sinhala/);
    assert.match(html, /සිංහල වෙළඳසැල/);
    assert.match(html, /EXPECTED CASH/);
    assert.match(html, /LKR 64250\.00/);
    assert.doesNotMatch(html, /<script\b/i);
    assert.ok((html.match(/<div class="row">/g) ?? []).length > 25);
  });
}
