import { Module } from '@nestjs/common';
import {
  Controller, Get, Post, Put, Body, Param, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { IsString, IsOptional, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WorkflowStatus, WorkflowTaskStatus, PurchaseOrderStatus, StockMovementType, TransferStatus, CashRegisterStatus, QuotationStatus,
} from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CurrentUser, IAuthUser } from '@/common/decorators/current-user.decorator';
import { RequireAnyPermissions, RequirePermissions } from '@/common/decorators/permissions.decorator';
import { bypassesWorkflowApproval } from '@/shared/workflow-bypass.helper';
import { assertCanActOnWorkflowTask, canUserActOnWorkflowTask } from '@/shared/workflow-approval.helper';
import { randomUUID } from 'crypto';

export class StartWorkflowDto {
  @ApiProperty() @IsString() key: string;
  @ApiProperty() @IsString() entityType: string;
  @ApiProperty() @IsString() entityId: string;
  @ApiPropertyOptional() @IsOptional() metadata?: Record<string, unknown>;
}

export class ActOnTaskDto {
  @ApiPropertyOptional() @IsOptional() @IsString() comment?: string;
}

export class DiscountRequestDto {
  @ApiProperty() @IsNumber() amount: number;
  @ApiProperty() @IsString() reason: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() cartTotal?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
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
        steps: [
          { name: 'Branch Manager Review', approverRole: 'BRANCH_MANAGER' },
          { name: 'Admin Approval', approverRole: 'TENANT_ADMIN' },
        ],
      },
      cash_variance: {
        name: 'Cash Variance Approval',
        steps: [{ name: 'Manager Approval', approverRole: 'BRANCH_MANAGER' }],
      },
      quotation: {
        name: 'Quotation Approval',
        steps: [
          { name: 'Manager Review', approverRole: 'BRANCH_MANAGER' },
          { name: 'Admin Approval', approverRole: 'TENANT_ADMIN' },
        ],
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

    const taskCreates = def.steps.map((step) => ({
      stepOrder: step.stepOrder,
      assigneeId: step.approverUserId ?? undefined,
      status: step.stepOrder === 1 ? WorkflowTaskStatus.PENDING : WorkflowTaskStatus.SKIPPED,
    }));

    if (existing) {
      return this.prisma.$transaction(async (tx) => {
        await tx.workflowTask.deleteMany({ where: { instanceId: existing.id } });
        await tx.workflowInstance.update({
          where: { id: existing.id },
          data: {
            definitionId: def.id,
            initiatedBy: userId,
            status: WorkflowStatus.IN_PROGRESS,
            currentStep: 1,
            completedAt: null,
            metadata: (dto.metadata ?? {}) as object,
          },
        });
        await tx.workflowTask.createMany({
          data: taskCreates.map((t) => ({ ...t, instanceId: existing.id })),
        });
        await tx.workflowEvent.create({
          data: {
            instanceId: existing.id,
            eventType: 'RESUBMITTED',
            toStatus: WorkflowStatus.IN_PROGRESS,
            actorId: userId,
            payload: { key: dto.key },
          },
        });
        return tx.workflowInstance.findUnique({
          where: { id: existing.id },
          include: {
            definition: true,
            tasks: { orderBy: { stepOrder: 'asc' } },
            events: { orderBy: { createdAt: 'asc' } },
          },
        });
      });
    }

    return this.prisma.workflowInstance.create({
      data: {
        tenantId,
        definitionId: def.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        initiatedBy: userId,
        metadata: (dto.metadata ?? {}) as object,
        tasks: {
          create: taskCreates,
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

  private readonly catalogKeys = [
    'purchase_order',
    'stock_adjustment',
    'discount_request',
    'stock_transfer',
    'cash_variance',
    'quotation',
  ] as const;

  async getCatalog(tenantId: string) {
    const items = await Promise.all(
      this.catalogKeys.map(async (key) => {
        const def = await this.ensureDefinition(tenantId, key);
        return {
          key,
          name: def.name,
          stepCount: def.steps.length,
          steps: def.steps.map((s) => s.name),
          status: 'active' as const,
          triggerFrom: {
            purchase_order: 'Purchases → Submit for approval',
            stock_adjustment: 'Inventory → Adjust stock (manual)',
            discount_request: 'POS → Manager discount override',
            stock_transfer: 'Inventory → Stock transfer',
            cash_variance: 'POS → Cash close with variance over threshold',
            quotation: 'Quotations → Submit for approval',
          }[key],
        };
      }),
    );
    return { operational: true, workflows: items };
  }

  private async applyApprovedStockAdjustment(
    tenantId: string,
    userId: string,
    metadata: Record<string, unknown>,
  ) {
    const variantId = metadata.variantId as string | undefined;
    const branchId = metadata.branchId as string | undefined;
    const quantity = metadata.quantity as number | undefined;
    const movementType = (metadata.movementType as StockMovementType) ?? StockMovementType.ADJUSTMENT;
    const notes = metadata.notes as string | undefined;
    if (!variantId || !branchId || quantity === undefined) return;

    const inventory = await this.prisma.inventory.findFirst({
      where: { tenantId, branchId, variantId },
    });
    const currentQty = inventory?.quantity ?? 0;
    let newQty = currentQty;
    if (movementType === StockMovementType.ADJUSTMENT) {
      newQty = quantity;
    } else if (movementType === StockMovementType.DAMAGE) {
      newQty = Math.max(0, currentQty - quantity);
    } else {
      newQty = Math.max(0, currentQty + quantity);
    }

    await this.prisma.$transaction(async (tx) => {
      if (inventory) {
        await tx.inventory.update({
          where: { id: inventory.id },
          data: { quantity: Math.max(0, newQty) },
        });
      } else {
        await tx.inventory.create({
          data: { tenantId, branchId, variantId, quantity: Math.max(0, newQty) },
        });
      }
      await tx.inventoryLog.create({
        data: {
          tenantId,
          branchId,
          variantId,
          movementType,
          quantityChange: Math.max(0, newQty) - currentQty,
          quantityBefore: currentQty,
          quantityAfter: Math.max(0, newQty),
          notes: notes ?? 'Approved via workflow',
          performedBy: userId,
        },
      });
    });
  }

  async getPendingTasks(tenantId: string, userId: string, userRoles: string[] = []) {
    const tasks = await this.prisma.workflowTask.findMany({
      where: {
        status: WorkflowTaskStatus.PENDING,
        instance: { tenantId, status: WorkflowStatus.IN_PROGRESS },
      },
      include: {
        instance: {
          include: {
            definition: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
            events: { orderBy: { createdAt: 'desc' }, take: 3 },
          },
        },
      },
      orderBy: { instance: { createdAt: 'desc' } },
    });

    return tasks.filter((task) =>
      canUserActOnWorkflowTask(
        userId,
        userRoles,
        task,
        task.instance,
        task.instance.definition.steps,
      ),
    );
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

  async approveTask(taskId: string, tenantId: string, userId: string, userRoles: string[] = [], comment?: string) {
    const task = await this.prisma.workflowTask.findFirst({
      where: { id: taskId, instance: { tenantId } },
      include: { instance: { include: { definition: { include: { steps: true } } } } },
    });
    if (!task || task.status !== WorkflowTaskStatus.PENDING) {
      throw new NotFoundException('Pending task not found');
    }

    assertCanActOnWorkflowTask(
      userId,
      userRoles,
      task,
      task.instance,
      task.instance.definition.steps,
    );

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

    if (isLast) {
      if (entityType === 'PurchaseOrder') {
        await this.prisma.purchaseOrder.updateMany({
          where: { id: entityId, tenantId, status: PurchaseOrderStatus.PENDING_APPROVAL },
          data: { status: PurchaseOrderStatus.CONFIRMED },
        });
      } else if (entityType === 'StockAdjustment') {
        await this.applyApprovedStockAdjustment(
          tenantId,
          userId,
          (instance.metadata ?? {}) as Record<string, unknown>,
        );
      } else if (entityType === 'CashRegister') {
        await this.prisma.cashRegister.updateMany({
          where: { id: entityId, tenantId, status: CashRegisterStatus.PENDING_APPROVAL },
          data: {
            status: CashRegisterStatus.CLOSED,
            approvedById: userId,
            approvedAt: new Date(),
          },
        });
      } else if (entityType === 'StockTransfer') {
        await this.prisma.stockTransfer.updateMany({
          where: { id: entityId, tenantId, status: TransferStatus.PENDING },
          data: { approvedBy: userId },
        });
      } else if (entityType === 'Quotation') {
        await this.prisma.quotation.updateMany({
          where: { id: entityId, tenantId, status: QuotationStatus.PENDING_APPROVAL },
          data: { status: QuotationStatus.SENT },
        });
      }
    }

    return result;
  }

  async rejectTask(taskId: string, tenantId: string, userId: string, userRoles: string[] = [], comment?: string) {
    const task = await this.prisma.workflowTask.findFirst({
      where: { id: taskId, instance: { tenantId }, status: WorkflowTaskStatus.PENDING },
      include: { instance: { include: { definition: { include: { steps: true } } } } },
    });
    if (!task) throw new NotFoundException('Pending task not found');

    assertCanActOnWorkflowTask(
      userId,
      userRoles,
      task,
      task.instance,
      task.instance.definition.steps,
    );

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
      const { entityType, entityId } = task.instance;
      if (entityType === 'PurchaseOrder') {
        await this.prisma.purchaseOrder.updateMany({
          where: { id: entityId, tenantId, status: PurchaseOrderStatus.PENDING_APPROVAL },
          data: { status: PurchaseOrderStatus.DRAFT },
        });
      } else if (entityType === 'StockTransfer') {
        await this.prisma.stockTransfer.updateMany({
          where: { id: entityId, tenantId, status: TransferStatus.PENDING },
          data: { status: TransferStatus.CANCELLED },
        });
      } else if (entityType === 'Quotation') {
        await this.prisma.quotation.updateMany({
          where: { id: entityId, tenantId, status: QuotationStatus.PENDING_APPROVAL },
          data: { status: QuotationStatus.DRAFT },
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
      metadata: {
        reference: `DISC-${id.slice(0, 8).toUpperCase()}`,
        amount: dto.amount,
        total: dto.amount,
        discountPercent: dto.discountPercent,
        reason: dto.reason,
        cartTotal: dto.cartTotal,
      },
    });
  }

  @Get('catalog')
  @RequireAnyPermissions('inventory:read', 'purchases:read', 'sales:read')
  @ApiOperation({ summary: 'List active workflow definitions and triggers' })
  catalog(@CurrentUser() user: IAuthUser) {
    return this.workflowService.getCatalog(user.tenantId);
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

@Module({
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
