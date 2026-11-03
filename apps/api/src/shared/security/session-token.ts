import { createHash } from 'crypto';

/**
 * sessions.token stores a SHA-256 digest of the access token, never the bearer token itself:
 * a database read (or an over-fetching query) must not yield a token that can be replayed.
 * Lookups (logout) hash the presented token the same way.
 */
export function hashSessionToken(accessToken: string): string {
  return createHash('sha256').update(accessToken, 'utf8').digest('hex');
}

/** Session fields safe to return to clients (no token, not even its digest). */
export const SAFE_SESSION_SELECT = {
  id: true,
  ipAddress: true,
  userAgent: true,
  deviceName: true,
  isActive: true,
  expiresAt: true,
  lastUsedAt: true,
  createdAt: true,
} as const;
