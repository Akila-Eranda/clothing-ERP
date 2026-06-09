import { ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { getShopProfile, type ShopProfile } from '@/shared/shop-profiles';

export type ShopModuleKey = keyof ShopProfile['modules'];

export async function assertShopModule(
  prisma: PrismaService,
  tenantId: string,
  mod: ShopModuleKey,
): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { shopType: true },
  });
  const profile = getShopProfile(tenant?.shopType);
  if (!profile.modules[mod]) {
    throw new ForbiddenException(
      `The "${mod}" feature is not available for ${profile.label}. Change business type or use a supported workflow.`,
    );
  }
}
