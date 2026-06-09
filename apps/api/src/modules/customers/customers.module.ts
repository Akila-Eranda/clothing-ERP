import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsDateString, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CustomerTier, Gender } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
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
    return this.prisma.customer.update({ where: { id }, data: dto as object });
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
    return this.prisma.customer.groupBy({
      by: ['tier'],
      where: { tenantId },
      _count: { id: true },
      _sum: { totalSpent: true, loyaltyPoints: true },
    });
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
