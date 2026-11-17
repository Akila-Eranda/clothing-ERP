/**
 * Guard for the "Next Sale" action on the Payment Complete screen.
 * Click, double click and F9 all funnel into one handler; this latch makes sure a
 * given completed sale is acknowledged exactly once. It re-arms for a new sale key.
 */
export interface NextSaleGuard {
  /** Returns true only for the first call per completed sale key. */
  tryAcknowledge(saleKey: string | null | undefined): boolean;
  /** Re-arm explicitly. */
  reset(): void;
}

export function createNextSaleGuard(): NextSaleGuard {
  let acknowledged: string | null = null;
  return {
    tryAcknowledge(saleKey) {
      if (!saleKey) return false;
      if (acknowledged === saleKey) return false;
      acknowledged = saleKey;
      return true;
    },
    reset() {
      acknowledged = null;
    },
  };
}
