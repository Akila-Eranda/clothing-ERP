import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ProductStatus } from '@prisma/client';
import { ProductsService, CreateProductDto, CreateCategoryDto, CreateBrandDto, CreateVariantDto } from './products.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryModule } from '@/modules/inventory/inventory.module';

@ApiTags('Products')
@ApiBearerAuth('access-token')
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @RequirePermissions('products:create')
  @ApiOperation({ summary: 'Create product' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.tenantId, dto);
  }

  @Get()
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List products' })
  findAll(@CurrentUser() user: IAuthUser, @Query() query: PaginationDto & { categoryId?: string; status?: ProductStatus }) {
    return this.productsService.findAll(user.tenantId, query);
  }

  @Patch('bulk/status')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Bulk update product status' })
  bulkStatus(@CurrentUser() user: IAuthUser, @Body() body: { ids: string[]; status: ProductStatus }) {
    return this.productsService.bulkUpdateStatus(body.ids, user.tenantId, body.status);
  }

  @Post('seed-variants')
  @ApiOperation({ summary: 'Seed default variant+inventory for products that have none' })
  seedVariants(@CurrentUser() user: IAuthUser) {
    return this.productsService.seedVariants(user.tenantId);
  }

  @Post('sync-shared-barcodes')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Copy product barcode onto all variants (shared barcode, per-variant prices)' })
  syncSharedBarcodes(@CurrentUser() user: IAuthUser) {
    return this.productsService.syncSharedBarcodes(user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Get product by ID' })
  findOne(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.productsService.findOne(id, user.tenantId);
  }

  @Put(':id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update product' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: Partial<CreateProductDto>) {
    return this.productsService.update(id, user.tenantId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update product status' })
  updateStatus(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body('status') status: ProductStatus) {
    return this.productsService.updateStatus(id, user.tenantId, status);
  }

  @Post(':id/variants')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Add variants to existing product' })
  addVariants(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: { variants: CreateVariantDto[] }) {
    return this.productsService.addVariants(id, user.tenantId, body.variants);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('products:delete')
  @ApiOperation({ summary: 'Delete product' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.productsService.remove(id, user.tenantId);
  }
}

@ApiTags('Products')
@ApiBearerAuth('access-token')
@Controller({ path: 'categories', version: '1' })
export class CategoriesController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create category' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateCategoryDto) {
    return this.productsService.createCategory(user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get category tree' })
  findAll(@CurrentUser() user: IAuthUser) {
    return this.productsService.findAllCategories(user.tenantId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete category' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.productsService.removeCategory(id, user.tenantId);
  }
}

@ApiTags('Products')
@ApiBearerAuth('access-token')
@Controller({ path: 'brands', version: '1' })
export class BrandsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create brand' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateBrandDto) {
    return this.productsService.createBrand(user.tenantId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List brands' })
  findAll(@CurrentUser() user: IAuthUser) {
    return this.productsService.findAllBrands(user.tenantId);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update brand' })
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: CreateBrandDto) {
    return this.productsService.updateBrand(id, user.tenantId, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete brand' })
  remove(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.productsService.removeBrand(id, user.tenantId);
  }
}

@Module({
  imports: [InventoryModule],
  controllers: [ProductsController, CategoriesController, BrandsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
