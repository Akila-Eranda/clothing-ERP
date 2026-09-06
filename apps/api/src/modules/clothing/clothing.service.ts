import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  FittingSessionStatus,
  InventoryReservationStatus,
  ProductKind,
  ProductStatus,
  SaleStatus,
  StockMovementType,
} from '@prisma/client';
import { nanoid } from 'nanoid';
import slugify from 'slugify';
import { PrismaService } from '@/prisma/prisma.service';
import { InventoryService } from '@/modules/inventory/inventory.module';
import {
  assertClothingShop,
  assertShopModule,
  assertTenantBranch,
  FASHION_COLOR_PRESETS,
  FITTING_RESERVATION_SOURCE,
  FITTING_SESSION_TIMEOUT_MINUTES,
  formatShelfLocationLabel,
} from './clothing.helpers';
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
  UpdateFloorDto,
  UpdateRackDto,
  UpdateSectionDto,
  UpdateShelfDto,
} from './clothing.dto';

@Injectable()
export class ClothingService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly inventoryService?: InventoryService,
  ) {}

  private async assertLocations(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'storeLocations');
  }

  private async assertColors(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'colorMaster');
  }

  private async assertOutfits(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'outfits');
  }

  private async assertFitting(tenantId: string) {
    await assertShopModule(this.prisma, tenantId, 'fittingRoom');
  }

  private async requireBranch(tenantId: string, branchId: string) {
    await assertTenantBranch(this.prisma, tenantId, branchId);
  }

  // ── Floors ───────────────────────────────────────────────────────────────

  async listFloors(tenantId: string, branchId: string) {
    await this.assertLocations(tenantId);
    await this.requireBranch(tenantId, branchId);
    return this.prisma.storeFloor.findMany({
      where: { tenantId, branchId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createFloor(tenantId: string, dto: CreateFloorDto) {
    await this.assertLocations(tenantId);
    await this.requireBranch(tenantId, dto.branchId);
    return this.prisma.storeFloor.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        name: dto.name.trim(),
        code: dto.code.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateFloor(tenantId: string, id: string, dto: UpdateFloorDto) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeFloor.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Floor not found');
    return this.prisma.storeFloor.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.code != null && { code: dto.code.trim() }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteFloor(tenantId: string, id: string) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeFloor.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Floor not found');
    await this.prisma.storeFloor.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Sections ─────────────────────────────────────────────────────────────

  async listSections(tenantId: string, floorId: string) {
    await this.assertLocations(tenantId);
    if (!floorId) throw new BadRequestException('floorId is required');
    return this.prisma.storeSection.findMany({
      where: { tenantId, floorId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createSection(tenantId: string, dto: CreateSectionDto) {
    await this.assertLocations(tenantId);
    const floor = await this.prisma.storeFloor.findFirst({
      where: { id: dto.floorId, tenantId },
    });
    if (!floor) throw new NotFoundException('Floor not found');
    return this.prisma.storeSection.create({
      data: {
        tenantId,
        branchId: floor.branchId,
        floorId: floor.id,
        name: dto.name.trim(),
        code: dto.code.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateSection(tenantId: string, id: string, dto: UpdateSectionDto) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeSection.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Section not found');
    return this.prisma.storeSection.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.code != null && { code: dto.code.trim() }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteSection(tenantId: string, id: string) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeSection.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Section not found');
    await this.prisma.storeSection.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Racks ────────────────────────────────────────────────────────────────

  async listRacks(tenantId: string, sectionId: string) {
    await this.assertLocations(tenantId);
    if (!sectionId) throw new BadRequestException('sectionId is required');
    return this.prisma.storeRack.findMany({
      where: { tenantId, sectionId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createRack(tenantId: string, dto: CreateRackDto) {
    await this.assertLocations(tenantId);
    const section = await this.prisma.storeSection.findFirst({
      where: { id: dto.sectionId, tenantId },
    });
    if (!section) throw new NotFoundException('Section not found');
    return this.prisma.storeRack.create({
      data: {
        tenantId,
        branchId: section.branchId,
        sectionId: section.id,
        name: dto.name.trim(),
        code: dto.code.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateRack(tenantId: string, id: string, dto: UpdateRackDto) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeRack.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Rack not found');
    return this.prisma.storeRack.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.code != null && { code: dto.code.trim() }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteRack(tenantId: string, id: string) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeRack.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Rack not found');
    await this.prisma.storeRack.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Shelves ──────────────────────────────────────────────────────────────

  async listShelves(tenantId: string, rackId: string) {
    await this.assertLocations(tenantId);
    if (!rackId) throw new BadRequestException('rackId is required');
    return this.prisma.storeShelf.findMany({
      where: { tenantId, rackId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createShelf(tenantId: string, dto: CreateShelfDto) {
    await this.assertLocations(tenantId);
    const rack = await this.prisma.storeRack.findFirst({
      where: { id: dto.rackId, tenantId },
    });
    if (!rack) throw new NotFoundException('Rack not found');
    return this.prisma.storeShelf.create({
      data: {
        tenantId,
        branchId: rack.branchId,
        rackId: rack.id,
        name: dto.name.trim(),
        code: dto.code.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateShelf(tenantId: string, id: string, dto: UpdateShelfDto) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeShelf.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Shelf not found');
    return this.prisma.storeShelf.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.code != null && { code: dto.code.trim() }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteShelf(tenantId: string, id: string) {
    await this.assertLocations(tenantId);
    const existing = await this.prisma.storeShelf.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Shelf not found');
    await this.prisma.storeShelf.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Variant shelf location ───────────────────────────────────────────────

  async setVariantLocation(tenantId: string, dto: SetVariantLocationDto) {
    await this.assertLocations(tenantId);
    await this.requireBranch(tenantId, dto.branchId);
    const shelf = await this.prisma.storeShelf.findFirst({
      where: { id: dto.shelfId, tenantId, branchId: dto.branchId },
    });
    if (!shelf) throw new NotFoundException('Shelf not found for branch');
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.variantId, product: { tenantId } },
    });
    if (!variant) throw new NotFoundException('Variant not found');

    const loc = await this.prisma.variantShelfLocation.upsert({
      where: {
        tenantId_branchId_variantId: {
          tenantId,
          branchId: dto.branchId,
          variantId: dto.variantId,
        },
      },
      create: {
        tenantId,
        branchId: dto.branchId,
        variantId: dto.variantId,
        shelfId: dto.shelfId,
        notes: dto.notes ?? null,
      },
      update: {
        shelfId: dto.shelfId,
        notes: dto.notes ?? null,
      },
      include: {
        shelf: {
          include: {
            rack: { include: { section: { include: { floor: true } } } },
          },
        },
        variant: { select: { id: true, sku: true, name: true, size: true, color: true } },
      },
    });
    return {
      ...loc,
      locationLabel: formatShelfLocationLabel(loc),
    };
  }

  async getVariantLocation(tenantId: string, variantId: string, branchId: string) {
    await this.assertLocations(tenantId);
    await this.requireBranch(tenantId, branchId);
    const loc = await this.prisma.variantShelfLocation.findUnique({
      where: {
        tenantId_branchId_variantId: { tenantId, branchId, variantId },
      },
      include: {
        shelf: {
          include: {
            rack: { include: { section: { include: { floor: true } } } },
          },
        },
        variant: { select: { id: true, sku: true, name: true, size: true, color: true } },
      },
    });
    if (!loc) throw new NotFoundException('Variant location not found');
    return {
      ...loc,
      locationLabel: formatShelfLocationLabel(loc),
    };
  }

  async getLocationTree(tenantId: string, branchId: string) {
    await this.assertLocations(tenantId);
    await this.requireBranch(tenantId, branchId);
    return this.prisma.storeFloor.findMany({
      where: { tenantId, branchId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        sections: {
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            racks: {
              orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
              include: {
                shelves: {
                  orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
                },
              },
            },
          },
        },
      },
    });
  }

  // ── Colors ───────────────────────────────────────────────────────────────

  async listColors(tenantId: string) {
    await this.assertColors(tenantId);
    return this.prisma.fashionColor.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createColor(tenantId: string, dto: CreateFashionColorDto) {
    await this.assertColors(tenantId);
    return this.prisma.fashionColor.create({
      data: {
        tenantId,
        name: dto.name.trim(),
        code: dto.code?.trim() || null,
        hex: dto.hex?.trim() || '#111827',
        swatchUrl: dto.swatchUrl ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateColor(tenantId: string, id: string, dto: UpdateFashionColorDto) {
    await this.assertColors(tenantId);
    const existing = await this.prisma.fashionColor.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Color not found');
    return this.prisma.fashionColor.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.code !== undefined && { code: dto.code?.trim() || null }),
        ...(dto.hex != null && { hex: dto.hex.trim() }),
        ...(dto.swatchUrl !== undefined && { swatchUrl: dto.swatchUrl }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteColor(tenantId: string, id: string) {
    await this.assertColors(tenantId);
    const existing = await this.prisma.fashionColor.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Color not found');
    await this.prisma.fashionColor.delete({ where: { id } });
    return { deleted: true };
  }

  async seedColorPresets(tenantId: string) {
    await this.assertColors(tenantId);
    const existing = await this.prisma.fashionColor.findMany({
      where: { tenantId },
      select: { name: true },
    });
    const existingNames = new Set(existing.map((c) => c.name.toLowerCase()));
    const toCreate = FASHION_COLOR_PRESETS.filter(
      (p) => !existingNames.has(p.name.toLowerCase()),
    );
    if (!toCreate.length) {
      return { created: 0, colors: await this.listColors(tenantId) };
    }
    await this.prisma.fashionColor.createMany({
      data: toCreate.map((p, i) => ({
        tenantId,
        name: p.name,
        code: p.code,
        hex: p.hex,
        sortOrder: i,
        isActive: true,
      })),
    });
    return { created: toCreate.length, colors: await this.listColors(tenantId) };
  }

  // ── Bundles / outfits ────────────────────────────────────────────────────

  async listBundles(tenantId: string) {
    await this.assertOutfits(tenantId);
    const include = {
      variants: { select: { id: true, sku: true, sellingPrice: true, isActive: true } },
      bundleComponents: {
        orderBy: { sortOrder: 'asc' as const },
        include: {
          componentVariant: {
            select: {
              id: true,
              sku: true,
              name: true,
              size: true,
              color: true,
              sellingPrice: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
      },
    };

    const bundles = await this.prisma.product.findMany({
      where: { tenantId, productKind: ProductKind.BUNDLE },
      include,
      orderBy: { createdAt: 'desc' },
    });

    let backfilled = false;
    for (const b of bundles) {
      if (b.variants.length) continue;
      try {
        await this.prisma.productVariant.create({
          data: {
            productId: b.id,
            sku: b.sku,
            name: b.name,
            sellingPrice: b.sellingPrice,
            costPrice: b.costPrice,
            isActive: true,
            sortOrder: 0,
          },
        });
        backfilled = true;
      } catch {
        // Concurrent list or unique race — another request may have created the shell.
      }
    }

    if (!backfilled) return bundles;
    return this.prisma.product.findMany({
      where: { tenantId, productKind: ProductKind.BUNDLE },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  async createBundle(tenantId: string, dto: CreateBundleDto) {
    await this.assertOutfits(tenantId);
    if (!dto.components?.length) {
      throw new BadRequestException('Bundle requires at least one component');
    }

    const variantIds = dto.components.map((c) => c.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, product: { tenantId } },
    });
    if (variants.length !== new Set(variantIds).size) {
      throw new BadRequestException('One or more component variants are invalid');
    }

    const baseSlug = slugify(dto.name, { lower: true, strict: true });
    let slug = baseSlug || `bundle-${nanoid(6)}`;
    let suffix = 1;
    while (await this.prisma.product.findFirst({ where: { tenantId, slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    let sku = dto.sku?.trim() || `BND-${nanoid(8).toUpperCase()}`;
    if (await this.prisma.product.findFirst({ where: { tenantId, sku } })) {
      sku = `BND-${nanoid(8).toUpperCase()}`;
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          slug,
          sku,
          description: dto.description ?? null,
          sellingPrice: dto.sellingPrice ?? 0,
          costPrice: dto.costPrice ?? 0,
          productKind: ProductKind.BUNDLE,
          status: ProductStatus.ACTIVE,
          hasVariants: false,
          trackInventory: false,
        },
      });

      // Sellable shell variant — POS lists variants; stock deducts components on sale.
      await tx.productVariant.create({
        data: {
          productId: product.id,
          sku,
          name: dto.name.trim(),
          sellingPrice: dto.sellingPrice ?? 0,
          costPrice: dto.costPrice ?? 0,
          isActive: true,
          sortOrder: 0,
        },
      });

      await tx.productBundleComponent.createMany({
        data: dto.components.map((c, i) => ({
          tenantId,
          bundleProductId: product.id,
          componentVariantId: c.variantId,
          quantity: c.quantity,
          sortOrder: i,
        })),
      });

      return tx.product.findUnique({
        where: { id: product.id },
        include: {
          variants: { select: { id: true, sku: true, sellingPrice: true, isActive: true } },
          bundleComponents: {
            orderBy: { sortOrder: 'asc' },
            include: {
              componentVariant: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  size: true,
                  color: true,
                  sellingPrice: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  async updateBundle(tenantId: string, productId: string, dto: UpdateBundleDto) {
    await this.assertOutfits(tenantId);
    const existing = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, productKind: ProductKind.BUNDLE },
    });
    if (!existing) throw new NotFoundException('Bundle not found');

    if (dto.components) {
      if (!dto.components.length) {
        throw new BadRequestException('Bundle requires at least one component');
      }
      const variantIds = dto.components.map((c) => c.variantId);
      const variants = await this.prisma.productVariant.findMany({
        where: { id: { in: variantIds }, product: { tenantId } },
      });
      if (variants.length !== new Set(variantIds).size) {
        throw new BadRequestException('One or more component variants are invalid');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: {
          ...(dto.name != null && { name: dto.name.trim() }),
          ...(dto.sellingPrice != null && { sellingPrice: dto.sellingPrice }),
          ...(dto.costPrice != null && { costPrice: dto.costPrice }),
          ...(dto.description !== undefined && { description: dto.description }),
        },
      });

      if (dto.name != null || dto.sellingPrice != null || dto.costPrice != null) {
        const shell = await tx.productVariant.findFirst({
          where: { productId },
          orderBy: { sortOrder: 'asc' },
        });
        if (shell) {
          await tx.productVariant.update({
            where: { id: shell.id },
            data: {
              ...(dto.name != null && { name: dto.name.trim() }),
              ...(dto.sellingPrice != null && { sellingPrice: dto.sellingPrice }),
              ...(dto.costPrice != null && { costPrice: dto.costPrice }),
            },
          });
        }
      }

      if (dto.components) {
        await tx.productBundleComponent.deleteMany({ where: { bundleProductId: productId } });
        await tx.productBundleComponent.createMany({
          data: dto.components.map((c, i) => ({
            tenantId,
            bundleProductId: productId,
            componentVariantId: c.variantId,
            quantity: c.quantity,
            sortOrder: i,
          })),
        });
      }

      return tx.product.findUnique({
        where: { id: productId },
        include: {
          variants: { select: { id: true, sku: true, sellingPrice: true, isActive: true } },
          bundleComponents: {
            orderBy: { sortOrder: 'asc' },
            include: {
              componentVariant: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  size: true,
                  color: true,
                  sellingPrice: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  async getBundleAvailability(tenantId: string, productId: string, branchId: string) {
    await this.assertOutfits(tenantId);
    await this.requireBranch(tenantId, branchId);
    const bundle = await this.prisma.product.findFirst({
      where: { id: productId, tenantId, productKind: ProductKind.BUNDLE },
      include: { bundleComponents: true },
    });
    if (!bundle) throw new NotFoundException('Bundle not found');

    const components = [];
    let availableSets: number | null = null;

    for (const c of bundle.bundleComponents) {
      const invRows = await this.prisma.inventory.findMany({
        where: { tenantId, branchId, variantId: c.componentVariantId },
      });
      const stock = invRows.reduce(
        (sum, r) => sum + Math.max(0, r.quantity - r.reservedQty),
        0,
      );
      const qtyNeeded = c.quantity > 0 ? c.quantity : 1;
      const sets = Math.floor(stock / qtyNeeded);
      availableSets = availableSets == null ? sets : Math.min(availableSets, sets);
      components.push({
        variantId: c.componentVariantId,
        quantityNeeded: c.quantity,
        availableStock: stock,
        availableSets: sets,
      });
    }

    return {
      productId,
      branchId,
      availableSets: availableSets ?? 0,
      components,
    };
  }

  // ── Fitting rooms & sessions ─────────────────────────────────────────────

  async listFittingRooms(tenantId: string, branchId: string) {
    await this.assertFitting(tenantId);
    await this.requireBranch(tenantId, branchId);
    return this.prisma.fittingRoom.findMany({
      where: { tenantId, branchId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createFittingRoom(tenantId: string, dto: CreateFittingRoomDto) {
    await this.assertFitting(tenantId);
    await this.requireBranch(tenantId, dto.branchId);
    return this.prisma.fittingRoom.create({
      data: {
        tenantId,
        branchId: dto.branchId,
        name: dto.name.trim(),
        code: dto.code.trim(),
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async updateFittingRoom(tenantId: string, id: string, dto: UpdateFittingRoomDto) {
    await this.assertFitting(tenantId);
    const existing = await this.prisma.fittingRoom.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Fitting room not found');
    return this.prisma.fittingRoom.update({
      where: { id },
      data: {
        ...(dto.name != null && { name: dto.name.trim() }),
        ...(dto.code != null && { code: dto.code.trim() }),
        ...(dto.isActive != null && { isActive: dto.isActive }),
        ...(dto.sortOrder != null && { sortOrder: dto.sortOrder }),
      },
    });
  }

  async deleteFittingRoom(tenantId: string, id: string) {
    await this.assertFitting(tenantId);
    const existing = await this.prisma.fittingRoom.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Fitting room not found');
    await this.prisma.fittingRoom.delete({ where: { id } });
    return { deleted: true };
  }

  async listFittingSessions(
    tenantId: string,
    branchId: string,
    status?: FittingSessionStatus | string,
  ) {
    await this.assertFitting(tenantId);
    await this.requireBranch(tenantId, branchId);

    // Auto-release abandoned IN_FITTING sessions (no separate job required).
    await this.releaseAbandonedFittingSessions(tenantId, branchId);

    const statuses = status
      ? status
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .filter((s): s is FittingSessionStatus =>
            Object.values(FittingSessionStatus).includes(s as FittingSessionStatus),
          )
      : [];

    return this.prisma.fittingSession.findMany({
      where: {
        tenantId,
        branchId,
        ...(statuses.length === 1
          ? { status: statuses[0] }
          : statuses.length > 1
            ? { status: { in: statuses } }
            : {}),
      },
      include: {
        room: true,
        items: {
          include: {
            variant: {
              select: {
                id: true,
                sku: true,
                name: true,
                size: true,
                color: true,
                product: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
      orderBy: { startedAt: 'desc' },
    });
  }

  /** Cancel IN_FITTING sessions past timeout and release reservations. */
  private async releaseAbandonedFittingSessions(tenantId: string, branchId: string) {
    const cutoff = new Date(
      Date.now() - FITTING_SESSION_TIMEOUT_MINUTES * 60 * 1000,
    );
    const stale = await this.prisma.fittingSession.findMany({
      where: {
        tenantId,
        branchId,
        status: FittingSessionStatus.IN_FITTING,
        startedAt: { lt: cutoff },
      },
      select: { id: true },
      take: 50,
    });
    for (const s of stale) {
      try {
        await this.updateFittingSessionStatus(
          tenantId,
          s.id,
          FittingSessionStatus.CANCELLED,
        );
      } catch {
        // best-effort; do not block listing
      }
    }
  }

  async createFittingSession(
    tenantId: string,
    userId: string | undefined,
    dto: CreateFittingSessionDto,
  ) {
    await this.assertFitting(tenantId);
    await this.requireBranch(tenantId, dto.branchId);
    if (!dto.items?.length) throw new BadRequestException('At least one item is required');

    const room = await this.prisma.fittingRoom.findFirst({
      where: { id: dto.roomId, tenantId, branchId: dto.branchId },
    });
    if (!room) throw new NotFoundException('Fitting room not found for branch');

    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, product: { tenantId } },
    });
    if (variants.length !== new Set(variantIds).size) {
      throw new BadRequestException('One or more variants are invalid');
    }

    const session = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fittingSession.create({
        data: {
          tenantId,
          branchId: dto.branchId,
          roomId: dto.roomId,
          customerName: dto.customerName?.trim() || null,
          customerId: dto.customerId || null,
          staffUserId: userId || null,
          notes: dto.notes ?? null,
          status: FittingSessionStatus.IN_FITTING,
          items: {
            create: dto.items.map((i) => ({
              variantId: i.variantId,
              quantity: i.quantity,
            })),
          },
        },
        include: {
          room: true,
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  size: true,
                  color: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });

      for (const item of dto.items) {
        if (this.inventoryService) {
          await this.inventoryService.reserveStock(
            tenantId,
            dto.branchId,
            item.variantId,
            item.quantity,
            FITTING_RESERVATION_SOURCE,
            created.id,
            userId,
            tx,
          );
        } else {
          const inv = await tx.inventory.findFirst({
            where: { tenantId, branchId: dto.branchId, variantId: item.variantId },
          });
          const onHand = inv?.quantity ?? 0;
          const reserved = inv?.reservedQty ?? 0;
          const available = onHand - reserved;
          if (available < item.quantity) {
            throw new BadRequestException(
              `Insufficient available stock (${available} available, ${item.quantity} requested)`,
            );
          }
          if (inv) {
            await tx.inventory.update({
              where: { id: inv.id },
              data: { reservedQty: { increment: item.quantity } },
            });
          }
          await tx.inventoryReservation.create({
            data: {
              tenantId,
              branchId: dto.branchId,
              variantId: item.variantId,
              quantity: item.quantity,
              sourceType: FITTING_RESERVATION_SOURCE,
              sourceId: created.id,
              createdBy: userId,
            },
          });
        }
      }

      return created;
    });

    return session;
  }

  async updateFittingSessionStatus(
    tenantId: string,
    id: string,
    status: 'RESERVED' | 'SOLD' | 'RETURNED' | 'CANCELLED',
  ) {
    await this.assertFitting(tenantId);
    const session = await this.prisma.fittingSession.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!session) throw new NotFoundException('Fitting session not found');

    const next = status as FittingSessionStatus;
    const terminal: FittingSessionStatus[] = [
      FittingSessionStatus.SOLD,
      FittingSessionStatus.RETURNED,
      FittingSessionStatus.CANCELLED,
    ];

    // Idempotent: already in target (or other terminal) state — no second stock mutation.
    if (session.status === next) {
      return this.prisma.fittingSession.findFirst({
        where: { id, tenantId },
        include: {
          room: true,
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  size: true,
                  color: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    }
    if (terminal.includes(session.status) && session.status !== next) {
      throw new BadRequestException(
        `Fitting session is already ${session.status} and cannot move to ${next}`,
      );
    }

    const shouldRelease =
      next === FittingSessionStatus.RETURNED ||
      next === FittingSessionStatus.CANCELLED ||
      next === FittingSessionStatus.SOLD;

    return this.prisma.$transaction(async (tx) => {
      if (shouldRelease) {
        if (this.inventoryService) {
          // Clear reservation first (same pattern as POS held-bill checkout).
          await this.inventoryService.releaseReservations(
            tenantId,
            FITTING_RESERVATION_SOURCE,
            id,
            next === FittingSessionStatus.SOLD,
            tx,
          );
          // Mark Sold must deduct on-hand — releaseReservations(consume) only clears reservedQty.
          if (next === FittingSessionStatus.SOLD) {
            for (const item of session.items) {
              await this.inventoryService.adjustStock(
                tenantId,
                session.branchId,
                session.staffUserId ?? 'system',
                {
                  variantId: item.variantId,
                  quantity: item.quantity,
                  movementType: StockMovementType.SALE,
                  referenceId: id,
                  referenceType: 'FittingSession',
                },
                tx,
              );
            }
          }
        } else {
          const reservations = await tx.inventoryReservation.findMany({
            where: {
              tenantId,
              sourceType: FITTING_RESERVATION_SOURCE,
              sourceId: id,
              status: InventoryReservationStatus.ACTIVE,
            },
          });
          for (const r of reservations) {
            const inv = await tx.inventory.findFirst({
              where: { tenantId, branchId: r.branchId, variantId: r.variantId },
            });
            if (inv) {
              await tx.inventory.update({
                where: { id: inv.id },
                data: {
                  reservedQty: { decrement: Math.min(r.quantity, inv.reservedQty) },
                  ...(next === FittingSessionStatus.SOLD
                    ? { quantity: { decrement: Math.min(r.quantity, inv.quantity) } }
                    : {}),
                },
              });
            }
            await tx.inventoryReservation.update({
              where: { id: r.id },
              data: {
                status:
                  next === FittingSessionStatus.SOLD
                    ? InventoryReservationStatus.CONSUMED
                    : InventoryReservationStatus.RELEASED,
                releasedAt: new Date(),
              },
            });
          }
        }
      }

      return tx.fittingSession.update({
        where: { id },
        data: {
          status: next,
          ...(next === FittingSessionStatus.RESERVED
            ? {}
            : { endedAt: new Date() }),
        },
        include: {
          room: true,
          items: {
            include: {
              variant: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  size: true,
                  color: true,
                  product: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    });
  }

  // ── Reorder analytics ────────────────────────────────────────────────────

  async getReorderSuggestions(
    tenantId: string,
    branchId: string,
    opts: {
      days?: number;
      productId?: string;
      categoryId?: string;
      brandId?: string;
      collectionId?: string;
      season?: string;
      size?: string;
      color?: string;
      supplierId?: string;
      from?: string;
      to?: string;
      search?: string;
    } = {},
  ) {
    await assertClothingShop(this.prisma, tenantId);
    await this.requireBranch(tenantId, branchId);

    const windowDays = Math.max(1, Math.min(opts.days || 30, 365));
    let since = new Date();
    since.setDate(since.getDate() - windowDays);
    let until: Date | undefined;
    if (opts.from) {
      const parsed = new Date(opts.from);
      if (!Number.isNaN(parsed.getTime())) since = parsed;
    }
    if (opts.to) {
      const parsed = new Date(opts.to);
      if (!Number.isNaN(parsed.getTime())) until = parsed;
    }
    const effectiveDays = Math.max(
      1,
      Math.ceil((Date.now() - since.getTime()) / (24 * 60 * 60 * 1000)),
    );

    const inventory = await this.prisma.inventory.findMany({
      where: {
        tenantId,
        branchId,
        variant: {
          ...(opts.supplierId
            ? {
                supplierAssignments: {
                  some: { tenantId, supplierId: opts.supplierId, isActive: true },
                },
              }
            : {}),
          ...(opts.size
            ? { size: { equals: opts.size, mode: 'insensitive' as const } }
            : {}),
          ...(opts.color
            ? { color: { equals: opts.color, mode: 'insensitive' as const } }
            : {}),
          ...(opts.search
            ? {
                OR: [
                  { sku: { contains: opts.search, mode: 'insensitive' as const } },
                  { name: { contains: opts.search, mode: 'insensitive' as const } },
                  {
                    product: {
                      name: { contains: opts.search, mode: 'insensitive' as const },
                    },
                  },
                ],
              }
            : {}),
          product: {
            ...(opts.productId ? { id: opts.productId } : {}),
            ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
            ...(opts.brandId ? { brandId: opts.brandId } : {}),
            ...(opts.collectionId || opts.season
              ? {
                  collections: {
                    some: {
                      ...(opts.collectionId
                        ? { collectionId: opts.collectionId }
                        : {}),
                      ...(opts.season
                        ? {
                            collection: {
                              season: {
                                equals: opts.season,
                                mode: 'insensitive' as const,
                              },
                            },
                          }
                        : {}),
                    },
                  },
                }
              : {}),
          },
        },
      },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            size: true,
            color: true,
            name: true,
            product: {
              select: {
                id: true,
                name: true,
                brandId: true,
                categoryId: true,
              },
            },
          },
        },
      },
    });

    const clothingRows = inventory.filter(
      (row) => row.variant.size || row.variant.color,
    );
    if (!clothingRows.length) return [];

    const variantIds = clothingRows.map((r) => r.variantId);
    const sales = await this.prisma.saleItem.groupBy({
      by: ['variantId'],
      where: {
        variantId: { in: variantIds },
        sale: {
          tenantId,
          branchId,
          invoiceDate: {
            gte: since,
            ...(until ? { lte: until } : {}),
          },
          status: { in: [SaleStatus.COMPLETED, SaleStatus.PARTIALLY_REFUNDED] },
        },
      },
      _sum: { quantity: true },
    });
    const salesMap = new Map(
      sales.map((s) => [s.variantId!, s._sum.quantity ?? 0]),
    );

    type DemandLevel = 'HIGH' | 'MEDIUM' | 'LOW';
    const suggestions: Array<{
      productName: string;
      productId: string;
      variantId: string;
      size: string | null;
      color: string | null;
      sku: string;
      currentStock: number;
      sales30d: number;
      velocity: number;
      daysOfStock: number | null;
      reorderPoint: number;
      suggestedQty: number;
      reason: string;
      demandLevel: DemandLevel;
    }> = [];

    for (const row of clothingRows) {
      const stock = Math.max(0, row.quantity - row.reservedQty);
      const salesQty = salesMap.get(row.variantId) ?? 0;
      const velocity = salesQty / effectiveDays;
      const daysOfStock = velocity > 0 ? stock / velocity : null;
      const reorderPoint = row.reorderPoint > 0 ? row.reorderPoint : 5;
      const highVelocity = velocity >= 0.5;
      const lowDays =
        daysOfStock != null && daysOfStock < 14 && highVelocity;
      const atReorder = stock <= reorderPoint;

      if (!atReorder && !lowDays) continue;

      let demandLevel: DemandLevel = 'LOW';
      if (velocity >= 1) demandLevel = 'HIGH';
      else if (velocity >= 0.3) demandLevel = 'MEDIUM';

      const target = Math.max(
        reorderPoint * 2,
        row.maxStockLevel > 0 ? row.maxStockLevel : reorderPoint * 2,
        Math.ceil(velocity * 21),
      );
      const suggestedQty = Math.max(1, Math.ceil(target - stock));

      const reasons: string[] = [];
      if (atReorder) reasons.push(`stock ≤ reorder point (${reorderPoint})`);
      if (lowDays) {
        reasons.push(`days of stock ${daysOfStock!.toFixed(1)} < 14 with high velocity`);
      }
      if (demandLevel === 'HIGH' && stock < reorderPoint * 2) {
        reasons.push('High demand + low stock');
      }

      suggestions.push({
        productName: row.variant.product.name,
        productId: row.variant.product.id,
        variantId: row.variantId,
        size: row.variant.size,
        color: row.variant.color,
        sku: row.variant.sku,
        currentStock: stock,
        sales30d: salesQty,
        velocity: Math.round(velocity * 1000) / 1000,
        daysOfStock: daysOfStock == null ? null : Math.round(daysOfStock * 10) / 10,
        reorderPoint,
        suggestedQty,
        reason: reasons.join('; '),
        demandLevel,
      });
    }

    return suggestions
      .sort((a, b) => b.suggestedQty - a.suggestedQty)
      .slice(0, 200);
  }
}
