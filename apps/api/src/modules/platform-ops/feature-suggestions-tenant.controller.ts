import { Body, Controller, Get, Post } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { FeatureSuggestionPriority, RoleType } from '@prisma/client'
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator'
import { Roles } from '@/common/decorators/roles.decorator'
import { PlatformOpsService } from './platform-ops.service'

/** Tenant-facing feature suggestion submit/list (own tenant only). */
@ApiTags('Feature Suggestions')
@ApiBearerAuth('access-token')
@Controller({ path: 'feature-suggestions', version: '1' })
export class FeatureSuggestionsTenantController {
  constructor(private readonly ops: PlatformOpsService) {}

  @Get('mine')
  @Roles(
    RoleType.TENANT_ADMIN,
    RoleType.BRANCH_MANAGER,
    RoleType.SUPER_ADMIN,
    RoleType.CASHIER,
    RoleType.VIEWER,
  )
  @ApiOperation({ summary: 'List my tenant feature suggestions' })
  mine(@CurrentUser() user: IAuthUser) {
    return this.ops.listTenantSuggestions(user.tenantId)
  }

  @Post()
  @Roles(RoleType.TENANT_ADMIN, RoleType.BRANCH_MANAGER, RoleType.SUPER_ADMIN)
  @ApiOperation({ summary: 'Submit a feature suggestion' })
  create(
    @CurrentUser() user: IAuthUser,
    @Body()
    body: {
      category: string
      title: string
      description: string
      priority?: FeatureSuggestionPriority
    },
  ) {
    return this.ops.createSuggestion({
      tenantId: user.tenantId,
      submittedById: user.id,
      category: body.category,
      title: body.title,
      description: body.description,
      priority: body.priority,
      actorEmail: user.email,
    })
  }
}
