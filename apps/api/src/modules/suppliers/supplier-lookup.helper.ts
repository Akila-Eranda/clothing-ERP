import { textSearch } from '@/shared/search.helper';

/**
 * Lightweight supplier lookup for pickers (POS Quick GRN supplier search).
 *
 * Unlike GET /suppliers, the lookup never loads purchase orders, items or invoices and never recalculates or writes
 * supplier.balance: it is ONE read of the suppliers table, scoped to the tenant, returning id / name / phone / code.
 */
export const SUPPLIER_LOOKUP_MIN_CHARS = 2;
export const SUPPLIER_LOOKUP_DEFAULT_LIMIT = 20;
export const SUPPLIER_LOOKUP_MAX_LIMIT = 50;
export const SUPPLIER_LOOKUP_FIELDS = ['name', 'phone', 'code'] as const;

/** At least SUPPLIER_LOOKUP_MIN_CHARS non-whitespace characters. */
export function isSupplierLookupQuery(search: unknown): boolean {
  return typeof search === 'string' && search.replace(/\s+/g, '').length >= SUPPLIER_LOOKUP_MIN_CHARS;
}

export function supplierLookupLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return SUPPLIER_LOOKUP_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), SUPPLIER_LOOKUP_MAX_LIMIT);
}

/** Prisma findMany arguments: tenant-scoped, only the four public fields, no relations. */
export function supplierLookupArgs(tenantId: string, search: string, limit: unknown) {
  return {
    where: { tenantId, ...textSearch(search, [...SUPPLIER_LOOKUP_FIELDS]) },
    select: { id: true, name: true, phone: true, code: true },
    orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
    take: supplierLookupLimit(limit),
  };
}

export type SupplierLookupRow = { id: string; name: string; phone: string | null; code: string | null };

// ── Browse mode: the picker's initial list / Refresh (first N suppliers by name + the shop's total) ──────────
export const SUPPLIER_BROWSE_DEFAULT_LIMIT = 100;
export const SUPPLIER_BROWSE_MAX_LIMIT = 100;

export function supplierBrowseLimit(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(n) || n < 1) return SUPPLIER_BROWSE_DEFAULT_LIMIT;
  return Math.min(Math.floor(n), SUPPLIER_BROWSE_MAX_LIMIT);
}

/** First page by name: tenant-scoped, the same four fields, no relations, no search filter. */
export function supplierBrowseArgs(tenantId: string, limit: unknown) {
  return {
    where: { tenantId },
    select: { id: true, name: true, phone: true, code: true },
    orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
    take: supplierBrowseLimit(limit),
  };
}

/** Same envelope as the paginated lists ({ data, meta.total }) so the picker reads the total the same way. */
export function supplierBrowsePage(rows: SupplierLookupRow[], total: number, limit: number) {
  return { data: rows, meta: { total, limit, page: 1, hasNextPage: total > rows.length } };
}
