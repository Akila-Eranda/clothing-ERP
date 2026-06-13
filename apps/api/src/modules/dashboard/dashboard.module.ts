import { Module } from '@nestjs/common';
import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import * as dayjs from 'dayjs';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(tenantId: string, branchId?: string) {
    const today = dayjs().startOf('day').toDate();
    const todayEnd = dayjs().endOf('day').toDate();
    const thisMonthStart = dayjs().startOf('month').toDate();
    const lastMonthStart = dayjs().subtract(1, 'month').startOf('month').toDate();
    const lastMonthEnd = dayjs().subtract(1, 'month').endOf('month').toDate();

    const saleWhere = { tenantId, ...(branchId && { branchId }) };

    const [
      todaySales, thisMonthSales, lastMonthSales,
      totalCustomers, newCustomersToday, newCustomersMonth,
      lowStockCount, pendingPOs, pendingReturns,
      totalProducts, customerReceivables, supplierPayables,
    ] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ where: { ...saleWhere, invoiceDate: { gte: today, lte: todayEnd } }, _sum: { total: true }, _count: { id: true } }),
      this.prisma.sale.aggregate({ where: { ...saleWhere, invoiceDate: { gte: thisMonthStart } }, _sum: { total: true }, _count: { id: true } }),
      this.prisma.sale.aggregate({ where: { ...saleWhere, invoiceDate: { gte: lastMonthStart, lte: lastMonthEnd } }, _sum: { total: true } }),
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.customer.count({ where: { tenantId, createdAt: { gte: today } } }),
      this.prisma.customer.count({ where: { tenantId, createdAt: { gte: thisMonthStart } } }),
      this.prisma.inventory.count({ where: { tenantId, ...(branchId && { branchId }), quantity: { lte: 5 } } }),
      this.prisma.purchaseOrder.count({ where: { tenantId, status: { in: ['DRAFT', 'SENT'] as any[] } } }),
      this.prisma.return.count({ where: { tenantId, status: 'INITIATED' as any } }),
      this.prisma.product.count({ where: { tenantId, status: { not: 'ARCHIVED' as any } } }),
      this.prisma.customer.aggregate({ where: { tenantId, creditBalance: { gt: 0 } }, _sum: { creditBalance: true }, _count: { id: true } }),
      this.prisma.supplier.aggregate({ where: { tenantId, balance: { gt: 0 } }, _sum: { balance: true }, _count: { id: true } }),
    ]);

    const monthlyRevenue = thisMonthSales._sum.total ?? 0;
    const lastMonthRevenue = lastMonthSales._sum.total ?? 0;
    const revenueGrowth = lastMonthRevenue > 0
      ? (((monthlyRevenue - lastMonthRevenue) / lastMonthRevenue) * 100).toFixed(1)
      : '0';

    return {
      today: {
        revenue: todaySales._sum.total ?? 0,
        transactions: todaySales._count.id,
        newCustomers: newCustomersToday,
      },
      thisMonth: { revenue: monthlyRevenue, transactions: thisMonthSales._count.id, newCustomers: newCustomersMonth },
      growth: { revenue: revenueGrowth },
      alerts: { lowStock: lowStockCount, pendingPOs, pendingReturns },
      totalCustomers,
      totalProducts,
      outstanding: {
        customerReceivables: customerReceivables._sum.creditBalance ?? 0,
        customerReceivableCount: customerReceivables._count.id,
        supplierPayables: supplierPayables._sum.balance ?? 0,
        supplierPayableCount: supplierPayables._count.id,
      },
    };
  }

  async getRevenueChart(tenantId: string, branchId?: string, days = 30) {
    const since = dayjs().subtract(days, 'day').startOf('day').toDate();
    return this.prisma.sale.findMany({
      where: { tenantId, ...(branchId && { branchId }), invoiceDate: { gte: since } },
      select: { invoiceDate: true, total: true, discountAmount: true, taxAmount: true },
      orderBy: { invoiceDate: 'asc' },
    });
  }

  async getTopProducts(tenantId: string, branchId?: string) {
    const since = dayjs().subtract(30, 'day').toDate();
    return this.prisma.saleItem.groupBy({
      by: ['productName', 'variantId', 'sku'],
      where: { sale: { tenantId, ...(branchId && { branchId }), invoiceDate: { gte: since } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 10,
    });
  }

  async getTopCustomers(tenantId: string) {
    return this.prisma.customer.findMany({
      where: { tenantId },
      orderBy: { totalSpent: 'desc' },
      take: 10,
      select: { id: true, firstName: true, lastName: true, phone: true, totalSpent: true, totalOrders: true, tier: true },
    });
  }

  async getSalesByCategory(tenantId: string, branchId?: string) {
    const since = dayjs().subtract(30, 'day').toDate();
    const items = await this.prisma.saleItem.findMany({
      where: { sale: { tenantId, ...(branchId && { branchId }), invoiceDate: { gte: since } } },
      include: { variant: { include: { product: { include: { category: true } } } } },
    });

    const byCategory: Record<string, { name: string; total: number; count: number }> = {};
    for (const item of items) {
      const catName = item.variant?.product?.category?.name ?? 'Uncategorized';
      const catId = item.variant?.product?.categoryId ?? 'uncategorized';
      if (!byCategory[catId]) byCategory[catId] = { name: catName, total: 0, count: 0 };
      byCategory[catId].total += item.total;
      byCategory[catId].count += item.quantity;
    }

    return Object.values(byCategory).sort((a, b) => b.total - a.total);
  }
}

@ApiTags('Dashboard')
@ApiBearerAuth('access-token')
@Controller({ path: 'dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get dashboard overview KPIs' })
  getOverview(@CurrentUser() user: IAuthUser) {
    return this.dashboardService.getOverview(user.tenantId, user.branchId);
  }

  @Get('revenue-chart')
  @ApiOperation({ summary: 'Get revenue chart data' })
  getRevenueChart(@CurrentUser() user: IAuthUser, @Query('days') days?: number) {
    return this.dashboardService.getRevenueChart(user.tenantId, user.branchId, days);
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top selling products' })
  getTopProducts(@CurrentUser() user: IAuthUser) {
    return this.dashboardService.getTopProducts(user.tenantId, user.branchId);
  }

  @Get('top-customers')
  @ApiOperation({ summary: 'Get top customers by spend' })
  getTopCustomers(@CurrentUser() user: IAuthUser) {
    return this.dashboardService.getTopCustomers(user.tenantId);
  }

  @Get('sales-by-category')
  @ApiOperation({ summary: 'Get sales breakdown by category' })
  getSalesByCategory(@CurrentUser() user: IAuthUser) {
    return this.dashboardService.getSalesByCategory(user.tenantId, user.branchId);
  }
}

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
