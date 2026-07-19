import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  PaymentMethod,
  PurchaseOrderStatus,
  SupplierDebitNoteStatus,
  SupplierInvoiceStatus,
  SupplierLedgerEntryType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { applyInvoicePayment } from './procurement.helper';
import {
  allocateApPaymentFifo,
  allocatePoPaymentFifo,
  buildSupplierStatementFromLedger,
  computeSupplierOutstanding,
  bucketAging,
  normalizeSupplierPaymentMethod,
  roundAp,
  syncSupplierBalanceWithLedger,
} from './supplier-ap.helper';
import * as dayjs from 'dayjs';

@Injectable()
export class SupplierApService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

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
        allocations: {
          include: {
            purchase: { select: { poNumber: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: query.limit ?? 100,
    });

    return {
      period: { startDate: from.toISOString(), endDate: to.toISOString() },
      total: roundAp(payments.reduce((s, p) => s + p.amount, 0)),
      payments: payments.map((p) => ({
        ...p,
        poSummary: this.formatPoSummary(p.allocations),
      })),
    };
  }

  async listUnpaidPurchaseOrders(tenantId: string, supplierId: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const { lines, outstanding } = await computeSupplierOutstanding(this.prisma, tenantId, supplierId);
    const poLines = lines
      .filter((l) => l.source === 'PO')
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

    return {
      supplier: {
        id: supplier.id,
        code: supplier.code,
        name: supplier.name,
        balance: supplier.balance,
        outstanding,
      },
      purchaseOrders: poLines.map((l) => ({
        id: l.id,
        poNumber: l.docNumber,
        dueAmount: l.amount,
        dueDate: l.dueDate.toISOString(),
      })),
      totalDue: roundAp(poLines.reduce((s, l) => s + l.amount, 0)),
    };
  }

  /**
   * Unified AP payment.
   * Prefer purchaseIds[] for multi-PO FIFO settle (Supplier Payments UI).
   * CHEQUE is stored as BANK_TRANSFER (Main Bank credit).
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
      /** Multi-PO selection — FIFO within these IDs only */
      purchaseIds?: string[];
      paidAt?: string;
      /** Original UI method before CHEQUE→BANK_TRANSFER normalize */
      methodLabel?: string;
    },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const uiMethod = String(dto.method ?? PaymentMethod.CASH).toUpperCase();
    const method = normalizeSupplierPaymentMethod(dto.method);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    await this.assertPostingDateAllowed(tenantId, paidAt);

    const purchaseIds = this.uniqueIds(dto.purchaseIds);
    if (dto.purchaseId && !purchaseIds.includes(dto.purchaseId)) {
      purchaseIds.push(dto.purchaseId);
    }

    const { lines, outstanding } = await computeSupplierOutstanding(this.prisma, tenantId, supplierId);

    // ── Spec primary path: selected POs only ─────────────────────────
    if (purchaseIds.length > 0 && !dto.invoiceId) {
      for (const id of purchaseIds) {
        const line = lines.find((l) => l.id === id && l.source === 'PO');
        if (!line) {
          throw new BadRequestException(`PO not payable (wrong supplier, already paid, or not received): ${id}`);
        }
      }
      const selectedDue = roundAp(
        lines.filter((l) => l.source === 'PO' && purchaseIds.includes(l.id)).reduce((s, l) => s + l.amount, 0),
      );
      if (dto.amount > selectedDue + 0.01) {
        throw new BadRequestException(
          `Payment exceeds selected outstanding (LKR ${selectedDue.toFixed(2)})`,
        );
      }
      const poAllocs = allocatePoPaymentFifo(lines, dto.amount, purchaseIds);
      const appliedTotal = roundAp(poAllocs.reduce((s, a) => s + a.applied, 0));
      if (appliedTotal <= 0.009) throw new BadRequestException('Nothing to apply');

      const result = await this.applyPoAllocations({
        tenantId,
        supplierId,
        userId,
        method,
        uiMethod,
        reference: dto.reference,
        notes: dto.notes,
        paidAt,
        allocations: poAllocs,
        appliedTotal,
      });

      void branchId;
      this.eventEmitter.emit('accounting.supplier-payment.posted', {
        paymentId: result.payment.id,
        tenantId,
        userId,
      });
      // Alias for external integrations expecting AP_PAYMENT_MADE
      this.eventEmitter.emit('AP_PAYMENT_MADE', {
        paymentId: result.payment.id,
        tenantId,
        userId,
        amount: appliedTotal,
      });

      return {
        payment: result.payment,
        payments: [result.payment],
        allocations: result.allocations,
        appliedTotal,
        balanceAfter: result.balanceAfter,
        supplierBalance: result.balanceAfter,
        poSummary: this.formatPoSummary(result.allocations),
      };
    }

    // ── Legacy: single invoice / auto FIFO across invoices+POs ───────
    if (outstanding <= 0.01 && !dto.invoiceId) {
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
    }

    const appliedTotal = roundAp(allocations.reduce((s, a) => s + a.applied, 0));
    if (appliedTotal <= 0.009) throw new BadRequestException('Nothing to apply');
    if (dto.amount > appliedTotal + 0.01 && !dto.invoiceId) {
      throw new BadRequestException(
        `Payment exceeds outstanding (LKR ${outstanding.toFixed(2)})`,
      );
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId,
          purchaseId: allocations.find((a) => a.source === 'PO')?.lineId,
          invoiceId: allocations.find((a) => a.source === 'INVOICE')?.lineId,
          amount: appliedTotal,
          method,
          reference: dto.reference ?? (uiMethod === 'CHEQUE' ? `CHEQUE:${dto.reference ?? ''}` : undefined),
          notes: dto.notes ?? (uiMethod === 'CHEQUE' ? 'Paid by cheque (settled via Main Bank)' : undefined),
          paidAt,
        },
      });

      const allocationRows = [];
      for (const a of allocations) {
        if (a.applied <= 0.009) continue;
        if (a.source === 'INVOICE') {
          const inv = await tx.supplierInvoice.findFirst({
            where: { id: a.lineId, tenantId, supplierId },
          });
          if (!inv) continue;
          const next = applyInvoicePayment(inv.total, inv.paidAmount, a.applied);
          await tx.supplierInvoice.update({
            where: { id: inv.id },
            data: { paidAmount: next.paidAmount, status: next.status as SupplierInvoiceStatus },
          });
          if (inv.purchaseId) {
            await this.bumpPoPaid(tx, tenantId, supplierId, inv.purchaseId, a.applied);
          }
          const row = await tx.supplierPaymentAllocation.create({
            data: {
              tenantId,
              paymentId: payment.id,
              invoiceId: inv.id,
              purchaseId: inv.purchaseId ?? undefined,
              amount: a.applied,
            },
          });
          allocationRows.push(row);
        } else {
          await this.bumpPoPaid(tx, tenantId, supplierId, a.lineId, a.applied);
          const row = await tx.supplierPaymentAllocation.create({
            data: {
              tenantId,
              paymentId: payment.id,
              purchaseId: a.lineId,
              amount: a.applied,
            },
          });
          allocationRows.push(row);
        }
      }

      const balanceAfter = await syncSupplierBalanceWithLedger(tx, tenantId, supplierId, {
        entryType: SupplierLedgerEntryType.PAYMENT,
        amount: -appliedTotal,
        referenceType: 'SupplierPayment',
        referenceId: payment.id,
        notes: dto.notes ?? `AP payment LKR ${appliedTotal.toFixed(2)}`,
        createdBy: userId,
      });

      return { payment, allocations: allocationRows, balanceAfter, appliedTotal };
    });

    void branchId;
    this.eventEmitter.emit('accounting.supplier-payment.posted', {
      paymentId: result.payment.id,
      tenantId,
      userId,
    });
    this.eventEmitter.emit('AP_PAYMENT_MADE', {
      paymentId: result.payment.id,
      tenantId,
      userId,
      amount: appliedTotal,
    });

    return {
      ...result,
      payments: [result.payment],
      supplierBalance: result.balanceAfter,
      poSummary: this.formatPoSummary(result.allocations),
    };
  }

  private uniqueIds(ids?: string[]) {
    if (!ids?.length) return [] as string[];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  private async assertPostingDateAllowed(tenantId: string, date: Date) {
    const prefs = await this.prisma.accountingPreference.findUnique({ where: { tenantId } });
    if (!prefs?.blockPostingClosedPeriod) return;
    const d = dayjs(date).startOf('day').toDate();
    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: dayjs(date).endOf('day').toDate() },
        endDate: { gte: d },
      },
      include: { fiscalYear: true },
    });
    if (!period) return;
    if (period.fiscalYear.status === 'CLOSED') {
      throw new BadRequestException(`Fiscal year "${period.fiscalYear.name}" is closed — cannot post payment`);
    }
    if (period.status !== 'OPEN') {
      throw new BadRequestException(`Period "${period.name}" is ${period.status.toLowerCase()} — reopen it to post`);
    }
  }

  private async applyPoAllocations(opts: {
    tenantId: string;
    supplierId: string;
    userId: string;
    method: PaymentMethod;
    uiMethod: string;
    reference?: string;
    notes?: string;
    paidAt: Date;
    allocations: { lineId: string; source: 'PO'; applied: number }[];
    appliedTotal: number;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId: opts.tenantId,
          supplierId: opts.supplierId,
          purchaseId: opts.allocations[0]?.lineId,
          amount: opts.appliedTotal,
          method: opts.method,
          reference:
            opts.reference
            ?? (opts.uiMethod === 'CHEQUE' ? undefined : undefined),
          notes:
            opts.notes
            ?? (opts.uiMethod === 'CHEQUE' ? 'Paid by cheque (settled via Main Bank)' : undefined),
          paidAt: opts.paidAt,
        },
      });

      const allocationRows = [];
      for (const a of opts.allocations) {
        await this.bumpPoPaid(tx, opts.tenantId, opts.supplierId, a.lineId, a.applied);
        const row = await tx.supplierPaymentAllocation.create({
          data: {
            tenantId: opts.tenantId,
            paymentId: payment.id,
            purchaseId: a.lineId,
            amount: a.applied,
          },
          include: { purchase: { select: { poNumber: true } } },
        });
        allocationRows.push(row);
      }

      const balanceAfter = await syncSupplierBalanceWithLedger(tx, opts.tenantId, opts.supplierId, {
        entryType: SupplierLedgerEntryType.PAYMENT,
        amount: -opts.appliedTotal,
        referenceType: 'SupplierPayment',
        referenceId: payment.id,
        notes: opts.notes ?? `AP payment LKR ${opts.appliedTotal.toFixed(2)}`,
        createdBy: opts.userId,
      });

      return { payment, allocations: allocationRows, balanceAfter };
    });
  }

  private async bumpPoPaid(
    tx: Parameters<typeof syncSupplierBalanceWithLedger>[0],
    tenantId: string,
    supplierId: string,
    purchaseId: string,
    applied: number,
  ) {
    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseId, tenantId, supplierId },
      include: { items: { select: { receivedQty: true, unitCost: true } } },
    });
    if (!po) throw new BadRequestException('Purchase order not found for this supplier');
    const receivedValue = roundAp(
      po.items.reduce((s, i) => s + i.receivedQty * i.unitCost, 0),
    );
    const liabilityBase = receivedValue > 0.01 ? receivedValue : po.total;
    const nextPaid = roundAp(po.paidAmount + applied);
    if (nextPaid > liabilityBase + 0.01) {
      throw new BadRequestException(
        `Payment exceeds PO balance due on ${po.poNumber} (LKR ${Math.max(0, liabilityBase - po.paidAmount).toFixed(2)})`,
      );
    }
    const fullyPaid = nextPaid >= liabilityBase - 0.01;
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        paidAmount: nextPaid,
        status: fullyPaid
          ? PurchaseOrderStatus.CLOSED
          : po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED
            ? PurchaseOrderStatus.PARTIALLY_RECEIVED
            : PurchaseOrderStatus.RECEIVED,
      },
    });
  }

  private formatPoSummary(
    allocations: Array<{ purchase?: { poNumber: string } | null; purchaseId?: string | null }>,
  ) {
    const nums = allocations
      .map((a) => a.purchase?.poNumber)
      .filter((n): n is string => !!n);
    if (nums.length === 0) return null;
    if (nums.length === 1) return nums[0];
    if (nums.length === 2) return `${nums[0]}, ${nums[1]}`;
    return `${nums[0]}, ${nums[1]} +${nums.length - 2} more`;
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
