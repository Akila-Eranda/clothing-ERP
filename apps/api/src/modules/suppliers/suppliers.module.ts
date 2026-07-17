import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsInt, IsArray, IsEnum, IsBoolean, IsDateString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ChequeDirection, ChequeStatus, PaymentMethod, PurchaseOrderStatus, PurchaseRequestStatus, SupplierLedgerEntryType } from '@prisma/client';
import { chequeSourceNotes } from '@/modules/accounting/finance.helper';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService, InventoryModule } from '@/modules/inventory/inventory.module';
import { WorkflowService, WorkflowModule } from '@/modules/workflow/workflow.module';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { createLinkedExpense } from '@/shared/expense.helper';
import { ProcurementService } from './procurement.service';
import { SupplierApService } from './supplier-ap.service';
import type { GrnLineInput, PrItemInput } from './procurement.service';
import {
  assertSupplierCreditLimit,
  bucketAging,
  computeSupplierOutstanding,
  syncSupplierBalanceWithLedger,
} from './supplier-ap.helper';

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

export class PurchaseItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsString() productName: string;
  @ApiProperty() @IsString() variantName: string;
  @ApiProperty() @IsString() sku: string;
  @ApiProperty() @IsInt() @Min(1) orderedQty: number;
  @ApiProperty() @IsNumber() @Min(0) unitCost: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) taxRate?: number;
}

export class CreatePurchaseOrderDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expectedDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paymentTerms?: string;
  @ApiPropertyOptional({ description: 'Link an existing Quick/Direct GRN (stock already posted)' })
  @IsOptional() @IsString() fromGrnId?: string;
  @ApiProperty({ type: [PurchaseItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items: PurchaseItemDto[];
}

export class UpdatePOStatusDto {
  @ApiProperty({ enum: PurchaseOrderStatus }) @IsEnum(PurchaseOrderStatus) status: PurchaseOrderStatus;
}

export class ReceiveItemDto {
  @ApiProperty() @IsString() itemId: string;
  @ApiProperty() @IsInt() @Min(0) receivedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) rejectedQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufactureDate?: string;
}

/** Optional supplier payment recorded in the same receive action. */
export class ReceivePaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
}

export class ReceivePoBodyDto {
  @ApiProperty({ type: [ReceiveItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];
  @ApiPropertyOptional({ type: ReceivePaymentDto }) @IsOptional() @ValidateNested() @Type(() => ReceivePaymentDto)
  payment?: ReceivePaymentDto;
}

export class RecordPaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paidAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankAccountId?: string;
  /** When false, skip creating a Cheque row (e.g. extra PO lines under one cheque). Default true for CHEQUE. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() registerCheque?: boolean;
  /** Override cheque face amount when one cheque covers multiple PO payments. */
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) chequeAmount?: number;
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
  ) {}

  async createSupplier(tenantId: string, dto: CreateSupplierDto) {
    const code = `SUP-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.supplier.create({ data: { tenantId, code, ...dto } });
  }

  async findAllSuppliers(tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search } },
        ],
      }),
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

  async updateSupplier(id: string, tenantId: string, dto: Partial<CreateSupplierDto>) {
    await this.findOneSupplier(id, tenantId);
    return this.prisma.supplier.update({ where: { id }, data: dto as object });
  }

  async removeSupplier(id: string, tenantId: string) {
    await this.findOneSupplier(id, tenantId);
    return this.prisma.supplier.delete({ where: { id } });
  }

  async createPurchaseOrder(tenantId: string, branchId: string, userId: string, dto: CreatePurchaseOrderDto) {
    const poNumber = `PO-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const itemsData = dto.items.map((item) => {
      const lineTotal = item.unitCost * item.orderedQty;
      const disc = item.discount ?? 0;
      const taxable = lineTotal - disc;
      const tax = (taxable * (item.taxRate ?? 0)) / 100;
      return { variantId: item.variantId, productName: item.productName, variantName: item.variantName, sku: item.sku, orderedQty: item.orderedQty, unitCost: item.unitCost, discount: disc, taxRate: item.taxRate ?? 0, taxAmount: tax, total: taxable + tax };
    });
    const subtotal   = itemsData.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
    const discountAmount = itemsData.reduce((s, i) => s + i.discount, 0);
    const taxAmount  = itemsData.reduce((s, i) => s + i.taxAmount, 0);
    const poTotal = subtotal - discountAmount + taxAmount;

    // Credit limit: only enforce when PO will immediately become payable (from GRN / received)
    if (dto.fromGrnId) {
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
        poNumber, subtotal, discountAmount, taxAmount,
        total: subtotal - discountAmount + taxAmount,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes, reference: dto.reference, paymentTerms: dto.paymentTerms,
        createdBy: userId,
        items: { create: itemsData },
        ...(grnToLink
          ? {
              status: PurchaseOrderStatus.RECEIVED,
              receivedDate: grnToLink.receivedAt,
            }
          : {}),
      } as any,
      include: { items: true, supplier: true },
    });

    if (grnToLink) {
      await this.prisma.$transaction(async (tx) => {
        for (const pi of po.items) {
          await tx.purchaseOrderItem.update({
            where: { id: pi.id },
            data: { receivedQty: pi.orderedQty },
          });
        }
        await tx.goodsReceipt.update({
          where: { id: grnToLink!.id },
          data: { purchaseId: po.id },
        });
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
      });
      return this.findOnePO(po.id, tenantId);
    }

    return po;
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
    userRoles: string[] = [],
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === PurchaseOrderStatus.PENDING_APPROVAL) {
      throw new BadRequestException('Cannot change status while approval is pending');
    }
    if (
      po.status === PurchaseOrderStatus.DRAFT &&
      status === PurchaseOrderStatus.CONFIRMED &&
      !bypassesWorkflowApproval(userRoles)
    ) {
      throw new BadRequestException(
        'Use Submit for Approval to confirm this order. Direct confirmation requires admin access.',
      );
    }
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status } });
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
  ) {
    const supplier = await this.findOneSupplier(supplierId, tenantId);
    if (dto.amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }
    const chequeNumber = (dto.chequeNumber ?? dto.reference)?.trim();
    if (dto.method === PaymentMethod.CHEQUE && !chequeNumber) {
      throw new BadRequestException('Cheque number is required for cheque payments');
    }
    return this.prisma.$transaction(async (tx) => {
      let poNumber: string | undefined;
      if (dto.purchaseId) {
        const po = await tx.purchaseOrder.findFirst({
          where: { id: dto.purchaseId, tenantId, supplierId },
        });
        if (!po) throw new NotFoundException('Purchase order not found for this supplier');
        poNumber = po.poNumber;
        const due = Math.max(0, po.total - po.paidAmount);
        if (dto.amount > due + 0.01) {
          throw new BadRequestException(
            `Payment exceeds PO balance due (LKR ${due.toFixed(2)} remaining)`,
          );
        }
      }

      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId,
          purchaseId: dto.purchaseId || undefined,
          amount: dto.amount,
          method: dto.method,
          reference: dto.reference ?? chequeNumber,
          notes: dto.notes,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        },
      });

      if (dto.purchaseId) {
        await tx.purchaseOrder.update({
          where: { id: dto.purchaseId },
          data: { paidAmount: { increment: dto.amount } },
        });
      }

      if (dto.method === PaymentMethod.CHEQUE && dto.registerCheque !== false) {
        await tx.cheque.create({
          data: {
            tenantId,
            direction: ChequeDirection.ISSUED,
            status: ChequeStatus.ISSUED,
            chequeNumber: chequeNumber!,
            amount: dto.chequeAmount && dto.chequeAmount > 0 ? dto.chequeAmount : dto.amount,
            bankName: dto.chequeBankName?.trim() || undefined,
            dueDate: dto.chequeDueDate ? new Date(dto.chequeDueDate) : undefined,
            partyType: 'SUPPLIER',
            partyId: supplierId,
            partyName: supplier.name,
            bankAccountId: dto.chequeBankAccountId || undefined,
            notes: chequeSourceNotes(
              'SupplierPayment',
              payment.id,
              dto.notes
                ? `Supplier payment: ${dto.notes}`
                : poNumber
                  ? `Supplier payment — ${supplier.name} (PO ${poNumber})`
                  : `Supplier payment — ${supplier.name}`,
            ),
            createdBy: userId,
          },
        });
      }

      await createLinkedExpense(tx, {
        tenantId,
        branchId: branchId || undefined,
        userId,
        amount: dto.amount,
        description: poNumber
          ? `Supplier payment — ${supplier.name} (PO ${poNumber})`
          : `Supplier payment — ${supplier.name}`,
        date: payment.paidAt,
        categoryId: 'Operations',
        paymentMethod: dto.method,
        reference: `supplier-payment:${payment.id}`,
      });

      await syncSupplierBalanceWithLedger(tx, tenantId, supplierId, {
        entryType: SupplierLedgerEntryType.PAYMENT,
        amount: -dto.amount,
        referenceType: 'SupplierPayment',
        referenceId: payment.id,
        notes: poNumber ? `Payment against PO ${poNumber}` : 'Supplier payment',
        createdBy: userId,
      });

      return payment;
    });
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

  async receiveItems(
    poId: string,
    tenantId: string,
    branchId: string,
    userId: string,
    items: ReceiveItemDto[],
    payment?: ReceivePaymentDto,
  ) {
    // Phase 3: PO receive creates a formal GoodsReceipt (GRN from PO) + partial receive status
    const result = await this.procurementService.receiveFromPurchaseOrder(poId, tenantId, branchId, userId, items);
    let paymentResult: unknown = null;
    if (payment && payment.amount > 0) {
      const po = result.purchaseOrder;
      if (!po) throw new BadRequestException('Purchase order missing after receive');
      paymentResult = await this.recordPayment(po.supplierId, tenantId, branchId, userId, {
        amount: payment.amount,
        method: payment.method,
        purchaseId: poId,
        reference: payment.reference,
        notes: payment.notes ?? `Payment on GRN ${result.grn?.grnNumber ?? poId}`,
        chequeNumber: payment.chequeNumber,
        chequeDueDate: payment.chequeDueDate,
        chequeBankName: payment.chequeBankName,
      });
    }
    // Backward-compatible shape for existing UI, plus grn document
    return { ...result.purchaseOrder, grn: result.grn, payment: paymentResult };
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
  apPayment(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      amount: number;
      method?: string;
      reference?: string;
      notes?: string;
      invoiceId?: string;
      purchaseId?: string;
      paidAt?: string;
    },
  ) {
    return this.apService.receivePayment(
      id,
      user.tenantId,
      user.branchId ?? '',
      user.id,
      body,
    );
  }

  @Post(':id/ap/debit-notes')
  @RequirePermissions('suppliers:update')
  @ApiOperation({ summary: 'Issue supplier debit note against AP' })
  apDebitNote(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body()
    body: {
      amount: number;
      reason?: string;
      invoiceId?: string;
      purchaseId?: string;
      noteDate?: string;
      referenceId?: string;
    },
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
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<CreateSupplierDto>) {
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
  recordPayment(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: RecordPaymentDto) {
    return this.suppliersService.recordPayment(id, user.tenantId, user.branchId ?? '', user.id, dto);
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
    return this.suppliersService.createPurchaseOrder(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get()
  @RequirePermissions('purchases:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { status?: PurchaseOrderStatus }) {
    return this.suppliersService.findAllPOs(user.tenantId, query);
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
    return this.suppliersService.updatePOStatus(id, user.tenantId, dto.status, user.roles);
  }

  @Post(':id/receive')
  @RequirePermissions('purchases:update')
  @ApiOperation({ summary: 'Receive items for a purchase order (optional pay supplier now)' })
  receiveItems(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: ReceivePoBodyDto,
  ) {
    return this.suppliersService.receiveItems(
      id,
      user.tenantId,
      user.branchId ?? '',
      user.id,
      body.items ?? [],
      body.payment,
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

export class CreatePurchaseRequestDto {
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: 'array' }) @IsArray() items: PrItemInput[];
}

export class ConvertPrDto {
  @ApiProperty() @IsString() supplierId: string;
}

export class DirectGrnDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierInvoiceRef?: string;
  @ApiProperty({ type: 'array' }) @IsArray() lines: GrnLineInput[];
}

export class QuickGrnLineDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitCost: number;
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
}

export class CreateSupplierReturnDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() goodsReceiptId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reason?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: 'array' }) @IsArray() items: {
    variantId: string; productName: string; sku: string; quantity: number;
    unitCost?: number; lotId?: string; batchNumber?: string; reason?: string;
  }[];
}

export class CreateSupplierInvoiceDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiProperty() @IsString() invoiceNumber: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() goodsReceiptId?: string;
  @ApiProperty() @IsNumber() @Min(0) subtotal: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() post?: boolean;
}

export class PayInvoiceDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() chequeDueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chequeBankAccountId?: string;
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
  directGrn(@CurrentUser() user: IAuthUser, @Body() dto: DirectGrnDto) {
    return this.procurement.createDirectGrn(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Post('grn/quick')
  @RequirePermissions('purchases:create')
  @ApiOperation({ summary: 'Quick GRN for cashier / walk-in supplier stock' })
  quickGrn(@CurrentUser() user: IAuthUser, @Body() dto: QuickGrnDto) {
    return this.procurement.createQuickGrn(user.tenantId, user.branchId ?? '', user.id, dto);
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
  payInvoice(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: PayInvoiceDto) {
    return this.procurement.paySupplierInvoice(id, user.tenantId, user.branchId ?? '', user.id, dto);
  }
}

@Module({
  imports: [InventoryModule, WorkflowModule],
  controllers: [SuppliersController, PurchasesController, ProcurementController],
  providers: [SuppliersService, ProcurementService, SupplierApService],
  exports: [SuppliersService, ProcurementService, SupplierApService],
})
export class SuppliersModule {}

@Module({ imports: [], controllers: [], providers: [] })
export class PurchasesModule {}
