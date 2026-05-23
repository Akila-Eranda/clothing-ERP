import { Module } from '@nestjs/common';
import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import * as dayjs from 'dayjs';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, query: {
    page?: number; limit?: number; branchId?: string;
    startDate?: string; endDate?: string; customerId?: string; search?: string;
  }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(query.startDate && query.endDate && {
        invoiceDate: {
          gte: dayjs(query.startDate).startOf('day').toDate(),
          lte: dayjs(query.endDate).endOf('day').toDate(),
        },
      }),
      ...(query.search && {
        OR: [
          { invoiceNumber: { contains: query.search, mode: 'insensitive' as const } },
          { customer: { phone: { contains: query.search } } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where, skip, take,
        include: { customer: true, branch: true, cashier: true, _count: { select: { items: true } } },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    return this.prisma.sale.findFirstOrThrow({
      where: { id, tenantId },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        payments: true, customer: true, branch: true, cashier: true,
      },
    });
  }

  async getSalesByCustomer(customerId: string, tenantId: string) {
    return this.prisma.sale.findMany({
      where: { customerId, tenantId },
      include: { _count: { select: { items: true } } },
      orderBy: { invoiceDate: 'desc' },
      take: 20,
    });
  }

  async getTopProducts(tenantId: string, branchId?: string, days = 30) {
    const since = dayjs().subtract(days, 'day').toDate();
    const items = await this.prisma.saleItem.groupBy({
      by: ['variantId', 'productName', 'sku'],
      where: { sale: { tenantId, ...(branchId && { branchId }), invoiceDate: { gte: since } } },
      _sum: { quantity: true, total: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: 20,
    });
    return items;
  }

  async getRevenueByPeriod(tenantId: string, branchId?: string, period: 'day' | 'week' | 'month' = 'month') {
    const days = period === 'day' ? 30 : period === 'week' ? 12 : 12;
    const since = dayjs().subtract(days, period === 'day' ? 'day' : period === 'week' ? 'week' : 'month').toDate();

    return this.prisma.sale.findMany({
      where: { tenantId, ...(branchId && { branchId }), invoiceDate: { gte: since } },
      select: { invoiceDate: true, total: true, taxAmount: true, discountAmount: true },
      orderBy: { invoiceDate: 'asc' },
    });
  }
}

@ApiTags('Sales')
@ApiBearerAuth('access-token')
@Controller({ path: 'sales', version: '1' })
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get()
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'List all sales with filters' })
  findAll(@CurrentUser() user: IAuthUser, @Query() query: {
    page?: number; limit?: number; branchId?: string;
    startDate?: string; endDate?: string; customerId?: string; search?: string;
  }) {
    return this.salesService.findAll(user.tenantId, query);
  }

  @Get('top-products')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get top selling products' })
  getTopProducts(@CurrentUser() user: IAuthUser, @Query('days') days?: number) {
    return this.salesService.getTopProducts(user.tenantId, user.branchId, days);
  }

  @Get('revenue')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get revenue by period' })
  getRevenue(@CurrentUser() user: IAuthUser, @Query('period') period?: 'day' | 'week' | 'month') {
    return this.salesService.getRevenueByPeriod(user.tenantId, user.branchId, period);
  }

  @Get(':id')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Get sale by ID' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.salesService.findOne(id, user.tenantId);
  }
}

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
