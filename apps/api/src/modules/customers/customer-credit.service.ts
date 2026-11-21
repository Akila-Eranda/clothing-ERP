import { createHash } from 'node:crypto';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConflictException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  CreditReminderStatus,
  CreditScheduleLineStatus,
  CreditScheduleStatus,
  NotificationChannel,
  NotificationType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import {
  allocatePaymentFifo,
  buildCustomerLedger,
  chargeStatus,
  collectionRecoveryRate,
  computeChargeDueDate,
  creditTxnSignedDelta,
  daysPastDue,
  generateInstallmentSchedule,
  round2,
  splitCreditPayment,
} from './customer-credit.helper';
import {
  CustomerHistoryCursor,
  decodeCustomerHistoryCursor,
  encodeCustomerHistoryCursor,
} from './customer-history.helper';
import { buildAgingReport, chequeSourceNotes } from '../accounting/finance.helper';
import { CARD_LAST4_REQUIRED_MESSAGE, maskCardLast4, parseCardLast4 } from '@/shared/card-payment.helper';
import * as dayjs from 'dayjs';
import { ChequeDirection, ChequeStatus, PaymentMethod, ReturnStatus, SaleStatus } from '@prisma/client';

export type ReceiveCreditPaymentOpts = {
  paymentMethod?: PaymentMethod | string;
  branchId?: string;
  userId?: string;
  clientRequestId?: string;
  reference?: string;
  /** When true, settle from customer wallet instead of cash/card. */
  applyFromWallet?: boolean;
  /** Required when paymentMethod is CHEQUE */
  chequeNumber?: string;
  chequeBankName?: string;
  chequeDueDate?: string;
  /** Required when paymentMethod is CARD: exactly the last 4 digits */
  cardLast4?: string;
};

function cursorPosition(cursor: CustomerHistoryCursor) {
  const separator = cursor.id.indexOf(':');
  return {
    prefix: cursor.id.slice(0, separator + 1),
    sourceId: cursor.id.slice(separator + 1),
  };
}

function afterSales(cursor: CustomerHistoryCursor | null): Prisma.SaleWhereInput {
  if (!cursor) return {};
  const position = cursorPosition(cursor);
  return {
    OR: [
      { invoiceDate: { gt: cursor.createdAt } },
      ...(position.prefix < 'SALE:' ? [{ invoiceDate: cursor.createdAt }] : []),
      ...(position.prefix === 'SALE:' ? [{ invoiceDate: cursor.createdAt, id: { gt: position.sourceId } }] : []),
    ],
  };
}

function afterWalletTransactions(cursor: CustomerHistoryCursor | null): Prisma.WalletTransactionWhereInput {
  if (!cursor) return {};
  const position = cursorPosition(cursor);
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      ...(position.prefix < 'WALLET:' ? [{ createdAt: cursor.createdAt }] : []),
      ...(position.prefix === 'WALLET:' ? [{ createdAt: cursor.createdAt, id: { gt: position.sourceId } }] : []),
    ],
  };
}

function afterCreditTransactions(cursor: CustomerHistoryCursor | null): Prisma.CustomerCreditTransactionWhereInput {
  if (!cursor) return {};
  const position = cursorPosition(cursor);
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      ...(position.prefix < 'CREDIT:' ? [{ createdAt: cursor.createdAt }] : []),
      ...(position.prefix === 'CREDIT:' ? [{ createdAt: cursor.createdAt, id: { gt: position.sourceId } }] : []),
    ],
  };
}

function afterReturns(cursor: CustomerHistoryCursor | null): Prisma.ReturnWhereInput {
  if (!cursor) return {};
  const position = cursorPosition(cursor);
  return {
    OR: [
      { createdAt: { gt: cursor.createdAt } },
      ...(position.prefix < 'RETURN:' ? [{ createdAt: cursor.createdAt }] : []),
      ...(position.prefix === 'RETURN:' ? [{ createdAt: cursor.createdAt, id: { gt: position.sourceId } }] : []),
    ],
  };
}

type CustomerHistoryRow = {
  id: string;
  category: string;
  createdAt: Date;
  amount: number;
  paymentMethod: string | null;
  paymentAmounts?: { method: string; amount: number }[];
  reference: string | null;
  description: string;
  creditBalanceAfter: number | null;
  walletBalanceAfter: number | null;
  status: string | null;
  creditType?: string;
  creditChange?: number;
  walletChange?: number;
};

function customerPaymentMethod(description: string | null | undefined): string | null {
  return description?.match(/(?:^| · )Payment method: ([A-Z_]+)/)?.[1] ?? null;
}

function customerPaymentReference(referenceId: string | null, description: string | null | undefined): string | null {
  const visibleReference = description?.match(/(?:^| · )Reference: (.*?)(?: · |$)/)?.[1];
  if (visibleReference) return visibleReference;
  return referenceId?.startsWith('CUSTOMER_PAYMENT:') ? null : referenceId;
}

/**
 * Credit reversal for a sale return inside the return's transaction (rows locked FOR UPDATE). Reverses at
 * most what is still open on the sale's charge and on the customer's balance; the caller handles any
 * remainder (a charge the customer already paid off) as store credit.
 */
async function reverseCreditInTx(
  tx: Prisma.TransactionClient,
  tenantId: string,
  saleId: string,
  refundAmount: number,
  description: string,
): Promise<{ reversed: number; customerId?: string }> {
  const [row] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "customer_credit_transactions"
    WHERE "tenantId" = ${tenantId} AND "referenceId" = ${saleId} AND "type" = 'CHARGE' AND "status" IN ('OPEN', 'PARTIAL')
    ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE`;
  if (!row) return { reversed: 0 };
  const charge = await tx.customerCreditTransaction.findUnique({ where: { id: row.id } });
  if (!charge) return { reversed: 0 };
  await tx.$queryRaw`SELECT "id" FROM "customers" WHERE "id" = ${charge.customerId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  const customer = await tx.customer.findFirst({ where: { id: charge.customerId, tenantId }, select: { creditBalance: true } });
  const openOnCharge = round2(charge.amount - charge.paidAmount);
  const reversed = round2(Math.min(refundAmount, openOnCharge, Math.max(0, customer?.creditBalance ?? 0)));
  if (!customer || reversed <= 0.009) return { reversed: 0, customerId: charge.customerId };
  const newPaid = round2(charge.paidAmount + reversed);
  await tx.customer.update({ where: { id: charge.customerId }, data: { creditBalance: { decrement: reversed } } });
  await tx.customerCreditTransaction.update({
    where: { id: charge.id },
    data: { paidAmount: newPaid, status: chargeStatus(charge.amount, newPaid) },
  });
  await tx.customerCreditTransaction.create({
    data: {
      customerId: charge.customerId, tenantId, amount: reversed, type: 'CREDIT_NOTE', status: 'PAID',
      paidAmount: reversed, description, referenceId: saleId,
    },
  });
  return { reversed, customerId: charge.customerId };
}

@Injectable()
export class CustomerCreditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly notifications: NotificationsService,
  ) {}

  async listCreditCustomers(tenantId: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        OR: [{ creditBalance: { gt: 0 } }, { creditLimit: { gt: 0 } }],
      },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        phone: true,
        creditLimit: true,
        creditBalance: true,
        creditDays: true,
        walletBalance: true,
        lastPurchaseAt: true,
      },
      orderBy: { creditBalance: 'desc' },
    });

    const asOf = new Date();
    const openCharges = await this.prisma.customerCreditTransaction.findMany({
      where: {
        tenantId,
        type: 'CHARGE',
        status: { in: ['OPEN', 'PARTIAL'] },
      },
      select: { customerId: true, dueDate: true, amount: true, paidAmount: true },
    });

    const earliestDue = new Map<string, Date>();
    for (const c of openCharges) {
      if (!c.dueDate) continue;
      const prev = earliestDue.get(c.customerId);
      if (!prev || c.dueDate < prev) earliestDue.set(c.customerId, c.dueDate);
    }

    return customers.map((c) => {
      const due = earliestDue.get(c.id);
      const dpd = due ? daysPastDue(due, asOf) : 0;
      return {
        ...c,
        available: Math.max(0, c.creditLimit - c.creditBalance),
        utilizationPct: c.creditLimit > 0 ? round2((c.creditBalance / c.creditLimit) * 100) : 0,
        nextDueDate: due?.toISOString() ?? null,
        daysPastDue: due ? Math.max(0, dpd) : 0,
        isOverdue: !!due && dpd > 0 && c.creditBalance > 0,
      };
    });
  }

  async createPaymentSchedule(
    tenantId: string,
    userId: string,
    dto: {
      customerId: string;
      totalAmount: number;
      installmentCount: number;
      startDate?: string;
      intervalDays?: number;
      chargeTxnId?: string;
      notes?: string;
    },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (dto.totalAmount <= 0) throw new BadRequestException('Amount must be positive');
    if (dto.installmentCount < 1) throw new BadRequestException('At least 1 installment required');

    const start = dto.startDate ? new Date(dto.startDate) : new Date();
    const interval = dto.intervalDays ?? 30;
    const lines = generateInstallmentSchedule(dto.totalAmount, dto.installmentCount, start, interval);

    return this.prisma.customerCreditSchedule.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        chargeTxnId: dto.chargeTxnId,
        totalAmount: dto.totalAmount,
        installmentCount: dto.installmentCount,
        intervalDays: interval,
        startDate: start,
        notes: dto.notes,
        createdBy: userId,
        status: CreditScheduleStatus.ACTIVE,
        lines: {
          create: lines.map((l) => ({
            sequence: l.sequence,
            dueDate: l.dueDate,
            amount: l.amount,
            status: CreditScheduleLineStatus.PENDING,
          })),
        },
      },
      include: { lines: { orderBy: { sequence: 'asc' } }, customer: true },
    });
  }

  async listSchedules(tenantId: string, customerId?: string) {
    await this.markOverdueScheduleLines(tenantId);
    return this.prisma.customerCreditSchedule.findMany({
      where: { tenantId, ...(customerId && { customerId }) },
      include: {
        lines: { orderBy: { sequence: 'asc' } },
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async cancelSchedule(id: string, tenantId: string) {
    const schedule = await this.prisma.customerCreditSchedule.findFirst({
      where: { id, tenantId },
    });
    if (!schedule) throw new NotFoundException('Schedule not found');
    if (schedule.status !== CreditScheduleStatus.ACTIVE) {
      throw new BadRequestException('Only active schedules can be cancelled');
    }
    return this.prisma.customerCreditSchedule.update({
      where: { id },
      data: { status: CreditScheduleStatus.CANCELLED },
      include: { lines: { orderBy: { sequence: 'asc' } }, customer: true },
    });
  }

  private async markOverdueScheduleLines(tenantId: string) {
    const asOf = new Date();
    const pending = await this.prisma.customerCreditScheduleLine.findMany({
      where: {
        schedule: { tenantId, status: CreditScheduleStatus.ACTIVE },
        status: CreditScheduleLineStatus.PENDING,
        dueDate: { lt: asOf },
      },
      select: { id: true, amount: true, paidAmount: true },
    });
    const overdueIds = pending.filter((l) => l.paidAmount + 0.009 < l.amount).map((l) => l.id);
    if (overdueIds.length) {
      await this.prisma.customerCreditScheduleLine.updateMany({
        where: { id: { in: overdueIds } },
        data: { status: CreditScheduleLineStatus.OVERDUE },
      });
    }
  }

  async receiveCreditPayment(
    customerId: string,
    tenantId: string,
    amount: number,
    description: string,
    opts: ReceiveCreditPaymentOpts = {},
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const applyFromWallet = !!opts.applyFromWallet;
    const methodRaw = String(opts.paymentMethod ?? (applyFromWallet ? 'WALLET' : 'CASH')).toUpperCase();
    const method = methodRaw as PaymentMethod;
    const requestId = opts.clientRequestId?.trim();
    if (!requestId || !/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) {
      throw new BadRequestException('A valid clientRequestId is required for customer payment');
    }
    if (applyFromWallet ? method !== PaymentMethod.WALLET : method === PaymentMethod.WALLET) {
      throw new BadRequestException('WALLET is only valid when settling credit from the customer wallet');
    }
    const supportedMethods = [
      PaymentMethod.CASH,
      PaymentMethod.CARD,
      PaymentMethod.UPI,
      PaymentMethod.QR,
      PaymentMethod.BANK_TRANSFER,
      PaymentMethod.CHEQUE,
    ];
    if (!applyFromWallet && !supportedMethods.some((supportedMethod) => supportedMethod === method)) {
      throw new BadRequestException('Unsupported customer payment method');
    }
    const reference = opts.reference?.trim();
    const idempotencyPrefix = `CUSTOMER_PAYMENT:${requestId}:`;
    const requestFingerprint = createHash('sha256')
      .update(JSON.stringify({
        amount: round2(amount),
        method,
        applyFromWallet,
        description,
        reference,
        chequeNumber: (opts.chequeNumber || '').trim(),
        chequeBankName: (opts.chequeBankName || '').trim(),
        chequeDueDate: opts.chequeDueDate ?? null,
        cardLast4: opts.cardLast4 ?? null,
      }))
      .digest('hex');
    const idempotencyReference = `${idempotencyPrefix}${requestFingerprint}`;

    const chequeNumber = (opts.chequeNumber || '').trim();
    if (method === PaymentMethod.CHEQUE && !applyFromWallet && !chequeNumber) {
      throw new BadRequestException('Cheque number is required for cheque settlements');
    }

    // Card settlements: exactly the last 4 digits; only those are kept (in the description).
    if (method === PaymentMethod.CARD && !applyFromWallet) {
      const last4 = parseCardLast4(opts.cardLast4);
      if (!last4) throw new BadRequestException(CARD_LAST4_REQUIRED_MESSAGE);
      description = `${description} · Card ${maskCardLast4(last4)}`;
    }

    let paymentTxnId: string | null = null;
    let applied = 0;
    let advance = 0;
    let finalCreditLimit = 0;
    let finalCreditBalance = 0;
    let finalWalletBalance = 0;
    let isReplay = false;
    let openCharges: Array<{
      id: string;
      amount: number;
      paidAmount: number;
      dueDate: Date | null;
      createdAt: Date;
    }> = [];
    let allocFixed: ReturnType<typeof allocatePaymentFifo> = [];

    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "customers"
        WHERE "id" = ${customerId} AND "tenantId" = ${tenantId}
        FOR UPDATE
      `;
      const customer = await tx.customer.findFirst({
        where: { id: customerId, tenantId },
        select: { id: true, firstName: true, lastName: true, walletBalance: true, creditBalance: true, creditLimit: true },
      });
      if (!customer) throw new NotFoundException('Customer not found');
      finalCreditLimit = round2(customer.creditLimit);

      const [existingPayment, existingWalletRows] = await Promise.all([
        tx.customerCreditTransaction.findFirst({
          where: {
            customerId,
            tenantId,
            type: 'PAYMENT',
            referenceId: { startsWith: idempotencyPrefix },
          },
        }),
        tx.walletTransaction.findMany({
          where: {
            customerId,
            tenantId,
            referenceId: { startsWith: idempotencyPrefix },
            type: { in: ['ADVANCE', 'CREDIT_SETTLE'] },
          },
        }),
      ]);
      const existingReference = existingPayment?.referenceId ?? existingWalletRows[0]?.referenceId;
      if (existingReference) {
        if (existingReference !== idempotencyReference) {
          throw new ConflictException('This customer payment request key was already used with different details.');
        }
        const existingAdvance = existingWalletRows.find((row) => row.type === 'ADVANCE');
        const existingSettlement = existingWalletRows.find((row) => row.type === 'CREDIT_SETTLE');
        applied = existingPayment?.amount ?? 0;
        advance = existingAdvance?.amount ?? 0;
        paymentTxnId = existingPayment?.id ?? existingAdvance?.id ?? existingSettlement?.id ?? null;
        finalCreditBalance = round2(customer.creditBalance);
        finalWalletBalance = round2(customer.walletBalance);
        isReplay = true;
        return;
      }

      if (applyFromWallet) {
        if (customer.walletBalance + 0.01 < amount) {
          throw new BadRequestException(
            `Insufficient wallet advance (LKR ${customer.walletBalance.toFixed(2)} available)`,
          );
        }
        if (customer.creditBalance <= 0.01) {
          throw new BadRequestException('No outstanding credit to settle from wallet');
        }
        if (amount > customer.creditBalance + 0.01) {
          throw new BadRequestException(
            `Wallet settle cannot exceed outstanding (LKR ${customer.creditBalance.toFixed(2)})`,
          );
        }
      }

      const split = applyFromWallet
        ? { applied: round2(amount), advance: 0 }
        : splitCreditPayment(amount, customer.creditBalance);
      applied = split.applied;
      advance = split.advance;
      if (applied <= 0.009 && advance <= 0.009) {
        throw new BadRequestException('Nothing to apply');
      }

      openCharges = applied > 0.009
        ? await tx.customerCreditTransaction.findMany({
            where: {
              customerId,
              tenantId,
              type: 'CHARGE',
              status: { in: ['OPEN', 'PARTIAL'] },
            },
            select: { id: true, amount: true, paidAmount: true, dueDate: true, createdAt: true },
            orderBy: { dueDate: 'asc' },
          })
        : [];
      allocFixed = applied > 0.009
        ? allocatePaymentFifo(
            openCharges.map((c) => ({
              id: c.id,
              amount: c.amount,
              paidAmount: c.paidAmount,
              dueDate: c.dueDate ?? c.createdAt,
            })),
            applied,
          )
        : [];

      const walletDelta = (advance > 0.009 ? advance : 0) - (applyFromWallet ? applied : 0);
      const customerUpdate = await tx.customer.updateMany({
        where: { id: customerId, tenantId },
        data: {
          ...(applied > 0.009 ? { creditBalance: { decrement: applied } } : {}),
          ...(walletDelta !== 0
            ? { walletBalance: walletDelta > 0 ? { increment: walletDelta } : { decrement: Math.abs(walletDelta) } }
            : {}),
        },
      });
      if (customerUpdate.count !== 1) throw new NotFoundException('Customer not found');
      finalCreditBalance = round2(customer.creditBalance - applied);
      finalWalletBalance = round2(customer.walletBalance + walletDelta);

      if (applied > 0.009) {
        const payTxn = await tx.customerCreditTransaction.create({
          data: {
            customerId,
            tenantId,
            amount: applied,
            type: 'PAYMENT',
            status: 'PAID',
            paidAmount: applied,
            description: [
              description,
              `Payment method: ${method}`,
              reference ? `Reference: ${reference}` : null,
              applyFromWallet ? '(from wallet advance)' : null,
            ].filter(Boolean).join(' · '),
            referenceId: idempotencyReference,
          },
        });
        paymentTxnId = payTxn.id;

        for (const a of allocFixed) {
          const charge = openCharges.find((c) => c.id === a.chargeId)!;
          const newPaid = round2(charge.paidAmount + a.applied);
          await tx.customerCreditTransaction.update({
            where: { id: a.chargeId },
            data: {
              paidAmount: newPaid,
              status: chargeStatus(charge.amount, newPaid),
            },
          });
        }

        let rem = applied;
        const scheduleLines = await tx.customerCreditScheduleLine.findMany({
          where: {
            schedule: { tenantId, customerId, status: CreditScheduleStatus.ACTIVE },
            status: {
              in: [
                CreditScheduleLineStatus.PENDING,
                CreditScheduleLineStatus.PARTIAL,
                CreditScheduleLineStatus.OVERDUE,
              ],
            },
          },
          orderBy: { dueDate: 'asc' },
        });
        for (const line of scheduleLines) {
          if (rem <= 0.009) break;
          const open = round2(line.amount - line.paidAmount);
          if (open <= 0.009) continue;
          const apply = round2(Math.min(open, rem));
          rem = round2(rem - apply);
          const newPaid = round2(line.paidAmount + apply);
          const st =
            newPaid + 0.009 >= line.amount
              ? CreditScheduleLineStatus.PAID
              : CreditScheduleLineStatus.PARTIAL;
          await tx.customerCreditScheduleLine.update({
            where: { id: line.id },
            data: { paidAmount: newPaid, status: st },
          });
        }

        const activeSchedules = await tx.customerCreditSchedule.findMany({
          where: { tenantId, customerId, status: CreditScheduleStatus.ACTIVE },
          include: { lines: true },
        });
        for (const s of activeSchedules) {
          if (
            s.lines.every(
              (l) =>
                l.status === CreditScheduleLineStatus.PAID ||
                round2(l.paidAmount) + 0.009 >= l.amount,
            )
          ) {
            await tx.customerCreditSchedule.update({
              where: { id: s.id },
              data: { status: CreditScheduleStatus.COMPLETED },
            });
          }
        }
      }

      if (advance > 0.009) {
        const adv = await tx.walletTransaction.create({
          data: {
            customerId,
            tenantId,
            amount: advance,
            type: 'ADVANCE',
            description: `${description} — prepaid advance`,
            referenceId: idempotencyReference,
          },
        });
        if (!paymentTxnId) paymentTxnId = adv.id;
      }

      if (applyFromWallet && applied > 0.009) {
        await tx.walletTransaction.create({
          data: {
            customerId,
            tenantId,
            amount: -applied,
            type: 'CREDIT_SETTLE',
            description: `${description} — applied to AR`,
            referenceId: idempotencyReference,
          },
        });
      }

      // Cash/card collections hit the cash book (wallet settle + cheques do not)
      if (!applyFromWallet && method !== PaymentMethod.CHEQUE && amount > 0.009) {
        const last = await tx.cashBookEntry.findFirst({
          where: { tenantId, ...(opts.branchId ? { branchId: opts.branchId } : {}) },
          orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        });
        const prev = last?.balanceAfter ?? 0;
        await tx.cashBookEntry.create({
          data: {
            tenantId,
            branchId: opts.branchId || undefined,
            entryDate: new Date(),
            type: advance > 0.009 && applied > 0.009
              ? 'CUSTOMER_CREDIT_AND_ADVANCE'
              : advance > 0.009
                ? 'CUSTOMER_ADVANCE'
                : 'CUSTOMER_CREDIT_PAYMENT',
            description:
              advance > 0.009
                ? `${description} (AR LKR ${applied.toFixed(2)} + advance LKR ${advance.toFixed(2)})`
                : description,
            debit: amount,
            credit: 0,
            balanceAfter: round2(prev + amount),
            paymentMethod: method === PaymentMethod.WALLET ? PaymentMethod.CASH : method,
            referenceType: 'CustomerCredit',
            referenceId: customerId,
            createdBy: opts.userId,
          },
        });
      }

      if (!applyFromWallet && method === PaymentMethod.CHEQUE && amount > 0.009) {
        const partyName = `${customer.firstName} ${customer.lastName ?? ''}`.trim();
        await tx.cheque.create({
          data: {
            tenantId,
            direction: ChequeDirection.RECEIVED,
            status: ChequeStatus.RECEIVED,
            chequeNumber,
            amount,
            bankName: opts.chequeBankName?.trim() || undefined,
            dueDate: opts.chequeDueDate ? new Date(opts.chequeDueDate) : undefined,
            partyType: 'CUSTOMER',
            partyId: customerId,
            partyName,
            notes: chequeSourceNotes('CustomerCredit', customerId, description),
            createdBy: opts.userId,
          },
        });
      }
    });

    if (paymentTxnId && !isReplay) {
      this.eventEmitter.emit('accounting.customer-credit.payment', {
        tenantId,
        branchId: opts.branchId,
        userId: opts.userId,
        customerId,
        paymentTxnId,
        amount,
        applied,
        advance,
        method,
        applyFromWallet,
        description,
        date: new Date(),
      });
    }

    return {
      creditBalance: finalCreditBalance,
      walletBalance: finalWalletBalance,
      creditLimit: finalCreditLimit,
      appliedToCredit: applied,
      advanceToWallet: advance,
      allocations: allocFixed,
      idempotentReplay: isReplay,
    };
  }

  /**
   * Reverse open credit charged on a sale when goods are returned.
   * Reduces creditBalance and open CHARGE for that sale (FIFO within the charge).
   */
  async reverseCreditForSaleReturn(
    tenantId: string,
    saleId: string,
    refundAmount: number,
    description: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (refundAmount <= 0.009) return { reversed: 0 };
    // Inside the return's transaction: lock the charge and the customer so a concurrent credit payment or
    // return cannot overwrite paidAmount (read-then-write), and the reversal commits or rolls back with
    // the return itself.
    if (tx) return reverseCreditInTx(tx, tenantId, saleId, refundAmount, description);

    const charge = await this.prisma.customerCreditTransaction.findFirst({
      where: {
        tenantId,
        referenceId: saleId,
        type: 'CHARGE',
        status: { in: ['OPEN', 'PARTIAL'] },
      },
    });
    if (!charge) return { reversed: 0 };

    const openOnCharge = round2(charge.amount - charge.paidAmount);
    if (openOnCharge <= 0.009) return { reversed: 0 };

    const customer = await this.prisma.customer.findFirst({
      where: { id: charge.customerId, tenantId },
    });
    if (!customer || customer.creditBalance <= 0.009) return { reversed: 0 };

    const reversed = round2(Math.min(refundAmount, openOnCharge, customer.creditBalance));
    if (reversed <= 0.009) return { reversed: 0 };

    const newPaid = round2(charge.paidAmount + reversed);
    await this.prisma.$transaction([
      this.prisma.customer.update({
        where: { id: charge.customerId },
        data: { creditBalance: { decrement: reversed } },
      }),
      this.prisma.customerCreditTransaction.update({
        where: { id: charge.id },
        data: {
          paidAmount: newPaid,
          status: chargeStatus(charge.amount, newPaid),
        },
      }),
      this.prisma.customerCreditTransaction.create({
        data: {
          customerId: charge.customerId,
          tenantId,
          amount: reversed,
          type: 'CREDIT_NOTE',
          status: 'PAID',
          paidAmount: reversed,
          description,
          referenceId: saleId,
        },
      }),
    ]);

    return { reversed };
  }

  async createReminder(
    tenantId: string,
    userId: string,
    dto: {
      customerId: string;
      title?: string;
      message?: string;
      channel?: NotificationChannel;
      chargeTxnId?: string;
      dueDate?: string;
      sendNow?: boolean;
    },
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const title = dto.title ?? 'Payment reminder';
    const message =
      dto.message
      ?? `Dear ${customer.firstName}, your outstanding credit balance is LKR ${customer.creditBalance.toFixed(2)}. Please settle at your earliest convenience.`;

    const reminder = await this.prisma.customerCreditReminder.create({
      data: {
        tenantId,
        customerId: customer.id,
        chargeTxnId: dto.chargeTxnId,
        channel: dto.channel ?? NotificationChannel.IN_APP,
        status: CreditReminderStatus.PENDING,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        title,
        message,
        createdBy: userId,
      },
    });

    if (dto.sendNow !== false) {
      return this.sendReminder(reminder.id, tenantId, userId);
    }
    return reminder;
  }

  async sendReminder(id: string, tenantId: string, actorUserId: string) {
    const reminder = await this.prisma.customerCreditReminder.findFirst({
      where: { id, tenantId },
      include: { customer: true },
    });
    if (!reminder) throw new NotFoundException('Reminder not found');

    try {
      // Notify staff (actor + managers) via Notification Engine
      const staff = await this.prisma.user.findMany({
        where: { tenantId },
        select: { id: true },
        take: 20,
      });
      const recipientIds = [...new Set([actorUserId, ...staff.map((u) => u.id)])];

      await this.notifications.send(tenantId, {
        title: reminder.title,
        message: `${reminder.customer.firstName} ${reminder.customer.lastName ?? ''} (${reminder.customer.phone}): ${reminder.message}`,
        type: NotificationType.PAYMENT_DUE,
        channel: reminder.channel,
        recipientIds,
      });

      return this.prisma.customerCreditReminder.update({
        where: { id },
        data: { status: CreditReminderStatus.SENT, sentAt: new Date() },
      });
    } catch {
      return this.prisma.customerCreditReminder.update({
        where: { id },
        data: { status: CreditReminderStatus.FAILED },
      });
    }
  }

  async listReminders(tenantId: string, status?: CreditReminderStatus) {
    return this.prisma.customerCreditReminder.findMany({
      where: { tenantId, ...(status && { status }) },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true, creditBalance: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  /** Auto-queue reminders for overdue credit customers. */
  async queueOverdueReminders(tenantId: string, userId: string) {
    const asOf = new Date();
    const overdueCharges = await this.prisma.customerCreditTransaction.findMany({
      where: {
        tenantId,
        type: 'CHARGE',
        status: { in: ['OPEN', 'PARTIAL'] },
        dueDate: { lt: asOf },
      },
      include: { customer: true },
    });

    const byCustomer = new Map<string, typeof overdueCharges>();
    for (const c of overdueCharges) {
      const list = byCustomer.get(c.customerId) ?? [];
      list.push(c);
      byCustomer.set(c.customerId, list);
    }

    const created = [];
    for (const [customerId, charges] of byCustomer) {
      const customer = charges[0].customer;
      if (customer.creditBalance <= 0) continue;
      const overdueAmt = round2(charges.reduce((s, c) => s + (c.amount - c.paidAmount), 0));
      const rem = await this.createReminder(tenantId, userId, {
        customerId,
        title: 'Overdue credit reminder',
        message: `Outstanding overdue credit: LKR ${overdueAmt.toFixed(2)} across ${charges.length} charge(s). Please arrange payment.`,
        sendNow: true,
      });
      created.push(rem);
    }
    return { queued: created.length, reminders: created };
  }

  async collectionReport(tenantId: string, startDate: string, endDate: string) {
    const from = dayjs(startDate).startOf('day').toDate();
    const to = dayjs(endDate).endOf('day').toDate();
    const asOf = to;

    const [payments, charges, customers] = await Promise.all([
      this.prisma.customerCreditTransaction.findMany({
        where: { tenantId, type: 'PAYMENT', createdAt: { gte: from, lte: to } },
        include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerCreditTransaction.findMany({
        where: {
          tenantId,
          type: 'CHARGE',
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      }),
      this.prisma.customer.findMany({
        where: { tenantId, creditBalance: { gt: 0 } },
        select: { id: true, creditBalance: true },
      }),
    ]);

    const collected = round2(payments.reduce((s, p) => s + p.amount, 0));
    const outstanding = round2(customers.reduce((s, c) => s + c.creditBalance, 0));
    const overdueCharges = charges.filter((c) => c.dueDate && daysPastDue(c.dueDate, asOf) > 0);
    const overdueAmount = round2(overdueCharges.reduce((s, c) => s + (c.amount - c.paidAmount), 0));
    const overdueCustomerIds = new Set(overdueCharges.map((c) => c.customerId));

    // Approximate starting outstanding = current + collected - new charges in period
    const newCharges = await this.prisma.customerCreditTransaction.aggregate({
      where: { tenantId, type: 'CHARGE', createdAt: { gte: from, lte: to } },
      _sum: { amount: true },
    });
    const chargedInPeriod = round2(newCharges._sum.amount ?? 0);
    const outstandingStart = round2(outstanding - chargedInPeriod + collected);

    return {
      period: { startDate, endDate },
      outstanding,
      overdueAmount,
      collectedInPeriod: collected,
      chargedInPeriod,
      recoveryRate: collectionRecoveryRate(Math.max(outstandingStart, outstanding), collected),
      creditCustomerCount: customers.length,
      overdueCustomerCount: overdueCustomerIds.size,
      payments: payments.map((p) => ({
        id: p.id,
        amount: p.amount,
        createdAt: p.createdAt,
        description: p.description,
        customer: p.customer,
      })),
      overdue: overdueCharges.map((c) => ({
        id: c.id,
        amount: round2(c.amount - c.paidAmount),
        dueDate: c.dueDate,
        daysPastDue: daysPastDue(c.dueDate!, asOf),
        customer: c.customer,
      })),
    };
  }

  /** Used by POS when creating a CHARGE. */
  computeDueDateForCustomer(creditDays: number, chargeDate = new Date()) {
    return computeChargeDueDate(chargeDate, creditDays);
  }

  // ── Sprint 5 — AR Ledger / Statement / Credit Notes / Dashboard ───

  async getCustomerLedger(
    customerId: string,
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        creditBalance: true,
        creditLimit: true,
        creditDays: true,
        walletBalance: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const txns = await this.prisma.customerCreditTransaction.findMany({
      where: { customerId, tenantId },
      orderBy: { createdAt: 'asc' },
    });

    const from = startDate ? dayjs(startDate).startOf('day').toDate() : undefined;
    const to = endDate ? dayjs(endDate).endOf('day').toDate() : undefined;
    const ledger = buildCustomerLedger(txns, { from, to });

    const saleIds = [
      ...new Set(
        ledger.entries
          .map((e) => e.referenceId)
          .filter((id): id is string => !!id),
      ),
    ];
    const sales = saleIds.length
      ? await this.prisma.sale.findMany({
          where: { tenantId, id: { in: saleIds } },
          select: { id: true, invoiceNumber: true, invoiceDate: true, total: true },
        })
      : [];
    const saleMap = new Map(sales.map((s) => [s.id, s]));

    const openCharges = await this.prisma.customerCreditTransaction.findMany({
      where: {
        customerId,
        tenantId,
        type: 'CHARGE',
        status: { in: ['OPEN', 'PARTIAL'] },
      },
      orderBy: { dueDate: 'asc' },
    });

    return {
      customer,
      period: {
        startDate: startDate ?? null,
        endDate: endDate ?? null,
      },
      opening: ledger.opening,
      closing: ledger.closing,
      currentBalance: customer.creditBalance,
      entries: ledger.entries.map((e) => ({
        ...e,
        sale: e.referenceId ? saleMap.get(e.referenceId) ?? null : null,
      })),
      openCharges: openCharges.map((c) => ({
        id: c.id,
        amount: c.amount,
        paidAmount: c.paidAmount,
        open: round2(c.amount - c.paidAmount),
        dueDate: c.dueDate,
        description: c.description,
        referenceId: c.referenceId,
        status: c.status,
        daysPastDue: c.dueDate ? Math.max(0, daysPastDue(c.dueDate, new Date())) : 0,
      })),
    };
  }

  async getCustomerTransactionHistory(
    customerId: string,
    tenantId: string,
    branchId?: string,
    pageSize = 50,
    cursorValue?: string,
    recent = false,
  ) {
    if (recent && cursorValue) throw new BadRequestException('Recent customer history cannot use a cursor');
    const cursor = decodeCustomerHistoryCursor(cursorValue);
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
      select: {
        id: true,
        creditBalance: true,
        creditLimit: true,
        walletBalance: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const saleScope: Prisma.SaleWhereInput = {
      tenantId,
      customerId,
      isReturn: false,
      status: { in: [SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED, SaleStatus.REFUNDED] },
      ...(branchId ? { branchId } : {}),
    };
    const returnScope: Prisma.ReturnWhereInput = {
      tenantId,
      originalSale: {
        tenantId,
        customerId,
      },
      status: { in: [ReturnStatus.COMPLETED, ReturnStatus.REFUND_PROCESSED] },
      ...(branchId ? { branchId } : {}),
    };
    const saleWhere: Prisma.SaleWhereInput = { ...saleScope, ...afterSales(cursor) };
    const returnWhere: Prisma.ReturnWhereInput = { ...returnScope, ...afterReturns(cursor) };
    const [sales, walletRows, creditRows, returns, salesTotal] = await Promise.all([
      this.prisma.sale.findMany({
        where: saleWhere,
        orderBy: [{ invoiceDate: recent ? 'desc' : 'asc' }, { id: recent ? 'desc' : 'asc' }],
        take: pageSize + 1,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          total: true,
          amountPaid: true,
          paymentStatus: true,
          status: true,
          payments: { select: { method: true, amount: true, reference: true } },
        },
      }),
      branchId ? Promise.resolve(null) : this.prisma.walletTransaction.findMany({
        where: { tenantId, customerId, ...afterWalletTransactions(cursor) },
        orderBy: [{ createdAt: recent ? 'desc' : 'asc' }, { id: recent ? 'desc' : 'asc' }],
        take: pageSize + 1,
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          referenceId: true,
          paymentMethod: true,
          createdAt: true,
        },
      }),
      branchId ? Promise.resolve(null) : this.prisma.customerCreditTransaction.findMany({
        where: { tenantId, customerId, ...afterCreditTransactions(cursor) },
        orderBy: [{ createdAt: recent ? 'desc' : 'asc' }, { id: recent ? 'desc' : 'asc' }],
        take: pageSize + 1,
        select: {
          id: true,
          amount: true,
          paidAmount: true,
          type: true,
          status: true,
          description: true,
          referenceId: true,
          createdAt: true,
          dueDate: true,
        },
      }),
      this.prisma.return.findMany({
        where: returnWhere,
        orderBy: [{ createdAt: recent ? 'desc' : 'asc' }, { id: recent ? 'desc' : 'asc' }],
        take: pageSize + 1,
        select: {
          id: true,
          returnNumber: true,
          returnType: true,
          status: true,
          totalAmount: true,
          refundAmount: true,
          exchangeAmount: true,
          createdAt: true,
          originalSale: { select: { invoiceNumber: true } },
        },
      }),
      this.prisma.sale.aggregate({
        where: saleScope,
        _sum: { total: true },
      }),
    ]);
    const walletTxns = walletRows ?? [];
    const creditTxns = creditRows ?? [];

    let walletRunning = recent ? round2(customer.walletBalance) : 0;
    let creditRunning = recent ? round2(customer.creditBalance) : 0;
    if (cursor && !branchId) {
      const position = cursorPosition(cursor);
      const walletBefore: Prisma.WalletTransactionWhereInput = {
        tenantId,
        customerId,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          ...('WALLET:' < position.prefix ? [{ createdAt: cursor.createdAt }] : []),
          ...('WALLET:' === position.prefix ? [{ createdAt: cursor.createdAt, id: { lte: position.sourceId } }] : []),
        ],
      };
      const creditBefore: Prisma.CustomerCreditTransactionWhereInput = {
        tenantId,
        customerId,
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          ...('CREDIT:' < position.prefix ? [{ createdAt: cursor.createdAt }] : []),
          ...('CREDIT:' === position.prefix ? [{ createdAt: cursor.createdAt, id: { lte: position.sourceId } }] : []),
        ],
      };
      const [walletOpening, creditOpening] = await Promise.all([
        this.prisma.walletTransaction.aggregate({
          where: walletBefore,
          _sum: { amount: true },
        }),
        this.prisma.customerCreditTransaction.groupBy({
          by: ['type'],
          where: creditBefore,
          _sum: { amount: true },
        }),
      ]);
      walletRunning = round2(walletOpening._sum.amount ?? 0);
      creditRunning = creditOpening.reduce(
        (balance, row) => round2(balance + creditTxnSignedDelta(row.type, row._sum.amount ?? 0)),
        0,
      );
    }

    const saleRows = sales.map((sale): CustomerHistoryRow => ({
        id: `SALE:${sale.id}`,
        category: 'SALE',
        createdAt: sale.invoiceDate,
        amount: round2(sale.total),
        paymentMethod: sale.payments.map((payment) => payment.method).join(', ') || null,
        paymentAmounts: sale.payments.map((payment) => ({ method: payment.method, amount: round2(payment.amount) })),
        reference: sale.invoiceNumber,
        description: `Invoice · ${sale.status.toLowerCase().replace(/_/g, ' ')}${sale.amountPaid + 0.01 < sale.total ? ' · partial payment' : ''}`,
        creditBalanceAfter: null,
        walletBalanceAfter: null,
        status: sale.paymentStatus,
      }));
    const saleRowById = new Map(saleRows.map((row) => [row.id.slice('SALE:'.length), row]));
    const returnHistoryRows = new Map<string, CustomerHistoryRow>();
    const returnHistoryRowsByNumber = new Map<string, CustomerHistoryRow>();
    for (const ret of returns) {
      const row: CustomerHistoryRow = {
        id: `RETURN:${ret.id}`,
        category: ret.returnType === 'EXCHANGE' ? 'EXCHANGE' : 'RETURN_REFUND',
        createdAt: ret.createdAt,
        amount: round2(ret.refundAmount || ret.exchangeAmount || ret.totalAmount),
        paymentMethod: null,
        reference: `${ret.returnNumber} · ${ret.originalSale.invoiceNumber}`,
        description: ret.returnType === 'EXCHANGE' ? 'Exchange' : 'Return / refund',
        creditBalanceAfter: null,
        walletBalanceAfter: null,
        status: ret.status,
      };
      returnHistoryRows.set(ret.id, row);
      returnHistoryRowsByNumber.set(ret.returnNumber, row);
    }
    const mergedWalletIds = new Set<string>();
    const mergedCreditIds = new Set<string>();
    const paymentWalletRows = new Map<string, typeof walletTxns>();
    for (const txn of walletTxns) {
      if (!txn.referenceId) continue;
      if (txn.type === 'SALE_DEBIT' || txn.type === 'CHANGE_SAVED') {
        const saleRow = saleRowById.get(txn.referenceId);
        if (saleRow) {
          saleRow.category = 'POS_CREDIT_WALLET_PURCHASE';
          saleRow.walletChange = round2((saleRow.walletChange ?? 0) + txn.amount);
          saleRow.description += ` · ${txn.type === 'SALE_DEBIT' ? 'Wallet used' : 'Change saved'} LKR ${Math.abs(txn.amount).toFixed(2)}`;
          mergedWalletIds.add(txn.id);
        }
      }
      if (txn.type === 'RETURN_CREDIT' || txn.type === 'RETURN_REFUND') {
        const returnRow = returnHistoryRows.get(txn.referenceId);
        if (returnRow) {
          returnRow.walletChange = round2((returnRow.walletChange ?? 0) + txn.amount);
          returnRow.description += ` · Wallet credited LKR ${txn.amount.toFixed(2)}`;
          mergedWalletIds.add(txn.id);
        }
      }
      if ((txn.type === 'ADVANCE' || txn.type === 'CREDIT_SETTLE') && txn.referenceId.startsWith('CUSTOMER_PAYMENT:')) {
        const linked = paymentWalletRows.get(txn.referenceId) ?? [];
        linked.push(txn);
        paymentWalletRows.set(txn.referenceId, linked);
      }
    }

    const creditPaymentRowsByReference = new Map(
      creditTxns
        .filter((txn) => txn.type === 'PAYMENT' && txn.referenceId)
        .map((txn) => [txn.referenceId!, txn]),
    );
    const walletHistoryRows: CustomerHistoryRow[] = [];
    for (const txn of walletTxns) {
      if (mergedWalletIds.has(txn.id)) continue;
      const linkedPayment = txn.referenceId ? creditPaymentRowsByReference.get(txn.referenceId) : undefined;
      if (linkedPayment && (txn.type === 'ADVANCE' || txn.type === 'CREDIT_SETTLE')) continue;
      const isReversal = txn.type === 'REVERSAL' || /revers/i.test(txn.description ?? '');
      walletHistoryRows.push({
        id: `WALLET:${txn.id}`,
        category: isReversal
          ? 'REVERSAL'
          : txn.type === 'ADVANCE'
            ? 'CUSTOMER_ADVANCE'
            : txn.type === 'TOPUP' || txn.type === 'TOP_UP'
              ? 'WALLET_TOP_UP'
              : txn.type === 'SALE_DEBIT'
                ? 'WALLET_PAYMENT'
                : txn.type === 'RETURN_CREDIT'
                  ? 'REFUND_CREDIT'
                  : txn.type === 'GOODWILL_CREDIT' || txn.type === 'ADJUSTMENT'
                    ? 'AUTHORIZED_ADJUSTMENT'
                    : 'WALLET',
        createdAt: txn.createdAt,
        amount: round2(txn.amount),
        paymentMethod: txn.paymentMethod,
        reference: customerPaymentReference(txn.referenceId, txn.description),
        description: txn.description ?? txn.type,
        creditBalanceAfter: null,
        walletBalanceAfter: null,
        status: null,
        walletChange: round2(txn.amount),
      });
    }

    const creditHistoryRows: CustomerHistoryRow[] = [];
    for (const txn of creditTxns) {
      const returnNumber = txn.type === 'CREDIT_NOTE'
        ? txn.description?.match(/\bReturn ([^ ·]+)/i)?.[1]
        : undefined;
      const returnRow = returnNumber ? returnHistoryRowsByNumber.get(returnNumber) : undefined;
      if (returnRow) {
        returnRow.category = 'REVERSAL';
        returnRow.creditChange = round2((returnRow.creditChange ?? 0) + creditTxnSignedDelta(txn.type, txn.amount));
        returnRow.description += ` · Credit reversed LKR ${txn.amount.toFixed(2)}`;
        mergedCreditIds.add(txn.id);
        continue;
      }
      if (txn.type === 'CHARGE' && txn.referenceId) {
        const saleRow = saleRowById.get(txn.referenceId);
        if (saleRow) {
          saleRow.category = 'POS_CREDIT_WALLET_PURCHASE';
          saleRow.creditChange = round2((saleRow.creditChange ?? 0) + creditTxnSignedDelta(txn.type, txn.amount));
          saleRow.description += ` · Credit charged LKR ${txn.amount.toFixed(2)}`;
          mergedCreditIds.add(txn.id);
          continue;
        }
      }
      const linkedWallet = txn.type === 'PAYMENT' && txn.referenceId
        ? paymentWalletRows.get(txn.referenceId) ?? []
        : [];
      const walletAdvance = round2(linkedWallet.filter((row) => row.type === 'ADVANCE').reduce((sum, row) => sum + row.amount, 0));
      const walletChange = round2(linkedWallet.reduce((sum, row) => sum + row.amount, 0));
      for (const row of linkedWallet) mergedWalletIds.add(row.id);
      const isOverpayment = walletAdvance > 0.009;
      const fromWallet = linkedWallet.some((row) => row.type === 'CREDIT_SETTLE');
      const isReversal = txn.type === 'CREDIT_NOTE' && /revers/i.test(txn.description ?? '');
      creditHistoryRows.push({
        id: `CREDIT:${txn.id}`,
        category: txn.type === 'PAYMENT'
          ? isOverpayment
            ? 'CUSTOMER_OVERPAYMENT'
            : fromWallet
              ? 'CREDIT_SETTLEMENT_FROM_WALLET'
              : 'CREDIT_SETTLEMENT'
          : txn.type === 'CHARGE'
            ? 'CREDIT'
            : txn.type === 'CREDIT_NOTE'
              ? isReversal ? 'REVERSAL' : 'REFUND_CREDIT'
              : 'CREDIT_ADJUSTMENT',
        creditType: txn.type,
        createdAt: txn.createdAt,
        amount: round2(txn.amount + walletAdvance),
        paymentMethod: txn.type === 'PAYMENT' ? customerPaymentMethod(txn.description) : null,
        reference: customerPaymentReference(txn.referenceId, txn.description),
        description: [
          txn.description ?? txn.type,
          isOverpayment ? `Credit settled LKR ${txn.amount.toFixed(2)} · Overpayment to wallet LKR ${walletAdvance.toFixed(2)}` : null,
        ].filter(Boolean).join(' · '),
        creditBalanceAfter: null,
        walletBalanceAfter: null,
        status: txn.status,
        ...(txn.type === 'PAYMENT'
          ? { creditChange: creditTxnSignedDelta(txn.type, txn.amount), walletChange }
          : { creditChange: creditTxnSignedDelta(txn.type, txn.amount) }),
      });
      if (linkedWallet.length) {
        for (const row of linkedWallet) mergedWalletIds.add(row.id);
      }
    }

    const rows = [
      ...saleRows,
      ...walletHistoryRows.filter((row) => !mergedWalletIds.has(row.id.slice('WALLET:'.length))),
      ...creditHistoryRows.filter((row) => !mergedCreditIds.has(row.id.slice('CREDIT:'.length))),
      ...returnHistoryRows.values(),
    ].sort((a, b) => {
      const byDate = a.createdAt.getTime() - b.createdAt.getTime();
      const byId = a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      return recent ? -(byDate || byId) : byDate || byId;
    });

    for (const row of rows) {
      if (row.walletChange !== undefined) {
        if (recent) {
          row.walletBalanceAfter = walletRunning;
          walletRunning = round2(walletRunning - row.walletChange);
        } else {
          walletRunning = round2(walletRunning + row.walletChange);
          row.walletBalanceAfter = walletRunning;
        }
      }
      if (row.creditChange !== undefined) {
        if (recent) {
          row.creditBalanceAfter = creditRunning;
          creditRunning = round2(creditRunning - row.creditChange);
        } else {
          creditRunning = round2(creditRunning + row.creditChange);
          row.creditBalanceAfter = creditRunning;
        }
      }
    }

    const hasMore = rows.length > pageSize;
    const entries = rows.slice(0, pageSize);
    const lastEntry = entries[entries.length - 1];
    const nextCursor: CustomerHistoryCursor | null = !recent && hasMore && lastEntry
      ? { createdAt: lastEntry.createdAt, id: lastEntry.id }
      : null;

    return {
      customer,
      entries: entries.map(({ creditType: _creditType, ...row }) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
      totals: {
        sales: round2(salesTotal._sum.total ?? 0),
        wallet: round2(customer.walletBalance),
        credit: round2(customer.creditBalance),
        creditLimit: round2(customer.creditLimit),
      },
      pageInfo: {
        limit: pageSize,
        hasMore,
        nextCursor: nextCursor ? encodeCustomerHistoryCursor(nextCursor) : null,
      },
      branchScope: {
        branchFilterApplied: Boolean(branchId),
        walletAndCreditEntriesOmitted: Boolean(branchId),
        balancesAreAllBranches: true,
      },
    };
  }

  async getCustomerStatement(
    customerId: string,
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const ledger = await this.getCustomerLedger(customerId, tenantId, startDate, endDate);
    return {
      ...ledger,
      documentTitle: 'Customer Statement',
      generatedAt: new Date().toISOString(),
    };
  }

  async listCustomerCreditTransactions(
    customerId: string,
    tenantId: string,
    query: { type?: string; page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = Math.min(100, query.limit ?? 50);
    const where = {
      customerId,
      tenantId,
      ...(query.type ? { type: query.type } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.customerCreditTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.customerCreditTransaction.count({ where }),
    ]);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async listPayments(
    tenantId: string,
    query: { startDate?: string; endDate?: string; customerId?: string; limit?: number },
  ) {
    const from = query.startDate ? dayjs(query.startDate).startOf('day').toDate() : dayjs().startOf('month').toDate();
    const to = query.endDate ? dayjs(query.endDate).endOf('day').toDate() : dayjs().endOf('day').toDate();
    const payments = await this.prisma.customerCreditTransaction.findMany({
      where: {
        tenantId,
        type: 'PAYMENT',
        createdAt: { gte: from, lte: to },
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      include: {
        customer: {
          select: { id: true, code: true, firstName: true, lastName: true, phone: true, creditBalance: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: query.limit ?? 100,
    });
    const total = round2(payments.reduce((s, p) => s + p.amount, 0));
    return { period: { startDate: from.toISOString(), endDate: to.toISOString() }, total, payments };
  }

  async createCreditNote(
    customerId: string,
    tenantId: string,
    dto: { amount: number; description?: string; referenceId?: string },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.creditBalance <= 0.01) {
      throw new BadRequestException('No outstanding receivable to credit');
    }

    const applied = round2(Math.min(dto.amount, customer.creditBalance));
    const openCharges = await this.prisma.customerCreditTransaction.findMany({
      where: {
        customerId,
        tenantId,
        type: 'CHARGE',
        status: { in: ['OPEN', 'PARTIAL'] },
      },
      select: { id: true, amount: true, paidAmount: true, dueDate: true, createdAt: true },
      orderBy: { dueDate: 'asc' },
    });

    const allocations = allocatePaymentFifo(
      openCharges.map((c) => ({
        id: c.id,
        amount: c.amount,
        paidAmount: c.paidAmount,
        dueDate: c.dueDate ?? c.createdAt,
      })),
      applied,
    );

    const note = await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { creditBalance: { decrement: applied } },
      });

      for (const a of allocations) {
        const charge = openCharges.find((c) => c.id === a.chargeId)!;
        const newPaid = round2(charge.paidAmount + a.applied);
        await tx.customerCreditTransaction.update({
          where: { id: a.chargeId },
          data: {
            paidAmount: newPaid,
            status: chargeStatus(charge.amount, newPaid),
          },
        });
      }

      return tx.customerCreditTransaction.create({
        data: {
          customerId,
          tenantId,
          amount: applied,
          type: 'CREDIT_NOTE',
          status: 'PAID',
          paidAmount: applied,
          description: dto.description ?? 'Credit note',
          referenceId: dto.referenceId,
        },
      });
    });

    return {
      creditNote: note,
      applied,
      creditBalance: round2(customer.creditBalance - applied),
      allocations,
    };
  }

  async getArDashboard(tenantId: string, asOfDate?: string) {
    const asOf = asOfDate ? dayjs(asOfDate).endOf('day').toDate() : new Date();
    const monthStart = dayjs(asOf).startOf('month').toDate();

    const [customers, openCharges, paymentsThisMonth, creditNotesThisMonth] = await Promise.all([
      this.prisma.customer.findMany({
        where: { tenantId, creditBalance: { gt: 0 } },
        select: {
          id: true,
          code: true,
          firstName: true,
          lastName: true,
          phone: true,
          creditBalance: true,
          creditLimit: true,
          creditDays: true,
        },
        orderBy: { creditBalance: 'desc' },
        take: 50,
      }),
      this.prisma.customerCreditTransaction.findMany({
        where: {
          tenantId,
          type: 'CHARGE',
          status: { in: ['OPEN', 'PARTIAL'] },
        },
        include: {
          customer: { select: { id: true, code: true, firstName: true, lastName: true, phone: true } },
        },
      }),
      this.prisma.customerCreditTransaction.aggregate({
        where: {
          tenantId,
          type: 'PAYMENT',
          createdAt: { gte: monthStart, lte: asOf },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.customerCreditTransaction.aggregate({
        where: {
          tenantId,
          type: 'CREDIT_NOTE',
          createdAt: { gte: monthStart, lte: asOf },
        },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const chargeLines = openCharges.map((c) => ({
      id: c.id,
      partyName: `${c.customer.firstName} ${c.customer.lastName}`.trim(),
      amount: round2(c.amount - c.paidAmount),
      asOfDate: asOf,
      dueOrRefDate: c.dueDate ?? c.createdAt,
      customerId: c.customerId,
      customer: c.customer,
      description: c.description,
      referenceId: c.referenceId,
      status: c.status,
    }));

    const aging = buildAgingReport(chargeLines, asOf);

    const totalOutstanding = round2(customers.reduce((s, c) => s + c.creditBalance, 0));
    const overdueAmount = round2(
      chargeLines
        .filter((l) => daysPastDue(l.dueOrRefDate, asOf) > 0)
        .reduce((s, l) => s + l.amount, 0),
    );

    const recentPayments = await this.prisma.customerCreditTransaction.findMany({
      where: { tenantId, type: 'PAYMENT' },
      include: {
        customer: { select: { id: true, code: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });

    return {
      asOf: asOf.toISOString(),
      kpis: {
        totalOutstanding,
        overdueAmount,
        customerCount: customers.length,
        openChargeCount: openCharges.length,
        collectedThisMonth: round2(paymentsThisMonth._sum.amount ?? 0),
        paymentCountThisMonth: paymentsThisMonth._count,
        creditNotesThisMonth: round2(creditNotesThisMonth._sum.amount ?? 0),
        creditNoteCountThisMonth: creditNotesThisMonth._count,
      },
      aging: {
        buckets: aging.buckets,
        total: aging.total,
      },
      topDebtors: customers.slice(0, 10),
      overdueCharges: aging.lines
        .filter((l) => l.daysPastDue > 0)
        .slice(0, 20)
        .map((l) => {
          const src = chargeLines.find((c) => c.id === l.id);
          return { ...l, customer: src?.customer, description: src?.description };
        }),
      recentPayments,
    };
  }
}
