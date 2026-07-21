/** Shared Document Numbering Engine — tenant-scoped transactional allocate. */

import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NumberSeriesResetPolicy, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import {
  assertNextValue,
  assertPadLength,
  computeResetKey,
  DEFAULT_NUMBER_SERIES,
  formatDocumentNumber,
  isValidSeriesKey,
  NumberSeriesKey,
  previewDocumentNumber,
  shouldUseCompactDate,
} from './document-numbering.helper';

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

@Injectable()
export class DocumentNumberingService {
  private readonly logger = new Logger(DocumentNumberingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Feature flag — set FEATURE_DOCUMENT_NUMBERING_ENGINE=false to force legacy
   * generators in POS / procurement / returns. Journals always use this engine.
   */
  isEngineEnabled(): boolean {
    const v = this.config.get<string>('FEATURE_DOCUMENT_NUMBERING_ENGINE');
    if (v === undefined || v === null || v === '') return true;
    return v === 'true' || v === '1' || v === 'yes';
  }

  async ensureDefaults(tenantId: string) {
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
    await this.syncSequenceFloors(tenantId);
    return this.listSeries(tenantId);
  }

  async listSeries(tenantId: string) {
    await this.ensureSeeded(tenantId);
    const rows = await this.prisma.documentNumberSeries.findMany({
      where: { tenantId },
      orderBy: { key: 'asc' },
    });
    return rows.map((r) => ({
      ...r,
      preview: previewDocumentNumber(r),
    }));
  }

  async getSeries(tenantId: string, key: string) {
    await this.ensureSeeded(tenantId);
    const row = await this.prisma.documentNumberSeries.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!row) throw new NotFoundException(`Number series "${key}" not found`);
    return { ...row, preview: previewDocumentNumber(row) };
  }

  async updateSeries(tenantId: string, key: string, dto: UpdateNumberSeriesDto) {
    await this.ensureSeeded(tenantId);
    const row = await this.prisma.documentNumberSeries.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    if (!row) throw new NotFoundException(`Number series "${key}" not found`);

    if (dto.prefix != null && !dto.prefix.trim()) {
      throw new BadRequestException('Prefix is required');
    }
    if (dto.padLength != null) {
      try {
        assertPadLength(dto.padLength);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }
    if (dto.nextValue != null) {
      try {
        assertNextValue(dto.nextValue);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
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
   * Prefer this over allocateStandalone so the number is only consumed if the document commits.
   */
  async allocate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: NumberSeriesKey | string,
    date: Date = new Date(),
  ): Promise<string> {
    if (key && !isValidSeriesKey(key) && !DEFAULT_NUMBER_SERIES.some((d) => d.key === key)) {
      this.logger.debug(`Allocating custom number series key: ${key}`);
    }

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

    // Raise floor from existing docs so we never collide with legacy numbers
    const floor = await this.computeFloor(tx, tenantId, key, date);
    if (series.lastResetKey !== resetKey) {
      await tx.documentNumberSeries.update({
        where: { id: series.id },
        data: { nextValue: Math.max(1, floor), lastResetKey: resetKey },
      });
    } else if (floor > series.nextValue) {
      await tx.documentNumberSeries.update({
        where: { id: series.id },
        data: { nextValue: floor },
      });
    }

    // Atomic increment with period reset (Postgres)
    const rows = await tx.$queryRaw<
      Array<{
        nextValue: number;
        prefix: string;
        includeYear: boolean;
        includeMonth: boolean;
        padLength: number;
        resetPolicy: NumberSeriesResetPolicy;
      }>
    >`
      UPDATE "document_number_series"
      SET
        "nextValue" = CASE
          WHEN "lastResetKey" IS DISTINCT FROM ${resetKey} THEN 2
          ELSE "nextValue" + 1
        END,
        "lastResetKey" = ${resetKey},
        "updatedAt" = NOW()
      WHERE "id" = ${series.id} AND "isActive" = true
      RETURNING "nextValue", "prefix", "includeYear", "includeMonth", "padLength", "resetPolicy"
    `;

    if (!rows.length) {
      throw new BadRequestException(`Number series "${key}" is inactive or missing`);
    }

    const updated = rows[0];
    const seq = updated.nextValue - 1;

    return formatDocumentNumber({
      prefix: updated.prefix,
      includeYear: updated.includeYear,
      includeMonth: updated.includeMonth,
      padLength: updated.padLength,
      seq,
      date,
      compactDate: shouldUseCompactDate(updated),
    });
  }

  /** Allocate in a short dedicated transaction (when caller has no open tx yet). */
  async allocateStandalone(
    tenantId: string,
    key: NumberSeriesKey | string,
    date: Date = new Date(),
  ): Promise<string> {
    return this.prisma.$transaction((tx) => this.allocate(tx, tenantId, key, date));
  }

  /** @deprecated Prefer allocate() — kept for AccountingSettingsService façade. */
  async allocateNumber(
    tx: Prisma.TransactionClient,
    tenantId: string,
    key: NumberSeriesKey | string,
    date: Date = new Date(),
  ): Promise<string> {
    return this.allocate(tx, tenantId, key, date);
  }

  private async ensureSeeded(tenantId: string) {
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
      await this.syncSequenceFloors(tenantId);
    } else if (count < DEFAULT_NUMBER_SERIES.length) {
      await this.ensureDefaults(tenantId);
    }
  }

  /**
   * Raise nextValue so we never re-issue numbers already present in legacy docs.
   * Best-effort; safe to call repeatedly.
   */
  async syncSequenceFloors(tenantId: string): Promise<void> {
    const now = new Date();
    for (const def of DEFAULT_NUMBER_SERIES) {
      const floor = await this.computeFloor(this.prisma, tenantId, def.key, now);
      const resetKey = computeResetKey(def.resetPolicy, now);
      const row = await this.prisma.documentNumberSeries.findUnique({
        where: { tenantId_key: { tenantId, key: def.key } },
      });
      if (!row) continue;

      if (row.lastResetKey !== resetKey) {
        await this.prisma.documentNumberSeries.update({
          where: { id: row.id },
          data: { nextValue: Math.max(1, floor), lastResetKey: resetKey },
        });
      } else if (row.nextValue < floor) {
        await this.prisma.documentNumberSeries.update({
          where: { id: row.id },
          data: { nextValue: floor },
        });
      }
    }
  }

  private async computeFloor(
    db: Prisma.TransactionClient | PrismaService,
    tenantId: string,
    key: string,
    date: Date,
  ): Promise<number> {
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const dayStart = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );
    try {
      switch (key) {
        case 'INVOICE':
          return (
            (await db.sale.count({
              where: { tenantId, invoiceDate: { gte: dayStart } },
            })) + 1
          );
        case 'PURCHASE_ORDER':
          return (
            (await db.purchaseOrder.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            })) + 1
          );
        case 'PURCHASE_REQUEST':
          return (
            (await db.purchaseRequest.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            })) + 1
          );
        case 'GRN':
          return (
            (await db.goodsReceipt.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            })) + 1
          );
        case 'SUPPLIER_RETURN':
          return (
            (await db.supplierReturn.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            })) + 1
          );
        case 'SUPPLIER_INVOICE':
          return (
            (await db.supplierInvoice.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            })) + 1
          );
        case 'RETURN':
        case 'EXCHANGE':
          return (
            (await db.return.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            })) + 1
          );
        case 'JOURNAL':
        case 'YEAR_END_JOURNAL':
          return (
            (await db.journalEntry.count({
              where: { tenantId, createdAt: { gte: yearStart } },
            })) + 1
          );
        default:
          return 1;
      }
    } catch (e) {
      this.logger.warn(`computeFloor(${key}) failed: ${(e as Error).message}`);
      return 1;
    }
  }
}
