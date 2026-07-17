import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  RoleType,
  TaxDirection,
  VatReturnStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { JournalEntriesService } from './journal-entries.service';
import {
  assertValidTaxRate,
  calculateLineTax,
  computeVatPeriodTotals,
  defaultTaxSeed,
  roundTax,
} from './tax.helper';
import * as dayjs from 'dayjs';

const SYSTEM_ROLES = [RoleType.TENANT_ADMIN];

@Injectable()
export class TaxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly journals: JournalEntriesService,
  ) {}

  // ── Tax Master ────────────────────────────────────────────────────

  async listTaxRates(tenantId: string, includeInactive = false) {
    return this.prisma.taxRate.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: [{ isDefault: 'desc' }, { rate: 'desc' }, { code: 'asc' }],
    });
  }

  async createTaxRate(
    tenantId: string,
    dto: {
      code: string;
      name: string;
      rate: number;
      direction?: TaxDirection;
      isDefault?: boolean;
      isInclusive?: boolean;
      description?: string;
      outputGlAccountId?: string;
      inputGlAccountId?: string;
      effectiveFrom?: string;
      effectiveTo?: string;
    },
  ) {
    assertValidTaxRate(dto.rate);
    const code = dto.code.trim().toUpperCase();
    if (!code || !dto.name?.trim()) throw new BadRequestException('Code and name required');

    if (dto.isDefault) {
      await this.prisma.taxRate.updateMany({
        where: { tenantId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.taxRate.create({
      data: {
        tenantId,
        code,
        name: dto.name.trim(),
        rate: dto.rate,
        direction: dto.direction ?? TaxDirection.BOTH,
        isDefault: !!dto.isDefault,
        isInclusive: !!dto.isInclusive,
        description: dto.description,
        outputGlAccountId: dto.outputGlAccountId,
        inputGlAccountId: dto.inputGlAccountId,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      },
    });
  }

  async updateTaxRate(
    id: string,
    tenantId: string,
    dto: {
      name?: string;
      rate?: number;
      direction?: TaxDirection;
      isDefault?: boolean;
      isActive?: boolean;
      isInclusive?: boolean;
      description?: string | null;
      outputGlAccountId?: string | null;
      inputGlAccountId?: string | null;
      effectiveFrom?: string | null;
      effectiveTo?: string | null;
    },
  ) {
    const existing = await this.prisma.taxRate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Tax rate not found');
    if (dto.rate != null) assertValidTaxRate(dto.rate);

    if (dto.isDefault) {
      await this.prisma.taxRate.updateMany({
        where: { tenantId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.taxRate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.rate !== undefined && { rate: dto.rate }),
        ...(dto.direction !== undefined && { direction: dto.direction }),
        ...(dto.isDefault !== undefined && { isDefault: dto.isDefault }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.isInclusive !== undefined && { isInclusive: dto.isInclusive }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.outputGlAccountId !== undefined && { outputGlAccountId: dto.outputGlAccountId }),
        ...(dto.inputGlAccountId !== undefined && { inputGlAccountId: dto.inputGlAccountId }),
        ...(dto.effectiveFrom !== undefined && {
          effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
        }),
        ...(dto.effectiveTo !== undefined && {
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
      },
    });
  }

  async seedDefaultTaxRates(tenantId: string) {
    const existing = await this.prisma.taxRate.count({ where: { tenantId } });
    if (existing > 0) {
      return { created: 0, message: 'Tax rates already exist' };
    }

    const vatPayable = await this.prisma.account.findFirst({
      where: { tenantId, code: '2200', isActive: true },
    });
    const vatInput = await this.prisma.account.findFirst({
      where: { tenantId, code: '2210', isActive: true },
    });

    const seed = defaultTaxSeed();
    const created = [];
    for (const row of seed) {
      created.push(
        await this.prisma.taxRate.create({
          data: {
            tenantId,
            code: row.code,
            name: row.name,
            rate: row.rate,
            direction: row.direction as TaxDirection,
            isDefault: !!row.isDefault,
            description: row.description,
            outputGlAccountId: vatPayable?.id,
            inputGlAccountId: vatInput?.id,
          },
        }),
      );
    }
    return { created: created.length, rates: created };
  }

  calculatePreview(amount: number, rate: number, inclusive = false) {
    return calculateLineTax(amount, rate, inclusive);
  }

  // ── VAT Calculations / Reports ────────────────────────────────────

  async getVatReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const from = dayjs(startDate).startOf('day').toDate();
    const to = dayjs(endDate).endOf('day').toDate();
    const saleWhere = {
      tenantId,
      status: { not: 'CANCELLED' as const },
      invoiceDate: { gte: from, lte: to },
      ...(branchId ? { branchId } : {}),
    };

    const [salesAgg, byTaxRate, purchaseOrders, supplierInvoices] = await Promise.all([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _sum: { total: true, taxAmount: true, subtotal: true, discountAmount: true },
        _count: { id: true },
      }),
      this.prisma.saleItem.groupBy({
        by: ['taxRate'],
        where: { sale: saleWhere },
        _sum: { taxAmount: true, total: true, quantity: true },
        orderBy: { taxRate: 'asc' },
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          tenantId,
          ...(branchId ? { branchId } : {}),
          orderDate: { gte: from, lte: to },
          status: { notIn: ['DRAFT', 'CANCELLED', 'PENDING_APPROVAL'] },
        },
        select: { id: true, taxAmount: true, subtotal: true, total: true, discountAmount: true },
      }),
      this.prisma.supplierInvoice.findMany({
        where: {
          tenantId,
          invoiceDate: { gte: from, lte: to },
          status: { in: ['POSTED', 'PARTIALLY_PAID', 'PAID'] },
        },
        select: { id: true, taxAmount: true, subtotal: true, total: true },
      }),
    ]);

    const outputVat = roundTax(salesAgg._sum.taxAmount ?? 0);
    const salesGross = roundTax(salesAgg._sum.total ?? 0);
    const salesNet = roundTax(
      (salesAgg._sum.subtotal ?? 0) - (salesAgg._sum.discountAmount ?? 0),
    );

    // Prefer supplier invoices for input VAT; else PO tax in period
    let inputVat = 0;
    let purchasesNet = 0;
    let purchasesGross = 0;
    if (supplierInvoices.length) {
      inputVat = roundTax(supplierInvoices.reduce((s, i) => s + (i.taxAmount ?? 0), 0));
      purchasesNet = roundTax(supplierInvoices.reduce((s, i) => s + (i.subtotal ?? 0), 0));
      purchasesGross = roundTax(supplierInvoices.reduce((s, i) => s + (i.total ?? 0), 0));
    } else {
      inputVat = roundTax(purchaseOrders.reduce((s, p) => s + (p.taxAmount ?? 0), 0));
      purchasesNet = roundTax(
        purchaseOrders.reduce((s, p) => s + (p.subtotal ?? 0) - (p.discountAmount ?? 0), 0),
      );
      purchasesGross = roundTax(purchaseOrders.reduce((s, p) => s + (p.total ?? 0), 0));
    }

    const totals = computeVatPeriodTotals({
      outputVat,
      inputVat,
      salesNet,
      salesGross,
      purchasesNet,
      purchasesGross,
    });

    return {
      period: { startDate, endDate },
      ...totals,
      salesCount: salesAgg._count.id,
      purchaseDocCount: supplierInvoices.length || purchaseOrders.length,
      purchaseSource: supplierInvoices.length ? 'invoices' : 'purchase_orders',
      outputByRate: byTaxRate.map((r) => ({
        taxRate: r.taxRate,
        taxAmount: roundTax(r._sum.taxAmount ?? 0),
        lineTotal: roundTax(r._sum.total ?? 0),
        quantity: r._sum.quantity ?? 0,
      })),
    };
  }

  // ── VAT Returns ───────────────────────────────────────────────────

  async listVatReturns(tenantId: string) {
    return this.prisma.vatReturn.findMany({
      where: { tenantId },
      orderBy: { periodEnd: 'desc' },
      take: 50,
    });
  }

  async getVatReturn(id: string, tenantId: string) {
    const row = await this.prisma.vatReturn.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('VAT return not found');
    return row;
  }

  async createVatReturn(
    tenantId: string,
    userId: string,
    dto: { startDate: string; endDate: string; notes?: string; branchId?: string },
  ) {
    const start = dayjs(dto.startDate).startOf('day').toDate();
    const end = dayjs(dto.endDate).endOf('day').toDate();
    if (end < start) throw new BadRequestException('End date must be after start date');

    const overlap = await this.prisma.vatReturn.findFirst({
      where: {
        tenantId,
        status: { in: [VatReturnStatus.DRAFT, VatReturnStatus.SUBMITTED, VatReturnStatus.FILED] },
        periodStart: { lte: end },
        periodEnd: { gte: start },
      },
    });
    if (overlap) {
      throw new BadRequestException(
        `Overlapping VAT return already exists (${overlap.status}) for this period`,
      );
    }

    const report = await this.getVatReport(tenantId, dto.startDate, dto.endDate, dto.branchId);

    return this.prisma.vatReturn.create({
      data: {
        tenantId,
        periodStart: start,
        periodEnd: end,
        status: VatReturnStatus.DRAFT,
        outputVat: report.outputVat,
        inputVat: report.inputVat,
        netVat: report.netVat,
        salesNet: report.salesNet,
        purchasesNet: report.purchasesNet,
        salesGross: report.salesGross,
        purchasesGross: report.purchasesGross,
        notes: dto.notes,
        createdBy: userId,
      },
    });
  }

  async refreshVatReturn(id: string, tenantId: string) {
    const row = await this.getVatReturn(id, tenantId);
    if (row.status === VatReturnStatus.FILED || row.status === VatReturnStatus.CANCELLED) {
      throw new BadRequestException('Cannot refresh a filed or cancelled return');
    }
    const report = await this.getVatReport(
      tenantId,
      row.periodStart.toISOString().slice(0, 10),
      row.periodEnd.toISOString().slice(0, 10),
    );
    return this.prisma.vatReturn.update({
      where: { id },
      data: {
        outputVat: report.outputVat,
        inputVat: report.inputVat,
        netVat: report.netVat,
        salesNet: report.salesNet,
        purchasesNet: report.purchasesNet,
        salesGross: report.salesGross,
        purchasesGross: report.purchasesGross,
      },
    });
  }

  async submitVatReturn(id: string, tenantId: string) {
    const row = await this.getVatReturn(id, tenantId);
    if (row.status !== VatReturnStatus.DRAFT) {
      throw new BadRequestException('Only drafts can be submitted');
    }
    return this.prisma.vatReturn.update({
      where: { id },
      data: { status: VatReturnStatus.SUBMITTED },
    });
  }

  async fileVatReturn(
    id: string,
    tenantId: string,
    userId: string,
    branchId: string,
    opts: { postJournal?: boolean } = {},
  ) {
    const row = await this.getVatReturn(id, tenantId);
    if (row.status !== VatReturnStatus.DRAFT && row.status !== VatReturnStatus.SUBMITTED) {
      throw new BadRequestException('Only draft/submitted returns can be filed');
    }

    let journalEntryId: string | null = row.journalEntryId;
    if (opts.postJournal !== false && !journalEntryId && Math.abs(row.netVat) >= 0.01) {
      const vatPayable = await this.prisma.account.findFirst({
        where: { tenantId, code: '2200', isActive: true },
      });
      const vatInput = await this.prisma.account.findFirst({
        where: { tenantId, code: '2210', isActive: true },
      });
      // Settlement control: use retained earnings as contra if no bank — prefer equity RE 3100
      const settlement = await this.prisma.account.findFirst({
        where: { tenantId, code: { in: ['3100', '3000'] }, isActive: true },
        orderBy: { code: 'desc' },
      });

      if (vatPayable && settlement && vatPayable.id !== settlement.id) {
        const date = row.periodEnd.toISOString().slice(0, 10);
        const desc = `VAT return ${row.periodStart.toISOString().slice(0, 10)} → ${date}`;

        if (row.netVat > 0) {
          // Net payable to authority
          const je = await this.journals.create(tenantId, branchId, userId, SYSTEM_ROLES, {
            description: desc,
            date,
            referenceType: 'VAT_RETURN',
            referenceId: row.id,
            action: 'POST',
            glLines: [
              { accountId: settlement.id, side: 'DEBIT', amount: row.netVat, description: 'VAT settlement' },
              { accountId: vatPayable.id, side: 'CREDIT', amount: row.netVat, description: 'VAT payable' },
            ],
          });
          journalEntryId = je.id;
        } else if (row.netVat < 0 && vatInput) {
          const refund = Math.abs(row.netVat);
          const je = await this.journals.create(tenantId, branchId, userId, SYSTEM_ROLES, {
            description: desc,
            date,
            referenceType: 'VAT_RETURN',
            referenceId: row.id,
            action: 'POST',
            glLines: [
              { accountId: vatInput.id, side: 'DEBIT', amount: refund, description: 'VAT recoverable' },
              { accountId: settlement.id, side: 'CREDIT', amount: refund, description: 'VAT refund / credit' },
            ],
          });
          journalEntryId = je.id;
        }
      }
    }

    return this.prisma.vatReturn.update({
      where: { id },
      data: {
        status: VatReturnStatus.FILED,
        filedAt: new Date(),
        filedBy: userId,
        journalEntryId,
      },
    });
  }

  async cancelVatReturn(id: string, tenantId: string) {
    const row = await this.getVatReturn(id, tenantId);
    if (row.status === VatReturnStatus.FILED) {
      throw new BadRequestException('Cannot cancel a filed return');
    }
    return this.prisma.vatReturn.update({
      where: { id },
      data: { status: VatReturnStatus.CANCELLED },
    });
  }
}
