import { ForbiddenException } from '@nestjs/common';
import { RoleType, SubscriptionPlan, TenantStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { isStarterTrialExpired } from '@/modules/tenants/subscription-plans';

/**
 * Enforce tenant subscription / trial for shop users.
 * Super Admins skip (platform console may use a demo tenant).
 */
export async function enforceTenantSubscriptionActive(
  prisma: PrismaService,
  tenantId: string,
  userRoles: string[] = [],
): Promise<void> {
  if (userRoles.includes(RoleType.SUPER_ADMIN)) return;

  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) {
    throw new ForbiddenException('Shop not found.');
  }

  if (tenant.status === TenantStatus.CANCELLED) {
    throw new ForbiddenException('This shop has been cancelled. Contact support.');
  }

  const trialExpired =
    tenant.plan === SubscriptionPlan.STARTER &&
    isStarterTrialExpired(tenant.trialEndsAt);

  if (trialExpired && tenant.status !== TenantStatus.SUSPENDED) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { status: TenantStatus.SUSPENDED },
    });
    throw new ForbiddenException(
      'Your 14-day Starter trial has ended. Please upgrade to Professional or Enterprise to continue.',
    );
  }

  if (tenant.status === TenantStatus.SUSPENDED) {
    if (tenant.plan === SubscriptionPlan.STARTER && tenant.trialEndsAt) {
      throw new ForbiddenException(
        'Your 14-day Starter trial has ended. Please upgrade your plan to continue.',
      );
    }
    throw new ForbiddenException('This shop is suspended. Contact support.');
  }
}
