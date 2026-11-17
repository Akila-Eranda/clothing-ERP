import { BadRequestException } from '@nestjs/common';
import { PaymentMethod } from '@prisma/client';
import { CARD_LAST4_REQUIRED_MESSAGE, parseCardLast4 } from '@/shared/card-payment.helper';

/** Longest payment reference kept (cheque no., bank / QR transaction id, voucher code). */
export const PAYMENT_REFERENCE_MAX = 64;

export type PaymentLineInput = {
  method: PaymentMethod;
  amount: number;
  reference?: string;
  bankAccountId?: string;
  qrCodeId?: string;
  cardLast4?: string;
  /** QR payments: the fee (LKR) the cashier saw on screen; the server refuses the sale if its own figure differs. */
  expectedQrFee?: number;
};

const BANK_METHODS: PaymentMethod[] = [PaymentMethod.BANK_TRANSFER, PaymentMethod.QR];

/**
 * Validates EVERY payment line (whatever its amount) and returns the lines to save.
 * - CARD: exactly the last 4 digits (from cardLast4, or reference for older clients); stored in both.
 *   Anything else — including a full card number — is refused, also on zero-amount lines.
 * - Fields that do not belong to the method are dropped, never stored (no card digits on cash…).
 * - References longer than PAYMENT_REFERENCE_MAX are refused (the DTO also caps them).
 * - Zero-amount lines are not saved; if every line is zero (fully discounted sale) the first one is kept.
 * Bank account / QR ownership is checked by the caller against the database for every returned
 * line AND every dropped line that names one (see paymentLineReferences).
 */
export function preparePaymentLines(payments: PaymentLineInput[]): PaymentLineInput[] {
  if (!Array.isArray(payments) || payments.length === 0) {
    throw new BadRequestException('At least one payment line is required');
  }
  const checked = payments.map((p, i) => {
    const line = `Payment line ${i + 1}`;
    if (!Number.isFinite(p.amount) || p.amount < 0) throw new BadRequestException(`${line}: amount must be zero or more`);
    const reference = typeof p.reference === 'string' ? p.reference.trim() : undefined;
    if (reference && reference.length > PAYMENT_REFERENCE_MAX) {
      throw new BadRequestException(`${line}: reference is longer than ${PAYMENT_REFERENCE_MAX} characters`);
    }
    const out: PaymentLineInput = { method: p.method, amount: p.amount };
    if (p.method === PaymentMethod.CARD) {
      const last4 = parseCardLast4(p.cardLast4 ?? reference);
      if (!last4) throw new BadRequestException(`${line}: ${CARD_LAST4_REQUIRED_MESSAGE}`);
      out.cardLast4 = last4;
      out.reference = last4;
    } else if (reference) {
      out.reference = reference; // card digits on a non-card line are dropped, never stored
    }
    if (BANK_METHODS.includes(p.method)) {
      const bank = p.bankAccountId?.trim();
      if (bank) out.bankAccountId = bank;
      if (p.method === PaymentMethod.QR && p.qrCodeId?.trim()) out.qrCodeId = p.qrCodeId.trim();
      if (p.method === PaymentMethod.QR && typeof p.expectedQrFee === 'number' && Number.isFinite(p.expectedQrFee) && p.expectedQrFee >= 0) out.expectedQrFee = p.expectedQrFee;
    }
    // Bank account / QR on other methods are dropped (older clients may leave them), never stored.
    return out;
  });
  const paid = checked.filter((p) => p.amount > 0);
  return paid.length ? paid : [checked[0]];
}

/**
 * Bank account ids and QR codes named by bank transfer / QR lines of the request — including
 * zero-amount lines that will not be saved — so every one is checked against the shop.
 */
export function paymentLineReferences(payments: PaymentLineInput[]) {
  const bankAccountIds = new Set<string>();
  const qr: { qrCodeId: string; bankAccountId?: string }[] = [];
  for (const p of payments) {
    if (!BANK_METHODS.includes(p.method)) continue;
    const bank = p.bankAccountId?.trim();
    if (bank) bankAccountIds.add(bank);
    if (p.qrCodeId?.trim()) qr.push({ qrCodeId: p.qrCodeId.trim(), bankAccountId: bank });
  }
  return { bankAccountIds: [...bankAccountIds], qr };
}
