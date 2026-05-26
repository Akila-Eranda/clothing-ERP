import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Delete, Body, Param, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException } from '@nestjs/common';
import { IsString, IsOptional, IsBoolean, IsInt, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import slugify from 'slugify';

export class CreateCollectionDto {
  @ApiProperty() @IsString() name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() image?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateCollectionDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() image?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() sortOrder?: number;
}

export class AddProductsToCollectionDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) productIds: string[];
}

@Injectable()
export class CollectionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, dto: CreateCollectionDto) {
    const slug = slugify(dto.name, { lower: true, strict: true }) + '-' + Date.now().toString(36);
    return this.prisma.collection.create({
      data: { tenantId, name: dto.name, slug, description: dto.description, image: dto.image, isActive: dto.isActive ?? true, sortOrder: dto.sortOrder ?? 0 },
    });
  }

  async findAll(tenantId: string, onlyActive = false) {
    return this.prisma.collection.findMany({
      where: { tenantId, ...(onlyActive && { isActive: true }) },
      include: { products: { include: { product: { select: { id: true, name: true, images: true, sellingPrice: true } } } } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const col = await this.prisma.collection.findUnique({
      where: { id },
      include: { products: { include: { product: { include: { variants: { select: { id: true, name: true, sku: true, size: true, color: true, sellingPrice: true } } } } }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!col) throw new NotFoundException('Collection not found');
    return col;
  }

  async update(id: string, dto: UpdateCollectionDto) {
    return this.prisma.collection.update({ where: { id }, data: dto as object });
  }

  async remove(id: string) {
    return this.prisma.collection.delete({ where: { id } });
  }

  async addProducts(id: string, productIds: string[]) {
    await this.prisma.collectionProduct.createMany({
      data: productIds.map(productId => ({ collectionId: id, productId })),
      skipDuplicates: true,
    });
    return this.findOne(id);
  }

  async removeProduct(collectionId: string, productId: string) {
    return this.prisma.collectionProduct.delete({ where: { collectionId_productId: { collectionId, productId } } });
  }
}

@ApiTags('Collections')
@ApiBearerAuth('access-token')
@Controller({ path: 'collections', version: '1' })
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Post()
  @RequirePermissions('products:create')
  @ApiOperation({ summary: 'Create a collection / seasonal range' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateCollectionDto) {
    return this.collectionsService.create(user.tenantId, dto);
  }

  @Get()
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List all collections' })
  findAll(@CurrentUser() user: IAuthUser, @Query('active') active?: string) {
    return this.collectionsService.findAll(user.tenantId, active === 'true');
  }

  @Get(':id')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Get collection with products' })
  findOne(@Param('id') id: string) {
    return this.collectionsService.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update collection' })
  update(@Param('id') id: string, @Body() dto: UpdateCollectionDto) {
    return this.collectionsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:delete')
  @ApiOperation({ summary: 'Delete collection' })
  remove(@Param('id') id: string) {
    return this.collectionsService.remove(id);
  }

  @Post(':id/products')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Add products to collection' })
  addProducts(@Param('id') id: string, @Body() dto: AddProductsToCollectionDto) {
    return this.collectionsService.addProducts(id, dto.productIds);
  }

  @Delete(':id/products/:productId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Remove product from collection' })
  removeProduct(@Param('id') id: string, @Param('productId') productId: string) {
    return this.collectionsService.removeProduct(id, productId);
  }
}

@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
