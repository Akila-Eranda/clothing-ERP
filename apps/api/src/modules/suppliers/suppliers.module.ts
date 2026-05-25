import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsInt, IsArray, IsEnum, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod, PurchaseOrderStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService, InventoryModule } from '@/modules/inventory/inventory.module';

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

  async updatePOStatus(id: string, tenantId: string, status: PurchaseOrderStatus) {
    const po = await this.prisma.purchaseOrder.findFirst({ where: { id, tenantId } });
    if (!po) throw new NotFoundException('Purchase order not found');
    return this.prisma.purchaseOrder.update({ where: { id }, data: { status } });
  }

  async recordPayment(supplierId: string, tenantId: string, dto: RecordPaymentDto) {
    await this.findOneSupplier(supplierId, tenantId);
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId,
          purchaseId: dto.purchaseId || undefined,
          amount:     dto.amount,
          method:     dto.method,
          reference:  dto.reference,
          notes:      dto.notes,
          paidAt:     dto.paidAt ? new Date(dto.paidAt) : new Date(),
        },
      });
      await tx.supplier.update({
        where: { id: supplierId },
        data: { balance: { decrement: dto.amount } },
      });
      if (dto.purchaseId) {
        await tx.purchaseOrder.update({
          where: { id: dto.purchaseId },
          data: { paidAmount: { increment: dto.amount } },
        });
      }
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
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    await this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        await tx.purchaseOrderItem.update({
          where: { id: item.itemId },
          data: { receivedQty: { increment: item.receivedQty }, rejectedQty: { increment: item.rejectedQty ?? 0 } },
        });
        const poItem = po.items.find((i) => i.id === item.itemId);
        if (poItem && item.receivedQty > 0) {
          await this.inventoryService.adjustStock(tenantId, branchId, userId, {
            variantId: poItem.variantId,
            quantity: item.receivedQty,
            movementType: StockMovementType.PURCHASE,
            referenceId: poId,
          });
        }
      }

      const allReceived = await tx.purchaseOrderItem.findMany({ where: { purchaseId: poId } });
      const fullyReceived = allReceived.every((i) => i.receivedQty >= i.orderedQty);
      const partiallyReceived = allReceived.some((i) => i.receivedQty > 0);

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: fullyReceived ? PurchaseOrderStatus.RECEIVED : PurchaseOrderStatus.PARTIALLY_RECEIVED,
          receivedDate: fullyReceived ? new Date() : undefined,
        },
      });
    });

    return this.prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { items: true } });
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
    return this.suppliersService.recordPayment(id, user.tenantId, dto);
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

}

@Module({
  imports: [InventoryModule],
  controllers: [SuppliersController, PurchasesController],
  providers: [SuppliersService],
  exports: [SuppliersService],
})
export class SuppliersModule {}

@Module({ imports: [], controllers: [], providers: [] })
export class PurchasesModule {}
