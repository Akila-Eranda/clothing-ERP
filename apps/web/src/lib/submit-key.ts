"use client";

import { useMemo, useRef } from "react";

/**
 * Idempotency key for stock-posting submits (Create PO, Create PO + GRN, PO receive, Quick GRN, direct GRN).
 *
 * One key per submit ATTEMPT: a double click, a manager-approval re-send or a retry after a timeout re-sends
 * the same key, so the API returns the first PO / GRN instead of posting stock again. Reset after success and
 * whenever the form is opened for a new document. Format matches the API: 8–64 chars of [A-Za-z0-9_-].
 */
export function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const rnd = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${rnd()}-${rnd()}`;
}

export function useSubmitKey() {
  const ref = useRef<string | null>(null);
  return useMemo(
    () => ({
      /** The key of the current attempt (created on first use). */
      current: (): string => {
        if (!ref.current) ref.current = newClientRequestId();
        return ref.current;
      },
      /** Next submit is a new document. */
      reset: (): void => {
        ref.current = null;
      },
    }),
    [],
  );
}
