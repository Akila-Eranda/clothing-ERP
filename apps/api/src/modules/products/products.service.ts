import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import {
  IsString, IsOptional, IsNumber, IsEnum, IsArray, IsBoolean, Min, ValidateNested, IsInt, IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BarcodeMode, ProductKind, ProductStatus, TubeType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { InventoryService } from '@/modules/inventory/inventory.module';
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

export class SupplierAssignmentDto {
  @ApiProperty() @IsString() supplierId: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) buyingPrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) leadTimeDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) minOrderQty?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isPreferred?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateProductDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shortDesc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() categoryId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brandId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hsn?: string;
  @ApiPropertyOptional({ description: 'Optional product SKU override (must be unique per tenant)' })
  @IsOptional() @IsString() sku?: string;
  @ApiProperty() @IsNumber() @Min(0) sellingPrice: number;
  @ApiProperty() @IsNumber() @Min(0) costPrice: number;
  @ApiProperty() @IsNumber() @Min(0) mrp: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) wholesalePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
  @ApiPropertyOptional({ enum: ProductStatus }) @IsOptional() @IsEnum(ProductStatus) status?: ProductStatus;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() images?: string[];
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() hasVariants?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackInventory?: boolean;
  @ApiPropertyOptional({ enum: ProductKind }) @IsOptional() @IsEnum(ProductKind) productKind?: ProductKind;
  @ApiPropertyOptional({ enum: BarcodeMode }) @IsOptional() @IsEnum(BarcodeMode) barcodeMode?: BarcodeMode;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowNegativeStock?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowDecimalSelling?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() weightScaleReady?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) openingStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) reorderLevel?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) minStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) maxStock?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() warehouseId?: string;
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
  @ApiPropertyOptional({ type: [SupplierAssignmentDto], description: 'Rich supplier assignments (preferred over supplierIds)' })
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SupplierAssignmentDto)
  suppliers?: SupplierAssignmentDto[];
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
  ) {}

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
    opts?: {
      openingStock?: number;
      reorderLevel?: number;
      minStock?: number;
      maxStock?: number;
      warehouseId?: string;
    },
  ) {
    if (!variantIds.length) return;

    const branchIds = await this.resolveInventoryBranchIds(tenantId, branchScope, branchId);
    if (!branchIds.length) return;

    const openingQty = Math.max(0, Math.round(opts?.openingStock ?? 0));
    const reorderPoint = Math.max(0, Math.round(opts?.reorderLevel ?? 5));
    const minStockLevel = Math.max(0, Math.round(opts?.minStock ?? 0));
    const maxStockLevel = Math.max(0, Math.round(opts?.maxStock ?? 0));

    const warehouseByBranch = new Map<string, string>();
    for (const bid of branchIds) {
      if (opts?.warehouseId) {
        const wh = await this.prisma.warehouse.findFirst({
          where: { id: opts.warehouseId, tenantId, branchId: bid, isActive: true },
          select: { id: true },
        });
        if (wh) {
          warehouseByBranch.set(bid, wh.id);
          continue;
        }
      }
      const warehouse = await this.ensureDefaultWarehouse(tenantId, bid);
      warehouseByBranch.set(bid, warehouse.id);
    }

    // Prefer explicit warehouse for SINGLE/ALL when provided and valid for any branch
    if (opts?.warehouseId && warehouseByBranch.size === 0) {
      const wh = await this.prisma.warehouse.findFirst({
        where: { id: opts.warehouseId, tenantId, isActive: true },
        select: { id: true, branchId: true },
      });
      if (wh && branchIds.includes(wh.branchId)) {
        warehouseByBranch.set(wh.branchId, wh.id);
      }
    }

    await this.inventory.seedOpeningStock(
      branchIds.flatMap((bid) =>
        variantIds.map((variantId) => ({
          tenantId,
          branchId: bid,
          variantId,
          warehouseId: warehouseByBranch.get(bid)!,
          quantity: openingQty,
          reorderPoint,
          minStockLevel,
          maxStockLevel,
        })),
      ),
    );

    // If rows already existed (skipDuplicates), still apply stock prefs
    if (openingQty > 0 || opts?.reorderLevel != null || opts?.minStock != null || opts?.maxStock != null) {
      await this.inventory.applyInventoryStockPrefs(tenantId, variantIds, branchIds, {
        ...(opts?.openingStock != null ? { quantity: openingQty } : {}),
        ...(opts?.reorderLevel != null ? { reorderPoint } : {}),
        ...(opts?.minStock != null ? { minStockLevel } : {}),
        ...(opts?.maxStock != null ? { maxStockLevel } : {}),
      });
    }
  }

  private resolveProductKind(dto: CreateProductDto): ProductKind {
    if (dto.productKind) return dto.productKind;
    if (dto.hasVariants) return ProductKind.VARIANT;
    return ProductKind.STANDARD;
  }

  private normalizeSupplierAssignments(dto: Pick<CreateProductDto, 'suppliers' | 'supplierIds'>) {
    const byId = new Map<string, SupplierAssignmentDto>();

    for (const sid of dto.supplierIds ?? []) {
      if (!sid?.trim()) continue;
      if (!byId.has(sid)) {
        byId.set(sid, { supplierId: sid, isActive: true, isPreferred: false });
      }
    }

    for (const row of dto.suppliers ?? []) {
      const supplierId = row?.supplierId?.trim();
      if (!supplierId) continue;
      const prev = byId.get(supplierId);
      byId.set(supplierId, {
        supplierId,
        buyingPrice: Number.isFinite(row.buyingPrice as number) ? row.buyingPrice : prev?.buyingPrice,
        leadTimeDays: Number.isFinite(row.leadTimeDays as number) ? row.leadTimeDays : prev?.leadTimeDays,
        minOrderQty: Number.isFinite(row.minOrderQty as number) ? row.minOrderQty : prev?.minOrderQty,
        isPreferred: row.isPreferred ?? prev?.isPreferred ?? false,
        isActive: row.isActive ?? prev?.isActive ?? true,
      });
    }

    return Array.from(byId.values());
  }

  private async upsertSupplierAssignments(
    tenantId: string,
    variantIds: string[],
    dto: Pick<CreateProductDto, 'suppliers' | 'supplierIds'>,
  ) {
    if (!variantIds.length) return;

    const rows = this.normalizeSupplierAssignments(dto);
    if (!rows.length) return;

    const supplierIds = rows.map((r) => r.supplierId);
    const validSuppliers = await this.prisma.supplier.findMany({
      where: { tenantId, id: { in: supplierIds }, isActive: true },
      select: { id: true },
    });
    if (validSuppliers.length !== supplierIds.length) {
      throw new BadRequestException('One or more suppliers are invalid or inactive');
    }

    for (const meta of rows) {
      for (const variantId of variantIds) {
        await this.prisma.supplierProductAssignment.upsert({
          where: { supplierId_variantId: { supplierId: meta.supplierId, variantId } },
          create: {
            tenantId,
            supplierId: meta.supplierId,
            variantId,
            lastBuyingPrice: meta.buyingPrice ?? null,
            leadTimeDays: meta.leadTimeDays ?? null,
            minOrderQty: meta.minOrderQty ?? null,
            isPreferred: meta.isPreferred ?? false,
            isActive: meta.isActive ?? true,
          },
          update: {
            lastBuyingPrice: meta.buyingPrice ?? null,
            leadTimeDays: meta.leadTimeDays ?? null,
            minOrderQty: meta.minOrderQty ?? null,
            isPreferred: meta.isPreferred ?? false,
            isActive: meta.isActive ?? true,
          },
        });
      }
    }
  }

  // ── Products ─────────────────────────────────────────────
  async create(tenantId: string, dto: CreateProductDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { maxProducts: true } });
    if (tenant) {
      const count = await this.prisma.product.count({ where: { tenantId } });
      if (count >= tenant.maxProducts) {
        throw new BadRequestException(`Product limit reached (${tenant.maxProducts}). Upgrade your plan.`);
      }
    }
    const baseSlug = this.generateSlug(dto.name);
    let sku = dto.sku?.trim() || `PRD-${nanoid(8).toUpperCase()}`;
    if (dto.sku?.trim()) {
      const clash = await this.prisma.product.findFirst({ where: { tenantId, sku } });
      if (clash) throw new BadRequestException(`SKU already exists: ${sku}`);
    }

    let slug = baseSlug;
    let suffix = 1;
    while (await this.prisma.product.findFirst({ where: { tenantId, slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    const productKind = this.resolveProductKind(dto);
    const barcodeMode = dto.barcodeMode ?? BarcodeMode.UNIQUE;
    const hasVariants = productKind === ProductKind.VARIANT ? true : (dto.hasVariants ?? false);
    const isWeighted = productKind === ProductKind.WEIGHTED;

    // Weighted: barcode optional. Otherwise generate EAN if missing.
    const barcodeTrim = dto.barcode?.trim() || '';
    const sharedBarcode = isWeighted
      ? (barcodeTrim || null)
      : (barcodeTrim || this.generateEAN13());

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
        wholesalePrice: dto.wholesalePrice ?? 0,
        taxRate: dto.taxRate ?? 18,
        status: dto.status ?? ProductStatus.DRAFT,
        images: dto.images ?? [],
        tags: dto.tags ?? [],
        hasVariants,
        trackInventory: dto.trackInventory ?? true,
        productKind,
        barcodeMode,
        unit: dto.unit || null,
        allowNegativeStock: dto.allowNegativeStock ?? false,
        allowDecimalSelling: dto.allowDecimalSelling ?? isWeighted,
        weightScaleReady: dto.weightScaleReady ?? isWeighted,
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

    if (dto.variants?.length && hasVariants) {
      const usedSkus = new Set<string>();
      const uniquify = (raw: string, index: number) => {
        const base = (raw || `VAR-${index + 1}`).trim() || `VAR-${index + 1}`;
        let next = base;
        let n = 2;
        while (usedSkus.has(next)) {
          next = `${base}-${n++}`;
        }
        usedSkus.add(next);
        return next;
      };

      await this.prisma.productVariant.createMany({
        data: dto.variants.map((v, i) => ({
          productId: product.id,
          sku: uniquify(v.sku, i),
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
          barcode:
            barcodeMode === BarcodeMode.SHARED
              ? sharedBarcode
              : (v.barcode?.trim() || null),
        })),
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

    await this.upsertSupplierAssignments(tenantId, createdVariants.map((v) => v.id), dto);

    if (dto.trackInventory !== false && createdVariants.length) {
      await this.seedVariantInventory(
        tenantId,
        createdVariants.map((v) => v.id),
        dto.branchScope ?? 'ALL',
        dto.branchId,
        {
          openingStock: dto.openingStock,
          reorderLevel: dto.reorderLevel,
          minStock: dto.minStock,
          maxStock: dto.maxStock,
          warehouseId: dto.warehouseId,
        },
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
            supplierAssignments: {
              select: {
                supplierId: true,
                lastBuyingPrice: true,
                leadTimeDays: true,
                minOrderQty: true,
                isPreferred: true,
                isActive: true,
                supplierProductCode: true,
                supplier: { select: { id: true, name: true } },
              },
            },
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
    const {
      variants,
      branchScope: _bs,
      branchId: _bi,
      supplierIds,
      suppliers,
      openingStock: _os,
      reorderLevel: _rl,
      minStock: _ms,
      maxStock: _xs,
      warehouseId: _wh,
      ...rest
    } = dto as Record<string, unknown> & {
      supplierIds?: string[];
      suppliers?: SupplierAssignmentDto[];
    };
    const allowed = [
      'name', 'description', 'shortDesc', 'categoryId', 'brandId', 'hsn', 'barcode',
      'sellingPrice', 'costPrice', 'mrp', 'wholesalePrice', 'taxRate', 'status', 'images', 'tags',
      'hasVariants', 'trackInventory', 'productKind', 'barcodeMode', 'unit',
      'allowNegativeStock', 'allowDecimalSelling', 'weightScaleReady',
      'oemNumber', 'modelNumber', 'loadIndex', 'speedRating', 'tubeType', 'pattern', 'warrantyMonths',
      'seoTitle', 'seoDescription',
    ] as const;
    const data: Record<string, unknown> = {};
    for (const key of allowed) {
      if (rest[key] !== undefined) data[key] = rest[key];
    }
    if (dto.productKind === ProductKind.VARIANT) data.hasVariants = true;
    if (dto.productKind === ProductKind.STANDARD || dto.productKind === ProductKind.WEIGHTED) {
      data.hasVariants = false;
    }
    if (dto.name) data.slug = this.generateSlug(dto.name);
    await this.prisma.product.update({ where: { id }, data });

    const productRow = await this.prisma.product.findFirst({
      where: { id, tenantId },
      select: { barcode: true, barcodeMode: true },
    });
    const sharedBarcode = productRow?.barcode ?? null;
    const barcodeMode = productRow?.barcodeMode ?? BarcodeMode.UNIQUE;

    // Only push product barcode onto all variants in SHARED mode
    if (barcodeMode === BarcodeMode.SHARED && (typeof data.barcode === 'string' || data.barcode === null)) {
      const shared = typeof data.barcode === 'string' ? data.barcode.trim() || null : null;
      await this.prisma.productVariant.updateMany({
        where: { productId: id },
        data: { barcode: shared },
      });
    }

    if (Array.isArray(variants) && variants.length > 0) {
      const existingSkus = await this.prisma.productVariant.findMany({
        where: { productId: id },
        select: { id: true, sku: true },
      });
      const usedSkus = new Set(existingSkus.map((e) => e.sku));
      const keptIds = new Set<string>();

      for (const v of variants as (Partial<CreateVariantDto> & { id?: string; isActive?: boolean })[]) {
        if (v.id) {
          keptIds.add(v.id);
          if (v.sku !== undefined) {
            const other = existingSkus.find((e) => e.sku === v.sku && e.id !== v.id);
            if (other) {
              throw new BadRequestException(`Variant SKU already exists on this product: ${v.sku}`);
            }
            usedSkus.add(v.sku);
          }
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
              ...(v.barcode !== undefined && {
                barcode:
                  barcodeMode === BarcodeMode.SHARED
                    ? sharedBarcode
                    : (v.barcode?.trim() || sharedBarcode),
              }),
            },
          });
        } else {
          const base = (v.sku || v.name || 'VAR').trim() || 'VAR';
          let sku = base;
          let n = 2;
          while (usedSkus.has(sku)) sku = `${base}-${n++}`;
          usedSkus.add(sku);
          const created = await this.prisma.productVariant.create({
            data: {
              productId:    id,
              sku,
              name:         v.name!,
              size:         v.size,
              color:        v.color,
              material:     v.material,
              style:        v.style,
              sellingPrice: v.sellingPrice ?? 0,
              costPrice:    v.costPrice    ?? 0,
              mrp:          v.mrp          ?? 0,
              barcode:
                barcodeMode === BarcodeMode.SHARED
                  ? sharedBarcode
                  : (v.barcode?.trim() || sharedBarcode),
              sortOrder:    0,
            },
          });
          keptIds.add(created.id);
        }
      }

      // Soft-remove variants dropped from the edit form (keep history / inventory FKs)
      const droppedIds = existingSkus.map((e) => e.id).filter((vid) => !keptIds.has(vid));
      if (droppedIds.length) {
        await this.prisma.productVariant.updateMany({
          where: { productId: id, id: { in: droppedIds } },
          data: { isActive: false },
        });
      }
    }

    if (Array.isArray(suppliers) || Array.isArray(supplierIds)) {
      const productVariants = await this.prisma.productVariant.findMany({
        where: { productId: id },
        select: { id: true },
      });
      const variantIds = productVariants.map((v) => v.id);
      if (variantIds.length) {
        const nextRows = this.normalizeSupplierAssignments({
          suppliers: Array.isArray(suppliers) ? suppliers : undefined,
          supplierIds: Array.isArray(supplierIds) ? supplierIds : undefined,
        });
        const nextIds = nextRows.map((r) => r.supplierId);

        if (nextIds.length) {
          await this.prisma.supplierProductAssignment.deleteMany({
            where: {
              tenantId,
              variantId: { in: variantIds },
              supplierId: { notIn: nextIds },
            },
          });
          await this.upsertSupplierAssignments(tenantId, variantIds, {
            suppliers: nextRows,
            supplierIds: nextIds,
          });
        } else {
          await this.prisma.supplierProductAssignment.deleteMany({
            where: { tenantId, variantId: { in: variantIds } },
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
        await this.inventory.seedOpeningStock(
          branchIds.map((branchId) => ({
            tenantId,
            branchId,
            variantId: variant.id,
            warehouseId: warehouseByBranch.get(branchId)!,
            quantity: 0,
          })),
        );
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
    const existing = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Category not found');
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
