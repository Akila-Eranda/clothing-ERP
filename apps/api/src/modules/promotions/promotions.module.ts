import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { IsString, IsOptional, IsEnum, IsNumber, IsBoolean, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DiscountType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';

// ── DTOs ─────────────────────────────────────────────────────────────────────

export class CreatePromotionDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiProperty({ enum: DiscountType }) @IsEnum(DiscountType) discountType: DiscountType;
  @ApiProperty() @IsNumber() @Min(0) discountValue: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) perCustomerLimit?: number;
  @ApiProperty() @IsDateString() startsAt: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() couponCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applicableTo?: string;
}

export class UpdatePromotionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) discountValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) maxDiscount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) usageLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(1) perCustomerLimit?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() applicableTo?: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreatePromotionDto) {
    if (dto.couponCode) {
      const existing = await this.prisma.promotion.findFirst({
        where: { tenantId, couponCode: dto.couponCode.toUpperCase() },
      });
      if (existing) throw new ConflictException(`Coupon code "${dto.couponCode}" already exists`);
    }

    return this.prisma.promotion.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        discountType: dto.discountType,
        discountValue: dto.discountValue,
        minOrderAmount: dto.minOrderAmount ?? 0,
        maxDiscount: dto.maxDiscount,
        usageLimit: dto.usageLimit,
        perCustomerLimit: dto.perCustomerLimit,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        couponCode: dto.couponCode ? dto.couponCode.toUpperCase() : null,
        applicableTo: dto.applicableTo ?? 'ALL',
        isActive: true,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.promotion.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const promo = await this.prisma.promotion.findFirst({ where: { id, tenantId } });
    if (!promo) throw new NotFoundException('Promotion not found');
    return promo;
  }

  async update(id: string, tenantId: string, dto: UpdatePromotionDto) {
    await this.findOne(id, tenantId);
    return this.prisma.promotion.update({
      where: { id },
      data: {
        ...dto,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
      },
    });
  }

  async toggle(id: string, tenantId: string) {
    const promo = await this.findOne(id, tenantId);
    return this.prisma.promotion.update({
      where: { id },
      data: { isActive: !promo.isActive },
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.promotion.delete({ where: { id } });
  }

  async validate(couponCode: string, tenantId: string, orderAmount: number) {
    const now = new Date();
    const promo = await this.prisma.promotion.findFirst({
      where: {
        tenantId,
        couponCode: couponCode.toUpperCase(),
        isActive: true,
        startsAt: { lte: now },
        OR: [{ endsAt: null }, { endsAt: { gte: now } }],
      },
    });
    if (!promo) return { valid: false, reason: 'Coupon not found or expired' };
    if (promo.minOrderAmount > 0 && orderAmount < promo.minOrderAmount)
      return { valid: false, reason: `Minimum order LKR ${promo.minOrderAmount} required` };
    if (promo.usageLimit && promo.usageCount >= promo.usageLimit)
      return { valid: false, reason: 'Coupon usage limit reached' };

    let discountAmount = 0;
    if (promo.discountType === DiscountType.PERCENTAGE) {
      discountAmount = (orderAmount * promo.discountValue) / 100;
      if (promo.maxDiscount) discountAmount = Math.min(discountAmount, promo.maxDiscount);
    } else if (promo.discountType === DiscountType.FIXED) {
      discountAmount = promo.discountValue;
    }

    return { valid: true, promo, discountAmount };
  }
}

// ── Controller ────────────────────────────────────────────────────────────────

@ApiTags('Promotions')
@ApiBearerAuth('access-token')
@Controller({ path: 'promotions', version: '1' })
export class PromotionsController {
  constructor(private readonly promotionsService: PromotionsService) {}

  @Post()
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Create promotion / coupon' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(user.tenantId, dto);
  }

  @Get()
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List all promotions' })
  findAll(@CurrentUser() user: IAuthUser) {
    return this.promotionsService.findAll(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Get promotion by ID' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.promotionsService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Update promotion' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, user.tenantId, dto);
  }

  @Patch(':id/toggle')
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Toggle promotion active status' })
  toggle(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.promotionsService.toggle(id, user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles(RoleType.SUPER_ADMIN, RoleType.TENANT_ADMIN)
  @ApiOperation({ summary: 'Delete promotion' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.promotionsService.remove(id, user.tenantId);
  }

  @Get('validate/:code')
  @ApiOperation({ summary: 'Validate a coupon code' })
  validate(
    @CurrentUser() user: IAuthUser,
    @Param('code') code: string,
    @Query('amount') amount: string,
  ) {
    return this.promotionsService.validate(code, user.tenantId, parseFloat(amount) || 0);
  }
}

// ── Module ────────────────────────────────────────────────────────────────────

@Module({
  controllers: [PromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
