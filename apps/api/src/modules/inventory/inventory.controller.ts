import {
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TransferStatus } from '@prisma/client';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryService } from './inventory.service';
import {
  AdjustStockDto,
  CreateTransferDto,
  LotAdjustDto,
} from './inventory.dto';

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
