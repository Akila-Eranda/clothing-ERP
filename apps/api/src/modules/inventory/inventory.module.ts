import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, IsEnum, IsInt, Min, IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { StockMovementType, TransferStatus, InventoryReservationStatus, StockCountStatus } from '@prisma/client';
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
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
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

    const variantIds = data.map((row) => row.variantId);
    const batchMap = new Map<string, { batchNumber: string | null; expiryDate: Date | null }>();
    if (variantIds.length) {
      const logs = await this.prisma.inventoryLog.findMany({
        where: {
          tenantId,
          variantId: { in: variantIds },
          OR: [{ batchNumber: { not: null } }, { expiryDate: { not: null } }],
        },
        orderBy: { createdAt: 'desc' },
        select: { variantId: true, batchNumber: true, expiryDate: true },
      });
      for (const log of logs) {
        if (!batchMap.has(log.variantId)) {
          batchMap.set(log.variantId, { batchNumber: log.batchNumber, expiryDate: log.expiryDate });
        }
      }
    }

    const enriched = data.map((row) => {
      const meta = batchMap.get(row.variantId);
      return {
        ...row,
        latestBatch: meta?.batchNumber ?? null,
        latestExpiry: meta?.expiryDate ?? null,
      };
    });

    return paginate(enriched, total, query.page ?? 1, query.limit ?? 20);
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
    const currentReserved = inventory?.reservedQty ?? 0;
    const currentDamaged = inventory?.damagedQty ?? 0;
    const currentReturned = inventory?.returnedQty ?? 0;
    const deductionTypes: StockMovementType[] = [StockMovementType.SALE, StockMovementType.TRANSFER_OUT, StockMovementType.DAMAGE];
    const delta = deductionTypes.includes(dto.movementType) ? -dto.quantity : dto.quantity;
    let newQty = dto.movementType === StockMovementType.ADJUSTMENT
      ? dto.quantity
      : currentQty + delta;
    let newDamaged = currentDamaged;
    let newReturned = currentReturned;

    if (dto.movementType === StockMovementType.DAMAGE) {
      newDamaged = currentDamaged + dto.quantity;
      newQty = Math.max(0, currentQty - dto.quantity);
    }
    if (dto.movementType === StockMovementType.RETURN) {
      newReturned = currentReturned + dto.quantity;
      newQty = currentQty + dto.quantity;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = inventory
        ? await tx.inventory.update({
            where: { id: inventory.id },
            data: {
              quantity: Math.max(0, newQty),
              damagedQty: newDamaged,
              returnedQty: newReturned,
            },
          })
        : await tx.inventory.create({
            data: {
              tenantId,
              branchId: effectiveBranch,
              variantId: dto.variantId,
              quantity: Math.max(0, dto.quantity),
              returnedQty: dto.movementType === StockMovementType.RETURN ? dto.quantity : 0,
            },
          });

      await tx.inventoryLog.create({
        data: {
          tenantId,
          branchId: effectiveBranch,
          variantId: dto.variantId,
          movementType: dto.movementType,
          quantityChange: Math.max(0, newQty) - currentQty,
          quantityBefore: currentQty,
          quantityAfter: Math.max(0, newQty),
          reservedBefore: currentReserved,
          reservedAfter: currentReserved,
          damagedBefore: currentDamaged,
          damagedAfter: newDamaged,
          notes: dto.notes,
          referenceId: dto.referenceId,
          referenceType: dto.referenceType,
          batchNumber: dto.batchNumber,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
          performedBy: userId,
          correlationId: dto.referenceId ?? undefined,
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

  async reserveStock(
    tenantId: string,
    branchId: string,
    variantId: string,
    quantity: number,
    sourceType: string,
    sourceId: string,
    userId?: string,
  ) {
    if (quantity <= 0) return;
    const effectiveBranch = branchId || await this.prisma.branch.findFirst({ where: { tenantId }, select: { id: true } }).then(b => b?.id ?? '');
    const inventory = await this.prisma.inventory.findFirst({
      where: { tenantId, branchId: effectiveBranch, variantId },
    });
    const onHand = inventory?.quantity ?? 0;
    const reserved = inventory?.reservedQty ?? 0;
    const available = onHand - reserved;
    if (available < quantity) {
      throw new BadRequestException(`Insufficient available stock (${available} available, ${quantity} requested)`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = inventory
        ? await tx.inventory.update({
            where: { id: inventory.id },
            data: { reservedQty: { increment: quantity } },
          })
        : await tx.inventory.create({
            data: { tenantId, branchId: effectiveBranch, variantId, quantity: 0, reservedQty: quantity },
          });

      await tx.inventoryReservation.create({
        data: {
          tenantId,
          branchId: effectiveBranch,
          variantId,
          quantity,
          sourceType,
          sourceId,
          createdBy: userId,
        },
      });

      await tx.inventoryLog.create({
        data: {
          tenantId,
          branchId: effectiveBranch,
          variantId,
          movementType: StockMovementType.ADJUSTMENT,
          quantityChange: 0,
          quantityBefore: onHand,
          quantityAfter: onHand,
          reservedBefore: reserved,
          reservedAfter: reserved + quantity,
          damagedBefore: inventory?.damagedQty ?? 0,
          damagedAfter: inventory?.damagedQty ?? 0,
          referenceType: sourceType,
          referenceId: sourceId,
          notes: `Reserved ${quantity} units`,
          performedBy: userId,
        },
      });

      return updated;
    });
  }

  async releaseReservations(tenantId: string, sourceType: string, sourceId: string, consume = false) {
    const reservations = await this.prisma.inventoryReservation.findMany({
      where: { tenantId, sourceType, sourceId, status: InventoryReservationStatus.ACTIVE },
    });
    if (!reservations.length) return { released: 0 };

    await this.prisma.$transaction(async (tx) => {
      for (const r of reservations) {
        const inv = await tx.inventory.findFirst({
          where: { tenantId, branchId: r.branchId, variantId: r.variantId },
        });
        if (inv) {
          await tx.inventory.update({
            where: { id: inv.id },
            data: { reservedQty: { decrement: Math.min(r.quantity, inv.reservedQty) } },
          });
        }
        await tx.inventoryReservation.update({
          where: { id: r.id },
          data: {
            status: consume ? InventoryReservationStatus.CONSUMED : InventoryReservationStatus.RELEASED,
            releasedAt: new Date(),
          },
        });
      }
    });
    return { released: reservations.length };
  }

  async getLedgerSummary(tenantId: string, branchId: string) {
    const rows = await this.prisma.inventory.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      include: { variant: { include: { product: true } } },
    });
    const totals = rows.reduce(
      (acc, r) => {
        acc.onHand += r.quantity;
        acc.reserved += r.reservedQty;
        acc.damaged += r.damagedQty;
        acc.returned += r.returnedQty;
        acc.available += Math.max(0, r.quantity - r.reservedQty);
        acc.value += r.quantity * (r.avgCost || r.variant.costPrice || 0);
        return acc;
      },
      { onHand: 0, reserved: 0, available: 0, damaged: 0, returned: 0, value: 0, skuCount: rows.length },
    );
    return totals;
  }

  async getAbcAnalysis(tenantId: string, branchId: string) {
    const items = await this.prisma.inventory.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      include: { variant: { include: { product: true, saleItems: { take: 100, orderBy: { createdAt: 'desc' } } } } },
    });
    const scored = items.map((item) => {
      const revenue = item.variant.saleItems.reduce((s, si) => s + si.total, 0);
      const qty = item.quantity;
      return {
        variantId: item.variantId,
        sku: item.variant.sku,
        name: `${item.variant.product.name} — ${item.variant.name}`,
        quantity: qty,
        revenue,
        value: qty * (item.avgCost || item.variant.costPrice || 0),
      };
    }).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = scored.reduce((s, i) => s + i.revenue, 0) || 1;
    let cumulative = 0;
    return scored.map((item) => {
      cumulative += item.revenue;
      const pct = (cumulative / totalRevenue) * 100;
      const grade = pct <= 80 ? 'A' : pct <= 95 ? 'B' : 'C';
      return { ...item, cumulativePct: Math.round(pct * 10) / 10, grade };
    });
  }

  async getDeadStock(tenantId: string, branchId: string, days = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const items = await this.prisma.inventory.findMany({
      where: { tenantId, ...(branchId && { branchId }), quantity: { gt: 0 } },
      include: {
        variant: {
          include: {
            product: true,
            saleItems: { where: { createdAt: { gte: cutoff } }, take: 1 },
          },
        },
      },
    });
    return items
      .filter((i) => i.variant.saleItems.length === 0)
      .map((i) => ({
        variantId: i.variantId,
        sku: i.variant.sku,
        name: `${i.variant.product.name} — ${i.variant.name}`,
        quantity: i.quantity,
        value: i.quantity * (i.avgCost || i.variant.costPrice || 0),
        daysIdle: days,
      }))
      .sort((a, b) => b.value - a.value);
  }

  async getStockAging(tenantId: string, branchId: string) {
    const logs = await this.prisma.inventoryLog.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
        movementType: { in: [StockMovementType.PURCHASE, StockMovementType.OPENING_STOCK] },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: { variant: { include: { product: true } } },
    });
    const now = Date.now();
    const buckets = { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
    const details: { name: string; sku: string; ageDays: number; qty: number }[] = [];

    for (const log of logs) {
      const ageDays = Math.floor((now - log.createdAt.getTime()) / 86400000);
      const qty = log.quantityAfter;
      if (ageDays <= 30) buckets['0-30'] += qty;
      else if (ageDays <= 60) buckets['31-60'] += qty;
      else if (ageDays <= 90) buckets['61-90'] += qty;
      else buckets['90+'] += qty;
      details.push({
        name: `${log.variant.product.name} — ${log.variant.name}`,
        sku: log.variant.sku,
        ageDays,
        qty,
      });
    }
    return { buckets, details: details.slice(0, 50) };
  }

  async getReservations(tenantId: string, branchId: string) {
    return this.prisma.inventoryReservation.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
        status: InventoryReservationStatus.ACTIVE,
      },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createStockCountSession(tenantId: string, branchId: string, userId: string, notes?: string) {
    const stock = await this.prisma.inventory.findMany({
      where: { tenantId, branchId },
      select: { variantId: true, quantity: true },
    });
    return this.prisma.stockCountSession.create({
      data: {
        tenantId,
        branchId,
        countedBy: userId,
        notes,
        status: StockCountStatus.IN_PROGRESS,
        lines: {
          create: stock.map((s) => ({
            variantId: s.variantId,
            systemQty: s.quantity,
            countedQty: s.quantity,
            variance: 0,
          })),
        },
      },
      include: { lines: { include: { variant: { include: { product: true } } } } },
    });
  }

  async getStockCountSessions(tenantId: string, branchId: string) {
    return this.prisma.stockCountSession.findMany({
      where: { tenantId, branchId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  private async resolveBranchId(tenantId: string, branchId: string) {
    if (branchId) return branchId;
    const branch = await this.prisma.branch.findFirst({ where: { tenantId }, select: { id: true } });
    return branch?.id ?? '';
  }

  private async enrichTransfers<T extends { toBranchId: string }>(transfers: T[]) {
    const toBranchIds = [...new Set(transfers.map((t) => t.toBranchId))];
    const toBranches = toBranchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: toBranchIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const toMap = new Map(toBranches.map((b) => [b.id, b]));
    return transfers.map((t) => ({ ...t, toBranch: toMap.get(t.toBranchId) ?? null }));
  }

  async createTransfer(tenantId: string, fromBranchId: string, userId: string, dto: CreateTransferDto) {
    if (!dto.items?.length) throw new BadRequestException('At least one item is required');

    const effectiveFrom = await this.resolveBranchId(tenantId, fromBranchId);
    if (!effectiveFrom) throw new BadRequestException('Source branch is required');
    if (dto.toBranchId === effectiveFrom) throw new BadRequestException('Cannot transfer to the same branch');

    const toBranch = await this.prisma.branch.findFirst({ where: { id: dto.toBranchId, tenantId } });
    if (!toBranch) throw new NotFoundException('Destination branch not found');

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        tenantId,
        fromBranchId: effectiveFrom,
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
      include: {
        items: { include: { variant: { include: { product: true } } } },
        fromBranch: { select: { id: true, name: true, code: true } },
      },
    });

    const [enriched] = await this.enrichTransfers([transfer]);
    return enriched;
  }

  async getTransfers(tenantId: string, branchId: string) {
    const where = branchId
      ? { tenantId, OR: [{ fromBranchId: branchId }, { toBranchId: branchId }] }
      : { tenantId };

    const transfers = await this.prisma.stockTransfer.findMany({
      where,
      include: {
        items: { include: { variant: { include: { product: true } } } },
        fromBranch: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return this.enrichTransfers(transfers);
  }

  async updateTransferStatus(id: string, status: TransferStatus, userId: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: { include: { variant: true } } },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    if (status === TransferStatus.CANCELLED) {
      if (transfer.status !== TransferStatus.PENDING) {
        throw new BadRequestException('Only pending transfers can be cancelled');
      }
      return this.prisma.stockTransfer.update({
        where: { id },
        data: { status },
        include: {
          items: { include: { variant: { include: { product: true } } } },
          fromBranch: { select: { id: true, name: true, code: true } },
        },
      }).then(async (updated) => {
        const [enriched] = await this.enrichTransfers([updated]);
        return enriched;
      });
    }

    if (status === TransferStatus.IN_TRANSIT) {
      if (transfer.status !== TransferStatus.PENDING) {
        throw new BadRequestException('Only pending transfers can be dispatched');
      }

      for (const item of transfer.items) {
        const inv = await this.prisma.inventory.findFirst({
          where: { tenantId: transfer.tenantId, branchId: transfer.fromBranchId, variantId: item.variantId },
        });
        const available = (inv?.quantity ?? 0) - (inv?.reservedQty ?? 0);
        if (available < item.requestedQty) {
          const label = item.variant.sku || item.variant.name;
          throw new BadRequestException(`Insufficient stock for ${label}: ${available} available, ${item.requestedQty} requested`);
        }
      }

      for (const item of transfer.items) {
        await this.adjustStock(transfer.tenantId, transfer.fromBranchId, userId, {
          variantId: item.variantId,
          quantity: item.requestedQty,
          movementType: StockMovementType.TRANSFER_OUT,
          referenceId: transfer.id,
          referenceType: 'StockTransfer',
          notes: `Transfer dispatched to branch ${transfer.toBranchId}`,
        });
        await this.prisma.stockTransferItem.update({
          where: { id: item.id },
          data: { sentQty: item.requestedQty },
        });
      }

      const updated = await this.prisma.stockTransfer.update({
        where: { id },
        data: { status, dispatchedAt: new Date() },
        include: {
          items: { include: { variant: { include: { product: true } } } },
          fromBranch: { select: { id: true, name: true, code: true } },
        },
      });
      const [enriched] = await this.enrichTransfers([updated]);
      return enriched;
    }

    if (status === TransferStatus.RECEIVED) {
      if (transfer.status !== TransferStatus.IN_TRANSIT) {
        throw new BadRequestException('Only in-transit transfers can be received');
      }

      for (const item of transfer.items) {
        const qty = item.sentQty || item.requestedQty;
        await this.adjustStock(transfer.tenantId, transfer.toBranchId, userId, {
          variantId: item.variantId,
          quantity: qty,
          movementType: StockMovementType.TRANSFER_IN,
          referenceId: transfer.id,
          referenceType: 'StockTransfer',
          notes: `Transfer received from branch ${transfer.fromBranchId}`,
        });
        await this.prisma.stockTransferItem.update({
          where: { id: item.id },
          data: { receivedQty: qty },
        });
      }

      const updated = await this.prisma.stockTransfer.update({
        where: { id },
        data: { status, receivedAt: new Date(), approvedBy: userId },
        include: {
          items: { include: { variant: { include: { product: true } } } },
          fromBranch: { select: { id: true, name: true, code: true } },
        },
      });
      const [enriched] = await this.enrichTransfers([updated]);
      return enriched;
    }

    throw new BadRequestException('Invalid status transition');
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
  @ApiOperation({ summary: 'Get inventory movement logs (ledger)' })
  getLogs(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { variantId?: string }) {
    return this.inventoryService.getInventoryLogs(user.tenantId, user.branchId ?? '', query.variantId, query);
  }

  @Get('ledger/summary')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Inventory ledger summary — on-hand, reserved, available, damaged' })
  ledgerSummary(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getLedgerSummary(user.tenantId, user.branchId ?? '');
  }

  @Get('analytics/abc')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'ABC inventory analysis' })
  abcAnalysis(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getAbcAnalysis(user.tenantId, user.branchId ?? '');
  }

  @Get('analytics/dead-stock')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Dead stock analysis' })
  deadStock(@CurrentUser() user: IAuthUser, @Query('days') days?: string) {
    return this.inventoryService.getDeadStock(user.tenantId, user.branchId ?? '', days ? parseInt(days, 10) : 90);
  }

  @Get('analytics/aging')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Stock aging analysis' })
  stockAging(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getStockAging(user.tenantId, user.branchId ?? '');
  }

  @Get('reservations')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Active stock reservations' })
  reservations(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getReservations(user.tenantId, user.branchId ?? '');
  }

  @Post('cycle-count')
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'Start cycle count session' })
  startCycleCount(@CurrentUser() user: IAuthUser, @Body('notes') notes?: string) {
    return this.inventoryService.createStockCountSession(user.tenantId, user.branchId ?? '', user.id, notes);
  }

  @Get('cycle-count')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List cycle count sessions' })
  listCycleCounts(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getStockCountSessions(user.tenantId, user.branchId ?? '');
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
