/** Auto-provision COA, fiscal year, cash books, tax rates, and GL mappings for a tenant. */

import { Injectable, Logger } from '@nestjs/common';
import { BankAccountType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { defaultCoaSeed, normalizeAccountCode } from './coa.helper';
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
  purchase: '1400', // inventory / purchases
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
    preferencesLinked: boolean;
  }> {
    const coa = await this.upsertDefaultCoa(tenantId);
    const cashAccountsCreated = await this.ensureCashBankAccounts(tenantId, coa.codeToId);
    await this.linkPreferences(tenantId, coa.codeToId);
    const fiscalYearCreated = await this.ensureCurrentFiscalYear(tenantId, userId, coa.codeToId);
    await this.settings.ensureNumberSeries(tenantId);
    try {
      await this.tax.seedDefaultTaxRates(tenantId);
    } catch (err) {
      this.logger.warn(`Tax seed skipped for ${tenantId}: ${(err as Error).message}`);
    }

    this.logger.log(
      `Accounting bootstrap tenant=${tenantId} created=${coa.created} existing=${coa.existing} fy=${fiscalYearCreated}`,
    );

    return {
      accountsCreated: coa.created,
      accountsExisting: coa.existing,
      fiscalYearCreated,
      cashAccountsCreated,
      preferencesLinked: true,
    };
  }

  /** Upsert default COA by code — never fails if some accounts already exist. */
  async upsertDefaultCoa(tenantId: string) {
    const seed = defaultCoaSeed();
    // Parents first
    const ordered = [...seed].sort((a, b) => Number(!!a.parentCode) - Number(!!b.parentCode));
    // Multi-pass so deep parents resolve
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
        if (row.parentCode && !parentId) continue; // wait for parent
        try {
          const acc = await this.prisma.account.create({
            data: {
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
          });
          codeToId.set(code, acc.id);
          created++;
        } catch (err) {
          // concurrent create — re-read
          const again = await this.prisma.account.findFirst({
            where: { tenantId, code },
            select: { id: true },
          });
          if (again) codeToId.set(code, again.id);
          else this.logger.warn(`COA create failed ${code}: ${(err as Error).message}`);
        }
      }
    }

    return { created, existing: existing.length, codeToId };
  }

  private async ensureCashBankAccounts(tenantId: string, codeToId: Map<string, string>) {
    const specs: { code: string; name: string; type: BankAccountType; glCode: string }[] = [
      { code: 'CASH-01', name: 'Cash in Hand', type: BankAccountType.CASH_IN_HAND, glCode: CODE.cash },
      { code: 'PETTY-01', name: 'Petty Cash', type: BankAccountType.PETTY_CASH, glCode: CODE.petty },
    ];
    let created = 0;
    for (const s of specs) {
      const exists = await this.prisma.bankAccount.findFirst({
        where: { tenantId, code: s.code },
        select: { id: true },
      });
      if (exists) continue;
      const glAccountId = codeToId.get(s.glCode) ?? null;
      await this.prisma.bankAccount.create({
        data: {
          tenantId,
          code: s.code,
          name: s.name,
          type: s.type,
          currency: 'LKR',
          openingBalance: 0,
          currentBalance: 0,
          glAccountId: glAccountId ?? undefined,
          isActive: true,
        },
      });
      created++;
    }
    return created;
  }

  private async linkPreferences(tenantId: string, codeToId: Map<string, string>) {
    const data: Prisma.AccountingPreferenceUpsertArgs['create'] = {
      tenantId,
      requireJournalApproval: false,
      allowPostDraft: true,
      blockPostingClosedPeriod: true,
      fiscalYearStartMonth: 1,
      decimalPlaces: 2,
      defaultCashAccountId: codeToId.get(CODE.cash) ?? null,
      defaultArAccountId: codeToId.get(CODE.ar) ?? null,
      defaultApAccountId: codeToId.get(CODE.ap) ?? null,
      defaultSalesAccountId: codeToId.get(CODE.sales) ?? null,
      defaultPurchaseAccountId: codeToId.get(CODE.purchase) ?? null,
      defaultRetainedEarningsId: codeToId.get(CODE.retained) ?? null,
    };

    await this.prisma.accountingPreference.upsert({
      where: { tenantId },
      create: data,
      update: {
        // Only fill missing mappings — don't overwrite tenant customizations
        ...(data.defaultCashAccountId && {
          defaultCashAccountId: undefined, // handled below
        }),
      },
    });

    const prefs = await this.prisma.accountingPreference.findUnique({ where: { tenantId } });
    if (!prefs) return;

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
      this.logger.warn(`Fiscal year create skipped: ${(err as Error).message}`);
      return false;
    }
  }
}
