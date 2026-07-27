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
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  FeatureSuggestionPriority,
  FeatureSuggestionStatus,
  RoleType,
} from '@prisma/client'
import { Roles } from '@/common/decorators/roles.decorator'
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator'
import { PlatformOpsService } from './platform-ops.service'
import { PlatformOpsW3Service } from './platform-ops-w3.service'

@ApiTags('Platform Ops')
@ApiBearerAuth('access-token')
@Controller({ path: 'platform', version: '1' })
@Roles(RoleType.SUPER_ADMIN)
export class PlatformOpsController {
  constructor(
    private readonly ops: PlatformOpsService,
    private readonly w3: PlatformOpsW3Service,
  ) {}

  // ── Announcements ──────────────────────────────────────────
  @Get('announcements')
  @ApiOperation({ summary: 'List platform announcements' })
  listAnnouncements() {
    return this.ops.listAnnouncements()
  }

  @Post('announcements')
  @ApiOperation({ summary: 'Create platform announcement' })
  createAnnouncement(@Body() body: Record<string, unknown>, @CurrentUser() user: IAuthUser) {
    return this.ops.createAnnouncement({
      title: String(body.title || ''),
      body: String(body.body || ''),
      type: body.type ? String(body.type) : undefined,
      target: body.target ? String(body.target) : undefined,
      targetTenants: Array.isArray(body.targetTenants)
        ? body.targetTenants.map(String)
        : undefined,
      dismissible: body.dismissible as boolean | undefined,
      scheduledAt: body.scheduledAt ? String(body.scheduledAt) : null,
      sendNow: !!body.sendNow,
      createdBy: user.email,
    })
  }

  @Patch('announcements/:id')
  updateAnnouncement(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.ops.updateAnnouncement(id, body)
  }

  @Patch('announcements/:id/send')
  sendAnnouncement(@Param('id') id: string) {
    return this.ops.sendAnnouncement(id)
  }

  @Delete('announcements/:id')
  deleteAnnouncement(@Param('id') id: string) {
    return this.ops.deleteAnnouncement(id)
  }

  // ── Releases ───────────────────────────────────────────────
  @Get('releases')
  listReleases(@Query('status') status?: string) {
    return this.ops.listReleases(status)
  }

  @Get('releases/:id')
  getRelease(@Param('id') id: string) {
    return this.ops.getRelease(id)
  }

  @Post('releases')
  createRelease(@Body() body: Record<string, unknown>, @CurrentUser() user: IAuthUser) {
    return this.ops.createRelease({
      ...(body as any),
      createdBy: user.email,
    })
  }

  @Put('releases/:id')
  updateRelease(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.ops.updateRelease(id, body)
  }

  @Patch('releases/:id/publish')
  publishRelease(@Param('id') id: string) {
    return this.ops.publishRelease(id)
  }

  @Delete('releases/:id')
  deleteRelease(@Param('id') id: string) {
    return this.ops.deleteRelease(id)
  }

  // ── Feature suggestions ────────────────────────────────────
  @Get('feature-suggestions/summary')
  suggestionsSummary() {
    return this.ops.suggestionsSummary()
  }

  @Get('feature-suggestions')
  listSuggestions(
    @Query('status') status?: string,
    @Query('priority') priority?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.ops.listSuggestions({
      status,
      priority,
      search,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    })
  }

  @Get('feature-suggestions/:id')
  getSuggestion(@Param('id') id: string) {
    return this.ops.getSuggestion(id)
  }

  @Patch('feature-suggestions/:id')
  updateSuggestion(
    @Param('id') id: string,
    @Body()
    body: {
      status?: FeatureSuggestionStatus
      priority?: FeatureSuggestionPriority
      publicResponse?: string
      internalNote?: string
    },
    @CurrentUser() user: IAuthUser,
  ) {
    return this.ops.updateSuggestion(id, body, user.email)
  }

  // ── Support ────────────────────────────────────────────────
  @Post('support/impersonate/:tenantId')
  @ApiOperation({ summary: 'Impersonate tenant admin (one-time login URL)' })
  impersonate(@Param('tenantId') tenantId: string) {
    return this.ops.impersonate(tenantId)
  }

  @Get('support/tenant-debug/:tenantId')
  tenantDebug(@Param('tenantId') tenantId: string) {
    return this.ops.tenantDebug(tenantId)
  }

  @Get('support/notes')
  listNotes(@Query('tenantId') tenantId?: string) {
    return this.ops.listSupportNotes(tenantId)
  }

  @Post('support/notes')
  createNote(@Body() body: Record<string, unknown>, @CurrentUser() user: IAuthUser) {
    return this.ops.createSupportNote({
      tenantId: body.tenantId ? String(body.tenantId) : undefined,
      title: String(body.title || ''),
      body: String(body.body || ''),
      createdBy: user.email,
    })
  }

  @Delete('support/notes/:id')
  deleteNote(@Param('id') id: string) {
    return this.ops.deleteSupportNote(id)
  }

  // ── Wave 3: notifications / analytics / IAM / billing WhatsApp ───────────
  @Get('notifications')
  @ApiOperation({ summary: 'Platform ops notification feed' })
  notifications() {
    return this.w3.platformNotifications()
  }

  @Get('analytics')
  @ApiOperation({ summary: 'Platform analytics (GMV, growth, top tenants)' })
  analytics() {
    return this.w3.analytics()
  }

  @Get('analytics/mrr-chart')
  @ApiOperation({ summary: 'Estimated MRR chart (12 months)' })
  mrrChart() {
    return this.w3.mrrChart()
  }

  @Post('tenants/:tenantId/revoke-sessions')
  @ApiOperation({ summary: 'Revoke all sessions/refresh tokens for a tenant' })
  revokeSessions(@Param('tenantId') tenantId: string) {
    return this.w3.revokeTenantSessions(tenantId)
  }

  @Get('admins')
  @ApiOperation({ summary: 'List platform SUPER_ADMIN users' })
  listAdmins() {
    return this.w3.listPlatformAdmins()
  }

  @Post('admins')
  @ApiOperation({ summary: 'Create platform SUPER_ADMIN user' })
  createAdmin(@Body() body: Record<string, unknown>) {
    return this.w3.createPlatformAdmin({
      email: String(body.email || ''),
      password: String(body.password || ''),
      firstName: String(body.firstName || ''),
      lastName: String(body.lastName || ''),
      phone: body.phone ? String(body.phone) : undefined,
    })
  }

  @Delete('admins/:id')
  @ApiOperation({ summary: 'Deactivate platform SUPER_ADMIN' })
  deleteAdmin(@Param('id') id: string, @CurrentUser() user: IAuthUser) {
    return this.w3.deactivatePlatformAdmin(id, user.id)
  }

  @Post('users/:id/reset-password')
  @ApiOperation({ summary: 'Trigger password reset for any user' })
  resetPassword(@Param('id') id: string) {
    return this.w3.forceResetPassword(id)
  }

  @Get('billing/whatsapp/status')
  billingWaStatus() {
    return this.w3.billingWhatsappStatus()
  }

  @Post('billing/whatsapp/connect')
  billingWaConnect() {
    return this.w3.billingWhatsappConnect()
  }

  @Post('billing/whatsapp/disconnect')
  billingWaDisconnect() {
    return this.w3.billingWhatsappDisconnect()
  }

  @Post('billing/whatsapp/test-message')
  billingWaTest(
    @CurrentUser() user: IAuthUser,
    @Body() body: { phone?: string; message?: string },
  ) {
    return this.w3.billingWhatsappTestMessage(user.id, String(body.phone || ''), body.message)
  }

  @Post('billing/whatsapp/send-onboard')
  billingWaOnboard(
    @CurrentUser() user: IAuthUser,
    @Body()
    body: {
      phone?: string
      businessName?: string
      subdomain?: string
      ownerEmail?: string
      tempPassword?: string
    },
  ) {
    return this.w3.billingWhatsappSendOnboard({
      actorUserId: user.id,
      phone: String(body.phone || ''),
      businessName: String(body.businessName || ''),
      subdomain: String(body.subdomain || ''),
      ownerEmail: String(body.ownerEmail || ''),
      tempPassword: body.tempPassword,
    })
  }

  @Put('billing/whatsapp/tenant')
  @ApiOperation({ summary: 'Pin which tenant hosts the billing WhatsApp session' })
  setBillingWaTenant(@Body() body: { tenantId?: string }) {
    return this.w3.setBillingWhatsAppTenantId(String(body.tenantId || ''))
  }
}
