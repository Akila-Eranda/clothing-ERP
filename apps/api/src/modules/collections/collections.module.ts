import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, IsInt, IsArray, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { assertShopModule } from '@/shared/shop-module.helper';
import slugify from 'slugify';

export class CreateCollectionDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() image?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() season?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() year?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateCollectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() code?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() image?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() season?: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() year?: number;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endsAt?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class AddProductsToCollectionDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) productIds: string[];
}

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertCollections(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'collections');
  }

  async create(tenantId: string, dto: CreateCollectionDto) {
    await this.assertCollections(tenantId);
    const slug = slugify(dto.name, { lower: true, strict: true }) + '-' + Date.now().toString(36);
    return this.prisma.collection.create({
      data: {
        tenantId,
        name: dto.name,
        slug,
        code: dto.code?.trim() || null,
        description: dto.description,
        image: dto.image,
        season: dto.season?.trim() || null,
        year: dto.year ?? null,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async findAll(tenantId: string, onlyActive = false) {
    await this.assertCollections(tenantId);
    return this.prisma.collection.findMany({
      where: { tenantId, ...(onlyActive && { isActive: true }) },
      include: {
        products: {
          include: {
            product: { select: { id: true, name: true, images: true, sellingPrice: true } },
          },
        },
        _count: { select: { products: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(tenantId: string, id: string) {
    await this.assertCollections(tenantId);
    const col = await this.prisma.collection.findFirst({
      where: { id, tenantId },
      include: {
        products: {
          include: {
            product: {
              include: {
                variants: {
                  select: {
                    id: true,
                    name: true,
                    sku: true,
                    size: true,
                    color: true,
                    sellingPrice: true,
                  },
                },
              },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!col) throw new NotFoundException('Collection not found');
    return col;
  }

  async update(tenantId: string, id: string, dto: UpdateCollectionDto) {
    await this.assertCollections(tenantId);
    const existing = await this.prisma.collection.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Collection not found');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.code !== undefined) data.code = dto.code?.trim() || null;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.image !== undefined) data.image = dto.image;
    if (dto.season !== undefined) data.season = dto.season?.trim() || null;
    if (dto.year !== undefined) data.year = dto.year;
    if (dto.startsAt !== undefined) data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    if (dto.endsAt !== undefined) data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;

    return this.prisma.collection.update({ where: { id }, data });
  }

  async remove(tenantId: string, id: string) {
    await this.assertCollections(tenantId);
    const existing = await this.prisma.collection.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Collection not found');
    return this.prisma.collection.delete({ where: { id } });
  }

  async addProducts(tenantId: string, id: string, productIds: string[]) {
    await this.assertCollections(tenantId);
    const existing = await this.prisma.collection.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Collection not found');

    const owned = await this.prisma.product.findMany({
      where: { tenantId, id: { in: productIds } },
      select: { id: true },
    });
    const ownedIds = owned.map((p) => p.id);
    if (ownedIds.length === 0) return this.findOne(tenantId, id);

    await this.prisma.collectionProduct.createMany({
      data: ownedIds.map((productId) => ({ collectionId: id, productId })),
      skipDuplicates: true,
    });
    return this.findOne(tenantId, id);
  }

  async removeProduct(tenantId: string, collectionId: string, productId: string) {
    await this.assertCollections(tenantId);
    const existing = await this.prisma.collection.findFirst({ where: { id: collectionId, tenantId } });
    if (!existing) throw new NotFoundException('Collection not found');
    return this.prisma.collectionProduct.delete({
      where: { collectionId_productId: { collectionId, productId } },
    });
  }

  /** Collection performance from existing sales + inventory (clothing shops only). */
  async performance(tenantId: string, id: string, from?: string, to?: string) {
    await this.assertCollections(tenantId);
    const col = await this.findOne(tenantId, id);
    const productIds = col.products.map((p) => p.productId);
    if (productIds.length === 0) {
      return {
        collectionId: id,
        unitsSold: 0,
        revenue: 0,
        remainingStock: 0,
        sellThroughPct: 0,
      };
    }

    const variantIds = col.products.flatMap((p) => p.product.variants.map((v) => v.id));
    if (variantIds.length === 0) {
      return {
        collectionId: id,
        name: col.name,
        season: col.season,
        year: col.year,
        productCount: productIds.length,
        unitsSold: 0,
        revenue: 0,
        remainingStock: 0,
        sellThroughPct: 0,
      };
    }

    const dateFilter =
      from || to
        ? {
            createdAt: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {};

    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        variantId: { in: variantIds },
        sale: { tenantId, status: { in: ['COMPLETED', 'PARTIALLY_REFUNDED'] }, ...dateFilter },
      },
      select: { quantity: true, total: true },
    });

    const unitsSold = saleItems.reduce((s, i) => s + Number(i.quantity || 0), 0);
    const revenue = saleItems.reduce((s, i) => s + Number(i.total || 0), 0);

    const inv = await this.prisma.inventory.aggregate({
      where: { tenantId, variantId: { in: variantIds } },
      _sum: { quantity: true },
    });
    const remainingStock = Math.max(0, Number(inv._sum.quantity || 0));

    const denom = unitsSold + remainingStock;
    const sellThroughPct =
      denom > 0 ? Math.min(100, Math.round((unitsSold / denom) * 1000) / 10) : 0;

    return {
      collectionId: id,
      name: col.name,
      season: col.season,
      year: col.year,
      productCount: productIds.length,
      unitsSold,
      revenue,
      remainingStock,
      sellThroughPct,
    };
  }
}

@ApiTags('Collections')
@ApiBearerAuth('access-token')
@Controller({ path: 'collections', version: '1' })
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @RequirePermissions('products:create')
  @ApiOperation({ summary: 'Create a collection / seasonal range (Clothing)' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateCollectionDto) {
    return this.collectionsService.create(user.tenantId, dto);
  }

  @Get()
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List all collections (Clothing)' })
  findAll(@CurrentUser() user: IAuthUser, @Query('active') active?: string) {
    return this.collectionsService.findAll(user.tenantId, active === 'true');
  }

  @Get(':id/performance')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Collection sell-through / performance' })
  performance(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.collectionsService.performance(user.tenantId, id, from, to);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Get collection with products' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.collectionsService.findOne(user.tenantId, id);
  }

  @Put(':id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update collection' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collectionsService.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:delete')
  @ApiOperation({ summary: 'Delete collection' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.collectionsService.remove(user.tenantId, id);
  }

  @Post(':id/products')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Add products to collection' })
  addProducts(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: AddProductsToCollectionDto) {
    return this.collectionsService.addProducts(user.tenantId, id, dto.productIds);
  }

  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Remove product from collection' })
  removeProduct(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Param('productId') productId: string,
  ) {
    return this.collectionsService.removeProduct(user.tenantId, id, productId);
  }
}

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
