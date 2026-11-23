import { textSearch } from '@/shared/search.helper';
import { Module } from '@nestjs/common';
import { Controller, Get, Param, Query, NotFoundException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { canViewAllPosSales } from '@/shared/pos-sales-scope.helper';
import { resolveBranchScope } from '@/shared/branch-scope.helper';
import { buildSaleBillMessage } from '@/shared/sale-bill-message';
import * as dayjs from 'dayjs';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Bill message of a sale the caller may see (same scope as the sale detail). */
  async billMessage(tenantId: string, id: string, scope: { cashierId?: string; scopeAll?: boolean }) {
    await this.findOne(id, tenantId, scope);
    return buildSaleBillMessage(this.prisma, tenantId, id);
  }

  async findAll(tenantId: string, query: {
    page?: number; limit?: number; branchId?: string;
    startDate?: string; endDate?: string; customerId?: string; search?: string;
    cashierId?: string; scopeAll?: boolean;
  }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.branchId && { branchId: query.branchId }),
      ...(query.customerId && { customerId: query.customerId }),
      ...(!query.scopeAll && query.cashierId ? { cashierId: query.cashierId } : {}),
      ...(query.startDate && query.endDate && {
        invoiceDate: {
          gte: dayjs(query.startDate).startOf('day').toDate(),
          lte: dayjs(query.endDate).endOf('day').toDate(),
        },
      }),
      ...textSearch(query.search, ['invoiceNumber', 'customer.phone', 'customer.firstName', 'customer.lastName']),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where, skip, take,
        include: { customer: true, branch: true, cashier: true, payments: { select: { method: true, amount: true } }, _count: { select: { items: true } } },
        orderBy: { invoiceDate: 'desc' },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string, opts?: { cashierId?: string; scopeAll?: boolean }) {
    const sale = await this.prisma.sale.findFirst({
      where: {
        id,
        tenantId,
        ...(!opts?.scopeAll && opts?.cashierId ? { cashierId: opts.cashierId } : {}),
      },
      include: {
        items: { include: { variant: { include: { product: true } } } },
        payments: { include: { bankAccount: { select: { name: true, bankName: true } }, qrCode: { select: { label: true } } } }, customer: true, branch: true, cashier: true,
      },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
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
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.salesService.findAll(user.tenantId, {
      ...query,
      branchId: resolveBranchScope(user, query.branchId),
      cashierId: user.id,
      scopeAll,
    });
  }

  @Get(':id/bill-message')
  @RequirePermissions('sales:read')
  @ApiOperation({ summary: 'Customer bill message of this sale (shop template, real invoice data) for copy / share' })
  billMessage(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.salesService.billMessage(user.tenantId, id, { cashierId: user.id, scopeAll: canViewAllPosSales(user.roles ?? []) });
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
    const scopeAll = canViewAllPosSales(user.roles ?? []);
    return this.salesService.findOne(id, user.tenantId, {
      cashierId: user.id,
      scopeAll,
    });
  }
}

@Module({
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService],
})
export class SalesModule {}
