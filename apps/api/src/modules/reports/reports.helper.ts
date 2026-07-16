/** Pure Phase 11 report helpers — money rounding + cross-check totals. */

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function sumField<T>(rows: T[], pick: (row: T) => number): number {
  return round2(rows.reduce((s, r) => s + (pick(r) || 0), 0));
}

export type TotalsCheck = {
  ok: boolean;
  expected: number;
  actual: number;
  delta: number;
};

/** Row totals must match header/summary within 0.01 (currency rounding). */
export function crossCheckTotals(expected: number, actual: number, tolerance = 0.01): TotalsCheck {
  const e = round2(expected);
  const a = round2(actual);
  const delta = round2(a - e);
  return { ok: Math.abs(delta) <= tolerance, expected: e, actual: a, delta };
}

export function assertTotalsMatch(label: string, expected: number, actual: number, tolerance = 0.01) {
  const check = crossCheckTotals(expected, actual, tolerance);
  if (!check.ok) {
    throw new Error(
      `${label} mismatch: expected ${check.expected}, got ${check.actual} (Δ ${check.delta})`,
    );
  }
  return check;
}

/** Sales: payments across rows should reconcile to sale totals. */
export function crossCheckSalesPayments(
  sales: { total: number; payments?: { amount: number }[] }[],
): TotalsCheck {
  const saleTotal = sumField(sales, (s) => s.total);
  const payTotal = sumField(
    sales.flatMap((s) => s.payments ?? []),
    (p) => p.amount,
  );
  // Partial payments allowed — payments should not exceed sales total
  return {
    ok: payTotal <= saleTotal + 0.01,
    expected: saleTotal,
    actual: payTotal,
    delta: round2(payTotal - saleTotal),
  };
}

/** Cashier/branch rows must sum to overall revenue. */
export function crossCheckGroupedRevenue(
  rows: { totalRevenue: number }[],
  overallRevenue: number,
): TotalsCheck {
  return crossCheckTotals(overallRevenue, sumField(rows, (r) => r.totalRevenue));
}

/** Tax rate breakdown should equal sale tax aggregate. */
export function crossCheckTaxBreakdown(
  byTaxRate: { _sum?: { taxAmount?: number | null }; taxAmount?: number }[],
  summaryTax: number,
): TotalsCheck {
  const breakdown = sumField(byTaxRate, (r) => r._sum?.taxAmount ?? r.taxAmount ?? 0);
  return crossCheckTotals(summaryTax, breakdown);
}

/** Purchase report: PO totals = subtotal - discount + tax (within rounding). */
export function crossCheckPurchaseLine(
  subtotal: number,
  discountAmount: number,
  taxAmount: number,
  total: number,
): TotalsCheck {
  const computed = round2(subtotal - discountAmount + taxAmount);
  return crossCheckTotals(computed, total);
}

export function summarizePurchaseRows(
  rows: { subtotal: number; taxAmount: number; discountAmount: number; total: number; paidAmount: number }[],
) {
  return {
    orderCount: rows.length,
    subtotal: sumField(rows, (r) => r.subtotal),
    taxAmount: sumField(rows, (r) => r.taxAmount),
    discountAmount: sumField(rows, (r) => r.discountAmount),
    total: sumField(rows, (r) => r.total),
    paidAmount: sumField(rows, (r) => r.paidAmount),
    outstanding: sumField(rows, (r) => Math.max(0, r.total - r.paidAmount)),
  };
}

export function summarizeChequeRows(
  rows: { amount: number; status: string; dueDate?: Date | string | null }[],
  now = new Date(),
) {
  const byStatus: Record<string, { count: number; amount: number }> = {};
  let dueSoon = 0;
  let overdue = 0;
  const in7 = new Date(now);
  in7.setDate(in7.getDate() + 7);

  for (const r of rows) {
    const st = r.status || 'UNKNOWN';
    if (!byStatus[st]) byStatus[st] = { count: 0, amount: 0 };
    byStatus[st].count += 1;
    byStatus[st].amount = round2(byStatus[st].amount + r.amount);

    const open = !['CLEARED', 'CANCELLED', 'BOUNCED'].includes(st);
    if (open && r.dueDate) {
      const due = new Date(r.dueDate);
      if (due < now) overdue += r.amount;
      else if (due <= in7) dueSoon += r.amount;
    }
  }

  return {
    count: rows.length,
    totalAmount: sumField(rows, (r) => r.amount),
    byStatus,
    dueSoon: round2(dueSoon),
    overdue: round2(overdue),
  };
}

export function summarizeCommissionRows(
  rows: { salesCount: number; salesTotal: number; commissionTotal: number }[],
) {
  return {
    helpers: rows.length,
    salesCount: rows.reduce((s, r) => s + r.salesCount, 0),
    salesTotal: sumField(rows, (r) => r.salesTotal),
    commissionTotal: sumField(rows, (r) => r.commissionTotal),
  };
}

export function summarizeInventoryRows(
  rows: { quantity: number; reservedQty?: number; avgCost?: number; variant?: { costPrice?: number } }[],
) {
  const onHand = sumField(rows, (r) => r.quantity);
  const reserved = sumField(rows, (r) => r.reservedQty ?? 0);
  const value = sumField(rows, (r) => r.quantity * (r.avgCost ?? r.variant?.costPrice ?? 0));
  return {
    skuCount: rows.length,
    onHandQty: onHand,
    reservedQty: reserved,
    availableQty: round2(Math.max(0, onHand - reserved)),
    stockValue: value,
    lowStock: rows.filter((r) => r.quantity <= 5).length,
    outOfStock: rows.filter((r) => r.quantity <= 0).length,
  };
}

export function summarizeCustomerRows(
  rows: { totalSpent: number; totalOrders: number }[],
) {
  return {
    customers: rows.length,
    totalSpent: sumField(rows, (r) => r.totalSpent),
    totalOrders: rows.reduce((s, r) => s + (r.totalOrders || 0), 0),
  };
}
