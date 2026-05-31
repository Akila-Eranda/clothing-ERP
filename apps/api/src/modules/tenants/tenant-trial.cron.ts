import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SubscriptionPlan, TenantStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';

@Injectable()
export class TenantTrialCron {
  private readonly logger = new Logger(TenantTrialCron.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Suspend Starter tenants whose trial end date has passed. */
  @Cron('0 3 * * *')
  async expireStarterTrials(): Promise<void> {
    const now = new Date();
    const result = await this.prisma.tenant.updateMany({
      where: {
        plan: SubscriptionPlan.STARTER,
        trialEndsAt: { lt: now },
        status: { in: [TenantStatus.TRIAL, TenantStatus.ACTIVE] },
        subdomain: { not: '__platform_config__' },
      },
      data: { status: TenantStatus.SUSPENDED },
    });
    if (result.count > 0) {
      this.logger.log(`Suspended ${result.count} tenant(s) with expired Starter trials`);
    }
  }
}
