import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, IsEnum, IsArray, IsBoolean, Min, ValidateNested, IsInt, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductStatus, TubeType } from '@prisma/client';
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
  @ApiPropertyOptional() @IsOptional() @IsString() dotCode?: string;
  @ApiPropertyOptional({ description: 'Optional; defaults to product barcode (shared across variants)' })
  @IsOptional() @IsString() barcode?: string;
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
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasVariants?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackInventory?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() oemNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() modelNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() loadIndex?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() speedRating?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TubeType) tubeType?: TubeType;
  @ApiPropertyOptional() @IsOptional() @IsString() pattern?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) warrantyMonths?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() seoTitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() seoDescription?: string;
  @ApiPropertyOptional({ type: [CreateVariantDto] })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
  @ApiPropertyOptional({ type: [String], description: 'Optional supplier ids to assign with created variants' })
  @IsOptional() @IsArray() @IsString({ each: true })
  supplierIds?: string[];
  @ApiPropertyOptional({ enum: ['ALL', 'SINGLE'], default: 'ALL', description: 'ALL = stock in every branch; SINGLE = one branch only' })
  @IsOptional() @IsIn(['ALL', 'SINGLE'])
  branchScope?: 'ALL' | 'SINGLE';
  @ApiPropertyOptional({ description: 'Required when branchScope is SINGLE' })
  @IsOptional() @IsString()
  branchId?: string;
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

  private generateEAN13(): string {
    const digits = [2, ...Array.from({ length: 11 }, () => Math.floor(Math.random() * 10))];
    const sum = digits.reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    const check = (10 - (sum % 10)) % 10;
    return [...digits, check].join('');
  }

  private async resolveInventoryBranchIds(
    tenantId: string,
    branchScope: 'ALL' | 'SINGLE' = 'ALL',
    branchId?: string,
  ): Promise<string[]> {
    if (branchScope === 'SINGLE') {
      if (!branchId) throw new BadRequestException('branchId is required when branchScope is SINGLE');
      const branch = await this.prisma.branch.findFirst({
        where: { id: branchId, tenantId, isActive: true },
        select: { id: true },
      });
      if (!branch) throw new BadRequestException('Branch not found');
      return [branch.id];
    }

    const branches = await this.prisma.branch.findMany({
      where: { tenantId, isActive: true },
      select: { id: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    return branches.map((b) => b.id);
  }

  private async ensureDefaultWarehouse(tenantId: string, branchId: string) {
    const existing = await this.prisma.warehouse.findFirst({
      where: { tenantId, branchId, isDefault: true, isActive: true },
    });
    if (existing) return existing;

    const branch = await this.prisma.branch.findFirst({ where: { id: branchId, tenantId } });
    if (!branch) throw new BadRequestException('Branch not found');

    const codeBase = `${branch.code}-MAIN`.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20);
    let code = codeBase;
    let n = 1;
    while (await this.prisma.warehouse.findFirst({ where: { tenantId, code } })) {
      code = `${codeBase}-${n++}`.slice(0, 24);
    }

    return this.prisma.warehouse.create({
      data: {
        tenantId,
        branchId,
        name: `${branch.name} Main`,
        code,
        isDefault: true,
        isActive: true,
      },
    });
  }

  private async seedVariantInventory(
    tenantId: string,
    variantIds: string[],
    branchScope: 'ALL' | 'SINGLE' = 'ALL',
    branchId?: string,
  ) {
    if (!variantIds.length) return;

    const branchIds = await this.resolveInventoryBranchIds(tenantId, branchScope, branchId);
    if (!branchIds.length) return;

    const warehouseByBranch = new Map<string, string>();
    for (const bid of branchIds) {
      const warehouse = await this.ensureDefaultWarehouse(tenantId, bid);
      warehouseByBranch.set(bid, warehouse.id);
    }

    await this.prisma.inventory.createMany({
      data: branchIds.flatMap((bid) =>
        variantIds.map((variantId) => ({
          tenantId,
          branchId: bid,
          variantId,
          warehouseId: warehouseByBranch.get(bid)!,
          quantity: 0,
        })),
      ),
      skipDuplicates: true,
    });
  }

  // ── Products ─────────────────────────────────────────────
  async create(tenantId: string, dto: CreateProductDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxProducts: true } });
    if (tenant) {
      const count = await this.prisma.product.count({ where: { tenantId } });
      if (count >= tenant.maxProducts) {
        throw new Error(`Product limit reached (${tenant.maxProducts}). Upgrade your plan.`);
      }
    }
    const baseSlug = this.generateSlug(dto.name);
    const sku = `PRD-${nanoid(8).toUpperCase()}`;

    let slug = baseSlug;
    let suffix = 1;
    while (await this.prisma.product.findFirst({ where: { tenantId, slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    // One product barcode shared by all variants; prices stay per-variant.
    const sharedBarcode = (dto.barcode?.trim() || this.generateEAN13());

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
        barcode: sharedBarcode,
        oemNumber: dto.oemNumber,
        modelNumber: dto.modelNumber,
        loadIndex: dto.loadIndex,
        speedRating: dto.speedRating,
        tubeType: dto.tubeType,
        pattern: dto.pattern,
        warrantyMonths: dto.warrantyMonths,
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
          dotCode: v.dotCode,
          sellingPrice: v.sellingPrice,
          costPrice: v.costPrice,
          mrp: v.mrp,
          sortOrder: i,
          barcode: v.barcode?.trim() || sharedBarcode,
        })),
        skipDuplicates: true,
      });
    } else {
      await this.prisma.productVariant.create({
        data: {
          productId: product.id,
          sku: product.sku,
          name: 'Default',
          sellingPrice: dto.sellingPrice,
          costPrice: dto.costPrice,
          mrp: dto.mrp,
          barcode: sharedBarcode,
        },
      });
    }

    const createdVariants = await this.prisma.productVariant.findMany({
      where: { productId: product.id },
      select: { id: true },
    });

    if (dto.supplierIds?.length && createdVariants.length) {
      const uniqueSupplierIds = Array.from(new Set(dto.supplierIds.filter(Boolean)));
      const validSuppliers = await this.prisma.supplier.findMany({
        where: { tenantId, id: { in: uniqueSupplierIds } },
        select: { id: true },
      });
      if (validSuppliers.length !== uniqueSupplierIds.length) {
        throw new BadRequestException('One or more suppliers are invalid');
      }
      await this.prisma.supplierProductAssignment.createMany({
        data: validSuppliers.flatMap((s) =>
          createdVariants.map((v) => ({
            tenantId,
            supplierId: s.id,
            variantId: v.id,
          })),
        ),
        skipDuplicates: true,
      });
    }

    if (dto.trackInventory !== false && createdVariants.length) {
      await this.seedVariantInventory(
        tenantId,
        createdVariants.map((v) => v.id),
        dto.branchScope ?? 'ALL',
        dto.branchId,
      );
    }

    return this.findOne(product.id, tenantId);
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
          { barcode: { contains: query.search, mode: 'insensitive' as const } },
          { tags: { has: query.search } },
          {
            variants: {
              some: {
                isActive: true,
                OR: [
                  { sku: { contains: query.search, mode: 'insensitive' as const } },
                  { barcode: { contains: query.search, mode: 'insensitive' as const } },
                  { name: { contains: query.search, mode: 'insensitive' as const } },
                ],
              },
            },
          },
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
          variants: {
            where: { isActive: true },
            select: {
              id: true,
              sku: true,
              name: true,
              barcode: true,
              sellingPrice: true,
              costPrice: true,
              mrp: true,
              size: true,
              color: true,
              material: true,
              style: true,
              isActive: true,
            },
            orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          },
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
        variants: {
          include: {
            inventory: { include: { branch: true } },
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
        collections: { include: { collection: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(id: string, tenantId: string, dto: Partial<CreateProductDto> & { variants?: (Partial<CreateVariantDto> & { id?: string; isActive?: boolean })[] }) {
    await this.findOne(id, tenantId);
    const { variants, branchScope: _bs, branchId: _bi, ...rest } = dto as Record<string, unknown>;
    const allowed = [
      'name', 'description', 'shortDesc', 'categoryId', 'brandId', 'hsn', 'barcode',
      'sellingPrice', 'costPrice', 'mrp', 'taxRate', 'status', 'images', 'tags',
      'hasVariants', 'trackInventory', 'oemNumber', 'modelNumber', 'loadIndex', 'speedRating', 'tubeType', 'pattern', 'warrantyMonths',
      'seoTitle', 'seoDescription',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (rest[key] !== undefined) data[key] = rest[key];
    }
    if (dto.name) data.slug = this.generateSlug(dto.name);
    await this.prisma.product.update({ where: { id }, data });

    // Keep product barcode shared across all variants when product barcode changes.
    if (typeof data.barcode === 'string' || data.barcode === null) {
      const shared = typeof data.barcode === 'string' ? data.barcode.trim() || null : null;
      await this.prisma.productVariant.updateMany({
        where: { productId: id },
        data: { barcode: shared },
      });
    }

    const productBarcode = await this.prisma.product.findFirst({
      where: { id, tenantId },
      select: { barcode: true },
    });
    const sharedBarcode = productBarcode?.barcode ?? null;

    if (Array.isArray(variants) && variants.length > 0) {
      for (const v of variants as (Partial<CreateVariantDto> & { id?: string; isActive?: boolean })[]) {
        if (v.id) {
          await this.prisma.productVariant.update({
            where: { id: v.id },
            data: {
              ...(v.sku          !== undefined && { sku:          v.sku }),
              ...(v.name         !== undefined && { name:         v.name }),
              ...(v.size         !== undefined && { size:         v.size ?? null }),
              ...(v.color        !== undefined && { color:        v.color ?? null }),
              ...(v.material     !== undefined && { material:     v.material ?? null }),
              ...(v.style        !== undefined && { style:        v.style ?? null }),
              ...(v.sellingPrice !== undefined && { sellingPrice: v.sellingPrice }),
              ...(v.costPrice    !== undefined && { costPrice:    v.costPrice }),
              ...(v.mrp          !== undefined && { mrp:          v.mrp }),
              ...(v.isActive     !== undefined && { isActive:     v.isActive }),
              ...(v.barcode      !== undefined && { barcode:      v.barcode?.trim() || sharedBarcode }),
            },
          });
        } else {
          await this.prisma.productVariant.create({
            data: {
              productId:    id,
              sku:          v.sku!,
              name:         v.name!,
              size:         v.size,
              color:        v.color,
              material:     v.material,
              style:        v.style,
              sellingPrice: v.sellingPrice ?? 0,
              costPrice:    v.costPrice    ?? 0,
              mrp:          v.mrp          ?? 0,
              barcode:      v.barcode?.trim() || sharedBarcode,
              sortOrder:    0,
            },
          });
        }
      }
    }
    return this.findOne(id, tenantId);
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
    const product = await this.findOne(productId, tenantId);
    const sharedBarcode = product.barcode ?? this.generateEAN13();
    if (!product.barcode) {
      await this.prisma.product.update({
        where: { id: productId },
        data: { barcode: sharedBarcode },
      });
    }
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
        sortOrder: i,
        barcode: v.barcode?.trim() || sharedBarcode,
      })),
    });
    return this.findOne(productId, tenantId);
  }

  async seedVariants(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId },
      include: { _count: { select: { variants: true } } },
    });
    const orphans = products.filter((p) => p._count.variants === 0);
    if (!orphans.length) return { seeded: 0, message: 'All products already have variants' };

    const branchIds = await this.resolveInventoryBranchIds(tenantId, 'ALL');

    let seeded = 0;
    for (const p of orphans) {
      const sharedBarcode = p.barcode ?? this.generateEAN13();
      if (!p.barcode) {
        await this.prisma.product.update({
          where: { id: p.id },
          data: { barcode: sharedBarcode },
        });
      }
      const variant = await this.prisma.productVariant.create({
        data: {
          productId: p.id,
          sku: p.sku,
          name: 'Default',
          sellingPrice: p.sellingPrice,
          costPrice: p.costPrice,
          mrp: p.mrp,
          barcode: sharedBarcode,
        },
      });
      if (branchIds.length) {
        const warehouseByBranch = new Map<string, string>();
        for (const branchId of branchIds) {
          const warehouse = await this.ensureDefaultWarehouse(tenantId, branchId);
          warehouseByBranch.set(branchId, warehouse.id);
        }
        await this.prisma.inventory.createMany({
          data: branchIds.map((branchId) => ({
            tenantId,
            branchId,
            variantId: variant.id,
            warehouseId: warehouseByBranch.get(branchId)!,
            quantity: 0,
          })),
          skipDuplicates: true,
        });
      }
      seeded++;
    }
    return { seeded, message: `Created default variant + inventory for ${seeded} products` };
  }

  /** Copy each product's barcode onto all its variants (shared barcode model). */
  async syncSharedBarcodes(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId },
      select: {
        id: true,
        barcode: true,
        variants: { select: { id: true, barcode: true }, take: 1, orderBy: { sortOrder: 'asc' } },
      },
    });

    let productsUpdated = 0;
    let variantsUpdated = 0;

    for (const p of products) {
      let shared = p.barcode?.trim() || null;
      if (!shared) {
        shared = p.variants[0]?.barcode?.trim() || this.generateEAN13();
        await this.prisma.product.update({
          where: { id: p.id },
          data: { barcode: shared },
        });
        productsUpdated += 1;
      }
      const res = await this.prisma.productVariant.updateMany({
        where: { productId: p.id },
        data: { barcode: shared },
      });
      variantsUpdated += res.count;
    }

    return {
      products: products.length,
      productsUpdated,
      variantsUpdated,
      message: `Synced shared barcode onto ${variantsUpdated} variants across ${products.length} products`,
    };
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
