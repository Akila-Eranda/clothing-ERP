import { Injectable, NotFoundException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, IsEnum, IsArray, IsBoolean, Min, ValidateNested, IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { paginate, getPaginationArgs } from '@/shared/pagination.helper';
import { nanoid } from 'nanoid';
import slugify from 'slugify';

export class CreateVariantDto {
  @ApiProperty() @IsString() sku: string;
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() size?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() color?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() material?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() style?: string;
  @ApiProperty() @IsNumber() @Min(0) sellingPrice: number;
  @ApiProperty() @IsNumber() @Min(0) costPrice: number;
  @ApiProperty() @IsNumber() @Min(0) mrp: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
}

export class CreateProductDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shortDesc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hsn?: string;
  @ApiProperty() @IsNumber() @Min(0) sellingPrice: number;
  @ApiProperty() @IsNumber() @Min(0) costPrice: number;
  @ApiProperty() @IsNumber() @Min(0) mrp: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
  @ApiPropertyOptional({ enum: ProductStatus }) @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() images?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasVariants?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackInventory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seoDescription?: string;
  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}

export class CreateCategoryDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() parentId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() image?: string;
}

export class CreateBrandDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logo?: string;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Products ─────────────────────────────────────────────
  async create(tenantId: string, dto: CreateProductDto) {
    const baseSlug = this.generateSlug(dto.name);
    const sku = `PRD-${nanoid(8).toUpperCase()}`;

    let slug = baseSlug;
    let suffix = 1;
    while (await this.prisma.product.findFirst({ where: { tenantId, slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        name: dto.name,
        slug,
        sku,
        description: dto.description,
        shortDesc: dto.shortDesc,
        categoryId: dto.categoryId,
        brandId: dto.brandId,
        hsn: dto.hsn,
        sellingPrice: dto.sellingPrice,
        costPrice: dto.costPrice,
        mrp: dto.mrp,
        taxRate: dto.taxRate ?? 18,
        status: dto.status ?? ProductStatus.DRAFT,
        images: dto.images ?? [],
        tags: dto.tags ?? [],
        hasVariants: dto.hasVariants ?? true,
        trackInventory: dto.trackInventory ?? true,
        barcode: dto.barcode,
        seoTitle: dto.seoTitle,
        seoDescription: dto.seoDescription,
      },
      include: { category: true, brand: true, _count: { select: { variants: true } } },
    });

    if (dto.variants?.length) {
      await this.prisma.productVariant.createMany({
        data: dto.variants.map((v, i) => ({
          productId: product.id,
          sku: v.sku,
          name: v.name,
          size: v.size,
          color: v.color,
          material: v.material,
          style: v.style,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          mrp: v.mrp,
          taxRate: v.taxRate ?? dto.taxRate ?? 18,
          sortOrder: i,
        })),
      });
    }

    return product;
  }

  async findAll(tenantId: string, query: PaginationDto & { categoryId?: string; status?: ProductStatus }) {
    const { skip, take } = getPaginationArgs(query.page, query.limit);
    const where = {
      tenantId,
      ...(query.status && { status: query.status }),
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' as const } },
          { sku: { contains: query.search, mode: 'insensitive' as const } },
          { tags: { has: query.search } },
        ],
      }),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          category: true,
          brand: true,
          _count: { select: { variants: true } },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(data, total, query.page ?? 1, query.limit ?? 20);
  }

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: {
        category: true,
        brand: true,
        variants: true,
        collections: { include: { collection: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, tenantId: string, dto: Partial<CreateProductDto>) {
    await this.findOne(id, tenantId);
    const data: Record<string, unknown> = { ...dto };
    if (dto.name) data.slug = this.generateSlug(dto.name);
    return this.prisma.product.update({
      where: { id },
      data,
      include: { category: true, brand: true, variants: true },
    });
  }

  async updateStatus(id: string, tenantId: string, status: ProductStatus) {
    await this.findOne(id, tenantId);
    return this.prisma.product.update({ where: { id }, data: { status } });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.product.delete({ where: { id } });
  }

  async addVariants(productId: string, tenantId: string, variants: CreateVariantDto[]) {
    await this.findOne(productId, tenantId);
    await this.prisma.productVariant.createMany({
      data: variants.map((v, i) => ({
        productId,
        sku: v.sku,
        name: v.name,
        size: v.size,
        color: v.color,
        material: v.material,
        style: v.style,
        sellingPrice: v.sellingPrice,
        costPrice: v.costPrice,
        mrp: v.mrp,
        taxRate: v.taxRate ?? 18,
        sortOrder: i,
      })),
    });
    return this.findOne(productId, tenantId);
  }

  async bulkUpdateStatus(ids: string[], tenantId: string, status: ProductStatus) {
    return this.prisma.product.updateMany({ where: { id: { in: ids }, tenantId }, data: { status } });
  }

  // ── Categories ────────────────────────────────────────────
  async createCategory(tenantId: string, dto: CreateCategoryDto) {
    const slug = this.generateSlug(dto.name);
    return this.prisma.category.create({
      data: { tenantId, name: dto.name, slug, parentId: dto.parentId, description: dto.description, image: dto.image },
      include: { parent: true, _count: { select: { children: true, products: true } } },
    });
  }

  async findAllCategories(tenantId: string) {
    return this.prisma.category.findMany({
      where: { tenantId, parentId: null },
      include: {
        children: { include: { _count: { select: { products: true } } } },
        _count: { select: { products: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async removeCategory(id: string, tenantId: string) {
    return this.prisma.category.delete({ where: { id } });
  }

  // ── Brands ───────────────────────────────────────────────
  async createBrand(tenantId: string, dto: CreateBrandDto) {
    const slug = this.generateSlug(dto.name);
    return this.prisma.brand.create({
      data: { tenantId, name: dto.name, slug, description: dto.description, logo: dto.logo },
    });
  }

  async findAllBrands(tenantId: string) {
    return this.prisma.brand.findMany({
      where: { tenantId },
      include: { _count: { select: { products: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async updateBrand(id: string, tenantId: string, dto: CreateBrandDto) {
    const existing = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Brand not found');
    return this.prisma.brand.update({
      where: { id },
      data: { name: dto.name, description: dto.description, logo: dto.logo },
      include: { _count: { select: { products: true } } },
    });
  }

  async removeBrand(id: string, tenantId: string) {
    const existing = await this.prisma.brand.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Brand not found');
    return this.prisma.brand.delete({ where: { id } });
  }

  private generateSlug(name: string): string {
    return slugify(name, { lower: true, strict: true });
  }
}
