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
  chargeStatus,
  collectionRecoveryRate,
  computeChargeDueDate,
  daysPastDue,
  generateInstallmentSchedule,
  round2,
} from './customer-credit.helper';
import * as dayjs from 'dayjs';

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

  async receiveCreditPayment(
    customerId: string,
    tenantId: string,
    amount: number,
    description: string,
  ) {
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const customer = await this.prisma.customer.findFirst({ where: { id: customerId, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (amount > customer.creditBalance + 0.01) {
      throw new BadRequestException(`Payment exceeds outstanding balance (LKR ${customer.creditBalance.toFixed(2)})`);
    }

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

    const allocFixed = allocatePaymentFifo(
      openCharges.map((c) => ({
        id: c.id,
        amount: c.amount,
        paidAmount: c.paidAmount,
        dueDate: c.dueDate ?? c.createdAt,
      })),
      amount,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { creditBalance: { decrement: amount } },
      });
      await tx.customerCreditTransaction.create({
        data: {
          customerId,
          tenantId,
          amount,
          type: 'PAYMENT',
          status: 'PAID',
          paidAmount: amount,
          description,
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

      // Allocate to active schedule lines (FIFO by due date)
      let rem = amount;
      const scheduleLines = await tx.customerCreditScheduleLine.findMany({
        where: {
          schedule: { tenantId, customerId, status: CreditScheduleStatus.ACTIVE },
          status: { in: [CreditScheduleLineStatus.PENDING, CreditScheduleLineStatus.PARTIAL, CreditScheduleLineStatus.OVERDUE] },
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

      // Complete schedules where all lines paid
      const activeSchedules = await tx.customerCreditSchedule.findMany({
        where: { tenantId, customerId, status: CreditScheduleStatus.ACTIVE },
        include: { lines: true },
      });
      for (const s of activeSchedules) {
        if (s.lines.every((l) => l.status === CreditScheduleLineStatus.PAID || round2(l.paidAmount) + 0.009 >= l.amount)) {
          await tx.customerCreditSchedule.update({
            where: { id: s.id },
            data: { status: CreditScheduleStatus.COMPLETED },
          });
        }
      }
    });

    return {
      creditBalance: round2(customer.creditBalance - amount),
      creditLimit: customer.creditLimit,
      allocations: allocFixed,
    };
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
}
