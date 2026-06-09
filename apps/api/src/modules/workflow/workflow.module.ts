import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkflowStatus, WorkflowTaskStatus, PurchaseOrderStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequirePermissions } from '@/common/decorators/permissions.decorator';

export class StartWorkflowDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() entityType: string;
  @ApiProperty() @IsString() entityId: string;
  @ApiPropertyOptional() @IsOptional() metadata?: Record<string, unknown>;
}

export class ActOnTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

@Injectable()
export class WorkflowService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureDefinition(tenantId: string, key: string) {
    let def = await this.prisma.workflowDefinition.findFirst({
      where: { tenantId, key, isActive: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    if (def) return def;

    const defaults: Record<string, { name: string; steps: { name: string; approverRole: string }[] }> = {
      purchase_order: {
        name: 'Purchase Order Approval',
        steps: [
          { name: 'Manager Review', approverRole: 'BRANCH_MANAGER' },
          { name: 'Finance Approval', approverRole: 'ACCOUNTANT' },
        ],
      },
      stock_adjustment: {
        name: 'Stock Adjustment Approval',
        steps: [{ name: 'Inventory Manager Approval', approverRole: 'INVENTORY_MANAGER' }],
      },
      discount_request: {
        name: 'Discount Approval',
        steps: [{ name: 'Manager Approval', approverRole: 'BRANCH_MANAGER' }],
      },
      stock_transfer: {
        name: 'Stock Transfer Approval',
        steps: [{ name: 'Branch Manager Approval', approverRole: 'BRANCH_MANAGER' }],
      },
    };

    const template = defaults[key];
    if (!template) throw new NotFoundException(`Workflow definition not found: ${key}`);

    def = await this.prisma.workflowDefinition.create({
      data: {
        tenantId,
        key,
        name: template.name,
        steps: {
          create: template.steps.map((s, i) => ({
            stepOrder: i + 1,
            name: s.name,
            approverRole: s.approverRole,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    return def;
  }

  async start(tenantId: string, userId: string, dto: StartWorkflowDto) {
    const existing = await this.prisma.workflowInstance.findUnique({
      where: { tenantId_entityType_entityId: { tenantId, entityType: dto.entityType, entityId: dto.entityId } },
    });
    if (existing && existing.status === WorkflowStatus.IN_PROGRESS) {
      throw new BadRequestException('Workflow already in progress for this entity');
    }

    const def = await this.ensureDefinition(tenantId, dto.key);
    const firstStep = def.steps[0];
    if (!firstStep) throw new BadRequestException('Workflow has no steps');

    return this.prisma.workflowInstance.create({
      data: {
        tenantId,
        definitionId: def.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        initiatedBy: userId,
        metadata: (dto.metadata ?? {}) as object,
        tasks: {
          create: def.steps.map((step) => ({
            stepOrder: step.stepOrder,
            assigneeId: step.approverUserId ?? undefined,
            status: step.stepOrder === 1 ? WorkflowTaskStatus.PENDING : WorkflowTaskStatus.SKIPPED,
          })),
        },
        events: {
          create: {
            eventType: 'SUBMITTED',
            toStatus: WorkflowStatus.IN_PROGRESS,
            actorId: userId,
            payload: { key: dto.key },
          },
        },
      },
      include: {
        definition: true,
        tasks: { orderBy: { stepOrder: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async getPendingTasks(tenantId: string, userId: string) {
    return this.prisma.workflowTask.findMany({
      where: {
        status: WorkflowTaskStatus.PENDING,
        instance: { tenantId, status: WorkflowStatus.IN_PROGRESS },
      },
      include: {
        instance: { include: { definition: true, events: { orderBy: { createdAt: 'desc' }, take: 3 } } },
      },
      orderBy: { instance: { createdAt: 'desc' } },
    });
  }

  async getInstance(tenantId: string, entityType: string, entityId: string) {
    return this.prisma.workflowInstance.findUnique({
      where: { tenantId_entityType_entityId: { tenantId, entityType, entityId } },
      include: {
        definition: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        tasks: { orderBy: { stepOrder: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async approveTask(taskId: string, tenantId: string, userId: string, comment?: string) {
    const task = await this.prisma.workflowTask.findFirst({
      where: { id: taskId, instance: { tenantId } },
      include: { instance: { include: { definition: { include: { steps: true } } } } },
    });
    if (!task || task.status !== WorkflowTaskStatus.PENDING) {
      throw new NotFoundException('Pending task not found');
    }

    const instance = task.instance;
    const totalSteps = instance.definition.steps.length;
    const isLast = task.stepOrder >= totalSteps;
    const { entityType, entityId } = instance;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({
        where: { id: taskId },
        data: { status: WorkflowTaskStatus.APPROVED, actedAt: new Date(), comment },
      });

      if (isLast) {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { status: WorkflowStatus.APPROVED, completedAt: new Date(), currentStep: task.stepOrder },
        });
        await tx.workflowEvent.create({
          data: {
            instanceId: instance.id,
            eventType: 'APPROVED',
            fromStatus: WorkflowStatus.IN_PROGRESS,
            toStatus: WorkflowStatus.APPROVED,
            actorId: userId,
          },
        });
      } else {
        const nextStep = task.stepOrder + 1;
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { currentStep: nextStep },
        });
        await tx.workflowTask.updateMany({
          where: { instanceId: instance.id, stepOrder: nextStep },
          data: { status: WorkflowTaskStatus.PENDING },
        });
        await tx.workflowEvent.create({
          data: {
            instanceId: instance.id,
            eventType: 'STEP_APPROVED',
            actorId: userId,
            payload: { step: task.stepOrder },
          },
        });
      }

      return tx.workflowInstance.findUnique({
        where: { id: instance.id },
        include: { tasks: { orderBy: { stepOrder: 'asc' } }, events: true, definition: true },
      });
    });

    if (isLast && entityType === 'PurchaseOrder') {
      await this.prisma.purchaseOrder.updateMany({
        where: { id: entityId, tenantId, status: PurchaseOrderStatus.PENDING_APPROVAL },
        data: { status: PurchaseOrderStatus.CONFIRMED },
      });
    }

    return result;
  }

  async rejectTask(taskId: string, tenantId: string, userId: string, comment?: string) {
    const task = await this.prisma.workflowTask.findFirst({
      where: { id: taskId, instance: { tenantId }, status: WorkflowTaskStatus.PENDING },
      include: { instance: true },
    });
    if (!task) throw new NotFoundException('Pending task not found');

    return this.prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({
        where: { id: taskId },
        data: { status: WorkflowTaskStatus.REJECTED, actedAt: new Date(), comment },
      });
      await tx.workflowInstance.update({
        where: { id: task.instanceId },
        data: { status: WorkflowStatus.REJECTED, completedAt: new Date() },
      });
      await tx.workflowEvent.create({
        data: {
          instanceId: task.instanceId,
          eventType: 'REJECTED',
          fromStatus: WorkflowStatus.IN_PROGRESS,
          toStatus: WorkflowStatus.REJECTED,
          actorId: userId,
          payload: { comment },
        },
      });
      return tx.workflowInstance.findUnique({
        where: { id: task.instanceId },
        include: { tasks: true, events: true, definition: true },
      });
    }).then(async (result) => {
      if (task.instance.entityType === 'PurchaseOrder') {
        await this.prisma.purchaseOrder.updateMany({
          where: { id: task.instance.entityId, tenantId, status: PurchaseOrderStatus.PENDING_APPROVAL },
          data: { status: PurchaseOrderStatus.DRAFT },
        });
      }
      return result;
    });
  }
}

@ApiTags('Workflows')
@ApiBearerAuth('access-token')
@Controller({ path: 'workflows', version: '1' })
export class WorkflowController {
  constructor(private readonly workflowService: WorkflowService) {}

  @Post('start')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Start approval workflow for an entity' })
  start(@CurrentUser() user: IAuthUser, @Body() dto: StartWorkflowDto) {
    return this.workflowService.start(user.tenantId, user.id, dto);
  }

  @Get('tasks/pending')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'List pending approval tasks' })
  pending(@CurrentUser() user: IAuthUser) {
    return this.workflowService.getPendingTasks(user.tenantId, user.id);
  }

  @Get('instances/:entityType/:entityId')
  @RequirePermissions('inventory:read')
  @ApiOperation({ summary: 'Get workflow instance for entity' })
  getInstance(
    @CurrentUser() user: IAuthUser,
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.workflowService.getInstance(user.tenantId, entityType, entityId);
  }

  @Put('tasks/:id/approve')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Approve workflow task' })
  approve(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ActOnTaskDto) {
    return this.workflowService.approveTask(id, user.tenantId, user.id, dto.comment);
  }

  @Put('tasks/:id/reject')
  @RequirePermissions('inventory:update')
  @ApiOperation({ summary: 'Reject workflow task' })
  reject(@CurrentUser() user: IAuthUser, @Param('id') id: string, @Body() dto: ActOnTaskDto) {
    return this.workflowService.rejectTask(id, user.tenantId, user.id, dto.comment);
  }
}

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
