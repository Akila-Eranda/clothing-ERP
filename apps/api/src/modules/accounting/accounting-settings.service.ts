/** Phase 06 Sprint 13 — Accounting settings service. */

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { NumberSeriesResetPolicy, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  assertDecimalPlaces,
  assertFiscalYearStartMonth,
  assertNextValue,
  assertPadLength,
  computeResetKey,
  DEFAULT_ACCOUNTING_PREFERENCES,
  DEFAULT_NUMBER_SERIES,
  formatDocumentNumber,
  previewDocumentNumber,
  NumberSeriesKey,
} from './accounting-settings.helper';

export type UpdateNumberSeriesDto = {
  name?: string;
  prefix?: string;
  includeYear?: boolean;
  includeMonth?: boolean;
  padLength?: number;
  resetPolicy?: NumberSeriesResetPolicy;
  nextValue?: number;
  isActive?: boolean;
  description?: string | null;
};

export type UpdateAccountingPreferencesDto = {
  requireJournalApproval?: boolean;
  allowPostDraft?: boolean;
  blockPostingClosedPeriod?: boolean;
  fiscalYearStartMonth?: number;
  decimalPlaces?: number;
  defaultCashAccountId?: string | null;
  defaultArAccountId?: string | null;
  defaultApAccountId?: string | null;
  defaultSalesAccountId?: string | null;
  defaultPurchaseAccountId?: string | null;
  defaultRetainedEarningsId?: string | null;
};

@Injectable()
export class AccountingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Number series ────────────────────────────────────────────────────

  async ensureNumberSeries(tenantId: string) {
    const existing = await this.prisma.documentNumberSeries.findMany({
      where: { tenantId },
      select: { key: true },
    });
    const have = new Set(existing.map((e) => e.key));
    const missing = DEFAULT_NUMBER_SERIES.filter((d) => !have.has(d.key));
    if (missing.length) {
      await this.prisma.documentNumberSeries.createMany({
        data: missing.map((d) => ({
          tenantId,
          key: d.key,
          name: d.name,
          prefix: d.prefix,
          includeYear: d.includeYear,
          includeMonth: d.includeMonth,
          padLength: d.padLength,
          resetPolicy: d.resetPolicy as NumberSeriesResetPolicy,
          description: d.description,
          nextValue: 1,
        })),
        skipDuplicates: true,
      });
    }
    return this.listNumberSeries(tenantId);
  }

  async listNumberSeries(tenantId: string) {
    await this.ensureNumberSeriesSeeded(tenantId);
    const rows = await this.prisma.documentNumberSeries.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({
      ...r,
      preview: previewDocumentNumber(r),
    }));
  }

  private async ensureNumberSeriesSeeded(tenantId: string) {
    const count = await this.prisma.documentNumberSeries.count({ where: { tenantId } });
    if (count === 0) {
      await this.prisma.documentNumberSeries.createMany({
        data: DEFAULT_NUMBER_SERIES.map((d) => ({
          tenantId,
          key: d.key,
          name: d.name,
          prefix: d.prefix,
          includeYear: d.includeYear,
          includeMonth: d.includeMonth,
          padLength: d.padLength,
          resetPolicy: d.resetPolicy as NumberSeriesResetPolicy,
          description: d.description,
          nextValue: 1,
        })),
        skipDuplicates: true,
      });
    } else if (count < DEFAULT_NUMBER_SERIES.length) {
      await this.ensureNumberSeries(tenantId);
    }
  }

  async updateNumberSeries(tenantId: string, key: string, dto: UpdateNumberSeriesDto) {
    await this.ensureNumberSeriesSeeded(tenantId);
    const row = await this.prisma.documentNumberSeries.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!row) throw new NotFoundException(`Number series "${key}" not found`);

    if (dto.prefix != null && !dto.prefix.trim()) {
      throw new BadRequestException('Prefix is required');
    }
    if (dto.padLength != null) {
      try { assertPadLength(dto.padLength); }
      catch (e) { throw new BadRequestException((e as Error).message); }
    }
    if (dto.nextValue != null) {
      try { assertNextValue(dto.nextValue); }
      catch (e) { throw new BadRequestException((e as Error).message); }
      if (dto.nextValue < row.nextValue) {
        throw new BadRequestException(
          `Next value cannot be lower than current (${row.nextValue}) — risk of duplicate numbers`,
        );
      }
    }

    const updated = await this.prisma.documentNumberSeries.update({
      where: { id: row.id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.prefix != null && { prefix: dto.prefix.trim().toUpperCase() }),
        ...(dto.includeYear != null && { includeYear: dto.includeYear }),
        ...(dto.includeMonth != null && { includeMonth: dto.includeMonth }),
        ...(dto.padLength != null && { padLength: dto.padLength }),
        ...(dto.resetPolicy != null && { resetPolicy: dto.resetPolicy }),
        ...(dto.nextValue != null && { nextValue: dto.nextValue }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });
    return { ...updated, preview: previewDocumentNumber(updated) };
  }

  /**
   * Allocate next document number inside an existing transaction.
   * Seeds the series row if missing.
   */
  async allocateNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: NumberSeriesKey | string,
    date: Date = new Date(),
  ): Promise<string> {
    let series = await tx.documentNumberSeries.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });

    if (!series) {
      const def = DEFAULT_NUMBER_SERIES.find((d) => d.key === key);
      series = await tx.documentNumberSeries.create({
        data: {
          tenantId,
          key,
          name: def?.name ?? key,
          prefix: def?.prefix ?? key.slice(0, 3).toUpperCase(),
          includeYear: def?.includeYear ?? true,
          includeMonth: def?.includeMonth ?? false,
          padLength: def?.padLength ?? 5,
          resetPolicy: (def?.resetPolicy ?? 'YEARLY') as NumberSeriesResetPolicy,
          description: def?.description,
          nextValue: 1,
        },
      });
    }

    if (!series.isActive) {
      throw new BadRequestException(`Number series "${key}" is inactive`);
    }

    const resetKey = computeResetKey(series.resetPolicy, date);
    let seq = series.nextValue;
    if (series.lastResetKey !== resetKey) {
      seq = 1;
    }

    await tx.documentNumberSeries.update({
      where: { id: series.id },
      data: { nextValue: seq + 1, lastResetKey: resetKey },
    });

    return formatDocumentNumber({
      prefix: series.prefix,
      includeYear: series.includeYear,
      includeMonth: series.includeMonth,
      padLength: series.padLength,
      seq,
      date,
    });
  }

  // ── Preferences ──────────────────────────────────────────────────────

  async getPreferences(tenantId: string) {
    let prefs = await this.prisma.accountingPreference.findUnique({ where: { tenantId } });
    if (!prefs) {
      prefs = await this.prisma.accountingPreference.create({
        data: { tenantId, ...DEFAULT_ACCOUNTING_PREFERENCES },
      });
    }
    return prefs;
  }

  async updatePreferences(tenantId: string, dto: UpdateAccountingPreferencesDto) {
    await this.getPreferences(tenantId);

    if (dto.fiscalYearStartMonth != null) {
      try { assertFiscalYearStartMonth(dto.fiscalYearStartMonth); }
      catch (e) { throw new BadRequestException((e as Error).message); }
    }
    if (dto.decimalPlaces != null) {
      try { assertDecimalPlaces(dto.decimalPlaces); }
      catch (e) { throw new BadRequestException((e as Error).message); }
    }

    const accountIds = [
      dto.defaultCashAccountId,
      dto.defaultArAccountId,
      dto.defaultApAccountId,
      dto.defaultSalesAccountId,
      dto.defaultPurchaseAccountId,
      dto.defaultRetainedEarningsId,
    ].filter((id): id is string => !!id);

    if (accountIds.length) {
      const found = await this.prisma.account.count({
        where: { tenantId, id: { in: accountIds } },
      });
      if (found !== accountIds.length) {
        throw new BadRequestException('One or more default GL accounts are invalid');
      }
    }

    return this.prisma.accountingPreference.update({
      where: { tenantId },
      data: {
        ...(dto.requireJournalApproval != null && { requireJournalApproval: dto.requireJournalApproval }),
        ...(dto.allowPostDraft != null && { allowPostDraft: dto.allowPostDraft }),
        ...(dto.blockPostingClosedPeriod != null && { blockPostingClosedPeriod: dto.blockPostingClosedPeriod }),
        ...(dto.fiscalYearStartMonth != null && { fiscalYearStartMonth: dto.fiscalYearStartMonth }),
        ...(dto.decimalPlaces != null && { decimalPlaces: dto.decimalPlaces }),
        ...(dto.defaultCashAccountId !== undefined && { defaultCashAccountId: dto.defaultCashAccountId }),
        ...(dto.defaultArAccountId !== undefined && { defaultArAccountId: dto.defaultArAccountId }),
        ...(dto.defaultApAccountId !== undefined && { defaultApAccountId: dto.defaultApAccountId }),
        ...(dto.defaultSalesAccountId !== undefined && { defaultSalesAccountId: dto.defaultSalesAccountId }),
        ...(dto.defaultPurchaseAccountId !== undefined && { defaultPurchaseAccountId: dto.defaultPurchaseAccountId }),
        ...(dto.defaultRetainedEarningsId !== undefined && { defaultRetainedEarningsId: dto.defaultRetainedEarningsId }),
      },
    });
  }
}
