import { Module, NotFoundException } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, BadRequestException } from '@nestjs/common';
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

  private static readonly SETTLED_RETURN_STATUSES = ['APPROVED', 'COMPLETED', 'REFUND_PROCESSED'] as const;

  private balanceDelta(type: AccountType, amount: number, isDebit: boolean): number {
    const debitNormal = type === AccountType.ASSET || type === AccountType.EXPENSE;
    if (isDebit) return debitNormal ? amount : -amount;
    return debitNormal ? -amount : amount;
  }

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
    const saleWhere = { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' as const } };

    const [revenue, expenses, returns, saleItems] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({
        where: saleWhere,
        _sum: { total: true, taxAmount: true, discountAmount: true },
        _count: { _all: true },
      }),
      this.prisma.expense.aggregate({
        where: { tenantId, date: dateRange },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      this.prisma.return.aggregate({
        where: {
          tenantId,
          createdAt: dateRange,
          status: { in: [...AccountingService.SETTLED_RETURN_STATUSES] },
        },
        _sum: { refundAmount: true },
      }),
      this.prisma.saleItem.findMany({
        where: { sale: saleWhere },
        select: { quantity: true, costPrice: true },
      }),
    ]);

    const grossRevenue = revenue._sum?.total ?? 0;
    const totalExpenses = expenses._sum?.amount ?? 0;
    const totalReturns = returns._sum?.refundAmount ?? 0;
    const costOfGoodsSold = saleItems.reduce((s, i) => s + i.costPrice * i.quantity, 0);
    const netRevenue = grossRevenue - totalReturns;
    const grossProfit = netRevenue - costOfGoodsSold;
    const netProfit = grossProfit - totalExpenses;

    return {
      period: { startDate, endDate },
      revenue: { gross: grossRevenue, returns: totalReturns, net: netRevenue },
      costOfGoodsSold,
      grossProfit,
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
        this.prisma.return.aggregate({
          where: {
            tenantId,
            createdAt: { gte: start, lte: end },
            status: { in: [...AccountingService.SETTLED_RETURN_STATUSES] },
          },
          _sum: { refundAmount: true },
        }),
      ]);
      const revenue  = (rev._sum?.total ?? 0) - (ret._sum?.refundAmount ?? 0);
      const expenses = exp._sum?.amount ?? 0;
      result.push({ month: label, revenue, expenses, profit: revenue - expenses });
    }
    return result;
  }

  async getCashFlow(tenantId: string, startDate: string, endDate: string) {
    const dateRange = { gte: dayjs(startDate).startOf('day').toDate(), lte: dayjs(endDate).endOf('day').toDate() };
    const [payments, creditPayments, expenses, refunds] = await Promise.all([
      this.prisma.salePayment.findMany({
        where: {
          sale: { tenantId, invoiceDate: dateRange, status: { not: 'CANCELLED' } },
          method: { not: PaymentMethod.CUSTOMER_CREDIT },
        },
        select: { amount: true, sale: { select: { invoiceDate: true } } },
      }),
      this.prisma.customerCreditTransaction.findMany({
        where: {
          tenantId,
          type: 'PAYMENT',
          createdAt: dateRange,
        },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.expense.findMany({ where: { tenantId, date: dateRange }, select: { amount: true, date: true } }),
      this.prisma.return.findMany({
        where: {
          tenantId,
          createdAt: dateRange,
          status: { in: [...AccountingService.SETTLED_RETURN_STATUSES] },
        },
        select: { refundAmount: true, createdAt: true },
      }),
    ]);
    const map: Record<string, { date: string; inflow: number; outflow: number }> = {};
    const bump = (key: string, field: 'inflow' | 'outflow', amt: number) => {
      if (!map[key]) map[key] = { date: key, inflow: 0, outflow: 0 };
      map[key][field] += amt;
    };
    for (const p of payments) {
      bump(dayjs(p.sale.invoiceDate).format('YYYY-MM-DD'), 'inflow', p.amount);
    }
    for (const cp of creditPayments) {
      bump(dayjs(cp.createdAt).format('YYYY-MM-DD'), 'inflow', cp.amount);
    }
    for (const e of expenses) {
      bump(dayjs(e.date).format('YYYY-MM-DD'), 'outflow', e.amount);
    }
    for (const r of refunds) {
      bump(dayjs(r.createdAt).format('YYYY-MM-DD'), 'outflow', r.refundAmount);
    }
    const data = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
    const totalInflow = payments.reduce((s, p) => s + p.amount, 0)
      + creditPayments.reduce((s, c) => s + c.amount, 0);
    const totalOutflow = expenses.reduce((s, e) => s + e.amount, 0)
      + refunds.reduce((s, r) => s + r.refundAmount, 0);
    return { data, totalInflow, totalOutflow };
  }

  async getBalanceSheet(tenantId: string) {
    const [salesAgg, expAgg, refundAgg, accounts, arAgg, purchaseOrders] = await this.prisma.$transaction([
      this.prisma.sale.aggregate({ where: { tenantId, status: { not: 'CANCELLED' } }, _sum: { total: true } }),
      this.prisma.expense.aggregate({ where: { tenantId }, _sum: { amount: true } }),
      this.prisma.return.aggregate({
        where: { tenantId, status: { in: [...AccountingService.SETTLED_RETURN_STATUSES] } },
        _sum: { refundAmount: true },
      }),
      this.prisma.account.findMany({ where: { tenantId, isActive: true }, select: { id: true, code: true, name: true, type: true, balance: true } }),
      this.prisma.customer.aggregate({ where: { tenantId, creditBalance: { gt: 0 } }, _sum: { creditBalance: true } }),
      this.prisma.purchaseOrder.findMany({
        where: { tenantId, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED', 'CONFIRMED', 'SENT'] } },
        select: { total: true, paidAmount: true },
      }),
    ]);
    const netSales = (salesAgg._sum?.total ?? 0) - (refundAgg._sum?.refundAmount ?? 0);
    const expenses = expAgg._sum?.amount ?? 0;
    const retained = netSales - expenses;
    const accountsReceivable = arAgg._sum?.creditBalance ?? 0;
    const accountsPayable = purchaseOrders.reduce(
      (s, po) => s + Math.max(0, po.total - po.paidAmount),
      0,
    );
    const byType = (t: AccountType) => accounts.filter((a) => a.type === t);
    const assetTotal = byType(AccountType.ASSET).reduce((s, a) => s + a.balance, 0);
    const liabilityTotal = byType(AccountType.LIABILITY).reduce((s, a) => s + a.balance, 0) + accountsPayable;
    const equityTotal = byType(AccountType.EQUITY).reduce((s, a) => s + a.balance, 0) + retained;
    return {
      assets: {
        accounts: byType(AccountType.ASSET),
        accountsReceivable,
        total: assetTotal + accountsReceivable,
      },
      liabilities: {
        accounts: byType(AccountType.LIABILITY),
        accountsPayable,
        total: liabilityTotal,
      },
      equity: {
        accounts: byType(AccountType.EQUITY),
        retainedEarnings: retained,
        total: equityTotal,
      },
      revenue: { accounts: byType(AccountType.REVENUE), total: byType(AccountType.REVENUE).reduce((s, a) => s + a.balance, 0) },
      expenseAcct: { accounts: byType(AccountType.EXPENSE), total: byType(AccountType.EXPENSE).reduce((s, a) => s + a.balance, 0) },
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

    return this.prisma.$transaction(async (tx) => {
      for (const line of dto.lines) {
        const [debitAcct, creditAcct] = await Promise.all([
          tx.account.findFirst({ where: { id: line.debitAccountId, tenantId, isActive: true } }),
          tx.account.findFirst({ where: { id: line.creditAccountId, tenantId, isActive: true } }),
        ]);
        if (!debitAcct || !creditAcct) {
          throw new BadRequestException('Invalid debit or credit account');
        }
        if (line.amount <= 0) {
          throw new BadRequestException('Journal line amount must be positive');
        }
      }

      const entry = await tx.journalEntry.create({
        data: {
          tenantId,
          branchId,
          entryNumber,
          description: dto.description,
          date: new Date(dto.date),
          referenceId: dto.referenceId,
          referenceType: dto.referenceType,
          createdBy: userId,
          isPosted: true,
          lines: {
            create: dto.lines.flatMap((line) => [
              { debitAccountId: line.debitAccountId, type: JournalEntryType.DEBIT, amount: line.amount, description: line.description },
              { creditAccountId: line.creditAccountId, type: JournalEntryType.CREDIT, amount: line.amount, description: line.description },
            ]),
          },
        },
        include: { lines: true },
      });

      for (const line of dto.lines) {
        const [debitAcct, creditAcct] = await Promise.all([
          tx.account.findFirst({ where: { id: line.debitAccountId, tenantId } }),
          tx.account.findFirst({ where: { id: line.creditAccountId, tenantId } }),
        ]);
        if (!debitAcct || !creditAcct) continue;
        await tx.account.update({
          where: { id: debitAcct.id },
          data: { balance: { increment: this.balanceDelta(debitAcct.type, line.amount, true) } },
        });
        await tx.account.update({
          where: { id: creditAcct.id },
          data: { balance: { increment: this.balanceDelta(creditAcct.type, line.amount, false) } },
        });
      }

      return entry;
    });
  }

  async updateAccount(id: string, tenantId: string, dto: Partial<CreateAccountDto>) {
    const account = await this.prisma.account.findFirst({ where: { id, tenantId } });
    if (!account) throw new NotFoundException('Account not found');
    return this.prisma.account.update({
      where: { id },
      data: {
        ...(dto.code && { code: dto.code }),
        ...(dto.name && { name: dto.name }),
        ...(dto.type && { type: dto.type }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.parentId !== undefined && { parentId: dto.parentId }),
      },
    });
  }

  async deleteAccount(id: string, tenantId: string) {
    const account = await this.prisma.account.findFirst({ where: { id, tenantId } });
    if (!account) throw new NotFoundException('Account not found');
    const lineCount = await this.prisma.journalLine.count({
      where: { OR: [{ debitAccountId: id }, { creditAccountId: id }] },
    });
    if (lineCount > 0) {
      throw new BadRequestException('Cannot delete an account that has journal entries');
    }
    return this.prisma.account.update({ where: { id }, data: { isActive: false } });
  }

  async getAccountsReceivable(tenantId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { tenantId, creditBalance: { gt: 0 } },
      select: {
        id: true, code: true, firstName: true, lastName: true, phone: true,
        creditBalance: true, creditLimit: true, lastPurchaseAt: true,
      },
      orderBy: { creditBalance: 'desc' },
    });
    const total = customers.reduce((s, c) => s + c.creditBalance, 0);
    return { total, count: customers.length, customers };
  }

  async getAccountsPayable(tenantId: string) {
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: { tenantId, status: { in: ['RECEIVED', 'PARTIALLY_RECEIVED', 'CONFIRMED', 'SENT'] } },
      select: {
        id: true, poNumber: true, total: true, paidAmount: true, orderDate: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { orderDate: 'desc' },
    });
    const unpaidPos = purchaseOrders
      .map((po) => ({ ...po, balanceDue: Math.max(0, po.total - po.paidAmount) }))
      .filter((po) => po.balanceDue > 0.01);
    const poTotal = unpaidPos.reduce((s, po) => s + po.balanceDue, 0);
    const supplierMap = new Map<string, { id: string; name: string; balance: number }>();
    for (const po of unpaidPos) {
      const cur = supplierMap.get(po.supplier.id) ?? { id: po.supplier.id, name: po.supplier.name, balance: 0 };
      cur.balance += po.balanceDue;
      supplierMap.set(po.supplier.id, cur);
    }
    return {
      total: poTotal,
      supplierBalanceTotal: 0,
      purchaseOrderDueTotal: poTotal,
      suppliers: [...supplierMap.values()].sort((a, b) => b.balance - a.balance),
      unpaidPurchaseOrders: unpaidPos,
    };
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

  @Put('accounts/:id')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update account' })
  updateAccount(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: CreateAccountDto) {
    return this.accountingService.updateAccount(id, user.tenantId, dto);
  }

  @Delete('accounts/:id')
  @RequirePermissions('accounting:delete')
  @ApiOperation({ summary: 'Deactivate account' })
  deleteAccount(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.accountingService.deleteAccount(id, user.tenantId);
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

  @Get('accounts-receivable')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Customer credit outstanding (AR)' })
  getAccountsReceivable(@CurrentUser() user: IAuthUser) {
    return this.accountingService.getAccountsReceivable(user.tenantId);
  }

  @Get('accounts-payable')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'Supplier balances and unpaid POs (AP)' })
  getAccountsPayable(@CurrentUser() user: IAuthUser) {
    return this.accountingService.getAccountsPayable(user.tenantId);
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
