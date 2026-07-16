import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  CalendarTaskStatus,
  ChequeStatus,
  SupplierInvoiceStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { computeProfitLoss } from '@/modules/accounting/finance.helper';
import {
  bumpBadge,
  emptyBadges,
  monthRange,
  parseDateKey,
  round2,
  toDateKey,
  type DayBadgeCounts,
} from './calendar.helper';
import * as dayjs from 'dayjs';

@Injectable()
export class CalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getMonthOverview(tenantId: string, year: number, month: number) {
    const { start, end } = monthRange(year, month);
    const badges: Record<string, DayBadgeCounts> = {};

    const [
      expenses,
      cheques,
      creditCharges,
      scheduleLines,
      supplierInvoices,
      notes,
      tasks,
      meetings,
    ] = await Promise.all([
      this.prisma.expense.findMany({
        where: { tenantId, date: { gte: start, lte: end } },
        select: { date: true, amount: true },
      }),
      this.prisma.cheque.findMany({
        where: {
          tenantId,
          dueDate: { gte: start, lte: end },
          status: { notIn: [ChequeStatus.CLEARED, ChequeStatus.CANCELLED, ChequeStatus.BOUNCED] },
        },
        select: { dueDate: true },
      }),
      this.prisma.customerCreditTransaction.findMany({
        where: {
          tenantId,
          type: 'CHARGE',
          status: { in: ['OPEN', 'PARTIAL'] },
          dueDate: { gte: start, lte: end },
        },
        select: { dueDate: true },
      }),
      this.prisma.customerCreditScheduleLine.findMany({
        where: {
          dueDate: { gte: start, lte: end },
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
          schedule: { tenantId },
        },
        select: { dueDate: true },
      }),
      this.prisma.supplierInvoice.findMany({
        where: {
          tenantId,
          dueDate: { gte: start, lte: end },
          status: { in: [SupplierInvoiceStatus.POSTED, SupplierInvoiceStatus.PARTIALLY_PAID] },
        },
        select: { dueDate: true },
      }),
      this.prisma.calendarNote.findMany({
        where: { tenantId, date: { gte: start, lte: end } },
        select: { date: true },
      }),
      this.prisma.calendarTask.findMany({
        where: { tenantId, date: { gte: start, lte: end }, status: { not: CalendarTaskStatus.CANCELLED } },
        select: { date: true },
      }),
      this.prisma.calendarMeeting.findMany({
        where: { tenantId, startsAt: { gte: start, lte: end } },
        select: { startsAt: true },
      }),
    ]);

    const saleRows = await this.prisma.sale.findMany({
      where: {
        tenantId,
        invoiceDate: { gte: start, lte: end },
        status: { not: 'CANCELLED' },
      },
      select: { invoiceDate: true, total: true },
    });
    for (const s of saleRows) {
      bumpBadge(badges, toDateKey(s.invoiceDate), 'sales', s.total);
    }
    for (const e of expenses) bumpBadge(badges, toDateKey(e.date), 'expenses', e.amount);
    for (const c of cheques) if (c.dueDate) bumpBadge(badges, toDateKey(c.dueDate), 'chequesDue');
    for (const c of creditCharges) if (c.dueDate) bumpBadge(badges, toDateKey(c.dueDate), 'customerDue');
    for (const l of scheduleLines) bumpBadge(badges, toDateKey(l.dueDate), 'customerDue');
    for (const i of supplierInvoices) if (i.dueDate) bumpBadge(badges, toDateKey(i.dueDate), 'supplierDue');
    for (const n of notes) bumpBadge(badges, toDateKey(n.date), 'notes');
    for (const t of tasks) bumpBadge(badges, toDateKey(t.date), 'tasks');
    for (const m of meetings) bumpBadge(badges, toDateKey(m.startsAt), 'meetings');

    return {
      year,
      month,
      days: Object.entries(badges).map(([date, counts]) => ({ date, counts })),
    };
  }

  async getDayDetail(tenantId: string, dateKey: string) {
    const { start, end } = parseDateKey(dateKey);

    const [
      salesAgg,
      saleItems,
      expenses,
      expenseSum,
      returns,
      cheques,
      creditCharges,
      scheduleLines,
      supplierInvoices,
      supplierPayments,
      notes,
      tasks,
      meetings,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { tenantId, invoiceDate: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { _all: true },
      }),
      this.prisma.saleItem.findMany({
        where: {
          sale: { tenantId, invoiceDate: { gte: start, lte: end }, status: { not: 'CANCELLED' } },
        },
        select: { quantity: true, costPrice: true },
      }),
      this.prisma.expense.findMany({
        where: { tenantId, date: { gte: start, lte: end } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, date: { gte: start, lte: end } },
        _sum: { amount: true },
      }),
      this.prisma.return.aggregate({
        where: {
          tenantId,
          createdAt: { gte: start, lte: end },
          status: { in: ['APPROVED', 'COMPLETED', 'REFUND_PROCESSED'] },
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.cheque.findMany({
        where: {
          tenantId,
          dueDate: { gte: start, lte: end },
          status: { notIn: [ChequeStatus.CLEARED, ChequeStatus.CANCELLED, ChequeStatus.BOUNCED] },
        },
        include: { bankAccount: { select: { name: true, code: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.customerCreditTransaction.findMany({
        where: {
          tenantId,
          type: 'CHARGE',
          status: { in: ['OPEN', 'PARTIAL'] },
          dueDate: { gte: start, lte: end },
        },
        include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } } },
      }),
      this.prisma.customerCreditScheduleLine.findMany({
        where: {
          dueDate: { gte: start, lte: end },
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
          schedule: { tenantId },
        },
        include: {
          schedule: {
            include: { customer: { select: { id: true, firstName: true, lastName: true, phone: true } } },
          },
        },
      }),
      this.prisma.supplierInvoice.findMany({
        where: {
          tenantId,
          dueDate: { gte: start, lte: end },
          status: { in: [SupplierInvoiceStatus.POSTED, SupplierInvoiceStatus.PARTIALLY_PAID] },
        },
        include: { supplier: { select: { id: true, name: true } } },
      }),
      this.prisma.supplierPayment.findMany({
        where: { tenantId, paidAt: { gte: start, lte: end } },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: { paidAt: 'desc' },
      }),
      this.prisma.calendarNote.findMany({
        where: { tenantId, date: { gte: start, lte: end } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.calendarTask.findMany({
        where: { tenantId, date: { gte: start, lte: end } },
        orderBy: [{ status: 'asc' }, { createdAt: 'asc' }],
      }),
      this.prisma.calendarMeeting.findMany({
        where: { tenantId, startsAt: { gte: start, lte: end } },
        orderBy: { startsAt: 'asc' },
      }),
    ]);

    const grossRevenue = salesAgg._sum.total ?? 0;
    const totalReturns = returns._sum.refundAmount ?? 0;
    const cogs = saleItems.reduce((s, i) => s + i.costPrice * i.quantity, 0);
    const expenseTotal = expenseSum._sum.amount ?? 0;
    const pl = computeProfitLoss({
      grossRevenue,
      returns: totalReturns,
      cogs,
      expenses: expenseTotal,
    });

    return {
      date: dateKey,
      sales: {
        count: salesAgg._count._all,
        gross: round2(grossRevenue),
        returns: round2(totalReturns),
        net: pl.netRevenue,
        tax: round2(salesAgg._sum.taxAmount ?? 0),
        discounts: round2(salesAgg._sum.discountAmount ?? 0),
      },
      profit: {
        cogs: round2(cogs),
        grossProfit: pl.grossProfit,
        expenses: pl.operatingExpenses,
        netProfit: pl.netProfit,
        netMarginPct: pl.netMarginPct,
      },
      expenses: {
        total: round2(expenseTotal),
        items: expenses,
      },
      supplierPayments: supplierPayments.map((p) => ({
        id: p.id,
        amount: p.amount,
        method: p.method,
        paidAt: p.paidAt,
        supplier: p.supplier,
        reference: p.reference,
      })),
      supplierDue: supplierInvoices.map((i) => ({
        id: i.id,
        invoiceNumber: i.invoiceNumber,
        due: round2(i.total - i.paidAmount),
        dueDate: i.dueDate,
        supplier: i.supplier,
      })),
      chequesDue: cheques,
      customerDue: [
        ...creditCharges.map((c) => ({
          id: c.id,
          source: 'CHARGE' as const,
          amount: round2(c.amount - c.paidAmount),
          dueDate: c.dueDate,
          customer: c.customer,
        })),
        ...scheduleLines.map((l) => ({
          id: l.id,
          source: 'SCHEDULE' as const,
          amount: round2(l.amount - l.paidAmount),
          dueDate: l.dueDate,
          customer: l.schedule.customer,
        })),
      ],
      notes,
      tasks,
      meetings,
    };
  }

  // ── Notes / Tasks / Meetings CRUD ─────────────────────────

  async createNote(
    tenantId: string,
    userId: string,
    dto: { date: string; title: string; body?: string; color?: string; branchId?: string },
  ) {
    return this.prisma.calendarNote.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        date: dayjs(dto.date).startOf('day').toDate(),
        title: dto.title,
        body: dto.body,
        color: dto.color,
        createdBy: userId,
      },
    });
  }

  async deleteNote(id: string, tenantId: string) {
    const n = await this.prisma.calendarNote.findFirst({ where: { id, tenantId } });
    if (!n) throw new NotFoundException('Note not found');
    await this.prisma.calendarNote.delete({ where: { id } });
    return { ok: true };
  }

  async createTask(
    tenantId: string,
    userId: string,
    dto: {
      date: string;
      title: string;
      description?: string;
      priority?: string;
      assigneeId?: string;
      branchId?: string;
    },
  ) {
    return this.prisma.calendarTask.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        date: dayjs(dto.date).startOf('day').toDate(),
        title: dto.title,
        description: dto.description,
        priority: dto.priority ?? 'NORMAL',
        assigneeId: dto.assigneeId,
        createdBy: userId,
      },
    });
  }

  async updateTaskStatus(id: string, tenantId: string, status: CalendarTaskStatus) {
    const t = await this.prisma.calendarTask.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Task not found');
    return this.prisma.calendarTask.update({
      where: { id },
      data: {
        status,
        completedAt: status === CalendarTaskStatus.DONE ? new Date() : null,
      },
    });
  }

  async deleteTask(id: string, tenantId: string) {
    const t = await this.prisma.calendarTask.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Task not found');
    await this.prisma.calendarTask.delete({ where: { id } });
    return { ok: true };
  }

  async createMeeting(
    tenantId: string,
    userId: string,
    dto: {
      title: string;
      startsAt: string;
      endsAt?: string;
      description?: string;
      location?: string;
      attendees?: string[];
      branchId?: string;
    },
  ) {
    if (!dto.startsAt) throw new BadRequestException('startsAt required');
    return this.prisma.calendarMeeting.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        title: dto.title,
        description: dto.description,
        location: dto.location,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        attendees: dto.attendees ?? [],
        createdBy: userId,
      },
    });
  }

  async deleteMeeting(id: string, tenantId: string) {
    const m = await this.prisma.calendarMeeting.findFirst({ where: { id, tenantId } });
    if (!m) throw new NotFoundException('Meeting not found');
    await this.prisma.calendarMeeting.delete({ where: { id } });
    return { ok: true };
  }
}
