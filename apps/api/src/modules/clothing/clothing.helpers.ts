import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { getShopProfile, ShopType } from '@/shared/shop-profiles';
import { assertShopModule } from '@/shared/shop-module.helper';

export { assertShopModule };
export type { ShopModuleKey } from '@/shared/shop-module.helper';

/** Fashion color presets — hex codes match apps/web clothing-fashion.ts */
export const FASHION_COLOR_PRESETS = [
  { name: 'Black', hex: '#111827', code: 'BLK' },
  { name: 'White', hex: '#F9FAFB', code: 'WHT' },
  { name: 'Navy', hex: '#1E3A5F', code: 'NVY' },
  { name: 'Red', hex: '#DC2626', code: 'RED' },
  { name: 'Green', hex: '#16A34A', code: 'GRN' },
  { name: 'Grey', hex: '#6B7280', code: 'GRY' },
  { name: 'Beige', hex: '#D4C4A8', code: 'BGE' },
  { name: 'Pink', hex: '#EC4899', code: 'PNK' },
  { name: 'Maroon', hex: '#7F1D1D', code: 'MRN' },
  { name: 'Blue', hex: '#2563EB', code: 'BLU' },
] as const;

export const FITTING_RESERVATION_SOURCE = 'FITTING_ROOM';

/** Default auto-release for abandoned fitting sessions (minutes). */
export const FITTING_SESSION_TIMEOUT_MINUTES = 90;

/** Compact cashier-friendly location: "Rack A04 / Shelf 02" */
export function formatShelfLocationLabel(loc: {
  shelf?: {
    name?: string | null;
    code?: string | null;
    rack?: {
      name?: string | null;
      code?: string | null;
      section?: {
        name?: string | null;
        code?: string | null;
        floor?: { name?: string | null; code?: string | null } | null;
      } | null;
    } | null;
  } | null;
} | null | undefined): string | null {
  if (!loc?.shelf) return null;
  const shelf = loc.shelf;
  const rack = shelf.rack;
  const section = rack?.section;
  const parts = [
    rack?.code || rack?.name,
    shelf.code || shelf.name,
  ].filter((p): p is string => Boolean(p && String(p).trim()));
  if (parts.length) return parts.join(' / ');
  const fallback = [
    section?.code || section?.name,
    shelf.name,
  ].filter((p): p is string => Boolean(p && String(p).trim()));
  return fallback.length ? fallback.join(' / ') : null;
}

export async function assertClothingShop(
  prisma: PrismaService,
  tenantId: string,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { shopType: true },
  });
  const profile = getShopProfile(tenant?.shopType);
  if (profile.type !== ShopType.CLOTHING) {
    throw new ForbiddenException(
      `Clothing features are only available for Clothing shops (current: ${profile.label}).`,
    );
  }
}

/** Ensure branchId belongs to the authenticated tenant (blocks cross-tenant probes). */
export async function assertTenantBranch(
  prisma: PrismaService,
  tenantId: string,
  branchId: string,
): Promise<void> {
  if (!branchId?.trim()) {
    throw new ForbiddenException('branchId is required');
  }
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, tenantId },
    select: { id: true },
  });
  if (!branch) {
    throw new ForbiddenException('Branch is not available for this tenant');
  }
}
