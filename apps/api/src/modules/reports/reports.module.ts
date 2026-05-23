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
}

@Module({
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
