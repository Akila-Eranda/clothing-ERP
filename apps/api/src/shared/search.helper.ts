/**
 * One text-search builder for every list endpoint (F-17, search audit 6 Nov 2026).
 *
 * - trims and collapses whitespace ("  zebra  " finds "Zebra"), caps the length;
 * - escapes LIKE wildcards: Prisma `contains` passes `%` and `_` straight into LIKE, so a search
 *   for "%" or "_" used to return every record;
 * - case-insensitive on every field;
 * - multi-word: every word must match at least one field ("zelda zebrafield" matches first + last name).
 *
 * Usage: `where = { tenantId, ...textSearch(query.search, ['name', 'sku', 'customer.phone']) }`.
 * Tenant scoping stays in the caller's `where`; this only adds an `AND` of word conditions.
 */
export const MAX_SEARCH_LENGTH = 100;
export const MAX_SEARCH_WORDS = 6;

export type ContainsFilter = { contains: string; mode: 'insensitive' };
/** A dotted path ("customer.phone") or a builder for list relations / special fields. */
export type SearchField = string | ((filter: ContainsFilter, word: string) => Record<string, unknown>);

export function normalizeSearch(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim().slice(0, MAX_SEARCH_LENGTH);
}

/** Escape LIKE metacharacters so they match literally (PostgreSQL default escape is backslash). */
export function escapeLike(word: string): string {
  return word.replace(/[\\%_]/g, (c) => `\\${c}`);
}

function nest(path: string, leaf: unknown): Record<string, unknown> {
  return path.split('.').reduceRight<unknown>((acc, key) => ({ [key]: acc }), leaf) as Record<string, unknown>;
}

export function searchWords(raw: unknown): string[] {
  const q = normalizeSearch(raw);
  return q ? q.split(' ').slice(0, MAX_SEARCH_WORDS) : [];
}

export function textSearch(raw: unknown, fields: SearchField[]): { AND?: Record<string, unknown>[] } {
  const words = searchWords(raw);
  if (!words.length || !fields.length) return {};
  return {
    AND: words.map((word) => {
      const filter: ContainsFilter = { contains: escapeLike(word), mode: 'insensitive' };
      return { OR: fields.map((f) => (typeof f === 'function' ? f(filter, word) : nest(f, filter))) };
    }),
  };
}
