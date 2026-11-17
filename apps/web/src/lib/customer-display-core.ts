/**
 * Customer Display rules that need no browser or framework (unit-tested in customer-display-core.test.ts):
 * connection freshness, stale-payment protection, out-of-order messages and the payment-method labels.
 */
import type { CustomerDisplayQrPayment, CustomerDisplayState } from "./pos-customer-display";

/** The cashier window republishes at least this often while the POS page is open (heartbeat). */
export const CUSTOMER_DISPLAY_HEARTBEAT_MS = 5_000;
/** "Live" while the last message is newer than this. */
export const CUSTOMER_DISPLAY_LIVE_MS = 15_000;
/** A checkout / QR older than this (no heartbeat since) is never trusted — e.g. a cached state of a closed POS. */
export const CUSTOMER_DISPLAY_PAYMENT_TTL_MS = 45_000;

export const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  QR: "QR",
  BANK_TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  GIFT_VOUCHER: "Gift voucher",
  LOYALTY_POINTS: "Loyalty points",
  WALLET: "Wallet",
  CUSTOMER_CREDIT: "Credit",
};

export function isDisplayConnected(state: Pick<CustomerDisplayState, "updatedAt"> | null | undefined, now: number): boolean {
  return !!state?.updatedAt && now - state.updatedAt < CUSTOMER_DISPLAY_LIVE_MS;
}

/**
 * A payment screen (checkout, QR, change due) is only shown while the cashier window is demonstrably alive.
 * An old cached checkout (cashier closed the POS mid-payment, or the window was left open overnight) becomes
 * "waiting", so a stale QR or another customer's payment details can never appear.
 */
export function sanitizeDisplayState(state: CustomerDisplayState | null, now: number): CustomerDisplayState | null {
  if (!state) return null;
  const paymentLike = state.phase === "checkout" || !!state.qrPayment || !!state.paymentSessionId;
  if (paymentLike && now - state.updatedAt > CUSTOMER_DISPLAY_PAYMENT_TTL_MS) {
    const { qrPayment: _q, paymentSessionId: _s, ...rest } = state;
    void _q; void _s;
    return { ...rest, phase: "waiting", items: [], itemCount: 0, lastAdded: undefined, paymentMethod: undefined, cashTendered: undefined, changeDue: undefined };
  }
  return state;
}

/** Ignore out-of-order messages (a late older message must not replace a newer one). */
export function shouldAcceptDisplayState(current: Pick<CustomerDisplayState, "updatedAt"> | null | undefined, next: Pick<CustomerDisplayState, "updatedAt"> | null | undefined): boolean {
  if (!next?.updatedAt) return false;
  return !current?.updatedAt || next.updatedAt >= current.updatedAt;
}

/** New id for each opened checkout (never reused). */
export function newPaymentSessionId(): string {
  const c = typeof crypto !== "undefined" ? (crypto as Crypto & { randomUUID?: () => string }) : undefined;
  return c?.randomUUID ? c.randomUUID() : `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// ── QR payment: what the customer sees ──────────────────────────────────────────────────────────────────

export interface QrBankAccountLike {
  id: string;
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
}
export interface QrCodeLike {
  id: string;
  bankAccountId: string;
  label: string;
  mode: "STATIC" | "DYNAMIC";
  merchantName?: string | null;
  imageUrl?: string | null;
  bankAccount?: QrBankAccountLike | null;
}
export interface QrRenderedLike {
  qrCodeId?: string;
  mode: "STATIC" | "DYNAMIC";
  imageUrl: string | null;
  dataUrl: string | null;
  merchantName?: string | null;
  amount: number;
  bankAccount?: QrBankAccountLike | null;
}

/**
 * The Customer Display's QR payment, derived from what the cashier's QR panel shows:
 *  - nothing selected / no amount → null (no QR screen)
 *  - a render failed → "unavailable"
 *  - the QR on hand was rendered for another code or another amount, or is still loading → "updating" (no image, no
 *    bank details: the customer never sees the previous account's QR or details)
 *  - otherwise "ready": the QR image, the exact amount and the details of the bank account behind THIS QR code.
 */
export function buildQrDisplayPayment(input: {
  selected: QrCodeLike | null | undefined;
  rendered: QrRenderedLike | null | undefined;
  rendering: boolean;
  error: string | null | undefined;
  amount: number;
  resolveImage: (url: string) => string;
}): CustomerDisplayQrPayment | null {
  const { selected, rendered, rendering, error, amount } = input;
  if (!selected || !(amount > 0)) return null;
  const base = { qrCodeId: selected.id, bankAccountId: selected.bankAccountId, label: selected.label, mode: selected.mode, amount };
  if (error) return { ...base, status: "unavailable", src: "", message: error };
  const current = !!rendered && rendered.qrCodeId === selected.id && rendered.amount === amount;
  const uploadedStaticSrc = selected.mode === "STATIC" && selected.imageUrl ? input.resolveImage(selected.imageUrl) : "";
  const src = current ? (rendered?.dataUrl ?? (rendered?.imageUrl ? input.resolveImage(rendered.imageUrl) : "")) : uploadedStaticSrc;
  if (!current && !uploadedStaticSrc) {
    return rendered
      ? { ...base, status: "updating", src: "" }
      : { ...base, status: "unavailable", src: "", message: "No QR image is configured for this bank account." };
  }
  if (rendering && !uploadedStaticSrc) return { ...base, status: "updating", src: "" };
  if (!src) return { ...base, status: "unavailable", src: "", message: "No QR image is configured for this bank account." };
  const ba = rendered?.bankAccount ?? selected.bankAccount ?? null;
  const same = !!ba && ba.id === selected.bankAccountId;
  return {
    ...base, status: "ready", src, mode: rendered?.mode ?? selected.mode,
    merchantName: rendered?.merchantName ?? selected.merchantName ?? null,
    bankName: same ? ba?.bankName ?? null : null,
    accountNumber: same ? ba?.accountNumber ?? null : null,
    accountHolderName: same ? ba?.accountHolderName ?? null : null,
    branchName: same ? ba?.branchName ?? null : null,
    branchCode: same ? ba?.branchCode ?? null : null,
  };
}
