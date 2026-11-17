import { normalizeWhatsappPhone } from './whatsapp-phone.util';
import { Prisma } from '@prisma/client';

export type CustomerPaymentNotificationData = {
  customerName: string;
  amount: number;
  appliedToCredit: number;
  advanceToWallet: number;
  remainingCredit: number;
  paymentMethod: string;
  paymentTxnId: string;
};

export function whatsappConsent(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const value = metadata as Record<string, unknown>;
  if (typeof value.whatsappConsent === 'boolean') return value.whatsappConsent;
  const whatsapp = value.whatsapp;
  return !!whatsapp && typeof whatsapp === 'object' && (whatsapp as Record<string, unknown>).consent === true;
}

export function withWhatsappConsent(metadata: Prisma.JsonValue, consent: boolean): Prisma.InputJsonObject {
  const existing =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? (metadata as Prisma.JsonObject)
      : {};
  const legacyWhatsapp = existing.whatsapp;
  const updatedLegacyWhatsapp =
    legacyWhatsapp && typeof legacyWhatsapp === 'object' && !Array.isArray(legacyWhatsapp)
      ? { ...legacyWhatsapp, consent }
      : undefined;
  return {
    ...existing,
    whatsappConsent: consent,
    ...(updatedLegacyWhatsapp ? { whatsapp: updatedLegacyWhatsapp } : {}),
  };
}

export function normalizeCustomerWhatsappPhone(phone: string | null | undefined): string | null {
  const normalized = normalizeWhatsappPhone(phone ?? '');
  return /^\d{8,15}$/.test(normalized) ? normalized : null;
}

export function buildCustomerPaymentMessage(data: CustomerPaymentNotificationData): string {
  const lines = [
    `Hello ${data.customerName},`,
    '',
    'Your customer credit payment has been received.',
    `Amount received: LKR ${data.amount.toFixed(2)}`,
    `Payment method: ${data.paymentMethod}`,
    `Applied to outstanding credit: LKR ${data.appliedToCredit.toFixed(2)}`,
  ];
  if (data.advanceToWallet > 0.009) {
    lines.push(`Advance added to wallet: LKR ${data.advanceToWallet.toFixed(2)}`);
  }
  lines.push(
    `Remaining credit balance: LKR ${data.remainingCredit.toFixed(2)}`,
    '',
    'Thank you.',
  );
  return lines.join('\n');
}
