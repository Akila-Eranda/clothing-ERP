import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsEnum, IsArray, IsBoolean, IsOptional, IsInt, IsNumber, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ReturnReason, ReturnStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService, InventoryModule } from '@/modules/inventory/inventory.module';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { PaginationDto } from '@/common/dto/pagination.dto';

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
  ) {}

  async create(tenantId: string, branchId: string, userId: string, dto: CreateReturnDto) {
    const sale = await this.prisma.sale.findFirst({ where: { id: dto.originalSaleId, tenantId } });
    if (!sale) throw new NotFoundException('Original sale not found');

    const returnType = dto.returnType ?? 'RETURN';
    const returnNumber = `${returnType === 'EXCHANGE' ? 'EXC' : 'RET'}-${Date.now().toString(36).toUpperCase()}`;
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

      // Restock returned items
      if (dto.restockItems !== false) {
        for (const item of dto.items) {
          await this.inventoryService.adjustStock(tenantId, branchId, userId, {
            variantId: item.variantId, quantity: item.quantity,
            movementType: StockMovementType.RETURN, referenceId: created.id,
          });
        }
      }

      // Deduct exchange items from inventory
      if (returnType === 'EXCHANGE' && dto.exchangeItems?.length) {
        for (const item of dto.exchangeItems) {
          await this.inventoryService.adjustStock(tenantId, branchId, userId, {
            variantId: item.variantId, quantity: item.quantity,
            movementType: StockMovementType.SALE, referenceId: created.id,
          });
        }
      }

      return created;
    });

    return ret;
  }

  async findAll(tenantId: string, query: PaginationDto) {
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
    await this.findOne(id, tenantId);
    return this.prisma.return.update({
      where: { id },
      data: {
        status,
        ...(status === ReturnStatus.APPROVED && { approvedBy: userId }),
      },
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
  imports: [InventoryModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}
