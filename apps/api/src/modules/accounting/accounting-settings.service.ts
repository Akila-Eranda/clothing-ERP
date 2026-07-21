/** Phase 06 Sprint 13 — Accounting settings service (number series → Document Numbering Engine). */

import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { AuditLogService } from '@/modules/audit-log/audit-log.module';
import {
  DocumentNumberingService,
  UpdateNumberSeriesDto,
} from '@/modules/document-numbering/document-numbering.service';
import {
  assertDecimalPlaces,
  assertFiscalYearStartMonth,
  DEFAULT_ACCOUNTING_PREFERENCES,
  NumberSeriesKey,
} from './accounting-settings.helper';
import {
  ACCOUNT_MAPPING_KEYS,
  ACCOUNT_MAPPING_LABELS,
  AccountMappingKey,
} from './account-mapping.helper';

export type { UpdateNumberSeriesDto };

export type UpdateAccountingPreferencesDto = {
  requireJournalApproval?: boolean;
  allowPostDraft?: boolean;
  blockPostingClosedPeriod?: boolean;
  fiscalYearStartMonth?: number;
  decimalPlaces?: number;
  autoPostEnabled?: boolean;
  repairVatEnabled?: boolean;
  defaultCashAccountId?: string | null;
  defaultArAccountId?: string | null;
  defaultApAccountId?: string | null;
  defaultSalesAccountId?: string | null;
  defaultPurchaseAccountId?: string | null;
  defaultRetainedEarningsId?: string | null;
};

@Injectable()
export class AccountingSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbering: DocumentNumberingService,
    @Optional() private readonly audit?: AuditLogService,
  ) {}

  // ── Number series (delegates to Document Numbering Engine) ───────────

  ensureNumberSeries(tenantId: string) {
    return this.numbering.ensureDefaults(tenantId);
  }

  listNumberSeries(tenantId: string) {
    return this.numbering.listSeries(tenantId);
  }

  updateNumberSeries(tenantId: string, key: string, dto: UpdateNumberSeriesDto) {
    return this.numbering.updateSeries(tenantId, key, dto);
  }

  /** Allocate next document number inside an existing transaction. */
  allocateNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: NumberSeriesKey | string,
    date: Date = new Date(),
  ): Promise<string> {
    return this.numbering.allocate(tx, tenantId, key, date);
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
        ...(dto.autoPostEnabled != null && { autoPostEnabled: dto.autoPostEnabled }),
        ...(dto.repairVatEnabled != null && { repairVatEnabled: dto.repairVatEnabled }),
        ...(dto.defaultCashAccountId !== undefined && { defaultCashAccountId: dto.defaultCashAccountId }),
        ...(dto.defaultArAccountId !== undefined && { defaultArAccountId: dto.defaultArAccountId }),
        ...(dto.defaultApAccountId !== undefined && { defaultApAccountId: dto.defaultApAccountId }),
        ...(dto.defaultSalesAccountId !== undefined && { defaultSalesAccountId: dto.defaultSalesAccountId }),
        ...(dto.defaultPurchaseAccountId !== undefined && { defaultPurchaseAccountId: dto.defaultPurchaseAccountId }),
        ...(dto.defaultRetainedEarningsId !== undefined && { defaultRetainedEarningsId: dto.defaultRetainedEarningsId }),
      },
    });
  }

  async listAccountMappings(tenantId: string) {
    const rows = await this.prisma.accountMapping.findMany({
      where: { tenantId },
      include: { account: { select: { id: true, code: true, name: true, type: true } } },
      orderBy: { key: 'asc' },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return ACCOUNT_MAPPING_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        key,
        label: ACCOUNT_MAPPING_LABELS[key],
        accountId: row?.accountId ?? null,
        account: row?.account ?? null,
      };
    });
  }

  async upsertAccountMapping(tenantId: string, key: string, accountId: string) {
    if (!ACCOUNT_MAPPING_KEYS.includes(key as AccountMappingKey)) {
      throw new BadRequestException(`Unknown mapping key: ${key}`);
    }
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, tenantId, isActive: true },
    });
    if (!account) throw new BadRequestException('Invalid account');

    const row = await this.prisma.accountMapping.upsert({
      where: { tenantId_key: { tenantId, key } },
      create: {
        tenantId,
        key,
        accountId,
        label: ACCOUNT_MAPPING_LABELS[key as AccountMappingKey],
      },
      update: { accountId },
      include: { account: { select: { id: true, code: true, name: true, type: true } } },
    });
    await this.audit?.log({
      tenantId,
      action: 'UPDATE',
      resource: 'account_mapping',
      resourceId: row.id,
      newData: { key, accountId, code: row.account.code },
    });
    return row;
  }

  async bulkUpsertAccountMappings(
    tenantId: string,
    mappings: Array<{ key: string; accountId: string }>,
  ) {
    const results = [];
    for (const m of mappings) {
      results.push(await this.upsertAccountMapping(tenantId, m.key, m.accountId));
    }
    return results;
  }
}
