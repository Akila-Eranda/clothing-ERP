import { PrismaService } from '@/prisma/prisma.service';
import { PLATFORM_CONFIG_SUBDOMAIN } from '@/modules/tenants/subscription-plans';

export const DEFAULT_MAINTENANCE_MESSAGE =
  'Hexalyte is currently in maintenance mode. New logins are disabled and some features may be unavailable.';

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  platformName: string;
}

export async function getMaintenanceStatus(prisma: PrismaService): Promise<MaintenanceStatus> {
  const row = await prisma.tenant.findUnique({
    where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
    select: { settings: true },
  });
  const platform =
    row?.settings && typeof row.settings === 'object'
      ? ((row.settings as { platform?: Record<string, unknown> }).platform ?? {})
      : {};
  return {
    enabled: platform.maintenanceMode === true,
    message:
      typeof platform.maintenanceMessage === 'string' && platform.maintenanceMessage.trim()
        ? platform.maintenanceMessage.trim()
        : DEFAULT_MAINTENANCE_MESSAGE,
    platformName:
      typeof platform.platformName === 'string' && platform.platformName.trim()
        ? platform.platformName.trim()
        : 'Hexalyte',
  };
}

export function isPlatformTenantSlug(slug: string | undefined, platformSlug: string): boolean {
  if (!slug) return false;
  return slug.trim().toLowerCase() === platformSlug.trim().toLowerCase();
}
