import { Module, forwardRef, Inject } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, IsEnum, IsInt, Min, IsArray, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma, StockMovementType, TransferStatus, InventoryReservationStatus, StockCountStatus, WorkflowStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { WorkflowService, WorkflowModule } from '@/modules/workflow/workflow.module';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { randomUUID } from 'crypto';
import {
  addToLot,
  applyOutboundLots,
  availableQtyOnLots,
  classifyExpiry,
  daysUntilExpiry,
  filterSellableLots,
  isInboundMovement,
  isLotExpired,
  isOutboundMovement,
  normalizeBlockExpired,
  normalizeLotStrategy,
  planLotAllocation,
  reconcileLotTotals,
  releaseLotReservations,
  reserveLots,
  startOfLocalDay,
  type LotAllocationStrategy,
} from './inventory-lots.helper';

export class AdjustStockDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() quantity: number;
  @ApiProperty({ enum: StockMovementType }) @IsEnum(StockMovementType) movementType: StockMovementType;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() batchNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() manufactureDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lotId?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() unitCost?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() warehouseId?: string;
}

export class TransferItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) requestedQty: number;
  @ApiPropertyOptional() @IsOptional() @IsString() lotId?: string;
}

export class LotAdjustDto {
  @ApiProperty() @IsString() lotId: string;
  @ApiProperty() @IsInt() quantity: number;
  @ApiProperty({ enum: StockMovementType }) @IsEnum(StockMovementType) movementType: StockMovementType;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateTransferDto {
  @ApiPropertyOptional() @IsOptional() @IsString() fromBranchId?: string;
  @ApiProperty() @IsString() toBranchId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() fromWarehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() toWarehouseId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [TransferItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TransferItemDto)
  items: TransferItemDto[];
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => WorkflowService))
    private readonly workflowService: WorkflowService,
  ) {}

  /** Resolve FEFO vs FIFO from tenant.settings.lotAllocation (default FEFO). */
  private async resolveLotStrategy(tenantId: string): Promise<LotAllocationStrategy> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    return normalizeLotStrategy(settings.lotAllocation ?? settings.inventoryLotStrategy);
  }

  /** POS Block Expired — default ON; tenant.settings.posBlockExpired / blockExpiredLots can disable. */
  private async resolveBlockExpired(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    return normalizeBlockExpired(settings.posBlockExpired ?? settings.blockExpiredLots);
  }

  /** Allow selling below zero stock — tenant.settings.pos.allowNegativeStock (default OFF). */
  private async resolveAllowNegativeStock(tenantId: string): Promise<boolean> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const pos = (settings.pos as Record<string, unknown>) ?? {};
    const v = pos.allowNegativeStock ?? settings.allowNegativeStock ?? settings.negativeStock;
    return v === true;
  }

  private async resolveTenantLotSettings(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const pos = (settings.pos as Record<string, unknown>) ?? {};
    return {
      strategy: normalizeLotStrategy(settings.lotAllocation ?? settings.inventoryLotStrategy),
      blockExpired: normalizeBlockExpired(settings.posBlockExpired ?? settings.blockExpiredLots),
      allowNegativeStock: (pos.allowNegativeStock ?? settings.allowNegativeStock ?? settings.negativeStock) === true,
    };
  }

  /** Default warehouse for a branch (creates MAIN if missing). POS uses this location. */
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
        where: { id: warehouseId, tenantId, branchId, isActive: true },
      });
      if (!wh) {
        // Allow cross-check by id alone when branch already validated via transfer
        const any = await this.prisma.warehouse.findFirst({
          where: { id: warehouseId, tenantId, isActive: true },
        });
        if (!any) throw new NotFoundException('Warehouse not found');
        return any.id;
      }
      return wh.id;
    }
    const def = await this.ensureDefaultWarehouse(tenantId, branchId);
    return def.id;
  }

  async getStock(tenantId: string, branchId: string, query: PaginationDto & { lowStock?: boolean }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(branchId && { branchId }),
      ...(query.search && {
        variant: {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' as const } },
            { sku: { contains: query.search, mode: 'insensitive' as const } },
          ],
        },
      }),
    };

    // Low stock: quantity <= reorderPoint (fallback threshold 5 when reorderPoint unset)
    if (query.lowStock === true) {
      const all = await this.prisma.inventory.findMany({
        where,
        include: {
          variant: { include: { product: { include: { category: true } } } },
        },
        orderBy: { quantity: 'asc' },
      });
      const low = all.filter((r) => {
        const threshold = r.reorderPoint > 0 ? r.reorderPoint : 5;
        return r.quantity <= threshold;
      });
      const page = low.slice(skip, skip + take);
      const enriched = await this.enrichStockLotMeta(tenantId, branchId, page);
      return paginate(enriched, low.length, query.page ?? 1, query.limit ?? 20);
    }

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

    const enriched = await this.enrichStockLotMeta(tenantId, branchId, data);
    return paginate(enriched, total, query.page ?? 1, query.limit ?? 20);
  }

  private async enrichStockLotMeta<
    T extends { variantId: string },
  >(tenantId: string, branchId: string, data: T[]) {
    const variantIds = data.map((row) => row.variantId);
    const lotMeta = new Map<string, { batchNumber: string | null; expiryDate: Date | null; lotCount: number }>();
    if (variantIds.length) {
      const lots = await this.prisma.inventoryLot.findMany({
        where: {
          tenantId,
          ...(branchId && { branchId }),
          variantId: { in: variantIds },
          isActive: true,
          quantity: { gt: 0 },
        },
        orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
        select: { variantId: true, batchNumber: true, expiryDate: true },
      });
      for (const lot of lots) {
        const existing = lotMeta.get(lot.variantId);
        if (!existing) {
          lotMeta.set(lot.variantId, {
            batchNumber: lot.batchNumber,
            expiryDate: lot.expiryDate,
            lotCount: 1,
          });
        } else {
          existing.lotCount += 1;
        }
      }
    }

    return data.map((row) => {
      const meta = lotMeta.get(row.variantId);
      return {
        ...row,
        latestBatch: meta?.batchNumber ?? null,
        latestExpiry: meta?.expiryDate ?? null,
        activeLotCount: meta?.lotCount ?? 0,
      };
    });
  }

  async getLowStock(tenantId: string, branchId: string) {
    const rows = await this.prisma.inventory.findMany({
      where: {
        tenantId,
        ...(branchId && { branchId }),
      },
      include: { variant: { include: { product: true } } },
      orderBy: { quantity: 'asc' },
      take: 500,
    });
    return rows
      .filter((r) => {
        const threshold = r.reorderPoint > 0 ? r.reorderPoint : 5;
        return r.quantity <= threshold;
      })
      .slice(0, 100);
  }

  async requestAdjustmentApproval(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: AdjustStockDto,
    userRoles: string[] = [],
  ) {
    if (bypassesWorkflowApproval(userRoles)) {
      await this.adjustStock(tenantId, branchId, userId, dto);
      return {
        id: randomUUID(),
        status: 'applied',
        message: 'Stock adjusted (admin — no approval required)',
      };
    }

    const effectiveBranch = await this.resolveBranchId(tenantId, branchId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { tenantId } },
      include: { product: { select: { name: true } } },
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    const requestId = randomUUID();
    const reference = `ADJ-${requestId.slice(0, 8).toUpperCase()}`;

    await this.workflowService.start(tenantId, userId, {
      key: 'stock_adjustment',
      entityType: 'StockAdjustment',
      entityId: requestId,
      metadata: {
        ...dto,
        branchId: effectiveBranch,
        reference,
        productName: variant.product.name,
        variantName: variant.name,
        sku: variant.sku,
      },
    });

    return {
      id: requestId,
      reference,
      status: 'pending_approval',
      message: 'Stock adjustment submitted for manager approval',
    };
  }

  async assertSaleStockAvailable(
    tenantId: string,
    branchId: string,
    items: { variantId: string; quantity: number }[],
    heldBillId?: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const allowNegative = await this.resolveAllowNegativeStock(tenantId);
    if (allowNegative) return;

    const blockExpired = await this.resolveBlockExpired(tenantId);
    const warehouseId = await this.resolveWarehouseId(tenantId, branchId);
    const heldByVariant = new Map<string, number>();
    if (heldBillId) {
      const reservations = await client.inventoryReservation.findMany({
        where: {
          tenantId,
          sourceType: 'HELD_BILL',
          sourceId: heldBillId,
          status: InventoryReservationStatus.ACTIVE,
        },
      });
      for (const r of reservations) {
        heldByVariant.set(r.variantId, (heldByVariant.get(r.variantId) ?? 0) + r.quantity);
      }
    }

    for (const item of items) {
      const inv = await client.inventory.findFirst({
        where: { tenantId, warehouseId, variantId: item.variantId },
      });
      const onHand = inv?.quantity ?? 0;
      const reserved = inv?.reservedQty ?? 0;
      const heldForBill = heldByVariant.get(item.variantId) ?? 0;
      const available = onHand - reserved + heldForBill;
      if (available < item.quantity) {
        const variant = await client.productVariant.findFirst({
          where: { id: item.variantId, product: { tenantId } },
          select: { sku: true, name: true, product: { select: { name: true } } },
        });
        const label = variant ? `${variant.product.name} — ${variant.name}` : item.variantId;
        throw new BadRequestException(
          `Insufficient stock for ${label}: ${Math.max(0, available)} available, ${item.quantity} requested`,
        );
      }

      if (!blockExpired) continue;

      const lots = await client.inventoryLot.findMany({
        where: {
          tenantId,
          branchId,
          variantId: item.variantId,
          isActive: true,
          quantity: { gt: 0 },
          OR: [{ warehouseId }, { warehouseId: null }],
        },
      });
      if (!lots.length) continue;

      const sellable = filterSellableLots(lots, true);
      const sellableQty = availableQtyOnLots(sellable);
      const lotQty = lots.reduce((s, l) => s + l.quantity, 0);
      const unlotted = Math.max(0, onHand - lotQty);
      const sellableAvailable = sellableQty + unlotted + heldForBill;
      if (sellableAvailable < item.quantity) {
        const variant = await client.productVariant.findFirst({
          where: { id: item.variantId, product: { tenantId } },
          select: { sku: true, name: true, product: { select: { name: true } } },
        });
        const label = variant ? `${variant.product.name} — ${variant.name}` : item.variantId;
        throw new BadRequestException(
          `Insufficient non-expired stock for ${label}: ${Math.max(0, sellableAvailable)} sellable, ${item.quantity} requested (POS Block Expired)`,
        );
      }
    }
  }

  async adjustStock(
    tenantId: string,
    branchId: string,
    userId: string,
    dto: AdjustStockDto,
    tx?: Prisma.TransactionClient,
  ) {
    const effectiveBranch = branchId || await this.resolveBranchId(tenantId, branchId);
    const { strategy, blockExpired: tenantBlockExpired, allowNegativeStock } = await this.resolveTenantLotSettings(tenantId);
    const warehouseId = await this.resolveWarehouseId(tenantId, effectiveBranch, dto.warehouseId);

    const execute = async (client: Prisma.TransactionClient) => {
      // Row lock to reduce concurrent oversell under multi-cashier load
      const locked = await client.$queryRaw<{ id: string }[]>`
        SELECT id FROM inventory
        WHERE "tenantId" = ${tenantId}
          AND "warehouseId" = ${warehouseId}
          AND "variantId" = ${dto.variantId}
        FOR UPDATE
      `;
      const inventory = locked[0]
        ? await client.inventory.findUnique({ where: { id: locked[0].id } })
        : await client.inventory.findFirst({
            where: { tenantId, warehouseId, variantId: dto.variantId },
          });

      const currentQty = inventory?.quantity ?? 0;
      const currentReserved = inventory?.reservedQty ?? 0;
      const currentDamaged = inventory?.damagedQty ?? 0;
      const currentReturned = inventory?.returnedQty ?? 0;
      const deductionTypes: StockMovementType[] = [
        StockMovementType.SALE,
        StockMovementType.TRANSFER_OUT,
        StockMovementType.DAMAGE,
      ];
      const qty = Math.abs(dto.quantity);
      const delta = deductionTypes.includes(dto.movementType) ? -qty : qty;
      let newQty = dto.movementType === StockMovementType.ADJUSTMENT
        ? dto.quantity
        : currentQty + delta;
      let newDamaged = currentDamaged;
      let newReturned = currentReturned;

      if (dto.movementType === StockMovementType.DAMAGE) {
        newDamaged = currentDamaged + qty;
        newQty = currentQty - qty;
      }
      if (dto.movementType === StockMovementType.RETURN) {
        newReturned = currentReturned + qty;
        newQty = currentQty + qty;
      }

      const allowNegSale =
        allowNegativeStock && dto.movementType === StockMovementType.SALE;

      if (
        deductionTypes.includes(dto.movementType)
        && dto.movementType !== StockMovementType.ADJUSTMENT
        && newQty < 0
        && !allowNegSale
      ) {
        throw new BadRequestException(
          `Insufficient stock: ${currentQty} on hand, ${qty} requested for ${dto.movementType}`,
        );
      }

      const finalQty = allowNegSale ? newQty : Math.max(0, newQty);
      const expiry = dto.expiryDate ? new Date(dto.expiryDate) : null;
      const manufacture = dto.manufactureDate ? new Date(dto.manufactureDate) : null;

      // --- Lot layer (additive; legacy stock without lots still works) ---
      let primaryLotId: string | undefined = dto.lotId;
      let primaryBatch = dto.batchNumber ?? null;
      let primaryExpiry = expiry;
      let outboundAllocations: { lotId: string; quantity: number; batchNumber: string | null; expiryDate: Date | null; manufactureDate?: Date | null }[] = [];

      if (dto.movementType === StockMovementType.ADJUSTMENT) {
        const adjDelta = finalQty - currentQty;
        if (adjDelta > 0) {
          const lot = await addToLot(client, {
            tenantId,
            branchId: effectiveBranch,
            variantId: dto.variantId,
            quantity: adjDelta,
            batchNumber: dto.batchNumber,
            expiryDate: expiry,
            manufactureDate: manufacture,
            unitCost: dto.unitCost,
            referenceType: dto.referenceType,
            referenceId: dto.referenceId,
            notes: dto.notes,
            lotId: dto.lotId,
            warehouseId,
          });
          primaryLotId = lot?.id;
          primaryBatch = lot?.batchNumber ?? primaryBatch;
          primaryExpiry = lot?.expiryDate ?? primaryExpiry;
        } else if (adjDelta < 0) {
          outboundAllocations = await planLotAllocation(
            client, tenantId, effectiveBranch, dto.variantId, Math.abs(adjDelta), dto.lotId, strategy,
            { blockExpired: false, warehouseId },
          );
          await applyOutboundLots(client, outboundAllocations);
          if (outboundAllocations[0]) {
            primaryLotId = outboundAllocations[0].lotId;
            primaryBatch = outboundAllocations[0].batchNumber;
            primaryExpiry = outboundAllocations[0].expiryDate;
          }
        }
      } else if (isInboundMovement(dto.movementType)) {
        const lot = await addToLot(client, {
          tenantId,
          branchId: effectiveBranch,
          variantId: dto.variantId,
          quantity: qty,
          batchNumber: dto.batchNumber,
          expiryDate: expiry,
          manufactureDate: manufacture,
          unitCost: dto.unitCost,
          referenceType: dto.referenceType,
          referenceId: dto.referenceId,
          notes: dto.notes,
          lotId: dto.lotId,
          warehouseId,
        });
        primaryLotId = lot?.id;
        primaryBatch = lot?.batchNumber ?? primaryBatch;
        primaryExpiry = lot?.expiryDate ?? primaryExpiry;
      } else if (isOutboundMovement(dto.movementType)) {
        // POS Block Expired applies to SALE only; DAMAGE/TRANSFER may still move expired lots.
        const blockExpired = dto.movementType === StockMovementType.SALE && tenantBlockExpired;
        outboundAllocations = await planLotAllocation(
          client, tenantId, effectiveBranch, dto.variantId, qty, dto.lotId, strategy,
          { blockExpired, warehouseId },
        );
        await applyOutboundLots(client, outboundAllocations);
        if (outboundAllocations[0]) {
          primaryLotId = outboundAllocations[0].lotId;
          primaryBatch = outboundAllocations[0].batchNumber;
          primaryExpiry = outboundAllocations[0].expiryDate;
        }
      }

      const updated = inventory
        ? await client.inventory.update({
            where: { id: inventory.id },
            data: {
              quantity: finalQty,
              damagedQty: newDamaged,
              returnedQty: newReturned,
              ...(dto.unitCost != null && dto.unitCost > 0 && isInboundMovement(dto.movementType)
                ? {
                    lastCost: dto.unitCost,
                    avgCost: inventory.quantity > 0
                      ? ((inventory.avgCost * inventory.quantity) + (dto.unitCost * qty)) / (inventory.quantity + qty)
                      : dto.unitCost,
                  }
                : {}),
            },
          })
        : await client.inventory.create({
            data: {
              tenantId,
              branchId: effectiveBranch,
              warehouseId,
              variantId: dto.variantId,
              quantity: finalQty,
              returnedQty: dto.movementType === StockMovementType.RETURN ? qty : 0,
              ...(dto.unitCost != null ? { lastCost: dto.unitCost, avgCost: dto.unitCost } : {}),
            },
          });

      // Keep variant master cost in sync with latest GRN/PO inward cost.
      if (
        dto.movementType === StockMovementType.PURCHASE
        && dto.unitCost != null
        && dto.unitCost > 0
      ) {
        await client.productVariant.update({
          where: { id: dto.variantId },
          data: { costPrice: dto.unitCost },
        });
      }

      // Aggregate ledger row (branch stock)
      await client.inventoryLog.create({
        data: {
          tenantId,
          branchId: effectiveBranch,
          variantId: dto.variantId,
          movementType: dto.movementType,
          quantityChange: finalQty - currentQty,
          quantityBefore: currentQty,
          quantityAfter: finalQty,
          reservedBefore: currentReserved,
          reservedAfter: currentReserved,
          damagedBefore: currentDamaged,
          damagedAfter: newDamaged,
          notes: dto.notes,
          referenceId: dto.referenceId,
          referenceType: dto.referenceType,
          batchNumber: primaryBatch ?? undefined,
          expiryDate: primaryExpiry ?? undefined,
          // Avoid double-counting: lot splits get their own LOT_ALLOCATION rows
          lotId: outboundAllocations.length ? undefined : primaryLotId,
          unitCost: dto.unitCost,
          performedBy: userId,
          correlationId: dto.referenceId ?? undefined,
        },
      });

      // Per-lot audit rows for FEFO (filter notes=LOT_ALLOCATION in reports if needed)
      for (const a of outboundAllocations) {
        await client.inventoryLog.create({
          data: {
            tenantId,
            branchId: effectiveBranch,
            variantId: dto.variantId,
            movementType: dto.movementType,
            quantityChange: -a.quantity,
            quantityBefore: currentQty,
            quantityAfter: finalQty,
            reservedBefore: currentReserved,
            reservedAfter: currentReserved,
            damagedBefore: currentDamaged,
            damagedAfter: newDamaged,
            notes: 'LOT_ALLOCATION',
            referenceId: dto.referenceId,
            referenceType: dto.referenceType,
            batchNumber: a.batchNumber ?? undefined,
            expiryDate: a.expiryDate ?? undefined,
            lotId: a.lotId,
            performedBy: userId,
            correlationId: dto.referenceId ?? undefined,
          },
        });
      }

      return Object.assign(updated, { _lotAllocations: outboundAllocations });
    };

    const result = tx ? await execute(tx) : await this.prisma.$transaction(execute);

    if (result.quantity <= (result.reorderPoint > 0 ? result.reorderPoint : result.minStockLevel > 0 ? result.minStockLevel : 5)) {
      this.eventEmitter.emit('inventory.low-stock', {
        tenantId,
        branchId: effectiveBranch,
        variantId: dto.variantId,
        quantity: result.quantity,
        reorderPoint: result.reorderPoint,
        minStockLevel: result.minStockLevel,
        reservedQty: result.reservedQty,
      });
    }

    return result;
  }

  async getInventoryLogs(tenantId: string, branchId: string, variantId?: string, query?: PaginationDto) {
    const { skip, take } = getPaginationArgs(query?.page, query?.limit);
    const where = {
      tenantId,
      ...(branchId && { branchId }),
      ...(variantId && { variantId }),
      NOT: { notes: 'LOT_ALLOCATION' },
    };

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
    tx?: Prisma.TransactionClient,
  ) {
    if (quantity <= 0) return;
    const effectiveBranch = branchId || await this.resolveBranchId(tenantId, branchId);
    const { strategy, blockExpired } = await this.resolveTenantLotSettings(tenantId);
    const warehouseId = await this.resolveWarehouseId(tenantId, effectiveBranch);

    const execute = async (client: Prisma.TransactionClient) => {
      const inventory = await client.inventory.findFirst({
        where: { tenantId, warehouseId, variantId },
      });
      const onHand = inventory?.quantity ?? 0;
      const reserved = inventory?.reservedQty ?? 0;
      const available = onHand - reserved;
      if (available < quantity) {
        throw new BadRequestException(`Insufficient available stock (${available} available, ${quantity} requested)`);
      }

      const updated = inventory
        ? await client.inventory.update({
            where: { id: inventory.id },
            data: { reservedQty: { increment: quantity } },
          })
        : await client.inventory.create({
            data: {
              tenantId,
              branchId: effectiveBranch,
              warehouseId,
              variantId,
              quantity: 0,
              reservedQty: quantity,
            },
          });

      await client.inventoryReservation.create({
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

      await reserveLots(
        client, tenantId, effectiveBranch, variantId, quantity, sourceType, sourceId, strategy,
        { blockExpired },
      );

      await client.inventoryLog.create({
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
    };

    return tx ? execute(tx) : this.prisma.$transaction(execute);
  }

  async releaseReservations(
    tenantId: string,
    sourceType: string,
    sourceId: string,
    consume = false,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const reservations = await client.inventoryReservation.findMany({
      where: { tenantId, sourceType, sourceId, status: InventoryReservationStatus.ACTIVE },
    });
    if (!reservations.length) return { released: 0 };

    const execute = async (c: Prisma.TransactionClient) => {
      for (const r of reservations) {
        // Prefer the warehouse that holds this reservation's stock (default branch warehouse)
        const warehouseId = await this.resolveWarehouseId(tenantId, r.branchId);
        const inv = await c.inventory.findFirst({
          where: { tenantId, warehouseId, variantId: r.variantId },
        }) ?? await c.inventory.findFirst({
          where: { tenantId, branchId: r.branchId, variantId: r.variantId },
        });
        if (inv) {
          await c.inventory.update({
            where: { id: inv.id },
            data: { reservedQty: { decrement: Math.min(r.quantity, inv.reservedQty) } },
          });
        }
        await c.inventoryReservation.update({
          where: { id: r.id },
          data: {
            status: consume ? InventoryReservationStatus.CONSUMED : InventoryReservationStatus.RELEASED,
            releasedAt: new Date(),
          },
        });
      }
      await releaseLotReservations(c, tenantId, sourceType, sourceId, consume);
    };

    if (tx) {
      await execute(tx);
    } else {
      await this.prisma.$transaction(execute);
    }
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

  async enrichTransfers<T extends { id: string; toBranchId: string }>(transfers: T[]) {
    const toBranchIds = [...new Set(transfers.map((t) => t.toBranchId))];
    const toBranches = toBranchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: toBranchIds } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const toMap = new Map(toBranches.map((b) => [b.id, b]));

    const transferIds = transfers.map((t) => t.id);
    const workflows = transferIds.length
      ? await this.prisma.workflowInstance.findMany({
          where: { entityType: 'StockTransfer', entityId: { in: transferIds } },
          include: {
            definition: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
            tasks: { orderBy: { stepOrder: 'asc' } },
          },
        })
      : [];
    const wfMap = new Map(workflows.map((w) => [w.entityId, w]));

    return transfers.map((t) => ({
      ...t,
      toBranch: toMap.get(t.toBranchId) ?? null,
      workflow: wfMap.get(t.id) ?? null,
    }));
  }

  async createTransfer(tenantId: string, fromBranchId: string, userId: string, dto: CreateTransferDto, userRoles: string[] = []) {
    if (!dto.items?.length) throw new BadRequestException('At least one item is required');

    const effectiveFrom = await this.resolveBranchId(tenantId, dto.fromBranchId || fromBranchId);
    if (!effectiveFrom) throw new BadRequestException('Source branch is required');

    const fromWarehouseId = await this.resolveWarehouseId(tenantId, effectiveFrom, dto.fromWarehouseId);
    let toBranchId = dto.toBranchId;
    let toWarehouseId = dto.toWarehouseId;

    if (toWarehouseId) {
      const toWh = await this.prisma.warehouse.findFirst({
        where: { id: toWarehouseId, tenantId, isActive: true },
      });
      if (!toWh) throw new NotFoundException('Destination warehouse not found');
      toBranchId = toWh.branchId;
      toWarehouseId = toWh.id;
    } else {
      const toBranch = await this.prisma.branch.findFirst({ where: { id: toBranchId, tenantId } });
      if (!toBranch) throw new NotFoundException('Destination branch not found');
      toWarehouseId = await this.resolveWarehouseId(tenantId, toBranchId);
    }

    if (fromWarehouseId === toWarehouseId) {
      throw new BadRequestException('Cannot transfer to the same warehouse. Choose a different destination.');
    }

    const toBranch = await this.prisma.branch.findFirst({ where: { id: toBranchId, tenantId } });
    if (!toBranch) throw new NotFoundException('Destination branch not found');

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        tenantId,
        fromBranchId: effectiveFrom,
        toBranchId,
        fromWarehouseId,
        toWarehouseId,
        notes: dto.notes,
        requestedBy: userId,
        ...(bypassesWorkflowApproval(userRoles) ? { approvedBy: userId } : {}),
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
        fromWarehouse: { select: { id: true, name: true, code: true } },
        toWarehouse: { select: { id: true, name: true, code: true } },
      },
    });

    const [enriched] = await this.enrichTransfers([transfer]);

    if (!bypassesWorkflowApproval(userRoles)) {
      await this.workflowService.start(tenantId, userId, {
        key: 'stock_transfer',
        entityType: 'StockTransfer',
        entityId: transfer.id,
        metadata: {
          reference: `TRF-${transfer.id.slice(0, 8).toUpperCase()}`,
          fromBranchId: effectiveFrom,
          toBranchId,
          fromWarehouseId,
          toWarehouseId,
          toBranchName: toBranch.name,
          itemCount: dto.items.length,
        },
      });
    }

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

  async updateTransferStatus(id: string, tenantId: string, status: TransferStatus, userId: string, userRoles: string[] = []) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: { id, tenantId },
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

      const wf = await this.prisma.workflowInstance.findUnique({
        where: {
          tenantId_entityType_entityId: {
            tenantId: transfer.tenantId,
            entityType: 'StockTransfer',
            entityId: transfer.id,
          },
        },
      });
      // Admin-created transfers skip workflow (approvedBy set); otherwise require APPROVED
      const adminApproved = !!transfer.approvedBy && !wf;
      if (wf && wf.status !== WorkflowStatus.APPROVED) {
        if (wf.status === WorkflowStatus.REJECTED) {
          throw new BadRequestException('Transfer was rejected — create a new transfer request');
        }
        throw new BadRequestException('Transfer must be approved before dispatch');
      }
      if (!wf && !adminApproved && !bypassesWorkflowApproval(userRoles)) {
        throw new BadRequestException('Transfer must be approved before dispatch');
      }

      const fromWarehouseId = transfer.fromWarehouseId
        ?? await this.resolveWarehouseId(transfer.tenantId, transfer.fromBranchId);

      for (const item of transfer.items) {
        const inv = await this.prisma.inventory.findFirst({
          where: {
            tenantId: transfer.tenantId,
            warehouseId: fromWarehouseId,
            variantId: item.variantId,
          },
        });
        const available = (inv?.quantity ?? 0) - (inv?.reservedQty ?? 0);
        if (available < item.requestedQty) {
          const label = item.variant.sku || item.variant.name;
          throw new BadRequestException(`Insufficient stock for ${label}: ${available} available, ${item.requestedQty} requested`);
        }
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        for (const item of transfer.items) {
          const result = await this.adjustStock(transfer.tenantId, transfer.fromBranchId, userId, {
            variantId: item.variantId,
            quantity: item.requestedQty,
            movementType: StockMovementType.TRANSFER_OUT,
            referenceId: transfer.id,
            referenceType: 'StockTransfer',
            warehouseId: fromWarehouseId,
            notes: `Transfer dispatched to warehouse ${transfer.toWarehouseId ?? transfer.toBranchId}`,
          }, tx) as Awaited<ReturnType<InventoryService['adjustStock']>> & {
            _lotAllocations?: { lotId: string; quantity: number; batchNumber: string | null; expiryDate: Date | null }[];
          };

          await tx.stockTransferItem.update({
            where: { id: item.id },
            data: { sentQty: item.requestedQty },
          });

          for (const a of result._lotAllocations ?? []) {
            await tx.stockTransferLot.create({
              data: {
                transferItemId: item.id,
                fromLotId: a.lotId,
                batchNumber: a.batchNumber,
                expiryDate: a.expiryDate,
                quantity: a.quantity,
              },
            });
          }
        }

        return tx.stockTransfer.update({
          where: { id },
          data: { status, dispatchedAt: new Date() },
          include: {
            items: { include: { variant: { include: { product: true } } } },
            fromBranch: { select: { id: true, name: true, code: true } },
          },
        });
      });
      const [enriched] = await this.enrichTransfers([updated]);
      return enriched;
    }

    if (status === TransferStatus.RECEIVED) {
      if (transfer.status !== TransferStatus.IN_TRANSIT) {
        throw new BadRequestException('Only in-transit transfers can be received');
      }

      const toWarehouseId = transfer.toWarehouseId
        ?? await this.resolveWarehouseId(transfer.tenantId, transfer.toBranchId);

      const updated = await this.prisma.$transaction(async (tx) => {
        for (const item of transfer.items) {
          const qty = item.sentQty || item.requestedQty;
          const lotRows = await tx.stockTransferLot.findMany({
            where: { transferItemId: item.id },
          });

          if (lotRows.length) {
            for (const lr of lotRows) {
              await this.adjustStock(transfer.tenantId, transfer.toBranchId, userId, {
                variantId: item.variantId,
                quantity: lr.quantity,
                movementType: StockMovementType.TRANSFER_IN,
                referenceId: transfer.id,
                referenceType: 'StockTransfer',
                warehouseId: toWarehouseId,
                notes: `Transfer received from warehouse ${transfer.fromWarehouseId ?? transfer.fromBranchId}`,
                batchNumber: lr.batchNumber ?? undefined,
                expiryDate: lr.expiryDate?.toISOString(),
              }, tx);
              const toLot = await tx.inventoryLot.findFirst({
                where: {
                  tenantId: transfer.tenantId,
                  branchId: transfer.toBranchId,
                  warehouseId: toWarehouseId,
                  variantId: item.variantId,
                  batchNumber: lr.batchNumber ?? null,
                  ...(lr.expiryDate
                    ? {
                        expiryDate: {
                          gte: new Date(new Date(lr.expiryDate).setHours(0, 0, 0, 0)),
                          lt: new Date(new Date(lr.expiryDate).setHours(24, 0, 0, 0)),
                        },
                      }
                    : { expiryDate: null }),
                },
                orderBy: { receivedAt: 'desc' },
              });
              if (toLot) {
                await tx.stockTransferLot.update({
                  where: { id: lr.id },
                  data: { toLotId: toLot.id },
                });
              }
            }
          } else {
            await this.adjustStock(transfer.tenantId, transfer.toBranchId, userId, {
              variantId: item.variantId,
              quantity: qty,
              movementType: StockMovementType.TRANSFER_IN,
              referenceId: transfer.id,
              referenceType: 'StockTransfer',
              warehouseId: toWarehouseId,
              notes: `Transfer received from warehouse ${transfer.fromWarehouseId ?? transfer.fromBranchId}`,
            }, tx);
          }

          await tx.stockTransferItem.update({
            where: { id: item.id },
            data: { receivedQty: qty },
          });
        }

        return tx.stockTransfer.update({
          where: { id },
          data: { status, receivedAt: new Date(), approvedBy: userId },
          include: {
            items: { include: { variant: { include: { product: true } } } },
            fromBranch: { select: { id: true, name: true, code: true } },
          },
        });
      });
      const [enriched] = await this.enrichTransfers([updated]);
      return enriched;
    }

    throw new BadRequestException('Invalid status transition');
  }

  async listLots(
    tenantId: string,
    branchId: string,
    query: PaginationDto & { variantId?: string; batchNumber?: string; expiringWithinDays?: number; expiredOnly?: boolean },
  ) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const now = new Date();
    const where: Prisma.InventoryLotWhereInput = {
      tenantId,
      ...(branchId && { branchId }),
      ...(query.variantId && { variantId: query.variantId }),
      ...(query.batchNumber && { batchNumber: { contains: query.batchNumber, mode: 'insensitive' } }),
      isActive: true,
      quantity: { gt: 0 },
    };

    if (query.expiredOnly) {
      where.expiryDate = { lt: startOfLocalDay(now) };
    } else if (query.expiringWithinDays != null) {
      const until = new Date(now);
      until.setDate(until.getDate() + query.expiringWithinDays);
      where.expiryDate = { gte: startOfLocalDay(now), lte: until };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryLot.findMany({
        where,
        skip,
        take,
        include: {
          variant: { include: { product: { include: { category: true } } } },
          branch: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }],
      }),
      this.prisma.inventoryLot.count({ where }),
    ]);

    const enriched = data.map((lot) => ({
      ...lot,
      availableQty: Math.max(0, lot.quantity - lot.reservedQty),
      expiryBucket: classifyExpiry(lot.expiryDate, now),
      daysToExpiry: lot.expiryDate ? daysUntilExpiry(lot.expiryDate, now) : null,
      isExpired: isLotExpired(lot.expiryDate, now),
      value: lot.quantity * (lot.unitCost || 0),
    }));

    return paginate(enriched, total, query.page ?? 1, query.limit ?? 20);
  }

  async getExpiryDashboard(tenantId: string, branchId: string) {
    const now = new Date();
    const today = startOfLocalDay(now);
    const in7 = new Date(now); in7.setDate(in7.getDate() + 7);
    const in30 = new Date(now); in30.setDate(in30.getDate() + 30);
    const in90 = new Date(now); in90.setDate(in90.getDate() + 90);
    const { strategy, blockExpired } = await this.resolveTenantLotSettings(tenantId);

    const base = {
      tenantId,
      ...(branchId && { branchId }),
      isActive: true,
      quantity: { gt: 0 },
      expiryDate: { not: null },
    } as const;

    const sumValue = async (where: Prisma.InventoryLotWhereInput) => {
      const rows = await this.prisma.inventoryLot.findMany({
        where,
        select: { quantity: true, unitCost: true },
      });
      return rows.reduce((s, r) => s + r.quantity * (r.unitCost || 0), 0);
    };

    const [expired, d7, d30, d90, expiredValue, nearValue, lots] = await Promise.all([
      this.prisma.inventoryLot.aggregate({
        where: { ...base, expiryDate: { lt: today } },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.inventoryLot.aggregate({
        where: { ...base, expiryDate: { gte: today, lte: in7 } },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.inventoryLot.aggregate({
        where: { ...base, expiryDate: { gt: in7, lte: in30 } },
        _sum: { quantity: true },
        _count: true,
      }),
      this.prisma.inventoryLot.aggregate({
        where: { ...base, expiryDate: { gt: in30, lte: in90 } },
        _sum: { quantity: true },
        _count: true,
      }),
      sumValue({ ...base, expiryDate: { lt: today } }),
      sumValue({ ...base, expiryDate: { gte: today, lte: in30 } }),
      this.prisma.inventoryLot.findMany({
        where: { ...base, expiryDate: { lte: in30 } },
        include: {
          variant: { include: { product: true } },
          branch: { select: { name: true } },
        },
        orderBy: { expiryDate: 'asc' },
        take: 100,
      }),
    ]);

    const mapLot = (lot: (typeof lots)[number]) => ({
      ...lot,
      availableQty: Math.max(0, lot.quantity - lot.reservedQty),
      expiryBucket: classifyExpiry(lot.expiryDate, now),
      daysToExpiry: lot.expiryDate ? daysUntilExpiry(lot.expiryDate, now) : null,
      isExpired: isLotExpired(lot.expiryDate, now),
      value: lot.quantity * (lot.unitCost || 0),
    });

    const enriched = lots.map(mapLot);

    return {
      policy: {
        lotAllocation: strategy,
        posBlockExpired: blockExpired,
        fefoSales: strategy === 'FEFO',
      },
      summary: {
        expired: { lots: expired._count, qty: expired._sum.quantity ?? 0, value: expiredValue },
        within7Days: { lots: d7._count, qty: d7._sum.quantity ?? 0 },
        within30Days: { lots: d30._count, qty: d30._sum.quantity ?? 0 },
        within90Days: { lots: d90._count, qty: d90._sum.quantity ?? 0 },
        nearExpiryValue: nearValue,
      },
      urgent: enriched,
      nearExpiry: enriched.filter((l) => !l.isExpired),
      expiredLots: enriched.filter((l) => l.isExpired),
    };
  }

  async adjustLot(tenantId: string, branchId: string, userId: string, dto: LotAdjustDto, userRoles: string[] = []) {
    const lot = await this.prisma.inventoryLot.findFirst({
      where: { id: dto.lotId, tenantId, ...(branchId ? { branchId } : {}) },
    });
    if (!lot) throw new NotFoundException('Lot not found');

    let movementType = dto.movementType;
    let quantity = Math.abs(dto.quantity);

    // ADJUSTMENT on a lot = set that lot's on-hand to dto.quantity (delta applied to branch stock)
    if (dto.movementType === StockMovementType.ADJUSTMENT) {
      const delta = dto.quantity - lot.quantity;
      if (delta === 0) {
        return { id: lot.id, status: 'noop', message: 'Lot quantity unchanged' };
      }
      if (delta > 0) {
        movementType = StockMovementType.PURCHASE;
        quantity = delta;
      } else {
        movementType = StockMovementType.DAMAGE;
        quantity = Math.abs(delta);
      }
    }

    return this.requestAdjustmentApproval(
      tenantId,
      lot.branchId,
      userId,
      {
        variantId: lot.variantId,
        quantity,
        movementType,
        notes: dto.notes ?? `Lot ${lot.batchNumber || lot.id.slice(0, 8)} adjustment`,
        lotId: lot.id,
        batchNumber: lot.batchNumber ?? undefined,
        expiryDate: lot.expiryDate?.toISOString(),
        manufactureDate: lot.manufactureDate?.toISOString(),
      },
      userRoles,
    );
  }

  /** Batch transactions = inventory ledger rows tied to a lot (or all lot movements). */
  async getBatchTransactions(
    tenantId: string,
    branchId: string,
    query: PaginationDto & { lotId?: string; variantId?: string; batchNumber?: string },
  ) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where: Prisma.InventoryLogWhereInput = {
      tenantId,
      ...(branchId && { branchId }),
      ...(query.lotId && { lotId: query.lotId }),
      ...(query.variantId && { variantId: query.variantId }),
      ...(query.batchNumber && { batchNumber: { contains: query.batchNumber, mode: 'insensitive' } }),
      ...(!query.lotId && !query.batchNumber
        ? {
            OR: [
              { lotId: { not: null } },
              { batchNumber: { not: null } },
              { expiryDate: { not: null } },
              { notes: 'LOT_ALLOCATION' },
              { notes: 'LOT_SYNC_UNLOTTED' },
            ],
          }
        : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryLog.findMany({
        where,
        skip,
        take,
        include: {
          variant: { include: { product: true } },
          lot: {
            select: {
              id: true,
              batchNumber: true,
              expiryDate: true,
              manufactureDate: true,
              quantity: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryLog.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 50);
  }

  /**
   * Inventory reconciliation: branch Inventory.quantity vs sum(InventoryLot.quantity).
   * Aggregates multi-warehouse inventory rows per branch+variant before compare.
   * MATCHED | LOT_SHORT (unlotted) | LOT_OVER (integrity) | NO_LOTS
   */
  async reconcileLots(tenantId: string, branchId: string) {
    const strategy = await this.resolveLotStrategy(tenantId);
    const inventoryRows = await this.prisma.inventory.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      select: {
        variantId: true,
        branchId: true,
        warehouseId: true,
        quantity: true,
        reservedQty: true,
        variant: { select: { sku: true, name: true, product: { select: { name: true } } } },
      },
    });

    // Aggregate multi-warehouse rows to branch:variant grain (lots are still branch-scoped)
    const aggregated = new Map<string, {
      variantId: string;
      branchId: string;
      quantity: number;
      reservedQty: number;
      warehouseId: string;
      sku: string;
      name: string;
    }>();
    for (const r of inventoryRows) {
      const key = `${r.branchId}:${r.variantId}`;
      const cur = aggregated.get(key);
      if (cur) {
        cur.quantity += r.quantity;
        cur.reservedQty += r.reservedQty;
      } else {
        aggregated.set(key, {
          variantId: r.variantId,
          branchId: r.branchId,
          quantity: r.quantity,
          reservedQty: r.reservedQty,
          warehouseId: r.warehouseId,
          sku: r.variant.sku,
          name: `${r.variant.product.name} — ${r.variant.name}`,
        });
      }
    }
    const aggregatedRows = [...aggregated.values()];

    const lotAgg = await this.prisma.inventoryLot.groupBy({
      by: ['branchId', 'variantId'],
      where: {
        tenantId,
        ...(branchId && { branchId }),
        isActive: true,
      },
      _sum: { quantity: true, reservedQty: true },
    });

    const base = reconcileLotTotals(
      aggregatedRows.map((r) => ({
        variantId: r.variantId,
        branchId: r.branchId,
        quantity: r.quantity,
        reservedQty: r.reservedQty,
      })),
      lotAgg.map((r) => ({
        variantId: r.variantId,
        branchId: r.branchId,
        quantity: r._sum.quantity ?? 0,
        reservedQty: r._sum.reservedQty ?? 0,
      })),
    );

    const variantMeta = new Map(
      aggregatedRows.map((r) => [
        `${r.branchId}:${r.variantId}`,
        { sku: r.sku, name: r.name, warehouseId: r.warehouseId },
      ]),
    );

    const rows = base.map((row) => ({
      ...row,
      ...(variantMeta.get(`${row.branchId}:${row.variantId}`) ?? { sku: null, name: null, warehouseId: null }),
    }));

    const summary = {
      totalSkus: rows.length,
      matched: rows.filter((r) => r.status === 'MATCHED').length,
      lotShort: rows.filter((r) => r.status === 'LOT_SHORT').length,
      lotOver: rows.filter((r) => r.status === 'LOT_OVER').length,
      noLots: rows.filter((r) => r.status === 'NO_LOTS').length,
      strategy,
    };

    return {
      summary,
      mismatches: rows.filter((r) => r.status !== 'MATCHED'),
      rows,
    };
  }

  /**
   * Create OPENING_STOCK lots for LOT_SHORT / NO_LOTS deltas so lot sum matches inventory.
   * Does not change Inventory.quantity — only fills missing lot coverage.
   */
  async syncUnlottedToLots(tenantId: string, branchId: string, userId: string) {
    const report = await this.reconcileLots(tenantId, branchId);
    const toSync = report.mismatches.filter(
      (r) => (r.status === 'LOT_SHORT' || r.status === 'NO_LOTS') && r.delta > 0,
    );

    const created: { variantId: string; quantity: number; lotId: string }[] = [];
    for (const row of toSync) {
      const warehouseId =
        (row as { warehouseId?: string | null }).warehouseId
        || await this.resolveWarehouseId(tenantId, row.branchId);
      const lot = await this.prisma.$transaction(async (tx) => {
        return addToLot(tx, {
          tenantId,
          branchId: row.branchId,
          variantId: row.variantId,
          quantity: row.delta,
          batchNumber: 'UNLOTTED-SYNC',
          notes: `Reconciliation sync by ${userId}`,
          referenceType: 'Reconciliation',
          referenceId: row.variantId,
          warehouseId,
        });
      });
      if (lot) {
        created.push({ variantId: row.variantId, quantity: row.delta, lotId: lot.id });
        await this.prisma.inventoryLog.create({
          data: {
            tenantId,
            branchId: row.branchId,
            variantId: row.variantId,
            movementType: StockMovementType.OPENING_STOCK,
            quantityChange: 0,
            quantityBefore: row.inventoryQty,
            quantityAfter: row.inventoryQty,
            notes: 'LOT_SYNC_UNLOTTED',
            batchNumber: 'UNLOTTED-SYNC',
            lotId: lot.id,
            performedBy: userId,
          },
        });
      }
    }

    return { synced: created.length, lots: created, report: await this.reconcileLots(tenantId, branchId) };
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

  @Post('adjust/request')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Submit stock adjustment for approval workflow' })
  requestAdjustment(@CurrentUser() user: IAuthUser, @Body() dto: AdjustStockDto) {
    return this.inventoryService.requestAdjustmentApproval(
      user.tenantId,
      user.branchId ?? '',
      user.id,
      dto,
      user.roles,
    );
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

  @Get('lots/expiry-dashboard')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Expiry dashboard summary + urgent lots' })
  expiryDashboard(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.getExpiryDashboard(user.tenantId, user.branchId ?? '');
  }

  @Get('lots/transactions')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Batch / lot transaction ledger' })
  batchTransactions(
    @CurrentUser() user: IAuthUser,
    @Query() query: PaginationDto & { lotId?: string; variantId?: string; batchNumber?: string },
  ) {
    return this.inventoryService.getBatchTransactions(user.tenantId, user.branchId ?? '', query);
  }

  @Get('lots/reconcile')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Reconcile branch inventory qty vs sum of lot quantities' })
  reconcileLots(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.reconcileLots(user.tenantId, user.branchId ?? '');
  }

  @Post('lots/reconcile/sync-unlotted')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Create lots for unlotted inventory deltas (does not change on-hand)' })
  syncUnlotted(@CurrentUser() user: IAuthUser) {
    return this.inventoryService.syncUnlottedToLots(user.tenantId, user.branchId ?? '', user.id);
  }

  @Get('lots')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List inventory lots (batch / expiry)' })
  listLots(
    @CurrentUser() user: IAuthUser,
    @Query() query: PaginationDto & {
      variantId?: string;
      batchNumber?: string;
      expiringWithinDays?: string;
      expiredOnly?: string;
    },
  ) {
    return this.inventoryService.listLots(user.tenantId, user.branchId ?? '', {
      ...query,
      expiringWithinDays: query.expiringWithinDays ? parseInt(query.expiringWithinDays, 10) : undefined,
      expiredOnly: query.expiredOnly === 'true' || query.expiredOnly === '1',
    });
  }

  @Post('lots/adjust')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Adjust a specific inventory lot (batch)' })
  adjustLot(@CurrentUser() user: IAuthUser, @Body() dto: LotAdjustDto) {
    return this.inventoryService.adjustLot(
      user.tenantId,
      user.branchId ?? '',
      user.id,
      dto,
      user.roles,
    );
  }

  @Post('transfers')
  @RequirePermissions('inventory:create')
  @ApiOperation({ summary: 'Create stock transfer between branches' })
  createTransfer(@CurrentUser() user: IAuthUser, @Body() dto: CreateTransferDto) {
    return this.inventoryService.createTransfer(user.tenantId, user.branchId ?? '', user.id, dto, user.roles);
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
    return this.inventoryService.updateTransferStatus(id, user.tenantId, status, user.id, user.roles);
  }
}

@Module({
  imports: [forwardRef(() => WorkflowModule)],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
