import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IsString, IsOptional, IsInt, IsNumber, IsArray, IsEnum, Min, IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuotationStatus, SaleStatus, WarrantyClaimStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { assertShopModule } from '@/shared/shop-module.helper';
import {
  isWarrantyEligible,
  isWithinWarrantyPeriod,
} from '@/shared/warranty.helper';
import { nanoid } from 'nanoid';

// ── DTOs ────────────────────────────────────────────────────────────────────

export class CreateVehicleBrandDto {
  @ApiProperty() @IsString() name: string;
}

export class CreateVehicleModelDto {
  @ApiProperty() @IsString() brandId: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() yearFrom?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() yearTo?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() engineCapacity?: string;
}

export class CreateCompatibilityDto {
  @ApiProperty() @IsString() vehicleModelId: string;
  @ApiProperty() @IsString() variantId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CreateCustomerVehicleDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleModelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() make?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() year?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() engineCapacity?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() registrationNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() chassisNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPrimary?: boolean;
}

export class CreateWarrantyClaimDto {
  @ApiProperty() @IsString() customerId: string;
  @ApiProperty() @IsString() variantId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() saleId?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) warrantyMonths?: number;
  @ApiProperty() @IsString() purchaseDate: string;
  @ApiProperty() @IsString() issueDescription: string;
}

export class UpdateWarrantyClaimDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(WarrantyClaimStatus) status?: WarrantyClaimStatus;
  @ApiPropertyOptional() @IsOptional() @IsString() resolution?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() replacementVariantId?: string;
}

export class QuotationItemDto {
  @ApiProperty() @IsString() variantId: string;
  @ApiProperty() @IsInt() @Min(1) quantity: number;
  @ApiProperty() @IsNumber() @Min(0) unitPrice: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() discount?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
}

export class CreateQuotationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() validUntil?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty({ type: [QuotationItemDto] }) @IsArray() items: QuotationItemDto[];
}

@Injectable()
export class SparePartsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertModule(tenantId: string, mod: 'vehicles' | 'warranty' | 'quotations') {
    await assertShopModule(this.prisma, tenantId, mod);
  }

  // ── Vehicle brands & models ───────────────────────────────────────────────

  async listBrands(tenantId: string) {
    return this.prisma.vehicleBrand.findMany({
      where: { tenantId, isActive: true },
      include: { _count: { select: { models: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createBrand(tenantId: string, dto: CreateVehicleBrandDto) {
    await this.assertModule(tenantId, 'vehicles');
    return this.prisma.vehicleBrand.create({
      data: { tenantId, name: dto.name.trim() },
    });
  }

  async listModels(tenantId: string, brandId?: string) {
    return this.prisma.vehicleModel.findMany({
      where: { tenantId, isActive: true, ...(brandId && { brandId }) },
      include: { brand: true, _count: { select: { compatibilities: true } } },
      orderBy: [{ brand: { name: 'asc' } }, { name: 'asc' }],
    });
  }

  async createModel(tenantId: string, dto: CreateVehicleModelDto) {
    await this.assertModule(tenantId, 'vehicles');
    const brand = await this.prisma.vehicleBrand.findFirst({ where: { id: dto.brandId, tenantId } });
    if (!brand) throw new NotFoundException('Vehicle brand not found');
    return this.prisma.vehicleModel.create({
      data: {
        tenantId,
        brandId: dto.brandId,
        name: dto.name.trim(),
        yearFrom: dto.yearFrom,
        yearTo: dto.yearTo,
        engineCapacity: dto.engineCapacity,
      },
      include: { brand: true },
    });
  }

  async searchCompatibleParts(tenantId: string, query: {
    brandId?: string; modelId?: string; year?: number; search?: string; vin?: string;
  }) {
    await this.assertModule(tenantId, 'vehicles');

    if (query.vin) {
      const vehicle = await this.prisma.customerVehicle.findFirst({
        where: {
          tenantId,
          vin: { contains: query.vin, mode: 'insensitive' as const },
        },
        include: { vehicleModel: { include: { brand: true } } },
      });
      if (vehicle?.vehicleModelId) query.modelId = vehicle.vehicleModelId;
    }

    const modelWhere: Record<string, unknown> = { tenantId, isActive: true };
    if (query.modelId) modelWhere.id = query.modelId;
    if (query.brandId) modelWhere.brandId = query.brandId;
    if (query.year) {
      modelWhere.OR = [
        { yearFrom: null, yearTo: null },
        { yearFrom: { lte: query.year }, yearTo: { gte: query.year } },
        { yearFrom: { lte: query.year }, yearTo: null },
      ];
    }

    const models = await this.prisma.vehicleModel.findMany({
      where: modelWhere,
      include: { brand: true },
    });
    const modelIds = models.map((m) => m.id);
    if (!modelIds.length) return { models: [], parts: [] };

    const compatibilities = await this.prisma.partCompatibility.findMany({
      where: { tenantId, vehicleModelId: { in: modelIds } },
      include: {
        variant: { include: { product: { include: { brand: true, category: true } } } },
        vehicleModel: { include: { brand: true } },
      },
    });

    let parts = compatibilities.map((c) => ({
      compatibilityId: c.id,
      notes: c.notes,
      vehicle: `${c.vehicleModel.brand.name} ${c.vehicleModel.name}`,
      variant: c.variant,
      product: c.variant.product,
    }));

    if (query.search) {
      const q = query.search.toLowerCase();
      parts = parts.filter(
        (p) =>
          p.product.name.toLowerCase().includes(q) ||
          p.variant.sku.toLowerCase().includes(q) ||
          (p.product.oemNumber ?? '').toLowerCase().includes(q),
      );
    }

    return { models, parts };
  }

  async addCompatibility(tenantId: string, dto: CreateCompatibilityDto) {
    await this.assertModule(tenantId, 'vehicles');
    return this.prisma.partCompatibility.create({
      data: {
        tenantId,
        vehicleModelId: dto.vehicleModelId,
        variantId: dto.variantId,
        notes: dto.notes,
      },
      include: {
        variant: { include: { product: true } },
        vehicleModel: { include: { brand: true } },
      },
    });
  }

  async removeCompatibility(tenantId: string, id: string) {
    const row = await this.prisma.partCompatibility.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Compatibility mapping not found');
    await this.prisma.partCompatibility.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Customer vehicles ─────────────────────────────────────────────────────

  async listCustomerVehicles(tenantId: string, customerId: string) {
    await this.assertModule(tenantId, 'vehicles');
    return this.prisma.customerVehicle.findMany({
      where: { tenantId, customerId },
      include: { vehicleModel: { include: { brand: true } } },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createCustomerVehicle(tenantId: string, dto: CreateCustomerVehicleDto) {
    await this.assertModule(tenantId, 'vehicles');
    if (dto.isPrimary) {
      await this.prisma.customerVehicle.updateMany({
        where: { tenantId, customerId: dto.customerId },
        data: { isPrimary: false },
      });
    }
    return this.prisma.customerVehicle.create({
      data: {
        tenantId,
        customerId: dto.customerId,
        vehicleModelId: dto.vehicleModelId,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        engineCapacity: dto.engineCapacity,
        registrationNo: dto.registrationNo,
        vin: dto.vin,
        chassisNo: dto.chassisNo,
        notes: dto.notes,
        isPrimary: dto.isPrimary ?? false,
      },
      include: { vehicleModel: { include: { brand: true } } },
    });
  }

  async deleteCustomerVehicle(tenantId: string, id: string) {
    const row = await this.prisma.customerVehicle.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException('Vehicle not found');
    await this.prisma.customerVehicle.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Warranty claims ───────────────────────────────────────────────────────

  async listWarrantyClaims(tenantId: string, status?: WarrantyClaimStatus) {
    await this.assertModule(tenantId, 'warranty');
    return this.prisma.warrantyClaim.findMany({
      where: { tenantId, ...(status && { status }) },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        variant: { include: { product: true } },
      },
      orderBy: { claimDate: 'desc' },
    });
  }

  async createWarrantyClaim(tenantId: string, userId: string, dto: CreateWarrantyClaimDto) {
    await this.assertModule(tenantId, 'warranty');

    let customerId = dto.customerId;
    let purchaseDate = new Date(dto.purchaseDate);

    if (dto.saleId) {
      const sale = await this.prisma.sale.findFirst({
        where: { id: dto.saleId, tenantId },
        include: { items: true },
      });
      if (!sale) throw new BadRequestException('Linked sale invoice not found');
      if (sale.status !== SaleStatus.COMPLETED) {
        throw new BadRequestException('Warranty claims can only be linked to completed sales');
      }
      const line = sale.items.find((i) => i.variantId === dto.variantId);
      if (!line) {
        throw new BadRequestException('Selected part was not on this invoice');
      }
      if (sale.customerId) {
        if (customerId && sale.customerId !== customerId) {
          throw new BadRequestException('Customer does not match the selected invoice');
        }
        customerId = sale.customerId;
      }
      purchaseDate = sale.invoiceDate;
    }

    if (!customerId) {
      throw new BadRequestException('Customer is required — link a customer to the sale or select one');
    }

    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { tenantId } },
      include: { product: { select: { name: true, warrantyMonths: true } } },
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    const productWarranty = variant.product.warrantyMonths;
    if (!isWarrantyEligible(productWarranty)) {
      throw new BadRequestException(
        `"${variant.product.name}" has no warranty coverage. Set warranty months on the product (Products → edit) before filing a claim.`,
      );
    }

    const warrantyMonths = productWarranty!;
    if (!isWithinWarrantyPeriod(purchaseDate, warrantyMonths)) {
      throw new BadRequestException(
        `Warranty period expired. Coverage was ${warrantyMonths} month(s) from purchase date ${purchaseDate.toISOString().slice(0, 10)}.`,
      );
    }

    const claimNumber = `WC-${nanoid(8).toUpperCase()}`;
    return this.prisma.warrantyClaim.create({
      data: {
        tenantId,
        customerId,
        variantId: dto.variantId,
        saleId: dto.saleId,
        claimNumber,
        warrantyMonths,
        purchaseDate,
        issueDescription: dto.issueDescription,
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        variant: { include: { product: true } },
      },
    });
  }

  async updateWarrantyClaim(tenantId: string, id: string, userId: string, dto: UpdateWarrantyClaimDto) {
    await this.assertModule(tenantId, 'warranty');
    const claim = await this.prisma.warrantyClaim.findFirst({ where: { id, tenantId } });
    if (!claim) throw new NotFoundException('Warranty claim not found');

    const resolved = dto.status === WarrantyClaimStatus.REPLACED || dto.status === WarrantyClaimStatus.CLOSED;
    return this.prisma.warrantyClaim.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        replacementVariantId: dto.replacementVariantId,
        ...(resolved && { resolvedAt: new Date(), resolvedBy: userId }),
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        variant: { include: { product: true } },
      },
    });
  }

  // ── Quotations ────────────────────────────────────────────────────────────

  async listQuotations(tenantId: string, branchId?: string) {
    await this.assertModule(tenantId, 'quotations');
    return this.prisma.quotation.findMany({
      where: { tenantId, ...(branchId && { branchId }) },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createQuotation(tenantId: string, branchId: string, userId: string, dto: CreateQuotationDto) {
    await this.assertModule(tenantId, 'quotations');
    if (!dto.items?.length) throw new BadRequestException('At least one item required');

    const quoteNumber = `QT-${nanoid(8).toUpperCase()}`;
    let subtotal = 0;
    let taxAmount = 0;
    const lineData = dto.items.map((item) => {
      const lineSub = item.quantity * item.unitPrice - (item.discount ?? 0);
      const lineTax = lineSub * ((item.taxRate ?? 0) / 100);
      subtotal += lineSub;
      taxAmount += lineTax;
      return {
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: item.discount ?? 0,
        taxRate: item.taxRate ?? 0,
        total: lineSub + lineTax,
      };
    });

    return this.prisma.quotation.create({
      data: {
        tenantId,
        branchId: branchId || undefined,
        customerId: dto.customerId,
        quoteNumber,
        subtotal,
        taxAmount,
        discountAmount: 0,
        total: subtotal + taxAmount,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
        createdBy: userId,
        items: { create: lineData },
      },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, phone: true } },
        items: { include: { variant: { include: { product: true } } } },
      },
    });
  }

  async updateQuotationStatus(tenantId: string, id: string, status: QuotationStatus) {
    await this.assertModule(tenantId, 'quotations');
    const q = await this.prisma.quotation.findFirst({ where: { id, tenantId } });
    if (!q) throw new NotFoundException('Quotation not found');
    return this.prisma.quotation.update({
      where: { id },
      data: { status },
      include: { items: { include: { variant: { include: { product: true } } } } },
    });
  }
}

@ApiTags('Spare Parts')
@ApiBearerAuth('access-token')
@Controller({ path: 'spare-parts', version: '1' })
export class SparePartsController {
  constructor(private readonly service: SparePartsService) {}

  @Get('vehicle-brands')
  @RequirePermissions('products:read')
  listBrands(@CurrentUser() user: IAuthUser) {
    return this.service.listBrands(user.tenantId);
  }

  @Post('vehicle-brands')
  @RequirePermissions('products:create')
  createBrand(@CurrentUser() user: IAuthUser, @Body() dto: CreateVehicleBrandDto) {
    return this.service.createBrand(user.tenantId, dto);
  }

  @Get('vehicle-models')
  @RequirePermissions('products:read')
  listModels(@CurrentUser() user: IAuthUser, @Query('brandId') brandId?: string) {
    return this.service.listModels(user.tenantId, brandId);
  }

  @Post('vehicle-models')
  @RequirePermissions('products:create')
  createModel(@CurrentUser() user: IAuthUser, @Body() dto: CreateVehicleModelDto) {
    return this.service.createModel(user.tenantId, dto);
  }

  @Get('compatible-parts')
  @RequirePermissions('products:read')
  searchParts(
    @CurrentUser() user: IAuthUser,
    @Query('brandId') brandId?: string,
    @Query('modelId') modelId?: string,
    @Query('year') year?: string,
    @Query('search') search?: string,
    @Query('vin') vin?: string,
  ) {
    return this.service.searchCompatibleParts(user.tenantId, {
      brandId, modelId, year: year ? parseInt(year, 10) : undefined, search, vin,
    });
  }

  @Post('compatibilities')
  @RequirePermissions('products:create')
  addCompatibility(@CurrentUser() user: IAuthUser, @Body() dto: CreateCompatibilityDto) {
    return this.service.addCompatibility(user.tenantId, dto);
  }

  @Delete('compatibilities/:id')
  @RequirePermissions('products:delete')
  removeCompatibility(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.service.removeCompatibility(user.tenantId, id);
  }

  @Get('customers/:customerId/vehicles')
  @RequirePermissions('customers:read')
  listCustomerVehicles(@CurrentUser() user: IAuthUser, @Param('customerId') customerId: string) {
    return this.service.listCustomerVehicles(user.tenantId, customerId);
  }

  @Post('customer-vehicles')
  @RequirePermissions('customers:create')
  createCustomerVehicle(@CurrentUser() user: IAuthUser, @Body() dto: CreateCustomerVehicleDto) {
    return this.service.createCustomerVehicle(user.tenantId, dto);
  }

  @Delete('customer-vehicles/:id')
  @RequirePermissions('customers:delete')
  deleteCustomerVehicle(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.service.deleteCustomerVehicle(user.tenantId, id);
  }

  @Get('warranty-claims')
  @RequirePermissions('returns:read')
  listClaims(@CurrentUser() user: IAuthUser, @Query('status') status?: WarrantyClaimStatus) {
    return this.service.listWarrantyClaims(user.tenantId, status);
  }

  @Post('warranty-claims')
  @RequirePermissions('returns:create')
  createClaim(@CurrentUser() user: IAuthUser, @Body() dto: CreateWarrantyClaimDto) {
    return this.service.createWarrantyClaim(user.tenantId, user.id, dto);
  }

  @Put('warranty-claims/:id')
  @RequirePermissions('returns:update')
  updateClaim(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateWarrantyClaimDto) {
    return this.service.updateWarrantyClaim(user.tenantId, id, user.id, dto);
  }

  @Get('quotations')
  @RequirePermissions('sales:read')
  listQuotations(@CurrentUser() user: IAuthUser) {
    return this.service.listQuotations(user.tenantId, user.branchId);
  }

  @Post('quotations')
  @RequirePermissions('sales:create')
  createQuotation(@CurrentUser() user: IAuthUser, @Body() dto: CreateQuotationDto) {
    return this.service.createQuotation(user.tenantId, user.branchId ?? '', user.id, dto);
  }

  @Put('quotations/:id/status')
  @RequirePermissions('sales:update')
  updateQuotationStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body('status') status: QuotationStatus,
  ) {
    return this.service.updateQuotationStatus(user.tenantId, id, status);
  }
}

@Module({
  controllers: [SparePartsController],
  providers: [SparePartsService],
  exports: [SparePartsService],
})
export class SparePartsModule {}
