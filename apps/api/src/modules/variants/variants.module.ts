import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, Min, IsArray, MaxLength, ValidateNested, ArrayMaxSize, IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { nanoid } from 'nanoid';

export class CreateVariantDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) size?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) material?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(60) style?: string;
  @ApiProperty() @IsNumber() @Min(0) sellingPrice: number;
  @ApiProperty() @IsNumber() @Min(0) costPrice: number;
  @ApiProperty() @IsNumber() @Min(0) mrp: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) barcode?: string;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) images?: string[];
}

export class UpdateVariantDto extends PartialType(CreateVariantDto) {}

export class BulkCreateVariantsDto {
  @ApiProperty({ type: [CreateVariantDto] })
  @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => CreateVariantDto)
  variants: CreateVariantDto[];
}

/** Fields a variant update may change (never productId, sku, sortOrder or ids). */
const VARIANT_UPDATABLE_FIELDS = [
  'name', 'size', 'color', 'material', 'style', 'sellingPrice', 'costPrice', 'mrp', 'barcode', 'images',
] as const;

@Injectable()
export class VariantsService {
  constructor(private readonly prisma: PrismaService) {}

  private generateEAN13(): string {
    const digits = [2, ...Array.from({ length: 11 }, () => Math.floor(Math.random() * 10))];
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    const check = (10 - (sum % 10)) % 10;
    return [...digits, check].join('');
  }

  async create(productId: string, tenantId: string, dto: CreateVariantDto) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Product not found');

    const sku = `${product.sku}-${nanoid(6).toUpperCase()}`;
    const existing = await this.prisma.productVariant.findFirst({ where: { productId, sku } });
    if (existing) throw new ConflictException('Variant with this name already exists');

    const barcode = dto.barcode || this.generateEAN13();

    return this.prisma.productVariant.create({
      data: {
        productId,
        name: dto.name,
        sku,
        size: dto.size,
        color: dto.color,
        material: dto.material,
        style: dto.style,
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice,
        mrp: dto.mrp,
        barcode,
        images: dto.images ?? [],
      },
    });
  }

  async findAll(productId: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.productVariant.findMany({
      where: { productId },
      include: { inventory: { take: 10 } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Tenant-scoped: the variant must belong to `productId`, and the product to `tenantId`. */
  async findOne(productId: string, id: string, tenantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id, productId, product: { tenantId } },
      include: { product: true, inventory: { where: { tenantId } } },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  async update(productId: string, id: string, tenantId: string, dto: UpdateVariantDto) {
    const variant = await this.findOne(productId, id, tenantId);
    const data: Record<string, unknown> = {};
    for (const key of VARIANT_UPDATABLE_FIELDS) {
      if (dto[key] !== undefined) data[key] = dto[key];
    }
    return this.prisma.productVariant.update({ where: { id: variant.id }, data });
  }

  async remove(productId: string, id: string, tenantId: string) {
    const variant = await this.findOne(productId, id, tenantId);
    return this.prisma.productVariant.delete({ where: { id: variant.id } });
  }

  async bulkCreate(productId: string, tenantId: string, variants: CreateVariantDto[]) {
    return Promise.all(variants.map((v) => this.create(productId, tenantId, v)));
  }

  async findByBarcode(barcode: string, tenantId: string) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { barcode, product: { tenantId } },
      include: { product: { include: { category: true } }, inventory: true },
    });
    if (!variant) throw new NotFoundException('Barcode not found');
    return variant;
  }

  async backfillBarcodes(tenantId: string) {
    const missing = await this.prisma.productVariant.findMany({
      where: { product: { tenantId }, OR: [{ barcode: null }, { barcode: '' }] },
      select: { id: true },
    });
    let filled = 0;
    for (const v of missing) {
      let barcode: string;
      let attempts = 0;
      do {
        barcode = this.generateEAN13();
        attempts++;
      } while (attempts < 10 && await this.prisma.productVariant.findFirst({ where: { barcode } }));
      await this.prisma.productVariant.update({ where: { id: v.id }, data: { barcode } });
      filled++;
    }
    return { filled, total: missing.length };
  }
}

@ApiTags('Variants')
@ApiBearerAuth('access-token')
@Controller({ path: 'products/:productId/variants', version: '1' })
export class VariantsController {
  constructor(private readonly variantsService: VariantsService) {}

  @Post()
  @RequirePermissions('products:create')
  @ApiOperation({ summary: 'Add variant to product' })
  create(@CurrentUser() user: IAuthUser, @Param('productId') productId: string, @Body() dto: CreateVariantDto) {
    return this.variantsService.create(productId, user.tenantId, dto);
  }

  @Post('bulk')
  @RequirePermissions('products:create')
  @ApiOperation({ summary: 'Bulk create variants' })
  bulkCreate(@CurrentUser() user: IAuthUser, @Param('productId') productId: string, @Body() body: BulkCreateVariantsDto) {
    return this.variantsService.bulkCreate(productId, user.tenantId, body.variants);
  }

  @Get()
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List product variants' })
  findAll(@CurrentUser() user: IAuthUser, @Param('productId') productId: string) {
    return this.variantsService.findAll(productId, user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Get variant by ID' })
  findOne(@CurrentUser() user: IAuthUser, @Param('productId') productId: string, @Param('id') id: string) {
    return this.variantsService.findOne(productId, id, user.tenantId);
  }

  @Put(':id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update variant' })
  update(
    @CurrentUser() user: IAuthUser,
    @Param('productId') productId: string,
    @Param('id') id: string,
    @Body() dto: UpdateVariantDto,
  ) {
    return this.variantsService.update(productId, id, user.tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:delete')
  @ApiOperation({ summary: 'Delete variant' })
  remove(@CurrentUser() user: IAuthUser, @Param('productId') productId: string, @Param('id') id: string) {
    return this.variantsService.remove(productId, id, user.tenantId);
  }
}

@ApiTags('Variants')
@ApiBearerAuth('access-token')
@Controller({ path: 'variants', version: '1' })
export class VariantSearchController {
  constructor(private readonly variantsService: VariantsService) {}

  @Get('barcode/:barcode')
  @ApiOperation({ summary: 'Find variant by barcode (POS scan)' })
  findByBarcode(@CurrentUser() user: IAuthUser, @Param('barcode') barcode: string) {
    return this.variantsService.findByBarcode(barcode, user.tenantId);
  }

  @Post('backfill-barcodes')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Auto-fill unique EAN13 barcodes for all variants missing one' })
  backfillBarcodes(@CurrentUser() user: IAuthUser) {
    return this.variantsService.backfillBarcodes(user.tenantId);
  }
}

@Module({
  controllers: [VariantsController, VariantSearchController],
  providers: [VariantsService],
  exports: [VariantsService],
})
export class VariantsModule {}
