import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AccountType,
  JournalEntryStatus,
  JournalEntryType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AUDIT_ACTIONS } from '@/modules/audit-log/audit.helper';
import { AuditLogService } from '@/modules/audit-log/audit-log.module';
import { FinancialPeriodsService } from './financial-periods.service';
import { AccountingSettingsService } from './accounting-settings.service';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { getPaginationArgs, paginate } from '@/shared/pagination.helper';
import {
  assertDebitEqualsCredit,
  GlJournalLineInput,
  normalizeJournalLines,
  toPrismaLineCreates,
} from './journal-entries.helper';

export type CreateJournalPayload = {
  description: string;
  date: string;
  referenceId?: string;
  referenceType?: string;
  lines?: Array<{
    debitAccountId: string;
    creditAccountId: string;
    amount: number;
    description?: string;
  }>;
  glLines?: GlJournalLineInput[];
  /** DRAFT | SUBMIT | POST — default POST keeps legacy UI behavior */
  action?: 'DRAFT' | 'SUBMIT' | 'POST';
};

export type UpdateJournalPayload = {
  description?: string;
  date?: string;
  referenceId?: string | null;
  referenceType?: string | null;
  lines?: CreateJournalPayload['lines'];
  glLines?: GlJournalLineInput[];
};

@Injectable()
export class JournalEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly periods: FinancialPeriodsService,
    private readonly audit: AuditLogService,
    private readonly settings: AccountingSettingsService,
  ) {}

  private balanceDelta(type: AccountType, amount: number, isDebit: boolean): number {
    const debitNormal = type === AccountType.ASSET || type === AccountType.EXPENSE;
    if (isDebit) return debitNormal ? amount : -amount;
    return debitNormal ? -amount : amount;
  }

  private lineInclude = {
    debitAccount: { select: { id: true, name: true, code: true, type: true } },
    creditAccount: { select: { id: true, name: true, code: true, type: true } },
  } as const;

  private async allocateEntryNumber(tx: Prisma.TransactionClient, tenantId: string, date: Date) {
    return this.settings.allocateNumber(tx, tenantId, 'JOURNAL', date);
  }

  private async assertAccountsActive(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: GlJournalLineInput[],
    requireActive = true,
  ) {
    const ids = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await tx.account.findMany({
      where: {
        tenantId,
        id: { in: ids },
        ...(requireActive ? { isActive: true } : {}),
      },
    });
    if (accounts.length !== ids.length) {
      throw new BadRequestException(
        requireActive
          ? 'One or more accounts are missing or inactive'
          : 'One or more accounts are missing',
      );
    }
    return new Map(accounts.map((a) => [a.id, a]));
  }

  private async applyBalances(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: GlJournalLineInput[],
    reverse = false,
  ) {
    const accounts = await this.assertAccountsActive(tx, tenantId, lines, !reverse);
    for (const line of lines) {
      const acct = accounts.get(line.accountId)!;
      const isDebit = line.side === 'DEBIT';
      const delta = this.balanceDelta(acct.type, line.amount, isDebit) * (reverse ? -1 : 1);
      await tx.account.update({
        where: { id: acct.id },
        data: { balance: { increment: delta } },
      });
    }
  }

  private linesFromDb(entryLines: Array<{
    type: JournalEntryType;
    amount: number | Prisma.Decimal;
    description: string | null;
    debitAccountId: string | null;
    creditAccountId: string | null;
  }>): GlJournalLineInput[] {
    return entryLines.map((l) => ({
      accountId: (l.type === JournalEntryType.DEBIT ? l.debitAccountId : l.creditAccountId)!,
      side: l.type === JournalEntryType.DEBIT ? ('DEBIT' as const) : ('CREDIT' as const),
      amount: Number(l.amount),
      description: l.description ?? undefined,
    }));
  }

  private async auditJournal(
    tenantId: string,
    userId: string,
    action: string,
    resourceId: string,
    newData?: object,
    oldData?: object,
  ) {
    const normalized =
      action.includes('approve') ? AUDIT_ACTIONS.APPROVE
      : action.includes('reject') ? AUDIT_ACTIONS.REJECT
      : action.includes('create') || action === 'journal.draft' || action === 'journal.posted'
        ? AUDIT_ACTIONS.CREATE
      : action.includes('update') || action.includes('submit') || action.includes('post') || action.includes('void')
        ? AUDIT_ACTIONS.UPDATE
      : action.includes('delete') ? AUDIT_ACTIONS.DELETE
      : AUDIT_ACTIONS.UPDATE;

    await this.audit.log({
      tenantId,
      userId,
      action: normalized,
      resource: 'journal_entry',
      resourceId,
      newData: { ...newData, journalAction: action },
      oldData,
    });
  }

  async list(
    tenantId: string,
    query: {
      page?: number;
      limit?: number;
      status?: JournalEntryStatus;
      q?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where: Prisma.JournalEntryWhereInput = {
      tenantId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q?.trim()
        ? {
            OR: [
              { entryNumber: { contains: query.q.trim(), mode: 'insensitive' } },
              { description: { contains: query.q.trim(), mode: 'insensitive' } },
              { referenceId: { contains: query.q.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.startDate || query.endDate
        ? {
            date: {
              ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
              ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        skip,
        take,
        include: { lines: { include: this.lineInclude } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async getOne(tenantId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, tenantId },
      include: { lines: { include: this.lineInclude } },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    const glLines = this.linesFromDb(entry.lines);
    let debitTotal = 0;
    let creditTotal = 0;
    for (const l of glLines) {
      if (l.side === 'DEBIT') debitTotal += l.amount;
      else creditTotal += l.amount;
    }
    return {
      ...entry,
      debitTotal,
      creditTotal,
      balanced: Math.abs(debitTotal - creditTotal) < 0.01,
    };
  }

  async create(
    tenantId: string,
    branchId: string,
    userId: string,
    roles: string[],
    dto: CreateJournalPayload,
  ) {
    const glLines = normalizeJournalLines(dto);
    assertDebitEqualsCredit(glLines);
    await this.periods.assertDateInOpenPeriod(tenantId, dto.date);

    const action = dto.action ?? 'POST';
    let status: JournalEntryStatus = JournalEntryStatus.DRAFT;
    let isPosted = false;
    let approvedBy: string | undefined;
    let approvedAt: Date | undefined;
    let postedAt: Date | undefined;

    const prefs = await this.settings.getPreferences(tenantId);
    const adminBypass = bypassesWorkflowApproval(roles);

    if (action === 'SUBMIT') {
      if (adminBypass || !prefs.requireJournalApproval) {
        status = JournalEntryStatus.APPROVED;
        approvedBy = userId;
        approvedAt = new Date();
      } else {
        status = JournalEntryStatus.PENDING_APPROVAL;
      }
    } else if (action === 'POST') {
      const canDirectPost = adminBypass || prefs.allowPostDraft;
      if (!canDirectPost) {
        status = prefs.requireJournalApproval
          ? JournalEntryStatus.PENDING_APPROVAL
          : JournalEntryStatus.APPROVED;
        if (status === JournalEntryStatus.APPROVED) {
          approvedBy = userId;
          approvedAt = new Date();
        }
      } else {
        status = JournalEntryStatus.POSTED;
        isPosted = true;
        approvedBy = userId;
        approvedAt = new Date();
        postedAt = new Date();
      }
    }

    const date = new Date(dto.date);

    const entry = await this.prisma.$transaction(async (tx) => {
      await this.assertAccountsActive(tx, tenantId, glLines);
      const entryNumber = await this.allocateEntryNumber(tx, tenantId, date);

      const created = await tx.journalEntry.create({
        data: {
          tenantId,
          branchId: branchId || undefined,
          entryNumber,
          description: dto.description,
          date,
          referenceId: dto.referenceId,
          referenceType: dto.referenceType,
          createdBy: userId,
          status,
          isPosted,
          approvedBy,
          approvedAt,
          postedAt,
          lines: { create: toPrismaLineCreates(glLines) },
        },
        include: { lines: { include: this.lineInclude } },
      });

      if (isPosted) {
        await this.applyBalances(tx, tenantId, glLines);
      }

      return created;
    });

    await this.auditJournal(tenantId, userId, `journal.${action.toLowerCase()}`, entry.id, {
      entryNumber: entry.entryNumber,
      status: entry.status,
      description: entry.description,
    });

    return entry;
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateJournalPayload) {
    const existing = await this.prisma.journalEntry.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!existing) throw new NotFoundException('Journal entry not found');
    if (existing.status !== JournalEntryStatus.DRAFT) {
      throw new BadRequestException('Only draft journals can be edited');
    }

    const date = dto.date ? new Date(dto.date) : existing.date;
    if (dto.date) await this.periods.assertDateInOpenPeriod(tenantId, dto.date);

    const glLines =
      dto.glLines || dto.lines
        ? normalizeJournalLines({ lines: dto.lines, glLines: dto.glLines })
        : this.linesFromDb(existing.lines);

    assertDebitEqualsCredit(glLines);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.assertAccountsActive(tx, tenantId, glLines);
      await tx.journalLine.deleteMany({ where: { journalEntryId: id } });
      return tx.journalEntry.update({
        where: { id },
        data: {
          description: dto.description ?? existing.description,
          date,
          referenceId: dto.referenceId === undefined ? existing.referenceId : dto.referenceId,
          referenceType:
            dto.referenceType === undefined ? existing.referenceType : dto.referenceType,
          lines: { create: toPrismaLineCreates(glLines) },
        },
        include: { lines: { include: this.lineInclude } },
      });
    });

    await this.auditJournal(
      tenantId,
      userId,
      'journal.update',
      id,
      { description: updated.description, date: updated.date },
      { description: existing.description, date: existing.date },
    );

    return updated;
  }

  async submit(tenantId: string, userId: string, roles: string[], id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.status !== JournalEntryStatus.DRAFT) {
      throw new BadRequestException('Only drafts can be submitted');
    }
    assertDebitEqualsCredit(this.linesFromDb(entry.lines));
    await this.periods.assertDateInOpenPeriod(tenantId, entry.date);

    const prefs = await this.settings.getPreferences(tenantId);
    const bypass = bypassesWorkflowApproval(roles) || !prefs.requireJournalApproval;
    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: bypass
        ? {
            status: JournalEntryStatus.APPROVED,
            approvedBy: userId,
            approvedAt: new Date(),
          }
        : { status: JournalEntryStatus.PENDING_APPROVAL },
      include: { lines: { include: this.lineInclude } },
    });

    await this.auditJournal(tenantId, userId, 'journal.submit', id, { status: updated.status });
    return updated;
  }

  async approve(tenantId: string, userId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.status !== JournalEntryStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Journal is not pending approval');
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: JournalEntryStatus.APPROVED,
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: { lines: { include: this.lineInclude } },
    });

    await this.auditJournal(tenantId, userId, 'journal.approve', id, { status: updated.status });
    return updated;
  }

  async reject(tenantId: string, userId: string, id: string, reason?: string) {
    const entry = await this.prisma.journalEntry.findFirst({ where: { id, tenantId } });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.status !== JournalEntryStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Journal is not pending approval');
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: { status: JournalEntryStatus.DRAFT },
      include: { lines: { include: this.lineInclude } },
    });

    await this.auditJournal(tenantId, userId, 'journal.reject', id, {
      status: updated.status,
      reason,
    });
    return updated;
  }

  async post(tenantId: string, userId: string, roles: string[], id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.isPosted || entry.status === JournalEntryStatus.POSTED) {
      throw new BadRequestException('Journal is already posted');
    }
    if (entry.status === JournalEntryStatus.VOID) {
      throw new BadRequestException('Cannot post a voided journal');
    }
    if (
      entry.status !== JournalEntryStatus.APPROVED &&
      entry.status !== JournalEntryStatus.DRAFT &&
      !bypassesWorkflowApproval(roles)
    ) {
      throw new BadRequestException('Journal must be approved before posting');
    }
    // Drafts: only admins can post directly
    if (entry.status === JournalEntryStatus.DRAFT && !bypassesWorkflowApproval(roles)) {
      throw new BadRequestException('Submit and get approval before posting');
    }
    if (entry.status === JournalEntryStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Approve the journal before posting');
    }

    const glLines = this.linesFromDb(entry.lines);
    assertDebitEqualsCredit(glLines);
    await this.periods.assertDateInOpenPeriod(tenantId, entry.date);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.applyBalances(tx, tenantId, glLines);
      return tx.journalEntry.update({
        where: { id },
        data: {
          status: JournalEntryStatus.POSTED,
          isPosted: true,
          postedAt: new Date(),
          ...(entry.status === JournalEntryStatus.DRAFT
            ? { approvedBy: userId, approvedAt: new Date() }
            : {}),
        },
        include: { lines: { include: this.lineInclude } },
      });
    });

    await this.auditJournal(tenantId, userId, 'journal.post', id, {
      entryNumber: updated.entryNumber,
      status: updated.status,
    });
    return updated;
  }

  async void(tenantId: string, userId: string, id: string, reason?: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!entry) throw new NotFoundException('Journal entry not found');
    if (entry.status === JournalEntryStatus.VOID) {
      throw new BadRequestException('Journal is already voided');
    }
    if (entry.status === JournalEntryStatus.DRAFT || entry.status === JournalEntryStatus.PENDING_APPROVAL) {
      // Soft cancel without balance reverse
      const updated = await this.prisma.journalEntry.update({
        where: { id },
        data: {
          status: JournalEntryStatus.VOID,
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: reason,
          isPosted: false,
        },
        include: { lines: { include: this.lineInclude } },
      });
      await this.auditJournal(tenantId, userId, 'journal.void', id, { reason });
      return updated;
    }

    if (!entry.isPosted && entry.status !== JournalEntryStatus.POSTED) {
      throw new BadRequestException('Only posted journals need balance reversal on void');
    }

    await this.periods.assertDateInOpenPeriod(tenantId, entry.date);
    const glLines = this.linesFromDb(entry.lines);

    const updated = await this.prisma.$transaction(async (tx) => {
      await this.applyBalances(tx, tenantId, glLines, true);
      return tx.journalEntry.update({
        where: { id },
        data: {
          status: JournalEntryStatus.VOID,
          isPosted: false,
          voidedBy: userId,
          voidedAt: new Date(),
          voidReason: reason,
        },
        include: { lines: { include: this.lineInclude } },
      });
    });

    await this.auditJournal(tenantId, userId, 'journal.void', id, {
      reason,
      entryNumber: updated.entryNumber,
    });
    return updated;
  }
}
