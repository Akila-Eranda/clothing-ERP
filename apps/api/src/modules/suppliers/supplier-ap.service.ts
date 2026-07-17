import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  PaymentMethod,
  SupplierDebitNoteStatus,
  SupplierInvoiceStatus,
  SupplierLedgerEntryType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { applyInvoicePayment } from './procurement.helper';
import {
  allocateApPaymentFifo,
  buildSupplierStatementFromLedger,
  computeSupplierOutstanding,
  bucketAging,
  roundAp,
  syncSupplierBalanceWithLedger,
} from './supplier-ap.helper';
import * as dayjs from 'dayjs';

@Injectable()
export class SupplierApService {
  constructor(private readonly prisma: PrismaService) {}

  async getApDashboard(tenantId: string, asOfDate?: string) {
    const asOf = asOfDate ? dayjs(asOfDate).endOf('day').toDate() : new Date();
    const monthStart = dayjs(asOf).startOf('month').toDate();

    const suppliers = await this.prisma.supplier.findMany({
      where: { tenantId, isActive: true, balance: { gt: 0 } },
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        balance: true,
        creditLimit: true,
        creditDays: true,
      },
      orderBy: { balance: 'desc' },
      take: 50,
    });

    const allLines = [];
    for (const s of suppliers) {
      const { lines } = await computeSupplierOutstanding(this.prisma, tenantId, s.id, asOf);
      for (const l of lines) {
        allLines.push({ ...l, supplierId: s.id, supplierName: s.name });
      }
    }

    const aging = bucketAging(
      allLines.map((l) => ({
        id: l.id,
        source: l.source,
        docNumber: l.docNumber,
        amount: l.amount,
        dueDate: l.dueDate,
        asOfDate: asOf,
      })),
      asOf,
    );

    const [paymentsMonth, debitNotesMonth, openInvoices] = await Promise.all([
      this.prisma.supplierPayment.aggregate({
        where: { tenantId, paidAt: { gte: monthStart, lte: asOf } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.supplierDebitNote.aggregate({
        where: {
          tenantId,
          status: SupplierDebitNoteStatus.POSTED,
          noteDate: { gte: monthStart, lte: asOf },
        },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.supplierInvoice.count({
        where: {
          tenantId,
          status: { in: [SupplierInvoiceStatus.POSTED, SupplierInvoiceStatus.PARTIALLY_PAID] },
        },
      }),
    ]);

    const recentPayments = await this.prisma.supplierPayment.findMany({
      where: { tenantId },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        invoice: { select: { invoiceNumber: true } },
        purchase: { select: { poNumber: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: 15,
    });

    const overdue = allLines
      .map((l) => ({
        ...l,
        daysPastDue: Math.floor((asOf.getTime() - l.dueDate.getTime()) / 86400000),
      }))
      .filter((l) => l.daysPastDue > 0)
      .sort((a, b) => b.daysPastDue - a.daysPastDue)
      .slice(0, 25);

    return {
      asOf: asOf.toISOString(),
      kpis: {
        totalOutstanding: roundAp(suppliers.reduce((s, x) => s + x.balance, 0)),
        overdueAmount: roundAp(overdue.reduce((s, l) => s + l.amount, 0)),
        supplierCount: suppliers.length,
        openInvoiceCount: openInvoices,
        paidThisMonth: roundAp(paymentsMonth._sum.amount ?? 0),
        paymentCountThisMonth: paymentsMonth._count,
        debitNotesThisMonth: roundAp(debitNotesMonth._sum.amount ?? 0),
        debitNoteCountThisMonth: debitNotesMonth._count,
      },
      aging,
      topCreditors: suppliers.slice(0, 10),
      overdueLines: overdue,
      recentPayments,
    };
  }

  async getSupplierLedger(
    supplierId: string,
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const rows = await this.prisma.supplierLedgerEntry.findMany({
      where: { supplierId, tenantId },
      orderBy: { createdAt: 'asc' },
    });

    const from = startDate ? dayjs(startDate).startOf('day').toDate() : undefined;
    const to = endDate ? dayjs(endDate).endOf('day').toDate() : undefined;
    const statement = buildSupplierStatementFromLedger(rows, { from, to });
    const { outstanding, lines } = await computeSupplierOutstanding(
      this.prisma,
      tenantId,
      supplierId,
    );
    const aging = bucketAging(lines);

    return {
      supplier: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        creditDays: supplier.creditDays,
        creditLimit: supplier.creditLimit,
        balance: supplier.balance,
      },
      period: { startDate: startDate ?? null, endDate: endDate ?? null },
      opening: statement.opening,
      closing: statement.closing,
      currentBalance: supplier.balance,
      outstanding,
      aging,
      openLines: lines,
      entries: statement.entries,
    };
  }

  async getSupplierStatement(
    supplierId: string,
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ) {
    const ledger = await this.getSupplierLedger(supplierId, tenantId, startDate, endDate);
    return {
      ...ledger,
      documentTitle: 'Supplier Statement',
      generatedAt: new Date().toISOString(),
    };
  }

  async listBills(tenantId: string, supplierId?: string, limit = 50) {
    return this.prisma.supplierInvoice.findMany({
      where: {
        tenantId,
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        purchase: { select: { poNumber: true } },
      },
      orderBy: { invoiceDate: 'desc' },
      take: limit,
    });
  }

  async listPayments(
    tenantId: string,
    query: { startDate?: string; endDate?: string; supplierId?: string; limit?: number },
  ) {
    const from = query.startDate
      ? dayjs(query.startDate).startOf('day').toDate()
      : dayjs().startOf('month').toDate();
    const to = query.endDate
      ? dayjs(query.endDate).endOf('day').toDate()
      : dayjs().endOf('day').toDate();

    const payments = await this.prisma.supplierPayment.findMany({
      where: {
        tenantId,
        paidAt: { gte: from, lte: to },
        ...(query.supplierId ? { supplierId: query.supplierId } : {}),
      },
      include: {
        supplier: { select: { id: true, code: true, name: true } },
        invoice: { select: { invoiceNumber: true } },
        purchase: { select: { poNumber: true } },
      },
      orderBy: { paidAt: 'desc' },
      take: query.limit ?? 100,
    });

    return {
      period: { startDate: from.toISOString(), endDate: to.toISOString() },
      total: roundAp(payments.reduce((s, p) => s + p.amount, 0)),
      payments,
    };
  }

  /**
   * Unified AP payment: allocate FIFO across open invoices then POs,
   * or target a specific invoiceId / purchaseId.
   */
  async receivePayment(
    supplierId: string,
    tenantId: string,
    branchId: string,
    userId: string,
    dto: {
      amount: number;
      method?: PaymentMethod | string;
      reference?: string;
      notes?: string;
      invoiceId?: string;
      purchaseId?: string;
      paidAt?: string;
    },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const methodRaw = String(dto.method ?? PaymentMethod.CASH).toUpperCase();
    const method = (Object.values(PaymentMethod) as string[]).includes(methodRaw)
      ? (methodRaw as PaymentMethod)
      : PaymentMethod.CASH;

    const { lines, outstanding } = await computeSupplierOutstanding(this.prisma, tenantId, supplierId);
    if (outstanding <= 0.01 && !dto.invoiceId && !dto.purchaseId) {
      throw new BadRequestException('No outstanding payable for this supplier');
    }

    let allocations = allocateApPaymentFifo(lines, dto.amount);
    if (dto.invoiceId) {
      const line = lines.find((l) => l.id === dto.invoiceId && l.source === 'INVOICE');
      if (!line) throw new BadRequestException('Invoice not open or not found');
      if (dto.amount > line.amount + 0.01) {
        throw new BadRequestException(`Payment exceeds invoice due (LKR ${line.amount.toFixed(2)})`);
      }
      allocations = [{ lineId: line.id, source: 'INVOICE', applied: roundAp(dto.amount) }];
    } else if (dto.purchaseId) {
      const line = lines.find((l) => l.id === dto.purchaseId && l.source === 'PO');
      if (!line) throw new BadRequestException('PO not open or not found');
      if (dto.amount > line.amount + 0.01) {
        throw new BadRequestException(`Payment exceeds PO due (LKR ${line.amount.toFixed(2)})`);
      }
      allocations = [{ lineId: line.id, source: 'PO', applied: roundAp(dto.amount) }];
    }

    const appliedTotal = roundAp(allocations.reduce((s, a) => s + a.applied, 0));
    if (appliedTotal <= 0.009) {
      throw new BadRequestException('Nothing to apply');
    }
    if (appliedTotal + 0.01 < dto.amount && !dto.invoiceId && !dto.purchaseId) {
      // Cap to outstanding — do not create unallocated overpay without target
      // (overpay not supported for AP in this sprint)
    }

    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();

    const result = await this.prisma.$transaction(async (tx) => {
      const payments = [];
      for (const a of allocations) {
        if (a.applied <= 0.009) continue;
        if (a.source === 'INVOICE') {
          const inv = await tx.supplierInvoice.findFirst({
            where: { id: a.lineId, tenantId, supplierId },
          });
          if (!inv) continue;
          const next = applyInvoicePayment(inv.total, inv.paidAmount, a.applied);
          const payment = await tx.supplierPayment.create({
            data: {
              tenantId,
              supplierId,
              invoiceId: inv.id,
              purchaseId: inv.purchaseId ?? undefined,
              amount: a.applied,
              method,
              reference: dto.reference,
              notes: dto.notes,
              paidAt,
            },
          });
          await tx.supplierInvoice.update({
            where: { id: inv.id },
            data: {
              paidAmount: next.paidAmount,
              status: next.status as SupplierInvoiceStatus,
            },
          });
          payments.push(payment);
        } else {
          const po = await tx.purchaseOrder.findFirst({
            where: { id: a.lineId, tenantId, supplierId },
          });
          if (!po) continue;
          const payment = await tx.supplierPayment.create({
            data: {
              tenantId,
              supplierId,
              purchaseId: po.id,
              amount: a.applied,
              method,
              reference: dto.reference,
              notes: dto.notes,
              paidAt,
            },
          });
          await tx.purchaseOrder.update({
            where: { id: po.id },
            data: { paidAmount: { increment: a.applied } },
          });
          payments.push(payment);
        }
      }

      const balanceAfter = await syncSupplierBalanceWithLedger(tx, tenantId, supplierId, {
        entryType: SupplierLedgerEntryType.PAYMENT,
        amount: -appliedTotal,
        referenceType: 'SupplierPayment',
        referenceId: payments[0]?.id,
        notes: dto.notes ?? `AP payment LKR ${appliedTotal.toFixed(2)}`,
        createdBy: userId,
      });

      return { payments, balanceAfter, appliedTotal, allocations };
    });

    void branchId;
    return {
      ...result,
      supplierBalance: result.balanceAfter,
    };
  }

  async createDebitNote(
    supplierId: string,
    tenantId: string,
    userId: string,
    dto: {
      amount: number;
      reason?: string;
      invoiceId?: string;
      purchaseId?: string;
      noteDate?: string;
      referenceId?: string;
    },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const { lines, outstanding } = await computeSupplierOutstanding(this.prisma, tenantId, supplierId);
    if (outstanding <= 0.01) {
      throw new BadRequestException('No outstanding payable to apply debit note');
    }

    const applyAmt = roundAp(Math.min(dto.amount, outstanding));
    let allocations = allocateApPaymentFifo(lines, applyAmt);
    if (dto.invoiceId) {
      const line = lines.find((l) => l.id === dto.invoiceId && l.source === 'INVOICE');
      if (!line) throw new BadRequestException('Invoice not open');
      allocations = [{ lineId: line.id, source: 'INVOICE', applied: roundAp(Math.min(applyAmt, line.amount)) }];
    } else if (dto.purchaseId) {
      const line = lines.find((l) => l.id === dto.purchaseId && l.source === 'PO');
      if (!line) throw new BadRequestException('PO not open');
      allocations = [{ lineId: line.id, source: 'PO', applied: roundAp(Math.min(applyAmt, line.amount)) }];
    }

    const appliedTotal = roundAp(allocations.reduce((s, a) => s + a.applied, 0));
    const noteNumber = `DN-${Date.now().toString(36).toUpperCase()}`;

    return this.prisma.$transaction(async (tx) => {
      for (const a of allocations) {
        if (a.source === 'INVOICE') {
          const inv = await tx.supplierInvoice.findFirst({
            where: { id: a.lineId, tenantId, supplierId },
          });
          if (!inv) continue;
          const next = applyInvoicePayment(inv.total, inv.paidAmount, a.applied);
          await tx.supplierInvoice.update({
            where: { id: inv.id },
            data: {
              paidAmount: next.paidAmount,
              status: next.status as SupplierInvoiceStatus,
            },
          });
        } else {
          await tx.purchaseOrder.update({
            where: { id: a.lineId },
            data: { paidAmount: { increment: a.applied } },
          });
        }
      }

      const note = await tx.supplierDebitNote.create({
        data: {
          tenantId,
          supplierId,
          noteNumber,
          noteDate: dto.noteDate ? new Date(dto.noteDate) : new Date(),
          amount: applyAmt,
          appliedAmount: appliedTotal,
          status: SupplierDebitNoteStatus.POSTED,
          reason: dto.reason ?? 'Debit note',
          invoiceId: dto.invoiceId,
          purchaseId: dto.purchaseId,
          referenceId: dto.referenceId,
          createdBy: userId,
        },
      });

      await syncSupplierBalanceWithLedger(tx, tenantId, supplierId, {
        entryType: SupplierLedgerEntryType.DEBIT_NOTE,
        amount: -appliedTotal,
        referenceType: 'SupplierDebitNote',
        referenceId: note.id,
        notes: dto.reason ?? `Debit note ${noteNumber}`,
        createdBy: userId,
      });

      return { debitNote: note, applied: appliedTotal, allocations };
    });
  }

  async listDebitNotes(tenantId: string, supplierId?: string) {
    return this.prisma.supplierDebitNote.findMany({
      where: {
        tenantId,
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        supplier: { select: { id: true, name: true, code: true } },
        invoice: { select: { invoiceNumber: true } },
      },
      orderBy: { noteDate: 'desc' },
      take: 100,
    });
  }
}
