/**
 * Manager PIN approval for POS cash operations.
 *
 * Some cash actions (refunds above the limit, cash out above the limit, safe / drawer transfers, handover
 * differences, expenses above a cashier's cap) are refused by the API with
 * `error: "MANAGER_APPROVAL_REQUIRED"`. `withManagerApproval` then asks a manager for THEIR OWN PIN
 * (dialog: ManagerApprovalHost), gets a 5-minute approval token from POST /cash/manager-approval and
 * retries the action ONCE with `x-cash-approval-token`.
 *
 * - The token lives only in a local variable for that one retry: never in localStorage / sessionStorage /
 *   cookies / stores / logs, and it is dropped right after (each approved action needs its own PIN).
 * - The terminal's login is never treated as an approval: the dialog is always shown, even when a
 *   manager is the logged-in user.
 * - A token refused on retry (expired / invalid / manager no longer active) asks for the PIN again.
 *
 * Kept free of app imports so it can be unit tested with `node --test`.
 */

export const MANAGER_APPROVAL_REQUIRED = "MANAGER_APPROVAL_REQUIRED";
export const APPROVAL_HEADER = "x-cash-approval-token";

export type ManagerApproval = { token: string; managerName: string; expiresAt: number };

export type ApprovalRequest = {
  /** What is being approved, e.g. "Refund LKR 12,500" */
  action: string;
  /** Why the API asked (the refusal message) or why the last approval failed. */
  message: string;
};

type Host = (req: ApprovalRequest) => Promise<ManagerApproval | null>;

let host: Host | null = null;

/** Registered by the mounted dialog; returns an unregister function. */
export function registerManagerApprovalHost(h: Host): () => void {
  host = h;
  return () => {
    if (host === h) host = null;
  };
}

/** The API asked for a manager approval (403 + MANAGER_APPROVAL_REQUIRED). */
export function isManagerApprovalRequired(err: unknown): boolean {
  const e = err as { status?: number; code?: string } | null;
  return !!e && e.status === 403 && e.code === MANAGER_APPROVAL_REQUIRED;
}

/** Thrown when the manager approval dialog was cancelled; callers usually just stop. */
export class ManagerApprovalCancelled extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManagerApprovalCancelled";
  }
}

export const APPROVAL_NOT_ACCEPTED =
  "The manager approval was not accepted or has expired. Ask the manager to enter their PIN again.";

/** Seconds of validity a token must still have to be used (clock skew + request time). */
const MIN_VALID_MS = 10_000;

/**
 * Runs `run()` once. If the API asks for a manager approval, shows the PIN dialog and runs it again with
 * the approval header. Any other error is rethrown unchanged.
 */
export async function withManagerApproval<T>(
  action: string,
  run: (headers?: Record<string, string>) => Promise<T>,
  now: () => number = Date.now,
): Promise<T> {
  try {
    return await run();
  } catch (first) {
    if (!isManagerApprovalRequired(first) || !host) throw first;
    let message = (first as Error).message;
    for (let round = 0; round < 5; round++) {
      const approval = await host({ action, message });
      if (!approval) throw new ManagerApprovalCancelled(message);
      if (approval.expiresAt - now() < MIN_VALID_MS) {
        message = APPROVAL_NOT_ACCEPTED;
        continue;
      }
      try {
        return await run({ [APPROVAL_HEADER]: approval.token });
      } catch (again) {
        if (!isManagerApprovalRequired(again)) throw again;
        message = APPROVAL_NOT_ACCEPTED;
      }
    }
    throw new ManagerApprovalCancelled(message);
  }
}

/** Error text for a failed PIN entry (the API never says whether a manager account exists). */
export function approvalErrorText(err: unknown): string {
  const e = err as { status?: number; code?: string; message?: string } | null;
  if (e?.status === 429 || e?.code === "PIN_LOCKED") return e?.message || "Too many wrong PINs. Manager approval is locked for 15 minutes.";
  if (e?.status === 403 || e?.code === "PIN_REJECTED") return "PIN not accepted. Only a manager of this branch can approve.";
  if (e?.status === 400) return "Enter the manager's 4-digit PIN.";
  return e?.message || "Could not check the PIN. Try again.";
}

/** A 4-digit POS PIN (as the API requires). */
export function sanitizePinInput(v: string): string {
  return (v || "").replace(/\D/g, "").slice(0, 4);
}
