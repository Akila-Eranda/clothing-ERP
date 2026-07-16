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
  SupplierInvoiceStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import {
  buildAgingReport,
  cashBookRunningBalance,
  chequeClearEffect,
  computeProfitLoss,
  bankReconDifference,
  round2,
} from './finance.helper';
import * as dayjs from 'dayjs';

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

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
      select: { customerId: true, dueDate: true, createdAt: true },
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

    const aging = buildAgingReport(lines, asOf);
    return {
      asOf: asOf.toISOString(),
      ...aging,
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
    },
  ) {
    const last = await this.prisma.cashBookEntry.findFirst({
      where: { tenantId, ...(branchId && { branchId }) },
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
    const prev = last?.balanceAfter ?? 0;
    const debit = dto.debit ?? 0;
    const credit = dto.credit ?? 0;
    const balanceAfter = round2(prev + debit - credit);

    return this.prisma.cashBookEntry.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        entryDate: dto.entryDate ? new Date(dto.entryDate) : new Date(),
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
  }

  // ── Bank Accounts ─────────────────────────────────────────────────

  async listBankAccounts(tenantId: string) {
    return this.prisma.bankAccount.findMany({
      where: { tenantId, isActive: true },
      orderBy: { code: 'asc' },
    });
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
    },
  ) {
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
      },
    });
  }

  async postBankTransaction(
    tenantId: string,
    userId: string,
    dto: {
      bankAccountId: string;
      type: BankTxnType;
      amount: number;
      txnDate?: string;
      reference?: string;
      description?: string;
      status?: BankTxnStatus;
    },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Amount must be positive');
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: dto.bankAccountId, tenantId, isActive: true },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    // CHEQUE_CLEAR balance updates go through updateChequeStatus (direction-aware)
    const inflowTypes: BankTxnType[] = [BankTxnType.DEPOSIT, BankTxnType.TRANSFER_IN, BankTxnType.INTEREST];
    const skipBalance = dto.type === BankTxnType.CHEQUE_CLEAR;
    const signed = inflowTypes.includes(dto.type) ? dto.amount : -dto.amount;

    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.bankTransaction.create({
        data: {
          tenantId,
          bankAccountId: account.id,
          type: dto.type,
          status: dto.status ?? BankTxnStatus.CLEARED,
          amount: dto.amount,
          txnDate: dto.txnDate ? new Date(dto.txnDate) : new Date(),
          reference: dto.reference,
          description: dto.description,
          createdBy: userId,
        },
      });
      if (!skipBalance && (dto.status ?? BankTxnStatus.CLEARED) === BankTxnStatus.CLEARED) {
        await tx.bankAccount.update({
          where: { id: account.id },
          data: { currentBalance: { increment: signed } },
        });
      }
      return txn;
    });
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
    },
  ) {
    if (dto.amount <= 0) throw new BadRequestException('Cheque amount must be positive');
    const status = dto.direction === ChequeDirection.RECEIVED ? ChequeStatus.RECEIVED : ChequeStatus.ISSUED;
    return this.prisma.cheque.create({
      data: {
        tenantId,
        direction: dto.direction,
        status,
        chequeNumber: dto.chequeNumber,
        amount: dto.amount,
        bankName: dto.bankName,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : new Date(),
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        partyType: dto.partyType,
        partyId: dto.partyId,
        partyName: dto.partyName,
        bankAccountId: dto.bankAccountId,
        notes: dto.notes,
        createdBy: userId,
      },
    });
  }

  async listCheques(tenantId: string, query: PaginationDto & { status?: ChequeStatus; direction?: ChequeDirection }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.status && { status: query.status }),
      ...(query.direction && { direction: query.direction }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.cheque.findMany({
        where,
        skip,
        take,
        include: { bankAccount: { select: { name: true, code: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.cheque.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 50);
  }

  async updateChequeStatus(
    id: string,
    tenantId: string,
    userId: string,
    status: ChequeStatus,
    bankAccountId?: string,
  ) {
    const cheque = await this.prisma.cheque.findFirst({ where: { id, tenantId } });
    if (!cheque) throw new NotFoundException('Cheque not found');

    if (status === ChequeStatus.CLEARED) {
      const accountId = bankAccountId || cheque.bankAccountId;
      if (!accountId) throw new BadRequestException('Bank account required to clear cheque');
      const { bankDelta } = chequeClearEffect(
        cheque.direction === ChequeDirection.RECEIVED ? 'RECEIVED' : 'ISSUED',
        cheque.amount,
      );

      return this.prisma.$transaction(async (tx) => {
        await tx.bankAccount.update({
          where: { id: accountId },
          data: { currentBalance: { increment: bankDelta } },
        });
        await tx.bankTransaction.create({
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
        return tx.cheque.update({
          where: { id },
          data: {
            status: ChequeStatus.CLEARED,
            bankAccountId: accountId,
            clearedAt: new Date(),
          },
        });
      });
    }

    if (status === ChequeStatus.BOUNCED) {
      return this.prisma.cheque.update({
        where: { id },
        data: { status: ChequeStatus.BOUNCED, bouncedAt: new Date() },
      });
    }

    if (status === ChequeStatus.DEPOSITED) {
      return this.prisma.cheque.update({
        where: { id },
        data: { status: ChequeStatus.DEPOSITED, bankAccountId: bankAccountId || cheque.bankAccountId },
      });
    }

    return this.prisma.cheque.update({ where: { id }, data: { status } });
  }

  // ── Bank Reconciliation ───────────────────────────────────────────

  async startReconciliation(
    tenantId: string,
    userId: string,
    dto: { bankAccountId: string; statementDate: string; statementBalance: number; notes?: string },
  ) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: dto.bankAccountId, tenantId },
    });
    if (!account) throw new NotFoundException('Bank account not found');

    const systemBalance = account.currentBalance;
    const difference = bankReconDifference(dto.statementBalance, systemBalance);

    return this.prisma.bankReconciliation.create({
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
          where: { id: { in: matchedTxnIds }, tenantId, bankAccountId: recon.bankAccountId },
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

  async listReconciliations(tenantId: string, bankAccountId?: string) {
    return this.prisma.bankReconciliation.findMany({
      where: { tenantId, ...(bankAccountId && { bankAccountId }) },
      include: { bankAccount: { select: { name: true, code: true } } },
      orderBy: { statementDate: 'desc' },
      take: 50,
    });
  }
}
