import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  CreditReminderStatus,
  CreditScheduleLineStatus,
  CreditScheduleStatus,
  NotificationChannel,
  NotificationType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  allocatePaymentFifo,
  buildCustomerLedger,
  chargeStatus,
  collectionRecoveryRate,
  computeChargeDueDate,
  daysPastDue,
  generateInstallmentSchedule,
  round2,
  splitCreditPayment,
} from './customer-credit.helper';
import { buildAgingReport, chequeSourceNotes } from '../accounting/finance.helper';
import * as dayjs from 'dayjs';
import { ChequeDirection, ChequeStatus, PaymentMethod } from '@prisma/client';

export type ReceiveCreditPaymentOpts = {
  paymentMethod?: PaymentMethod | string;
  branchId?: string;
  userId?: string;
  /** When true, settle from customer wallet instead of cash/card. */
  applyFromWallet?: boolean;
  /** Required when paymentMethod is CHEQUE */
  chequeNumber?: string;
  chequeBankName?: string;
  chequeDueDate?: string;
};

@Injectable()
export class CustomerCreditService {
  constructor(private readonly prisma: PrismaService) {}

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
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const applyFromWallet = !!opts.applyFromWallet;
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

    const { applied, advance } = applyFromWallet
      ? { applied: round2(amount), advance: 0 }
      : splitCreditPayment(amount, customer.creditBalance);

    if (applied <= 0.009 && advance <= 0.009) {
      throw new BadRequestException('Nothing to apply');
    }

    const openCharges = applied > 0.009
      ? await this.prisma.customerCreditTransaction.findMany({
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

    const allocFixed = applied > 0.009
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

    const methodRaw = String(opts.paymentMethod ?? (applyFromWallet ? 'WALLET' : 'CASH')).toUpperCase();
    const method = (Object.values(PaymentMethod) as string[]).includes(methodRaw)
      ? (methodRaw as PaymentMethod)
      : PaymentMethod.CASH;

    const chequeNumber = (opts.chequeNumber || '').trim();
    if (method === PaymentMethod.CHEQUE && !applyFromWallet && !chequeNumber) {
      throw new BadRequestException('Cheque number is required for cheque settlements');
    }

    await this.prisma.$transaction(async (tx) => {
      const walletDelta = (advance > 0.009 ? advance : 0) - (applyFromWallet ? applied : 0);
      await tx.customer.update({
        where: { id: customerId },
        data: {
          ...(applied > 0.009 ? { creditBalance: { decrement: applied } } : {}),
          ...(walletDelta !== 0
            ? { walletBalance: walletDelta > 0 ? { increment: walletDelta } : { decrement: Math.abs(walletDelta) } }
            : {}),
        },
      });

      if (applied > 0.009) {
        await tx.customerCreditTransaction.create({
          data: {
            customerId,
            tenantId,
            amount: applied,
            type: 'PAYMENT',
            status: 'PAID',
            paidAmount: applied,
            description: applyFromWallet
              ? `${description} (from wallet advance)`
              : description,
          },
        });

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
        await tx.walletTransaction.create({
          data: {
            customerId,
            tenantId,
            amount: advance,
            type: 'ADVANCE',
            description: `${description} — prepaid advance`,
          },
        });
      }

      if (applyFromWallet && applied > 0.009) {
        await tx.walletTransaction.create({
          data: {
            customerId,
            tenantId,
            amount: -applied,
            type: 'CREDIT_SETTLE',
            description: `${description} — applied to AR`,
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

    return {
      creditBalance: round2(customer.creditBalance - applied),
      walletBalance: round2(customer.walletBalance - (applyFromWallet ? applied : 0) + advance),
      creditLimit: customer.creditLimit,
      appliedToCredit: applied,
      advanceToWallet: advance,
      allocations: allocFixed,
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
  ) {
    if (refundAmount <= 0.009) return { reversed: 0 };

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
      // Notify staff (actor + managers) in-app; SMS queue can be extended later
      const staff = await this.prisma.user.findMany({
        where: { tenantId },
        select: { id: true },
        take: 20,
      });
      const recipientIds = [...new Set([actorUserId, ...staff.map((u) => u.id)])];

      await this.prisma.notification.create({
        data: {
          tenantId,
          title: reminder.title,
          message: `${reminder.customer.firstName} ${reminder.customer.lastName ?? ''} (${reminder.customer.phone}): ${reminder.message}`,
          type: NotificationType.PAYMENT_DUE,
          channel: reminder.channel,
          recipients: recipientIds,
        },
      }).then(async (notification) => {
        await this.prisma.userNotification.createMany({
          data: recipientIds.map((userId) => ({ userId, notificationId: notification.id })),
          skipDuplicates: true,
        });
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
