import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, HttpCode, HttpStatus, Header, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiConsumes } from '@nestjs/swagger';
import { AuditLogModule } from '@/modules/audit-log/audit-log.module';
import { CommitImportDto, ProductImportService } from './product-import.service';
import { IMPORT_MAX_BYTES } from './product-import.helper';
import { ProductStatus } from '@prisma/client';
import {
  ProductsService, CreateProductDto, CreateCategoryDto, CreateBrandDto,
  UpdateProductDto, BulkProductStatusDto, ProductStatusDto, AddProductVariantsDto,
} from './products.service';
import { PaginationDto } from '@/common/dto/pagination.dto';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { ForbiddenException } from '@nestjs/common';

@ApiTags('Products')
@ApiBearerAuth('access-token')
@Controller({ path: 'products', version: '1' })
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly importService: ProductImportService,
  ) {}

  @Post()
  @RequirePermissions('products:create')
  @ApiOperation({ summary: 'Create product' })
  create(@CurrentUser() user: IAuthUser, @Body() dto: CreateProductDto) {
    const canManageAllBranches = user.roles.some((role) =>
      role === 'TENANT_ADMIN' || role === 'SUPER_ADMIN',
    );
    if (!canManageAllBranches && !user.branchId) {
      throw new ForbiddenException('Your account must be assigned to a branch to create products.');
    }
    return this.productsService.create(
      user.tenantId,
      canManageAllBranches
        ? dto
        : { ...dto, branchScope: 'SINGLE', branchId: user.branchId },
    );
  }

  // ── Bulk import (Excel / CSV). Needs create + update, so the default Cashier role cannot bulk-import.
  @Get('import/template.xlsx')
  @RequirePermissions('products:create', 'products:update')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="product-import-template.xlsx"')
  @ApiOperation({ summary: 'Excel import template (with instructions and your categories / brands)' })
  async importTemplate(@CurrentUser() user: IAuthUser) {
    return new StreamableFile(await this.importService.buildTemplateXlsx(user.tenantId));
  }

  @Post('import/preview')
  @RequirePermissions('products:create', 'products:update')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: IMPORT_MAX_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Validate an .xlsx / .csv product file (nothing is saved)' })
  importPreview(@CurrentUser() user: IAuthUser, @UploadedFile() file: Express.Multer.File) {
    return this.importService.preview(user.tenantId, file);
  }

  @Post('import/commit')
  @RequirePermissions('products:create', 'products:update')
  @ApiOperation({ summary: 'Import validated rows (max 200 per request; re-validated, duplicates skipped)' })
  importCommit(@CurrentUser() user: IAuthUser, @Body() dto: CommitImportDto) {
    return this.importService.commit(user.tenantId, { id: user.id, branchId: user.branchId }, dto);
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
  bulkStatus(@CurrentUser() user: IAuthUser, @Body() body: BulkProductStatusDto) {
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
  update(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, user.tenantId, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update product status' })
  updateStatus(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: ProductStatusDto) {
    return this.productsService.updateStatus(id, user.tenantId, body.status);
  }

  @Post(':id/variants')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Add variants to existing product' })
  addVariants(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() body: AddProductVariantsDto) {
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
  imports: [InventoryModule, AuditLogModule],
  controllers: [ProductsController, CategoriesController, BrandsController],
  providers: [ProductsService, ProductImportService],
  exports: [ProductsService],
})
export class ProductsModule {}
