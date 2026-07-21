import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsString, IsEnum, IsArray, IsBoolean, IsOptional, IsInt, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnReason, ReturnStatus, StockMovementType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService, InventoryModule } from '@/modules/inventory/inventory.module';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { assertShopModule } from '@/shared/shop-module.helper';
import { recordRefundCashMovement } from '@/shared/cash-register.helper';
import { PaymentMethod } from '@prisma/client';
import { CustomersModule } from '@/modules/customers/customers.module';
import { CustomerCreditService } from '@/modules/customers/customer-credit.service';
import { DocumentNumberingModule } from '@/modules/document-numbering/document-numbering.module';
import { DocumentNumberingService } from '@/modules/document-numbering/document-numbering.service';

export class ReturnItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
}

export class ExchangeItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsString() productName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() variantName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
}

export class CreateReturnDto {
  @ApiProperty() @IsString() originalSaleId: string;
  @ApiProperty({ enum: ReturnReason }) @IsEnum(ReturnReason) reason: ReturnReason;
  @ApiPropertyOptional() @IsOptional() @IsString() returnType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() restockItems?: boolean;
  @ApiProperty({ type: [ReturnItemDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => ReturnItemDto) items: ReturnItemDto[];
  @ApiPropertyOptional({ type: [ExchangeItemDto] }) @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => ExchangeItemDto) exchangeItems?: ExchangeItemDto[];
}

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventoryService: InventoryService,
    private readonly creditService: CustomerCreditService,
    private readonly numbering: DocumentNumberingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, branchId: string, userId: string, dto: CreateReturnDto) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const sale = await this.prisma.sale.findFirst({
      where: { id: dto.originalSaleId, tenantId },
      include: { payments: true },
    });
    if (!sale) throw new NotFoundException('Original sale not found');
    if (sale.status === 'REFUNDED') {
      throw new BadRequestException('This invoice was already fully refunded');
    }
    if (sale.status !== 'COMPLETED' && sale.status !== 'PARTIALLY_REFUNDED') {
      throw new BadRequestException('Returns are only allowed for completed sales');
    }

    for (const item of dto.items) {
      const line = await this.prisma.saleItem.findFirst({
        where: { saleId: dto.originalSaleId, variantId: item.variantId },
      });
      if (!line) {
        throw new BadRequestException('Returned item was not on the original invoice');
      }
      if (item.quantity > line.quantity) {
        throw new BadRequestException(`Return quantity exceeds sold quantity for ${line.productName}`);
      }
    }

    const returnType = dto.returnType ?? 'RETURN';
    const returnNumber = this.numbering.isEngineEnabled()
      ? await this.numbering.allocateStandalone(
          tenantId,
          returnType === 'EXCHANGE' ? 'EXCHANGE' : 'RETURN',
        )
      : `${returnType === 'EXCHANGE' ? 'EXC' : 'RET'}-${Date.now().toString(36).toUpperCase()}`;
    const totalAmount    = dto.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const exchangeAmount = (dto.exchangeItems ?? []).reduce((s, i) => s + i.unitPrice * i.quantity, 0);
    const refundAmount   = returnType === 'EXCHANGE' ? Math.max(0, totalAmount - exchangeAmount) : totalAmount;

    const ret = await this.prisma.$transaction(async (tx) => {
      const createData: any = {
        tenantId, branchId,
        originalSaleId: dto.originalSaleId,
        returnNumber, reason: dto.reason, notes: dto.notes,
        returnType, exchangeAmount, exchangeData: dto.exchangeItems ?? null,
        restockItems: dto.restockItems ?? true,
        totalAmount, refundAmount,
        processedBy: userId,
        items: { create: dto.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity, unitPrice: item.unitPrice, totalAmount: item.unitPrice * item.quantity })) },
      };
      const created = await tx.return.create({ data: createData, include: { items: true } });

      await this.applyStockEffects(tenantId, created, userId, tx);
      const updated = await tx.return.update({
        where: { id: created.id },
        data: { status: ReturnStatus.APPROVED, approvedBy: userId },
        include: { items: true },
      });

      return updated;
    });

    const paidCash = sale.paymentMethod === PaymentMethod.CASH
      || sale.payments.some((p) => p.method === PaymentMethod.CASH);
    if (paidCash && refundAmount > 0) {
      await recordRefundCashMovement(
        this.prisma,
        tenantId,
        branchId,
        userId,
        ret.id,
        ret.returnNumber,
        refundAmount,
      );
    }

    if (refundAmount > 0) {
      await this.creditService.reverseCreditForSaleReturn(
        tenantId,
        sale.id,
        refundAmount,
        `Return ${ret.returnNumber} credit reversal`,
      );
    }

    this.eventEmitter.emit('accounting.return.completed', {
      returnId: ret.id,
      tenantId,
      userId,
    });

    return ret;
  }

  private async applyStockEffects(
    tenantId: string,
    ret: {
      id: string;
      branchId: string;
      originalSaleId: string;
      restockItems: boolean;
      returnType: string;
      exchangeData: unknown;
      items: { variantId: string; quantity: number }[];
    },
    userId: string,
    tx?: Prisma.TransactionClient,
  ) {
    if (ret.restockItems) {
      for (const item of ret.items) {
        await this.inventoryService.adjustStock(tenantId, ret.branchId, userId, {
          variantId: item.variantId,
          quantity: item.quantity,
          movementType: StockMovementType.RETURN,
          referenceId: ret.id,
          referenceType: 'Return',
        }, tx);
      }
    }
    if (ret.returnType === 'EXCHANGE') {
      const exchangeData = (ret.exchangeData as { variantId?: string; quantity?: number }[]) ?? [];
      for (const item of exchangeData) {
        if (item?.variantId && item.quantity) {
          await this.inventoryService.adjustStock(tenantId, ret.branchId, userId, {
            variantId: item.variantId,
            quantity: item.quantity,
            movementType: StockMovementType.SALE,
            referenceId: ret.id,
            referenceType: 'ReturnExchange',
          }, tx);
        }
      }
    }

    const client = tx ?? this.prisma;
    const sale = await client.sale.findFirst({
      where: { id: ret.originalSaleId, tenantId },
      include: { items: true },
    });
    if (!sale) return;

    const approvedReturns = await client.return.findMany({
      where: {
        tenantId,
        originalSaleId: ret.originalSaleId,
        status: ReturnStatus.APPROVED,
        id: { not: ret.id },
      },
      include: { items: true },
    });

    const returnedByVariant = new Map<string, number>();
    for (const r of approvedReturns) {
      for (const item of r.items) {
        returnedByVariant.set(item.variantId, (returnedByVariant.get(item.variantId) ?? 0) + item.quantity);
      }
    }
    for (const item of ret.items) {
      returnedByVariant.set(item.variantId, (returnedByVariant.get(item.variantId) ?? 0) + item.quantity);
    }

    const fullyReturned = sale.items.every(
      (si) => (returnedByVariant.get(si.variantId ?? '') ?? 0) >= si.quantity,
    );

    await client.sale.update({
      where: { id: ret.originalSaleId },
      data: { status: fullyReturned ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
  }

  async findAll(tenantId: string, query: PaginationDto) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.return.findMany({
        where: { tenantId }, skip, take,
        include: {
          items: { include: { variant: { include: { product: { select: { name: true } } } } } },
          originalSale: { select: { invoiceNumber: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.return.count({ where: { tenantId } }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const ret = await this.prisma.return.findFirst({
      where: { id, tenantId },
      include: {
        items: { include: { variant: { include: { product: { select: { name: true } } } } } },
        originalSale: { select: { invoiceNumber: true, total: true, customer: { select: { firstName: true, lastName: true } } } },
      },
    });
    if (!ret) throw new NotFoundException('Return not found');
    return ret;
  }

  async updateStatus(id: string, tenantId: string, status: ReturnStatus, userId: string) {
    await assertShopModule(this.prisma, tenantId, 'returns');
    const ret = await this.findOne(id, tenantId);
    const r = ret as any;

    if (status === ReturnStatus.APPROVED && r.status === ReturnStatus.INITIATED) {
      await this.applyStockEffects(tenantId, {
        id: r.id,
        branchId: r.branchId,
        originalSaleId: r.originalSaleId,
        restockItems: r.restockItems,
        returnType: r.returnType,
        exchangeData: r.exchangeData,
        items: r.items,
      }, userId);
    }

    return this.prisma.return.update({
      where: { id },
      data: { status, ...(status === ReturnStatus.APPROVED && { approvedBy: userId }) },
    });
  }
}

@ApiTags('Returns')
@ApiBearerAuth('access-token')
@Controller({ path: 'returns', version: '1' })
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Post()
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Create a return or exchange' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateReturnDto) {
    return this.returnsService.create(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get()
  @RequirePermissions('sales:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.returnsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('sales:read')
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.returnsService.findOne(id, user.tenantId);
  }

  @Put(':id/status')
  @RequirePermissions('sales:update')
  updateStatus(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body('status') status: ReturnStatus) {
    return this.returnsService.updateStatus(id, user.tenantId, status, user.id);
  }
}

@Module({
  imports: [InventoryModule, CustomersModule, DocumentNumberingModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
