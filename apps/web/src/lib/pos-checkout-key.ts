/**
 * POS sale and customer payment idempotency keys (clientRequestId).
 *
 * One key per checkout attempt, kept in localStorage next to a signature of what is being
 * charged. Retrying the same cart + payments (double click, timeout, page reload after a lost
 * response) re-sends the same key, so the API returns the original sale instead of a second one.
 * Changing the cart produces a new key. Cleared after a successful sale.
 */

const STORAGE_PREFIX = "fe_pos_checkout_key";

/** Separate slots so a Quick Pay reload never overwrites the pending key of the main cart. */
export type CheckoutKeySlot = "sale" | "reload" | `customer-payment:${string}`;
const storageKey = (slot: CheckoutKeySlot) => `${STORAGE_PREFIX}:${slot}`;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

type StoredKey = { signature: string; key: string; at: number };

export type CheckoutSignatureInput = {
  customerId?: string | null;
  items: Array<{ variantId?: string; productName?: string; quantity: number; unitPrice: number; discount?: number; discountType?: string }>;
  payments: Array<{ method: string; amount: number; reference?: string }>;
  discountAmount?: number;
  couponCode?: string | null;
  loyaltyPointsToRedeem?: number;
  heldBillId?: string;
};

const n3 = (v: number | undefined) => Math.round((v ?? 0) * 1000) / 1000;

export function checkoutSignature(input: CheckoutSignatureInput): string {
  return JSON.stringify({
    c: input.customerId ?? null,
    i: input.items
      .map((i) => [i.variantId || `custom:${i.productName ?? ""}`, n3(i.quantity), n3(i.unitPrice), n3(i.discount), i.discountType ?? "FIXED"].join("|"))
      .sort(),
    p: input.payments.map((p) => [p.method, n3(p.amount), p.reference ?? ""].join("|")).sort(),
    d: n3(input.discountAmount),
    k: input.couponCode?.trim().toUpperCase() || null,
    l: n3(input.loyaltyPointsToRedeem),
    h: input.heldBillId ?? null,
  });
}

function newKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function read(slot: CheckoutKeySlot): StoredKey | null {
  try {
    const raw = localStorage.getItem(storageKey(slot));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredKey;
    if (!parsed?.key || !parsed?.signature || Date.now() - parsed.at > MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Key for this cart: reuses the pending key when the signature matches, else starts a new one. */
export function checkoutRequestKey(signature: string, slot: CheckoutKeySlot = "sale"): string {
  const pending = read(slot);
  if (pending && pending.signature === signature) return pending.key;
  const key = newKey();
  try {
    localStorage.setItem(storageKey(slot), JSON.stringify({ signature, key, at: Date.now() } satisfies StoredKey));
  } catch {
    /* storage full / disabled — key still protects in-memory retries of this request */
  }
  return key;
}

/** Call after the API confirms the sale so the next cart gets a fresh key. */
export function clearCheckoutRequestKey(slot: CheckoutKeySlot = "sale"): void {
  try {
    localStorage.removeItem(storageKey(slot));
  } catch {
    /* ignore */
  }
}
