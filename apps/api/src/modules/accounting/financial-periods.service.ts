import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  AccountType,
  AccountingPeriodStatus,
  FiscalYearStatus,
  JournalEntryStatus,
  JournalEntryType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AccountingSettingsService } from './accounting-settings.service';
import {
  assertCanClosePeriod,
  assertCanReopenPeriod,
  computeNetIncomeForClose,
  datesOverlap,
  endOfUtcDay,
  evaluateYearEndCloseRules,
  generateMonthlyPeriods,
  startOfUtcDay,
} from './financial-periods.helper';

@Injectable()
export class FinancialPeriodsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AccountingSettingsService,
  ) {}

  async listFiscalYears(tenantId: string) {
    return this.prisma.fiscalYear.findMany({
      where: { tenantId },
      include: {
        periods: { orderBy: { sequence: 'asc' } },
        _count: { select: { periods: true } },
      },
      orderBy: { startDate: 'desc' },
    });
  }

  async getFiscalYear(id: string, tenantId: string) {
    const fy = await this.prisma.fiscalYear.findFirst({
      where: { id, tenantId },
      include: { periods: { orderBy: { sequence: 'asc' } } },
    });
    if (!fy) throw new NotFoundException('Fiscal year not found');
    return fy;
  }

  async getCurrentContext(tenantId: string) {
    const current = await this.prisma.fiscalYear.findFirst({
      where: { tenantId, isCurrent: true },
      include: { periods: { orderBy: { sequence: 'asc' } } },
    });
    const today = startOfUtcDay(new Date());
    const currentPeriod =
      current?.periods.find(
        (p) => startOfUtcDay(p.startDate) <= today && endOfUtcDay(p.endDate) >= today,
      ) ?? null;
    return { fiscalYear: current, currentPeriod };
  }

  async createFiscalYear(
    tenantId: string,
    userId: string,
    dto: {
      name: string;
      startDate: string;
      endDate: string;
      setCurrent?: boolean;
      retainedEarningsAccountId?: string;
    },
  ) {
    const name = dto.name?.trim();
    if (!name) throw new BadRequestException('Fiscal year name is required');
    const startDate = startOfUtcDay(new Date(dto.startDate));
    const endDate = startOfUtcDay(new Date(dto.endDate));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
      throw new BadRequestException('Invalid start or end date');
    }
    if (endDate < startDate) {
      throw new BadRequestException('End date must be on or after start date');
    }

    const existing = await this.prisma.fiscalYear.findMany({
      where: { tenantId },
      select: { id: true, name: true, startDate: true, endDate: true },
    });
    if (existing.some((e) => e.name === name)) {
      throw new BadRequestException(`Fiscal year "${name}" already exists`);
    }
    for (const e of existing) {
      if (datesOverlap(startDate, endDate, e.startDate, e.endDate)) {
        throw new BadRequestException(`Date range overlaps existing fiscal year "${e.name}"`);
      }
    }

    const periodDrafts = generateMonthlyPeriods(startDate, endDate);
    const setCurrent = dto.setCurrent !== false || existing.length === 0;

    return this.prisma.$transaction(async (tx) => {
      if (setCurrent) {
        await tx.fiscalYear.updateMany({
          where: { tenantId, isCurrent: true },
          data: { isCurrent: false },
        });
      }

      return tx.fiscalYear.create({
        data: {
          tenantId,
          name,
          startDate,
          endDate,
          status: FiscalYearStatus.OPEN,
          isCurrent: setCurrent,
          retainedEarningsAccountId: dto.retainedEarningsAccountId,
          createdBy: userId,
          periods: {
            create: periodDrafts.map((p) => ({
              tenantId,
              name: p.name,
              sequence: p.sequence,
              startDate: p.startDate,
              endDate: p.endDate,
              status: AccountingPeriodStatus.OPEN,
            })),
          },
        },
        include: { periods: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async updateFiscalYearSettings(
    id: string,
    tenantId: string,
    dto: {
      name?: string;
      setCurrent?: boolean;
      retainedEarningsAccountId?: string | null;
    },
  ) {
    const fy = await this.getFiscalYear(id, tenantId);
    if (fy.status === FiscalYearStatus.CLOSED && dto.name) {
      throw new BadRequestException('Cannot rename a closed fiscal year');
    }

    return this.prisma.$transaction(async (tx) => {
      if (dto.setCurrent) {
        await tx.fiscalYear.updateMany({
          where: { tenantId, isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.fiscalYear.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.setCurrent !== undefined && { isCurrent: dto.setCurrent }),
          ...(dto.retainedEarningsAccountId !== undefined && {
            retainedEarningsAccountId: dto.retainedEarningsAccountId,
          }),
        },
        include: { periods: { orderBy: { sequence: 'asc' } } },
      });
    });
  }

  async listPeriods(tenantId: string, fiscalYearId?: string) {
    return this.prisma.accountingPeriod.findMany({
      where: {
        tenantId,
        ...(fiscalYearId ? { fiscalYearId } : {}),
      },
      include: {
        fiscalYear: { select: { id: true, name: true, status: true, isCurrent: true } },
      },
      orderBy: [{ startDate: 'desc' }],
    });
  }

  async closePeriod(id: string, tenantId: string, userId: string, notes?: string) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, tenantId },
      include: { fiscalYear: true },
    });
    if (!period) throw new NotFoundException('Period not found');
    assertCanClosePeriod({
      periodStatus: period.status,
      fiscalYearStatus: period.fiscalYear.status,
    });

    return this.prisma.accountingPeriod.update({
      where: { id },
      data: {
        status: AccountingPeriodStatus.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
        notes: notes ?? period.notes,
      },
      include: { fiscalYear: { select: { id: true, name: true, status: true } } },
    });
  }

  async reopenPeriod(id: string, tenantId: string, userId: string, notes?: string) {
    const period = await this.prisma.accountingPeriod.findFirst({
      where: { id, tenantId },
      include: { fiscalYear: true },
    });
    if (!period) throw new NotFoundException('Period not found');
    assertCanReopenPeriod({
      periodStatus: period.status,
      fiscalYearStatus: period.fiscalYear.status,
    });

    return this.prisma.accountingPeriod.update({
      where: { id },
      data: {
        status: AccountingPeriodStatus.OPEN,
        reopenedAt: new Date(),
        reopenedBy: userId,
        notes: notes ?? period.notes,
        closedAt: null,
        closedBy: null,
      },
      include: { fiscalYear: { select: { id: true, name: true, status: true } } },
    });
  }

  async closeAllOpenPeriods(fiscalYearId: string, tenantId: string, userId: string) {
    const fy = await this.getFiscalYear(fiscalYearId, tenantId);
    if (fy.status === FiscalYearStatus.CLOSED) {
      throw new BadRequestException('Fiscal year is already closed');
    }
    const result = await this.prisma.accountingPeriod.updateMany({
      where: {
        tenantId,
        fiscalYearId,
        status: AccountingPeriodStatus.OPEN,
      },
      data: {
        status: AccountingPeriodStatus.CLOSED,
        closedAt: new Date(),
        closedBy: userId,
      },
    });
    return { closed: result.count };
  }

  private async resolveRetainedEarnings(tenantId: string, preferredId?: string | null) {
    if (preferredId) {
      const preferred = await this.prisma.account.findFirst({
        where: { id: preferredId, tenantId, type: AccountType.EQUITY, isActive: true },
      });
      if (preferred) return preferred;
    }
    const byCode = await this.prisma.account.findFirst({
      where: { tenantId, code: '3100', type: AccountType.EQUITY, isActive: true },
    });
    if (byCode) return byCode;
    return this.prisma.account.findFirst({
      where: {
        tenantId,
        type: AccountType.EQUITY,
        isActive: true,
        name: { contains: 'Retained', mode: 'insensitive' },
      },
    });
  }

  async previewYearEndClose(fiscalYearId: string, tenantId: string) {
    const fy = await this.getFiscalYear(fiscalYearId, tenantId);
    const re = await this.resolveRetainedEarnings(tenantId, fy.retainedEarningsAccountId);
    const rules = evaluateYearEndCloseRules({
      fiscalYearStatus: fy.status,
      periods: fy.periods.map((p) => ({ name: p.name, status: p.status })),
      hasRetainedEarningsAccount: !!re,
    });

    const [revenueAgg, expenseAgg] = await Promise.all([
      this.prisma.account.aggregate({
        where: { tenantId, type: AccountType.REVENUE, isActive: true },
        _sum: { balance: true },
      }),
      this.prisma.account.aggregate({
        where: { tenantId, type: AccountType.EXPENSE, isActive: true },
        _sum: { balance: true },
      }),
    ]);
    const revenueTotal = revenueAgg._sum.balance ?? 0;
    const expenseTotal = expenseAgg._sum.balance ?? 0;
    const netIncome = computeNetIncomeForClose(revenueTotal, expenseTotal);

    return {
      fiscalYear: { id: fy.id, name: fy.name, status: fy.status },
      rules,
      retainedEarningsAccount: re
        ? { id: re.id, code: re.code, name: re.name }
        : null,
      closing: {
        revenueTotal,
        expenseTotal,
        netIncome,
        description:
          netIncome >= 0
            ? `Close FY ${fy.name}: transfer net profit to Retained Earnings`
            : `Close FY ${fy.name}: transfer net loss to Retained Earnings`,
      },
    };
  }

  /**
   * Year-end close:
   * 1. All periods must be closed
   * 2. Post closing JE: zero REVENUE/EXPENSE into Retained Earnings
   * 3. Lock periods + mark FY CLOSED
   */
  async closeFiscalYear(
    fiscalYearId: string,
    tenantId: string,
    branchId: string,
    userId: string,
    dto: { notes?: string; autoClosePeriods?: boolean } = {},
  ) {
    if (dto.autoClosePeriods) {
      await this.closeAllOpenPeriods(fiscalYearId, tenantId, userId);
    }

    const preview = await this.previewYearEndClose(fiscalYearId, tenantId);
    if (!preview.rules.ok) {
      throw new BadRequestException(preview.rules.reasons.join('; '));
    }
    const re = preview.retainedEarningsAccount;
    if (!re) throw new BadRequestException('Retained Earnings account required');

    const revenueAccounts = await this.prisma.account.findMany({
      where: { tenantId, type: AccountType.REVENUE, isActive: true, balance: { not: 0 } },
    });
    const expenseAccounts = await this.prisma.account.findMany({
      where: { tenantId, type: AccountType.EXPENSE, isActive: true, balance: { not: 0 } },
    });

    const netIncome = preview.closing.netIncome;
    const entryNumber = `YE-${Date.now().toString(36).toUpperCase()}`;

    return this.prisma.$transaction(async (tx) => {
      const lines: Prisma.JournalLineUncheckedCreateWithoutJournalEntryInput[] = [];

      for (const acct of revenueAccounts) {
        const amt = Math.abs(acct.balance);
        if (amt < 0.009) continue;
        // Revenue has credit balance → debit revenue to zero, credit RE (if profit path handled via net)
        lines.push({
          debitAccountId: acct.id,
          type: JournalEntryType.DEBIT,
          amount: amt,
          description: `Close ${acct.code}`,
        });
        lines.push({
          creditAccountId: re.id,
          type: JournalEntryType.CREDIT,
          amount: amt,
          description: `Close ${acct.code} → RE`,
        });
        await tx.account.update({
          where: { id: acct.id },
          data: { balance: 0 },
        });
      }

      for (const acct of expenseAccounts) {
        const amt = Math.abs(acct.balance);
        if (amt < 0.009) continue;
        // Expense has debit balance → credit expense to zero, debit RE
        lines.push({
          creditAccountId: acct.id,
          type: JournalEntryType.CREDIT,
          amount: amt,
          description: `Close ${acct.code}`,
        });
        lines.push({
          debitAccountId: re.id,
          type: JournalEntryType.DEBIT,
          amount: amt,
          description: `Close ${acct.code} → RE`,
        });
        await tx.account.update({
          where: { id: acct.id },
          data: { balance: 0 },
        });
      }

      // Net effect on Retained Earnings = revenue − expense
      if (Math.abs(netIncome) >= 0.009) {
        await tx.account.update({
          where: { id: re.id },
          data: { balance: { increment: netIncome } },
        });
      }

      let journalId: string | null = null;
      if (lines.length) {
        const fyRow = await tx.fiscalYear.findUniqueOrThrow({ where: { id: fiscalYearId } });
        const entry = await tx.journalEntry.create({
          data: {
            tenantId,
            branchId: branchId || undefined,
            entryNumber,
            description: preview.closing.description,
            date: endOfUtcDay(fyRow.endDate),
            status: JournalEntryStatus.POSTED,
            isPosted: true,
            postedAt: new Date(),
            createdBy: userId,
            referenceType: 'YEAR_END_CLOSE',
            referenceId: fiscalYearId,
            lines: { create: lines },
          },
        });
        journalId = entry.id;
      }

      await tx.accountingPeriod.updateMany({
        where: { fiscalYearId, tenantId },
        data: { status: AccountingPeriodStatus.LOCKED },
      });

      const closed = await tx.fiscalYear.update({
        where: { id: fiscalYearId },
        data: {
          status: FiscalYearStatus.CLOSED,
          closedAt: new Date(),
          closedBy: userId,
          closingNotes: dto.notes,
          isCurrent: false,
          retainedEarningsAccountId: re.id,
        },
        include: { periods: { orderBy: { sequence: 'asc' } } },
      });

      return {
        fiscalYear: closed,
        journalEntryId: journalId,
        entryNumber: lines.length ? entryNumber : null,
        closing: preview.closing,
      };
    });
  }

  /** Block postings into closed/locked periods. */
  async assertDateInOpenPeriod(tenantId: string, date: Date | string) {
    const d = startOfUtcDay(new Date(date));
    if (Number.isNaN(d.getTime())) throw new BadRequestException('Invalid posting date');

    const period = await this.prisma.accountingPeriod.findFirst({
      where: {
        tenantId,
        startDate: { lte: endOfUtcDay(d) },
        endDate: { gte: d },
      },
      include: { fiscalYear: true },
    });

    // If no periods configured yet, allow (onboarding)
    if (!period) return { allowed: true as const, period: null };

    const prefs = await this.settings.getPreferences(tenantId);
    if (!prefs.blockPostingClosedPeriod) {
      return { allowed: true as const, period };
    }

    if (period.fiscalYear.status === FiscalYearStatus.CLOSED) {
      throw new BadRequestException(
        `Fiscal year "${period.fiscalYear.name}" is closed — cannot post on ${d.toISOString().slice(0, 10)}`,
      );
    }
    if (period.status !== AccountingPeriodStatus.OPEN) {
      throw new BadRequestException(
        `Period "${period.name}" is ${period.status.toLowerCase()} — reopen it to post`,
      );
    }
    return { allowed: true as const, period };
  }
}
