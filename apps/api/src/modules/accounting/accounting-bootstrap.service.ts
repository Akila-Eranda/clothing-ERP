/** Auto-provision COA, fiscal year, cash books, tax rates, and GL mappings for a tenant. */

import { Injectable, Logger } from '@nestjs/common';
import { BankAccountType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { defaultCoaSeed, normalizeAccountCode } from './coa.helper';
import {
  ACCOUNT_MAPPING_CODE_FALLBACKS,
  ACCOUNT_MAPPING_KEYS,
  ACCOUNT_MAPPING_LABELS,
  AccountMappingKey,
} from './account-mapping.helper';
import { AccountingSettingsService } from './accounting-settings.service';
import { FinancialPeriodsService } from './financial-periods.service';
import { TaxService } from './tax.service';

const CODE = {
  cash: '1100',
  petty: '1110',
  bank: '1200',
  ar: '1300',
  inventory: '1400',
  ap: '2100',
  sales: '4100',
  cogs: '5100',
  retained: '3100',
  purchase: '1400',
} as const;

@Injectable()
export class AccountingBootstrapService {
  private readonly logger = new Logger(AccountingBootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AccountingSettingsService,
    private readonly periods: FinancialPeriodsService,
    private readonly tax: TaxService,
  ) {}

  /**
   * Idempotent full accounting setup for a tenant.
   * Safe to call on every tenant.registered and from the bootstrap API.
   */
  async bootstrapTenant(tenantId: string, userId = 'system'): Promise<{
    accountsCreated: number;
    accountsExisting: number;
    fiscalYearCreated: boolean;
    cashAccountsCreated: number;
    mappingsCreated: number;
    preferencesLinked: boolean;
  }> {
    const coa = await this.upsertDefaultCoa(tenantId);
    const cashAccountsCreated = await this.ensureCashBankAccounts(tenantId, coa.codeToId);
    await this.linkPreferences(tenantId, coa.codeToId);
    const mappingsCreated = await this.seedAccountMappings(tenantId, coa.codeToId);
    const fiscalYearCreated = await this.ensureCurrentFiscalYear(tenantId, userId, coa.codeToId);
    await this.settings.ensureNumberSeries(tenantId);
    await this.tax.seedDefaultTaxRates(tenantId);

    this.logger.log(
      `Accounting bootstrap tenant=${tenantId} created=${coa.created} existing=${coa.existing} fy=${fiscalYearCreated} maps=${mappingsCreated}`,
    );

    return {
      accountsCreated: coa.created,
      accountsExisting: coa.existing,
      fiscalYearCreated,
      cashAccountsCreated,
      mappingsCreated,
      preferencesLinked: true,
    };
  }

  /** Upsert default COA by code — never fails if some accounts already exist. */
  async upsertDefaultCoa(tenantId: string) {
    const seed = defaultCoaSeed();
    const ordered = [...seed].sort((a, b) => Number(!!a.parentCode) - Number(!!b.parentCode));
    const codeToId = new Map<string, string>();
    const existing = await this.prisma.account.findMany({
      where: { tenantId },
      select: { id: true, code: true },
    });
    for (const e of existing) codeToId.set(normalizeAccountCode(e.code), e.id);

    let created = 0;
    for (let pass = 0; pass < 3; pass++) {
      for (const row of ordered) {
        const code = normalizeAccountCode(row.code);
        if (codeToId.has(code)) continue;
        const parentId = row.parentCode
          ? codeToId.get(normalizeAccountCode(row.parentCode)) ?? null
          : null;
        if (row.parentCode && !parentId) continue;
        const inserted = await this.prisma.account.createMany({
          data: [
            {
              tenantId,
              code,
              name: row.name,
              type: row.type,
              description: row.description ?? null,
              parentId,
              isSystem: true,
              openingBalance: 0,
              balance: 0,
            },
          ],
          skipDuplicates: true,
        });
        const acc = await this.prisma.account.findFirst({
          where: { tenantId, code },
          select: { id: true },
        });
        if (!acc) throw new Error(`Default account ${code} was not available after provisioning`);
        codeToId.set(code, acc.id);
        created += inserted.count;
      }
    }

    return { created, existing: existing.length, codeToId };
  }

  /** Public — fill preference mappings + account mapping keys. */
  async ensureMappings(tenantId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, code: true },
    });
    const codeToId = new Map(accounts.map((a) => [normalizeAccountCode(a.code), a.id]));
    await this.linkPreferences(tenantId, codeToId);
    await this.ensureCashBankAccounts(tenantId, codeToId);
    await this.seedAccountMappings(tenantId, codeToId);
  }

  async seedAccountMappings(tenantId: string, codeToId?: Map<string, string>) {
    let map = codeToId;
    if (!map) {
      const accounts = await this.prisma.account.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, code: true },
      });
      map = new Map(accounts.map((a) => [normalizeAccountCode(a.code), a.id]));
    }

    const existing = await this.prisma.accountMapping.findMany({
      where: { tenantId },
      select: { key: true },
    });
    const have = new Set(existing.map((e) => e.key));
    const missing: Prisma.AccountMappingCreateManyInput[] = [];

    for (const key of ACCOUNT_MAPPING_KEYS) {
      if (have.has(key)) continue;
      const accountId = this.pickAccountId(map, key);
      if (!accountId) continue;
      missing.push({ tenantId, key, accountId, label: ACCOUNT_MAPPING_LABELS[key] });
    }
    if (!missing.length) return 0;
    const result = await this.prisma.accountMapping.createMany({
      data: missing,
      skipDuplicates: true,
    });
    return result.count;
  }

  private pickAccountId(codeToId: Map<string, string>, key: AccountMappingKey): string | null {
    for (const code of ACCOUNT_MAPPING_CODE_FALLBACKS[key]) {
      const id = codeToId.get(normalizeAccountCode(code));
      if (id) return id;
    }
    return null;
  }

  private async ensureCashBankAccounts(tenantId: string, codeToId: Map<string, string>) {
    const specs: { code: string; name: string; type: BankAccountType; glCode: string }[] = [
      { code: 'CASH-01', name: 'Cash on Hand', type: BankAccountType.CASH_IN_HAND, glCode: CODE.cash },
      { code: 'PETTY-01', name: 'Petty Cash', type: BankAccountType.PETTY_CASH, glCode: CODE.petty },
      { code: 'BANK-01', name: 'Bank — Main', type: BankAccountType.CURRENT, glCode: CODE.bank },
    ];
    const existing = await this.prisma.bankAccount.findMany({
      where: { tenantId, code: { in: specs.map((spec) => spec.code) } },
      select: { code: true },
    });
    const have = new Set(existing.map((row) => row.code));
    const missing = specs
      .filter((spec) => !have.has(spec.code))
      .map((spec) => ({
        tenantId,
        code: spec.code,
        name: spec.name,
        type: spec.type,
        currency: 'LKR',
        openingBalance: 0,
        currentBalance: 0,
        glAccountId: codeToId.get(spec.glCode) ?? undefined,
        isActive: true,
      }));
    if (!missing.length) return 0;
    const result = await this.prisma.bankAccount.createMany({
      data: missing,
      skipDuplicates: true,
    });
    return result.count;
  }

  private async linkPreferences(tenantId: string, codeToId: Map<string, string>) {
    const data: Prisma.AccountingPreferenceUpsertArgs['create'] = {
      tenantId,
      requireJournalApproval: false,
      allowPostDraft: true,
      blockPostingClosedPeriod: true,
      fiscalYearStartMonth: 1,
      decimalPlaces: 2,
      autoPostEnabled: true,
      repairVatEnabled: false,
      defaultCashAccountId: codeToId.get(CODE.cash) ?? null,
      defaultArAccountId: codeToId.get(CODE.ar) ?? null,
      defaultApAccountId: codeToId.get(CODE.ap) ?? null,
      defaultSalesAccountId: codeToId.get(CODE.sales) ?? null,
      defaultPurchaseAccountId: codeToId.get(CODE.purchase) ?? null,
      defaultRetainedEarningsId: codeToId.get(CODE.retained) ?? null,
    };

    await this.prisma.accountingPreference.createMany({
      data: [data],
      skipDuplicates: true,
    });

    const prefs = await this.prisma.accountingPreference.findUniqueOrThrow({
      where: { tenantId },
    });

    await this.prisma.accountingPreference.update({
      where: { tenantId },
      data: {
        requireJournalApproval: false,
        allowPostDraft: true,
        defaultCashAccountId: prefs.defaultCashAccountId ?? data.defaultCashAccountId,
        defaultArAccountId: prefs.defaultArAccountId ?? data.defaultArAccountId,
        defaultApAccountId: prefs.defaultApAccountId ?? data.defaultApAccountId,
        defaultSalesAccountId: prefs.defaultSalesAccountId ?? data.defaultSalesAccountId,
        defaultPurchaseAccountId: prefs.defaultPurchaseAccountId ?? data.defaultPurchaseAccountId,
        defaultRetainedEarningsId: prefs.defaultRetainedEarningsId ?? data.defaultRetainedEarningsId,
        autoPostEnabled: prefs.autoPostEnabled ?? true,
        repairVatEnabled: prefs.repairVatEnabled ?? false,
      },
    });
  }

  private async ensureCurrentFiscalYear(
    tenantId: string,
    userId: string,
    codeToId: Map<string, string>,
  ): Promise<boolean> {
    const existing = await this.prisma.fiscalYear.findFirst({
      where: { tenantId },
      select: { id: true },
    });
    if (existing) return false;

    const year = new Date().getFullYear();
    try {
      await this.periods.createFiscalYear(tenantId, userId, {
        name: `FY ${year}`,
        startDate: `${year}-01-01`,
        endDate: `${year}-12-31`,
        setCurrent: true,
        retainedEarningsAccountId: codeToId.get(CODE.retained),
      });
      return true;
    } catch (err) {
      const duplicateCreate =
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') ||
        (err instanceof Error &&
          /already exists|overlaps existing fiscal year/i.test(err.message));
      if (duplicateCreate) {
        const createdConcurrently = await this.prisma.fiscalYear.findFirst({
          where: { tenantId },
          select: { id: true },
        });
        if (createdConcurrently) return false;
      }
      throw err;
    }
  }
}
