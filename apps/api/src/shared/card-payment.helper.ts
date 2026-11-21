/**
 * Card payments keep ONLY the last four digits of the card. Full card numbers and CVV are never
 * accepted or stored (PCI DSS: the POS is not a card-data environment; the terminal handles the card).
 */
export const CARD_LAST4_REQUIRED_MESSAGE = 'Card payments need the last 4 digits of the card (exactly 4 numbers)';

/**
 * Returns the four digits, or null when the value is not exactly four digits.
 * Surrounding spaces are ignored. Anything else is rejected, including longer numbers
 * (so a full card number typed by mistake is refused, never trimmed and kept).
 */
export function parseCardLast4(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const value = String(raw).trim();
  return /^\d{4}$/.test(value) ? value : null;
}

/** Masked form for receipts, history and reports. */
export function maskCardLast4(last4: string | null | undefined): string {
  return last4 && /^\d{3,4}$/.test(last4) ? `**** ${last4}` : '';
}
