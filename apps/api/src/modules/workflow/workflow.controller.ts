import {
  Controller,
  Get,
  Post,
  Put,
  Body,
  Param,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequireAnyPermissions, RequirePermissions } from '@/common/decorators/permissions.decorator';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { randomUUID } from 'crypto';
import { WorkflowService } from './workflow.service';
import {
  StartWorkflowDto,
  ActOnTaskDto,
  UpdateWorkflowDefinitionDto,
  DiscountRequestDto,
} from './workflow.dto';
import { buildDiscountRequestMetadata } from './workflow-engine.helper';

@ApiTags('Workflows')
@ApiBearerAuth('access-token')
@Controller({ path: 'workflows', version: '1' })
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('start')
  @RequireAnyPermissions('inventory:update', 'purchases:update')
  @ApiOperation({ summary: 'Start approval workflow for an entity' })
  start(@CurrentUser() user: IAuthUser, @Body() dto: StartWorkflowDto) {
    return this.workflowService.start(user.tenantId, user.id, dto);
  }

  @Post('discount-request')
  @RequirePermissions('sales:create')
  @ApiOperation({ summary: 'Submit POS discount for manager approval' })
  discountRequest(@CurrentUser() user: IAuthUser, @Body() dto: DiscountRequestDto) {
    if (bypassesWorkflowApproval(user.roles)) {
      return {
        bypassed: true,
        message: 'Discount approved automatically for admin',
        amount: dto.amount,
        reason: dto.reason,
      };
    }
    const id = randomUUID();
    return this.workflowService.start(user.tenantId, user.id, {
      key: 'discount_request',
      entityType: 'DiscountRequest',
      entityId: id,
      metadata: buildDiscountRequestMetadata(id, dto),
    });
  }

  @Get('catalog')
  @RequireAnyPermissions('inventory:read', 'purchases:read', 'sales:read')
  @ApiOperation({ summary: 'List active workflow definitions and triggers' })
  catalog(@CurrentUser() user: IAuthUser) {
    return this.workflowService.getCatalog(user.tenantId);
  }

  @Get('definitions')
  @RequirePermissions('accounting:read')
  @ApiOperation({ summary: 'List workflow definitions with steps (Settings)' })
  listDefinitions(@CurrentUser() user: IAuthUser) {
    return this.workflowService.listDefinitions(user.tenantId);
  }

  @Put('definitions/:key')
  @RequirePermissions('accounting:update')
  @ApiOperation({ summary: 'Update workflow definition steps / roles' })
  updateDefinition(
    @CurrentUser() user: IAuthUser,
    @Param('key') key: string,
    @Body() dto: UpdateWorkflowDefinitionDto,
  ) {
    return this.workflowService.updateDefinition(user.tenantId, key, dto);
  }

  @Get('tasks/pending')
  @RequireAnyPermissions('inventory:read', 'purchases:read', 'sales:read')
  @ApiOperation({ summary: 'List pending approval tasks' })
  pending(@CurrentUser() user: IAuthUser) {
    return this.workflowService.getPendingTasks(user.tenantId, user.id, user.roles);
  }

  @Get('instances/:entityType/:entityId')
  @RequireAnyPermissions('inventory:read', 'purchases:read', 'sales:read')
  @ApiOperation({ summary: 'Get workflow instance for entity' })
  getInstance(
    @CurrentUser() user: IAuthUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.workflowService.getInstance(user.tenantId, entityType, entityId);
  }

  @Put('tasks/:id/approve')
  @RequireAnyPermissions('inventory:update', 'purchases:update', 'sales:create')
  @ApiOperation({ summary: 'Approve workflow task' })
  approve(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ActOnTaskDto) {
    return this.workflowService.approveTask(id, user.tenantId, user.id, user.roles, dto.comment);
  }

  @Put('tasks/:id/reject')
  @RequireAnyPermissions('inventory:update', 'purchases:update', 'sales:create')
  @ApiOperation({ summary: 'Reject workflow task' })
  reject(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ActOnTaskDto) {
    return this.workflowService.rejectTask(id, user.tenantId, user.id, user.roles, dto.comment);
  }
}
