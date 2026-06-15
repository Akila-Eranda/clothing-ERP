import { Module } from '@nestjs/common';
import { Controller, Get, Post, Put, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { IsString, IsOptional, IsEmail, MinLength, IsEnum, IsNumber, IsArray } from 'class-validator';
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  PLATFORM_CONFIG_SUBDOMAIN,
  resolvePlanLimits,
  subscriptionFieldsForNewTenant,
  subscriptionFieldsForPlanChange,
  SubscriptionPlanDef,
} from './subscription-plans';
import { TenantTrialCron } from './tenant-trial.cron';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SubscriptionPlan, TenantStatus, UserStatus, ShopType, Prisma, ReceiptPrintStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RoleType } from '@prisma/client';
import { KeycloakAdminService } from '@/modules/auth/keycloak-admin.service';
import { AuthModule } from '@/modules/auth/auth.module';
import { getShopProfile, SHOP_TYPE_LIST, slugifyCategory } from '@/shared/shop-profiles';
import { ensureSystemRoles } from '@/modules/roles/default-system-roles';
import { TenantSslProvisioner } from '@/shared/tenant-ssl.provisioner';
import { TenantSslListener } from './tenant-ssl.listener';
import { getMaintenanceStatus } from '@/shared/maintenance.helper';
import { MailModule, MailService } from '@/modules/mail/mail.module';
import {
  DEFAULT_BILLING_SETTINGS,
  PlatformBillingSettings,
  buildSubscriptionInvoice,
  buildSubscriptionInvoiceHtml,
  SubscriptionInvoiceData,
} from './subscription-invoice.helper';

export class ReceiptSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() shopName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() tagline?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() logoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address1?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address2?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() headerText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() footerText?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paperWidth?: string;
  @ApiPropertyOptional() @IsOptional() showTax?: boolean;
  @ApiPropertyOptional() @IsOptional() showDiscount?: boolean;
  @ApiPropertyOptional() @IsOptional() showCashier?: boolean;
  @ApiPropertyOptional() @IsOptional() showCustomer?: boolean;
  @ApiPropertyOptional() @IsOptional() showBarcode?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() fontSize?: string;
  @ApiPropertyOptional() @IsOptional() printServerEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() printServerUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() printServerKey?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() printMode?: string;
  @ApiPropertyOptional() @IsOptional() autoPrintAfterSale?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() printerName?: string;
}

export class ReceiptPrintDispatchDto {
  @ApiProperty() @IsString() html: string;
  @ApiProperty() @IsString() printType: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() paperWidth?: string;
}

interface StoredReceiptSettings {
  shopName: string;
  tagline: string;
  logoUrl: string;
  address1: string;
  address2: string;
  phone: string;
  email: string;
  website: string;
  headerText: string;
  footerText: string;
  paperWidth: string;
  showTax: boolean;
  showDiscount: boolean;
  showCashier: boolean;
  showCustomer: boolean;
  showBarcode: boolean;
  fontSize: string;
  printServerEnabled: boolean;
  printServerUrl: string;
  printServerKey: string;
  printMode: string;
  autoPrintAfterSale: boolean;
  printerName: string;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

export class RegisterTenantDto {
  @ApiProperty() @IsString() companyName: string;
  @ApiProperty() @IsString() subdomain: string;
  @ApiProperty() @IsEmail() adminEmail: string;
  @ApiProperty() @IsString() @MinLength(8, { message: 'adminPassword must be at least 8 characters' }) adminPassword: string;
  @ApiProperty() @IsString() adminFirstName: string;
  @ApiProperty() @IsString() adminLastName: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(SubscriptionPlan) plan?: SubscriptionPlan;
  @ApiPropertyOptional({ enum: ShopType, default: ShopType.CLOTHING })
  @IsOptional()
  @IsEnum(ShopType)
  shopType?: ShopType;
}

export class UpdateTenantAdminDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(TenantStatus) status?: TenantStatus;
  @ApiPropertyOptional() @IsOptional() @IsEnum(SubscriptionPlan) plan?: SubscriptionPlan;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxUsers?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxBranches?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxProducts?: number;
}

export class UpdatePlatformConfigDto {
  @ApiPropertyOptional() @IsOptional() @IsString() platformName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supportEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultCurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultTimezone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultLanguage?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() trialDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultPlan?: string;
  @ApiPropertyOptional() @IsOptional() maintenanceMode?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() maintenanceMessage?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() sessionTimeoutMins?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxLoginAttempts?: number;
  @ApiPropertyOptional() @IsOptional() requireMFA?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsNumber() passwordMinLength?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() allowedOrigins?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() apiRateLimitPerMin?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notificationEmail?: string;
}

export class UpdateBillingSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsString() companyLegalName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyBrandName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyWebsite?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyEmail?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companyPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccountNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankSwift?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() invoiceDueDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() taxRate?: number;
}

export class SendSubscriptionInvoiceDto {
  @ApiPropertyOptional() @IsOptional() @IsNumber() months?: number;
  @ApiPropertyOptional() @IsOptional() @IsEmail() email?: string;
}

interface PlatformConfigSettings {
  platformName: string;
  supportEmail: string;
  defaultCurrency: string;
  defaultTimezone: string;
  defaultLanguage: string;
  trialDays: number;
  defaultPlan: string;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  sessionTimeoutMins: number;
  maxLoginAttempts: number;
  requireMFA: boolean;
  passwordMinLength: number;
  allowedOrigins: string;
  apiRateLimitPerMin: number;
  notificationEmail: string;
}

const DEFAULT_PLATFORM_CONFIG: PlatformConfigSettings = {
  platformName: 'HexaOne',
  supportEmail: 'support@hexalyte.com',
  defaultCurrency: 'LKR',
  defaultTimezone: 'Asia/Colombo',
  defaultLanguage: 'en',
  trialDays: 7,
  defaultPlan: 'STARTER',
  maintenanceMode: false,
  maintenanceMessage: 'Hexalyte is currently in maintenance mode. New logins are disabled and some features may be unavailable.',
  sessionTimeoutMins: 480,
  maxLoginAttempts: 5,
  requireMFA: false,
  passwordMinLength: 8,
  allowedOrigins: '',
  apiRateLimitPerMin: 100,
  notificationEmail: '',
};

export class UpdatePlanCatalogDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() price?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() currency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() interval?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) features?: string[];
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxUsers?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxBranches?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() maxProducts?: number;
}

@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly kcAdmin: KeycloakAdminService,
    private readonly sslProvisioner: TenantSslProvisioner,
    private readonly mailService: MailService,
  ) {}

  private async seedTenantDefaults(
    tx: Prisma.TransactionClient,
    tenantId: string,
    shopType: ShopType,
  ): Promise<void> {
    const profile = getShopProfile(shopType);
    for (const name of profile.defaultCategories) {
      await tx.category.upsert({
        where: { tenantId_slug: { tenantId, slug: slugifyCategory(name) } },
        update: {},
        create: { tenantId, name, slug: slugifyCategory(name) },
      });
    }
    const existingSettings = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (existingSettings?.settings as Record<string, unknown>) ?? {};
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...settings,
          shopProfile: {
            type: profile.type,
            defaultUnit: profile.defaultUnit,
            units: profile.units,
            modules: profile.modules,
            labelTemplates: profile.labelTemplates,
            variantAttributes: profile.variantAttributes,
          },
        } as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async provisionKeycloak(
    result: {
      tenant: { id: string; subdomain: string; name: string };
      adminUser: { id: string; email: string; firstName: string | null; lastName: string | null };
    },
    adminEmail: string,
    adminPassword: string,
    dto: RegisterTenantDto,
  ): Promise<void> {
    try {
      const groupId = await this.kcAdmin.createOrGetGroup(result.tenant.subdomain, result.tenant.name);
      await this.kcAdmin.createKcUser({
        dbUserId:    result.adminUser.id,
        tenantId:    result.tenant.id,
        tenantSlug:  result.tenant.subdomain,
        email:       adminEmail,
        firstName:   dto.adminFirstName,
        lastName:    dto.adminLastName,
        role:        'TENANT_ADMIN',
        password:    adminPassword,
        groupId,
      });
    } catch (err) {
      console.error('[KC] Tenant provisioning failed:', err);
    }
  }

  async register(dto: RegisterTenantDto) {
    const maintenance = await getMaintenanceStatus(this.prisma);
    if (maintenance.enabled) {
      throw new ServiceUnavailableException(maintenance.message);
    }

    const existing = await this.prisma.tenant.findFirst({
      where: { subdomain: dto.subdomain },
    });
    if (existing) throw new ConflictException('Subdomain already in use');

    const adminEmail = dto.adminEmail.trim().toLowerCase();
    const adminPassword = dto.adminPassword?.trim();
    if (!adminPassword || adminPassword.length < 8) {
      throw new BadRequestException('Password is required and must be at least 8 characters');
    }

    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    if (dto.subdomain === PLATFORM_CONFIG_SUBDOMAIN) {
      throw new BadRequestException('This subdomain is reserved');
    }

    const plan = dto.plan ?? SubscriptionPlan.STARTER;
    const shopType = dto.shopType ?? ShopType.CLOTHING;
    const catalog = await this.getMergedSubscriptionPlans();
    const limits = resolvePlanLimits(plan, catalog);
    const subscription = subscriptionFieldsForNewTenant(plan);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: dto.companyName,
          subdomain: dto.subdomain,
          email: adminEmail,
          phone: dto.phone,
          country: dto.country ?? 'IN',
          currency: dto.currency ?? 'INR',
          timezone: dto.timezone ?? 'Asia/Kolkata',
          plan,
          shopType,
          status: subscription.status,
          trialEndsAt: subscription.trialEndsAt,
          maxUsers: limits.maxUsers,
          maxBranches: limits.maxBranches,
          maxProducts: limits.maxProducts,
        },
      });

      const branch = await tx.branch.create({
        data: {
          tenantId: tenant.id,
          name: `${dto.companyName} - Main`,
          code: 'HO-001',
          isDefault: true,
        },
      });

      const adminRole = await tx.role.create({
        data: {
          tenantId: tenant.id,
          name: 'Tenant Admin',
          type: RoleType.TENANT_ADMIN,
          isSystem: true,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          tenantId: tenant.id,
          branchId: branch.id,
          email: adminEmail,
          firstName: dto.adminFirstName,
          lastName: dto.adminLastName,
          passwordHash,
          status: UserStatus.ACTIVE,
          emailVerified: true,
          roles: { create: [{ roleId: adminRole.id }] },
        },
      });

      await this.seedTenantDefaults(tx, tenant.id, shopType);
      await ensureSystemRoles(tx, tenant.id);

      return {
        tenant,
        branch,
        adminUser: {
          id: adminUser.id,
          email: adminUser.email,
          firstName: adminUser.firstName,
          lastName: adminUser.lastName,
        },
        initialPassword: adminPassword,
      };
    }).then((result) => {
      this.eventEmitter.emit('tenant.registered', {
        email: adminEmail,
        name: dto.companyName,
        subdomain: dto.subdomain,
        adminName: `${dto.adminFirstName} ${dto.adminLastName}`,
        initialPassword: adminPassword,
      });
      this.provisionKeycloak(result, adminEmail, adminPassword, dto);
      return result;
    });
  }

  async provisionTenantSsl(subdomain: string) {
    await this.sslProvisioner.provisionNewTenant(subdomain);
    return {
      subdomain,
      url: this.sslProvisioner.tenantUrl(subdomain),
      message: 'DNS and SSL renewal queued',
    };
  }

  async provisionSslById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: { subdomain: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.provisionTenantSsl(tenant.subdomain);
  }

  private async getPlatformConfigRow() {
    return this.prisma.tenant.findUnique({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      select: { settings: true },
    });
  }

  private async getPlanCatalogOverrides(): Promise<Partial<Record<SubscriptionPlan, Partial<SubscriptionPlanDef>>>> {
    const row = await this.getPlatformConfigRow();
    if (!row?.settings || typeof row.settings !== 'object') return {};
    const catalog = (row.settings as { planCatalog?: Partial<Record<SubscriptionPlan, Partial<SubscriptionPlanDef>>> })
      .planCatalog;
    return catalog ?? {};
  }

  async getPlatformConfig(): Promise<PlatformConfigSettings> {
    const row = await this.getPlatformConfigRow();
    const stored = (row?.settings as { platform?: Partial<PlatformConfigSettings> } | null)?.platform ?? {};
    return { ...DEFAULT_PLATFORM_CONFIG, ...stored };
  }

  async getPlatformStatus() {
    return getMaintenanceStatus(this.prisma);
  }

  private async getBillingSettingsInternal(): Promise<PlatformBillingSettings> {
    const row = await this.getPlatformConfigRow();
    const stored =
      row?.settings && typeof row.settings === 'object'
        ? ((row.settings as { billing?: Partial<PlatformBillingSettings> }).billing ?? {})
        : {};
    return { ...DEFAULT_BILLING_SETTINGS, ...stored };
  }

  async getBillingSettings(): Promise<PlatformBillingSettings> {
    return this.getBillingSettingsInternal();
  }

  async updateBillingSettings(dto: UpdateBillingSettingsDto): Promise<PlatformBillingSettings> {
    const row = await this.getPlatformConfigRow();
    const currentSettings =
      row?.settings && typeof row.settings === 'object' ? (row.settings as Record<string, unknown>) : {};
    const currentBilling = (currentSettings.billing as Partial<PlatformBillingSettings> | undefined) ?? {};
    const billing = { ...DEFAULT_BILLING_SETTINGS, ...currentBilling, ...dto };
    await this.prisma.tenant.upsert({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      create: {
        subdomain: PLATFORM_CONFIG_SUBDOMAIN,
        name: 'Platform Configuration',
        email: 'platform@internal.local',
        status: TenantStatus.ACTIVE,
        plan: SubscriptionPlan.CUSTOM,
        maxUsers: 1,
        maxBranches: 0,
        maxProducts: 0,
        settings: { ...currentSettings, billing },
      },
      update: {
        settings: { ...currentSettings, billing },
      },
    });
    return billing;
  }

  async generateSubscriptionInvoice(tenantId: string, months = 1): Promise<SubscriptionInvoiceData> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, email: true, plan: true, subdomain: true },
    });
    if (!tenant || tenant.subdomain === PLATFORM_CONFIG_SUBDOMAIN) {
      throw new NotFoundException('Tenant not found');
    }
    const plans = await this.getMergedSubscriptionPlans();
    const plan = plans.find((p) => p.key === tenant.plan);
    if (!plan) throw new BadRequestException('Plan not found for tenant');
    if (plan.price <= 0) {
      throw new BadRequestException('Cannot invoice a custom/zero-price plan without manual pricing');
    }
    const billing = await this.getBillingSettingsInternal();
    const m = Math.max(1, Math.min(months, 24));
    return buildSubscriptionInvoice(tenant, plan, billing, m);
  }

  async sendSubscriptionInvoice(
    tenantId: string,
    dto: SendSubscriptionInvoiceDto,
  ): Promise<{ sent: boolean; email: string; invoice: SubscriptionInvoiceData }> {
    const months = dto.months ?? 1;
    const invoice = await this.generateSubscriptionInvoice(tenantId, months);
    const email = (dto.email?.trim() || invoice.tenantEmail).toLowerCase();
    if (!email) throw new BadRequestException('No recipient email');

    const html = buildSubscriptionInvoiceHtml(invoice, true);
    const subject = `Subscription Invoice ${invoice.invoiceNumber} — ${invoice.planName} Plan`;
    await this.mailService.send(email, subject, html);

    return { sent: true, email, invoice };
  }

  async updatePlatformConfig(dto: UpdatePlatformConfigDto): Promise<PlatformConfigSettings> {
    const row = await this.getPlatformConfigRow();
    const currentSettings =
      row?.settings && typeof row.settings === 'object' ? (row.settings as Record<string, unknown>) : {};
    const currentPlatform = (currentSettings.platform as Partial<PlatformConfigSettings> | undefined) ?? {};
    const platform = { ...DEFAULT_PLATFORM_CONFIG, ...currentPlatform, ...dto };
    await this.prisma.tenant.upsert({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      create: {
        subdomain: PLATFORM_CONFIG_SUBDOMAIN,
        name: 'Platform Configuration',
        email: 'platform@internal.local',
        status: TenantStatus.ACTIVE,
        plan: SubscriptionPlan.CUSTOM,
        maxUsers: 1,
        maxBranches: 0,
        maxProducts: 0,
        settings: { ...currentSettings, platform },
      },
      update: {
        settings: { ...currentSettings, platform },
      },
    });
    return platform;
  }

  async getPlatformOverview() {
    const [billing, tenants, userCount] = await Promise.all([
      this.getBillingSummary(),
      this.prisma.tenant.findMany({
        where: { subdomain: { not: PLATFORM_CONFIG_SUBDOMAIN } },
        include: { _count: { select: { users: true, branches: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.user.count({
        where: { tenant: { subdomain: { not: PLATFORM_CONFIG_SUBDOMAIN } } },
      }),
    ]);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const planBreakdown = ['STARTER', 'PROFESSIONAL', 'ENTERPRISE', 'CUSTOM'].map((plan) => ({
      plan,
      count: tenants.filter((t) => t.plan === plan).length,
    }));

    const trialsExpiring = tenants
      .filter((t) => t.status === 'TRIAL' && t.trialEndsAt && t.trialEndsAt <= in7Days && t.trialEndsAt >= now)
      .map((t) => ({
        id: t.id,
        name: t.name,
        subdomain: t.subdomain,
        trialEndsAt: t.trialEndsAt!.toISOString(),
        daysLeft: Math.ceil((t.trialEndsAt!.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      }))
      .sort((a, b) => a.trialEndsAt.localeCompare(b.trialEndsAt))
      .slice(0, 10);

    const alerts: { type: string; severity: 'info' | 'warning' | 'error'; message: string; href?: string; tenantId?: string }[] = [];

    if (billing.trialExpiringSoon > 0) {
      alerts.push({
        type: 'trial_expiring',
        severity: 'warning',
        message: `${billing.trialExpiringSoon} trial(s) expiring within 7 days`,
        href: '/admin/subscriptions',
      });
    }
    const suspended = tenants.filter((t) => t.status === 'SUSPENDED').length;
    if (suspended > 0) {
      alerts.push({
        type: 'suspended',
        severity: 'warning',
        message: `${suspended} suspended tenant(s)`,
        href: '/admin/tenants?status=SUSPENDED',
      });
    }
    const expiredTrials = tenants.filter(
      (t) => t.status === 'TRIAL' && t.trialEndsAt && t.trialEndsAt < now,
    ).length;
    if (expiredTrials > 0) {
      alerts.push({
        type: 'trial_expired',
        severity: 'error',
        message: `${expiredTrials} expired trial(s) need action`,
        href: '/admin/subscriptions',
      });
    }

    return {
      stats: {
        totalTenants: tenants.length,
        activeTenants: tenants.filter((t) => t.status === 'ACTIVE').length,
        suspendedTenants: suspended,
        trialTenants: billing.trialTenants,
        totalUsers: userCount,
        newThisMonth: tenants.filter((t) => t.createdAt >= monthStart).length,
        mrr: billing.mrr,
        arr: billing.arr,
      },
      planBreakdown,
      alerts,
      recentTenants: tenants.slice(0, 8).map((t) => ({
        id: t.id,
        name: t.name,
        subdomain: t.subdomain,
        email: t.email,
        plan: t.plan,
        status: t.status,
        shopType: t.shopType,
        createdAt: t.createdAt.toISOString(),
        userCount: t._count.users,
        branchCount: t._count.branches,
      })),
      trialsExpiring,
      billing: {
        mrr: billing.mrr,
        arr: billing.arr,
        trialExpiringSoon: billing.trialExpiringSoon,
        byPlan: billing.byPlan,
      },
    };
  }

  private async savePlanCatalogOverrides(
    overrides: Partial<Record<SubscriptionPlan, Partial<SubscriptionPlanDef>>>,
  ): Promise<void> {
    const row = await this.getPlatformConfigRow();
    const currentSettings =
      row?.settings && typeof row.settings === 'object' ? (row.settings as Record<string, unknown>) : {};
    await this.prisma.tenant.upsert({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      create: {
        subdomain: PLATFORM_CONFIG_SUBDOMAIN,
        name: 'Platform Configuration',
        email: 'platform@internal.local',
        status: TenantStatus.ACTIVE,
        plan: SubscriptionPlan.CUSTOM,
        maxUsers: 1,
        maxBranches: 0,
        maxProducts: 0,
        settings: { ...currentSettings, planCatalog: overrides },
      },
      update: {
        settings: { ...currentSettings, planCatalog: overrides },
      },
    });
  }

  async getMergedSubscriptionPlans(): Promise<SubscriptionPlanDef[]> {
    const overrides = await this.getPlanCatalogOverrides();
    return DEFAULT_SUBSCRIPTION_PLANS.map((plan) => ({
      ...plan,
      ...(overrides[plan.key] ?? {}),
      key: plan.key,
      id: plan.id,
    }));
  }

  async getSubscriptionPlansWithStats() {
    const plans = await this.getMergedSubscriptionPlans();
    const counts = await this.prisma.tenant.groupBy({
      by: ['plan'],
      where: { subdomain: { not: PLATFORM_CONFIG_SUBDOMAIN } },
      _count: { _all: true },
    });
    const countMap = Object.fromEntries(counts.map((c) => [c.plan, c._count._all]));
    return plans.map((plan) => ({
      ...plan,
      tenantCount: countMap[plan.key] ?? 0,
    }));
  }

  async getBillingSummary() {
    const plans = await this.getMergedSubscriptionPlans();
    const priceMap = Object.fromEntries(plans.map((p) => [p.key, p.price]));
    const tenants = await this.prisma.tenant.findMany({
      where: { subdomain: { not: PLATFORM_CONFIG_SUBDOMAIN } },
      select: { id: true, name: true, plan: true, status: true, trialEndsAt: true, billingEmail: true, createdAt: true },
    });
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    let mrr = 0;
    const byPlan: Record<string, { count: number; active: number; mrr: number }> = {};
    const invoices: { tenantId: string; tenantName: string; plan: string; amount: number; status: string; dueDate: string | null }[] = [];

    for (const t of tenants) {
      const price = priceMap[t.plan] ?? 0;
      const isPaying = t.status === 'ACTIVE' && price > 0;
      if (isPaying) mrr += price;
      if (!byPlan[t.plan]) byPlan[t.plan] = { count: 0, active: 0, mrr: 0 };
      byPlan[t.plan].count += 1;
      if (t.status === 'ACTIVE' || t.status === 'TRIAL') byPlan[t.plan].active += 1;
      if (isPaying) byPlan[t.plan].mrr += price;

      if (t.status === 'TRIAL' && t.trialEndsAt) {
        invoices.push({
          tenantId: t.id,
          tenantName: t.name,
          plan: t.plan,
          amount: price,
          status: t.trialEndsAt <= now ? 'TRIAL_EXPIRED' : 'TRIAL',
          dueDate: t.trialEndsAt.toISOString(),
        });
      } else if (isPaying) {
        const due = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        invoices.push({
          tenantId: t.id,
          tenantName: t.name,
          plan: t.plan,
          amount: price,
          status: 'DUE',
          dueDate: due.toISOString(),
        });
      }
    }

    const trialExpiringSoon = tenants.filter(
      (t) => t.status === 'TRIAL' && t.trialEndsAt && t.trialEndsAt <= in7Days && t.trialEndsAt >= now,
    ).length;

    return {
      mrr,
      arr: mrr * 12,
      totalTenants: tenants.length,
      activeTenants: tenants.filter((t) => t.status === 'ACTIVE').length,
      trialTenants: tenants.filter((t) => t.status === 'TRIAL').length,
      trialExpiringSoon,
      byPlan,
      recentInvoices: invoices
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
        .slice(0, 50),
    };
  }

  async updateSubscriptionPlanCatalog(planKey: SubscriptionPlan, dto: UpdatePlanCatalogDto) {
    const base = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.key === planKey);
    if (!base) throw new NotFoundException('Plan not found');
    const overrides = await this.getPlanCatalogOverrides();
    overrides[planKey] = { ...(overrides[planKey] ?? {}), ...dto, key: planKey, id: base.id };
    await this.savePlanCatalogOverrides(overrides);
    const merged = await this.getMergedSubscriptionPlans();
    return merged.find((p) => p.key === planKey)!;
  }

  async findAll(filters?: { search?: string; status?: string; plan?: string }) {
    const where = {
      subdomain: { not: PLATFORM_CONFIG_SUBDOMAIN },
      ...(filters?.status && filters.status !== 'ALL' && {
        status: filters.status as TenantStatus,
      }),
      ...(filters?.plan && filters.plan !== 'ALL' && {
        plan: filters.plan as SubscriptionPlan,
      }),
      ...(filters?.search?.trim() && {
        OR: [
          { name: { contains: filters.search.trim(), mode: 'insensitive' as const } },
          { subdomain: { contains: filters.search.trim(), mode: 'insensitive' as const } },
          { email: { contains: filters.search.trim(), mode: 'insensitive' as const } },
        ],
      }),
    };
    return this.prisma.tenant.findMany({
      where,
      include: { _count: { select: { users: true, branches: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateById(id: string, dto: UpdateTenantAdminDto) {
    const existing = await this.prisma.tenant.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Tenant not found');
    if (existing.subdomain === PLATFORM_CONFIG_SUBDOMAIN) {
      throw new ForbiddenException('Cannot modify platform configuration tenant');
    }
    const catalog = await this.getMergedSubscriptionPlans();
    const plan = dto.plan ?? existing.plan;
    const limits = dto.plan !== undefined ? resolvePlanLimits(plan, catalog) : {};
    const subscription =
      dto.plan !== undefined && dto.plan !== existing.plan
        ? subscriptionFieldsForPlanChange(dto.plan)
        : {};
    return this.prisma.tenant.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.plan !== undefined && {
          plan: dto.plan,
          ...limits,
          ...subscription,
        }),
        ...(dto.maxUsers !== undefined && { maxUsers: dto.maxUsers }),
        ...(dto.maxBranches !== undefined && { maxBranches: dto.maxBranches }),
        ...(dto.maxProducts !== undefined && { maxProducts: dto.maxProducts }),
      },
      include: { _count: { select: { users: true, branches: true } } },
    });
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        branches: true,
        _count: { select: { users: true, branches: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async getMyTenant(tenantId: string) {
    return this.findOne(tenantId);
  }

  async resolvePublicBySubdomain(subdomain: string) {
    const slug = subdomain.trim().toLowerCase();
    if (!slug || slug === PLATFORM_CONFIG_SUBDOMAIN) {
      throw new NotFoundException('Workspace not found');
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { subdomain: slug },
      select: { name: true, subdomain: true, shopType: true, status: true },
    });
    if (!tenant || tenant.status === 'SUSPENDED' || tenant.status === 'CANCELLED') {
      throw new NotFoundException('Workspace not found');
    }
    return tenant;
  }

  async update(id: string, dto: Partial<RegisterTenantDto>) {
    return this.prisma.tenant.update({
      where: { id },
      data: {
        name: dto.companyName,
        phone: dto.phone,
        country: dto.country,
        currency: dto.currency,
        timezone: dto.timezone,
      },
    });
  }

  async getReceiptSettings(tenantId: string): Promise<StoredReceiptSettings> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true, name: true, phone: true, email: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const s = (tenant.settings as Record<string, unknown>) ?? {};
    const receipt = (s['receipt'] as Record<string, unknown>) ?? {};
    return {
      shopName:     str(receipt['shopName'], tenant.name),
      tagline:      str(receipt['tagline']),
      logoUrl:      str(receipt['logoUrl']),
      address1:     str(receipt['address1']),
      address2:     str(receipt['address2']),
      phone:        str(receipt['phone'], tenant.phone ?? ''),
      email:        str(receipt['email'], tenant.email ?? ''),
      website:      str(receipt['website']),
      headerText:   str(receipt['headerText']),
      footerText:   str(receipt['footerText'], 'Thank you for shopping with us!'),
      paperWidth:   str(receipt['paperWidth'], '80mm'),
      showTax:      bool(receipt['showTax'], true),
      showDiscount: bool(receipt['showDiscount'], true),
      showCashier:  bool(receipt['showCashier'], true),
      showCustomer: bool(receipt['showCustomer'], true),
      showBarcode:  bool(receipt['showBarcode'], false),
      fontSize:     str(receipt['fontSize'], 'medium'),
      printServerEnabled: bool(receipt['printServerEnabled']),
      printServerUrl:     str(receipt['printServerUrl']),
      printServerKey:     str(receipt['printServerKey']),
      printMode:          str(receipt['printMode'], 'auto'),
      autoPrintAfterSale: bool(receipt['autoPrintAfterSale']),
      printerName:        str(receipt['printerName']),
    };
  }

  async listReceiptPrintLogs(tenantId: string, limit = 50, page = 1) {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = Math.max(page - 1, 0) * take;
    const [data, total] = await Promise.all([
      this.prisma.receiptPrintLog.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take,
        skip,
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.receiptPrintLog.count({ where: { tenantId } }),
    ]);
    return { data, total, page, limit: take };
  }

  private async forwardToPrintServer(
    url: string,
    key: string,
    payload: { html: string; invoiceNumber?: string; paperWidth?: string; printType: string; printerName?: string },
  ) {
    const base = url.replace(/\/+$/, '');
    const res = await fetch(`${base}/v1/print`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'x-print-key': key } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new BadRequestException(text || `Print server returned ${res.status}`);
    }
    return res.json().catch(() => ({ ok: true }));
  }

  async testPrintServer(tenantId: string, userId: string) {
    const settings = await this.getReceiptSettings(tenantId);
    if (!settings.printServerUrl) {
      throw new BadRequestException('Print server URL is not configured');
    }
    const html = `<!DOCTYPE html><html><body style="font-family:monospace;padding:8mm"><h2>${settings.shopName}</h2><p>Print server test — ${new Date().toLocaleString()}</p></body></html>`;
    try {
      await this.forwardToPrintServer(settings.printServerUrl, settings.printServerKey ?? '', {
        html,
        printType: 'TEST',
        paperWidth: settings.paperWidth,
        printerName: settings.printerName,
      });
      await this.prisma.receiptPrintLog.create({
        data: {
          tenantId,
          userId,
          printType: 'TEST',
          status: ReceiptPrintStatus.SUCCESS,
          printMode: 'server',
          printServerUrl: settings.printServerUrl,
          printerName: settings.printerName || null,
          metadata: { message: 'Test print dispatched' },
        },
      });
      return { ok: true, message: 'Print server connected and test job sent' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Print server unreachable';
      await this.prisma.receiptPrintLog.create({
        data: {
          tenantId,
          userId,
          printType: 'TEST',
          status: ReceiptPrintStatus.FAILED,
          printMode: 'server',
          printServerUrl: settings.printServerUrl,
          printerName: settings.printerName || null,
          errorMessage: message,
        },
      });
      throw new BadRequestException(message);
    }
  }

  async dispatchReceiptPrint(
    tenantId: string,
    userId: string,
    branchId: string | undefined,
    dto: ReceiptPrintDispatchDto,
  ) {
    const settings = await this.getReceiptSettings(tenantId);
    const printType = (['SALE', 'PRE_BILL', 'RETURN', 'TEST'].includes(dto.printType)
      ? dto.printType
      : 'SALE') as 'SALE' | 'PRE_BILL' | 'RETURN' | 'TEST';
    const mode = settings.printMode ?? 'auto';
    const useServer = settings.printServerEnabled && settings.printServerUrl;

    let status: ReceiptPrintStatus = ReceiptPrintStatus.BROWSER_FALLBACK;
    let errorMessage: string | undefined;
    let serverUsed = false;

    if (useServer && (mode === 'server' || mode === 'auto')) {
      try {
        await this.forwardToPrintServer(settings.printServerUrl!, settings.printServerKey ?? '', {
          html: dto.html,
          invoiceNumber: dto.invoiceNumber,
          paperWidth: dto.paperWidth ?? settings.paperWidth,
          printType,
          printerName: settings.printerName,
        });
        status = ReceiptPrintStatus.SUCCESS;
        serverUsed = true;
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Print server error';
        status = mode === 'server' ? ReceiptPrintStatus.FAILED : ReceiptPrintStatus.BROWSER_FALLBACK;
      }
    } else if (mode === 'server') {
      status = ReceiptPrintStatus.FAILED;
      errorMessage = 'Print server is disabled or URL missing';
    }

    const log = await this.prisma.receiptPrintLog.create({
      data: {
        tenantId,
        branchId: branchId ?? null,
        userId,
        printType,
        invoiceNumber: dto.invoiceNumber ?? null,
        status,
        printMode: serverUsed ? 'server' : 'browser',
        printServerUrl: settings.printServerUrl || null,
        printerName: settings.printerName || null,
        errorMessage: errorMessage ?? null,
        metadata: { paperWidth: dto.paperWidth ?? settings.paperWidth, htmlLength: dto.html.length },
      },
    });

    return {
      logId: log.id,
      status,
      serverUsed,
      browserFallback: !serverUsed && status !== ReceiptPrintStatus.FAILED,
      errorMessage,
    };
  }

  async saveReceiptSettings(tenantId: string, dto: ReceiptSettingsDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const existing = (tenant.settings as Record<string, unknown>) ?? {};
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...existing, receipt: { ...dto } } },
    });
    return this.getReceiptSettings(tenantId);
  }
}

@ApiTags('Tenants')
@Controller({ path: 'tenants', version: '1' })
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Public()
  @Get('shop-types')
  @ApiOperation({ summary: 'List available shop verticals (clothing, grocery, etc.)' })
  listShopTypes() {
    return SHOP_TYPE_LIST.map(({ type, label, labelSi, emoji, description }) => ({
      type,
      label,
      labelSi,
      emoji,
      description,
    }));
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new tenant (SaaS onboarding)' })
  register(@Body() dto: RegisterTenantDto) {
    return this.tenantsService.register(dto);
  }

  @Public()
  @Get('platform-status')
  @ApiOperation({ summary: 'Public platform maintenance status' })
  getPlatformStatus() {
    return this.tenantsService.getPlatformStatus();
  }

  @Public()
  @Get('resolve/:subdomain')
  @ApiOperation({ summary: 'Public workspace lookup for login branding' })
  resolveBySubdomain(@Param('subdomain') subdomain: string) {
    return this.tenantsService.resolvePublicBySubdomain(subdomain);
  }

  @Get('me')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get current tenant details' })
  getMyTenant(@CurrentUser() user: IAuthUser) {
    return this.tenantsService.getMyTenant(user.tenantId);
  }

  @Put('me')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update tenant settings' })
  update(@CurrentUser() user: IAuthUser, @Body() dto: Partial<RegisterTenantDto>) {
    return this.tenantsService.update(user.tenantId, dto);
  }

  @Get('receipt-settings')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Get receipt/thermal print settings' })
  getReceiptSettings(@CurrentUser() user: IAuthUser) {
    return this.tenantsService.getReceiptSettings(user.tenantId);
  }

  @Put('receipt-settings')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Save receipt/thermal print settings' })
  saveReceiptSettings(@CurrentUser() user: IAuthUser, @Body() dto: ReceiptSettingsDto) {
    return this.tenantsService.saveReceiptSettings(user.tenantId, dto);
  }

  @Get('receipt-print/logs')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List receipt print logs for current tenant' })
  listReceiptPrintLogs(
    @CurrentUser() user: IAuthUser,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.tenantsService.listReceiptPrintLogs(
      user.tenantId,
      limit ? parseInt(limit, 10) : 50,
      page ? parseInt(page, 10) : 1,
    );
  }

  @Post('receipt-print/dispatch')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Dispatch receipt to store print server and log' })
  dispatchReceiptPrint(@CurrentUser() user: IAuthUser, @Body() dto: ReceiptPrintDispatchDto) {
    return this.tenantsService.dispatchReceiptPrint(user.tenantId, user.id, user.branchId, dto);
  }

  @Post('receipt-print/test-server')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN, RoleType.BRANCH_MANAGER)
  @ApiOperation({ summary: 'Send test print job to configured store print server' })
  testPrintServer(@CurrentUser() user: IAuthUser) {
    return this.tenantsService.testPrintServer(user.tenantId, user.id);
  }

  @Get()
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all tenants (Super Admin only)' })
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('plan') plan?: string,
  ) {
    return this.tenantsService.findAll({ search, status, plan });
  }

  @Get('subscription-plans')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'List subscription plan catalog with tenant counts' })
  getSubscriptionPlans() {
    return this.tenantsService.getSubscriptionPlansWithStats();
  }

  @Get('billing-summary')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Platform MRR, trials, and billing invoices' })
  getBillingSummary() {
    return this.tenantsService.getBillingSummary();
  }

  @Get('platform-overview')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Platform dashboard overview with stats and alerts' })
  getPlatformOverview() {
    return this.tenantsService.getPlatformOverview();
  }

  @Get('platform-config')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get platform-wide configuration' })
  getPlatformConfig() {
    return this.tenantsService.getPlatformConfig();
  }

  @Put('platform-config')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update platform-wide configuration' })
  updatePlatformConfig(@Body() dto: UpdatePlatformConfigDto) {
    return this.tenantsService.updatePlatformConfig(dto);
  }

  @Get('platform-billing')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get invoice & bank billing settings' })
  getBillingSettings() {
    return this.tenantsService.getBillingSettings();
  }

  @Put('platform-billing')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update invoice & bank billing settings' })
  updateBillingSettings(@Body() dto: UpdateBillingSettingsDto) {
    return this.tenantsService.updateBillingSettings(dto);
  }

  @Put('subscription-plans/:planKey')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update subscription plan catalog entry' })
  updateSubscriptionPlan(
    @Param('planKey') planKey: SubscriptionPlan,
    @Body() dto: UpdatePlanCatalogDto,
  ) {
    return this.tenantsService.updateSubscriptionPlanCatalog(planKey, dto);
  }

  @Get(':id')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get tenant by ID (Super Admin only)' })
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post(':id/provision-ssl')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Provision DNS + SSL for tenant subdomain (Super Admin)' })
  provisionSsl(@Param('id') id: string) {
    return this.tenantsService.provisionSslById(id);
  }

  @Get(':id/subscription-invoice')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Generate subscription invoice preview for tenant' })
  getSubscriptionInvoice(@Param('id') id: string, @Query('months') months?: string) {
    const m = months ? parseInt(months, 10) : 1;
    return this.tenantsService.generateSubscriptionInvoice(id, Number.isFinite(m) ? m : 1);
  }

  @Post(':id/subscription-invoice/send')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Email subscription invoice to tenant client' })
  sendSubscriptionInvoice(@Param('id') id: string, @Body() dto: SendSubscriptionInvoiceDto) {
    return this.tenantsService.sendSubscriptionInvoice(id, dto);
  }

  @Put(':id')
  @ApiBearerAuth('access-token')
  @Roles(RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update tenant by ID (Super Admin only)' })
  updateById(@Param('id') id: string, @Body() dto: UpdateTenantAdminDto) {
    return this.tenantsService.updateById(id, dto);
  }
}

@Module({
  imports: [AuthModule, MailModule],
  controllers: [TenantsController],
  providers: [TenantsService, TenantTrialCron, TenantSslProvisioner, TenantSslListener],
  exports: [TenantsService, TenantSslProvisioner],
})
export class TenantsModule {}
