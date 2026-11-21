/**
 * Supplier search for the POS Quick GRN supplier picker (pure helpers, unit-tested in supplier-search.test.ts).
 *
 * The screen preloads the first SUPPLIER_PRELOAD_LIMIT suppliers. Typing filters that list instantly; only when the
 * shop has more suppliers than were loaded, and the query has at least SUPPLIER_SERVER_MIN_CHARS non-blank
 * characters, does the picker also ask the server: `GET /suppliers/lookup?search=` (tenant-scoped, suppliers:read),
 * a single read of id / name / phone / code with no purchase-order / invoice loading and no balance recalculation.
 */

export type SupplierOption = {
  id: string;
  name: string;
  phone?: string | null;
  code?: string | null;
};

export const SUPPLIER_PRELOAD_LIMIT = 100;
export const SUPPLIER_SEARCH_LIMIT = 50;
export const SUPPLIER_SEARCH_DEBOUNCE_MS = 300;
/** Server lookup starts at this many non-blank characters (the API refuses shorter queries with an empty list). */
export const SUPPLIER_SERVER_MIN_CHARS = 2;

export function supplierLookupPath(query: string, limit = SUPPLIER_SEARCH_LIMIT): string {
  return `/suppliers/lookup?search=${encodeURIComponent(query.trim())}&limit=${limit}`;
}

/** Initial load / Refresh: first page by name + the shop total, from the lightweight lookup (no balance work). */
export function supplierBrowsePath(limit = SUPPLIER_PRELOAD_LIMIT): string {
  return `/suppliers/lookup?browse=true&limit=${limit}`;
}

/**
 * After a reload, keep the currently selected supplier visible even if it is not in the new first page
 * (e.g. it was found by the server search); otherwise the picker would lose its name while it stays selected.
 */
export function keepSelectedSupplier<T extends SupplierOption>(rows: readonly T[], previous: readonly T[], selectedId: string | null | undefined): T[] {
  if (!selectedId || rows.some((s) => s.id === selectedId)) return [...rows];
  const sel = previous.find((s) => s.id === selectedId);
  return sel ? [...rows, sel] : [...rows];
}
export const SUPPLIER_SEARCH_PLACEHOLDER = "Search supplier name, phone or code...";

/** Lower-cased words of the query (blank → no words). */
export function queryWords(query: string | null | undefined): string[] {
  return String(query ?? "").toLowerCase().trim().split(/\s+/).filter(Boolean);
}

const digitsOnly = (v: string) => v.replace(/\D+/g, "");

/**
 * Case-insensitive partial match. Every word of the query must match the name, phone or code
 * (same "all words" rule as the server search). Phone numbers also match ignoring spaces / dashes.
 */
export function supplierMatches(s: SupplierOption, query: string | null | undefined): boolean {
  const words = queryWords(query);
  if (!words.length) return true;
  const name = (s.name ?? "").toLowerCase();
  const phone = (s.phone ?? "").toLowerCase();
  const code = (s.code ?? "").toLowerCase();
  const phoneDigits = digitsOnly(phone);
  return words.every((w) => {
    if (name.includes(w) || phone.includes(w) || code.includes(w)) return true;
    const d = digitsOnly(w);
    return d.length > 0 && d.length === w.replace(/[\s()+-]/g, "").length && phoneDigits.includes(d);
  });
}

export function filterSuppliers<T extends SupplierOption>(list: readonly T[], query: string | null | undefined): T[] {
  return list.filter((s) => supplierMatches(s, query));
}

/** `primary` first, then rows of `extra` that are not already present (by id). */
export function mergeSuppliers<T extends SupplierOption>(primary: readonly T[], extra: readonly T[]): T[] {
  const seen = new Set(primary.map((s) => s.id));
  const out = [...primary];
  for (const s of extra) {
    if (!seen.has(s.id)) { seen.add(s.id); out.push(s); }
  }
  return out;
}

/** `{ data: [...], meta: { total } }`, optionally wrapped once more in `{ data }`, or a plain array. */
export function parseSupplierPage<T = SupplierOption>(payload: unknown): { rows: T[]; total: number | null } {
  const pick = (v: unknown): { rows: T[]; total: number | null } | null => {
    if (Array.isArray(v)) return { rows: v as T[], total: null };
    if (v && typeof v === "object" && "data" in v) {
      const o = v as { data: unknown; meta?: { total?: unknown } };
      if (Array.isArray(o.data)) {
        const t = o.meta?.total;
        return { rows: o.data as T[], total: typeof t === "number" && Number.isFinite(t) ? t : null };
      }
      return pick(o.data);
    }
    return null;
  };
  return pick(payload) ?? { rows: [], total: null };
}

/**
 * Ask the server only when the preloaded list may be incomplete: the total is known and larger than what was
 * loaded, or (total unknown) the preload came back full.
 */
export function needsServerSearch(
  query: string | null | undefined,
  preload: { loaded: number; total: number | null },
): boolean {
  if (String(query ?? "").replace(/\s+/g, "").length < SUPPLIER_SERVER_MIN_CHARS) return false;
  if (preload.total != null) return preload.total > preload.loaded;
  return preload.loaded >= SUPPLIER_PRELOAD_LIMIT;
}

/** Keyboard movement through `count` options (wraps). -1 = nothing highlighted. */
export function moveActiveIndex(current: number, key: string, count: number): number {
  if (count <= 0) return -1;
  switch (key) {
    case "ArrowDown": return current < 0 || current >= count - 1 ? 0 : current + 1;
    case "ArrowUp": return current <= 0 ? count - 1 : current - 1;
    case "Home": return 0;
    case "End": return count - 1;
    default: return Math.min(Math.max(current, -1), count - 1);
  }
}

/** Secondary line shown under the name: code and phone when present. */
export function supplierDetail(s: SupplierOption): string {
  return [s.code, s.phone].filter((v) => v != null && String(v).trim() !== "").join(" · ");
}
