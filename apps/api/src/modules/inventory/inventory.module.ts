import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, IsEnum, IsInt, Min, IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StockMovementType, TransferStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';

export class AdjustStockDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() quantity: number;
  @ApiProperty({ enum: StockMovementType }) @IsEnum(StockMovementType) movementType: StockMovementType;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
}

export class TransferItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) requestedQty: number;
}

export class CreateTransferDto {
  @ApiProperty() @IsString() toBranchId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [TransferItemDto] }) @IsArray() items: TransferItemDto[];
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getStock(tenantId: string, branchId: string, query: PaginationDto & { lowStock?: boolean }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(branchId && { branchId }),
      ...(query.lowStock === true && { quantity: { lte: 5 } }),
      ...(query.search && {
        variant: {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { sku: { contains: query.search, mode: 'insensitive' as const } },
          ],
        },
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventory.findMany({
        where,
        skip,
        take,
        include: {
          variant: { include: { product: { include: { category: true } } } },
        },
        orderBy: { quantity: 'asc' },
      }),
      this.prisma.inventory.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async getLowStock(tenantId: string, branchId: string) {
    return this.prisma.inventory.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
        quantity: { lte: 5 },
      },
      include: { variant: { include: { product: true } } },
      orderBy: { quantity: 'asc' },
      take: 100,
    });
  }

  async adjustStock(tenantId: string, branchId: string, userId: string, dto: AdjustStockDto) {
    const effectiveBranch = branchId || await this.prisma.branch.findFirst({ where: { tenantId }, select: { id: true } }).then(b => b?.id ?? 'default');
    const inventory = await this.prisma.inventory.findFirst({
      where: { tenantId, branchId: effectiveBranch, variantId: dto.variantId },
    });

    const currentQty = inventory?.quantity ?? 0;
    const newQty = dto.movementType === StockMovementType.ADJUSTMENT
      ? dto.quantity
      : currentQty + dto.quantity;

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = inventory
        ? await tx.inventory.update({
            where: { id: inventory.id },
            data: { quantity: Math.max(0, newQty) },
          })
        : await tx.inventory.create({
            data: {
              tenantId,
              branchId: effectiveBranch,
              variantId: dto.variantId,
              quantity: Math.max(0, dto.quantity),
            },
          });

      await tx.inventoryLog.create({
        data: {
          tenantId,
          branchId: effectiveBranch,
          variantId: dto.variantId,
          movementType: dto.movementType,
          quantityChange: newQty - currentQty,
          quantityBefore: currentQty,
          quantityAfter: Math.max(0, newQty),
          notes: dto.notes,
          referenceId: dto.referenceId,
          performedBy: userId,
        },
      });

      return updated;
    });

    if (result.quantity <= 5) {
      this.eventEmitter.emit('inventory.low-stock', {
        tenantId,
        branchId,
        variantId: dto.variantId,
        quantity: result.quantity,
      });
    }

    return result;
  }

  async getInventoryLogs(tenantId: string, branchId: string, variantId?: string, query?: PaginationDto) {
    const { skip, take } = getPaginationArgs(query?.page, query?.limit);
    const where = { tenantId, branchId, ...(variantId && { variantId }) };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryLog.findMany({
        where,
        skip,
        take,
        include: { variant: { include: { product: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryLog.count({ where }),
    ]);

    return paginate(data, total, query?.page ?? 1, query?.limit ?? 20);
  }

  async createTransfer(tenantId: string, fromBranchId: string, userId: string, dto: CreateTransferDto) {
    return this.prisma.stockTransfer.create({
      data: {
        tenantId,
        fromBranchId,
        toBranchId: dto.toBranchId,
        notes: dto.notes,
        requestedBy: userId,
        items: {
          create: dto.items.map((item) => ({
            variantId: item.variantId,
            requestedQty: item.requestedQty,
          })),
        },
      },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
  }

  async getTransfers(tenantId: string, branchId: string) {
    return this.prisma.stockTransfer.findMany({
      where: { tenantId, OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] },
      include: { items: { include: { variant: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateTransferStatus(id: string, status: TransferStatus, userId: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({ where: { id } });
    if (!transfer) throw new NotFoundException('Transfer not found');

    const updateData: Record<string, unknown> = { status };
    if (status === TransferStatus.IN_TRANSIT) updateData.dispatchedAt = new Date();
    if (status === TransferStatus.RECEIVED) {
      updateData.receivedAt = new Date();
      updateData.approvedBy = userId;
    }

    return this.prisma.stockTransfer.update({ where: { id }, data: updateData });
  }
}

@ApiTags('Inventory')
@ApiBearerAuth('access-token')
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get stock levels for a branch' })
  getStock(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { lowStock?: boolean }) {
    const branchId = user.branchId ?? '';
    return this.inventoryService.getStock(user.tenantId, branchId, query);
  }

  @Get('low-stock')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get low stock items' })
  getLowStock(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getLowStock(user.tenantId, user.branchId ?? '');
  }

  @Post('adjust')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Adjust stock quantity' })
  adjustStock(@CurrentUser() user: IAuthUser, @Body() dto: AdjustStockDto) {
    return this.inventoryService.adjustStock(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('logs')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get inventory movement logs' })
  getLogs(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { variantId?: string }) {
    return this.inventoryService.getInventoryLogs(user.tenantId, user.branchId ?? '', query.variantId, query);
  }

  @Post('transfers')
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'Create stock transfer between branches' })
  createTransfer(@CurrentUser() user: IAuthUser, @Body() dto: CreateTransferDto) {
    return this.inventoryService.createTransfer(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('transfers')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List stock transfers' })
  getTransfers(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getTransfers(user.tenantId, user.branchId ?? '');
  }

  @Put('transfers/:id/status')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Update transfer status' })
  updateTransferStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body('status') status: TransferStatus,
  ) {
    return this.inventoryService.updateTransferStatus(id, status, user.id);
  }
}

@Module({
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
