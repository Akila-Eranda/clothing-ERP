import * as fs from 'fs';
import * as path from 'path';

/**
 * Reconnect policy for the WhatsApp (Baileys) session. Pure functions, unit-tested.
 *
 * QA-004: a timeout / network drop must never delete the saved login. Only an explicit logout from the phone
 * (DisconnectReason.loggedOut) invalidates the credentials; everything else keeps them and just reconnects.
 */

export const MAX_AUTO_RECONNECT = 8;

/** Whether the saved login must be wiped before reconnecting. Always false for transient failures. */
export function shouldResetAuth(_reason: { timedOut: boolean }): boolean {
  return false;
}

/**
 * Exponential back-off WITH JITTER: the ceiling doubles 3 s, 6 s, 12 s ... (timeouts start at 5 s) up to 60 s, and the
 * actual wait is a random point between half the ceiling and the ceiling. Jitter stops many tenants (or several API
 * instances after a deploy) reconnecting at the same instant. `random` is injectable for tests.
 */
export function reconnectDelayMs(attempt: number, timedOut = false, random: () => number = Math.random): number {
  const base = timedOut ? 5_000 : 3_000;
  const n = Math.max(0, Math.floor(attempt));
  const ceiling = Math.min(60_000, base * 2 ** n);
  const r = Math.min(1, Math.max(0, random()));
  return Math.round(ceiling / 2 + (ceiling / 2) * r);
}

/** The un-jittered ceiling (what a given attempt can wait at most). */
export function reconnectCeilingMs(attempt: number, timedOut = false): number {
  return reconnectDelayMs(attempt, timedOut, () => 1);
}

/** True when the folder holds a PAIRED Baileys login (creds.json with `me`), not a leftover unpaired QR state. */
export function hasPairedCreds(dir: string): boolean {
  try {
    const raw = fs.readFileSync(path.join(dir, 'creds.json'), 'utf8');
    const creds = JSON.parse(raw) as { me?: { id?: string } | null };
    return !!creds?.me?.id;
  } catch {
    return false;
  }
}

/** Tenant ids that have a paired saved login under the auth root (folder name = tenant id). */
export function listResumableTenants(authRoot: string): string[] {
  try {
    return fs
      .readdirSync(authRoot, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && hasPairedCreds(path.join(authRoot, e.name)))
      .map((e) => e.name)
      .sort();
  } catch {
    return [];
  }
}
