import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '@/prisma/prisma.service';
import { renderBillMessage, resolveBillTemplate, type BillMessageData } from './bill-message.helper';

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  QR: 'QR',
  BANK_TRANSFER: 'Bank transfer',
  CHEQUE: 'Cheque',
  CUSTOMER_CREDIT: 'Credit',
  WALLET: 'Wallet',
  GIFT_VOUCHER: 'Gift voucher',
  LOYALTY_POINTS: 'Loyalty points',
};
const label = (m: string) => METHOD_LABEL[m] ?? m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, ' ');

/**
 * The customer bill message of a real sale, from the shop's template: actual items (name, quantity, unit price,
 * line total), the invoice total and payment, and the customer's CURRENT credit balance. Used by the "copy /
 * share" button and the WhatsApp sender, so both always send the same text.
 */
export async function buildSaleBillMessage(prisma: PrismaService, tenantId: string, saleId: string) {
  const [sale, tenant] = await Promise.all([
    prisma.sale.findFirst({
      where: { id: saleId, tenantId },
      include: {
        items: { orderBy: { id: 'asc' } },
        payments: true,
        customer: { select: { firstName: true, lastName: true, phone: true, creditBalance: true, walletBalance: true } },
      },
    }),
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, name: true, phone: true } }),
  ]);
  if (!sale) throw new NotFoundException('Sale not found');

  const settings = (tenant?.settings as Record<string, unknown> | null) ?? {};
  const receipt = ((settings['receipt'] as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  const pick = (v: unknown, fallback: string | null | undefined) => (typeof v === 'string' && v.trim() ? v.trim() : fallback ?? '');

  // The QR fee is the shop's bank charge, deducted from what the shop receives (the customer pays the invoice
  // amount): it is never shown to the customer.
  const methods = [...new Set(sale.payments.filter((p) => p.amount > 0).map((p) => String(p.method)))];
  const paymentMethod = methods.map(label).join(', ');

  const customerName = sale.customer ? [sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(' ') : null;
  const data: BillMessageData = {
    customerName,
    customerPhone: sale.customer?.phone ?? null,
    shopName: pick(receipt['shopName'], tenant?.name),
    shopPhone: pick(receipt['phone'], tenant?.phone),
    invoiceNumber: sale.invoiceNumber,
    date: sale.createdAt,
    items: sale.items.map((i) => ({ name: i.productName, variant: i.variantName, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total })),
    subtotal: sale.subtotal,
    discount: sale.discountAmount,
    total: sale.total,
    amountPaid: sale.amountPaid,
    change: sale.changeDue,
    paymentMethod,
    customerCreditBalance: sale.customer?.creditBalance ?? 0,
    customerWalletBalance: sale.customer?.walletBalance ?? 0,
  };
  return {
    message: renderBillMessage(resolveBillTemplate(tenant?.settings), data),
    phone: sale.customer?.phone ?? null,
    invoiceNumber: sale.invoiceNumber,
  };
}
