import { Module, NotFoundException } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable } from '@nestjs/common';
import { IsString, IsOptional, IsNumber, IsEnum, IsDateString, IsBoolean, ValidateNested, IsArray, Min } from 'class-validator';
import { Type } from 'class-transformer';
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

export class UpdateExpenseDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() amount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional({ enum: PaymentMethod }) @IsOptional() @IsEnum(PaymentMethod) paymentMethod?: PaymentMethod;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

export class JournalLineDto {
  @ApiProperty() @IsString() debitAccountId: string;
  @ApiProperty() @IsString() creditAccountId: string;
  @ApiProperty() @IsNumber() @Min(0.01) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
}

export class CreateJournalEntryDto {
  @ApiProperty() @IsString() description: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiProperty({ type: [JournalLineDto] }) @IsArray() @ValidateNested({ each: true }) @Type(() => JournalLineDto) lines: JournalLineDto[];
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

  async updateExpense(id: string, tenantId: string, dto: UpdateExpenseDto) {
    const expense = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.description && { description: dto.description }),
        ...(dto.date && { date: new Date(dto.date) }),
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.paymentMethod && { paymentMethod: dto.paymentMethod }),
        ...(dto.reference !== undefined && { reference: dto.reference }),
      },
    });
  }

  async deleteExpense(id: string, tenantId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, tenantId } });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.prisma.expense.delete({ where: { id } });
  }

  async getExpenseSummary(tenantId: string, startDate: string, endDate: string) {
    const dateRange = {
      gte: dayjs(startDate).startOf('day').toDate(),
      lte: dayjs(endDate).endOf('day').toDate(),
    };
    const expenses = await this.prisma.expense.findMany({
      where: { tenantId, date: dateRange },
      select: { categoryId: true, amount: true, paymentMethod: true },
    });
    const byCategory: Record<string, number> = {};
    const byMethod: Record<string, number> = {};
    let total = 0;
    for (const e of expenses) {
      const cat = e.categoryId ?? 'Uncategorized';
      byCategory[cat] = (byCategory[cat] ?? 0) + e.amount;
      byMethod[e.paymentMethod] = (byMethod[e.paymentMethod] ?? 0) + e.amount;
      total += e.amount;
    }
    return {
      total,
      byCategory: Object.entries(byCategory).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      byPaymentMethod: Object.entries(byMethod).map(([method, amount]) => ({ method, amount })),
    };
  }

  async getMonthlyPL(tenantId: string, months = 6) {
    const result = [];
    for (let i = months - 1; i >= 0; i--) {
      const start = dayjs().subtract(i, 'month').startOf('month').toDate();
      const end   = dayjs().subtract(i, 'month').endOf('month').toDate();
      const label = dayjs().subtract(i, 'month').format('MMM YY');
      const [rev, exp, ret] = await this.prisma.$transaction([
        this.prisma.sale.aggregate({ where: { tenantId, invoiceDate: { gte: start, lte: end }, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
        this.prisma.expense.aggregate({ where: { tenantId, date: { gte: start, lte: end } }, _sum: { amount: true } }),
        this.prisma.return.aggregate({ where: { tenantId, createdAt: { gte: start, lte: end } }, _sum: { refundAmount: true } }),
      ]);
      const revenue  = (rev._sum?.total ?? 0) - (ret._sum?.refundAmount ?? 0);
      const expenses = exp._sum?.amount ?? 0;
      result.push({ month: label, revenue, expenses, profit: revenue - expenses });
    }
    return result;
  }

  async getCashFlow(tenantId: string, startDate: string, endDate: string) {
    const dateRange = { gte: dayjs(startDate).startOf('day').toDate(), lte: dayjs(endDate).endOf('day').toDate() };
    const [sales, expenses] = await Promise.all([
      this.prisma.sale.findMany({ where: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' } }, select: { total: true, invoiceDate: true } }),
      this.prisma.expense.findMany({ where: { tenantId, date: dateRange }, select: { amount: true, date: true, categoryId: true } }),
    ]);
    const map: Record<string, { date: string; inflow: number; outflow: number }> = {};
    for (const s of sales) {
      const key = dayjs(s.invoiceDate).format('YYYY-MM-DD');
      if (!map[key]) map[key] = { date: key, inflow: 0, outflow: 0 };
      map[key].inflow += s.total;
    }
    for (const e of expenses) {
      const key = dayjs(e.date).format('YYYY-MM-DD');
      if (!map[key]) map[key] = { date: key, inflow: 0, outflow: 0 };
      map[key].outflow += e.amount;
    }
    const data = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    return {
      data,
      totalInflow:  sales.reduce((s, e) => s + e.total, 0),
      totalOutflow: expenses.reduce((s, e) => s + e.amount, 0),
    };
  }

  async getBalanceSheet(tenantId: string) {
    const [salesAgg, expAgg, refundAgg, accounts] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ where: { tenantId, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      this.prisma.expense.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      this.prisma.return.aggregate({ where: { tenantId, status: { in: ['APPROVED', 'COMPLETED', 'REFUND_PROCESSED'] } }, _sum: { refundAmount: true } }),
      this.prisma.account.findMany({ where: { tenantId, isActive: true }, select: { id: true, code: true, name: true, type: true, balance: true } }),
    ]);
    const revenue  = (salesAgg._sum?.total ?? 0) - (refundAgg._sum?.refundAmount ?? 0);
    const expenses = expAgg._sum?.amount ?? 0;
    const retained = revenue - expenses;
    const byType = (t: AccountType) => accounts.filter((a) => a.type === t);
    return {
      assets:      { accounts: byType('ASSET'),     operatingCash: revenue, totalExpenses: expenses, total: byType('ASSET').reduce((s, a) => s + a.balance, 0) },
      liabilities: { accounts: byType('LIABILITY'), total: byType('LIABILITY').reduce((s, a) => s + a.balance, 0) },
      equity:      { accounts: byType('EQUITY'),    retainedEarnings: retained, total: byType('EQUITY').reduce((s, a) => s + a.balance, 0) + retained },
      revenue:     { accounts: byType('REVENUE'),   total: byType('REVENUE').reduce((s, a) => s + a.balance, 0) },
      expenseAcct: { accounts: byType('EXPENSE'),   total: byType('EXPENSE').reduce((s, a) => s + a.balance, 0) },
    };
  }

  async getJournalEntries(tenantId: string, query: PaginationDto) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const [data, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where: { tenantId }, skip, take,
        include: { lines: { include: { debitAccount: { select: { name: true, code: true } }, creditAccount: { select: { name: true, code: true } } } } },
        orderBy: { date: 'desc' },
      }),
      this.prisma.journalEntry.count({ where: { tenantId } }),
    ]);
    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async createJournalEntry(tenantId: string, branchId: string, userId: string, dto: CreateJournalEntryDto) {
    const entryNumber = `JE-${Date.now().toString(36).toUpperCase()}`;
    return this.prisma.journalEntry.create({
      data: {
        tenantId, branchId, entryNumber,
        description: dto.description,
        date: new Date(dto.date),
        referenceId: dto.referenceId,
        referenceType: dto.referenceType,
        createdBy: userId,
        isPosted: true,
        lines: {
          create: dto.lines.flatMap((line) => [
            { debitAccountId: line.debitAccountId, type: JournalEntryType.DEBIT,  amount: line.amount, description: line.description },
            { creditAccountId: line.creditAccountId, type: JournalEntryType.CREDIT, amount: line.amount, description: line.description },
          ]),
        },
      },
      include: { lines: true },
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

  @Put('expenses/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update expense' })
  updateExpense(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.accountingService.updateExpense(id, user.tenantId, dto);
  }

  @Delete('expenses/:id')
  @RequirePermissions('accounting:delete')
  @ApiOperation({ summary: 'Delete expense' })
  deleteExpense(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.deleteExpense(id, user.tenantId);
  }

  @Get('expenses/summary')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Expense summary by category' })
  getExpenseSummary(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.accountingService.getExpenseSummary(user.tenantId, start ?? dayjs().startOf('month').format('YYYY-MM-DD'), end ?? dayjs().endOf('month').format('YYYY-MM-DD'));
  }

  @Get('monthly-pl')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Monthly P&L for last N months' })
  getMonthlyPL(@CurrentUser() user: IAuthUser, @Query('months') months: string) {
    return this.accountingService.getMonthlyPL(user.tenantId, months ? parseInt(months) : 6);
  }

  @Get('cash-flow')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Cash flow for date range' })
  getCashFlow(@CurrentUser() user: IAuthUser, @Query('startDate') start: string, @Query('endDate') end: string) {
    return this.accountingService.getCashFlow(user.tenantId, start ?? dayjs().subtract(30, 'day').format('YYYY-MM-DD'), end ?? dayjs().format('YYYY-MM-DD'));
  }

  @Get('balance-sheet')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Balance sheet' })
  getBalanceSheet(@CurrentUser() user: IAuthUser) {
    return this.accountingService.getBalanceSheet(user.tenantId);
  }

  @Get('journal-entries')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List journal entries' })
  getJournalEntries(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto) {
    return this.accountingService.getJournalEntries(user.tenantId, query);
  }

  @Post('journal-entries')
  @RequirePermissions('accounting:create')
  @ApiOperation({ summary: 'Create journal entry' })
  createJournalEntry(@CurrentUser() user: IAuthUser, @Body() dto: CreateJournalEntryDto) {
    return this.accountingService.createJournalEntry(user.tenantId, user.branchId ?? '', user.id, dto);
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
