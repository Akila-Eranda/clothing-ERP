/**
 * Card payments keep only the last four digits of the card (never the full number or CVV).
 * Same rule as the API (apps/api/src/shared/card-payment.helper.ts).
 */
export function isValidCardLast4(value: string | null | undefined): boolean {
  return /^\d{4}$/.test((value ?? "").trim());
}

/** Keeps digits only, at most four, for the input field. */
export function sanitizeCardLast4Input(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

/** "**** 1234" for receipts, history and reports; "" when there is nothing valid to show. */
export function maskCardLast4(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return /^\d{3,4}$/.test(v) ? `**** ${v}` : "";
}

/**
 * Reference shown for a sale payment in history / reports:
 * card → "Card **** 1234", QR → "<QR label> · <bank>", bank transfer → "<bank>" (+ reference), else the reference.
 */
export function paymentReferenceText(p: {
  method: string;
  reference?: string | null;
  cardLast4?: string | null;
  bankAccount?: { name: string; bankName?: string | null } | null;
  qrCode?: { label: string } | null;
}): string {
  if (p.method === "CARD") {
    const masked = maskCardLast4(p.cardLast4 ?? p.reference);
    return masked ? `Card ${masked}` : "—";
  }
  const bank = p.bankAccount ? [p.bankAccount.name, p.bankAccount.bankName].filter(Boolean).join(" · ") : "";
  if (p.method === "QR") return [p.qrCode?.label, bank, p.reference].filter(Boolean).join(" · ") || "—";
  if (p.method === "BANK_TRANSFER") return [bank, p.reference].filter(Boolean).join(" · ") || "—";
  return p.reference || "—";
}

/** Payment label on a printed receipt: "CARD **** 1234" for cards, otherwise the method. */
export function receiptPaymentLabel(p: { method: string; cardLast4?: string | null; reference?: string | null }): string {
  if (p.method !== "CARD") return p.method;
  const masked = maskCardLast4(p.cardLast4 ?? p.reference);
  return masked ? `CARD ${masked}` : "CARD";
}
