import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsDateString, IsArray, Min, IsInt, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerTier, Gender, NotificationChannel, CreditReminderStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import * as dayjs from 'dayjs';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { assertShopModule } from '@/shared/shop-module.helper';
import { CustomerCreditService } from './customer-credit.service';

export class CreateCustomerDto {
  @ApiProperty() @IsString() firstName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() lastName?: string;
  @ApiProperty() @IsString() phone: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
  @ApiPropertyOptional({ enum: Gender }) @IsOptional() @IsEnum(Gender) gender?: Gender;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dateOfBirth?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() anniversary?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) creditLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) creditDays?: number;
}

export class CreateCreditScheduleDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsNumber() @Min(0.01) totalAmount: number;
  @ApiProperty() @IsInt() @Min(1) installmentCount: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) intervalDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() chargeTxnId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateCreditReminderDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() message?: string;
  @ApiPropertyOptional({ enum: NotificationChannel }) @IsOptional() @IsEnum(NotificationChannel) channel?: NotificationChannel;
  @ApiPropertyOptional() @IsOptional() @IsString() chargeTxnId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() dueDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() sendNow?: boolean;
}

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credit: CustomerCreditService,
  ) {}

  async create(tenantId: string, dto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findFirst({ where: { tenantId, phone: dto.phone } });
    if (existing) return existing;

    const code = `CUST-${Date.now().toString(36).toUpperCase()}`;
    const referralCode = `REF${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    return this.prisma.customer.create({
      data: {
        tenantId, code, referralCode,
        firstName: dto.firstName, lastName: dto.lastName,
        phone: dto.phone, email: dto.email,
        gender: dto.gender,
        dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
        anniversary: dto.anniversary ? new Date(dto.anniversary) : undefined,
        address: dto.address, city: dto.city,
        notes: dto.notes, tags: dto.tags ?? [],
        creditLimit: dto.creditLimit ?? 0,
        creditDays: dto.creditDays ?? 30,
      },
    });
  }

  async findAll(tenantId: string, query: PaginationDto & { tier?: CustomerTier }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.tier && { tier: query.tier }),
      ...(query.search && {
        OR: [
          { firstName: { contains: query.search, mode: 'insensitive' as const } },
          { lastName: { contains: query.search, mode: 'insensitive' as const } },
          { phone: { contains: query.search } },
          { email: { contains: query.search, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({ where, skip, take, orderBy: { totalSpent: 'desc' } }),
      this.prisma.customer.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        loyaltyTxns: { orderBy: { createdAt: 'desc' }, take: 10 },
        walletTxns: { orderBy: { createdAt: 'desc' }, take: 10 },
        creditTxns: { orderBy: { createdAt: 'desc' }, take: 20 },
        sales: { orderBy: { invoiceDate: 'desc' }, take: 10, include: { _count: { select: { items: true } } } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async findByPhone(phone: string, tenantId: string) {
    return this.prisma.customer.findFirst({ where: { phone, tenantId } });
  }

  async update(id: string, tenantId: string, dto: Partial<CreateCustomerDto>) {
    await this.findOne(id, tenantId);
    const data: Record<string, unknown> = { ...dto };
    if (dto.creditLimit !== undefined && dto.creditLimit < 0) {
      throw new BadRequestException('Credit limit cannot be negative');
    }
    return this.prisma.customer.update({ where: { id }, data: data as object });
  }

  async receiveCreditPayment(id: string, tenantId: string, amount: number, description: string) {
    return this.credit.receiveCreditPayment(id, tenantId, amount, description);
  }

  async setCreditLimit(id: string, tenantId: string, creditLimit: number) {
    if (creditLimit < 0) throw new BadRequestException('Credit limit cannot be negative');
    const customer = await this.findOne(id, tenantId);
    if (creditLimit < customer.creditBalance) {
      throw new BadRequestException('Credit limit cannot be less than outstanding balance');
    }
    return this.prisma.customer.update({ where: { id }, data: { creditLimit } });
  }

  async setCreditDays(id: string, tenantId: string, creditDays: number) {
    if (creditDays < 0) throw new BadRequestException('creditDays cannot be negative');
    await this.findOne(id, tenantId);
    return this.prisma.customer.update({
      where: { id },
      data: { creditDays: Math.floor(creditDays) },
    });
  }

  async topUpWallet(id: string, tenantId: string, amount: number, description: string) {
    const customer = await this.findOne(id, tenantId);
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id }, data: { walletBalance: { increment: amount } } }),
      this.prisma.walletTransaction.create({
        data: { customerId: id, tenantId, amount, type: 'TOPUP', description },
      }),
    ]);
    return { walletBalance: customer.walletBalance + amount };
  }

  async addLoyaltyPoints(id: string, tenantId: string, points: number, description: string) {
    await assertShopModule(this.prisma, tenantId, 'loyalty');
    return this.prisma.$transaction([
      this.prisma.customer.update({ where: { id }, data: { loyaltyPoints: { increment: points } } }),
      this.prisma.loyaltyTransaction.create({
        data: { customerId: id, tenantId, points, type: 'MANUAL', description },
      }),
    ]);
  }

  async updateTier(tenantId: string) {
    const customers = await this.prisma.customer.findMany({ where: { tenantId } });
    for (const customer of customers) {
      let tier: CustomerTier = CustomerTier.BRONZE;
      if (customer.totalSpent >= 500000) tier = CustomerTier.DIAMOND;
      else if (customer.totalSpent >= 200000) tier = CustomerTier.PLATINUM;
      else if (customer.totalSpent >= 100000) tier = CustomerTier.GOLD;
      else if (customer.totalSpent >= 25000) tier = CustomerTier.SILVER;
      if (customer.tier !== tier) {
        await this.prisma.customer.update({ where: { id: customer.id }, data: { tier } });
      }
    }
  }

  async getSegments(tenantId: string) {
    const thirtyDaysAgo = dayjs().subtract(30, 'day').toDate();
    const ninetyDaysAgo = dayjs().subtract(90, 'day').toDate();

    const [tiers, highValue, dormant, newCustomers, creditOwing, totalCustomers] = await Promise.all([
      this.prisma.customer.groupBy({
        by: ['tier'],
        where: { tenantId },
        _count: { id: true },
        _sum: { totalSpent: true, loyaltyPoints: true },
      }),
      this.prisma.customer.count({ where: { tenantId, totalSpent: { gte: 100000 } } }),
      this.prisma.customer.count({
        where: {
          tenantId,
          OR: [
            { lastPurchaseAt: { lt: ninetyDaysAgo } },
            { lastPurchaseAt: null, createdAt: { lt: ninetyDaysAgo } },
          ],
        },
      }),
      this.prisma.customer.count({ where: { tenantId, createdAt: { gte: thirtyDaysAgo } } }),
      this.prisma.customer.count({ where: { tenantId, creditBalance: { gt: 0 } } }),
      this.prisma.customer.count({ where: { tenantId } }),
    ]);

    const activeRecent = totalCustomers - dormant;

    return {
      tiers,
      segments: [
        { key: 'HIGH_VALUE', label: 'High Value (100k+)', count: highValue },
        { key: 'ACTIVE', label: 'Active (90d)', count: activeRecent },
        { key: 'DORMANT', label: 'Dormant (90d+)', count: dormant },
        { key: 'NEW', label: 'New (30d)', count: newCustomers },
        { key: 'CREDIT', label: 'Credit Outstanding', count: creditOwing },
      ],
      totalCustomers,
    };
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.customer.delete({ where: { id } });
  }
}

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@Controller({ path: 'customers', version: '1' })
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly creditService: CustomerCreditService,
  ) {}

  @Post()
  @RequirePermissions('customers:create')
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(user.tenantId, dto);
  }

  @Get()
  @RequirePermissions('customers:read')
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { tier?: CustomerTier }) {
    return this.customersService.findAll(user.tenantId, query);
  }

  @Get('segments')
  @RequirePermissions('customers:read')
  getSegments(@CurrentUser() user: IAuthUser) {
    return this.customersService.getSegments(user.tenantId);
  }

  @Get('credit/customers')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List credit customers with due dates' })
  listCreditCustomers(@CurrentUser() user: IAuthUser) {
    return this.creditService.listCreditCustomers(user.tenantId);
  }

  @Get('credit/schedules')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List payment schedules' })
  listSchedules(@CurrentUser() user: IAuthUser, @Query('customerId') customerId?: string) {
    return this.creditService.listSchedules(user.tenantId, customerId);
  }

  @Post('credit/schedules')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Create installment payment schedule' })
  createSchedule(@CurrentUser() user: IAuthUser, @Body() dto: CreateCreditScheduleDto) {
    return this.creditService.createPaymentSchedule(user.tenantId, user.id, dto);
  }

  @Get('credit/reminders')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'List credit payment reminders' })
  listReminders(@CurrentUser() user: IAuthUser, @Query('status') status?: CreditReminderStatus) {
    return this.creditService.listReminders(user.tenantId, status);
  }

  @Post('credit/reminders')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Create / send credit reminder' })
  createReminder(@CurrentUser() user: IAuthUser, @Body() dto: CreateCreditReminderDto) {
    return this.creditService.createReminder(user.tenantId, user.id, dto);
  }

  @Post('credit/reminders/queue-overdue')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Queue reminders for all overdue credit customers' })
  queueOverdue(@CurrentUser() user: IAuthUser) {
    return this.creditService.queueOverdueReminders(user.tenantId, user.id);
  }

  @Post('credit/reminders/:id/send')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Send a pending credit reminder' })
  sendReminder(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.creditService.sendReminder(id, user.tenantId, user.id);
  }

  @Get('credit/collection-report')
  @RequirePermissions('customers:read')
  @ApiOperation({ summary: 'Collection report for date range' })
  collectionReport(
    @CurrentUser() user: IAuthUser,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const start = startDate ?? dayjs().startOf('month').format('YYYY-MM-DD');
    const end = endDate ?? dayjs().format('YYYY-MM-DD');
    return this.creditService.collectionReport(user.tenantId, start, end);
  }

  @Get('phone/:phone')
  @ApiOperation({ summary: 'Find customer by phone (POS lookup)' })
  findByPhone(@CurrentUser() user: IAuthUser, @Param('phone') phone: string) {
    return this.customersService.findByPhone(phone, user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('customers:read')
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.customersService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @RequirePermissions('customers:update')
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<CreateCustomerDto>) {
    return this.customersService.update(id, user.tenantId, dto);
  }

  @Post(':id/wallet/topup')
  @RequirePermissions('customers:update')
  topUpWallet(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: { amount: number; description?: string }) {
    return this.customersService.topUpWallet(id, user.tenantId, body.amount, body.description ?? 'Manual top-up');
  }

  @Post(':id/loyalty/add')
  @RequirePermissions('customers:update')
  addLoyaltyPoints(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: { points: number; description?: string }) {
    return this.customersService.addLoyaltyPoints(id, user.tenantId, body.points, body.description ?? 'Manual adjustment');
  }

  @Post(':id/credit/payment')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Receive payment against customer credit balance' })
  receiveCreditPayment(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() body: { amount: number; description?: string },
  ) {
    return this.customersService.receiveCreditPayment(id, user.tenantId, body.amount, body.description ?? 'Credit payment received');
  }

  @Put(':id/credit/limit')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Set customer credit limit' })
  setCreditLimit(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: { creditLimit: number }) {
    return this.customersService.setCreditLimit(id, user.tenantId, body.creditLimit);
  }

  @Put(':id/credit/days')
  @RequirePermissions('customers:update')
  @ApiOperation({ summary: 'Set customer credit payment terms (days)' })
  setCreditDays(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: { creditDays: number }) {
    return this.customersService.setCreditDays(id, user.tenantId, body.creditDays);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('customers:delete')
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.customersService.remove(id, user.tenantId);
  }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService, CustomerCreditService],
  exports: [CustomersService, CustomerCreditService],
})
export class CustomersModule {}
