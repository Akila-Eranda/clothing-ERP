import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationChannel, NotificationType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { buildCustomerPaymentMessage, normalizeCustomerWhatsappPhone, whatsappConsent } from './customer-payment-notification.helper';
import { WhatsappService } from './whatsapp.service';

const KIND = 'customer_payment_received';
const RETRY_AFTER_MS = 60_000;

type PaymentEvent = {
  tenantId: string;
  customerId: string;
  paymentTxnId: string;
  amount?: number;
  applied?: number;
  advance?: number;
  method?: string;
};

@Injectable()
export class CustomerPaymentNotificationService {
  private readonly logger = new Logger(CustomerPaymentNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
  ) {}

  @OnEvent('accounting.customer-credit.payment', { async: true })
  async handlePaymentCommitted(payload: PaymentEvent) {
    if (!payload?.tenantId || !payload.customerId || !payload.paymentTxnId) return;
    try {
      await this.process(payload.tenantId, payload.paymentTxnId, payload);
    } catch (error) {
      this.logger.error(`Customer payment WhatsApp notification failed ${payload.paymentTxnId}: ${(error as Error).message}`);
    }
  }

  @Cron('*/1 * * * *')
  async retryFailedPayments() {
    const rows = await this.prisma.notification.findMany({
      where: {
        channel: NotificationChannel.WHATSAPP,
        createdAt: { gte: new Date(Date.now() - 7 * 24 * 3600_000) },
        AND: [
          { data: { path: ['kind'], equals: KIND } },
          {
            OR: [
              { data: { path: ['status'], equals: 'failed' } },
              { data: { path: ['status'], equals: 'processing' } },
            ],
          },
        ],
      },
      select: { tenantId: true, data: true },
      take: 200,
      orderBy: { createdAt: 'asc' },
    });

    for (const row of rows) {
      const data = this.notificationData(row.data);
      if (data?.kind !== KIND || !data.paymentTxnId || (data.status !== 'failed' && data.status !== 'processing')) continue;
      const paymentTxnId = data.paymentTxnId;
      if (data.status === 'processing' && Date.now() - (data.startedAt ?? 0) < RETRY_AFTER_MS) continue;
      try {
        await this.process(row.tenantId, paymentTxnId);
      } catch (error) {
        this.logger.warn(`Customer payment WhatsApp retry failed: ${(error as Error).message}`);
      }
    }
  }

  private async process(tenantId: string, paymentTxnId: string, event?: PaymentEvent) {
    const claim = await this.claim(tenantId, paymentTxnId, event);
    if (!claim.claimed) return;

    try {
      const payment = await this.prisma.customerCreditTransaction.findFirst({
        where: { id: paymentTxnId, tenantId, type: 'PAYMENT' },
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          description: true,
          createdAt: true,
          customer: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              metadata: true,
              creditBalance: true,
            },
          },
        },
      });
      if (!payment?.customer) {
        await this.finish(tenantId, paymentTxnId, 'skipped', 'Payment or customer no longer exists');
        return;
      }

      const phone = normalizeCustomerWhatsappPhone(payment.customer.phone);
      if (!phone) {
        await this.finish(tenantId, paymentTxnId, 'skipped', 'Customer phone number is invalid');
        return;
      }
      if (!whatsappConsent(payment.customer.metadata)) {
        await this.finish(tenantId, paymentTxnId, 'skipped', 'Customer has not opted in to WhatsApp receipts');
        return;
      }

      const message = buildCustomerPaymentMessage({
        customerName: [payment.customer.firstName, payment.customer.lastName].filter(Boolean).join(' '),
        amount: claim.data?.amount ?? payment.amount,
        appliedToCredit: claim.data?.applied ?? payment.paidAmount,
        advanceToWallet: claim.data?.advance ?? 0,
        remainingCredit: payment.customer.creditBalance,
        paymentMethod: claim.data?.method ?? this.paymentMethod(payment.description),
        paymentTxnId: payment.id,
      });
      await this.whatsapp.sendText(tenantId, 'system', { phone, message }, { recordNotification: false });
      await this.finish(tenantId, paymentTxnId, 'sent');
    } catch (error) {
      await this.finish(tenantId, paymentTxnId, 'failed', (error as Error).message);
      throw error;
    }
  }

  private async claim(tenantId: string, paymentTxnId: string, event?: PaymentEvent) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw<{ locked: number }[]>`
        WITH lock_acquired AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtext(${`whatsapp-payment:${tenantId}:${paymentTxnId}`}))
        )
        SELECT 1::int AS locked FROM lock_acquired
      `;
      const existing = await tx.notification.findFirst({
        where: {
          tenantId,
          channel: NotificationChannel.WHATSAPP,
          AND: [
            { data: { path: ['kind'], equals: KIND } },
            { data: { path: ['paymentTxnId'], equals: paymentTxnId } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true, data: true },
      });
      const data = this.notificationData(existing?.data);
      if (data?.kind === KIND && data.paymentTxnId === paymentTxnId) {
        if (data.status === 'sent' || data.status === 'skipped') return { claimed: false, data };
        if (data.status === 'processing' && Date.now() - (data.startedAt ?? 0) < RETRY_AFTER_MS) {
          return { claimed: false, data };
        }
        const nextData = { ...data, status: 'processing', startedAt: Date.now(), attempts: (data.attempts ?? 0) + 1 };
        await tx.notification.update({
          where: { id: existing!.id },
          data: { data: nextData as Prisma.InputJsonValue },
        });
        return { claimed: true, data: nextData };
      }

      const newData = {
        kind: KIND,
        paymentTxnId,
        status: 'processing',
        startedAt: Date.now(),
        attempts: 1,
        ...(event?.amount !== undefined ? { amount: event.amount } : {}),
        ...(event?.applied !== undefined ? { applied: event.applied } : {}),
        ...(event?.advance !== undefined ? { advance: event.advance } : {}),
        ...(event?.method ? { method: event.method } : {}),
      };
      await tx.notification.create({
        data: {
          tenantId,
          title: 'Customer payment WhatsApp',
          message: 'Customer payment notification',
          type: NotificationType.INFO,
          channel: NotificationChannel.WHATSAPP,
          recipients: [],
          data: newData,
        },
      });
      return { claimed: true, data: newData };
    });
  }

  private async finish(tenantId: string, paymentTxnId: string, status: 'sent' | 'failed' | 'skipped', error?: string) {
    const row = await this.prisma.notification.findFirst({
      where: {
        tenantId,
        channel: NotificationChannel.WHATSAPP,
        AND: [
          { data: { path: ['kind'], equals: KIND } },
          { data: { path: ['paymentTxnId'], equals: paymentTxnId } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, data: true },
    });
    const data = this.notificationData(row?.data);
    if (!row || data?.kind !== KIND || data.paymentTxnId !== paymentTxnId) return;
    await this.prisma.notification.update({
      where: { id: row.id },
      data: {
        sentAt: status === 'sent' ? new Date() : undefined,
        data: { ...data, status, ...(error ? { error: error.slice(0, 500) } : {}) } as Prisma.InputJsonValue,
      },
    });
  }

  private notificationData(value: Prisma.JsonValue | null | undefined): {
    kind?: string; paymentTxnId?: string; status?: string; startedAt?: number; attempts?: number;
    amount?: number; applied?: number; advance?: number; method?: string;
  } | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as {
        kind?: string; paymentTxnId?: string; status?: string; startedAt?: number; attempts?: number;
        amount?: number; applied?: number; advance?: number; method?: string;
      }
      : null;
  }

  private paymentMethod(description: string | null) {
    const match = description?.match(/^(?:.*?)(?:\s+via\s+|\s+method:\s+)([A-Z_]+)$/i);
    return match?.[1] ?? 'Recorded payment';
  }
}
