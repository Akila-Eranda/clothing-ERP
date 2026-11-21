import { registerDecorator, ValidationOptions } from 'class-validator';

/**
 * Detects a full payment-card number inside free text (references, cheque numbers, notes) so it is never
 * stored by accident. To avoid refusing real bank / transaction references, a digit run counts as a card
 * number only when ALL hold: 13–19 digits (spaces / dashes allowed between them), a card-network prefix
 * (Visa 4, Mastercard 51–55 / 2221–2720, Amex 34 / 37, Discover 6011 / 65, JCB 35, UnionPay 62) and a
 * valid Luhn checksum. A random 16-digit bank reference matches all three only rarely (~1 in 30).
 */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

function hasCardPrefix(d: string): boolean {
  const two = Number(d.slice(0, 2));
  const four = Number(d.slice(0, 4));
  return (
    d.startsWith('4')
    || (two >= 51 && two <= 55)
    || (four >= 2221 && four <= 2720)
    || two === 34 || two === 37
    || d.startsWith('6011') || two === 65
    || two === 35
    || two === 62
  );
}

export function containsCardNumber(value: unknown): boolean {
  if (typeof value !== 'string' || value.length < 13) return false;
  // Digit runs that may contain single spaces / dashes between digits (as cards are usually written).
  const runs = value.match(/\d(?:[ -]?\d)*/g) ?? [];
  for (const run of runs) {
    // The whole run must be a card-length number; digits inside a longer run (e.g. a 20+ digit bank
    // reference) are not searched, so long transaction ids are not refused by chance.
    const digits = run.replace(/[ -]/g, '');
    if (digits.length >= 13 && digits.length <= 19 && hasCardPrefix(digits) && luhnValid(digits)) return true;
  }
  return false;
}

export const CARD_NUMBER_REFUSED = 'looks like a full card number. Never enter card numbers; for card payments only the last 4 digits are kept.';

/** DTO field decorator: refuses values that contain a full card number. */
export function NoCardNumber(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'noCardNumber',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} ${CARD_NUMBER_REFUSED}`, ...options },
      validator: { validate: (value: unknown) => !containsCardNumber(value) },
    });
}
