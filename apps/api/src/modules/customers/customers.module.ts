import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsDateString, IsArray, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerTier, Gender } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import * as dayjs from 'dayjs';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { assertShopModule } from '@/shared/shop-module.helper';

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
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (amount <= 0) throw new BadRequestException('Amount must be positive');
    const customer = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (amount > customer.creditBalance + 0.01) {
      throw new BadRequestException(`Payment exceeds outstanding balance (LKR ${customer.creditBalance.toFixed(2)})`);
    }
    await this.prisma.$transaction([
      this.prisma.customer.update({ where: { id }, data: { creditBalance: { decrement: amount } } }),
      this.prisma.customerCreditTransaction.create({
        data: { customerId: id, tenantId, amount, type: 'PAYMENT', description },
      }),
    ]);
    return { creditBalance: customer.creditBalance - amount, creditLimit: customer.creditLimit };
  }

  async setCreditLimit(id: string, tenantId: string, creditLimit: number) {
    if (creditLimit < 0) throw new BadRequestException('Credit limit cannot be negative');
    const customer = await this.findOne(id, tenantId);
    if (creditLimit < customer.creditBalance) {
      throw new BadRequestException('Credit limit cannot be less than outstanding balance');
    }
    return this.prisma.customer.update({ where: { id }, data: { creditLimit } });
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
  constructor(private readonly customersService: CustomersService) {}

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

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('customers:delete')
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.customersService.remove(id, user.tenantId);
  }
}

@Module({
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
