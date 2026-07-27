import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import {
  FeatureSuggestionHistoryAction,
  FeatureSuggestionPriority,
  FeatureSuggestionStatus,
  RoleType,
  UserStatus,
} from '@prisma/client'
import { PrismaService } from '@/prisma/prisma.service'
import { IJwtPayload } from '@/common/interfaces/jwt-payload.interface'
import { createImpersonationCode } from './impersonation-codes'

@Injectable()
export class PlatformOpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ── Announcements ──────────────────────────────────────────
  listAnnouncements() {
    return this.prisma.platformAnnouncement.findMany({ orderBy: { createdAt: 'desc' } })
  }

  async createAnnouncement(body: {
    title: string
    body: string
    type?: string
    target?: string
    targetTenants?: string[]
    dismissible?: boolean
    scheduledAt?: string | null
    sendNow?: boolean
    createdBy?: string
  }) {
    if (!body.title?.trim() || !body.body?.trim()) {
      throw new BadRequestException('title and body are required')
    }
    const sendNow = !!body.sendNow
    return this.prisma.platformAnnouncement.create({
      data: {
        title: body.title.trim(),
        body: body.body.trim(),
        type: body.type || 'INFO',
        target: body.target || 'ALL',
        targetTenants: body.targetTenants || [],
        dismissible: body.dismissible ?? true,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
        status: sendNow ? 'SENT' : 'DRAFT',
        sentAt: sendNow ? new Date() : null,
        createdBy: body.createdBy || 'Admin',
      },
    })
  }

  async updateAnnouncement(id: string, data: Record<string, unknown>) {
    await this.requireAnnouncement(id)
    const patch: Record<string, unknown> = {}
    for (const key of [
      'title', 'body', 'type', 'target', 'targetTenants', 'dismissible', 'status',
    ]) {
      if (data[key] !== undefined) patch[key] = data[key]
    }
    if (data.scheduledAt !== undefined) {
      patch.scheduledAt = data.scheduledAt ? new Date(String(data.scheduledAt)) : null
    }
    return this.prisma.platformAnnouncement.update({ where: { id }, data: patch })
  }

  async sendAnnouncement(id: string) {
    await this.requireAnnouncement(id)
    return this.prisma.platformAnnouncement.update({
      where: { id },
      data: { status: 'SENT', sentAt: new Date() },
    })
  }

  async deleteAnnouncement(id: string) {
    await this.requireAnnouncement(id)
    await this.prisma.platformAnnouncement.delete({ where: { id } })
    return { ok: true }
  }

  private async requireAnnouncement(id: string) {
    const row = await this.prisma.platformAnnouncement.findUnique({ where: { id } })
    if (!row) throw new NotFoundException('Announcement not found')
    return row
  }

  // ── Releases ───────────────────────────────────────────────
  listReleases(status?: string) {
    return this.prisma.platformRelease.findMany({
      where: status ? { status } : undefined,
      include: { items: { orderBy: { displayOrder: 'asc' } } },
      orderBy: { releaseDate: 'desc' },
    })
  }

  getRelease(id: string) {
    return this.prisma.platformRelease.findUnique({
      where: { id },
      include: { items: { orderBy: { displayOrder: 'asc' } } },
    })
  }

  async createRelease(body: {
    version: string
    title: string
    summary: string
    releaseDate?: string
    popupEnabled?: boolean
    active?: boolean
    targetType?: string
    targetPlans?: string[]
    targetTenants?: string[]
    targetBranches?: string[]
    imageUrl?: string
    videoUrl?: string
    docUrl?: string
    createdBy?: string
    items?: Array<{
      category: string
      module?: string
      featureName: string
      description: string
      badge?: string
      displayOrder?: number
      imageUrl?: string
      videoUrl?: string
      docUrl?: string
    }>
  }) {
    if (!body.version?.trim() || !body.title?.trim() || !body.summary?.trim()) {
      throw new BadRequestException('version, title, summary are required')
    }
    return this.prisma.platformRelease.create({
      data: {
        version: body.version.trim(),
        title: body.title.trim(),
        summary: body.summary.trim(),
        releaseDate: body.releaseDate ? new Date(body.releaseDate) : new Date(),
        popupEnabled: body.popupEnabled ?? true,
        active: body.active ?? true,
        targetType: body.targetType || 'ALL',
        targetPlans: body.targetPlans || [],
        targetTenants: body.targetTenants || [],
        targetBranches: body.targetBranches || [],
        imageUrl: body.imageUrl,
        videoUrl: body.videoUrl,
        docUrl: body.docUrl,
        createdBy: body.createdBy || 'Admin',
        items: body.items?.length
          ? {
              create: body.items.map((item, i) => ({
                category: item.category,
                module: item.module,
                featureName: item.featureName,
                description: item.description,
                badge: item.badge,
                displayOrder: item.displayOrder ?? i,
                imageUrl: item.imageUrl,
                videoUrl: item.videoUrl,
                docUrl: item.docUrl,
              })),
            }
          : undefined,
      },
      include: { items: true },
    })
  }

  async updateRelease(id: string, body: Record<string, unknown>) {
    const existing = await this.getRelease(id)
    if (!existing) throw new NotFoundException('Release not found')

    const {
      items,
      releaseDate,
      version,
      title,
      summary,
      popupEnabled,
      active,
      targetType,
      targetPlans,
      targetTenants,
      targetBranches,
      imageUrl,
      videoUrl,
      docUrl,
      status,
    } = body as {
      items?: Array<Record<string, unknown>>
      releaseDate?: string
      version?: string
      title?: string
      summary?: string
      popupEnabled?: boolean
      active?: boolean
      targetType?: string
      targetPlans?: string[]
      targetTenants?: string[]
      targetBranches?: string[]
      imageUrl?: string | null
      videoUrl?: string | null
      docUrl?: string | null
      status?: string
    }

    return this.prisma.$transaction(async (tx) => {
      if (items) {
        await tx.platformReleaseItem.deleteMany({ where: { releaseId: id } })
        if (items.length) {
          await tx.platformReleaseItem.createMany({
            data: items.map((item, i) => ({
              releaseId: id,
              category: String(item.category || 'FEATURE'),
              module: item.module ? String(item.module) : null,
              featureName: String(item.featureName || ''),
              description: String(item.description || ''),
              badge: item.badge ? String(item.badge) : null,
              displayOrder: typeof item.displayOrder === 'number' ? item.displayOrder : i,
              imageUrl: item.imageUrl ? String(item.imageUrl) : null,
              videoUrl: item.videoUrl ? String(item.videoUrl) : null,
              docUrl: item.docUrl ? String(item.docUrl) : null,
            })),
          })
        }
      }

      return tx.platformRelease.update({
        where: { id },
        data: {
          ...(version !== undefined && { version }),
          ...(title !== undefined && { title }),
          ...(summary !== undefined && { summary }),
          ...(releaseDate !== undefined && { releaseDate: new Date(releaseDate) }),
          ...(popupEnabled !== undefined && { popupEnabled }),
          ...(active !== undefined && { active }),
          ...(targetType !== undefined && { targetType }),
          ...(targetPlans !== undefined && { targetPlans }),
          ...(targetTenants !== undefined && { targetTenants }),
          ...(targetBranches !== undefined && { targetBranches }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(videoUrl !== undefined && { videoUrl }),
          ...(docUrl !== undefined && { docUrl }),
          ...(status !== undefined && { status }),
        },
        include: { items: { orderBy: { displayOrder: 'asc' } } },
      })
    })
  }

  async publishRelease(id: string) {
    const existing = await this.getRelease(id)
    if (!existing) throw new NotFoundException('Release not found')
    return this.prisma.platformRelease.update({
      where: { id },
      data: { status: 'PUBLISHED', active: true },
      include: { items: true },
    })
  }

  async deleteRelease(id: string) {
    const existing = await this.getRelease(id)
    if (!existing) throw new NotFoundException('Release not found')
    await this.prisma.platformRelease.delete({ where: { id } })
    return { ok: true }
  }

  // ── Feature suggestions ────────────────────────────────────
  async suggestionsSummary() {
    const [total, neu, underReview, planned, inProgress, done, declined] = await Promise.all([
      this.prisma.featureSuggestion.count(),
      this.prisma.featureSuggestion.count({ where: { status: 'NEW' } }),
      this.prisma.featureSuggestion.count({ where: { status: 'UNDER_REVIEW' } }),
      this.prisma.featureSuggestion.count({ where: { status: 'PLANNED' } }),
      this.prisma.featureSuggestion.count({ where: { status: 'IN_PROGRESS' } }),
      this.prisma.featureSuggestion.count({ where: { status: 'DONE' } }),
      this.prisma.featureSuggestion.count({ where: { status: 'DECLINED' } }),
    ])
    return {
      total,
      new: neu,
      underReview,
      planned,
      inProgress,
      done,
      declined,
    }
  }

  async listSuggestions(query: {
    status?: string
    priority?: string
    search?: string
    page?: number
    limit?: number
  }) {
    const page = Math.max(1, query.page || 1)
    const limit = Math.min(100, Math.max(1, query.limit || 20))
    const where: Record<string, unknown> = {}
    if (query.status) where.status = query.status
    if (query.priority) where.priority = query.priority
    if (query.search?.trim()) {
      where.OR = [
        { title: { contains: query.search.trim(), mode: 'insensitive' } },
        { description: { contains: query.search.trim(), mode: 'insensitive' } },
        { category: { contains: query.search.trim(), mode: 'insensitive' } },
      ]
    }

    const [total, data] = await Promise.all([
      this.prisma.featureSuggestion.count({ where }),
      this.prisma.featureSuggestion.findMany({
        where,
        include: {
          tenant: { select: { id: true, name: true, subdomain: true } },
          submittedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
          history: { orderBy: { createdAt: 'desc' }, take: 10 },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    return { data, total, page, limit }
  }

  async getSuggestion(id: string) {
    const row = await this.prisma.featureSuggestion.findUnique({
      where: { id },
      include: {
        tenant: { select: { id: true, name: true, subdomain: true } },
        submittedBy: { select: { id: true, email: true, firstName: true, lastName: true } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!row) throw new NotFoundException('Suggestion not found')
    return row
  }

  async listTenantSuggestions(tenantId: string) {
    const [total, data] = await Promise.all([
      this.prisma.featureSuggestion.count({ where: { tenantId } }),
      this.prisma.featureSuggestion.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ])
    return { data, total, page: 1, limit: 50 }
  }

  async createSuggestion(input: {
    tenantId: string
    submittedById: string
    category: string
    title: string
    description: string
    priority?: FeatureSuggestionPriority
    actorEmail: string
  }) {
    if (!input.title?.trim() || !input.description?.trim() || !input.category?.trim()) {
      throw new BadRequestException('category, title, description are required')
    }
    return this.prisma.featureSuggestion.create({
      data: {
        tenantId: input.tenantId,
        submittedById: input.submittedById,
        category: input.category.trim(),
        title: input.title.trim(),
        description: input.description.trim(),
        priority: input.priority || 'MEDIUM',
        history: {
          create: {
            action: FeatureSuggestionHistoryAction.CREATED,
            newStatus: FeatureSuggestionStatus.NEW,
            newPriority: input.priority || FeatureSuggestionPriority.MEDIUM,
            performedByEmail: input.actorEmail,
          },
        },
      },
      include: { history: true },
    })
  }

  async updateSuggestion(
    id: string,
    body: {
      status?: FeatureSuggestionStatus
      priority?: FeatureSuggestionPriority
      publicResponse?: string
      internalNote?: string
    },
    actorEmail: string,
  ) {
    const existing = await this.getSuggestion(id)
    const historyCreates: Array<{
      action: FeatureSuggestionHistoryAction
      oldStatus?: FeatureSuggestionStatus
      newStatus?: FeatureSuggestionStatus
      oldPriority?: FeatureSuggestionPriority
      newPriority?: FeatureSuggestionPriority
      publicResponse?: string
      performedByEmail: string
    }> = []

    if (body.status && body.status !== existing.status) {
      historyCreates.push({
        action: FeatureSuggestionHistoryAction.STATUS_CHANGED,
        oldStatus: existing.status,
        newStatus: body.status,
        performedByEmail: actorEmail,
      })
    }
    if (body.priority && body.priority !== existing.priority) {
      historyCreates.push({
        action: FeatureSuggestionHistoryAction.PRIORITY_CHANGED,
        oldPriority: existing.priority,
        newPriority: body.priority,
        performedByEmail: actorEmail,
      })
    }
    if (body.publicResponse !== undefined && body.publicResponse !== existing.publicResponse) {
      historyCreates.push({
        action: FeatureSuggestionHistoryAction.RESPONSE_UPDATED,
        publicResponse: body.publicResponse,
        performedByEmail: actorEmail,
      })
    }
    if (body.internalNote !== undefined && body.internalNote !== existing.internalNote) {
      historyCreates.push({
        action: FeatureSuggestionHistoryAction.NOTE_UPDATED,
        performedByEmail: actorEmail,
      })
    }

    return this.prisma.featureSuggestion.update({
      where: { id },
      data: {
        ...(body.status && { status: body.status }),
        ...(body.priority && { priority: body.priority }),
        ...(body.publicResponse !== undefined && { publicResponse: body.publicResponse }),
        ...(body.internalNote !== undefined && { internalNote: body.internalNote }),
        ...(body.publicResponse !== undefined && {
          respondedByEmail: actorEmail,
          respondedAt: new Date(),
        }),
        history: historyCreates.length ? { create: historyCreates } : undefined,
      },
      include: {
        tenant: { select: { id: true, name: true, subdomain: true } },
        history: { orderBy: { createdAt: 'desc' } },
      },
    })
  }

  // ── Support notes ──────────────────────────────────────────
  listSupportNotes(tenantId?: string) {
    return this.prisma.supportNote.findMany({
      where: tenantId ? { tenantId } : undefined,
      orderBy: { createdAt: 'desc' },
    })
  }

  createSupportNote(body: { tenantId?: string; title: string; body: string; createdBy?: string }) {
    if (!body.title?.trim() || !body.body?.trim()) {
      throw new BadRequestException('title and body are required')
    }
    return this.prisma.supportNote.create({
      data: {
        tenantId: body.tenantId || null,
        title: body.title.trim(),
        body: body.body.trim(),
        createdBy: body.createdBy || 'Admin',
      },
    })
  }

  async deleteSupportNote(id: string) {
    await this.prisma.supportNote.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Note not found')
    })
    return { ok: true }
  }

  // ── Tenant debug ───────────────────────────────────────────
  async tenantDebug(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new NotFoundException('Tenant not found')

    const [products, customers, sales, users] = await Promise.all([
      this.prisma.product.count({ where: { tenantId } }),
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.sale.count({ where: { tenantId } }),
      this.prisma.user.count({ where: { tenantId } }),
    ])
    const lastSale = await this.prisma.sale.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })

    return {
      tenant: {
        id: tenant.id,
        name: tenant.name,
        plan: tenant.plan,
        status: tenant.status,
        subdomain: tenant.subdomain,
        createdAt: tenant.createdAt,
      },
      counts: { products, customers, sales, users },
      lastActivity: lastSale?.createdAt ?? null,
    }
  }

  // ── Impersonation ──────────────────────────────────────────
  async impersonate(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } })
    if (!tenant) throw new NotFoundException('Tenant not found')

    const owner = await this.prisma.user.findFirst({
      where: {
        tenantId,
        status: UserStatus.ACTIVE,
        roles: { some: { role: { type: { in: [RoleType.TENANT_ADMIN, RoleType.SUPER_ADMIN] } } } },
      },
      include: {
        roles: { include: { role: { include: { permissions: { include: { permission: true } } } } } },
      },
      orderBy: { createdAt: 'asc' },
    })
    if (!owner) throw new NotFoundException('No active TENANT_ADMIN user found for this tenant')

    const roles = owner.roles.map((r) => r.role.type)
    const permissions = [
      ...new Set(
        owner.roles.flatMap((r) =>
          r.role.permissions.map((p) => `${p.permission.resource}:${p.permission.action}`),
        ),
      ),
    ]

    const payload: IJwtPayload & { impersonation?: boolean } = {
      sub: owner.id,
      email: owner.email,
      tenantId: owner.tenantId,
      branchId: owner.branchId || undefined,
      roles,
      permissions,
      impersonation: true,
    }

    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.config.get('jwt.accessSecret'),
      expiresIn: '30m',
      issuer: this.config.get('jwt.issuer'),
      audience: this.config.get('jwt.audience'),
    })

    const code = createImpersonationCode(accessToken)
    const base = (this.config.get<string>('app.frontendUrl') || 'http://localhost:3000').replace(
      /\/$/,
      '',
    )

    return {
      loginUrl: `${base}/support-session?code=${encodeURIComponent(code)}`,
      ownerEmail: owner.email,
      tenantId: owner.tenantId,
      tenantSubdomain: tenant.subdomain,
    }
  }

  assertSuperAdmin(roles: string[]) {
    if (!roles.includes(RoleType.SUPER_ADMIN) && !roles.includes('SUPER_ADMIN')) {
      throw new ForbiddenException('SUPER_ADMIN required')
    }
  }
}
