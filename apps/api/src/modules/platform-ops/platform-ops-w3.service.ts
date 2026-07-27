import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  RoleType,
  SaleStatus,
  TenantStatus,
  UserStatus,
} from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { WhatsappService } from '@/modules/whatsapp/whatsapp.service'
import { AuthService } from '@/modules/auth/auth.service'
import {
  DEFAULT_SUBSCRIPTION_PLANS,
  PLATFORM_CONFIG_SUBDOMAIN,
  SubscriptionPlanDef,
} from '@/modules/tenants/subscription-plans'
import { ensureSystemRoles } from '@/modules/roles/default-system-roles'

const EXCLUDED_SUBDOMAINS = [PLATFORM_CONFIG_SUBDOMAIN]

@Injectable()
export class PlatformOpsW3Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsapp: WhatsappService,
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private tenantWhere() {
    return {
      subdomain: { notIn: EXCLUDED_SUBDOMAINS },
    }
  }

  // ── Ops notifications feed ─────────────────────────────────
  async platformNotifications() {
    const now = new Date()
    const in3d = new Date(now.getTime() + 3 * 86400_000)
    const ago30d = new Date(now.getTime() - 30 * 86400_000)
    const ago24h = new Date(now.getTime() - 86400_000)

    const [expiringTrials, suspendedTenants, newTenants, newSuggestions] =
      await Promise.all([
        this.prisma.tenant.findMany({
          where: {
            ...this.tenantWhere(),
            status: TenantStatus.TRIAL,
            trialEndsAt: { lte: in3d, gte: now },
          },
          select: { id: true, name: true, trialEndsAt: true, plan: true },
        }),
        this.prisma.tenant.findMany({
          where: {
            ...this.tenantWhere(),
            status: TenantStatus.SUSPENDED,
            updatedAt: { gte: ago30d },
          },
          select: { id: true, name: true, plan: true, updatedAt: true },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        }),
        this.prisma.tenant.findMany({
          where: { ...this.tenantWhere(), createdAt: { gte: ago24h } },
          select: { id: true, name: true, plan: true, createdAt: true, email: true },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.featureSuggestion.findMany({
          where: { status: 'NEW', createdAt: { gte: ago30d } },
          select: {
            id: true,
            title: true,
            category: true,
            createdAt: true,
            tenantId: true,
            tenant: { select: { name: true } },
            submittedBy: { select: { email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: 'desc' },
          take: 40,
        }),
      ])

    type Notif = {
      id: string
      type: string
      title: string
      message: string
      severity: string
      createdAt: string
      tenantId?: string
    }
    const items: Notif[] = []

    for (const t of expiringTrials) {
      const days = Math.round(
        (new Date(t.trialEndsAt!).getTime() - now.getTime()) / 86400_000,
      )
      items.push({
        id: `trial-exp-${t.id}`,
        type: 'TRIAL_EXPIRING',
        title: `Trial expiring in ${days}d`,
        message: `${t.name} (${t.plan}) trial ends on ${new Date(t.trialEndsAt!).toLocaleDateString('en-LK', { day: 'numeric', month: 'short' })}`,
        severity: days <= 1 ? 'ERROR' : 'WARN',
        createdAt: now.toISOString(),
        tenantId: t.id,
      })
    }

    for (const t of suspendedTenants) {
      items.push({
        id: `suspended-${t.id}`,
        type: 'TENANT_SUSPENDED',
        title: 'Tenant suspended',
        message: `${t.name} (${t.plan}) was suspended.`,
        severity: 'ERROR',
        createdAt: t.updatedAt.toISOString(),
        tenantId: t.id,
      })
    }

    for (const t of newTenants) {
      items.push({
        id: `new-tenant-${t.id}`,
        type: 'NEW_TENANT',
        title: 'New tenant signup',
        message: `${t.name} registered on ${t.plan}${t.email ? ` · ${t.email}` : ''}`,
        severity: 'INFO',
        createdAt: t.createdAt.toISOString(),
        tenantId: t.id,
      })
    }

    for (const s of newSuggestions) {
      const who =
        [s.submittedBy?.firstName, s.submittedBy?.lastName].filter(Boolean).join(' ') ||
        s.submittedBy?.email ||
        'User'
      items.push({
        id: `suggestion-${s.id}`,
        type: 'FEATURE_SUGGESTION',
        title: `New feature suggestion · ${s.category}`,
        message: `${s.tenant?.name || 'Tenant'}: ${s.title} (by ${who})`,
        severity: 'INFO',
        createdAt: s.createdAt.toISOString(),
        tenantId: s.tenantId,
      })
    }

    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { data: items, total: items.length }
  }

  // ── Analytics ──────────────────────────────────────────────
  private async planPriceMap(): Promise<Record<string, number>> {
    const row = await this.prisma.tenant.findUnique({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      select: { settings: true },
    })
    const catalog =
      (row?.settings as { planCatalog?: Record<string, Partial<SubscriptionPlanDef>> } | null)
        ?.planCatalog ?? {}
    const map: Record<string, number> = {}
    for (const p of DEFAULT_SUBSCRIPTION_PLANS) {
      map[p.key] = catalog[p.key]?.price ?? p.price
    }
    return map
  }

  async analytics() {
    const now = new Date()
    const sevenDaysAgo = new Date(now)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const thirtyDaysAgo = new Date(now)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    const from12 = new Date(now)
    from12.setMonth(from12.getMonth() - 11)
    from12.setDate(1)
    from12.setHours(0, 0, 0, 0)

    const priceMap = await this.planPriceMap()

    const [
      salesAgg,
      totalCustomers,
      tenantsByPlan,
      newTenantsThisMonth,
      activeTenantsCount,
      tenants,
    ] = await Promise.all([
      this.prisma.sale.aggregate({
        where: { status: SaleStatus.COMPLETED, isReturn: false },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.customer.count(),
      this.prisma.tenant.groupBy({
        by: ['plan'],
        where: this.tenantWhere(),
        _count: true,
      }),
      this.prisma.tenant.count({
        where: { ...this.tenantWhere(), createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.tenant.count({
        where: {
          ...this.tenantWhere(),
          status: { in: [TenantStatus.ACTIVE, TenantStatus.TRIAL] },
        },
      }),
      this.prisma.tenant.findMany({
        where: this.tenantWhere(),
        select: {
          id: true,
          name: true,
          plan: true,
          status: true,
          createdAt: true,
          _count: { select: { sales: true, users: true } },
        },
      }),
    ])

    const gmvByTenant = await this.prisma.sale.groupBy({
      by: ['tenantId'],
      where: {
        status: SaleStatus.COMPLETED,
        isReturn: false,
        createdAt: { gte: thirtyDaysAgo },
      },
      _sum: { total: true },
      orderBy: { _sum: { total: 'desc' } },
      take: 10,
    })
    const tenantNameMap = Object.fromEntries(tenants.map((t) => [t.id, t]))
    const topTenantsByRevenue = gmvByTenant.map((row) => ({
      id: row.tenantId,
      name: tenantNameMap[row.tenantId]?.name ?? row.tenantId,
      plan: tenantNameMap[row.tenantId]?.plan,
      status: tenantNameMap[row.tenantId]?.status,
      gmv30d: row._sum.total ?? 0,
      salesCount: tenantNameMap[row.tenantId]?._count.sales ?? 0,
      usersCount: tenantNameMap[row.tenantId]?._count.users ?? 0,
      estimatedMrr:
        tenantNameMap[row.tenantId]?.status === TenantStatus.ACTIVE
          ? priceMap[tenantNameMap[row.tenantId].plan] ?? 0
          : 0,
    }))

    // Prefer Prisma aggregates over raw SQL (portable across column quoting)
    const gmvMonths: { month: string; gmv: number; invoices: number }[] = []
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const agg = await this.prisma.sale.aggregate({
        where: {
          status: SaleStatus.COMPLETED,
          isReturn: false,
          createdAt: { gte: start, lt: end },
        },
        _sum: { total: true },
        _count: true,
      })
      gmvMonths.push({
        month: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        gmv: agg._sum.total ?? 0,
        invoices: agg._count,
      })
    }

    const tenantMonths: { month: string; newTenants: number; cumulative: number }[] = []
    let cumulative = await this.prisma.tenant.count({
      where: { ...this.tenantWhere(), createdAt: { lt: from12 } },
    })
    for (let i = 11; i >= 0; i--) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const cnt = await this.prisma.tenant.count({
        where: { ...this.tenantWhere(), createdAt: { gte: start, lt: end } },
      })
      cumulative += cnt
      tenantMonths.push({
        month: start.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        newTenants: cnt,
        cumulative,
      })
    }

    const activeSalesTenantIds = await this.prisma.sale.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { tenantId: true },
      distinct: ['tenantId'],
    })
    const activeSet = new Set(activeSalesTenantIds.map((s) => s.tenantId))
    const inactiveTenants = tenants
      .filter(
        (t) =>
          (t.status === TenantStatus.ACTIVE || t.status === TenantStatus.TRIAL) &&
          !activeSet.has(t.id),
      )
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        name: t.name,
        plan: t.plan,
        status: t.status,
        createdAt: t.createdAt,
      }))

    return {
      totalGMV: salesAgg._sum.total ?? 0,
      totalInvoices: salesAgg._count,
      totalCustomers,
      newTenantsThisMonth,
      activeTenantsCount,
      tenantsByPlan: tenantsByPlan.map((r) => ({
        plan: r.plan,
        count: r._count,
        estimatedMrr: (priceMap[r.plan] ?? 0) * r._count,
      })),
      topTenantsByRevenue,
      gmvMonths,
      tenantMonths,
      inactiveTenants,
    }
  }

  async mrrChart() {
    const priceMap = await this.planPriceMap()
    const months: { month: string; mrr: number }[] = []
    const now = new Date()
    for (let i = 11; i >= 0; i--) {
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
      const labelDate = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const tenants = await this.prisma.tenant.findMany({
        where: {
          ...this.tenantWhere(),
          createdAt: { lt: end },
          status: { in: [TenantStatus.ACTIVE, TenantStatus.TRIAL] },
        },
        select: { plan: true, status: true },
      })
      let mrr = 0
      for (const t of tenants) {
        if (t.status === TenantStatus.ACTIVE) mrr += priceMap[t.plan] ?? 0
      }
      months.push({
        month: labelDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }),
        mrr,
      })
    }
    return months
  }

  // ── IAM ────────────────────────────────────────────────────
  async revokeTenantSessions(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant || EXCLUDED_SUBDOMAINS.includes(tenant.subdomain)) {
      throw new NotFoundException('Tenant not found')
    }
    const users = await this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true },
    })
    const userIds = users.map((u) => u.id)
    if (!userIds.length) {
      return { revokedSessions: 0, revokedRefreshTokens: 0, userCount: 0 }
    }

    const [sessions, tokens] = await Promise.all([
      this.prisma.session.updateMany({
        where: { userId: { in: userIds }, isActive: true },
        data: { isActive: false },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId: { in: userIds }, isRevoked: false },
        data: { isRevoked: true },
      }),
    ])

    return {
      revokedSessions: sessions.count,
      revokedRefreshTokens: tokens.count,
      userCount: userIds.length,
      tenantId,
    }
  }

  private async resolvePlatformTenant() {
    const slug =
      this.config.get<string>('app.platformTenantSubdomain') || 'platform'
    const tenant = await this.prisma.tenant.findFirst({
      where: { subdomain: slug },
    })
    if (!tenant) {
      throw new NotFoundException(
        `Platform tenant "${slug}" not found. Seed PLATFORM_TENANT_SUBDOMAIN first.`,
      )
    }
    return tenant
  }

  async listPlatformAdmins() {
    const platform = await this.resolvePlatformTenant()
    const users = await this.prisma.user.findMany({
      where: {
        tenantId: platform.id,
        roles: { some: { role: { type: RoleType.SUPER_ADMIN } } },
      },
      include: {
        roles: { include: { role: true } },
      },
      orderBy: { createdAt: 'asc' },
    })
    return users.map((u) => ({
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      status: u.status,
      lastLoginAt: u.lastLoginAt,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => r.role.type),
    }))
  }

  async createPlatformAdmin(body: {
    email: string
    password: string
    firstName: string
    lastName: string
    phone?: string
  }) {
    if (!body.email?.trim() || !body.password || !body.firstName?.trim() || !body.lastName?.trim()) {
      throw new BadRequestException('email, password, firstName, lastName are required')
    }
    if (body.password.length < 8) {
      throw new BadRequestException('password must be at least 8 characters')
    }

    const platform = await this.resolvePlatformTenant()
    await ensureSystemRoles(this.prisma, platform.id)

    const existing = await this.prisma.user.findFirst({
      where: { tenantId: platform.id, email: body.email.toLowerCase() },
    })
    if (existing) throw new BadRequestException('Email already in use on platform tenant')

    let role = await this.prisma.role.findFirst({
      where: { tenantId: platform.id, type: RoleType.SUPER_ADMIN },
    })
    if (!role) {
      role = await this.prisma.role.create({
        data: {
          tenantId: platform.id,
          name: 'Super Admin',
          type: RoleType.SUPER_ADMIN,
          isSystem: true,
        },
      })
    }

    const passwordHash = await this.authService.hashPassword(body.password)
    const user = await this.prisma.user.create({
      data: {
        tenantId: platform.id,
        email: body.email.toLowerCase(),
        firstName: body.firstName.trim(),
        lastName: body.lastName.trim(),
        phone: body.phone,
        passwordHash,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        roles: { create: [{ roleId: role.id }] },
      },
      include: { roles: { include: { role: true } } },
    })

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      status: user.status,
      roles: user.roles.map((r) => r.role.type),
    }
  }

  async deactivatePlatformAdmin(adminId: string, actorId: string) {
    if (adminId === actorId) {
      throw new ForbiddenException('Cannot deactivate your own admin account')
    }
    const platform = await this.resolvePlatformTenant()
    const user = await this.prisma.user.findFirst({
      where: {
        id: adminId,
        tenantId: platform.id,
        roles: { some: { role: { type: RoleType.SUPER_ADMIN } } },
      },
    })
    if (!user) throw new NotFoundException('Platform admin not found')

    await this.prisma.user.update({
      where: { id: adminId },
      data: { status: UserStatus.INACTIVE },
    })
    await this.prisma.session.updateMany({
      where: { userId: adminId, isActive: true },
      data: { isActive: false },
    })
    await this.prisma.refreshToken.updateMany({
      where: { userId: adminId, isRevoked: false },
      data: { isRevoked: true },
    })
    return { ok: true, id: adminId }
  }

  async forceResetPassword(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { tenant: { select: { subdomain: true } } },
    })
    if (!user) throw new NotFoundException('User not found')

    // Trigger the same flow as forgot-password by returning a stub reset path.
    // Actual token email is sent via AuthService.forgotPassword when email SMTP is configured.
    await this.authService.forgotPassword({ email: user.email })
    const frontend = (this.config.get<string>('app.frontendUrl') || 'http://localhost:3000').replace(
      /\/$/,
      '',
    )
    return {
      ok: true,
      userId: user.id,
      email: user.email,
      message: 'Password reset email triggered (if SMTP configured).',
      resetHintUrl: `${frontend}/reset-password`,
      tenantSubdomain: user.tenant.subdomain,
    }
  }

  // ── Platform billing WhatsApp ──────────────────────────────
  async resolveBillingWhatsAppTenantId(): Promise<string> {
    const fromEnv = process.env.BILLING_WHATSAPP_TENANT_ID?.trim()
    if (fromEnv) {
      const t = await this.prisma.tenant.findUnique({ where: { id: fromEnv } })
      if (t) return t.id
    }

    const row = await this.prisma.tenant.findUnique({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      select: { settings: true },
    })
    const storedId = (row?.settings as { billingWhatsAppTenantId?: string } | null)
      ?.billingWhatsAppTenantId
    if (storedId) {
      const t = await this.prisma.tenant.findUnique({ where: { id: storedId } })
      if (t) return t.id
    }

    // Fall back to company platform tenant (SUPER_ADMIN home)
    const platform = await this.resolvePlatformTenant()
    return platform.id
  }

  async billingWhatsappStatus() {
    const tenantId = await this.resolveBillingWhatsAppTenantId()
    return {
      tenantId,
      ...(await this.whatsapp.getStatus(tenantId)),
    }
  }

  async billingWhatsappConnect() {
    const tenantId = await this.resolveBillingWhatsAppTenantId()
    return {
      tenantId,
      ...(await this.whatsapp.connect(tenantId)),
    }
  }

  async billingWhatsappDisconnect() {
    const tenantId = await this.resolveBillingWhatsAppTenantId()
    return {
      tenantId,
      ...(await this.whatsapp.disconnect(tenantId)),
    }
  }

  async billingWhatsappTestMessage(actorUserId: string, phone: string, message?: string) {
    if (!phone?.trim()) throw new BadRequestException('phone is required')
    const tenantId = await this.resolveBillingWhatsAppTenantId()
    return this.whatsapp.sendText(tenantId, actorUserId, {
      phone: phone.trim(),
      message:
        message?.trim() ||
        `HexaOne platform billing WhatsApp test · ${new Date().toISOString()}`,
    })
  }

  async billingWhatsappSendOnboard(input: {
    actorUserId: string
    phone: string
    businessName: string
    subdomain: string
    ownerEmail: string
    tempPassword?: string
  }) {
    if (!input.phone?.trim() || !input.businessName?.trim() || !input.subdomain?.trim()) {
      throw new BadRequestException('phone, businessName, subdomain are required')
    }
    const tenantId = await this.resolveBillingWhatsAppTenantId()
    const frontend = (this.config.get<string>('app.frontendUrl') || 'http://localhost:3000').replace(
      /\/$/,
      '',
    )
    const loginUrl = `${frontend.replace(/\/$/, '')}`.includes('://')
      ? frontend
      : `https://${input.subdomain}.hexalyte.com`
    const lines = [
      `Welcome to HexaOne, ${input.businessName}!`,
      ``,
      `Your shop is ready:`,
      `• Subdomain: ${input.subdomain}`,
      `• Login: ${input.ownerEmail}`,
      input.tempPassword ? `• Temp password: ${input.tempPassword}` : null,
      `• URL: ${loginUrl}`,
      ``,
      `Please change your password after first login.`,
    ].filter(Boolean)

    return this.whatsapp.sendText(tenantId, input.actorUserId, {
      phone: input.phone.trim(),
      message: lines.join('\n'),
    })
  }

  async setBillingWhatsAppTenantId(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new NotFoundException('Tenant not found')

    const row = await this.prisma.tenant.findUnique({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      select: { settings: true },
    })
    const current =
      row?.settings && typeof row.settings === 'object'
        ? (row.settings as Record<string, unknown>)
        : {}

    await this.prisma.tenant.upsert({
      where: { subdomain: PLATFORM_CONFIG_SUBDOMAIN },
      create: {
        subdomain: PLATFORM_CONFIG_SUBDOMAIN,
        name: 'Platform Configuration',
        email: 'platform@internal.local',
        status: TenantStatus.ACTIVE,
        settings: { ...current, billingWhatsAppTenantId: tenantId },
      },
      update: {
        settings: { ...current, billingWhatsAppTenantId: tenantId },
      },
    })

    return { billingWhatsAppTenantId: tenantId }
  }
}
