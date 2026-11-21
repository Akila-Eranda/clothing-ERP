import { BadRequestException } from '@nestjs/common';
import { PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

/**
 * Bank QR helpers (EMVCo merchant-presented QR, as used by LankaQR).
 *
 * A payload is a list of TLV fields: 2-digit tag, 2-digit length, value. Tag 00 must come first
 * ("01"), tag 63 last (CRC-16/CCITT-FALSE over everything before its value, as 4 upper-case hex).
 * A STATIC code has tag 01 = "11" and no amount; for a DYNAMIC code we set 01 = "12", put the amount
 * in tag 54 and recompute the CRC, so the customer's banking app shows the exact bill amount.
 */

export type EmvField = { tag: string; value: string };

export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  const bytes = Buffer.from(input, 'utf8');
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Top-level TLV fields, or null when the text is not a well-formed EMVCo payload. */
export function parseEmvPayload(payload: string): EmvField[] | null {
  const fields: EmvField[] = [];
  let i = 0;
  while (i < payload.length) {
    const tag = payload.slice(i, i + 2);
    const lenText = payload.slice(i + 2, i + 4);
    if (!/^\d{2}$/.test(tag) || !/^\d{2}$/.test(lenText)) return null;
    const len = Number(lenText);
    const value = payload.slice(i + 4, i + 4 + len);
    if (value.length !== len) return null;
    fields.push({ tag, value });
    i += 4 + len;
  }
  return fields.length ? fields : null;
}

function serialize(fields: EmvField[]): string {
  return fields.map((f) => `${f.tag}${String(f.value.length).padStart(2, '0')}${f.value}`).join('');
}

/** Returns an error message, or null when the payload is a valid EMVCo merchant QR. */
export function validateEmvPayload(payload: string): string | null {
  const text = (payload ?? '').trim();
  if (!text) return 'QR payload is empty';
  if (text.length > 512) return 'QR payload is too long (max 512 characters)';
  const fields = parseEmvPayload(text);
  if (!fields) return 'QR payload is not a valid EMVCo / LankaQR text';
  if (fields[0].tag !== '00' || fields[0].value !== '01') return 'QR payload must start with 000201 (EMVCo format)';
  const crcField = fields[fields.length - 1];
  if (crcField.tag !== '63' || crcField.value.length !== 4) return 'QR payload must end with its CRC (tag 63)';
  const expected = crc16Ccitt(text.slice(0, text.length - 4));
  if (expected !== crcField.value.toUpperCase()) return 'QR payload checksum (CRC) does not match — copy the full QR text again';
  if (!fields.some((f) => f.tag === '59')) return 'QR payload has no merchant name (tag 59)';
  return null;
}

/** Dynamic QR text for an exact amount (LKR, 2 decimals). Throws on an invalid payload or amount. */
export function buildDynamicEmvPayload(payload: string, amount: number): string {
  const error = validateEmvPayload(payload);
  if (error) throw new BadRequestException(error);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 9_999_999_999) {
    throw new BadRequestException('QR amount must be greater than zero');
  }
  const fields = parseEmvPayload(payload.trim())!.filter((f) => f.tag !== '63' && f.tag !== '54' && f.tag !== '01');
  const amountText = (Math.round(amount * 100) / 100).toFixed(2);
  const out: EmvField[] = [fields[0], { tag: '01', value: '12' }];
  // Keep the merchant's fields in order; amount (54) goes right after currency (53) or before 58.
  const rest = fields.slice(1);
  const insertAt = (() => {
    const after53 = rest.findIndex((f) => f.tag === '53');
    if (after53 >= 0) return after53 + 1;
    const before = rest.findIndex((f) => Number(f.tag) > 54);
    return before >= 0 ? before : rest.length;
  })();
  rest.splice(insertAt, 0, { tag: '54', value: amountText });
  out.push(...rest);
  const body = `${serialize(out)}6304`;
  return `${body}${crc16Ccitt(body)}`;
}

/** Merchant name from a payload (tag 59), for display. */
export function emvMerchantName(payload: string | null | undefined): string | null {
  if (!payload) return null;
  return parseEmvPayload(payload.trim())?.find((f) => f.tag === '59')?.value ?? null;
}

export const QR_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);
export const QR_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

type Db = PrismaService | Prisma.TransactionClient;

/**
 * QR payments that name a QR code must use an active code of this shop, for the same bank account
 * and for this branch (or all branches). A QR payment without a code is still accepted (shops that
 * have not set up QR images keep working; the bank account is already required).
 */
export async function assertQrCodesForPayments(
  db: Db,
  tenantId: string,
  branchId: string,
  payments: { method: PaymentMethod; bankAccountId?: string; qrCodeId?: string }[],
): Promise<void> {
  const withCode = payments.filter((p) => p.method === PaymentMethod.QR && p.qrCodeId?.trim());
  if (!withCode.length) return;
  const ids = [...new Set(withCode.map((p) => p.qrCodeId!.trim()))];
  const codes = await db.paymentQrCode.findMany({
    where: { tenantId, id: { in: ids }, isActive: true, OR: [{ branchId: null }, { branchId }] },
    select: { id: true, bankAccountId: true },
  });
  const byId = new Map(codes.map((c) => [c.id, c]));
  for (const p of withCode) {
    const code = byId.get(p.qrCodeId!.trim());
    if (!code) throw new BadRequestException('The selected QR code is not available for this shop or branch');
    if (code.bankAccountId !== p.bankAccountId?.trim()) {
      throw new BadRequestException('The selected QR code belongs to a different bank account');
    }
  }
}
