import { Module } from '@nestjs/common';
import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountType, JournalEntryType, PaymentMethod } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import * as dayjs from 'dayjs';

export class CreateAccountDto {
  @ApiProperty() @IsString() code: string;
  @ApiProperty() @IsString() name: string;
  @ApiProperty({ enum: AccountType }) @IsEnum(AccountType) type: AccountType;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
}

export class CreateExpenseDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccounts(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId, isActive: true, parentId: null },
      include: { children: { include: { children: true } } },
      orderBy: { code: 'asc' },
    });
  }

  async createAccount(tenantId: string, userId: string, dto: CreateAccountDto) {
    return this.prisma.account.create({
      data: { tenantId, ...dto },
    });
  }

  async createExpense(tenantId: string, branchId: string, userId: string, dto: CreateExpenseDto) {
    return this.prisma.expense.create({
      data: {
        tenantId, branchId,
        amount: dto.amount,
        description: dto.description,
        date: new Date(dto.date),
        categoryId: dto.categoryId,
        paymentMethod: dto.paymentMethod ?? PaymentMethod.CASH,
        reference: dto.reference,
        createdBy: userId,
      },
    });
  }

  async getExpenses(tenantId: string, query: PaginationDto & { startDate?: string; endDate?: string }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.startDate && query.endDate && {
        date: {
          gte: dayjs(query.startDate).startOf('day').toDate(),
          lte: dayjs(query.endDate).endOf('day').toDate(),
        },
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.expense.findMany({ where, skip, take, orderBy: { date: 'desc' } }),
      this.prisma.expense.count({ where }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async getProfitLoss(tenantId: string, startDate: string, endDate: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };

    const [revenue, expenses, returns] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({
        where: { tenantId, invoiceDate: dateRange },
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { _all: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, date: dateRange },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.return.aggregate({
        where: { tenantId, createdAt: dateRange },
        _sum: { refundAmount: true },
      }),
    ]);

    const grossRevenue = revenue._sum?.total ?? 0;
    const totalExpenses = expenses._sum?.amount ?? 0;
    const totalReturns = returns._sum?.refundAmount ?? 0;
    const netRevenue = grossRevenue - totalReturns;
    const netProfit = netRevenue - totalExpenses;

    return {
      period: { startDate, endDate },
      revenue: { gross: grossRevenue, returns: totalReturns, net: netRevenue },
      expenses: { total: totalExpenses, count: expenses._count?._all ?? 0 },
      netProfit,
      profitMargin: netRevenue > 0 ? ((netProfit / netRevenue) * 100).toFixed(2) : '0',
      salesCount: revenue._count?._all ?? 0,
    };
  }

  async getTrialBalance(tenantId: string) {
    return this.prisma.account.findMany({
      where: { tenantId, isActive: true },
      select: { code: true, name: true, type: true, balance: true },
      orderBy: { code: 'asc' },
    });
  }
}

@ApiTags('Accounting')
@ApiBearerAuth('access-token')
@Controller({ path: 'accounting', version: '1' })
export class AccountingController {
  constructor(private readonly accountingService: AccountingService) {}

  @Get('accounts')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get chart of accounts' })
  getAccounts(@CurrentUser() user: IAuthUser) {
    return this.accountingService.getAccounts(user.tenantId);
  }

  @Post('accounts')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create account' })
  createAccount(@CurrentUser() user: IAuthUser, @Body() dto: CreateAccountDto) {
    return this.accountingService.createAccount(user.tenantId, user.id, dto);
  }

  @Post('expenses')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Record expense' })
  createExpense(@CurrentUser() user: IAuthUser, @Body() dto: CreateExpenseDto) {
    return this.accountingService.createExpense(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Get('expenses')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List expenses' })
  getExpenses(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { startDate?: string; endDate?: string }) {
    return this.accountingService.getExpenses(user.tenantId, query);
  }

  @Get('profit-loss')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get P&L report' })
  getProfitLoss(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.accountingService.getProfitLoss(user.tenantId, start, end);
  }

  @Get('trial-balance')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Get trial balance' })
  getTrialBalance(@CurrentUser() user: IAuthUser) {
    return this.accountingService.getTrialBalance(user.tenantId);
  }
}

@Module({
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService],
})
export class AccountingModule {}
