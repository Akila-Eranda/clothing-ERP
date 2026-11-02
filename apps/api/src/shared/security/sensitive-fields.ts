/**
 * Defence in depth: credential fields must never leave the API, even when a query over-fetches
 * (e.g. `include: { user: true }`). Applied to every HTTP response by ResponseInterceptor.
 */

/** Keys removed at any depth of a response body. */
export const SENSITIVE_RESPONSE_KEYS: ReadonlySet<string> = new Set([
  'passwordHash',
  'twoFactorSecret',
  'posPinHash',
  'refreshTokens',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Returns a copy of `value` without sensitive keys. Only plain objects and arrays are walked;
 * Dates, Buffers, streams, Prisma Decimals and class instances are returned untouched.
 */
export function stripSensitiveFields<T>(value: T, seen: WeakSet<object> = new WeakSet()): T {
  if (Array.isArray(value)) {
    if (seen.has(value)) return value;
    seen.add(value);
    return value.map((v) => stripSensitiveFields(v, seen)) as unknown as T;
  }
  if (!isPlainObject(value)) return value;
  if (seen.has(value)) return value;
  seen.add(value);

  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    if (SENSITIVE_RESPONSE_KEYS.has(key)) continue;
    out[key] = stripSensitiveFields(v, seen);
  }
  return out as T;
}

/** Safe user projection for any relation that exposes users (roles, audit, assignments…). */
export const SAFE_USER_SELECT = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  status: true,
  branchId: true,
} as const;
