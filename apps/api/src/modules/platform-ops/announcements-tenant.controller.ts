import { Controller, Get, Param, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RoleType } from '@prisma/client'
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { PlatformOpsService } from './platform-ops.service'

/** Tenant-facing platform announcements (SENT + not dismissed). */
@ApiTags('Announcements')
@ApiBearerAuth('access-token')
@Controller({ path: 'announcements', version: '1' })
export class AnnouncementsTenantController {
  constructor(private readonly ops: PlatformOpsService) {}

  @Get('active')
  @Roles(
    RoleType.TENANT_ADMIN,
    RoleType.BRANCH_MANAGER,
    RoleType.SUPER_ADMIN,
    RoleType.CASHIER,
    RoleType.VIEWER,
    RoleType.ACCOUNTANT,
    RoleType.HR_MANAGER,
    RoleType.INVENTORY_MANAGER,
    RoleType.CUSTOM,
  )
  @ApiOperation({ summary: 'List active platform announcements for current tenant user' })
  listActive(@CurrentUser() user: IAuthUser) {
    return this.ops.listActiveAnnouncementsForTenant(user.tenantId, user.id)
  }

  @Post(':id/dismiss')
  @Roles(
    RoleType.TENANT_ADMIN,
    RoleType.BRANCH_MANAGER,
    RoleType.SUPER_ADMIN,
    RoleType.CASHIER,
    RoleType.VIEWER,
    RoleType.ACCOUNTANT,
    RoleType.HR_MANAGER,
    RoleType.INVENTORY_MANAGER,
    RoleType.CUSTOM,
  )
  @ApiOperation({ summary: 'Dismiss a platform announcement for current user' })
  dismiss(@CurrentUser() user: IAuthUser, @Param('id') id: string) {
    return this.ops.dismissAnnouncementForUser(user.id, id)
  }
}
