/**
 * Synchronous in-flight latch for POS checkout (audit P-F11).
 *
 * `checkoutLoading` is React state: it only changes on the next render, so two triggers in the same tick (double click,
 * Enter + F9, gift-voucher button pressed twice) both read `false` and both start a checkout. A ref-held latch flips
 * immediately, so the second trigger is refused no matter how fast it arrives. The server still protects against a
 * duplicate through the sale's clientRequestId; this stops the second request from being sent at all.
 */
export interface CheckoutLatch {
  /** true = this caller now owns the checkout; false = one is already running. */
  tryEnter(): boolean;
  /** Releases the latch (safe to call more than once). */
  leave(): void;
  readonly busy: boolean;
}

export function createCheckoutLatch(): CheckoutLatch {
  let busy = false;
  return {
    tryEnter() {
      if (busy) return false;
      busy = true;
      return true;
    },
    leave() {
      busy = false;
    },
    get busy() {
      return busy;
    },
  };
}
