import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';
import { ClothingService } from './clothing.service';
import {
  CreateBundleDto,
  CreateFashionColorDto,
  CreateFittingRoomDto,
  CreateFittingSessionDto,
  CreateFloorDto,
  CreateRackDto,
  CreateSectionDto,
  CreateShelfDto,
  SetVariantLocationDto,
  UpdateBundleDto,
  UpdateFashionColorDto,
  UpdateFittingRoomDto,
  UpdateFittingSessionStatusDto,
  UpdateFloorDto,
  UpdateRackDto,
  UpdateSectionDto,
  UpdateShelfDto,
} from './clothing.dto';

@ApiTags('Clothing')
@ApiBearerAuth('access-token')
@Controller({ path: 'clothing', version: '1' })
export class ClothingController {
  constructor(private readonly clothing: ClothingService) {}

  // ── Store locations ──────────────────────────────────────────────────────

  @Get('floors')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List store floors' })
  listFloors(@CurrentUser() user: IAuthUser, @Query('branchId') branchId: string) {
    return this.clothing.listFloors(user.tenantId, branchId);
  }

  @Post('floors')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Create store floor' })
  createFloor(@CurrentUser() user: IAuthUser, @Body() dto: CreateFloorDto) {
    return this.clothing.createFloor(user.tenantId, dto);
  }

  @Put('floors/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update store floor' })
  updateFloor(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFloorDto,
  ) {
    return this.clothing.updateFloor(user.tenantId, id, dto);
  }

  @Delete('floors/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Delete store floor' })
  deleteFloor(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.clothing.deleteFloor(user.tenantId, id);
  }

  @Get('sections')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List store sections' })
  listSections(@CurrentUser() user: IAuthUser, @Query('floorId') floorId: string) {
    return this.clothing.listSections(user.tenantId, floorId);
  }

  @Post('sections')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Create store section' })
  createSection(@CurrentUser() user: IAuthUser, @Body() dto: CreateSectionDto) {
    return this.clothing.createSection(user.tenantId, dto);
  }

  @Put('sections/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update store section' })
  updateSection(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.clothing.updateSection(user.tenantId, id, dto);
  }

  @Delete('sections/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Delete store section' })
  deleteSection(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.clothing.deleteSection(user.tenantId, id);
  }

  @Get('racks')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List store racks' })
  listRacks(@CurrentUser() user: IAuthUser, @Query('sectionId') sectionId: string) {
    return this.clothing.listRacks(user.tenantId, sectionId);
  }

  @Post('racks')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Create store rack' })
  createRack(@CurrentUser() user: IAuthUser, @Body() dto: CreateRackDto) {
    return this.clothing.createRack(user.tenantId, dto);
  }

  @Put('racks/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update store rack' })
  updateRack(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateRackDto,
  ) {
    return this.clothing.updateRack(user.tenantId, id, dto);
  }

  @Delete('racks/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Delete store rack' })
  deleteRack(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.clothing.deleteRack(user.tenantId, id);
  }

  @Get('shelves')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List store shelves' })
  listShelves(@CurrentUser() user: IAuthUser, @Query('rackId') rackId: string) {
    return this.clothing.listShelves(user.tenantId, rackId);
  }

  @Post('shelves')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Create store shelf' })
  createShelf(@CurrentUser() user: IAuthUser, @Body() dto: CreateShelfDto) {
    return this.clothing.createShelf(user.tenantId, dto);
  }

  @Put('shelves/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update store shelf' })
  updateShelf(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateShelfDto,
  ) {
    return this.clothing.updateShelf(user.tenantId, id, dto);
  }

  @Delete('shelves/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Delete store shelf' })
  deleteShelf(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.clothing.deleteShelf(user.tenantId, id);
  }

  @Put('variant-location')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Assign variant to shelf location' })
  setVariantLocation(@CurrentUser() user: IAuthUser, @Body() dto: SetVariantLocationDto) {
    return this.clothing.setVariantLocation(user.tenantId, dto);
  }

  @Get('variant-location/:variantId')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Get variant shelf location' })
  getVariantLocation(
    @CurrentUser() user: IAuthUser,
    @Param('variantId') variantId: string,
    @Query('branchId') branchId: string,
  ) {
    return this.clothing.getVariantLocation(user.tenantId, variantId, branchId);
  }

  @Get('location-tree')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Nested floors → sections → racks → shelves' })
  locationTree(@CurrentUser() user: IAuthUser, @Query('branchId') branchId: string) {
    return this.clothing.getLocationTree(user.tenantId, branchId);
  }

  // ── Colors ───────────────────────────────────────────────────────────────

  @Get('colors')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List fashion colors' })
  listColors(@CurrentUser() user: IAuthUser) {
    return this.clothing.listColors(user.tenantId);
  }

  @Post('colors/seed-presets')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Seed fashion color presets (idempotent)' })
  seedColors(@CurrentUser() user: IAuthUser) {
    return this.clothing.seedColorPresets(user.tenantId);
  }

  @Post('colors')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Create fashion color' })
  createColor(@CurrentUser() user: IAuthUser, @Body() dto: CreateFashionColorDto) {
    return this.clothing.createColor(user.tenantId, dto);
  }

  @Put('colors/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update fashion color' })
  updateColor(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFashionColorDto,
  ) {
    return this.clothing.updateColor(user.tenantId, id, dto);
  }

  @Delete('colors/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Delete fashion color' })
  deleteColor(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.clothing.deleteColor(user.tenantId, id);
  }

  // ── Bundles / outfits ────────────────────────────────────────────────────

  @Get('bundles')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List outfit bundles' })
  listBundles(@CurrentUser() user: IAuthUser) {
    return this.clothing.listBundles(user.tenantId);
  }

  @Post('bundles')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Create outfit bundle product' })
  createBundle(@CurrentUser() user: IAuthUser, @Body() dto: CreateBundleDto) {
    return this.clothing.createBundle(user.tenantId, dto);
  }

  @Put('bundles/:productId')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update outfit bundle' })
  updateBundle(
    @CurrentUser() user: IAuthUser,
    @Param('productId') productId: string,
    @Body() dto: UpdateBundleDto,
  ) {
    return this.clothing.updateBundle(user.tenantId, productId, dto);
  }

  @Get('bundles/:productId/availability')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'Bundle availability (min component sets)' })
  bundleAvailability(
    @CurrentUser() user: IAuthUser,
    @Param('productId') productId: string,
    @Query('branchId') branchId: string,
  ) {
    return this.clothing.getBundleAvailability(user.tenantId, productId, branchId);
  }

  // ── Fitting rooms ────────────────────────────────────────────────────────

  @Get('fitting-rooms')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List fitting rooms' })
  listFittingRooms(@CurrentUser() user: IAuthUser, @Query('branchId') branchId: string) {
    return this.clothing.listFittingRooms(user.tenantId, branchId);
  }

  @Post('fitting-rooms')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Create fitting room' })
  createFittingRoom(@CurrentUser() user: IAuthUser, @Body() dto: CreateFittingRoomDto) {
    return this.clothing.createFittingRoom(user.tenantId, dto);
  }

  @Put('fitting-rooms/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update fitting room' })
  updateFittingRoom(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFittingRoomDto,
  ) {
    return this.clothing.updateFittingRoom(user.tenantId, id, dto);
  }

  @Delete('fitting-rooms/:id')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Delete fitting room' })
  deleteFittingRoom(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.clothing.deleteFittingRoom(user.tenantId, id);
  }

  @Get('fitting-sessions')
  @RequirePermissions('products:read')
  @ApiOperation({ summary: 'List fitting sessions' })
  listFittingSessions(
    @CurrentUser() user: IAuthUser,
    @Query('branchId') branchId: string,
    @Query('status') status?: string,
  ) {
    return this.clothing.listFittingSessions(user.tenantId, branchId, status);
  }

  @Post('fitting-sessions')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Start fitting session (reserves stock)' })
  createFittingSession(
    @CurrentUser() user: IAuthUser,
    @Body() dto: CreateFittingSessionDto,
  ) {
    return this.clothing.createFittingSession(user.tenantId, user.id, dto);
  }

  @Patch('fitting-sessions/:id/status')
  @RequirePermissions('products:update')
  @ApiOperation({ summary: 'Update fitting session status' })
  updateFittingSessionStatus(
    @CurrentUser() user: IAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateFittingSessionStatusDto,
  ) {
    return this.clothing.updateFittingSessionStatus(user.tenantId, id, dto.status);
  }

  // ── Reorder analytics ────────────────────────────────────────────────────

  @Get('reorder-suggestions')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Clothing reorder suggestions (velocity-based)' })
  reorderSuggestions(
    @CurrentUser() user: IAuthUser,
    @Query('branchId') branchId: string,
    @Query('days') days?: string,
    @Query('productId') productId?: string,
    @Query('categoryId') categoryId?: string,
    @Query('brandId') brandId?: string,
    @Query('collectionId') collectionId?: string,
    @Query('season') season?: string,
    @Query('size') size?: string,
    @Query('color') color?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.clothing.getReorderSuggestions(user.tenantId, branchId, {
      days: days ? parseInt(days, 10) : 30,
      productId,
      categoryId,
      brandId,
      collectionId,
      season,
      size,
      color,
      supplierId,
      from,
      to,
      search,
    });
  }
}
