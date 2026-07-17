import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  BankAccountType,
  BankReconciliationStatus,
  BankTxnStatus,
  BankTxnType,
  ChequeDirection,
  ChequeStatus,
  PaymentMethod,
  PurchaseOrderStatus,
  RoleType,
  SupplierInvoiceStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import {
  assertDistinctTransferAccounts,
  buildAgingReport,
  cashBookRunningBalance,
  chequeClearEffect,
  assertChequeStatusTransition,
  chequeSourceNotes,
  computeProfitLoss,
  bankBookRunningBalance,
  bankReconDifference,
  bankTxnBalanceDelta,
  round2,
} from './finance.helper';
import { FinancialPeriodsService } from './financial-periods.service';
import { JournalEntriesService } from './journal-entries.service';
import * as dayjs from 'dayjs';

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalEntriesService,
    private readonly periods: FinancialPeriodsService,
  ) {}

  // ── AP / AR with aging ────────────────────────────────────────────

  async getAccountsPayableAging(tenantId: string, asOfDate?: string) {
    const asOf = asOfDate ? dayjs(asOfDate).endOf('day').toDate() : new Date();

    const [invoices, pos] = await Promise.all([
      this.prisma.supplierInvoice.findMany({
        where: {
          tenantId,
          status: { in: [SupplierInvoiceStatus.POSTED, SupplierInvoiceStatus.PARTIALLY_PAID] },
        },
        include: { supplier: { select: { id: true, name: true, creditDays: true } } },
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          tenantId,
          status: {
            in: [
              PurchaseOrderStatus.RECEIVED,
              PurchaseOrderStatus.PARTIALLY_RECEIVED,
              PurchaseOrderStatus.CONFIRMED,
              PurchaseOrderStatus.SENT,
            ],
          },
        },
        include: { supplier: { select: { id: true, name: true, creditDays: true } } },
      }),
    ]);

    const invoiceLines = invoices
      .map((inv) => {
        const due = Math.max(0, inv.total - inv.paidAmount);
        const dueDate =
          inv.dueDate
          ?? dayjs(inv.invoiceDate).add(inv.supplier.creditDays || 30, 'day').toDate();
        return {
          id: inv.id,
          partyName: inv.supplier.name,
          amount: due,
          asOfDate: asOf,
          dueOrRefDate: dueDate,
          source: 'INVOICE' as const,
          docNumber: inv.invoiceNumber,
        };
      })
      .filter((l) => l.amount > 0.01);

    // POs without linked unpaid invoices still contribute (avoid double-count if invoice covers PO)
    const invoicedPoIds = new Set(invoices.filter((i) => i.purchaseId).map((i) => i.purchaseId!));
    const poLines = pos
      .filter((po) => !invoicedPoIds.has(po.id))
      .map((po) => {
        const due = Math.max(0, po.total - po.paidAmount);
        const dueDate = dayjs(po.orderDate).add(po.supplier.creditDays || 30, 'day').toDate();
        return {
          id: po.id,
          partyName: po.supplier.name,
          amount: due,
          asOfDate: asOf,
          dueOrRefDate: dueDate,
          source: 'PO' as const,
          docNumber: po.poNumber,
        };
      })
      .filter((l) => l.amount > 0.01);

    const aging = buildAgingReport([...invoiceLines, ...poLines], asOf);
    // Prefer document-derived AP total over stale Supplier.balance cache
    const supplierBalanceTotal = round2(
      invoiceLines.reduce((s, l) => s + l.amount, 0) + poLines.reduce((s, l) => s + l.amount, 0),
    );

    return {
      asOf: asOf.toISOString(),
      ...aging,
      lines: aging.lines.map((l) => {
        const meta = [...invoiceLines, ...poLines].find((x) => x.id === l.id);
        return { ...l, source: meta?.source, docNumber: meta?.docNumber };
      }),
      supplierBalanceTotal,
      purchaseOrderDueTotal: poLines.reduce((s, l) => s + l.amount, 0),
      invoiceDueTotal: invoiceLines.reduce((s, l) => s + l.amount, 0),
    };
  }

  async getAccountsReceivableAging(tenantId: string, asOfDate?: string) {
    const asOf = asOfDate ? dayjs(asOfDate).endOf('day').toDate() : new Date();
    const customers = await this.prisma.customer.findMany({
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
        lastPurchaseAt: true,
        createdAt: true,
      },
    });

    const openCharges = await this.prisma.customerCreditTransaction.findMany({
      where: {
        tenantId,
        type: 'CHARGE',
        status: { in: ['OPEN', 'PARTIAL'] },
        customerId: { in: customers.map((c) => c.id) },
      },
      select: {
        id: true,
        customerId: true,
        dueDate: true,
        createdAt: true,
        amount: true,
        paidAmount: true,
        description: true,
        referenceId: true,
        status: true,
      },
    });
    const earliestDue = new Map<string, Date>();
    for (const ch of openCharges) {
      const due = ch.dueDate ?? ch.createdAt;
      const prev = earliestDue.get(ch.customerId);
      if (!prev || due < prev) earliestDue.set(ch.customerId, due);
    }

    const lines = customers.map((c) => ({
      id: c.id,
      partyName: `${c.firstName} ${c.lastName}`.trim(),
      amount: c.creditBalance,
      asOfDate: asOf,
      dueOrRefDate:
        earliestDue.get(c.id)
        ?? (c.lastPurchaseAt
          ? dayjs(c.lastPurchaseAt).add(c.creditDays || 30, 'day').toDate()
          : c.createdAt),
    }));

    const chargeAgingLines = openCharges.map((ch) => {
      const c = customers.find((x) => x.id === ch.customerId)!;
      return {
        id: ch.id,
        partyName: `${c.firstName} ${c.lastName}`.trim(),
        amount: round2(ch.amount - ch.paidAmount),
        asOfDate: asOf,
        dueOrRefDate: ch.dueDate ?? ch.createdAt,
        customerId: ch.customerId,
        description: ch.description,
        referenceId: ch.referenceId,
        status: ch.status,
      };
    });

    const aging = buildAgingReport(lines, asOf);
    const chargeAging = buildAgingReport(chargeAgingLines, asOf);
    return {
      asOf: asOf.toISOString(),
      ...aging,
      chargeAging: {
        buckets: chargeAging.buckets,
        total: chargeAging.total,
        lines: chargeAging.lines.map((l) => {
          const src = chargeAgingLines.find((x) => x.id === l.id);
          return { ...l, ...src };
        }),
      },
      customers: aging.lines.map((l) => {
        const c = customers.find((x) => x.id === l.id)!;
        return {
          ...l,
          code: c.code,
          firstName: c.firstName,
          lastName: c.lastName,
          phone: c.phone,
          creditLimit: c.creditLimit,
          creditBalance: c.creditBalance,
          creditDays: c.creditDays,
          nextDueDate: earliestDue.get(c.id)?.toISOString() ?? null,
        };
      }),
    };
  }

  // ── Improved P&L ──────────────────────────────────────────────────

  async getEnhancedProfitLoss(tenantId: string, startDate: string, endDate: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const saleWhere = { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' as const } };

    const [revenue, expenses, returns, saleItems, expenseRows, paymentBreakdown] = await Promise.all([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _sum: { total: true, taxAmount: true, discountAmount: true, subtotal: true },
        _count: { _all: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, date: dateRange },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.return.aggregate({
        where: {
          tenantId,
          createdAt: dateRange,
          status: { in: ['APPROVED', 'COMPLETED', 'REFUND_PROCESSED'] },
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.saleItem.findMany({
        where: { sale: saleWhere },
        select: { quantity: true, costPrice: true, total: true },
      }),
      this.prisma.expense.findMany({
        where: { tenantId, date: dateRange },
        select: { categoryId: true, amount: true },
      }),
      this.prisma.salePayment.groupBy({
        by: ['method'],
        where: { sale: saleWhere },
        _sum: { amount: true },
      }).catch(() => [] as { method: PaymentMethod; _sum: { amount: number | null } }[]),
    ]);

    const grossRevenue = revenue._sum?.total ?? 0;
    const totalReturns = returns._sum?.refundAmount ?? 0;
    const cogs = saleItems.reduce((s, i) => s + i.costPrice * i.quantity, 0);
    const expenseTotal = expenses._sum?.amount ?? 0;
    const pl = computeProfitLoss({
      grossRevenue,
      returns: totalReturns,
      cogs,
      expenses: expenseTotal,
    });

    const byCategory: Record<string, number> = {};
    for (const e of expenseRows) {
      const cat = e.categoryId ?? 'Uncategorized';
      byCategory[cat] = (byCategory[cat] ?? 0) + e.amount;
    }

    return {
      period: { startDate, endDate },
      revenue: {
        gross: round2(grossRevenue),
        subtotal: round2(revenue._sum?.subtotal ?? 0),
        tax: round2(revenue._sum?.taxAmount ?? 0),
        discounts: round2(revenue._sum?.discountAmount ?? 0),
        returns: round2(totalReturns),
        net: pl.netRevenue,
      },
      costOfGoodsSold: round2(cogs),
      grossProfit: pl.grossProfit,
      grossMarginPct: pl.grossMarginPct,
      expenses: {
        total: pl.operatingExpenses,
        count: expenses._count?._all ?? 0,
        byCategory: Object.entries(byCategory)
          .map(([name, amount]) => ({ name, amount: round2(amount) }))
          .sort((a, b) => b.amount - a.amount),
      },
      netProfit: pl.netProfit,
      netMarginPct: pl.netMarginPct,
      profitMargin: String(pl.netMarginPct),
      salesCount: revenue._count?._all ?? 0,
      paymentsByMethod: (paymentBreakdown as { method: string; _sum: { amount: number | null } }[]).map((p) => ({
        method: p.method,
        amount: round2(p._sum.amount ?? 0),
      })),
      formula: 'Net Revenue = Sales − Returns; Gross Profit = Net Revenue − COGS; Net Profit = Gross Profit − Expenses',
    };
  }

  // ── Cash Book ─────────────────────────────────────────────────────

  async getCashBook(tenantId: string, branchId: string, startDate: string, endDate: string) {
    const from = dayjs(startDate).startOf('day').toDate();
    const to = dayjs(endDate).endOf('day').toDate();

    // Prefer persisted cash book entries; fall back to synthesized from sales/expenses/cash movements
    const stored = await this.prisma.cashBookEntry.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
        entryDate: { gte: from, lte: to },
      },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
    });

    if (stored.length) {
      const opening = stored[0].balanceAfter - stored[0].debit + stored[0].credit;
      const { closing } = cashBookRunningBalance(opening, stored);
      return {
        source: 'ledger' as const,
        opening: round2(opening),
        closing,
        entries: stored,
      };
    }

    const [sales, expenseRows, movements] = await Promise.all([
      this.prisma.sale.findMany({
        where: {
          tenantId,
          ...(branchId && { branchId }),
          invoiceDate: { gte: from, lte: to },
          status: { not: 'CANCELLED' },
        },
        select: { id: true, invoiceNumber: true, total: true, invoiceDate: true },
        orderBy: { invoiceDate: 'asc' },
      }),
      this.prisma.expense.findMany({
        where: { tenantId, ...(branchId && { branchId }), date: { gte: from, lte: to } },
        orderBy: { date: 'asc' },
      }),
      this.prisma.cashMovement.findMany({
        where: {
          register: { tenantId, ...(branchId ? { branchId } : {}) },
          createdAt: { gte: from, lte: to },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    type Synth = { entryDate: Date; type: string; description: string; debit: number; credit: number; referenceId?: string };
    const synth: Synth[] = [];
    for (const s of sales) {
      synth.push({
        entryDate: s.invoiceDate,
        type: 'SALE',
        description: `Sale ${s.invoiceNumber}`,
        debit: s.total,
        credit: 0,
        referenceId: s.id,
      });
    }
    for (const e of expenseRows) {
      synth.push({
        entryDate: e.date,
        type: 'EXPENSE',
        description: e.description,
        debit: 0,
        credit: e.amount,
        referenceId: e.id,
      });
    }
    for (const m of movements) {
      const isIn = ['OPENING', 'SALE', 'DEPOSIT', 'REFUND'].includes(m.type);
      synth.push({
        entryDate: m.createdAt,
        type: `CASH_${m.type}`,
        description: m.description || m.reference || m.type,
        debit: isIn ? Math.abs(m.amount) : 0,
        credit: isIn ? 0 : Math.abs(m.amount),
        referenceId: m.id,
      });
    }
    synth.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());

    const opening = 0;
    const { balances, closing } = cashBookRunningBalance(opening, synth);
    return {
      source: 'synthesized' as const,
      opening,
      closing,
      entries: synth.map((e, i) => ({ ...e, balanceAfter: balances[i] })),
    };
  }

  async appendCashBookEntry(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: {
      entryDate?: string;
      type: string;
      description: string;
      debit?: number;
      credit?: number;
      paymentMethod?: PaymentMethod;
      referenceType?: string;
      referenceId?: string;
      /** Optional CoA contra for GL posting (cash side auto-resolved) */
      contraGlAccountId?: string;
      postToGl?: boolean;
    },
  ) {
    const debit = dto.debit ?? 0;
    const credit = dto.credit ?? 0;
    if (debit < 0 || credit < 0) throw new BadRequestException('Amounts cannot be negative');
    if (debit <= 0 && credit <= 0) throw new BadRequestException('Enter a debit or credit amount');
    if (debit > 0 && credit > 0) throw new BadRequestException('Use either debit or credit, not both');

    const entryDate = dto.entryDate ? new Date(dto.entryDate) : new Date();
    await this.periods.assertDateInOpenPeriod(tenantId, entryDate);

    const last = await this.prisma.cashBookEntry.findFirst({
      where: { tenantId, ...(branchId && { branchId }) },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
    const prev = last?.balanceAfter ?? 0;
    const balanceAfter = round2(prev + debit - credit);

    const entry = await this.prisma.cashBookEntry.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        entryDate,
        type: dto.type,
        description: dto.description,
        debit,
        credit,
        balanceAfter,
        paymentMethod: dto.paymentMethod,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        createdBy: userId,
      },
    });

    let journalEntryId: string | null = null;
    if (dto.postToGl !== false) {
      const cashGlId = await this.resolveCashGlAccountId(tenantId);
      const contraId = dto.contraGlAccountId;
      if (cashGlId && contraId && cashGlId !== contraId) {
        const amount = debit > 0 ? debit : credit;
        const glLines =
          debit > 0
            ? [
                { accountId: cashGlId, side: 'DEBIT' as const, amount },
                { accountId: contraId, side: 'CREDIT' as const, amount },
              ]
            : [
                { accountId: contraId, side: 'DEBIT' as const, amount },
                { accountId: cashGlId, side: 'CREDIT' as const, amount },
              ];
        const je = await this.journals.create(tenantId, branchId, userId, SYSTEM_ROLES, {
          description: `Cash book: ${dto.description}`,
          date: entryDate.toISOString().slice(0, 10),
          referenceType: 'CASH_BOOK',
          referenceId: entry.id,
          action: 'POST',
          glLines,
        });
        journalEntryId = je.id;
      }
    }

    return { ...entry, journalEntryId };
  }

  // ── Bank Accounts ─────────────────────────────────────────────────

  private async resolveCashGlAccountId(tenantId: string): Promise<string | null> {
    const cashBank = await this.prisma.bankAccount.findFirst({
      where: {
        tenantId,
        isActive: true,
        type: { in: [BankAccountType.CASH_IN_HAND, BankAccountType.PETTY_CASH] },
        glAccountId: { not: null },
      },
      orderBy: { code: 'asc' },
    });
    if (cashBank?.glAccountId) return cashBank.glAccountId;

    const byCode = await this.prisma.account.findFirst({
      where: { tenantId, isActive: true, code: { in: ['1100', '1110', '1001'] } },
      orderBy: { code: 'asc' },
    });
    return byCode?.id ?? null;
  }

  async listBankAccounts(tenantId: string, includeInactive = false) {
    return this.prisma.bankAccount.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { code: 'asc' },
    });
  }

  async getBankAccount(tenantId: string, id: string) {
    const account = await this.prisma.bankAccount.findFirst({ where: { id, tenantId } });
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  async createBankAccount(
    tenantId: string,
    branchId: string,
    dto: {
      code: string;
      name: string;
      type?: BankAccountType;
      bankName?: string;
      accountNumber?: string;
      openingBalance?: number;
      currency?: string;
      notes?: string;
      glAccountId?: string;
    },
  ) {
    if (dto.glAccountId) {
      const gl = await this.prisma.account.findFirst({
        where: { id: dto.glAccountId, tenantId, isActive: true },
      });
      if (!gl) throw new BadRequestException('GL account not found');
    }
    const opening = dto.openingBalance ?? 0;
    return this.prisma.bankAccount.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        code: dto.code,
        name: dto.name,
        type: dto.type ?? BankAccountType.CURRENT,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        openingBalance: opening,
        currentBalance: opening,
        currency: dto.currency ?? 'LKR',
        notes: dto.notes,
        glAccountId: dto.glAccountId,
      },
    });
  }

  async updateBankAccount(
    tenantId: string,
    id: string,
    dto: {
      name?: string;
      bankName?: string;
      accountNumber?: string;
      notes?: string;
      glAccountId?: string | null;
      isActive?: boolean;
    },
  ) {
    await this.getBankAccount(tenantId, id);
    if (dto.glAccountId) {
      const gl = await this.prisma.account.findFirst({
        where: { id: dto.glAccountId, tenantId, isActive: true },
      });
      if (!gl) throw new BadRequestException('GL account not found');
    }
    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName }),
        ...(dto.accountNumber !== undefined && { accountNumber: dto.accountNumber }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.glAccountId !== undefined && { glAccountId: dto.glAccountId }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async getBankBook(
    tenantId: string,
    bankAccountId: string,
    startDate: string,
    endDate: string,
  ) {
    const account = await this.getBankAccount(tenantId, bankAccountId);
    const from = dayjs(startDate).startOf('day').toDate();
    const to = dayjs(endDate).endOf('day').toDate();

    const priorTxns = await this.prisma.bankTransaction.findMany({
      where: {
        tenantId,
        bankAccountId,
        status: { in: [BankTxnStatus.CLEARED, BankTxnStatus.PENDING] },
        txnDate: { lt: from },
      },
      select: { type: true, amount: true, chequeId: true },
    });

    const priorChequeIds = priorTxns
      .filter((t) => t.type === BankTxnType.CHEQUE_CLEAR && t.chequeId)
      .map((t) => t.chequeId!);
    const priorCheques = priorChequeIds.length
      ? await this.prisma.cheque.findMany({ where: { id: { in: priorChequeIds } } })
      : [];
    const chequeDir = new Map(
      priorCheques.map((c) => [
        c.id,
        c.direction === ChequeDirection.RECEIVED ? ('RECEIVED' as const) : ('ISSUED' as const),
      ]),
    );

    let opening = account.openingBalance;
    for (const t of priorTxns) {
      if (t.type === BankTxnType.CHEQUE_CLEAR && t.chequeId && chequeDir.has(t.chequeId)) {
        opening = round2(opening + chequeClearEffect(chequeDir.get(t.chequeId)!, t.amount).bankDelta);
      } else if (t.type !== BankTxnType.CHEQUE_CLEAR) {
        opening = round2(opening + bankTxnBalanceDelta(t.type, t.amount));
      }
    }

    const inRange = await this.prisma.bankTransaction.findMany({
      where: {
        tenantId,
        bankAccountId,
        status: { not: BankTxnStatus.VOID },
        txnDate: { gte: from, lte: to },
      },
      orderBy: [{ txnDate: 'asc' }, { createdAt: 'asc' }],
    });

    const rangeChequeIds = inRange
      .filter((t) => t.type === BankTxnType.CHEQUE_CLEAR && t.chequeId)
      .map((t) => t.chequeId!);
    const rangeCheques = rangeChequeIds.length
      ? await this.prisma.cheque.findMany({ where: { id: { in: rangeChequeIds } } })
      : [];
    for (const c of rangeCheques) {
      chequeDir.set(
        c.id,
        c.direction === ChequeDirection.RECEIVED ? 'RECEIVED' : 'ISSUED',
      );
    }

    const rows = inRange.map((t) => {
      let inflow = ['DEPOSIT', 'TRANSFER_IN', 'INTEREST'].includes(t.type);
      let signed = bankTxnBalanceDelta(t.type, t.amount);
      if (t.type === BankTxnType.CHEQUE_CLEAR && t.chequeId && chequeDir.has(t.chequeId)) {
        signed = chequeClearEffect(chequeDir.get(t.chequeId)!, t.amount).bankDelta;
        inflow = signed >= 0;
      }
      return { ...t, inflow, signedAmount: signed };
    });

    const { balances, closing } = bankBookRunningBalance(
      opening,
      rows.map((r) => ({ amount: Math.abs(r.signedAmount), inflow: r.inflow })),
    );

    return {
      account,
      opening: round2(opening),
      closing,
      entries: rows.map((r, i) => ({ ...r, balanceAfter: balances[i] })),
    };
  }

  async postBankTransaction(
    tenantId: string,
    userId: string,
    branchId: string,
    dto: {
      bankAccountId: string;
      type: BankTxnType;
      amount: number;
      txnDate?: string;
      reference?: string;
      description?: string;
      status?: BankTxnStatus;
      contraGlAccountId?: string;
      postToGl?: boolean;
    },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    if (dto.type === BankTxnType.TRANSFER_IN || dto.type === BankTxnType.TRANSFER_OUT) {
      throw new BadRequestException('Use /bank-transfers for inter-account transfers');
    }

    const account = await this.prisma.bankAccount.findFirst({
      where: { id: dto.bankAccountId, tenantId, isActive: true },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const txnDate = dto.txnDate ? new Date(dto.txnDate) : new Date();
    await this.periods.assertDateInOpenPeriod(tenantId, txnDate);

    const skipBalance = dto.type === BankTxnType.CHEQUE_CLEAR;
    const signed = bankTxnBalanceDelta(dto.type, dto.amount);
    const status = dto.status ?? BankTxnStatus.CLEARED;

    const txn = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: account.id,
          type: dto.type,
          status,
          amount: dto.amount,
          txnDate,
          reference: dto.reference,
          description: dto.description,
          createdBy: userId,
        },
      });
      if (!skipBalance && status === BankTxnStatus.CLEARED) {
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { currentBalance: { increment: signed } },
        });
      }
      return created;
    });

    let journalEntryId: string | null = null;
    if (dto.postToGl !== false && account.glAccountId && status === BankTxnStatus.CLEARED) {
      let contra = dto.contraGlAccountId;
      if (!contra) {
        contra = (await this.resolveCashGlAccountId(tenantId)) ?? undefined;
      }
      if (contra && contra !== account.glAccountId) {
        const inflow = signed > 0;
        const glLines = inflow
          ? [
              { accountId: account.glAccountId, side: 'DEBIT' as const, amount: dto.amount },
              { accountId: contra, side: 'CREDIT' as const, amount: dto.amount },
            ]
          : [
              { accountId: contra, side: 'DEBIT' as const, amount: dto.amount },
              { accountId: account.glAccountId, side: 'CREDIT' as const, amount: dto.amount },
            ];
        const je = await this.journals.create(tenantId, branchId, userId, SYSTEM_ROLES, {
          description: dto.description || `Bank ${dto.type} ${account.code}`,
          date: txnDate.toISOString().slice(0, 10),
          referenceType: 'BANK_TXN',
          referenceId: txn.id,
          action: 'POST',
          glLines,
        });
        journalEntryId = je.id;
      }
    }

    return { ...txn, journalEntryId };
  }

  async transferBetweenAccounts(
    tenantId: string,
    userId: string,
    branchId: string,
    dto: {
      fromAccountId: string;
      toAccountId: string;
      amount: number;
      txnDate?: string;
      reference?: string;
      description?: string;
      postToGl?: boolean;
    },
  ) {
    assertDistinctTransferAccounts(dto.fromAccountId, dto.toAccountId);
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');

    const [from, to] = await Promise.all([
      this.prisma.bankAccount.findFirst({ where: { id: dto.fromAccountId, tenantId, isActive: true } }),
      this.prisma.bankAccount.findFirst({ where: { id: dto.toAccountId, tenantId, isActive: true } }),
    ]);
    if (!from || !to) throw new NotFoundException('Bank account not found');
    if (from.currentBalance + 0.001 < dto.amount) {
      throw new BadRequestException(
        `Insufficient balance in ${from.code} (available LKR ${from.currentBalance.toFixed(2)})`,
      );
    }

    const txnDate = dto.txnDate ? new Date(dto.txnDate) : new Date();
    await this.periods.assertDateInOpenPeriod(tenantId, txnDate);
    const desc = dto.description || `Transfer ${from.code} → ${to.code}`;
    const transferKey = `xfer-${Date.now().toString(36)}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const outTxn = await tx.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: from.id,
          type: BankTxnType.TRANSFER_OUT,
          status: BankTxnStatus.CLEARED,
          amount: dto.amount,
          txnDate,
          reference: dto.reference || transferKey,
          description: desc,
          createdBy: userId,
        },
      });
      const inTxn = await tx.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: to.id,
          type: BankTxnType.TRANSFER_IN,
          status: BankTxnStatus.CLEARED,
          amount: dto.amount,
          txnDate,
          reference: dto.reference || transferKey,
          description: desc,
          createdBy: userId,
        },
      });
      await tx.bankAccount.update({
        where: { id: from.id },
        data: { currentBalance: { decrement: dto.amount } },
      });
      await tx.bankAccount.update({
        where: { id: to.id },
        data: { currentBalance: { increment: dto.amount } },
      });
      return { outTxn, inTxn, transferKey };
    });

    let journalEntryId: string | null = null;
    if (dto.postToGl !== false && from.glAccountId && to.glAccountId && from.glAccountId !== to.glAccountId) {
      const je = await this.journals.create(tenantId, branchId, userId, SYSTEM_ROLES, {
        description: desc,
        date: txnDate.toISOString().slice(0, 10),
        referenceType: 'BANK_TRANSFER',
        referenceId: result.transferKey,
        action: 'POST',
        glLines: [
          { accountId: to.glAccountId, side: 'DEBIT', amount: dto.amount },
          { accountId: from.glAccountId, side: 'CREDIT', amount: dto.amount },
        ],
      });
      journalEntryId = je.id;
    }

    return { ...result, journalEntryId };
  }

  async listBankTransactions(tenantId: string, bankAccountId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = { tenantId, bankAccountId };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({ where, skip, take, orderBy: { txnDate: 'desc' } }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 50);
  }

  // ── Cheques ───────────────────────────────────────────────────────

  async createCheque(
    tenantId: string,
    userId: string,
    dto: {
      direction: ChequeDirection;
      chequeNumber: string;
      amount: number;
      bankName?: string;
      issueDate?: string;
      dueDate?: string;
      partyType?: string;
      partyId?: string;
      partyName?: string;
      bankAccountId?: string;
      notes?: string;
      sourceType?: string;
      sourceId?: string;
    },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Cheque amount must be positive');
    if (!dto.chequeNumber?.trim()) throw new BadRequestException('Cheque number is required');
    const status = dto.direction === ChequeDirection.RECEIVED ? ChequeStatus.RECEIVED : ChequeStatus.ISSUED;
    const notes = dto.sourceType && dto.sourceId
      ? chequeSourceNotes(dto.sourceType, dto.sourceId, dto.notes)
      : dto.notes;
    return this.prisma.cheque.create({
      data: {
        tenantId,
        direction: dto.direction,
        status,
        chequeNumber: dto.chequeNumber.trim(),
        amount: dto.amount,
        bankName: dto.bankName,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        partyType: dto.partyType,
        partyId: dto.partyId,
        partyName: dto.partyName,
        bankAccountId: dto.bankAccountId,
        notes,
        createdBy: userId,
      },
      include: { bankAccount: { select: { id: true, name: true, code: true } } },
    });
  }

  async listCheques(
    tenantId: string,
    query: PaginationDto & {
      status?: ChequeStatus;
      direction?: ChequeDirection;
      search?: string;
    },
  ) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.status && { status: query.status }),
      ...(query.direction && { direction: query.direction }),
      ...(query.search && {
        OR: [
          { chequeNumber: { contains: query.search, mode: 'insensitive' as const } },
          { partyName: { contains: query.search, mode: 'insensitive' as const } },
          { bankName: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.cheque.findMany({
        where,
        skip,
        take,
        include: { bankAccount: { select: { id: true, name: true, code: true } } },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.cheque.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 100);
  }

  async getChequeDashboard(tenantId: string) {
    const now = new Date();
    const in7 = dayjs().add(7, 'day').endOf('day').toDate();
    const openStatuses: ChequeStatus[] = [
      ChequeStatus.RECEIVED,
      ChequeStatus.ISSUED,
      ChequeStatus.DEPOSITED,
    ];

    const [allOpen, overdue, dueSoon, bounced, cleared, receivedOpen, issuedOpen] = await Promise.all([
      this.prisma.cheque.findMany({
        where: { tenantId, status: { in: openStatuses } },
        select: { amount: true, direction: true, status: true, dueDate: true },
      }),
      this.prisma.cheque.count({
        where: {
          tenantId,
          status: { in: openStatuses },
          dueDate: { lt: now },
        },
      }),
      this.prisma.cheque.count({
        where: {
          tenantId,
          status: { in: openStatuses },
          dueDate: { gte: now, lte: in7 },
        },
      }),
      this.prisma.cheque.count({ where: { tenantId, status: ChequeStatus.BOUNCED } }),
      this.prisma.cheque.count({ where: { tenantId, status: ChequeStatus.CLEARED } }),
      this.prisma.cheque.aggregate({
        where: { tenantId, direction: ChequeDirection.RECEIVED, status: { in: openStatuses } },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.cheque.aggregate({
        where: { tenantId, direction: ChequeDirection.ISSUED, status: { in: openStatuses } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const outstandingAmount = allOpen.reduce((s, c) => s + c.amount, 0);
    return {
      outstandingCount: allOpen.length,
      outstandingAmount: round2(outstandingAmount),
      overdueCount: overdue,
      dueSoonCount: dueSoon,
      bouncedCount: bounced,
      clearedCount: cleared,
      receivedOpen: {
        count: receivedOpen._count,
        amount: round2(receivedOpen._sum.amount ?? 0),
      },
      issuedOpen: {
        count: issuedOpen._count,
        amount: round2(issuedOpen._sum.amount ?? 0),
      },
    };
  }

  async updateChequeStatus(
    id: string,
    tenantId: string,
    userId: string,
    branchId: string,
    status: ChequeStatus,
    bankAccountId?: string,
  ) {
    const cheque = await this.prisma.cheque.findFirst({ where: { id, tenantId } });
    if (!cheque) throw new NotFoundException('Cheque not found');

    assertChequeStatusTransition(
      cheque.direction === ChequeDirection.RECEIVED ? 'RECEIVED' : 'ISSUED',
      cheque.status,
      status,
    );

    if (status === ChequeStatus.CLEARED) {
      const accountId = bankAccountId || cheque.bankAccountId;
      if (!accountId) throw new BadRequestException('Select a bank account to clear this cheque');
      const account = await this.prisma.bankAccount.findFirst({
        where: { id: accountId, tenantId, isActive: true },
      });
      if (!account) throw new NotFoundException('Bank account not found');

      await this.periods.assertDateInOpenPeriod(tenantId, new Date());
      const { bankDelta } = chequeClearEffect(
        cheque.direction === ChequeDirection.RECEIVED ? 'RECEIVED' : 'ISSUED',
        cheque.amount,
      );

      const updated = await this.prisma.$transaction(async (tx) => {
        await tx.bankAccount.update({
          where: { id: accountId },
          data: { currentBalance: { increment: bankDelta } },
        });
        const bankTxn = await tx.bankTransaction.create({
          data: {
            tenantId,
            bankAccountId: accountId,
            type: BankTxnType.CHEQUE_CLEAR,
            status: BankTxnStatus.CLEARED,
            amount: cheque.amount,
            description: `Cheque ${cheque.chequeNumber} cleared`,
            chequeId: cheque.id,
            createdBy: userId,
          },
        });
        const ch = await tx.cheque.update({
          where: { id },
          data: {
            status: ChequeStatus.CLEARED,
            bankAccountId: accountId,
            clearedAt: new Date(),
          },
          include: { bankAccount: { select: { id: true, name: true, code: true } } },
        });
        return { ch, bankTxn };
      });

      let journalEntryId: string | null = null;
      if (account.glAccountId) {
        const cashGl = await this.resolveCashGlAccountId(tenantId);
        if (cashGl && cashGl !== account.glAccountId) {
          const received = cheque.direction === ChequeDirection.RECEIVED;
          const glLines = received
            ? [
                { accountId: account.glAccountId, side: 'DEBIT' as const, amount: cheque.amount },
                { accountId: cashGl, side: 'CREDIT' as const, amount: cheque.amount },
              ]
            : [
                { accountId: cashGl, side: 'DEBIT' as const, amount: cheque.amount },
                { accountId: account.glAccountId, side: 'CREDIT' as const, amount: cheque.amount },
              ];
          const je = await this.journals.create(tenantId, branchId, userId, SYSTEM_ROLES, {
            description: `Cheque ${cheque.chequeNumber} cleared`,
            date: new Date().toISOString().slice(0, 10),
            referenceType: 'CHEQUE_CLEAR',
            referenceId: cheque.id,
            action: 'POST',
            glLines,
          });
          journalEntryId = je.id;
        }
      }

      return { ...updated.ch, bankTxnId: updated.bankTxn.id, journalEntryId };
    }

    if (status === ChequeStatus.BOUNCED) {
      // If previously cleared, reverse bank impact
      if (cheque.status === ChequeStatus.CLEARED && cheque.bankAccountId) {
        const { bankDelta } = chequeClearEffect(
          cheque.direction === ChequeDirection.RECEIVED ? 'RECEIVED' : 'ISSUED',
          cheque.amount,
        );
        return this.prisma.$transaction(async (tx) => {
          await tx.bankAccount.update({
            where: { id: cheque.bankAccountId! },
            data: { currentBalance: { increment: -bankDelta } },
          });
          await tx.bankTransaction.create({
            data: {
              tenantId,
              bankAccountId: cheque.bankAccountId!,
              type: BankTxnType.ADJUSTMENT,
              status: BankTxnStatus.CLEARED,
              amount: cheque.amount,
              description: `Cheque ${cheque.chequeNumber} bounce reversal`,
              chequeId: cheque.id,
              createdBy: userId,
            },
          });
          return tx.cheque.update({
            where: { id },
            data: { status: ChequeStatus.BOUNCED, bouncedAt: new Date() },
            include: { bankAccount: { select: { id: true, name: true, code: true } } },
          });
        });
      }
      return this.prisma.cheque.update({
        where: { id },
        data: { status: ChequeStatus.BOUNCED, bouncedAt: new Date() },
        include: { bankAccount: { select: { id: true, name: true, code: true } } },
      });
    }

    if (status === ChequeStatus.DEPOSITED) {
      return this.prisma.cheque.update({
        where: { id },
        data: {
          status: ChequeStatus.DEPOSITED,
          bankAccountId: bankAccountId || cheque.bankAccountId,
        },
        include: { bankAccount: { select: { id: true, name: true, code: true } } },
      });
    }

    if (status === ChequeStatus.CANCELLED) {
      return this.prisma.cheque.update({
        where: { id },
        data: { status: ChequeStatus.CANCELLED },
        include: { bankAccount: { select: { id: true, name: true, code: true } } },
      });
    }

    throw new BadRequestException(`Unsupported cheque status: ${status}`);
  }

  // ── Bank Reconciliation ───────────────────────────────────────────

  async listUnreconciledTransactions(tenantId: string, bankAccountId: string, asOfDate?: string) {
    await this.getBankAccount(tenantId, bankAccountId);
    const to = asOfDate ? dayjs(asOfDate).endOf('day').toDate() : undefined;
    return this.prisma.bankTransaction.findMany({
      where: {
        tenantId,
        bankAccountId,
        reconciliationId: null,
        status: { not: BankTxnStatus.VOID },
        ...(to ? { txnDate: { lte: to } } : {}),
      },
      orderBy: [{ txnDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async startReconciliation(
    tenantId: string,
    userId: string,
    dto: { bankAccountId: string; statementDate: string; statementBalance: number; notes?: string },
  ) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: dto.bankAccountId, tenantId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const openDraft = await this.prisma.bankReconciliation.findFirst({
      where: {
        tenantId,
        bankAccountId: account.id,
        status: BankReconciliationStatus.DRAFT,
      },
    });
    if (openDraft) {
      throw new BadRequestException('A draft reconciliation already exists for this account — complete or cancel it first');
    }

    const systemBalance = account.currentBalance;
    const difference = bankReconDifference(dto.statementBalance, systemBalance);
    const unmatched = await this.listUnreconciledTransactions(
      tenantId,
      account.id,
      dto.statementDate,
    );

    const recon = await this.prisma.bankReconciliation.create({
      data: {
        tenantId,
        bankAccountId: account.id,
        statementDate: new Date(dto.statementDate),
        statementBalance: dto.statementBalance,
        systemBalance,
        difference,
        status: BankReconciliationStatus.DRAFT,
        notes: dto.notes,
        createdBy: userId,
      },
      include: { bankAccount: true },
    });

    return { ...recon, unmatchedTxns: unmatched };
  }

  async getReconciliation(tenantId: string, id: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, tenantId },
      include: {
        bankAccount: true,
        matchedTxns: { orderBy: { txnDate: 'asc' } },
      },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found');
    const unmatched =
      recon.status === BankReconciliationStatus.DRAFT
        ? await this.listUnreconciledTransactions(
            tenantId,
            recon.bankAccountId,
            recon.statementDate.toISOString().slice(0, 10),
          )
        : [];
    return { ...recon, unmatchedTxns: unmatched };
  }

  async completeReconciliation(id: string, tenantId: string, matchedTxnIds: string[] = []) {
    const recon = await this.prisma.bankReconciliation.findFirst({
      where: { id, tenantId },
      include: { bankAccount: true },
    });
    if (!recon) throw new NotFoundException('Reconciliation not found');
    if (recon.status !== BankReconciliationStatus.DRAFT) {
      throw new BadRequestException('Only draft reconciliations can be completed');
    }

    return this.prisma.$transaction(async (tx) => {
      if (matchedTxnIds.length) {
        await tx.bankTransaction.updateMany({
          where: {
            id: { in: matchedTxnIds },
            tenantId,
            bankAccountId: recon.bankAccountId,
            reconciliationId: null,
          },
          data: { reconciliationId: recon.id, status: BankTxnStatus.CLEARED },
        });
      }
      const refreshed = await tx.bankAccount.findUnique({ where: { id: recon.bankAccountId } });
      const systemBalance = refreshed?.currentBalance ?? recon.systemBalance;
      const difference = bankReconDifference(recon.statementBalance, systemBalance);

      return tx.bankReconciliation.update({
        where: { id },
        data: {
          status: BankReconciliationStatus.COMPLETED,
          systemBalance,
          difference,
          completedAt: new Date(),
        },
        include: { bankAccount: true, matchedTxns: true },
      });
    });
  }

  async cancelReconciliation(id: string, tenantId: string) {
    const recon = await this.prisma.bankReconciliation.findFirst({ where: { id, tenantId } });
    if (!recon) throw new NotFoundException('Reconciliation not found');
    if (recon.status !== BankReconciliationStatus.DRAFT) {
      throw new BadRequestException('Only draft reconciliations can be cancelled');
    }
    await this.prisma.bankTransaction.updateMany({
      where: { reconciliationId: id, tenantId },
      data: { reconciliationId: null },
    });
    return this.prisma.bankReconciliation.update({
      where: { id },
      data: { status: BankReconciliationStatus.CANCELLED },
      include: { bankAccount: true },
    });
  }

  async listReconciliations(tenantId: string, bankAccountId?: string) {
    return this.prisma.bankReconciliation.findMany({
      where: { tenantId, ...(bankAccountId && { bankAccountId }) },
      include: { bankAccount: { select: { name: true, code: true } } },
      orderBy: { statementDate: 'desc' },
      take: 50,
    });
  }
}
