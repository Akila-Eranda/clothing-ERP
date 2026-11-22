import { appendCashBookEntryTx } from '@/shared/cash-book.helper';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  BankAccountType,
  BankTxnStatus,
  BankTxnType,
  ChequeDirection,
  ChequeStatus,
  PaymentMethod,
  Prisma,
  PurchaseOrderStatus,
  SupplierDebitNoteStatus,
  SupplierInvoiceStatus,
  SupplierLedgerEntryType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { chequeSourceNotes } from '@/modules/accounting/finance.helper';
import { applyInvoicePayment } from './procurement.helper';
import {
  allocateApPaymentFifo,
  allocatePoPaymentFifo,
  buildSupplierStatementFromLedger,
  computeSupplierOutstanding,
  appendSupplierLedger,
  syncSupplierBalance,
  bucketAging,
  normalizeSupplierPaymentMethod,
  roundAp,
  syncSupplierBalanceWithLedger,
} from './supplier-ap.helper';
import { recordSupplierCashOutflow } from '@/shared/cash-register.helper';
import { isClientRequestIdConflict, normalizeClientRequestId } from '@/modules/pos/pos-idempotency.helper';
import { isSupplierPaymentReplay, supplierPaymentRequestFingerprint } from './supplier-payment-idempotency.helper';
import { AdvanceRuleError, advanceRequestFingerprint, decideAdvanceReplay, planAdvanceApplication, splitPaymentForAdvance, type AdvanceRequest } from './supplier-advance.helper';
import { resolveCashActor } from '@/shared/security/cash-actor';
import * as dayjs from 'dayjs';

type ApTx = Prisma.TransactionClient;

/**
 * Optional outer transaction: when a supplier payment is part of a GRN (PO receive / Quick GRN), it runs in
 * the GRN's own transaction so a failed payment rolls the stock receipt back too. Events ("payment posted")
 * are then deferred to `after` and fired by the caller only once that transaction has committed.
 */
export type ApTxContext = { tx?: ApTx; after?: (() => void)[] };

@Injectable()
export class SupplierApService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Who pays (PIN cashier, never the terminal login) and which manager approved (approval token from
   * POST /cash/manager-approval). Used for supplier cash paid out of a drawer.
   */
  resolveCash(tenantId: string, user: { id: string; roles?: string[] }, unlockToken?: string, approvalToken?: string) {
    return resolveCashActor(this.prisma, { tenantId, user, unlockToken, approvalToken });
  }

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
      chequeNumber?: string;
      chequeDueDate?: string;
      chequeBankName?: string;
      chequeBankAccountId?: string;
      /** Our company bank account for BANK_TRANSFER / CHEQUE */
      bankAccountId?: string;
      /** Pay more than is payable and keep the excess as the supplier's advance (off by default). */
      allowAdvance?: boolean;
      clientRequestId?: string;
    },
    /** Manager who approved a cash payment above the limit (server-verified approval token; never client data). */
    cash: { authorizedById?: string | null } = {},
    ctx?: ApTxContext,
  ) {
    // Reads go through the caller's transaction when there is one (it can see the GRN just posted).
    const db = ctx?.tx ?? this.prisma;
    const clientRequestId = normalizeClientRequestId(dto.clientRequestId);
    const requestFingerprint = supplierPaymentRequestFingerprint({
      tenantId,
      branchId,
      ...dto,
      method: String(dto.method ?? PaymentMethod.CASH),
    });
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    const supplier = await db.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (clientRequestId) {
      const replay = await this.findPaymentReplay(db, tenantId, supplierId, clientRequestId, requestFingerprint);
      if (replay) return replay;
    }

    const uiMethod = String(dto.method ?? PaymentMethod.CASH).toUpperCase();
    const method = normalizeSupplierPaymentMethod(dto.method);
    const paidAt = dto.paidAt ? new Date(dto.paidAt) : new Date();
    await this.assertPostingDateAllowed(tenantId, paidAt);

    const chequeNumber = (dto.chequeNumber ?? dto.reference)?.trim();
    if (uiMethod === 'CHEQUE' && !chequeNumber) {
      throw new BadRequestException('Cheque number is required for cheque payments');
    }
    if (uiMethod === 'CHEQUE' && !dto.chequeDueDate?.trim()) {
      throw new BadRequestException('Cheque due date is required');
    }

    const ourBankAccountId = dto.bankAccountId || dto.chequeBankAccountId || undefined;
    if ((uiMethod === 'BANK_TRANSFER' || uiMethod === 'CHEQUE') && !ourBankAccountId) {
      throw new BadRequestException('Select your company bank account');
    }

    const chequeOpts = uiMethod === 'CHEQUE'
      ? {
          chequeNumber: chequeNumber!,
          chequeDueDate: dto.chequeDueDate!,
          chequeBankName: dto.chequeBankName?.trim() || undefined,
          chequeBankAccountId: ourBankAccountId,
        }
      : undefined;

    const purchaseIds = this.uniqueIds(dto.purchaseIds);
    if (dto.purchaseId && !purchaseIds.includes(dto.purchaseId)) {
      purchaseIds.push(dto.purchaseId);
    }

    const { lines, outstanding } = await computeSupplierOutstanding(db, tenantId, supplierId);

    // ── Spec primary path: selected POs only ─────────────────────────
    if (purchaseIds.length > 0 && !dto.invoiceId) {
      // Allow advance payment against unreceived POs (pay on create / deposit).
      const missingPoIds = purchaseIds.filter(
        (id) => !lines.some((l) => l.id === id && l.source === 'PO'),
      );
      if (missingPoIds.length > 0) {
        const advancePos = await db.purchaseOrder.findMany({
          where: {
            id: { in: missingPoIds },
            tenantId,
            supplierId,
            status: { notIn: [PurchaseOrderStatus.CANCELLED] },
          },
          include: { items: { select: { receivedQty: true, unitCost: true } } },
        });
        const found = new Set(advancePos.map((p) => p.id));
        for (const id of missingPoIds) {
          if (!found.has(id)) {
            throw new BadRequestException(`PO not found for this supplier: ${id}`);
          }
        }
        for (const po of advancePos) {
          const receivedValue = roundAp(
            po.items.reduce((s, i) => s + i.receivedQty * i.unitCost, 0),
          );
          const liabilityBase = receivedValue > 0.01 ? receivedValue : po.total;
          const due = roundAp(Math.max(0, liabilityBase - po.paidAmount));
          if (due <= 0.01) {
            throw new BadRequestException(`PO ${po.poNumber} is already fully paid`);
          }
          lines.push({
            id: po.id,
            source: 'PO',
            docNumber: po.poNumber,
            amount: due,
            dueDate: new Date(po.orderDate.getTime() + 30 * 86400000),
            asOfDate: paidAt,
          });
        }
      }

      for (const id of purchaseIds) {
        const line = lines.find((l) => l.id === id && l.source === 'PO');
        if (!line) {
          throw new BadRequestException(`PO not payable (wrong supplier, already paid, or cancelled): ${id}`);
        }
      }
      const selectedDue = roundAp(
        lines.filter((l) => l.source === 'PO' && purchaseIds.includes(l.id)).reduce((s, l) => s + l.amount, 0),
      );
      const split = this.splitForAdvance(dto.amount, selectedDue, !!dto.allowAdvance, 'selected outstanding');
      const poAllocs = allocatePoPaymentFifo(lines, split.applied, purchaseIds);
      const appliedTotal = roundAp(poAllocs.reduce((s, a) => s + a.applied, 0));
      if (appliedTotal <= 0.009) throw new BadRequestException('Nothing to apply');

      const result = await this.applyPoAllocations({
        ctx,
        tenantId,
        supplierId,
        branchId,
        userId,
        authorizedById: cash.authorizedById ?? null,
        method,
        uiMethod,
        reference: dto.reference ?? chequeNumber,
        notes: dto.notes,
        paidAt,
        allocations: poAllocs,
        appliedTotal,
        advance: split.advance,
        clientRequestId,
        requestFingerprint,
        supplierName: supplier.name,
        cheque: chequeOpts,
        bankAccountId: ourBankAccountId,
      });
      if (result.replayed) {
        return {
          ...result,
          payments: [result.payment],
          supplierBalance: result.balanceAfter,
          poSummary: this.formatPoSummary(result.allocations),
        };
      }

      this.emitAfter(ctx, () => {
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
      });

      return {
        payment: result.payment,
        payments: [result.payment],
        allocations: result.allocations,
        appliedTotal,
        advanceAmount: split.advance,
        advanceBalance: result.advanceBalance,
        balanceAfter: result.balanceAfter,
        supplierBalance: result.balanceAfter,
        poSummary: this.formatPoSummary(result.allocations),
      };
    }

    // ── Legacy: single invoice / auto FIFO across invoices+POs ───────
    if (outstanding <= 0.01 && !dto.invoiceId && !dto.allowAdvance) {
      throw new BadRequestException('No outstanding payable for this supplier');
    }

    let allocations: { lineId: string; source: 'PO' | 'INVOICE'; applied: number }[];
    let split: { applied: number; advance: number };
    if (dto.invoiceId) {
      const line = lines.find((l) => l.id === dto.invoiceId && l.source === 'INVOICE');
      if (!line) throw new BadRequestException('Invoice not open or not found');
      split = this.splitForAdvance(dto.amount, line.amount, !!dto.allowAdvance, 'invoice due');
      allocations = [{ lineId: line.id, source: 'INVOICE', applied: roundAp(split.applied) }];
    } else {
      split = this.splitForAdvance(dto.amount, outstanding, !!dto.allowAdvance, 'outstanding');
      allocations = allocateApPaymentFifo(lines, split.applied);
    }

    const appliedTotal = roundAp(allocations.reduce((s, a) => s + a.applied, 0));
    const advance = split.advance;
    if (appliedTotal <= 0.009 && advance <= 0.009) throw new BadRequestException('Nothing to apply');
    const paidTotal = roundAp(appliedTotal + advance);

    let result;
    try {
      result = await this.runTx(ctx, async (tx) => {
        if (clientRequestId) {
          const replay = await this.findPaymentReplay(tx, tenantId, supplierId, clientRequestId, requestFingerprint);
          if (replay) return replay;
        }
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId,
          purchaseId: allocations.find((a) => a.source === 'PO')?.lineId,
          invoiceId: allocations.find((a) => a.source === 'INVOICE')?.lineId,
          amount: paidTotal,
          advanceAmount: advance,
          method,
          reference: dto.reference ?? (uiMethod === 'CHEQUE' ? chequeNumber : undefined),
          notes: dto.notes ?? (uiMethod === 'CHEQUE' ? 'Paid by cheque' : undefined),
          paidAt,
          clientRequestId: clientRequestId ?? undefined,
          requestFingerprint: clientRequestId ? requestFingerprint : undefined,
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

      const balanceAfter = appliedTotal > 0.009
        ? await syncSupplierBalanceWithLedger(tx, tenantId, supplierId, {
            entryType: SupplierLedgerEntryType.PAYMENT,
            amount: -appliedTotal,
            referenceType: 'SupplierPayment',
            referenceId: payment.id,
            notes: dto.notes ?? `AP payment LKR ${appliedTotal.toFixed(2)}`,
            createdBy: userId,
          })
        : await syncSupplierBalance(tx, tenantId, supplierId);
      const advanceBalance = advance > 0.009
        ? await this.addAdvanceFromPayment(tx, { tenantId, supplierId, paymentId: payment.id, amount: advance, userId, outstanding: balanceAfter })
        : null;

      await this.applyTenderOutflow(tx, {
        tenantId,
        branchId,
        userId,
        authorizedById: cash.authorizedById ?? null,
        supplierId,
        supplierName: supplier.name,
        paymentId: payment.id,
        amount: paidTotal,
        method,
        uiMethod,
        paidAt,
        reference: dto.reference ?? payment.reference ?? chequeNumber ?? undefined,
        cheque: chequeOpts,
        bankAccountId: ourBankAccountId,
      });

        return { payment, allocations: allocationRows, balanceAfter, appliedTotal, advanceAmount: advance, advanceBalance, replayed: false as const };
      });
    } catch (error) {
      if (clientRequestId && isClientRequestIdConflict(error) && !ctx?.tx) {
        const replay = await this.findPaymentReplay(this.prisma, tenantId, supplierId, clientRequestId, requestFingerprint);
        if (replay) return replay;
      }
      throw error;
    }

    if (result.replayed) {
      return {
        ...result,
        supplierBalance: result.balanceAfter,
        poSummary: this.formatPoSummary(result.allocations),
      };
    }

    this.emitAfter(ctx, () => {
      this.eventEmitter.emit('accounting.supplier-payment.posted', {
        paymentId: result.payment.id,
        tenantId,
        userId,
      });
      this.eventEmitter.emit('AP_PAYMENT_MADE', {
        paymentId: result.payment.id,
        tenantId,
        userId,
        amount: paidTotal,
      });
    });

    return {
      ...result,
      payments: [result.payment],
      supplierBalance: result.balanceAfter,
      poSummary: this.formatPoSummary(result.allocations),
    };
  }

  /** payment vs advance split; keeps the old wording of the "exceeds" errors when no advance was asked for. */
  private splitForAdvance(amount: number, due: number, allowAdvance: boolean, label: string) {
    try {
      return splitPaymentForAdvance(amount, due, allowAdvance);
    } catch (e) {
      if (e instanceof AdvanceRuleError) {
        throw new BadRequestException(allowAdvance || !(amount > 0) ? e.message : `Payment exceeds ${label} (LKR ${roundAp(due).toFixed(2)})`);
      }
      throw e;
    }
  }

  /** Locks the supplier row for the rest of the transaction (serialises every advance change). */
  private async lockSupplier(tx: ApTx, tenantId: string, supplierId: string) {
    await tx.$queryRaw`SELECT id FROM "suppliers" WHERE id = ${supplierId} AND "tenantId" = ${tenantId} FOR UPDATE`;
  }

  /** Overpayment kept on account: history row + running balance + an informational ledger row. */
  private async addAdvanceFromPayment(
    tx: ApTx,
    o: { tenantId: string; supplierId: string; paymentId: string; amount: number; userId: string; outstanding: number },
  ): Promise<number> {
    await this.lockSupplier(tx, o.tenantId, o.supplierId);
    const updated = await tx.supplier.update({
      where: { id: o.supplierId },
      data: { advanceBalance: { increment: o.amount } },
      select: { advanceBalance: true },
    });
    const balanceAfter = roundAp(updated.advanceBalance);
    await tx.supplierAdvanceEntry.create({
      data: {
        tenantId: o.tenantId,
        supplierId: o.supplierId,
        type: 'ADVANCE_IN',
        amount: roundAp(o.amount),
        balanceAfter,
        batchId: o.paymentId,
        paymentId: o.paymentId,
        notes: `Overpayment kept as advance (payment ${o.paymentId.slice(0, 8)})`,
        createdById: o.userId,
      },
    });
    await appendSupplierLedger(tx, {
      tenantId: o.tenantId,
      supplierId: o.supplierId,
      // ADJUSTMENT (existing enum value): older API versions can still read the row after a rollback.
      entryType: SupplierLedgerEntryType.ADJUSTMENT,
      amount: 0,
      balanceAfter: o.outstanding,
      referenceType: 'SupplierPayment',
      referenceId: o.paymentId,
      notes: `Supplier advance: LKR ${o.amount.toFixed(2)} kept on account (available LKR ${balanceAfter.toFixed(2)})`,
      createdBy: o.userId,
    });
    return balanceAfter;
  }

  /** Payable and advance side by side, with the advance history. */
  async getAdvanceOverview(supplierId: string, tenantId: string, limit = 100) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
      select: { id: true, name: true, advanceBalance: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const [{ outstanding, lines }, entries] = await Promise.all([
      computeSupplierOutstanding(this.prisma, tenantId, supplierId),
      this.prisma.supplierAdvanceEntry.findMany({
        where: { tenantId, supplierId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(Math.max(limit, 1), 500),
      }),
    ]);
    return {
      supplierId,
      supplierName: supplier.name,
      outstanding,
      advanceBalance: roundAp(supplier.advanceBalance),
      openBills: lines.map((l) => ({ id: l.id, source: l.source, docNumber: l.docNumber, due: l.amount, dueDate: l.dueDate.toISOString() })),
      entries,
    };
  }

  /**
   * Applies the supplier's advance to open bills (no cash moves). Transactional and safe against double use:
   *  - the supplier row is locked, so two requests never spend the same advance;
   *  - the same `clientRequestId` returns the first result and changes nothing;
   *  - each bill is checked against what it still owes, the total against the advance, all after the lock;
   *  - the balance can never go below zero (also enforced by a database CHECK).
   * The journal (Dr Accounts Payable / Cr Supplier Advances) is posted through the accounting outbox.
   */
  async applyAdvance(
    supplierId: string,
    tenantId: string,
    userId: string,
    dto: AdvanceRequest & { clientRequestId?: string; notes?: string },
  ) {
    const clientRequestId = normalizeClientRequestId(dto.clientRequestId);
    const exists = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId }, select: { id: true } });
    if (!exists) throw new NotFoundException('Supplier not found');
    const fingerprint = advanceRequestFingerprint(dto);

    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockSupplier(tx, tenantId, supplierId);

      if (clientRequestId) {
        const prior = await tx.supplierAdvanceEntry.findMany({ where: { tenantId, supplierId, clientRequestId, type: 'APPLIED' }, orderBy: { createdAt: 'asc' } });
        if (prior.length) {
          if (decideAdvanceReplay(prior[0].requestFingerprint, fingerprint) === 'CONFLICT') {
            throw new ConflictException('clientRequestId was already used for a different advance application');
          }
          const sup = await tx.supplier.findFirstOrThrow({ where: { id: supplierId, tenantId }, select: { advanceBalance: true, balance: true } });
          return {
            replayed: true as const,
            batchId: prior[0].batchId,
            applied: roundAp(prior.reduce((s, r) => s + Math.abs(r.amount), 0)),
            allocations: prior.map((r) => ({ purchaseId: r.purchaseId, invoiceId: r.invoiceId, amount: roundAp(Math.abs(r.amount)) })),
            advanceBalance: roundAp(sup.advanceBalance),
            outstanding: roundAp(sup.balance),
          };
        }
      }

      const fresh = await tx.supplier.findFirstOrThrow({ where: { id: supplierId, tenantId }, select: { advanceBalance: true } });
      const { lines } = await computeSupplierOutstanding(tx, tenantId, supplierId);
      let plan: ReturnType<typeof planAdvanceApplication>;
      try {
        plan = planAdvanceApplication(lines, dto, fresh.advanceBalance);
      } catch (e) {
        if (e instanceof AdvanceRuleError) throw new BadRequestException(e.message);
        throw e;
      }

      const batchId = randomUUID();
      let running = roundAp(fresh.advanceBalance);
      const rows: { purchaseId: string | null; invoiceId: string | null; amount: number }[] = [];
      for (const a of plan.allocations) {
        let purchaseId: string | null = null;
        let invoiceId: string | null = null;
        if (a.source === 'INVOICE') {
          const inv = await tx.supplierInvoice.findFirst({ where: { id: a.lineId, tenantId, supplierId } });
          if (!inv) throw new BadRequestException('Bill not found for this supplier');
          let next: ReturnType<typeof applyInvoicePayment>;
          try {
            next = applyInvoicePayment(inv.total, inv.paidAmount, a.applied);
          } catch (e) {
            throw new BadRequestException((e as Error).message);
          }
          await tx.supplierInvoice.update({ where: { id: inv.id }, data: { paidAmount: next.paidAmount, status: next.status as SupplierInvoiceStatus } });
          if (inv.purchaseId) await this.bumpPoPaid(tx, tenantId, supplierId, inv.purchaseId, a.applied);
          invoiceId = inv.id;
          purchaseId = inv.purchaseId ?? null;
        } else {
          await this.bumpPoPaid(tx, tenantId, supplierId, a.lineId, a.applied);
          purchaseId = a.lineId;
        }
        running = roundAp(running - a.applied);
        await tx.supplierAdvanceEntry.create({
          data: {
            tenantId,
            supplierId,
            type: 'APPLIED',
            amount: -a.applied,
            balanceAfter: running,
            batchId,
            purchaseId,
            invoiceId,
            clientRequestId,
            requestFingerprint: clientRequestId ? fingerprint : undefined,
            notes: dto.notes?.slice(0, 500) ?? `Advance applied to ${lines.find((l) => l.id === a.lineId)?.docNumber ?? 'bill'}`,
            createdById: userId,
          },
        });
        rows.push({ purchaseId, invoiceId, amount: a.applied });
      }

      // Conditional decrement: never below zero even if something else touched the row.
      const spent = await tx.supplier.updateMany({
        where: { id: supplierId, tenantId, advanceBalance: { gte: plan.total - 0.005 } },
        data: { advanceBalance: { decrement: plan.total } },
      });
      if (spent.count !== 1) throw new BadRequestException('Not enough advance available');
      const after = await tx.supplier.findFirstOrThrow({ where: { id: supplierId, tenantId }, select: { advanceBalance: true } });
      const advanceBalance = roundAp(Math.max(0, after.advanceBalance));

      const outstanding = await syncSupplierBalanceWithLedger(tx, tenantId, supplierId, {
        entryType: SupplierLedgerEntryType.ADJUSTMENT,
        amount: -plan.total,
        referenceType: 'SupplierAdvance',
        referenceId: batchId,
        notes: `Supplier advance: LKR ${plan.total.toFixed(2)} applied to ${rows.length} bill${rows.length > 1 ? 's' : ''}`,
        createdBy: userId,
      });
      return { replayed: false as const, batchId, applied: plan.total, allocations: rows, advanceBalance, outstanding };
    }, { timeout: 30_000, maxWait: 10_000 });

    if (!result.replayed) {
      this.eventEmitter.emit('accounting.supplier-advance.applied', { batchId: result.batchId, tenantId, userId });
    }
    return result;
  }

  /** Runs `fn` in the caller's transaction when there is one, otherwise in a new one. */
  private runTx<T>(ctx: ApTxContext | undefined, fn: (tx: ApTx) => Promise<T>): Promise<T> {
    return ctx?.tx ? fn(ctx.tx) : this.prisma.$transaction(fn);
  }

  /** Fires now, or after the caller's transaction commits (never for a rolled-back payment). */
  private emitAfter(ctx: ApTxContext | undefined, fn: () => void) {
    if (ctx?.tx) (ctx.after ??= []).push(fn);
    else fn();
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
    ctx?: ApTxContext;
    tenantId: string;
    supplierId: string;
    branchId?: string;
    userId: string;
    authorizedById?: string | null;
    method: PaymentMethod;
    uiMethod: string;
    reference?: string;
    notes?: string;
    paidAt: Date;
    allocations: { lineId: string; source: 'PO'; applied: number }[];
    appliedTotal: number;
    /** Excess kept as supplier advance (0 for a normal payment). */
    advance?: number;
    supplierName: string;
    cheque?: {
      chequeNumber: string;
      chequeDueDate: string;
      chequeBankName?: string;
      chequeBankAccountId?: string;
    };
    bankAccountId?: string;
    clientRequestId?: string | null;
    requestFingerprint?: string;
  }) {
    try {
      return await this.runTx(opts.ctx, async (tx) => {
      if (opts.clientRequestId) {
        const replay = await this.findPaymentReplay(tx, opts.tenantId, opts.supplierId, opts.clientRequestId, opts.requestFingerprint!);
        if (replay) return replay;
      }
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId: opts.tenantId,
          supplierId: opts.supplierId,
          purchaseId: opts.allocations[0]?.lineId,
          amount: roundAp(opts.appliedTotal + (opts.advance ?? 0)),
          advanceAmount: opts.advance ?? 0,
          method: opts.method,
          reference: opts.reference,
          notes:
            opts.notes
            ?? (opts.uiMethod === 'CHEQUE' ? 'Paid by cheque' : undefined),
          paidAt: opts.paidAt,
          clientRequestId: opts.clientRequestId ?? undefined,
          requestFingerprint: opts.clientRequestId ? opts.requestFingerprint : undefined,
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
      const advanceBalance = (opts.advance ?? 0) > 0.009
        ? await this.addAdvanceFromPayment(tx, { tenantId: opts.tenantId, supplierId: opts.supplierId, paymentId: payment.id, amount: opts.advance!, userId: opts.userId, outstanding: balanceAfter })
        : null;

      await this.applyTenderOutflow(tx, {
        tenantId: opts.tenantId,
        branchId: opts.branchId,
        userId: opts.userId,
        authorizedById: opts.authorizedById ?? null,
        supplierId: opts.supplierId,
        supplierName: opts.supplierName,
        paymentId: payment.id,
        amount: roundAp(opts.appliedTotal + (opts.advance ?? 0)),
        method: opts.method,
        uiMethod: opts.uiMethod,
        paidAt: opts.paidAt,
        reference: opts.reference ?? payment.reference ?? undefined,
        cheque: opts.cheque,
        bankAccountId: opts.bankAccountId,
      });

      return { payment, allocations: allocationRows, balanceAfter, advanceBalance, replayed: false as const };
      });
    } catch (error) {
      if (opts.clientRequestId && isClientRequestIdConflict(error) && !opts.ctx?.tx) {
        const replay = await this.findPaymentReplay(this.prisma, opts.tenantId, opts.supplierId, opts.clientRequestId, opts.requestFingerprint!);
        if (replay) return replay;
      }
      throw error;
    }
  }

  private async findPaymentReplay(
    db: PrismaService | Prisma.TransactionClient,
    tenantId: string,
    supplierId: string,
    clientRequestId: string,
    requestFingerprint: string,
  ) {
    const existing = await db.supplierPayment.findFirst({
      where: { tenantId, clientRequestId },
      include: {
        allocations: {
          include: {
            purchase: { select: { poNumber: true } },
            invoice: { select: { invoiceNumber: true } },
          },
        },
      },
    });
    if (!existing) return null;
    if (existing.supplierId !== supplierId) {
      throw new ConflictException('clientRequestId was already used for a different supplier payment');
    }
    if (isSupplierPaymentReplay(existing.requestFingerprint, requestFingerprint) === 'CONFLICT') {
      throw new ConflictException('clientRequestId was already used for a different supplier payment');
    }
    const supplier = await db.supplier.findFirstOrThrow({
      where: { id: supplierId, tenantId },
      select: { balance: true, advanceBalance: true },
    });
    const appliedTotal = roundAp(existing.allocations.reduce((sum, allocation) => sum + allocation.amount, 0));
    return {
      payment: existing,
      allocations: existing.allocations,
      appliedTotal,
      advanceAmount: roundAp(existing.advanceAmount),
      advanceBalance: roundAp(supplier.advanceBalance),
      balanceAfter: roundAp(supplier.balance),
      replayed: true as const,
    };
  }

  /**
   * Reduce Cash / Bank registers when AP is paid.
   * GL (Dr AP / Cr Cash|Bank) still posts via accounting outbox — do not post GL here.
   * CASH → Cash on Hand + cash book credit
   * BANK_TRANSFER → Main Bank withdrawal
   * CHEQUE → ISSUED cheque (calendar + cheque hub); bank hits on clear
   */
  private async applyTenderOutflow(
    tx: ApTx,
    opts: {
      tenantId: string;
      branchId?: string;
      userId: string;
      authorizedById?: string | null;
      supplierId: string;
      supplierName: string;
      paymentId: string;
      amount: number;
      method: PaymentMethod;
      uiMethod: string;
      paidAt: Date;
      reference?: string;
      cheque?: {
        chequeNumber: string;
        chequeDueDate: string;
        chequeBankName?: string;
        chequeBankAccountId?: string;
      };
      bankAccountId?: string;
    },
  ) {
    const amount = roundAp(opts.amount);
    if (amount <= 0.009) return;

    const stored = String(opts.method).toUpperCase();
    const ui = String(opts.uiMethod).toUpperCase();
    const isCash = stored === 'CASH';
    const isCheque = ui === 'CHEQUE';
    const isBankTransfer = !isCheque && (stored === 'BANK_TRANSFER' || stored === 'CHEQUE');
    const desc = `Supplier payment — ${opts.supplierName}`;

    if (isCash) {
      await appendCashBookEntryTx(tx, {
        tenantId: opts.tenantId,
        branchId: opts.branchId,
        entryDate: opts.paidAt,
        type: 'SUPPLIER_PAYMENT',
        description: desc,
        debit: 0,
        credit: amount,
        paymentMethod: PaymentMethod.CASH,
        referenceType: 'SupplierPayment',
        referenceId: opts.paymentId,
        createdBy: opts.userId,
      });

      // POS / counter: paid out of this cashier's open wallet; main cash only receives what is left at clear
      const walletMovement = await recordSupplierCashOutflow(tx, {
        tenantId: opts.tenantId,
        branchId: opts.branchId,
        cashierId: opts.userId,
        paymentId: opts.paymentId,
        amount,
        description: desc,
        authorizedById: opts.authorizedById ?? null,
      });

      const cashAcct = walletMovement
        ? null
        : await this.resolveTenderBankAccount(tx, opts.tenantId, 'CASH');
      if (cashAcct) {
        await tx.bankTransaction.create({
          data: {
            tenantId: opts.tenantId,
            bankAccountId: cashAcct.id,
            type: BankTxnType.WITHDRAWAL,
            status: BankTxnStatus.CLEARED,
            amount,
            txnDate: opts.paidAt,
            reference: opts.reference,
            description: desc,
            createdBy: opts.userId,
          },
        });
        await tx.bankAccount.update({
          where: { id: cashAcct.id },
          data: { currentBalance: { decrement: amount } },
        });
      }
      return;
    }

    if (isCheque) {
      const chequeNumber =
        (opts.cheque?.chequeNumber || opts.reference || '').trim()
        || `SP-${opts.paymentId.slice(0, 8).toUpperCase()}`;
      let bankAccountId = opts.cheque?.chequeBankAccountId || opts.bankAccountId;
      let selectedBank: { id: string; name: string; bankName: string | null } | null = null;
      if (bankAccountId) {
        selectedBank = await tx.bankAccount.findFirst({
          where: { id: bankAccountId, tenantId: opts.tenantId, isActive: true },
          select: { id: true, name: true, bankName: true },
        });
        if (!selectedBank) bankAccountId = undefined;
      }
      if (!bankAccountId) {
        const fallback = await this.resolveTenderBankAccount(tx, opts.tenantId, 'BANK');
        bankAccountId = fallback?.id;
        selectedBank = fallback
          ? { id: fallback.id, name: fallback.name, bankName: fallback.bankName }
          : null;
      }
      await tx.cheque.create({
        data: {
          tenantId: opts.tenantId,
          direction: ChequeDirection.ISSUED,
          status: ChequeStatus.ISSUED,
          chequeNumber,
          amount,
          bankName:
            opts.cheque?.chequeBankName
            || selectedBank?.bankName
            || selectedBank?.name
            || undefined,
          issueDate: opts.paidAt,
          dueDate: opts.cheque?.chequeDueDate
            ? new Date(opts.cheque.chequeDueDate)
            : undefined,
          partyType: 'SUPPLIER',
          partyId: opts.supplierId,
          partyName: opts.supplierName,
          bankAccountId,
          notes: chequeSourceNotes('SupplierPayment', opts.paymentId, 'Paid by cheque'),
          createdBy: opts.userId,
        },
      });
      return;
    }

    if (!isBankTransfer) return;

    let bankAcct = opts.bankAccountId
      ? await tx.bankAccount.findFirst({
          where: { id: opts.bankAccountId, tenantId: opts.tenantId, isActive: true },
        })
      : null;
    if (!bankAcct) {
      bankAcct = await this.resolveTenderBankAccount(tx, opts.tenantId, 'BANK');
    }
    if (!bankAcct) return;

    await tx.bankTransaction.create({
      data: {
        tenantId: opts.tenantId,
        bankAccountId: bankAcct.id,
        type: BankTxnType.WITHDRAWAL,
        status: BankTxnStatus.CLEARED,
        amount,
        txnDate: opts.paidAt,
        reference: opts.reference,
        description: desc,
        createdBy: opts.userId,
      },
    });
    await tx.bankAccount.update({
      where: { id: bankAcct.id },
      data: { currentBalance: { decrement: amount } },
    });
  }

  private async resolveTenderBankAccount(
    tx: ApTx,
    tenantId: string,
    tender: 'CASH' | 'BANK',
  ) {
    if (tender === 'CASH') {
      return (
        (await tx.bankAccount.findFirst({
          where: { tenantId, isActive: true, code: 'CASH-01' },
        }))
        ?? (await tx.bankAccount.findFirst({
          where: { tenantId, isActive: true, type: BankAccountType.CASH_IN_HAND },
          orderBy: { code: 'asc' },
        }))
      );
    }
    return (
      (await tx.bankAccount.findFirst({
        where: { tenantId, isActive: true, code: 'BANK-01' },
      }))
      ?? (await tx.bankAccount.findFirst({
        where: { tenantId, isActive: true, type: BankAccountType.CURRENT },
        orderBy: { code: 'asc' },
      }))
    );
  }

  private async bumpPoPaid(
    tx: Parameters<typeof syncSupplierBalanceWithLedger>[0],
    tenantId: string,
    supplierId: string,
    purchaseId: string,
    applied: number,
  ) {
    // Serialize all allocations for this PO before calculating its remaining balance.
    // Without the row lock, concurrent payments can both observe the same balance.
    await tx.$queryRaw`
      SELECT id FROM "purchase_orders"
      WHERE id = ${purchaseId} AND "tenantId" = ${tenantId} AND "supplierId" = ${supplierId}
      FOR UPDATE
    `;
    const po = await tx.purchaseOrder.findFirst({
      where: { id: purchaseId, tenantId, supplierId },
      include: { items: { select: { receivedQty: true, unitCost: true } } },
    });
    if (!po) throw new BadRequestException('Purchase order not found for this supplier');
    if ((po.status as string) === 'CLOSED') {
      throw new BadRequestException(`Purchase order ${po.poNumber} is already closed`);
    }
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
    const goodsReceived = receivedValue > 0.01;
    let nextStatus = po.status;
    if (goodsReceived) {
      if (fullyPaid) {
        nextStatus = 'CLOSED' as PurchaseOrderStatus;
      } else if (po.status === PurchaseOrderStatus.PARTIALLY_RECEIVED) {
        nextStatus = PurchaseOrderStatus.PARTIALLY_RECEIVED;
      } else if (
        po.status === PurchaseOrderStatus.RECEIVED
        || (po.status as string) === 'CLOSED'
      ) {
        nextStatus = PurchaseOrderStatus.RECEIVED;
      } else {
        nextStatus = PurchaseOrderStatus.RECEIVED;
      }
    }
    // Advance / pay-on-create: keep DRAFT/SENT/CONFIRMED until goods are received.
    await tx.purchaseOrder.update({
      where: { id: po.id },
      data: {
        paidAmount: nextPaid,
        status: nextStatus,
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
