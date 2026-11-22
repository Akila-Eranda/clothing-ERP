/**
 * Short-lived cache of the POS QR code list (GET /payment-qr/pos).
 * QA-002: the cache used to live inside the POS component and was never cleared, so after an admin added / edited /
 * disabled a QR code or bank account the POS kept showing the old list (or "No eligible QR image") for up to a
 * minute. Admin screens now call invalidatePosQrCache() after every change.
 */
export type QrCache<T> = { at: number; codes: T[] } | null;

export function createPosQrCache<T>(ttlMs = 60_000, now: () => number = Date.now) {
  let cache: QrCache<T> = null;
  return {
    get(force = false): T[] | null {
      if (force || !cache) return null;
      return now() - cache.at < ttlMs ? cache.codes : null;
    },
    set(codes: T[]) { cache = { at: now(), codes }; },
    invalidate() { cache = null; },
  };
}

/** The one cache shared by the POS panel and the admin screens (same browser tab). */
export const posQrCache = createPosQrCache<unknown>();
export function invalidatePosQrCache() { posQrCache.invalidate(); }
