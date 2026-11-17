/**
 * Day-end summary for the POS thermal printer (58 mm / 80 mm), same receipt CSS as sale / GRN
 * receipts. Pure function (relative imports only) so it can be tested; printing goes through
 * executeReceiptPrint (store print server, browser fallback), see printDayEndReport.
 */
import { receiptMoney, receiptThemeStyleBlock } from "./receipt-theme";

export type DayEndReport = {
  scope: "SHIFT" | "COUNTER_DAY" | "BRANCH_DAY";
  business: { name: string; phone?: string | null; email?: string | null };
  branch: { name: string; code?: string | null; address?: string | null; phone?: string | null } | null;
  counters: string[];
  cashiers: string[];
  periodFrom: string;
  periodTo: string;
  generatedAt: string;
  generatedBy: string | null;
  reportId?: string;
  preparedBy?: string | null;
  checkedBy?: string | null;
  approvedBy?: string | null;
  totals: {
    shiftCount: number;
    transactionCount: number;
    openingCash: number;
    openingCashierFloat?: number;
    cashSales: number;
    cashRefunds: number;
    handoverIn: number;
    deposits: number;
    withdrawals: number;
    expenses: number;
    transfersIn: number;
    transfersOut: number;
    collections: { cash: number; card: number; qr: number; bankTransfer: number; other: number; others: { method: string; amount: number }[] };
    /** QR fees the bank deducts from the QR collections (the QR line is gross); absent in reports from older servers. */
    qrFees?: number;
    totalCollections: number;
    expectedClosingCash: number;
    actualClosingCash: number | null;
    difference: number | null;
    grossRevenue?: number;
    discounts?: number;
    taxes?: number;
    netRevenue?: number;
    cashReceived?: number;
    changeGiven?: number;
    savedChange?: number;
    itemDiscounts?: number;
    billDiscounts?: number;
    promotionDiscounts?: number;
    couponDiscounts?: number;
    taxableSales?: number;
    taxExemptSales?: number;
    averageBillValue?: number;
  };
  shifts: {
    id: string;
    cashierName: string;
    counterName: string | null;
    status: string;
    openingTime: string;
    closingTime: string | null;
    openingCash: number;
    expectedClosingCash: number;
    actualClosingCash: number | null;
    difference: number | null;
  }[];
  supplierPayments?: { total: number; cash: number; nonCash: number; advances?: number; refunds?: number; byMethod?: { method: string; amount: number }[] };
  voids?: { count: number; amount: number; byReason?: { reason: string; count: number }[] };
  returns?: { count: number; itemCount: number; amount: number; cash: number; nonCash: number };
  netSales?: number;
  pendingApprovals?: { count: number; variance: number };
  savedChangeWallet?: number;
  savedChangeMovements?: number;
  safeDrops?: number;
  qrReconciliation?: { gross: number; fees: number; net: number; unsettled: number; failedOrCancelled: number };
  wallet?: { openingBalance: number; credits: number; redemptions: number; refunds: number; closingBalance: number };
  cashierWallet?: { clearingTotal: number };
  varianceReasons?: { shiftId: string; cashierName: string; reason: string | null; variance: number }[];
  paymentBreakdown?: { registerId: string | null; cashierName: string; counterName: string | null; methods: { method: string; amount: number }[]; transactionCount: number }[];
};

export type DayEndPrintSettings = {
  shopName?: string;
  address1?: string;
  address2?: string;
  phone?: string;
  paperWidth: "58mm" | "80mm" | string;
  fontSize: "small" | "medium" | "large" | string;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function when(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

const METHOD_LABEL: Record<string, string> = {
  CUSTOMER_CREDIT: "Customer credit",
  GIFT_VOUCHER: "Gift voucher",
  LOYALTY_POINTS: "Loyalty points",
  WALLET: "Customer wallet",
  CHEQUE: "Cheque",
  UPI: "UPI",
  MIXED: "Mixed",
};

const row = (label: string, value: string, bold = false) =>
  `<div class="row"><span>${esc(label)}</span><span>${bold ? `<b>${value}</b>` : value}</span></div>`;
const money = (n: number) => esc(receiptMoney(n));
const signed = (n: number) => (n > 0.004 ? "+" : "") + money(n);

export function buildDayEndReceiptHtml(r: DayEndReport, s: DayEndPrintSettings): string {
  const pw = s.paperWidth === "58mm" ? "58mm" : "80mm";
  const t = r.totals;
  const css = receiptThemeStyleBlock({ paperWidth: pw, fontSize: s.fontSize, theme: "light" });
  const shopName = s.shopName?.trim() || r.business.name;
  const branchLine = r.branch ? `${r.branch.name}${r.branch.code ? ` (${r.branch.code})` : ""}` : "";
  const addr = [r.branch?.address || s.address1, s.address2].filter(Boolean).map((a) => `<div class="info">${esc(a!)}</div>`).join("");
  const phone = r.branch?.phone || s.phone || r.business.phone;
  const title = r.scope === "SHIFT" ? "Shift / Day-End Report" : "Day-End Report";

  const optional = (label: string, n: number, sign: "-" | "+" | "" = "") =>
    Math.abs(n) > 0.004 ? row(label, `${sign}${money(n)}`) : "";

  const others = t.collections.others.map((o) => row(METHOD_LABEL[o.method] ?? o.method, money(o.amount))).join("");

  const shiftRows =
    r.shifts.length > 1
      ? `<hr class="d"/><div class="sec">Shifts</div>${r.shifts
          .map(
            (sh) =>
              `<div class="item"><div class="iname">${esc(sh.cashierName)}${sh.counterName ? ` · ${esc(sh.counterName)}` : ""}</div>` +
              `<div class="irow"><span class="q">${esc(when(sh.openingTime))} – ${esc(sh.closingTime ? when(sh.closingTime) : "open")}</span><span class="a">${money(sh.actualClosingCash ?? sh.expectedClosingCash)}</span></div>` +
              (sh.difference !== null && Math.abs(sh.difference) > 0.004
                ? `<div class="disc"><span>Difference</span><span>${signed(sh.difference)}</span></div>`
                : "") +
              `</div>`,
          )
          .join("")}`
      : "";

  const actual = t.actualClosingCash === null ? "not counted" : money(t.actualClosingCash);
  const diff = t.difference === null ? "—" : signed(t.difference);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${esc(title)}</title><style>${css}</style></head><body>
<div class="hdr"><div class="shop">${esc(shopName)}</div>${branchLine ? `<div class="info">${esc(branchLine)}</div>` : ""}${addr}${phone ? `<div class="info">${esc(phone)}</div>` : ""}</div>
<div class="badge">${esc(title)}</div>
<div class="meta">
${r.counters.length ? row(r.counters.length > 1 ? "Counters" : "Counter", esc(r.counters.join(", ")), true) : ""}
${r.cashiers.length ? row(r.cashiers.length > 1 ? "Cashiers" : "Cashier", esc(r.cashiers.join(", ")), true) : ""}
${row("From", esc(when(r.periodFrom)))}
${row("To", esc(when(r.periodTo)))}
${r.reportId ? row("Report ID", esc(r.reportId)) : ""}
${row("Transactions", String(t.transactionCount), true)}
</div>
<hr class="dbl"/>
<div class="sec">Cash drawer</div>
${row("Opening cash", money(t.openingCash))}
${t.openingCashierFloat !== undefined ? row("Opening cashier float", money(t.openingCashierFloat)) : ""}
${t.cashReceived !== undefined ? row("Gross cash received", money(t.cashReceived)) : ""}
${t.handoverIn > 0.004 ? row("  of which handed over", money(t.handoverIn)) : ""}
${row("Cash sales", `+${money(t.cashSales)}`)}
${optional("Cash refunds", t.cashRefunds, "-")}
${t.changeGiven !== undefined ? optional("Change given", t.changeGiven, "-") : ""}
${t.savedChange !== undefined ? optional("Saved change wallet", t.savedChange, "") : ""}
${optional("Cash deposits", t.deposits, "+")}
${optional("Withdrawals", t.withdrawals, "-")}
${optional("Cash expenses", t.expenses, "-")}
${optional("Transfers in", t.transfersIn, "+")}
${optional("Transfers out", t.transfersOut, "-")}
<div class="tot"><span>EXPECTED CASH</span><span>${money(t.expectedClosingCash)}</span></div>
${row("Actual closing cash", actual, true)}
${row("Cash difference", diff, true)}
<hr class="d"/>
<div class="sec">Collections</div>
${row("Cash", money(t.collections.cash))}
${row("Card", money(t.collections.card))}
${row("QR", money(t.collections.qr))}
${row("Bank transfer", money(t.collections.bankTransfer))}
${others || row("Other methods", money(t.collections.other))}
<div class="tot"><span>TOTAL</span><span>${money(t.totalCollections)}</span></div>
${t.qrFees && t.qrFees > 0.004 ? row("QR fees deducted by bank", money(t.qrFees)) + row("QR net to bank", money(t.collections.qr - t.qrFees)) : ""}
${t.grossRevenue !== undefined ? `<hr class="d"/><div class="sec">Revenue</div>${row("Gross revenue", money(t.grossRevenue))}${row("Item discounts", money(t.itemDiscounts ?? 0))}${row("Bill discounts", money(t.billDiscounts ?? 0))}${row("Promotion discounts", money(t.promotionDiscounts ?? 0))}${row("Coupon discounts", money(t.couponDiscounts ?? 0))}${row("Discounts", money(t.discounts ?? 0))}${row("Taxable sales", money(t.taxableSales ?? 0))}${row("Tax-exempt sales", money(t.taxExemptSales ?? 0))}${row("Taxes", money(t.taxes ?? 0))}${row("Average bill", money(t.averageBillValue ?? 0))}${row("Net revenue", money(t.netRevenue ?? 0))}` : ""}
${r.returns ? row("Returns / refunds", `${r.returns.count} (${money(r.returns.amount)})`) + row("Net sales", money(r.netSales ?? 0)) : ""}
${r.supplierPayments ? `<hr class="d"/><div class="sec">Supplier payments</div>${row("Total", money(r.supplierPayments.total))}${row("Cash", money(r.supplierPayments.cash))}${row("Non-cash", money(r.supplierPayments.nonCash))}${row("Advances", money(r.supplierPayments.advances ?? 0))}${row("Supplier refunds", money(r.supplierPayments.refunds ?? 0))}` : ""}
${r.voids ? `<hr class="d"/><div class="sec">Voids</div>${row("Voided bills", String(r.voids.count))}${row("Voided amount", money(r.voids.amount))}` : ""}
${r.pendingApprovals ? row("Pending approvals", `${r.pendingApprovals.count} (${money(r.pendingApprovals.variance)})`) : ""}
${r.safeDrops !== undefined ? row("Safe drops", money(r.safeDrops)) : ""}
${r.wallet ? `<hr class="d"/><div class="sec">Wallet</div>${row("Opening", money(r.wallet.openingBalance))}${row("Credits", money(r.wallet.credits))}${row("Redemptions", money(r.wallet.redemptions))}${row("Refunds", money(r.wallet.refunds))}${row("Closing", money(r.wallet.closingBalance))}` : ""}
${r.cashierWallet ? row("Cashier wallet clearings", money(r.cashierWallet.clearingTotal)) : ""}
${r.qrReconciliation ? `<hr class="d"/><div class="sec">QR reconciliation</div>${row("QR gross", money(r.qrReconciliation.gross))}${row("QR fees", money(r.qrReconciliation.fees))}${row("QR net bank", money(r.qrReconciliation.net))}${row("Unsettled", String(r.qrReconciliation.unsettled))}${row("Failed/cancelled", String(r.qrReconciliation.failedOrCancelled))}` : ""}
${shiftRows}
<hr class="d"/>
<div class="foot">Printed ${esc(when(r.generatedAt))}${r.generatedBy ? ` by ${esc(r.generatedBy)}` : ""}</div>
<div class="foot">Cashier signature: ____________</div>
<div class="foot">Manager signature: ____________</div>
</body></html>`;
}
