import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DepreciationMethod,
  FixedAssetStatus,
  FixedAssetTxnType,
  RoleType,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { JournalEntriesService } from './journal-entries.service';
import {
  buildDepreciationSchedule,
  computePeriodDepreciation,
  disposalGainLoss,
  monthPeriod,
  roundMoney,
} from './fixed-assets.helper';
import * as dayjs from 'dayjs';

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

@Injectable()
export class FixedAssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalEntriesService,
  ) {}

  // ── Categories ─────────────────────────────────────────────────────

  async listCategories(tenantId: string, includeInactive = false) {
    return this.prisma.fixedAssetCategory.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { code: 'asc' },
    });
  }

  async seedCategories(tenantId: string) {
    const defaults = [
      { code: 'FURN', name: 'Furniture & Fittings', usefulLifeMonths: 60, method: DepreciationMethod.STRAIGHT_LINE },
      { code: 'EQUIP', name: 'Equipment', usefulLifeMonths: 36, method: DepreciationMethod.STRAIGHT_LINE },
      { code: 'IT', name: 'IT / Computers', usefulLifeMonths: 36, method: DepreciationMethod.DECLINING_BALANCE, decliningRate: 40 },
      { code: 'VEH', name: 'Vehicles', usefulLifeMonths: 60, method: DepreciationMethod.STRAIGHT_LINE },
    ];
    let created = 0;
    for (const d of defaults) {
      const exists = await this.prisma.fixedAssetCategory.findFirst({
        where: { tenantId, code: d.code },
      });
      if (exists) continue;
      await this.prisma.fixedAssetCategory.create({
        data: {
          tenantId,
          code: d.code,
          name: d.name,
          usefulLifeMonths: d.usefulLifeMonths,
          method: d.method,
          decliningRate: d.decliningRate,
          residualValuePct: 5,
        },
      });
      created += 1;
    }
    return { created, message: created ? `Created ${created} categories` : 'Categories already seeded' };
  }

  async createCategory(
    tenantId: string,
    dto: {
      code: string;
      name: string;
      usefulLifeMonths?: number;
      residualValuePct?: number;
      method?: DepreciationMethod;
      decliningRate?: number;
      assetGlAccountId?: string;
      accumDepGlAccountId?: string;
      depExpenseGlAccountId?: string;
    },
  ) {
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name?.trim()) throw new BadRequestException('Code and name required');
    return this.prisma.fixedAssetCategory.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        usefulLifeMonths: dto.usefulLifeMonths ?? 60,
        residualValuePct: dto.residualValuePct ?? 0,
        method: dto.method ?? DepreciationMethod.STRAIGHT_LINE,
        decliningRate: dto.decliningRate,
        assetGlAccountId: dto.assetGlAccountId,
        accumDepGlAccountId: dto.accumDepGlAccountId,
        depExpenseGlAccountId: dto.depExpenseGlAccountId,
      },
    });
  }

  // ── Asset Register ─────────────────────────────────────────────────

  async listAssets(tenantId: string, status?: FixedAssetStatus, branchId?: string) {
    return this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        ...(status ? { status } : {}),
        ...(branchId ? { branchId } : {}),
      },
      orderBy: [{ code: 'asc' }],
      include: {
        category: { select: { id: true, code: true, name: true } },
        _count: { select: { depreciations: true } },
      },
    });
  }

  async getAsset(id: string, tenantId: string) {
    const asset = await this.prisma.fixedAsset.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        depreciations: { orderBy: { periodStart: 'asc' } },
        transactions: { orderBy: { txnDate: 'desc' }, take: 50 },
      },
    });
    if (!asset) throw new NotFoundException('Fixed asset not found');
    return asset;
  }

  async createAsset(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: {
      code: string;
      name: string;
      description?: string;
      categoryId?: string;
      acquisitionDate: string;
      cost: number;
      residualValue?: number;
      usefulLifeMonths?: number;
      method?: DepreciationMethod;
      decliningRate?: number;
      location?: string;
      serialNumber?: string;
      vendorName?: string;
      assetGlAccountId?: string;
      accumDepGlAccountId?: string;
      depExpenseGlAccountId?: string;
      postAcquisitionJournal?: boolean;
      contraGlAccountId?: string;
    },
  ) {
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name?.trim()) throw new BadRequestException('Code and name required');
    const cost = roundMoney(dto.cost);
    if (cost <= 0) throw new BadRequestException('Cost must be positive');

    let usefulLifeMonths = dto.usefulLifeMonths ?? 60;
    let method = dto.method ?? DepreciationMethod.STRAIGHT_LINE;
    let residualValue = dto.residualValue;
    let decliningRate = dto.decliningRate;
    let assetGl = dto.assetGlAccountId;
    let accumGl = dto.accumDepGlAccountId;
    let expGl = dto.depExpenseGlAccountId;

    if (dto.categoryId) {
      const cat = await this.prisma.fixedAssetCategory.findFirst({
        where: { id: dto.categoryId, tenantId },
      });
      if (!cat) throw new BadRequestException('Category not found');
      usefulLifeMonths = dto.usefulLifeMonths ?? cat.usefulLifeMonths;
      method = dto.method ?? cat.method;
      decliningRate = dto.decliningRate ?? cat.decliningRate ?? undefined;
      if (residualValue == null) {
        residualValue = roundMoney(cost * ((cat.residualValuePct || 0) / 100));
      }
      assetGl = assetGl ?? cat.assetGlAccountId ?? undefined;
      accumGl = accumGl ?? cat.accumDepGlAccountId ?? undefined;
      expGl = expGl ?? cat.depExpenseGlAccountId ?? undefined;
    }

    residualValue = roundMoney(residualValue ?? 0);
    if (residualValue >= cost) throw new BadRequestException('Residual must be less than cost');

    const asset = await this.prisma.fixedAsset.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        categoryId: dto.categoryId,
        code,
        name: dto.name.trim(),
        description: dto.description,
        acquisitionDate: dayjs(dto.acquisitionDate).toDate(),
        cost,
        residualValue,
        usefulLifeMonths,
        method,
        decliningRate,
        accumulatedDep: 0,
        bookValue: cost,
        location: dto.location,
        serialNumber: dto.serialNumber,
        vendorName: dto.vendorName,
        assetGlAccountId: assetGl,
        accumDepGlAccountId: accumGl,
        depExpenseGlAccountId: expGl,
        createdBy: userId,
      },
    });

    await this.prisma.fixedAssetTransaction.create({
      data: {
        tenantId,
        assetId: asset.id,
        type: FixedAssetTxnType.ACQUISITION,
        txnDate: asset.acquisitionDate,
        amount: cost,
        description: `Acquisition of ${asset.name}`,
        toBranchId: branchId || undefined,
        toLocation: dto.location,
        createdBy: userId,
      },
    });

    let journalEntryId: string | undefined;
    if (dto.postAcquisitionJournal) {
      const assetAccount =
        assetGl ?? (await this.resolveGlByCodes(tenantId, ['1510', '1500']));
      const contra =
        dto.contraGlAccountId ??
        (await this.resolveGlByCodes(tenantId, ['1200', '1100', '3000']));
      if (assetAccount && contra) {
        const je = await this.journals.create(tenantId, branchId ?? '', userId, SYSTEM_ROLES, {
          description: `Fixed asset acquisition: ${asset.code} ${asset.name}`,
          date: dayjs(asset.acquisitionDate).format('YYYY-MM-DD'),
          referenceType: 'FA_ACQUISITION',
          referenceId: asset.id,
          action: 'POST',
          glLines: [
            { accountId: assetAccount, side: 'DEBIT', amount: cost, description: asset.name },
            { accountId: contra, side: 'CREDIT', amount: cost, description: asset.name },
          ],
        });
        journalEntryId = je.id;
        await this.prisma.fixedAssetTransaction.updateMany({
          where: { assetId: asset.id, type: FixedAssetTxnType.ACQUISITION },
          data: { journalEntryId },
        });
      }
    }

    return { ...(await this.getAsset(asset.id, tenantId)), journalEntryId };
  }

  async updateAsset(
    id: string,
    tenantId: string,
    dto: {
      name?: string;
      description?: string | null;
      location?: string | null;
      serialNumber?: string | null;
      vendorName?: string | null;
      usefulLifeMonths?: number;
      residualValue?: number;
      method?: DepreciationMethod;
      decliningRate?: number | null;
      assetGlAccountId?: string | null;
      accumDepGlAccountId?: string | null;
      depExpenseGlAccountId?: string | null;
    },
  ) {
    const asset = await this.getAsset(id, tenantId);
    if (asset.status === FixedAssetStatus.DISPOSED) {
      throw new BadRequestException('Disposed assets cannot be edited');
    }
    return this.prisma.fixedAsset.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.location !== undefined ? { location: dto.location } : {}),
        ...(dto.serialNumber !== undefined ? { serialNumber: dto.serialNumber } : {}),
        ...(dto.vendorName !== undefined ? { vendorName: dto.vendorName } : {}),
        ...(dto.usefulLifeMonths != null ? { usefulLifeMonths: dto.usefulLifeMonths } : {}),
        ...(dto.residualValue != null ? { residualValue: roundMoney(dto.residualValue) } : {}),
        ...(dto.method != null ? { method: dto.method } : {}),
        ...(dto.decliningRate !== undefined ? { decliningRate: dto.decliningRate } : {}),
        ...(dto.assetGlAccountId !== undefined ? { assetGlAccountId: dto.assetGlAccountId } : {}),
        ...(dto.accumDepGlAccountId !== undefined ? { accumDepGlAccountId: dto.accumDepGlAccountId } : {}),
        ...(dto.depExpenseGlAccountId !== undefined ? { depExpenseGlAccountId: dto.depExpenseGlAccountId } : {}),
      },
    });
  }

  // ── Depreciation ───────────────────────────────────────────────────

  async getSchedule(id: string, tenantId: string) {
    const asset = await this.getAsset(id, tenantId);
    const projected = buildDepreciationSchedule({
      acquisitionDate: asset.acquisitionDate,
      cost: asset.cost,
      residualValue: asset.residualValue,
      usefulLifeMonths: asset.usefulLifeMonths,
      method: asset.method,
      decliningRate: asset.decliningRate,
    });
    const postedLabels = new Set(asset.depreciations.map((d) => d.periodLabel));
    return {
      asset: {
        id: asset.id,
        code: asset.code,
        name: asset.name,
        cost: asset.cost,
        residualValue: asset.residualValue,
        accumulatedDep: asset.accumulatedDep,
        bookValue: asset.bookValue,
        method: asset.method,
        usefulLifeMonths: asset.usefulLifeMonths,
        status: asset.status,
      },
      posted: asset.depreciations,
      schedule: projected.map((r) => ({
        ...r,
        posted: postedLabels.has(r.periodLabel),
      })),
    };
  }

  async runDepreciation(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    dto: { year: number; month: number; assetIds?: string[]; postToGl?: boolean },
  ) {
    if (dto.month < 1 || dto.month > 12) throw new BadRequestException('Invalid month');
    const { label, start, end } = monthPeriod(dto.year, dto.month - 1);

    const assets = await this.prisma.fixedAsset.findMany({
      where: {
        tenantId,
        status: { in: [FixedAssetStatus.ACTIVE, FixedAssetStatus.FULLY_DEPRECIATED] },
        ...(dto.assetIds?.length ? { id: { in: dto.assetIds } } : {}),
        method: { not: DepreciationMethod.NONE },
      },
    });

    const results: Array<{
      assetId: string;
      code: string;
      amount: number;
      skipped?: string;
      journalEntryId?: string;
    }> = [];

    for (const asset of assets) {
      if (asset.status === FixedAssetStatus.DISPOSED) {
        results.push({ assetId: asset.id, code: asset.code, amount: 0, skipped: 'disposed' });
        continue;
      }
      if (dayjs(asset.acquisitionDate).isAfter(end)) {
        results.push({ assetId: asset.id, code: asset.code, amount: 0, skipped: 'not yet acquired' });
        continue;
      }

      const existing = await this.prisma.fixedAssetDepreciation.findFirst({
        where: { assetId: asset.id, periodLabel: label },
      });
      if (existing) {
        results.push({ assetId: asset.id, code: asset.code, amount: 0, skipped: 'already posted' });
        continue;
      }

      const amount = computePeriodDepreciation({
        method: asset.method,
        cost: asset.cost,
        residualValue: asset.residualValue,
        usefulLifeMonths: asset.usefulLifeMonths,
        decliningRate: asset.decliningRate,
        accumulatedDep: asset.accumulatedDep,
        bookValue: asset.bookValue,
      });

      if (amount <= 0) {
        results.push({ assetId: asset.id, code: asset.code, amount: 0, skipped: 'no charge' });
        continue;
      }

      const accumAfter = roundMoney(asset.accumulatedDep + amount);
      const bookValueAfter = roundMoney(asset.cost - accumAfter);
      const fullyDep = bookValueAfter <= asset.residualValue + 0.001;

      let journalEntryId: string | undefined;
      if (dto.postToGl !== false) {
        const expGl =
          asset.depExpenseGlAccountId ??
          (await this.resolveGlByCodes(tenantId, ['5500', '5000']));
        const accumGl =
          asset.accumDepGlAccountId ??
          (await this.resolveGlByCodes(tenantId, ['1590', '1500']));
        if (!expGl || !accumGl) {
          throw new BadRequestException(
            `Missing depreciation GL accounts for asset ${asset.code} (need 5500 / 1590)`,
          );
        }
        const je = await this.journals.create(tenantId, branchId ?? '', userId, SYSTEM_ROLES, {
          description: `Depreciation ${label}: ${asset.code} ${asset.name}`,
          date: dayjs(end).format('YYYY-MM-DD'),
          referenceType: 'FA_DEPRECIATION',
          referenceId: `${asset.id}:${label}`,
          action: 'POST',
          glLines: [
            { accountId: expGl, side: 'DEBIT', amount, description: asset.name },
            { accountId: accumGl, side: 'CREDIT', amount, description: asset.name },
          ],
        });
        journalEntryId = je.id;
      }

      await this.prisma.fixedAssetDepreciation.create({
        data: {
          tenantId,
          assetId: asset.id,
          periodLabel: label,
          periodStart: start,
          periodEnd: end,
          amount,
          accumAfter,
          bookValueAfter,
          journalEntryId,
          createdBy: userId,
        },
      });

      await this.prisma.fixedAsset.update({
        where: { id: asset.id },
        data: {
          accumulatedDep: accumAfter,
          bookValue: bookValueAfter,
          status: fullyDep ? FixedAssetStatus.FULLY_DEPRECIATED : FixedAssetStatus.ACTIVE,
        },
      });

      await this.prisma.fixedAssetTransaction.create({
        data: {
          tenantId,
          assetId: asset.id,
          type: FixedAssetTxnType.DEPRECIATION,
          txnDate: end,
          amount,
          description: `Depreciation ${label}`,
          journalEntryId,
          createdBy: userId,
        },
      });

      results.push({ assetId: asset.id, code: asset.code, amount, journalEntryId });
    }

    const posted = results.filter((r) => r.amount > 0);
    return {
      periodLabel: label,
      postedCount: posted.length,
      totalAmount: roundMoney(posted.reduce((s, r) => s + r.amount, 0)),
      results,
    };
  }

  // ── Disposal ───────────────────────────────────────────────────────

  async disposeAsset(
    tenantId: string,
    branchId: string | undefined,
    userId: string,
    assetId: string,
    dto: {
      disposalDate?: string;
      proceeds?: number;
      notes?: string;
      proceedsGlAccountId?: string;
      gainLossGlAccountId?: string;
      postToGl?: boolean;
    },
  ) {
    const asset = await this.getAsset(assetId, tenantId);
    if (asset.status === FixedAssetStatus.DISPOSED) {
      throw new BadRequestException('Asset already disposed');
    }

    const proceeds = roundMoney(dto.proceeds ?? 0);
    const disposalDate = dto.disposalDate ? dayjs(dto.disposalDate).toDate() : new Date();
    const gainLoss = disposalGainLoss(asset.bookValue, proceeds);

    let journalEntryId: string | undefined;
    if (dto.postToGl !== false) {
      const assetGl =
        asset.assetGlAccountId ?? (await this.resolveGlByCodes(tenantId, ['1510', '1500']));
      const accumGl =
        asset.accumDepGlAccountId ?? (await this.resolveGlByCodes(tenantId, ['1590']));
      const cashGl =
        dto.proceedsGlAccountId ??
        (await this.resolveGlByCodes(tenantId, ['1100', '1200']));
      const plGl =
        dto.gainLossGlAccountId ??
        (await this.resolveGlByCodes(tenantId, ['4000', '5000', '3100']));

      if (!assetGl || !accumGl) {
        throw new BadRequestException('Asset / accumulated depreciation GL accounts required');
      }

      const glLines: Array<{ accountId: string; side: 'DEBIT' | 'CREDIT'; amount: number; description?: string }> = [];
      // Clear accum dep
      if (asset.accumulatedDep > 0) {
        glLines.push({
          accountId: accumGl,
          side: 'DEBIT',
          amount: asset.accumulatedDep,
          description: 'Clear accum. dep.',
        });
      }
      if (proceeds > 0 && cashGl) {
        glLines.push({
          accountId: cashGl,
          side: 'DEBIT',
          amount: proceeds,
          description: 'Disposal proceeds',
        });
      }
      if (gainLoss < 0 && plGl) {
        glLines.push({
          accountId: plGl,
          side: 'DEBIT',
          amount: Math.abs(gainLoss),
          description: 'Loss on disposal',
        });
      }
      // Credit asset cost
      glLines.push({
        accountId: assetGl,
        side: 'CREDIT',
        amount: asset.cost,
        description: 'Remove asset cost',
      });
      if (gainLoss > 0 && plGl) {
        glLines.push({
          accountId: plGl,
          side: 'CREDIT',
          amount: gainLoss,
          description: 'Gain on disposal',
        });
      }

      const debit = roundMoney(glLines.filter((l) => l.side === 'DEBIT').reduce((s, l) => s + l.amount, 0));
      const credit = roundMoney(glLines.filter((l) => l.side === 'CREDIT').reduce((s, l) => s + l.amount, 0));
      if (Math.abs(debit - credit) > 0.02) {
        // Balancing plug to P&L if needed
        const diff = roundMoney(credit - debit);
        if (plGl && diff !== 0) {
          glLines.push({
            accountId: plGl,
            side: diff > 0 ? 'DEBIT' : 'CREDIT',
            amount: Math.abs(diff),
            description: 'Disposal balancing',
          });
        }
      }

      const je = await this.journals.create(tenantId, branchId ?? '', userId, SYSTEM_ROLES, {
        description: `Dispose fixed asset: ${asset.code} ${asset.name}`,
        date: dayjs(disposalDate).format('YYYY-MM-DD'),
        referenceType: 'FA_DISPOSAL',
        referenceId: asset.id,
        action: 'POST',
        glLines,
      });
      journalEntryId = je.id;
    }

    await this.prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        status: FixedAssetStatus.DISPOSED,
        disposedAt: disposalDate,
        disposalProceeds: proceeds,
        disposalNotes: dto.notes,
        bookValue: 0,
      },
    });

    await this.prisma.fixedAssetTransaction.create({
      data: {
        tenantId,
        assetId: asset.id,
        type: FixedAssetTxnType.DISPOSAL,
        txnDate: disposalDate,
        amount: proceeds,
        description: dto.notes?.trim() || `Disposed (proceeds ${proceeds})`,
        journalEntryId,
        createdBy: userId,
      },
    });

    return {
      ...(await this.getAsset(asset.id, tenantId)),
      gainLoss,
      journalEntryId,
    };
  }

  // ── Transfers ──────────────────────────────────────────────────────

  async transferAsset(
    tenantId: string,
    userId: string,
    assetId: string,
    dto: {
      toBranchId?: string;
      toLocation?: string;
      transferDate?: string;
      notes?: string;
    },
  ) {
    const asset = await this.getAsset(assetId, tenantId);
    if (asset.status === FixedAssetStatus.DISPOSED) {
      throw new BadRequestException('Cannot transfer a disposed asset');
    }
    if (!dto.toBranchId && dto.toLocation == null) {
      throw new BadRequestException('toBranchId or toLocation required');
    }

    const txnDate = dto.transferDate ? dayjs(dto.transferDate).toDate() : new Date();
    await this.prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        ...(dto.toBranchId !== undefined ? { branchId: dto.toBranchId || null } : {}),
        ...(dto.toLocation !== undefined ? { location: dto.toLocation } : {}),
      },
    });

    await this.prisma.fixedAssetTransaction.create({
      data: {
        tenantId,
        assetId: asset.id,
        type: FixedAssetTxnType.TRANSFER,
        txnDate,
        description: dto.notes?.trim() || 'Asset transfer',
        fromBranchId: asset.branchId,
        toBranchId: dto.toBranchId ?? asset.branchId,
        fromLocation: asset.location,
        toLocation: dto.toLocation ?? asset.location,
        createdBy: userId,
      },
    });

    return this.getAsset(asset.id, tenantId);
  }

  // ── Register summary ───────────────────────────────────────────────

  async getRegisterSummary(tenantId: string) {
    const assets = await this.prisma.fixedAsset.findMany({ where: { tenantId } });
    const active = assets.filter((a) => a.status === FixedAssetStatus.ACTIVE);
    const disposed = assets.filter((a) => a.status === FixedAssetStatus.DISPOSED);
    return {
      totalAssets: assets.length,
      activeCount: active.length,
      disposedCount: disposed.length,
      fullyDepreciatedCount: assets.filter((a) => a.status === FixedAssetStatus.FULLY_DEPRECIATED).length,
      totalCost: roundMoney(active.reduce((s, a) => s + a.cost, 0)),
      totalAccumDep: roundMoney(active.reduce((s, a) => s + a.accumulatedDep, 0)),
      totalBookValue: roundMoney(active.reduce((s, a) => s + a.bookValue, 0)),
    };
  }

  private async resolveGlByCodes(tenantId: string, codes: string[]): Promise<string | null> {
    const acct = await this.prisma.account.findFirst({
      where: { tenantId, isActive: true, code: { in: codes } },
      orderBy: { code: 'asc' },
    });
    return acct?.id ?? null;
  }
}
