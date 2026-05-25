import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, IsBoolean, Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { nanoid } from 'nanoid';

export class CreateVariantDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() size?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() material?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() style?: string;
  @ApiProperty() @IsNumber() @Min(0) sellingPrice: number;
  @ApiProperty() @IsNumber() @Min(0) costPrice: number;
  @ApiProperty() @IsNumber() @Min(0) mrp: number;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() images?: string[];
}

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

  async findOne(id: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id },
      include: { product: true, inventory: true },
    });
    if (!variant) throw new NotFoundException('Variant not found');
    return variant;
  }

  async update(id: string, dto: Partial<CreateVariantDto>) {
    await this.findOne(id);
    return this.prisma.productVariant.update({ where: { id }, data: dto as object });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.productVariant.delete({ where: { id } });
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
  bulkCreate(@CurrentUser() user: IAuthUser, @Param('productId') productId: string, @Body() body: { variants: CreateVariantDto[] }) {
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
  findOne(@Param('id') id: string) {
    return this.variantsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update variant' })
  update(@Param('id') id: string, @Body() dto: Partial<CreateVariantDto>) {
    return this.variantsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:delete')
  @ApiOperation({ summary: 'Delete variant' })
  remove(@Param('id') id: string) {
    return this.variantsService.remove(id);
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
}

@Module({
  controllers: [VariantsController, VariantSearchController],
  providers: [VariantsService],
  exports: [VariantsService],
})
export class VariantsModule {}
