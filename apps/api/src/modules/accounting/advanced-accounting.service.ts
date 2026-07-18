import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AccountType, JournalEntryType, Prisma, RoleType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { JournalEntriesService } from './journal-entries.service';

type RecurringLine = {
  accountId: string;
  side: 'DEBIT' | 'CREDIT';
  amount: number;
  description?: string;
};

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function addFrequency(date: Date, frequency: string) {
  const next = new Date(date);
  switch (frequency.toUpperCase()) {
    case 'DAILY':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'WEEKLY':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'QUARTERLY':
      next.setUTCMonth(next.getUTCMonth() + 3);
      break;
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      break;
    default:
      next.setUTCMonth(next.getUTCMonth() + 1);
  }
  return next;
}

@Injectable()
export class AdvancedAccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalEntriesService,
  ) {}

  // ── Cost centers ───────────────────────────────────────────────────

  listCostCenters(tenantId: string, includeInactive = false) {
    return this.prisma.costCenter.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      include: { _count: { select: { budgetLines: true } } },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async createCostCenter(
    tenantId: string,
    dto: { code: string; name: string; description?: string; manager?: string },
  ) {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    if (!code || !name) throw new BadRequestException('Code and name are required');
    return this.prisma.costCenter.create({
      data: {
        tenantId,
        code,
        name,
        description: dto.description?.trim() || undefined,
        manager: dto.manager?.trim() || undefined,
      },
    });
  }

  async updateCostCenter(
    tenantId: string,
    id: string,
    dto: { name?: string; description?: string | null; manager?: string | null; isActive?: boolean },
  ) {
    const row = await this.prisma.costCenter.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Cost center not found');
    return this.prisma.costCenter.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(dto.manager !== undefined && { manager: dto.manager?.trim() || null }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
      },
    });
  }

  // ── Budgets ────────────────────────────────────────────────────────

  listBudgets(tenantId: string, fiscalYear?: number) {
    return this.prisma.accountingBudget.findMany({
      where: { tenantId, ...(fiscalYear ? { fiscalYear } : {}) },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, type: true } },
            costCenter: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ month: 'asc' }, { account: { code: 'asc' } }],
        },
      },
      orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createBudget(
    tenantId: string,
    userId: string,
    dto: {
      name: string;
      fiscalYear: number;
      notes?: string;
      lines?: Array<{
        accountId: string;
        costCenterId?: string;
        month: number;
        amount: number;
        notes?: string;
      }>;
    },
  ) {
    if (!dto.name?.trim()) throw new BadRequestException('Budget name is required');
    if (dto.fiscalYear < 2000 || dto.fiscalYear > 2200) {
      throw new BadRequestException('Invalid fiscal year');
    }
    this.assertBudgetLines(dto.lines ?? []);
    return this.prisma.accountingBudget.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        fiscalYear: dto.fiscalYear,
        notes: dto.notes?.trim() || undefined,
        createdBy: userId,
        lines: {
          create: (dto.lines ?? []).map((line) => ({
            accountId: line.accountId,
            costCenterId: line.costCenterId || undefined,
            month: line.month,
            amount: round2(line.amount),
            notes: line.notes?.trim() || undefined,
          })),
        },
      },
      include: { lines: true },
    });
  }

  async replaceBudgetLines(
    tenantId: string,
    id: string,
    lines: Array<{
      accountId: string;
      costCenterId?: string;
      month: number;
      amount: number;
      notes?: string;
    }>,
  ) {
    const budget = await this.prisma.accountingBudget.findFirst({ where: { id, tenantId } });
    if (!budget) throw new NotFoundException('Budget not found');
    if (budget.status === 'APPROVED') {
      throw new BadRequestException('Approved budget cannot be edited');
    }
    this.assertBudgetLines(lines);
    return this.prisma.$transaction(async (tx) => {
      await tx.accountingBudgetLine.deleteMany({ where: { budgetId: id } });
      if (lines.length) {
        await tx.accountingBudgetLine.createMany({
          data: lines.map((line) => ({
            budgetId: id,
            accountId: line.accountId,
            costCenterId: line.costCenterId || null,
            month: line.month,
            amount: round2(line.amount),
            notes: line.notes?.trim() || null,
          })),
        });
      }
      return tx.accountingBudget.findUnique({
        where: { id },
        include: { lines: true },
      });
    });
  }

  async setBudgetStatus(
    tenantId: string,
    id: string,
    userId: string,
    status: 'DRAFT' | 'APPROVED' | 'ARCHIVED',
  ) {
    const budget = await this.prisma.accountingBudget.findFirst({ where: { id, tenantId } });
    if (!budget) throw new NotFoundException('Budget not found');
    return this.prisma.accountingBudget.update({
      where: { id },
      data: {
        status,
        ...(status === 'APPROVED'
          ? { approvedBy: userId, approvedAt: new Date() }
          : { approvedBy: null, approvedAt: null }),
      },
    });
  }

  private assertBudgetLines(lines: Array<{ month: number; amount: number }>) {
    for (const line of lines) {
      if (!Number.isInteger(line.month) || line.month < 1 || line.month > 12) {
        throw new BadRequestException('Budget month must be between 1 and 12');
      }
      if (!Number.isFinite(line.amount) || line.amount < 0) {
        throw new BadRequestException('Budget amount must be zero or positive');
      }
    }
  }

  async budgetVariance(tenantId: string, fiscalYear: number) {
    const budget = await this.prisma.accountingBudget.findFirst({
      where: { tenantId, fiscalYear, status: 'APPROVED' },
      include: {
        lines: {
          include: { account: { select: { id: true, code: true, name: true, type: true } } },
        },
      },
      orderBy: { approvedAt: 'desc' },
    });
    if (!budget) return { budget: null, totals: { budget: 0, actual: 0, variance: 0 }, rows: [] };

    const start = new Date(Date.UTC(fiscalYear, 0, 1));
    const end = new Date(Date.UTC(fiscalYear, 11, 31, 23, 59, 59));
    const actualLines = await this.prisma.journalLine.findMany({
      where: {
        journalEntry: {
          tenantId,
          isPosted: true,
          date: { gte: start, lte: end },
        },
        OR: [
          { debitAccountId: { in: [...new Set(budget.lines.map((l) => l.accountId))] } },
          { creditAccountId: { in: [...new Set(budget.lines.map((l) => l.accountId))] } },
        ],
      },
      include: { journalEntry: { select: { date: true } } },
    });

    const actualByKey = new Map<string, number>();
    for (const line of actualLines) {
      const accountId =
        line.type === JournalEntryType.DEBIT ? line.debitAccountId : line.creditAccountId;
      if (!accountId) continue;
      const month = line.journalEntry.date.getUTCMonth() + 1;
      const account = budget.lines.find((b) => b.accountId === accountId)?.account;
      if (!account) continue;
      const debitNormal = account.type === AccountType.ASSET || account.type === AccountType.EXPENSE;
      const signed =
        line.type === JournalEntryType.DEBIT
          ? debitNormal ? line.amount : -line.amount
          : debitNormal ? -line.amount : line.amount;
      const key = `${accountId}:${month}`;
      actualByKey.set(key, round2((actualByKey.get(key) ?? 0) + signed));
    }

    const grouped = new Map<string, {
      accountId: string;
      code: string;
      name: string;
      budget: number;
      actual: number;
    }>();
    for (const line of budget.lines) {
      const current = grouped.get(line.accountId) ?? {
        accountId: line.accountId,
        code: line.account.code,
        name: line.account.name,
        budget: 0,
        actual: 0,
      };
      current.budget = round2(current.budget + line.amount);
      current.actual = round2(current.actual + (actualByKey.get(`${line.accountId}:${line.month}`) ?? 0));
      grouped.set(line.accountId, current);
    }
    const rows = [...grouped.values()].map((row) => ({
      ...row,
      variance: round2(row.budget - row.actual),
      utilizationPct: row.budget ? round2((row.actual / row.budget) * 100) : 0,
    }));
    const totals = rows.reduce(
      (sum, row) => ({
        budget: round2(sum.budget + row.budget),
        actual: round2(sum.actual + row.actual),
        variance: round2(sum.variance + row.variance),
      }),
      { budget: 0, actual: 0, variance: 0 },
    );
    return { budget: { id: budget.id, name: budget.name, fiscalYear }, totals, rows };
  }

  // ── Recurring journals ─────────────────────────────────────────────

  listRecurring(tenantId: string) {
    return this.prisma.recurringJournal.findMany({
      where: { tenantId },
      orderBy: [{ isActive: 'desc' }, { nextRunDate: 'asc' }],
    });
  }

  async createRecurring(
    tenantId: string,
    userId: string,
    dto: {
      name: string;
      description: string;
      frequency: string;
      startDate: string;
      endDate?: string;
      nextRunDate?: string;
      autoPost?: boolean;
      branchId?: string;
      lines: RecurringLine[];
    },
  ) {
    this.assertRecurring(dto.lines, dto.frequency);
    const startDate = new Date(dto.startDate);
    return this.prisma.recurringJournal.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        description: dto.description.trim(),
        frequency: dto.frequency.toUpperCase(),
        startDate,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        nextRunDate: dto.nextRunDate ? new Date(dto.nextRunDate) : startDate,
        autoPost: dto.autoPost !== false,
        branchId: dto.branchId || undefined,
        lines: dto.lines as unknown as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });
  }

  async updateRecurring(
    tenantId: string,
    id: string,
    dto: { isActive?: boolean; nextRunDate?: string; autoPost?: boolean },
  ) {
    const row = await this.prisma.recurringJournal.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Recurring journal not found');
    return this.prisma.recurringJournal.update({
      where: { id },
      data: {
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.autoPost != null && { autoPost: dto.autoPost }),
        ...(dto.nextRunDate && { nextRunDate: new Date(dto.nextRunDate) }),
      },
    });
  }

  private assertRecurring(lines: RecurringLine[], frequency: string) {
    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].includes(frequency.toUpperCase())) {
      throw new BadRequestException('Invalid recurring frequency');
    }
    const debit = round2(lines.filter((l) => l.side === 'DEBIT').reduce((s, l) => s + Number(l.amount), 0));
    const credit = round2(lines.filter((l) => l.side === 'CREDIT').reduce((s, l) => s + Number(l.amount), 0));
    if (!lines.length || Math.abs(debit - credit) > 0.009) {
      throw new BadRequestException('Recurring journal debits and credits must balance');
    }
  }

  async runRecurring(tenantId: string, id: string, userId = 'system') {
    const recurring = await this.prisma.recurringJournal.findFirst({ where: { id, tenantId } });
    if (!recurring) throw new NotFoundException('Recurring journal not found');
    if (!recurring.isActive) throw new BadRequestException('Recurring journal is inactive');
    const lines = recurring.lines as unknown as RecurringLine[];
    this.assertRecurring(lines, recurring.frequency);
    const referenceId = `${recurring.id}:${recurring.nextRunDate.toISOString().slice(0, 10)}`;
    const duplicate = await this.prisma.journalEntry.findFirst({
      where: { tenantId, referenceType: 'RECURRING', referenceId, status: { not: 'VOID' } },
      select: { id: true },
    });
    if (duplicate) return { skipped: true, journalId: duplicate.id };

    const entry = await this.journals.create(
      tenantId,
      recurring.branchId ?? '',
      userId,
      SYSTEM_ROLES,
      {
        description: recurring.description,
        date: recurring.nextRunDate.toISOString().slice(0, 10),
        referenceType: 'RECURRING',
        referenceId,
        action: recurring.autoPost ? 'POST' : 'DRAFT',
        glLines: lines,
      },
    );
    const nextRunDate = addFrequency(recurring.nextRunDate, recurring.frequency);
    const isActive = !recurring.endDate || nextRunDate <= recurring.endDate;
    await this.prisma.recurringJournal.update({
      where: { id },
      data: { lastRunDate: recurring.nextRunDate, nextRunDate, isActive },
    });
    return { skipped: false, journalId: entry.id, entryNumber: entry.entryNumber };
  }

  @Cron('15 * * * *')
  async runDueRecurring() {
    const due = await this.prisma.recurringJournal.findMany({
      where: {
        isActive: true,
        autoPost: true,
        nextRunDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
      },
      take: 100,
    });
    for (const row of due) {
      try {
        await this.runRecurring(row.tenantId, row.id);
      } catch {
        // Keep schedule active; diagnostics surface overdue runs.
      }
    }
  }

  // ── FX rates ────────────────────────────────────────────────────────

  listExchangeRates(tenantId: string) {
    return this.prisma.exchangeRate.findMany({
      where: { tenantId, isActive: true },
      orderBy: { effectiveAt: 'desc' },
      take: 100,
    });
  }

  async createExchangeRate(
    tenantId: string,
    userId: string,
    dto: { fromCurrency: string; toCurrency: string; rate: number; effectiveAt?: string; source?: string },
  ) {
    const fromCurrency = dto.fromCurrency.trim().toUpperCase();
    const toCurrency = dto.toCurrency.trim().toUpperCase();
    if (fromCurrency.length !== 3 || toCurrency.length !== 3 || fromCurrency === toCurrency) {
      throw new BadRequestException('Use different 3-letter currency codes');
    }
    if (!Number.isFinite(dto.rate) || dto.rate <= 0) throw new BadRequestException('Rate must be positive');
    return this.prisma.exchangeRate.create({
      data: {
        tenantId,
        fromCurrency,
        toCurrency,
        rate: dto.rate,
        effectiveAt: dto.effectiveAt ? new Date(dto.effectiveAt) : new Date(),
        source: dto.source?.trim() || 'Manual',
        createdBy: userId,
      },
    });
  }

  async convertCurrency(
    tenantId: string,
    fromCurrency: string,
    toCurrency: string,
    amount: number,
    at = new Date(),
  ) {
    if (fromCurrency.toUpperCase() === toCurrency.toUpperCase()) {
      return { amount, converted: amount, rate: 1, effectiveAt: at };
    }
    const rate = await this.prisma.exchangeRate.findFirst({
      where: {
        tenantId,
        fromCurrency: fromCurrency.toUpperCase(),
        toCurrency: toCurrency.toUpperCase(),
        isActive: true,
        effectiveAt: { lte: at },
      },
      orderBy: { effectiveAt: 'desc' },
    });
    if (!rate) throw new NotFoundException('Exchange rate not found');
    return {
      amount,
      converted: round2(amount * rate.rate),
      rate: rate.rate,
      effectiveAt: rate.effectiveAt,
    };
  }

  // ── Forecast, consolidation, diagnostics ────────────────────────────

  async forecast(tenantId: string, months = 6) {
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const lines = await this.prisma.journalLine.findMany({
      where: {
        journalEntry: { tenantId, isPosted: true, date: { gte: start } },
      },
      include: {
        journalEntry: { select: { date: true } },
        debitAccount: { select: { type: true } },
        creditAccount: { select: { type: true } },
      },
    });
    const history = new Map<string, { revenue: number; expense: number }>();
    for (let offset = 5; offset >= 0; offset--) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
      history.set(date.toISOString().slice(0, 7), { revenue: 0, expense: 0 });
    }
    for (const line of lines) {
      const key = line.journalEntry.date.toISOString().slice(0, 7);
      const row = history.get(key);
      if (!row) continue;
      if (line.type === JournalEntryType.CREDIT && line.creditAccount?.type === AccountType.REVENUE) {
        row.revenue = round2(row.revenue + line.amount);
      }
      if (line.type === JournalEntryType.DEBIT && line.debitAccount?.type === AccountType.EXPENSE) {
        row.expense = round2(row.expense + line.amount);
      }
    }
    const historical = [...history.entries()].map(([month, row]) => ({
      month,
      ...row,
      profit: round2(row.revenue - row.expense),
    }));
    const recent = historical.slice(-3);
    const average = {
      revenue: round2(recent.reduce((s, r) => s + r.revenue, 0) / Math.max(1, recent.length)),
      expense: round2(recent.reduce((s, r) => s + r.expense, 0) / Math.max(1, recent.length)),
    };
    const first = recent[0]?.revenue ?? 0;
    const last = recent.at(-1)?.revenue ?? 0;
    const monthlyGrowth = first > 0 ? Math.max(-0.5, Math.min(0.5, (last / first - 1) / 2)) : 0;
    const projected = [];
    for (let i = 1; i <= Math.min(12, Math.max(1, months)); i++) {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      const revenue = round2(average.revenue * Math.pow(1 + monthlyGrowth, i));
      const expense = round2(average.expense * Math.pow(1 + Math.max(0, monthlyGrowth * 0.5), i));
      projected.push({
        month: date.toISOString().slice(0, 7),
        revenue,
        expense,
        profit: round2(revenue - expense),
      });
    }
    return { historical, projected, monthlyGrowthPct: round2(monthlyGrowth * 100), method: '3-month moving average' };
  }

  async consolidation(tenantId: string, startDate?: string, endDate?: string) {
    const start = startDate ? new Date(startDate) : new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
    const end = endDate ? new Date(endDate) : new Date();
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' },
    });
    const rows = await Promise.all(branches.map(async (branch) => {
      const [sales, expenses, journals] = await Promise.all([
        this.prisma.sale.aggregate({
          where: { tenantId, branchId: branch.id, status: 'COMPLETED', createdAt: { gte: start, lte: end } },
          _sum: { total: true },
          _count: { id: true },
        }),
        this.prisma.expense.aggregate({
          where: { tenantId, branchId: branch.id, date: { gte: start, lte: end } },
          _sum: { amount: true },
        }),
        this.prisma.journalEntry.count({
          where: { tenantId, branchId: branch.id, isPosted: true, date: { gte: start, lte: end } },
        }),
      ]);
      const revenue = round2(sales._sum.total ?? 0);
      const expense = round2(expenses._sum.amount ?? 0);
      return {
        ...branch,
        revenue,
        expense,
        net: round2(revenue - expense),
        transactions: sales._count.id,
        postedJournals: journals,
      };
    }));
    const total = rows.reduce(
      (sum, row) => ({
        revenue: round2(sum.revenue + row.revenue),
        expense: round2(sum.expense + row.expense),
        net: round2(sum.net + row.net),
      }),
      { revenue: 0, expense: 0, net: 0 },
    );
    return { startDate: start, endDate: end, total, branches: rows };
  }

  async diagnostics(tenantId: string) {
    const [sales, grns, expenses, supplierPayments, recurringOverdue, accounts, journals] =
      await Promise.all([
        this.prisma.sale.findMany({
          where: { tenantId, status: 'COMPLETED' },
          select: { id: true },
          take: 1000,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.goodsReceipt.findMany({
          where: { tenantId, status: 'POSTED' },
          select: { id: true },
          take: 1000,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.expense.findMany({
          where: { tenantId },
          select: { id: true },
          take: 1000,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.supplierPayment.findMany({
          where: { tenantId },
          select: { id: true },
          take: 1000,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.recurringJournal.count({
          where: { tenantId, isActive: true, nextRunDate: { lt: new Date() } },
        }),
        this.prisma.account.findMany({
          where: { tenantId, isActive: true },
          select: { code: true },
        }),
        this.prisma.journalEntry.findMany({
          where: {
            tenantId,
            status: { not: 'VOID' },
            referenceType: { in: ['SALE', 'GRN', 'EXPENSE', 'SUPPLIER_PAYMENT'] },
          },
          select: { referenceType: true, referenceId: true },
        }),
      ]);

    const posted = new Set(journals.map((j) => `${j.referenceType}:${j.referenceId}`));
    const missing = {
      sales: sales.filter((row) => !posted.has(`SALE:${row.id}`)).length,
      grns: grns.filter((row) => !posted.has(`GRN:${row.id}`)).length,
      expenses: expenses.filter((row) => !posted.has(`EXPENSE:${row.id}`)).length,
      supplierPayments: supplierPayments.filter((row) => !posted.has(`SUPPLIER_PAYMENT:${row.id}`)).length,
    };
    const requiredCodes = ['1100', '1300', '1400', '2100', '2200', '4100', '5100'];
    const accountCodes = new Set(accounts.map((a) => a.code));
    const missingAccounts = requiredCodes.filter((code) => !accountCodes.has(code));
    const unpostedTotal = Object.values(missing).reduce((sum, count) => sum + count, 0);
    const issues = unpostedTotal + recurringOverdue + missingAccounts.length;
    return {
      healthScore: Math.max(0, 100 - Math.min(100, issues * 4)),
      status: issues === 0 ? 'HEALTHY' : issues < 5 ? 'ATTENTION' : 'ACTION_REQUIRED',
      missingJournals: missing,
      unpostedTotal,
      overdueRecurring: recurringOverdue,
      missingAccounts,
      checkedAt: new Date(),
    };
  }

  async dashboard(tenantId: string) {
    const year = new Date().getUTCFullYear();
    const [diagnostics, variance, forecast, recurring, costCenters, exchangeRates] = await Promise.all([
      this.diagnostics(tenantId),
      this.budgetVariance(tenantId, year),
      this.forecast(tenantId, 3),
      this.prisma.recurringJournal.count({ where: { tenantId, isActive: true } }),
      this.prisma.costCenter.count({ where: { tenantId, isActive: true } }),
      this.prisma.exchangeRate.count({ where: { tenantId, isActive: true } }),
    ]);
    return {
      diagnostics,
      budget: variance.totals,
      forecast: forecast.projected,
      monthlyGrowthPct: forecast.monthlyGrowthPct,
      activeRecurring: recurring,
      activeCostCenters: costCenters,
      activeExchangeRates: exchangeRates,
    };
  }
}
