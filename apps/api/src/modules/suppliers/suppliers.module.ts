import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsInt, IsArray, IsEnum, IsBoolean, IsDateString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PurchaseOrderStatus } from '@prisma/client';
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
import type { GrnLineInput, PrItemInput } from './procurement.service';
import { PurchaseRequestStatus } from '@prisma/client';

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

export class RecordPaymentDto {
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiProperty({ enum: PaymentMethod }) @IsEnum(PaymentMethod) method: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() purchaseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paidAt?: string;
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
    const [data, total] = await this.prisma.$transaction([
      this.prisma.supplier.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: { _count: { select: { purchases: true } } } }),
      this.prisma.supplier.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOneSupplier(id: string, tenantId: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId },
      include: { purchases: { orderBy: { createdAt: 'desc' }, take: 10 }, payments: { take: 10 } },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
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
    return this.prisma.purchaseOrder.create({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      data: {
        tenantId, branchId, supplierId: dto.supplierId,
        poNumber, subtotal, discountAmount, taxAmount,
        total: subtotal - discountAmount + taxAmount,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        notes: dto.notes, reference: dto.reference, paymentTerms: dto.paymentTerms,
        createdBy: userId,
        items: { create: itemsData },
      } as any,
      include: { items: true, supplier: true },
    });
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
          reference: dto.reference,
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

  async receiveItems(poId: string, tenantId: string, branchId: string, userId: string, items: ReceiveItemDto[]) {
    // Phase 3: PO receive creates a formal GoodsReceipt (GRN from PO) + partial receive status
    const result = await this.procurementService.receiveFromPurchaseOrder(poId, tenantId, branchId, userId, items);
    // Backward-compatible shape for existing UI, plus grn document
    return { ...result.purchaseOrder, grn: result.grn };
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
  constructor(private readonly suppliersService: SuppliersService) {}

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
  @ApiOperation({ summary: 'Receive items for a purchase order' })
  receiveItems(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body('items') items: ReceiveItemDto[],
  ) {
    return this.suppliersService.receiveItems(id, user.tenantId, user.branchId ?? '', user.id, items);
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
  @ApiPropertyOptional() @IsOptional() @IsString() batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufactureDate?: string;
}

export class QuickGrnDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [QuickGrnLineDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => QuickGrnLineDto)
  lines: QuickGrnLineDto[];
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
  providers: [SuppliersService, ProcurementService],
  exports: [SuppliersService, ProcurementService],
})
export class SuppliersModule {}

@Module({ imports: [], controllers: [], providers: [] })
export class PurchasesModule {}
