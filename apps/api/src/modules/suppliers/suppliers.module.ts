import { escapeLike, normalizeSearch, textSearch } from '@/shared/search.helper';
import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsInt, IsArray, IsEnum, IsBoolean, IsDateString, Min, Max, MaxLength, ValidateNested, Matches, ArrayMinSize, IsNotEmpty } from 'class-validator';
import { CLIENT_REQUEST_ID_PATTERN, isClientRequestIdConflict, normalizeClientRequestId } from '@/modules/pos/pos-idempotency.helper';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ChequeDirection, ChequeStatus, PaymentMethod, PurchaseOrderStatus, PurchaseRequestStatus, SupplierLedgerEntryType } from '@prisma/client';
import { chequeSourceNotes } from '@/modules/accounting/finance.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { NoCardNumber } from '@/shared/security/card-number.validator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions, RequireAnyPermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService, InventoryModule } from '@/modules/inventory/inventory.module';
import { WorkflowService, WorkflowModule } from '@/modules/workflow/workflow.module';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { resolveActingCashierId } from '@/modules/pos/pos-pin.helper';
import { assertSupplierCashPayable } from '@/shared/cash-register.helper';
import type { ApTxContext } from './supplier-ap.service';
import { ProcurementService } from './procurement.service';
import { SupplierApService } from './supplier-ap.service';
import { DocumentNumberingModule } from '@/modules/document-numbering/document-numbering.module';
import { DocumentNumberingService } from '@/modules/document-numbering/document-numbering.service';
import type { GrnLineInput, PrItemInput } from './procurement.service';
import { sumExactStock } from '@/shared/exact-stock.helper';
import {
  isAllowedPurchaseOrderStatusTransition,
} from './procurement.helper';
import { assertVariantsInTenant } from '@/modules/inventory/tenant-ownership.helper';
import { assertSupplierInTenant } from './procurement-ownership.helper';
import {
  assertSupplierCreditLimit,
  bucketAging,
  computeSupplierOutstanding,
  syncSupplierBalanceWithLedger,
} from './supplier-ap.helper';
import {
  isSupplierLookupQuery,
  supplierBrowseArgs,
  supplierBrowseLimit,
  supplierBrowsePage,
  supplierLookupArgs,
  SUPPLIER_BROWSE_MAX_LIMIT,
  SUPPLIER_LOOKUP_MAX_LIMIT,
  type SupplierLookupRow,
} from './supplier-lookup.helper';

/** GET /suppliers/lookup — picker search, or (browse=true) the picker's first page by name. */
export class SupplierLookupQueryDto {
  @ApiPropertyOptional({ description: 'At least 2 non-blank characters; matches name, phone or code' })
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @ApiPropertyOptional({ description: `search: 1-${SUPPLIER_LOOKUP_MAX_LIMIT} (default 20); browse: 1-${SUPPLIER_BROWSE_MAX_LIMIT} (default 100)` })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(SUPPLIER_BROWSE_MAX_LIMIT) limit?: number;
  @ApiPropertyOptional({ description: 'true: first page by name with the shop total ({ data, meta }); search is ignored' })
  @IsOptional() @Transform(({ obj }) => obj?.browse === true || obj?.browse === 'true' || obj?.browse === '1') @IsBoolean() browse?: boolean;
}

export class CreateSupplierDto {
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() phone: string;
  @ApiPropertyOptional() @IsOptional() @IsString() contactPerson?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() pincode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() creditDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() creditLimit?: number;
}

export class UpdateSupplierDto extends PartialType(CreateSupplierDto) {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class SupplierDebitNoteDto {
  @ApiProperty() @IsNumber() @Min(0.01) @Max(1_000_000_000) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() noteDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) referenceId?: string;
}

export class PurchaseItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsString() productName: string;
  @ApiProperty() @IsString() variantName: string;
  @ApiProperty() @IsString() sku: string;
  @ApiProperty() @IsNumber() @Min(0) orderedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) freeQty?: number;
  @ApiProperty() @IsNumber() @Min(0) unitCost: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) sellingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) mrp?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) taxRate?: number;
}

/** Optional supplier payment recorded with GRN receive / PO create. */
export class ReceivePaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) @NoCardNumber() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) @NoCardNumber() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
  @ApiPropertyOptional({ description: 'Idempotency key for this supplier payment' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
}

export class CreatePurchaseOrderDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedDate?: string;
  @ApiPropertyOptional({ description: 'Scheduled supplier payment date (Business Calendar)' })
  @IsOptional() @IsDateString() paymentDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional({ description: 'Link an existing Quick/Direct GRN (stock already posted)' })
  @IsOptional() @IsString() fromGrnId?: string;
  @ApiPropertyOptional({
    description: 'Create PO and immediately post full GRN (receive all ordered + free qty)',
  })
  @IsOptional() @IsBoolean() createAndReceive?: boolean;
  @ApiProperty({ type: [PurchaseItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items: PurchaseItemDto[];
  @ApiPropertyOptional({ type: ReceivePaymentDto, description: 'Optional advance / pay-now against this PO' })
  @IsOptional() @ValidateNested() @Type(() => ReceivePaymentDto)
  payment?: ReceivePaymentDto;
  @ApiPropertyOptional({ description: 'Idempotency key, one per submit attempt; a retry with the same key returns the first result' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
}

export class UpdatePOStatusDto {
  @ApiProperty({ enum: PurchaseOrderStatus }) @IsEnum(PurchaseOrderStatus) status: PurchaseOrderStatus;
}

export class ReceiveItemDto {
  @ApiProperty() @IsString() itemId: string;
  @ApiProperty() @IsNumber() @Min(0) receivedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) rejectedQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufactureDate?: string;
}

export class ReceivePoBodyDto {
  @ApiProperty({ type: [ReceiveItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
  @ApiPropertyOptional({ type: ReceivePaymentDto }) @IsOptional() @ValidateNested() @Type(() => ReceivePaymentDto)
  payment?: ReceivePaymentDto;
  @ApiPropertyOptional({ description: 'Idempotency key, one per submit attempt; a retry with the same key returns the first result' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
}

export class RecordPaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) @NoCardNumber() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paidAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) @NoCardNumber() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountId?: string;
  /** When false, skip creating a Cheque row (e.g. extra PO lines under one cheque). Default true for CHEQUE. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() registerCheque?: boolean;
  /** Override cheque face amount when one cheque covers multiple PO payments. */
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) chequeAmount?: number;
  @ApiPropertyOptional({ description: 'Idempotency key for this supplier payment' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
}

export class ApplyAdvanceLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(40) invoiceId?: string;
  @ApiProperty() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0.01) amount: number;
}

/** Apply the supplier's advance to open bills: explicit per-bill amounts, or one total spread oldest-first. */
export class ApplySupplierAdvanceDto {
  @ApiPropertyOptional({ type: [ApplyAdvanceLineDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ApplyAdvanceLineDto)
  allocations?: ApplyAdvanceLineDto[];
  @ApiPropertyOptional() @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 }) @Min(0.01) amount?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) purchaseIds?: string[];
  @ApiPropertyOptional({ description: 'Idempotency key, one per submit attempt; a retry returns the first result' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class SupplierApPaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional({ description: 'Pay more than is payable and keep the excess as the supplier advance (default: refused)' })
  @IsOptional() @IsBoolean() allowAdvance?: boolean;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) method?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) @NoCardNumber() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) purchaseIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsDateString() paidAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) @NoCardNumber() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankAccountId?: string;
  /** Our company bank account (BANK_TRANSFER / CHEQUE) — from Accounting → Banks */
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountId?: string;
  @ApiPropertyOptional({ description: 'Idempotency key for this supplier payment' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
}

export class AssignSupplierProductDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierProductCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) leadTimeDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) lastBuyingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPreferred?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

@Injectable()
export class SuppliersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly workflowService: WorkflowService,
    private readonly procurementService: ProcurementService,
    private readonly apService: SupplierApService,
    private readonly numbering: DocumentNumberingService,
  ) {}

  /**
   * Picker lookup (POS Quick GRN supplier search): ONE tenant-scoped read of the suppliers table returning
   * id / name / phone / code. No purchase orders, items or invoices are loaded and supplier.balance is never
   * recalculated or written (unlike findAllSuppliers). Fewer than 2 non-blank characters → empty list, no query.
   */
  async lookupSuppliers(tenantId: string, search: string | undefined, limit?: number): Promise<SupplierLookupRow[]> {
    if (!isSupplierLookupQuery(search)) return [];
    return this.prisma.supplier.findMany(supplierLookupArgs(tenantId, search as string, limit));
  }

  /**
   * Picker first page (POS Quick GRN initial load / Refresh): the first suppliers by name plus the shop's total.
   * Two reads of the suppliers table only (findMany + count): no purchase orders / invoices, no balance
   * recalculation, no writes.
   */
  async browseSuppliers(tenantId: string, limit?: number) {
    const take = supplierBrowseLimit(limit);
    const [rows, total] = await Promise.all([
      this.prisma.supplier.findMany(supplierBrowseArgs(tenantId, take)) as Promise<SupplierLookupRow[]>,
      this.prisma.supplier.count({ where: { tenantId } }),
    ]);
    return supplierBrowsePage(rows, total, take);
  }

  async createSupplier(tenantId: string, dto: CreateSupplierDto) {
    const code = `SUP-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.supplier.create({ data: { tenantId, code, ...dto } });
  }

  async findAllSuppliers(tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...textSearch(query.search, ['name', 'phone', 'email', 'contactPerson', 'code']),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          _count: { select: { purchases: true } },
          purchases: {
            orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
            take: 1,
            select: { orderDate: true, createdAt: true },
          },
        },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    const data = await Promise.all(rows.map(async ({ purchases, ...supplier }) => {
      const { outstanding } = await computeSupplierOutstanding(this.prisma, tenantId, supplier.id);
      // Keep cached balance in sync for dashboard aggregates
      if (Math.abs((supplier.balance ?? 0) - outstanding) > 0.01) {
        await this.prisma.supplier.update({
          where: { id: supplier.id },
          data: { balance: outstanding },
        });
      }
      const lastPo = purchases[0];
      return {
        ...supplier,
        balance: outstanding,
        outstandingBalance: outstanding,
        lastPurchaseDate: lastPo?.orderDate ?? lastPo?.createdAt ?? null,
      };
    }));
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOneSupplier(id: string, tenantId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
      include: {
        purchases: { orderBy: { createdAt: 'desc' }, take: 10 },
        payments: { take: 10, orderBy: { paidAt: 'desc' } },
        productAssignments: {
          include: {
            variant: { include: { product: { select: { id: true, name: true } } } },
          },
          orderBy: { updatedAt: 'desc' },
          take: 30,
        },
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const { outstanding, lines } = await computeSupplierOutstanding(this.prisma, tenantId, id);
    if (Math.abs((supplier.balance ?? 0) - outstanding) > 0.01) {
      await this.prisma.supplier.update({ where: { id }, data: { balance: outstanding } });
    }
    const lastPo = supplier.purchases[0];
    const aging = bucketAging(lines);
    return {
      ...supplier,
      balance: outstanding,
      lastPurchaseDate: lastPo?.orderDate ?? lastPo?.createdAt ?? null,
      outstandingBalance: outstanding,
      apLines: lines.map((l) => ({
        ...l,
        dueDate: l.dueDate.toISOString(),
        asOfDate: l.asOfDate.toISOString(),
      })),
      aging,
    };
  }

  async updateSupplier(id: string, tenantId: string, dto: UpdateSupplierDto) {
    await this.findOneSupplier(id, tenantId);
    return this.prisma.supplier.update({ where: { id }, data: dto as object });
  }

  async removeSupplier(id: string, tenantId: string) {
    await this.findOneSupplier(id, tenantId);
    return this.prisma.supplier.delete({ where: { id } });
  }

  async createPurchaseOrder(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: CreatePurchaseOrderDto,
    opts?: { permissions?: string[]; roles?: string[] },
  ) {
    // Retry of a create that already went through (double click, lost response): return that PO.
    // Nothing is created, received or paid a second time.
    const clientRequestId = normalizeClientRequestId(dto.clientRequestId);
    const replay = async () => {
      if (!clientRequestId) return null;
      const existing = await this.prisma.purchaseOrder.findFirst({ where: { tenantId, clientRequestId }, select: { id: true, supplierId: true } });
      if (!existing) return null;
      if (existing.supplierId !== dto.supplierId) {
        throw new ConflictException('clientRequestId was already used for a different purchase order');
      }
      const grn = await this.prisma.goodsReceipt.findFirst({ where: { tenantId, purchaseId: existing.id }, select: { id: true, grnNumber: true }, orderBy: { createdAt: 'asc' } });
      return { ...(await this.findOnePO(existing.id, tenantId)), ...(grn ? { grn } : {}), replayed: true };
    };
    const earlier = await replay();
    if (earlier) return earlier;

    if (dto.fromGrnId && dto.createAndReceive) {
      throw new BadRequestException('Cannot use createAndReceive together with fromGrnId');
    }
    if (dto.createAndReceive) {
      if (!branchId?.trim()) {
        throw new BadRequestException('Select a branch before Create PO + GRN');
      }
      const perms = opts?.permissions ?? [];
      const roles = opts?.roles ?? [];
      const canReceive =
        perms.includes('purchases:update')
        || perms.includes('*')
        || bypassesWorkflowApproval(roles);
      if (!canReceive) {
        throw new BadRequestException(
          'Create PO + GRN requires purchase receive permission (purchases:update)',
        );
      }
    }
    if (dto.payment && dto.payment.amount > 0) {
      if (dto.payment.method === PaymentMethod.CHEQUE && !(dto.payment.chequeNumber ?? dto.payment.reference)?.trim()) {
        throw new BadRequestException('Cheque number is required for cheque payments');
      }
      if (dto.payment.method === PaymentMethod.CHEQUE && !dto.payment.chequeDueDate?.trim()) {
        throw new BadRequestException('Cheque due date is required');
      }
    }

    // Supplier and every line variant must be this tenant's before a number is drawn or anything written (S-F8).
    await assertSupplierInTenant(this.prisma, tenantId, dto.supplierId);
    await assertVariantsInTenant(this.prisma, tenantId, (dto.items ?? []).map((i) => i.variantId));

    const poNumber = this.numbering.isEngineEnabled()
      ? await this.numbering.allocateStandalone(tenantId, 'PURCHASE_ORDER')
      : `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const itemsData = dto.items.map((item) => {
      const orderedQty = Math.max(0, item.orderedQty ?? 0);
      const freeQty = Math.max(0, item.freeQty ?? 0);
      if (orderedQty + freeQty <= 0) {
        throw new BadRequestException(`Add Order Qty or Free Qty for ${item.productName || item.sku}`);
      }
      const lineTotal = item.unitCost * orderedQty;
      const disc = item.discount ?? 0;
      const taxable = lineTotal - disc;
      const tax = 0;
      return {
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        orderedQty,
        freeQty,
        unitCost: item.unitCost,
        sellingPrice: item.sellingPrice != null && item.sellingPrice > 0 ? item.sellingPrice : null,
        mrp: item.mrp != null && item.mrp > 0 ? item.mrp : null,
        expiryDate: item.expiryDate ? new Date(item.expiryDate) : null,
        discount: disc,
        taxRate: 0,
        taxAmount: tax,
        total: taxable + tax,
      };
    });
    const subtotal   = itemsData.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
    const discountAmount = itemsData.reduce((s, i) => s + i.discount, 0);
    const taxAmount  = itemsData.reduce((s, i) => s + i.taxAmount, 0);
    const poTotal = subtotal - discountAmount + taxAmount;

    // Credit limit: enforce when PO becomes payable immediately (from GRN / create+receive)
    if (dto.fromGrnId || dto.createAndReceive) {
      try {
        await assertSupplierCreditLimit(this.prisma, tenantId, dto.supplierId, poTotal);
      } catch (e) {
        throw new BadRequestException((e as Error).message);
      }
    }

    let grnToLink: {
      id: string;
      grnNumber: string;
      supplierId: string;
      receivedAt: Date;
      purchaseId: string | null;
      items: { id: string; variantId: string }[];
    } | null = null;

    if (dto.fromGrnId) {
      const grn = await this.prisma.goodsReceipt.findFirst({
        where: { id: dto.fromGrnId, tenantId },
        include: { items: { select: { id: true, variantId: true } } },
      });
      if (!grn) throw new NotFoundException('GRN not found');
      if (grn.purchaseId) throw new BadRequestException('This GRN is already linked to a purchase order');
      if (grn.supplierId !== dto.supplierId) {
        throw new BadRequestException('PO supplier must match the GRN supplier');
      }
      grnToLink = grn;
    }

    const po = await this.prisma.purchaseOrder.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        tenantId, branchId, supplierId: dto.supplierId,
        clientRequestId,
        poNumber, subtotal, discountAmount, taxAmount,
        total: subtotal - discountAmount + taxAmount,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        paymentDueDate: dto.paymentDueDate ? new Date(dto.paymentDueDate) : undefined,
        notes: dto.notes, reference: dto.reference, paymentTerms: dto.paymentTerms,
        createdBy: userId,
        items: { create: itemsData },
        ...(grnToLink
          ? {
              status: PurchaseOrderStatus.RECEIVED,
              receivedDate: grnToLink.receivedAt,
            }
          : dto.createAndReceive
            ? { status: PurchaseOrderStatus.CONFIRMED }
            : {}),
      } as any,
      include: { items: true, supplier: true },
    }).catch(async (e) => {
      // Two identical requests at the same moment: the second loses the unique key race -> return the first PO.
      if (clientRequestId && isClientRequestIdConflict(e)) {
        const r = await replay();
        if (r) return r;
      }
      throw e;
    });
    if ('replayed' in po) return po;

    if (grnToLink) {
      await this.prisma.$transaction(async (tx) => {
        // Link only if the GRN is still unlinked (checked above outside this transaction): the same GRN can
        // never end up on two purchase orders (its stock was posted once, by the GRN itself).
        const linked = await tx.goodsReceipt.updateMany({ where: { id: grnToLink!.id, tenantId, purchaseId: null }, data: { purchaseId: po.id } });
        if (linked.count !== 1) throw new BadRequestException('This GRN is already linked to a purchase order');
        for (const pi of po.items) {
          await tx.purchaseOrderItem.update({
            where: { id: pi.id },
            data: { receivedQty: pi.orderedQty + Math.max(0, (pi as { freeQty?: number }).freeQty ?? 0) },
          });
        }
        for (const gi of grnToLink!.items) {
          const match = po.items.find((pi) => pi.variantId === gi.variantId);
          if (match) {
            await tx.goodsReceiptItem.update({
              where: { id: gi.id },
              data: { purchaseItemId: match.id },
            });
          }
        }
        await syncSupplierBalanceWithLedger(tx, tenantId, dto.supplierId, {
          entryType: SupplierLedgerEntryType.GRN,
          amount: poTotal,
          referenceType: 'GoodsReceipt',
          referenceId: grnToLink!.id,
          notes: `PO ${po.poNumber} linked from GRN ${grnToLink!.grnNumber}`,
          createdBy: userId,
        });
      }).catch(async (e) => {
        await this.prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: PurchaseOrderStatus.CANCELLED, clientRequestId: null } }).catch(() => undefined);
        throw e;
      });
    }

    let createReceiveGrn: { id: string; grnNumber: string } | null = null;
    if (dto.createAndReceive && !grnToLink) {
      const receiveItems = po.items.map((pi) => {
        const freeQty = Math.max(0, (pi as { freeQty?: number }).freeQty ?? 0);
        return {
          itemId: pi.id,
          receivedQty: pi.orderedQty + freeQty,
          expiryDate: (pi as { expiryDate?: Date | null }).expiryDate
            ? new Date((pi as { expiryDate: Date }).expiryDate).toISOString().slice(0, 10)
            : undefined,
        };
      }).filter((i) => i.receivedQty > 0);

      if (!receiveItems.length) {
        await this.prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { status: PurchaseOrderStatus.CANCELLED },
        }).catch(() => undefined);
        throw new BadRequestException('No quantities to receive for GRN');
      }

      try {
        const received = await this.procurementService.receiveFromPurchaseOrder(
          po.id,
          tenantId,
          branchId,
          userId,
          receiveItems,
          undefined,
          { clientRequestId: clientRequestId ? `${clientRequestId}-grn` : null },
        );
        createReceiveGrn = received.grn
          ? { id: received.grn.id, grnNumber: received.grn.grnNumber }
          : null;
      } catch (e) {
        // Nothing was received (the GRN transaction rolled back). Cancel this PO and free its key, so the user
        // can correct the problem and submit again.
        await this.prisma.purchaseOrder.update({
          where: { id: po.id },
          data: { status: PurchaseOrderStatus.CANCELLED, clientRequestId: null },
        }).catch(() => undefined);
        throw e;
      }
    }

    let paymentResult: unknown = null;
    let paymentError: string | null = null;
    if (dto.payment && dto.payment.amount > 0) {
      try {
        paymentResult = await this.recordPayment(dto.supplierId, tenantId, branchId, userId, {
          amount: dto.payment.amount,
          method: dto.payment.method,
          purchaseId: po.id,
          reference: dto.payment.reference,
          notes: dto.payment.notes ?? `Payment on PO ${po.poNumber}`,
          chequeNumber: dto.payment.chequeNumber,
          chequeDueDate: dto.payment.chequeDueDate,
          chequeBankName: dto.payment.chequeBankName,
          clientRequestId: dto.payment.clientRequestId,
        });
      } catch (e) {
        if (createReceiveGrn || grnToLink) {
          paymentError = (e as Error).message || 'Payment failed after GRN';
        } else {
          throw e;
        }
      }
    }

    const refreshed = await this.findOnePO(po.id, tenantId);
    return {
      ...refreshed,
      ...(paymentResult ? { payment: paymentResult } : {}),
      ...(paymentError ? { paymentError } : {}),
      ...(createReceiveGrn ? { grn: createReceiveGrn } : {}),
    };
  }

  async findAllPOs(tenantId: string, query: PaginationDto & { status?: PurchaseOrderStatus }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = { tenantId, ...(query.status && { status: query.status }) };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where, skip, take,
        include: { supplier: true, _count: { select: { items: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOnePO(id: string, tenantId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        items: { include: { variant: { include: { product: true } } } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async updatePOStatus(
    id: string,
    tenantId: string,
    status: PurchaseOrderStatus,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "purchase_orders" WHERE id = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const po = await tx.purchaseOrder.findFirst({ where: { id, tenantId } });
      if (!po) throw new NotFoundException('Purchase order not found');
      if (!isAllowedPurchaseOrderStatusTransition(po.status, status)) {
        throw new BadRequestException(`Invalid purchase order status transition: ${po.status} -> ${status}`);
      }
      const updated = await tx.purchaseOrder.updateMany({
        where: { id, tenantId, status: po.status },
        data: { status },
      });
      if (updated.count !== 1) throw new ConflictException('Purchase order status changed concurrently');
      return tx.purchaseOrder.findFirst({ where: { id, tenantId } });
    });
  }

  async submitPOForApproval(id: string, tenantId: string, userId: string, userRoles: string[]) {
    const po = await this.findOnePO(id, tenantId);
    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Only draft purchase orders can be submitted for approval');
    }

    if (bypassesWorkflowApproval(userRoles)) {
      await this.prisma.purchaseOrder.update({
        where: { id },
        data: { status: PurchaseOrderStatus.CONFIRMED },
      });
      return this.findOnePO(id, tenantId);
    }

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.PENDING_APPROVAL },
    });
    await this.workflowService.start(tenantId, userId, {
      key: 'purchase_order',
      entityType: 'PurchaseOrder',
      entityId: id,
      metadata: { poNumber: po.poNumber, total: po.total },
    });
    return this.findOnePO(id, tenantId);
  }

  async recordPayment(
    supplierId: string,
    tenantId: string,
    branchId: string,
    userId: string,
    dto: RecordPaymentDto,
    cash: { authorizedById?: string | null } = {},
    ctx?: ApTxContext,
  ) {
    // All supplier payments go through unified AP settle (FIFO, allocations, CLOSED, CHEQUE→BANK).
    if (dto.method === PaymentMethod.CHEQUE && !(dto.chequeNumber ?? dto.reference)?.trim()) {
      throw new BadRequestException('Cheque number is required for cheque payments');
    }
    return this.apService.receivePayment(supplierId, tenantId, branchId, userId, {
      amount: dto.amount,
      method: dto.method,
      reference: dto.reference ?? dto.chequeNumber,
      notes: dto.notes,
      purchaseId: dto.purchaseId,
      purchaseIds: dto.purchaseId ? [dto.purchaseId] : undefined,
      paidAt: dto.paidAt,
      chequeNumber: dto.chequeNumber,
      chequeDueDate: dto.chequeDueDate,
      chequeBankName: dto.chequeBankName,
      chequeBankAccountId: dto.chequeBankAccountId,
      bankAccountId: dto.bankAccountId,
      clientRequestId: dto.clientRequestId,
    }, cash, ctx);
  }

  async getPayments(supplierId: string, tenantId: string) {
    await this.findOneSupplier(supplierId, tenantId);
    return this.prisma.supplierPayment.findMany({
      where: { supplierId, tenantId },
      orderBy: { paidAt: 'desc' },
      include: { purchase: { select: { poNumber: true } } },
    });
  }

  async listAssignedProducts(supplierId: string, tenantId: string) {
    await this.findOneSupplier(supplierId, tenantId);
    return this.prisma.supplierProductAssignment.findMany({
      where: { tenantId, supplierId, isActive: true },
      include: {
        variant: {
          include: {
            product: { select: { id: true, name: true, status: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  async assignProductToSupplier(supplierId: string, tenantId: string, dto: AssignSupplierProductDto) {
    await this.findOneSupplier(supplierId, tenantId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { tenantId } },
      select: { id: true },
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    return this.prisma.supplierProductAssignment.upsert({
      where: {
        supplierId_variantId: {
          supplierId,
          variantId: dto.variantId,
        },
      },
      create: {
        tenantId,
        supplierId,
        variantId: dto.variantId,
        supplierProductCode: dto.supplierProductCode,
        leadTimeDays: dto.leadTimeDays,
        lastBuyingPrice: dto.lastBuyingPrice,
        isPreferred: dto.isPreferred ?? false,
        isActive: true,
        notes: dto.notes,
      },
      update: {
        supplierProductCode: dto.supplierProductCode,
        leadTimeDays: dto.leadTimeDays,
        lastBuyingPrice: dto.lastBuyingPrice,
        isPreferred: dto.isPreferred,
        isActive: true,
        notes: dto.notes,
      },
      include: {
        variant: { include: { product: { select: { id: true, name: true } } } },
      },
    });
  }

  async unassignProductFromSupplier(supplierId: string, variantId: string, tenantId: string) {
    await this.findOneSupplier(supplierId, tenantId);
    const existing = await this.prisma.supplierProductAssignment.findFirst({
      where: { tenantId, supplierId, variantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Assigned product not found');
    return this.prisma.supplierProductAssignment.delete({ where: { id: existing.id } });
  }

  /** Approval + drawer cash for a payment made with a goods receipt, checked before anything is posted. */
  assertCashPayable(tenantId: string, branchId: string | null | undefined, actor: { actorId: string; authorizerId: string | null }, payment?: { method?: string | null; amount?: number | null } | null) {
    return assertSupplierCashPayable(this.prisma, payment, { tenantId, branchId, cashierId: actor.actorId, authorizerId: actor.authorizerId });
  }

  /** Acting PIN cashier + approving manager (see SupplierApService.resolveCash). */
  resolveCash(tenantId: string, user: { id: string; roles?: string[] }, unlockToken?: string, approvalToken?: string) {
    return this.apService.resolveCash(tenantId, user, unlockToken, approvalToken);
  }

  async receiveItems(
    poId: string,
    tenantId: string,
    branchId: string,
    userId: string,
    items: ReceiveItemDto[],
    payment?: ReceivePaymentDto,
    cash: { authorizedById?: string | null } = {},
    clientRequestId?: string,
  ) {
    // Phase 3: PO receive creates a formal GoodsReceipt (GRN from PO) + partial receive status. A payment
    // made with the receipt runs INSIDE the GRN transaction: if it fails (approval, drawer cash, validation)
    // nothing is received and nothing is paid.
    const after: (() => void)[] = [];
    let supplierId: string | null = null;
    const pay = payment && payment.amount > 0 ? payment : null;
    if (pay) {
      const po = await this.prisma.purchaseOrder.findFirst({ where: { id: poId, tenantId }, select: { supplierId: true } });
      if (!po) throw new NotFoundException('Purchase order not found');
      supplierId = po.supplierId;
    }
    const result = await this.procurementService.receiveFromPurchaseOrder(
      poId, tenantId, branchId, userId, items,
      pay && supplierId
        ? (tx, g) => this.recordPayment(supplierId!, tenantId, branchId, userId, {
            amount: pay.amount,
            method: pay.method,
            purchaseId: poId,
            reference: pay.reference,
            notes: pay.notes ?? `Payment on GRN ${g.grnNumber}`,
            chequeNumber: pay.chequeNumber,
            chequeDueDate: pay.chequeDueDate,
            chequeBankName: pay.chequeBankName,
            clientRequestId: pay.clientRequestId ?? clientRequestId,
          }, cash, { tx, after })
        : undefined,
      { clientRequestId },
    );
    for (const fire of after) fire(); // payment events only once everything committed
    const paymentResult = result.payment ?? null;
    // Backward-compatible shape for existing UI, plus grn document
    return { ...result.purchaseOrder, grn: result.grn, payment: paymentResult, ...('replayed' in result && result.replayed ? { replayed: true } : {}) };
  }

  async getReorderSuggestions(tenantId: string, branchId?: string) {
    const rows = await this.prisma.inventory.findMany({
      where: { tenantId, ...(branchId ? { branchId } : {}) },
      include: {
        variant: { select: { sku: true, product: { select: { name: true } } } },
        branch: { select: { name: true } },
      },
    });
    return rows
      .filter((inv) => inv.quantity <= inv.reorderPoint)
      .map((inv) => ({
        variantId: inv.variantId,
        sku: inv.variant.sku,
        productName: inv.variant.product.name,
        branchName: inv.branch.name,
        currentQty: inv.quantity,
        reorderPoint: inv.reorderPoint,
        minStockLevel: inv.minStockLevel,
        suggestedOrderQty: Math.max(
          inv.reorderPoint * 2 - inv.quantity,
          inv.maxStockLevel > 0 ? inv.maxStockLevel - inv.quantity : inv.reorderPoint,
          1,
        ),
      }))
      .sort((a, b) => a.currentQty - b.currentQty);
  }

  /**
   * Product sales lookup for PO planning — read-only; does not mutate POs.
   * Returns stock, last PO qty, and sold qty / revenue by variant within date range.
   */
  async getProductSalesForPo(
    tenantId: string,
    branchId: string | undefined,
    opts: {
      startDate: string;
      endDate: string;
      search?: string;
      variantIds?: string[];
      limit?: number;
    },
  ) {
    const start = new Date(opts.startDate);
    const end = new Date(opts.endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Invalid startDate or endDate');
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (end < start) throw new BadRequestException('endDate must be on or after startDate');

    const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);
    const search = escapeLike(normalizeSearch(opts.search)); // trimmed; %, _ match literally
    const scopedIds = (opts.variantIds ?? []).filter(Boolean);

    const items = await this.prisma.saleItem.findMany({
      where: {
        ...(scopedIds.length ? { variantId: { in: scopedIds } } : { variantId: { not: null } }),
        ...(search
          ? {
              OR: [
                { productName: { contains: search, mode: 'insensitive' } },
                { sku: { contains: search, mode: 'insensitive' } },
                { variantName: { contains: search, mode: 'insensitive' } },
                { variant: { barcode: { contains: search, mode: 'insensitive' } } },
              ],
            }
          : {}),
        sale: {
          tenantId,
          status: { not: 'CANCELLED' },
          invoiceDate: { gte: start, lte: end },
          ...(branchId ? { branchId } : {}),
        },
      },
      select: {
        variantId: true,
        productName: true,
        variantName: true,
        sku: true,
        quantity: true,
        total: true,
      },
    });

    type Agg = {
      variantId: string;
      productName: string;
      variantName: string;
      sku: string;
      barcode: string | null;
      soldQty: number;
      revenue: number;
      stock: number;
      lastPoQty: number | null;
      lastPoDate: string | null;
      lastPoNumber: string | null;
    };
    const map = new Map<string, Agg>();

    for (const i of items) {
      if (!i.variantId) continue;
      const cur = map.get(i.variantId);
      if (!cur) {
        map.set(i.variantId, {
          variantId: i.variantId,
          productName: i.productName,
          variantName: i.variantName,
          sku: i.sku,
          barcode: null,
          soldQty: i.quantity,
          revenue: i.total,
          stock: 0,
          lastPoQty: null,
          lastPoDate: null,
          lastPoNumber: null,
        });
      } else {
        cur.soldQty += i.quantity;
        cur.revenue += i.total;
      }
    }

    // Order-lines scope: include products with zero sales in range
    if (scopedIds.length) {
      const missing = scopedIds.filter((id) => !map.has(id));
      if (missing.length) {
        const variants = await this.prisma.productVariant.findMany({
          where: { id: { in: missing }, product: { tenantId } },
          select: {
            id: true,
            name: true,
            sku: true,
            barcode: true,
            product: { select: { name: true } },
          },
        });
        for (const v of variants) {
          if (search) {
            const hay = `${v.product.name} ${v.name} ${v.sku} ${v.barcode ?? ""}`.toLowerCase();
            if (!hay.includes(search.toLowerCase())) continue;
          }
          map.set(v.id, {
            variantId: v.id,
            productName: v.product.name,
            variantName: v.name,
            sku: v.sku,
            barcode: v.barcode ?? null,
            soldQty: 0,
            revenue: 0,
            stock: 0,
            lastPoQty: null,
            lastPoDate: null,
            lastPoNumber: null,
          });
        }
      }
    }

    const ids = Array.from(map.keys());
    if (ids.length) {
      const [variants, poItems] = await Promise.all([
        this.prisma.productVariant.findMany({
          where: { id: { in: ids } },
          select: {
            id: true,
            barcode: true,
            inventory: branchId
              ? { where: { branchId }, select: { quantity: true, reservedQty: true }, take: 1 }
              : { select: { quantity: true, reservedQty: true }, take: 8 },
          },
        }),
        this.prisma.purchaseOrderItem.findMany({
          where: {
            variantId: { in: ids },
            purchase: {
              tenantId,
              status: { not: 'CANCELLED' },
              ...(branchId ? { branchId } : {}),
            },
          },
          orderBy: { purchase: { orderDate: 'desc' } },
          select: {
            variantId: true,
            orderedQty: true,
            freeQty: true,
            purchase: { select: { orderDate: true, poNumber: true } },
          },
        }),
      ]);

      const stockById = new Map(
        variants.map((v) => {
          // PO planning shows exact stock (negative included), not clamped per row
          const stock = sumExactStock(v.inventory ?? []);
          return [v.id, { stock, barcode: v.barcode ?? null }] as const;
        }),
      );

      const lastPoById = new Map<string, { qty: number; date: string; poNumber: string }>();
      for (const row of poItems) {
        if (lastPoById.has(row.variantId)) continue;
        lastPoById.set(row.variantId, {
          qty: row.orderedQty + Math.max(0, row.freeQty ?? 0),
          date: row.purchase.orderDate.toISOString(),
          poNumber: row.purchase.poNumber,
        });
      }

      for (const row of map.values()) {
        const meta = stockById.get(row.variantId);
        if (meta) {
          row.stock = meta.stock;
          if (!row.barcode) row.barcode = meta.barcode;
        }
        const last = lastPoById.get(row.variantId);
        if (last) {
          row.lastPoQty = last.qty;
          row.lastPoDate = last.date;
          row.lastPoNumber = last.poNumber;
        }
      }
    }

    const rows = Array.from(map.values())
      .sort((a, b) => b.soldQty - a.soldQty || a.productName.localeCompare(b.productName))
      .slice(0, limit);

    return {
      startDate: opts.startDate,
      endDate: opts.endDate,
      productCount: rows.length,
      totalSoldQty: rows.reduce((s, r) => s + r.soldQty, 0),
      totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
      rows,
    };
  }
}

@ApiTags('Suppliers')
@ApiBearerAuth('access-token')
@Controller({ path: 'suppliers', version: '1' })
export class SuppliersController {
  constructor(
    private readonly suppliersService: SuppliersService,
    private readonly apService: SupplierApService,
  ) {}

  @Post()
  @RequirePermissions('suppliers:create')
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateSupplierDto) {
    return this.suppliersService.createSupplier(user.tenantId, dto);
  }

  @Get()
  @RequirePermissions('suppliers:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.suppliersService.findAllSuppliers(user.tenantId, query);
  }

  // Declared before ':id' so 'lookup' is never read as a supplier id.
  @Get('lookup')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'Lightweight supplier picker data (id, name, phone, code; no balances): search (min 2 characters) or browse=true (first page + total)' })
  lookup(@CurrentUser() user: IAuthUser, @Query() query: SupplierLookupQueryDto) {
    if (query.browse) return this.suppliersService.browseSuppliers(user.tenantId, query.limit);
    return this.suppliersService.lookupSuppliers(user.tenantId, query.search, query.limit);
  }

  // ── Sprint 6 AP ───────────────────────────────────────────────────

  @Get('ap/dashboard')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'AP dashboard KPIs + aging' })
  apDashboard(@CurrentUser() user: IAuthUser, @Query('asOfDate') asOfDate?: string) {
    return this.apService.getApDashboard(user.tenantId, asOfDate);
  }

  @Get('ap/payments')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'List supplier payments in date range' })
  apPayments(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.apService.listPayments(user.tenantId, {
      startDate,
      endDate,
      supplierId,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('ap/bills')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'List supplier bills / invoices' })
  apBills(
    @CurrentUser() user: IAuthUser,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.apService.listBills(
      user.tenantId,
      supplierId,
      limit ? parseInt(limit, 10) : 50,
    );
  }

  @Get('ap/debit-notes')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'List supplier debit notes' })
  apDebitNotes(@CurrentUser() user: IAuthUser, @Query('supplierId') supplierId?: string) {
    return this.apService.listDebitNotes(user.tenantId, supplierId);
  }

  @Get(':id/ap/unpaid-pos')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'List unpaid received POs for supplier payment' })
  unpaidPos(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.apService.listUnpaidPurchaseOrders(user.tenantId, id);
  }

  @Get(':id/ap/ledger')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'Supplier AP ledger' })
  apLedger(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.apService.getSupplierLedger(id, user.tenantId, startDate, endDate);
  }

  @Get(':id/ap/statement')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'Supplier statement (printable)' })
  apStatement(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.apService.getSupplierStatement(id, user.tenantId, startDate, endDate);
  }

  @Post(':id/ap/payment')
  @RequirePermissions('suppliers:update')
  @ApiOperation({ summary: 'Receive AP payment (FIFO across bills/POs)' })
  async apPayment(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: SupplierApPaymentDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-cash-approval-token') approvalToken?: string,
  ) {
    // The PIN cashier pays; above the cash-out limit a manager's PIN approval authorises it.
    const actor = await this.apService.resolveCash(user.tenantId, user, unlockToken, approvalToken);
    return this.apService.receivePayment(
      id,
      user.tenantId,
      user.branchId ?? '',
      actor.actorId,
      body,
      { authorizedById: actor.authorizerId },
    );
  }

  @Get(':id/ap/advance')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'Supplier payable and advance balance (separately), open bills and the advance history' })
  apAdvance(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Query('limit') limit?: string) {
    return this.apService.getAdvanceOverview(id, user.tenantId, limit ? parseInt(limit, 10) : undefined);
  }

  @Post(':id/ap/advance/apply')
  @RequirePermissions('suppliers:update')
  @ApiOperation({ summary: 'Apply the supplier advance to open bills (no cash moves; idempotent with clientRequestId)' })
  apApplyAdvance(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: ApplySupplierAdvanceDto) {
    return this.apService.applyAdvance(id, user.tenantId, user.id, body);
  }

  @Post(':id/ap/debit-notes')
  @RequirePermissions('suppliers:update')
  @ApiOperation({ summary: 'Issue supplier debit note against AP' })
  apDebitNote(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: SupplierDebitNoteDto,
  ) {
    return this.apService.createDebitNote(id, user.tenantId, user.id, body);
  }

  @Get(':id')
  @RequirePermissions('suppliers:read')
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.suppliersService.findOneSupplier(id, user.tenantId);
  }

  @Put(':id')
  @RequirePermissions('suppliers:update')
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.updateSupplier(id, user.tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('suppliers:delete')
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.suppliersService.removeSupplier(id, user.tenantId);
  }

  @Post(':id/payments')
  @RequirePermissions('suppliers:update')
  @ApiOperation({ summary: 'Record a payment to supplier' })
  async recordPayment(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: RecordPaymentDto, @Headers('x-pos-cashier-token') unlockToken?: string, @Headers('x-cash-approval-token') approvalToken?: string) {
    const actor = await this.apService.resolveCash(user.tenantId, user, unlockToken, approvalToken);
    return this.suppliersService.recordPayment(id, user.tenantId, user.branchId ?? '', actor.actorId, dto, { authorizedById: actor.authorizerId });
  }

  @Get(':id/payments')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'List payments for a supplier' })
  getPayments(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.suppliersService.getPayments(id, user.tenantId);
  }

  @Get(':id/products')
  @RequirePermissions('suppliers:read')
  @ApiOperation({ summary: 'List products assigned to supplier' })
  listAssignedProducts(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.suppliersService.listAssignedProducts(id, user.tenantId);
  }

  @Post(':id/products')
  @RequirePermissions('suppliers:update')
  @ApiOperation({ summary: 'Assign product to supplier' })
  assignProduct(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: AssignSupplierProductDto) {
    return this.suppliersService.assignProductToSupplier(id, user.tenantId, dto);
  }

  @Delete(':id/products/:variantId')
  @RequirePermissions('suppliers:update')
  @ApiOperation({ summary: 'Unassign product from supplier' })
  unassignProduct(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Param('variantId') variantId: string) {
    return this.suppliersService.unassignProductFromSupplier(id, variantId, user.tenantId);
  }
}

@ApiTags('Purchases')
@ApiBearerAuth('access-token')
@Controller({ path: 'purchases', version: '1' })
export class PurchasesController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Post()
  @RequirePermissions('purchases:create')
  @ApiOperation({ summary: 'Create purchase order' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreatePurchaseOrderDto) {
    return this.suppliersService.createPurchaseOrder(
      user.tenantId,
      user.branchId ?? '',
      user.id,
      dto,
      { permissions: user.permissions ?? [], roles: user.roles ?? [] },
    );
  }

  @Get()
  @RequirePermissions('purchases:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { status?: PurchaseOrderStatus }) {
    return this.suppliersService.findAllPOs(user.tenantId, query);
  }

  @Get('product-sales')
  @RequireAnyPermissions('purchases:read', 'purchases:create', 'reports:read')
  @ApiOperation({ summary: 'Product sales by date range (PO planning lookup — read only)' })
  productSales(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('search') search?: string,
    @Query('variantIds') variantIds?: string,
    @Query('limit') limit?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    return this.suppliersService.getProductSalesForPo(user.tenantId, user.branchId ?? undefined, {
      startDate,
      endDate,
      search,
      variantIds: variantIds
        ? variantIds.split(',').map((s) => s.trim()).filter(Boolean)
        : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get('reorder-suggestions')
  @RequirePermissions('purchases:read')
  @ApiOperation({ summary: 'Products at or below reorder point' })
  reorderSuggestions(@CurrentUser() user: IAuthUser) {
    return this.suppliersService.getReorderSuggestions(user.tenantId, user.branchId ?? undefined);
  }

  @Get(':id')
  @RequirePermissions('purchases:read')
  @ApiOperation({ summary: 'Get purchase order details' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.suppliersService.findOnePO(id, user.tenantId);
  }

  @Put(':id/status')
  @RequirePermissions('purchases:update')
  @ApiOperation({ summary: 'Update PO status' })
  updateStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePOStatusDto,
  ) {
    return this.suppliersService.updatePOStatus(id, user.tenantId, dto.status);
  }

  @Post(':id/receive')
  @RequirePermissions('purchases:update')
  @ApiOperation({ summary: 'Receive items for a purchase order (optional pay supplier now)' })
  async receiveItems(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: ReceivePoBodyDto,
    @Headers('x-pos-cashier-token') unlockToken?: string,
    @Headers('x-cash-approval-token') approvalToken?: string,
  ) {
    // The PIN cashier receives and pays; a cash payment above the limit needs a manager (acting or PIN
    // approval) and is checked BEFORE any stock is received.
    const actor = await this.suppliersService.resolveCash(user.tenantId, user, unlockToken, approvalToken);
    await this.suppliersService.assertCashPayable(user.tenantId, user.branchId, actor, body.payment);
    return this.suppliersService.receiveItems(
      id,
      user.tenantId,
      user.branchId ?? '',
      actor.actorId,
      body.items ?? [],
      body.payment,
      { authorizedById: actor.authorizerId },
      body.clientRequestId,
    );
  }

  @Post(':id/submit-approval')
  @RequirePermissions('purchases:update')
  @ApiOperation({ summary: 'Submit purchase order for approval workflow' })
  submitForApproval(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.suppliersService.submitPOForApproval(id, user.tenantId, user.id, user.roles);
  }

}

// ── Phase 3 Procurement DTOs ──────────────────────────────────────────

export class PrItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsString() @MaxLength(200) productName: string;
  @ApiProperty() @IsString() @MaxLength(200) variantName: string;
  @ApiProperty() @IsString() @MaxLength(100) sku: string;
  @ApiProperty() @IsNumber() @Min(0.001) requestedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) unitCostHint?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class CreatePurchaseRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [PrItemDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => PrItemDto)
  items: PrItemDto[];
}

export class ConvertPrDto {
  @ApiProperty() @IsString() supplierId: string;
}

export class DirectGrnLineDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsString() @MaxLength(200) productName: string;
  @ApiProperty() @IsString() @MaxLength(200) variantName: string;
  @ApiProperty() @IsString() @MaxLength(100) sku: string;
  @ApiProperty() @IsNumber() @Min(0) receivedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) rejectedQty?: number;
  @ApiProperty() @IsNumber() @Min(0) unitCost: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) sellingPrice?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) mrp?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) orderedQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseItemId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() manufactureDate?: string;
}

export class DirectGrnDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierInvoiceRef?: string;
  @ApiProperty({ type: [DirectGrnLineDto] })
  @IsArray() @ValidateNested({ each: true }) @Type(() => DirectGrnLineDto)
  lines: DirectGrnLineDto[];
  @ApiPropertyOptional({ description: 'Idempotency key, one per submit attempt; a retry with the same key returns the first result' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
}

export class QuickGrnLineDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsNumber() @Min(0.001) quantity: number;
  @ApiPropertyOptional({ description: "Omit to receive at the product's existing purchase cost. A different cost needs an inventory / finance role." })
  @IsOptional() @IsNumber() @Min(0) unitCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufactureDate?: string;
}

export class QuickGrnDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [QuickGrnLineDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => QuickGrnLineDto)
  lines: QuickGrnLineDto[];
  @ApiPropertyOptional({ type: ReceivePaymentDto }) @IsOptional() @ValidateNested() @Type(() => ReceivePaymentDto)
  payment?: ReceivePaymentDto;
  @ApiPropertyOptional({ description: 'Idempotency key, one per submit attempt; a retry with the same key returns the first result' })
  @IsOptional() @IsString() @Matches(CLIENT_REQUEST_ID_PATTERN, { message: 'clientRequestId must be 8–64 chars of A-Z a-z 0-9 _ -' })
  clientRequestId?: string;
}

/** One supplier return line (S-F7): quantity > 0 (3 dp, kg goods), unit cost >= 0, ids required. */
export class SupplierReturnLineDto {
  @ApiProperty() @IsString() @IsNotEmpty() variantId: string;
  @ApiProperty() @IsString() @MaxLength(200) productName: string;
  @ApiProperty() @IsString() @MaxLength(100) sku: string;
  @ApiProperty() @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 3 }) @Min(0.001) @Max(1_000_000_000) quantity: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1_000_000_000) unitCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() lotId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class CreateSupplierReturnDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() goodsReceiptId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: () => [SupplierReturnLineDto] })
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SupplierReturnLineDto)
  items: SupplierReturnLineDto[];
}

export class CreateSupplierInvoiceDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiProperty() @IsString() invoiceNumber: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() goodsReceiptId?: string;
  @ApiProperty() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1_000_000_000) subtotal: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1_000_000_000) taxAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() post?: boolean;
}

export class PayInvoiceDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) @NoCardNumber() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) @NoCardNumber() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) @NoCardNumber() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankAccountId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() paidAt?: string;
}

@ApiTags('Procurement')
@ApiBearerAuth('access-token')
@Controller({ path: 'procurement', version: '1' })
export class ProcurementController {
  constructor(private readonly procurement: ProcurementService) {}

  // Purchase Requests
  @Post('purchase-requests')
  @RequirePermissions('purchases:create')
  @ApiOperation({ summary: 'Create purchase request' })
  createPr(@CurrentUser() user: IAuthUser, @Body() dto: CreatePurchaseRequestDto) {
    return this.procurement.createPurchaseRequest(user.tenantId, user.branchId ?? '', user.id, dto.items, dto.notes);
  }

  @Get('purchase-requests')
  @RequirePermissions('purchases:read')
  listPr(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { status?: PurchaseRequestStatus }) {
    return this.procurement.listPurchaseRequests(user.tenantId, query);
  }

  @Get('purchase-requests/:id')
  @RequirePermissions('purchases:read')
  getPr(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.procurement.getPurchaseRequest(id, user.tenantId);
  }

  @Post('purchase-requests/:id/submit-approval')
  @RequirePermissions('purchases:update')
  submitPr(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.procurement.submitPurchaseRequest(id, user.tenantId, user.id, user.roles);
  }

  @Post('purchase-requests/:id/convert')
  @RequirePermissions('purchases:create')
  @ApiOperation({ summary: 'Convert approved PR to draft PO' })
  convertPr(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ConvertPrDto) {
    return this.procurement.convertPurchaseRequestToPo(id, user.tenantId, user.branchId ?? '', user.id, dto.supplierId);
  }

  // GRN
  @Get('grn')
  @RequirePermissions('purchases:read')
  listGrn(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { purchaseId?: string }) {
    return this.procurement.listGoodsReceipts(user.tenantId, query);
  }

  @Get('grn/:id')
  @RequirePermissions('purchases:read')
  getGrn(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.procurement.getGoodsReceipt(id, user.tenantId);
  }

  @Post('grn/direct')
  @RequirePermissions('purchases:create')
  @ApiOperation({ summary: 'Direct GRN without purchase order' })
  async directGrn(@CurrentUser() user: IAuthUser, @Body() dto: DirectGrnDto, @Headers('x-pos-cashier-token') unlockToken?: string) {
    const actor = await this.procurement.resolveCash(user.tenantId, user, unlockToken);
    return this.procurement.createDirectGrn(user.tenantId, user.branchId ?? '', actor.actorId, dto, actor.actorRoles);
  }

  @Post('grn/quick')
  @RequirePermissions('purchases:create')
  @ApiOperation({ summary: 'Quick GRN for cashier / walk-in supplier stock' })
  async quickGrn(@CurrentUser() user: IAuthUser, @Body() dto: QuickGrnDto, @Headers('x-pos-cashier-token') unlockToken?: string, @Headers('x-cash-approval-token') approvalToken?: string) {
    // Approval + drawer cash checked before the GRN posts stock; the payment itself then runs inside the
    // GRN transaction (all or nothing).
    const actor = await this.procurement.resolveCash(user.tenantId, user, unlockToken, approvalToken);
    await this.procurement.assertCashPayable(user.tenantId, user.branchId, actor, dto.payment);
    return this.procurement.createQuickGrn(user.tenantId, user.branchId ?? '', actor.actorId, dto, { authorizedById: actor.authorizerId }, actor.actorRoles);
  }

  // Supplier Returns
  @Post('supplier-returns')
  @RequirePermissions('purchases:create')
  createReturn(@CurrentUser() user: IAuthUser, @Body() dto: CreateSupplierReturnDto) {
    return this.procurement.createSupplierReturn(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('supplier-returns')
  @RequirePermissions('purchases:read')
  listReturns(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.procurement.listSupplierReturns(user.tenantId, query);
  }

  @Get('supplier-returns/:id')
  @RequirePermissions('purchases:read')
  getReturn(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.procurement.getSupplierReturn(id, user.tenantId);
  }

  @Post('supplier-returns/:id/post')
  @RequirePermissions('purchases:update')
  postReturn(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.procurement.postSupplierReturn(id, user.tenantId, user.id);
  }

  // Supplier Invoices
  @Post('supplier-invoices')
  @RequirePermissions('purchases:create')
  createInvoice(@CurrentUser() user: IAuthUser, @Body() dto: CreateSupplierInvoiceDto) {
    return this.procurement.createSupplierInvoice(user.tenantId, user.id, dto);
  }

  @Get('supplier-invoices')
  @RequirePermissions('purchases:read')
  listInvoices(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { supplierId?: string }) {
    return this.procurement.listSupplierInvoices(user.tenantId, query);
  }

  @Post('supplier-invoices/:id/pay')
  @RequirePermissions('purchases:update')
  async payInvoice(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: PayInvoiceDto, @Headers('x-pos-cashier-token') unlockToken?: string, @Headers('x-cash-approval-token') approvalToken?: string) {
    const actor = await this.procurement.resolveCash(user.tenantId, user, unlockToken, approvalToken);
    return this.procurement.paySupplierInvoice(id, user.tenantId, user.branchId ?? '', actor.actorId, dto, { authorizedById: actor.authorizerId });
  }
}

@Module({
  imports: [InventoryModule, WorkflowModule, DocumentNumberingModule],
  controllers: [SuppliersController, PurchasesController, ProcurementController],
  providers: [SuppliersService, ProcurementService, SupplierApService],
  exports: [SuppliersService, ProcurementService, SupplierApService],
})
export class SuppliersModule {}

@Module({ imports: [], controllers: [], providers: [] })
export class PurchasesModule {}
