/** Pure calendar helpers — day keys & badge accuracy. */

export function toDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): { start: Date; end: Date } {
  const [y, m, d] = key.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Invalid date key: ${key}`);
  const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
  return { start, end };
}

export function monthRange(year: number, month1to12: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(year, month1to12 - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month1to12, 0, 23, 59, 59, 999));
  return { start, end };
}

export type DayBadgeCounts = {
  sales: number;
  expenses: number;
  chequesDue: number;
  customerDue: number;
  supplierDue: number;
  notes: number;
  tasks: number;
  meetings: number;
};

export function sumBadgeTotal(b: DayBadgeCounts): number {
  return (
    (b.sales > 0 ? 1 : 0)
    + (b.expenses > 0 ? 1 : 0)
    + b.chequesDue
    + b.customerDue
    + b.supplierDue
    + b.notes
    + b.tasks
    + b.meetings
  );
}

export function emptyBadges(): DayBadgeCounts {
  return {
    sales: 0,
    expenses: 0,
    chequesDue: 0,
    customerDue: 0,
    supplierDue: 0,
    notes: 0,
    tasks: 0,
    meetings: 0,
  };
}

/** Merge event dates into badge map for month dots. */
export function bumpBadge(
  map: Record<string, DayBadgeCounts>,
  dateKey: string,
  field: keyof DayBadgeCounts,
  by = 1,
): void {
  if (!map[dateKey]) map[dateKey] = emptyBadges();
  map[dateKey][field] += by;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
