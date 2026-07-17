import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, IsArray, ValidateNested, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService, CreateTransferDto } from '@/modules/inventory/inventory.module';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { summarizeWarehouseStock } from './warehouse.helper';

export class CreateWarehouseDto {
  @ApiProperty() @IsString() branchId: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty() @IsString() code: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdateWarehouseDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class WarehouseTransferItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) requestedQty: number;
}

export class CreateWarehouseTransferDto {
  @ApiProperty() @IsString() fromWarehouseId: string;
  @ApiProperty() @IsString() toWarehouseId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [WarehouseTransferItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WarehouseTransferItemDto)
  items: WarehouseTransferItemDto[];
}

@Injectable()
export class WarehouseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

  /** Ensure each branch has a default warehouse; return default for branch. */
  async ensureDefaultWarehouse(tenantId: string, branchId: string) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { tenantId, branchId, isDefault: true, isActive: true },
    });
    if (existing) return existing;

    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');

    const codeBase = `${branch.code}-MAIN`.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    let code = codeBase;
    let n = 1;
    while (await this.prisma.warehouse.findFirst({ where: { tenantId, code } })) {
      code = `${codeBase}-${n++}`.slice(0, 24);
    }

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        branchId,
        name: `${branch.name} Main`,
        code,
        isDefault: true,
        isActive: true,
      },
    });
  }

  async resolveWarehouseId(tenantId: string, branchId: string, warehouseId?: string | null) {
    if (warehouseId) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: warehouseId, tenantId, isActive: true },
      });
      if (!wh) throw new NotFoundException('Warehouse not found');
      return wh.id;
    }
    const def = await this.ensureDefaultWarehouse(tenantId, branchId);
    return def.id;
  }

  async create(tenantId: string, dto: CreateWarehouseDto) {
    const branch = await this.prisma.branch.findFirst({ where: { id: dto.branchId, tenantId } });
    if (!branch) throw new NotFoundException('Branch not found');

    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { tenantId, branchId: dto.branchId, isDefault: true },
        data: { isDefault: false },
      });
    }

    const hasDefault = await this.prisma.warehouse.findFirst({
      where: { tenantId, branchId: dto.branchId, isDefault: true },
    });

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        name: dto.name,
        code: dto.code.toUpperCase(),
        address: dto.address,
        isDefault: dto.isDefault ?? !hasDefault,
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async list(tenantId: string, branchId?: string) {
    await this.bootstrapDefaults(tenantId, branchId);

    const warehouses = await this.prisma.warehouse.findMany({
      where: {
        tenantId,
        ...(branchId ? { branchId } : {}),
        isActive: true,
      },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { inventory: true } },
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    return warehouses;
  }

  async bootstrapDefaults(tenantId: string, branchId?: string) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, isActive: true, ...(branchId ? { id: branchId } : {}) },
      select: { id: true },
    });
    for (const b of branches) {
      await this.ensureDefaultWarehouse(tenantId, b.id);
    }
  }

  async getOne(tenantId: string, id: string) {
    const wh = await this.prisma.warehouse.findFirst({
      where: { id, tenantId },
      include: {
        branch: { select: { id: true, name: true, code: true } },
        _count: { select: { inventory: true } },
      },
    });
    if (!wh) throw new NotFoundException('Warehouse not found');
    return wh;
  }

  async update(tenantId: string, id: string, dto: UpdateWarehouseDto) {
    const wh = await this.getOne(tenantId, id);
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({
        where: { tenantId, branchId: wh.branchId, isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }
    return this.prisma.warehouse.update({
      where: { id },
      data: {
        ...(dto.name != null ? { name: dto.name } : {}),
        ...(dto.code != null ? { code: dto.code.toUpperCase() } : {}),
        ...(dto.address !== undefined ? { address: dto.address } : {}),
        ...(dto.isDefault != null ? { isDefault: dto.isDefault } : {}),
        ...(dto.isActive != null ? { isActive: dto.isActive } : {}),
      },
      include: { branch: { select: { id: true, name: true, code: true } } },
    });
  }

  async remove(tenantId: string, id: string) {
    const wh = await this.getOne(tenantId, id);
    if (wh.isDefault) throw new BadRequestException('Cannot delete the default warehouse');
    const stock = await this.prisma.inventory.aggregate({
      where: { warehouseId: id, quantity: { gt: 0 } },
      _sum: { quantity: true },
    });
    if ((stock._sum.quantity ?? 0) > 0) {
      throw new BadRequestException('Warehouse still has stock — transfer out before deleting');
    }
    await this.prisma.warehouse.update({ where: { id }, data: { isActive: false } });
    return { id, deactivated: true };
  }

  async getStock(tenantId: string, warehouseId: string, search?: string) {
    await this.getOne(tenantId, warehouseId);
    const rows = await this.prisma.inventory.findMany({
      where: {
        tenantId,
        warehouseId,
        ...(search
          ? {
              variant: {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { sku: { contains: search, mode: 'insensitive' } },
                  { product: { name: { contains: search, mode: 'insensitive' } } },
                ],
              },
            }
          : {}),
      },
      include: {
        variant: { include: { product: { select: { name: true } } } },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { quantity: 'asc' },
      take: 500,
    });

    return rows.map((r) => ({
      ...r,
      availableQty: Math.max(0, r.quantity - r.reservedQty),
      value: r.quantity * (r.avgCost || 0),
    }));
  }

  async getDashboard(tenantId: string, branchId?: string) {
    await this.bootstrapDefaults(tenantId, branchId);

    const warehouses = await this.prisma.warehouse.findMany({
      where: { tenantId, isActive: true, ...(branchId ? { branchId } : {}) },
      include: { branch: { select: { id: true, name: true, code: true } } },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });

    const inventory = await this.prisma.inventory.findMany({
      where: {
        tenantId,
        warehouseId: { in: warehouses.map((w) => w.id) },
      },
      select: {
        warehouseId: true,
        quantity: true,
        reservedQty: true,
        avgCost: true,
        reorderPoint: true,
      },
    });

    const byWh = new Map<string, typeof inventory>();
    for (const row of inventory) {
      if (!row.warehouseId) continue;
      const list = byWh.get(row.warehouseId) ?? [];
      list.push(row);
      byWh.set(row.warehouseId, list);
    }

    const warehouseCards = warehouses.map((w) => {
      const rows = byWh.get(w.id) ?? [];
      const summary = summarizeWarehouseStock(
        rows.map((r) => ({
          warehouseId: w.id,
          quantity: r.quantity,
          reservedQty: r.reservedQty,
          avgCost: r.avgCost,
          reorderPoint: r.reorderPoint,
        })),
      );
      return {
        ...w,
        summary,
      };
    });

    const openTransfers = await this.prisma.stockTransfer.count({
      where: {
        tenantId,
        status: { in: ['PENDING', 'IN_TRANSIT'] },
        OR: [
          { fromWarehouseId: { in: warehouses.map((w) => w.id) } },
          { toWarehouseId: { in: warehouses.map((w) => w.id) } },
          ...(branchId
            ? [{ fromBranchId: branchId }, { toBranchId: branchId }]
            : []),
        ],
      },
    });

    const totals = summarizeWarehouseStock(
      inventory
        .filter((r) => r.warehouseId)
        .map((r) => ({
          warehouseId: r.warehouseId!,
          quantity: r.quantity,
          reservedQty: r.reservedQty,
          avgCost: r.avgCost,
          reorderPoint: r.reorderPoint,
        })),
    );

    return {
      totals: {
        warehouses: warehouses.length,
        ...totals,
        openTransfers,
      },
      warehouses: warehouseCards,
    };
  }

  async createTransfer(tenantId: string, userId: string, dto: CreateWarehouseTransferDto, userRoles: string[] = []) {
    if (dto.fromWarehouseId === dto.toWarehouseId) {
      throw new BadRequestException('Cannot transfer to the same warehouse');
    }
    const [from, to] = await Promise.all([
      this.prisma.warehouse.findFirst({ where: { id: dto.fromWarehouseId, tenantId, isActive: true } }),
      this.prisma.warehouse.findFirst({ where: { id: dto.toWarehouseId, tenantId, isActive: true } }),
    ]);
    if (!from) throw new NotFoundException('Source warehouse not found');
    if (!to) throw new NotFoundException('Destination warehouse not found');

    const transferDto: CreateTransferDto = {
      fromBranchId: from.branchId,
      toBranchId: to.branchId,
      fromWarehouseId: from.id,
      toWarehouseId: to.id,
      notes: dto.notes,
      items: dto.items,
    };

    return this.inventory.createTransfer(tenantId, from.branchId, userId, transferDto, userRoles);
  }

  async listTransfers(tenantId: string, warehouseId?: string, branchId?: string) {
    const where = warehouseId
      ? {
          tenantId,
          OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }],
        }
      : branchId
        ? {
            tenantId,
            OR: [{ fromBranchId: branchId }, { toBranchId: branchId }],
          }
        : { tenantId };

    const transfers = await this.prisma.stockTransfer.findMany({
      where,
      include: {
        items: { include: { variant: { include: { product: true } } } },
        fromBranch: { select: { id: true, name: true, code: true } },
        fromWarehouse: { select: { id: true, name: true, code: true } },
        toWarehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return this.inventory.enrichTransfers(transfers);
  }
}

@ApiTags('Warehouses')
@ApiBearerAuth('access-token')
@Controller({ path: 'warehouses', version: '1' })
export class WarehouseController {
  constructor(private readonly warehouses: WarehouseService) {}

  @Get('dashboard')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Warehouse dashboard KPIs' })
  dashboard(@CurrentUser() user: IAuthUser, @Query('branchId') branchId?: string) {
    return this.warehouses.getDashboard(user.tenantId, branchId || user.branchId || undefined);
  }

  @Get()
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List warehouses (multi-warehouse)' })
  list(@CurrentUser() user: IAuthUser, @Query('branchId') branchId?: string) {
    return this.warehouses.list(user.tenantId, branchId || user.branchId || undefined);
  }

  @Post()
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'Create warehouse' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateWarehouseDto) {
    return this.warehouses.create(user.tenantId, dto);
  }

  @Get('transfers')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List warehouse transfers' })
  listTransfers(
    @CurrentUser() user: IAuthUser,
    @Query('warehouseId') warehouseId?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.warehouses.listTransfers(
      user.tenantId,
      warehouseId,
      branchId || user.branchId || undefined,
    );
  }

  @Post('transfers')
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'Create warehouse-to-warehouse transfer' })
  createTransfer(@CurrentUser() user: IAuthUser, @Body() dto: CreateWarehouseTransferDto) {
    return this.warehouses.createTransfer(user.tenantId, user.id, dto, user.roles);
  }

  @Get(':id/stock')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Warehouse stock levels' })
  stock(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('search') search?: string,
  ) {
    return this.warehouses.getStock(user.tenantId, id, search);
  }

  @Get(':id')
  @RequirePermissions('inventory:read')
  getOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.warehouses.getOne(user.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('inventory:update')
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehouses.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('inventory:update')
  async remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    await this.warehouses.remove(user.tenantId, id);
  }
}

@Module({
  imports: [InventoryModule],
  controllers: [WarehouseController],
  providers: [WarehouseService],
  exports: [WarehouseService],
})
export class WarehouseModule {}
