import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';

@ApiTags('Reports')
@ApiBearerAuth('access-token')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Generate sales report' })
  salesReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.salesReport(user.tenantId, start, end, branchId);
  }

  @Get('inventory')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Generate inventory report' })
  inventoryReport(@CurrentUser() user: IAuthUser, @Query('branchId') branchId?: string) {
    return this.reportsService.inventoryReport(user.tenantId, branchId);
  }

  @Get('stock-movement')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Stock movement report' })
  stockMovementReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.reportsService.stockMovementReport(user.tenantId, start, end);
  }

  @Get('expiry')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Batch expiry report (near-expiry and expired lots)' })
  expiryReport(
    @CurrentUser() user: IAuthUser,
    @Query('branchId') branchId?: string,
    @Query('withinDays') withinDays?: string,
  ) {
    return this.reportsService.expiryReport(
      user.tenantId,
      branchId || user.branchId || undefined,
      withinDays ? parseInt(withinDays, 10) : 90,
    );
  }

  @Get('customers')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Customer report' })
  customerReport(@CurrentUser() user: IAuthUser) {
    return this.reportsService.customerReport(user.tenantId);
  }

  @Get('suppliers')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Supplier report' })
  supplierReport(@CurrentUser() user: IAuthUser) {
    return this.reportsService.supplierReport(user.tenantId);
  }

  @Get('tax')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Tax/GST report' })
  taxReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.taxReport(user.tenantId, start, end, branchId);
  }

  @Get('profit')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Profit report by product (revenue vs cost)' })
  profitReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.profitReport(user.tenantId, start, end, branchId);
  }

  @Get('best-selling')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Best selling products by quantity' })
  bestSellingItems(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('limit') limit?: string, @Query('branchId') branchId?: string) {
    return this.reportsService.bestSellingItems(user.tenantId, start, end, limit ? parseInt(limit) : 20, branchId);
  }

  @Get('cashier')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Sales performance by cashier' })
  cashierReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.cashierReport(user.tenantId, start, end, branchId);
  }

  @Get('branches')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Sales performance by branch' })
  branchReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.reportsService.branchReport(user.tenantId, start, end);
  }

  @Get('purchases')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Purchase order & supplier payment report' })
  purchaseReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start: string,
    @Query('endDate') end: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.reportsService.purchaseReport(user.tenantId, start, end, branchId || user.branchId || undefined);
  }

  @Get('cheques')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Cheque status and due-date report' })
  chequeReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start?: string,
    @Query('endDate') end?: string,
  ) {
    return this.reportsService.chequeReport(user.tenantId, start, end);
  }

  @Get('commission')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Helper commission report' })
  commissionReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') start: string,
    @Query('endDate') end: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.reportsService.commissionReport(user.tenantId, start, end, branchId || user.branchId || undefined);
  }

  @Get('supplier-performance')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Supplier delivery and spend analytics' })
  supplierPerformance(@CurrentUser() user: IAuthUser) {
    return this.reportsService.supplierPerformanceReport(user.tenantId);
  }

  @Get('supplier-price-history')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Historical supplier unit costs from POs' })
  supplierPriceHistory(
    @CurrentUser() user: IAuthUser,
    @Query('variantId') variantId?: string,
    @Query('supplierId') supplierId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reportsService.supplierPriceHistory(user.tenantId, variantId, supplierId, limit ? parseInt(limit, 10) : 50);
  }

  @Get('tyre-brands')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Best selling tyre brands by revenue' })
  tyreBrandSales(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.tyreBrandSales(user.tenantId, start, end, branchId);
  }

  @Get('service-revenue')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Workshop service revenue breakdown' })
  serviceRevenue(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string, @Query('branchId') branchId?: string) {
    return this.reportsService.serviceRevenueReport(user.tenantId, start, end, branchId);
  }

  @Get('technician-performance')
  @RequirePermissions('reports:read')
  @ApiOperation({ summary: 'Technician job count and revenue' })
  technicianPerformance(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.reportsService.technicianPerformanceReport(user.tenantId, start, end);
  }
}
