import { Module } from '@nestjs/common';
import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import * as dayjs from 'dayjs';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async salesReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    return this.prisma.sale.findMany({
      where: { tenantId, ...(branchId && { branchId }), invoiceDate: dateRange },
      include: {
        customer: { select: { firstName: true, lastName: true, phone: true } },
        cashier: { select: { firstName: true, lastName: true } },
        branch: { select: { name: true } },
        items: true,
        payments: true,
      },
      orderBy: { invoiceDate: 'desc' },
    });
  }

  async inventoryReport(tenantId: string, branchId?: string) {
    return this.prisma.inventory.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      include: {
        variant: {
          include: {
            product: { include: { category: true, brand: true } },
          },
        },
        branch: { select: { name: true } },
      },
      orderBy: { quantity: 'asc' },
    });
  }

  async stockMovementReport(tenantId: string, startDate: string, endDate: string) {
    return this.prisma.inventoryLog.findMany({
      where: {
        tenantId,
        createdAt: {
          gte: dayjs(startDate).startOf('day').toDate(),
          lte: dayjs(endDate).endOf('day').toDate(),
        },
      },
      include: { variant: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async customerReport(tenantId: string) {
    return this.prisma.customer.findMany({
      where: { tenantId },
      select: {
        id: true, code: true, firstName: true, lastName: true,
        phone: true, email: true, tier: true,
        totalSpent: true, totalOrders: true, loyaltyPoints: true,
        walletBalance: true, createdAt: true, lastPurchaseAt: true,
      },
      orderBy: { totalSpent: 'desc' },
    });
  }

  async supplierReport(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId },
      include: { _count: { select: { purchases: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async profitReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const items = await this.prisma.saleItem.findMany({
      where: { sale: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' }, ...(branchId && { branchId }) } },
      select: { productName: true, variantName: true, sku: true, quantity: true, unitPrice: true, costPrice: true, discount: true, total: true, taxAmount: true },
    });
    const map: Record<string, { productName: string; variantName: string; sku: string; qty: number; revenue: number; cost: number; profit: number }> = {};
    for (const i of items) {
      const key = i.sku;
      if (!map[key]) map[key] = { productName: i.productName, variantName: i.variantName, sku: i.sku, qty: 0, revenue: 0, cost: 0, profit: 0 };
      map[key].qty     += i.quantity;
      map[key].revenue += i.total;
      map[key].cost    += i.costPrice * i.quantity;
      map[key].profit  += i.total - (i.costPrice * i.quantity);
    }
    const rows = Object.values(map).sort((a, b) => b.profit - a.profit);
    const totals = rows.reduce((acc, r) => ({ revenue: acc.revenue + r.revenue, cost: acc.cost + r.cost, profit: acc.profit + r.profit }), { revenue: 0, cost: 0, profit: 0 });
    return { rows, totals, margin: totals.revenue > 0 ? ((totals.profit / totals.revenue) * 100).toFixed(2) : '0' };
  }

  async bestSellingItems(tenantId: string, startDate: string, endDate: string, limit = 20, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const grouped = await this.prisma.saleItem.groupBy({
      by: ['productName', 'sku'],
      where: { sale: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' }, ...(branchId && { branchId }) } },
      _sum: { quantity: true, total: true },
      _count: { id: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    return grouped.map(g => ({
      productName: g.productName,
      sku: g.sku,
      totalQty: g._sum.quantity ?? 0,
      totalRevenue: g._sum.total ?? 0,
      orderCount: g._count.id,
    }));
  }

  async cashierReport(tenantId: string, startDate: string, endDate: string, branchId?: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const grouped = await this.prisma.sale.groupBy({
      by: ['cashierId'],
      where: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' }, ...(branchId && { branchId }) },
      _sum: { total: true, discountAmount: true, taxAmount: true },
      _count: { id: true },
    });
    const cashierIds = grouped.map(g => g.cashierId).filter(Boolean) as string[];
    const users = cashierIds.length > 0
      ? await this.prisma.user.findMany({ where: { id: { in: cashierIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
      : [];
    const userMap = Object.fromEntries(users.map(u => [u.id, u]));
    return grouped.map(g => ({
      cashierId: g.cashierId,
      cashierName: g.cashierId && userMap[g.cashierId] ? `${userMap[g.cashierId].firstName} ${userMap[g.cashierId].lastName}` : 'Unknown',
      salesCount: g._count.id,
      totalRevenue: g._sum.total ?? 0,
      totalDiscount: g._sum.discountAmount ?? 0,
      totalTax: g._sum.taxAmount ?? 0,
    })).sort((a, b) => b.totalRevenue - a.totalRevenue);
  }

  async taxReport(tenantId: string, startDate: string, endDate: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const aggregated = await this.prisma.sale.aggregate({
      where: { tenantId, invoiceDate: dateRange },
      _sum: { total: true, taxAmount: true, subtotal: true, discountAmount: true },
      _count: { id: true },
    });
    const byTaxRate = await this.prisma.saleItem.groupBy({
      by: ['taxRate'],
      where: { sale: { tenantId, invoiceDate: dateRange } },
      _sum: { taxAmount: true, total: true, quantity: true },
      orderBy: { taxRate: 'asc' },
    });
    return { summary: aggregated._sum, count: aggregated._count.id, byTaxRate };
  }
}

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
  taxReport(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.reportsService.taxReport(user.tenantId, start, end);
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
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
