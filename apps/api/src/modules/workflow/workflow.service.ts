/** Workflow Engine — approval orchestration boundary (Prisma + side effects). */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WorkflowStatus, WorkflowTaskStatus, StockMovementType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { canUserActOnWorkflowTask, assertCanActOnWorkflowTask } from '@/shared/workflow-approval.helper';
import { InventoryService } from '@/modules/inventory/inventory.service';
import {
  WORKFLOW_CATALOG_KEYS,
  WORKFLOW_TRIGGER_FROM,
  getDefaultDefinition,
  buildInitialTaskCreates,
  canStartWorkflow,
  resolveApproveTransition,
  resolveApproveEntityEffect,
  resolveRejectEntityEffect,
} from './workflow-engine.helper';
import { StartWorkflowDto, UpdateWorkflowDefinitionDto } from './workflow.dto';

@Injectable()
export class WorkflowService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => InventoryService))
    private readonly inventoryService: InventoryService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async ensureDefinition(tenantId: string, key: string) {
    let def = await this.prisma.workflowDefinition.findFirst({
      where: { tenantId, key, isActive: true },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { version: 'desc' },
    });
    if (def) return def;

    const template = getDefaultDefinition(key);
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
      where: {
        tenantId_entityType_entityId: {
          tenantId,
          entityType: dto.entityType,
          entityId: dto.entityId,
        },
      },
    });
    if (!canStartWorkflow(existing?.status)) {
      throw new BadRequestException('Workflow already in progress for this entity');
    }

    const def = await this.ensureDefinition(tenantId, dto.key);
    const firstStep = def.steps[0];
    if (!firstStep) throw new BadRequestException('Workflow has no steps');

    const taskCreates = buildInitialTaskCreates(def.steps);

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
        tasks: { create: taskCreates },
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

  async getCatalog(tenantId: string) {
    const items = await Promise.all(
      WORKFLOW_CATALOG_KEYS.map(async (key) => {
        const def = await this.ensureDefinition(tenantId, key);
        return {
          key,
          name: def.name,
          stepCount: def.steps.length,
          steps: def.steps.map((s) => s.name),
          status: 'active' as const,
          triggerFrom: WORKFLOW_TRIGGER_FROM[key],
        };
      }),
    );
    return { operational: true, workflows: items };
  }

  /** Full definitions with step roles for Accounting Settings. */
  async listDefinitions(tenantId: string) {
    return Promise.all(
      WORKFLOW_CATALOG_KEYS.map(async (key) => {
        const def = await this.ensureDefinition(tenantId, key);
        return {
          id: def.id,
          key: def.key,
          name: def.name,
          version: def.version,
          isActive: def.isActive,
          steps: def.steps.map((s) => ({
            id: s.id,
            stepOrder: s.stepOrder,
            name: s.name,
            approverRole: s.approverRole,
            isRequired: s.isRequired,
          })),
        };
      }),
    );
  }

  async updateDefinition(tenantId: string, key: string, dto: UpdateWorkflowDefinitionDto) {
    const def = await this.ensureDefinition(tenantId, key);
    if (dto.steps?.length === 0) {
      throw new BadRequestException('Workflow must have at least one step');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.workflowDefinition.update({
        where: { id: def.id },
        data: {
          ...(dto.name != null && { name: dto.name.trim() }),
          ...(dto.isActive != null && { isActive: dto.isActive }),
        },
      });

      if (dto.steps?.length) {
        await tx.workflowStep.deleteMany({ where: { definitionId: def.id } });
        await tx.workflowStep.createMany({
          data: dto.steps.map((s, i) => ({
            definitionId: def.id,
            stepOrder: s.stepOrder ?? i + 1,
            name: (s.name ?? `Step ${i + 1}`).trim(),
            approverRole: s.approverRole ?? 'BRANCH_MANAGER',
            isRequired: s.isRequired ?? true,
          })),
        });
      }

      return tx.workflowDefinition.findUnique({
        where: { id: def.id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });
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

    await this.inventoryService.adjustStock(tenantId, branchId, userId, {
      variantId,
      quantity,
      movementType,
      notes: notes ?? 'Approved via workflow',
      warehouseId: typeof metadata.warehouseId === 'string' ? metadata.warehouseId : undefined,
      lotId: typeof metadata.lotId === 'string' ? metadata.lotId : undefined,
      batchNumber: typeof metadata.batchNumber === 'string' ? metadata.batchNumber : undefined,
      expiryDate: typeof metadata.expiryDate === 'string' ? metadata.expiryDate : undefined,
      manufactureDate:
        typeof metadata.manufactureDate === 'string' ? metadata.manufactureDate : undefined,
      unitCost: typeof metadata.unitCost === 'number' ? metadata.unitCost : undefined,
    });
  }

  private async applyApproveEntityEffect(
    tenantId: string,
    userId: string,
    entityType: string,
    entityId: string,
    metadata: Record<string, unknown>,
  ) {
    const effect = resolveApproveEntityEffect(entityType, userId);
    if (!effect) return;

    if (effect.entityType === 'StockAdjustment') {
      await this.applyApprovedStockAdjustment(tenantId, userId, metadata);
      return;
    }

    switch (effect.entityType) {
      case 'PurchaseOrder':
        await this.prisma.purchaseOrder.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
      case 'PurchaseRequest':
        await this.prisma.purchaseRequest.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
      case 'CashRegister':
        await this.prisma.cashRegister.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
      case 'StockTransfer':
        await this.prisma.stockTransfer.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
      case 'Quotation':
        await this.prisma.quotation.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
    }
  }

  private async applyRejectEntityEffect(
    tenantId: string,
    entityType: string,
    entityId: string,
  ) {
    const effect = resolveRejectEntityEffect(entityType);
    if (!effect) return;

    switch (effect.entityType) {
      case 'PurchaseOrder':
        await this.prisma.purchaseOrder.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
      case 'PurchaseRequest':
        await this.prisma.purchaseRequest.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
      case 'StockTransfer':
        await this.prisma.stockTransfer.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
      case 'Quotation':
        await this.prisma.quotation.updateMany({
          where: { id: entityId, tenantId, status: effect.whereStatus },
          data: effect.data,
        });
        break;
    }
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

  async approveTask(
    taskId: string,
    tenantId: string,
    userId: string,
    userRoles: string[] = [],
    comment?: string,
  ) {
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
    const transition = resolveApproveTransition(task.stepOrder, totalSteps);
    const { entityType, entityId } = instance;

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.workflowTask.update({
        where: { id: taskId },
        data: { status: WorkflowTaskStatus.APPROVED, actedAt: new Date(), comment },
      });

      if (transition.isLast) {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: {
            status: transition.instanceStatus,
            completedAt: new Date(),
            currentStep: task.stepOrder,
          },
        });
        await tx.workflowEvent.create({
          data: {
            instanceId: instance.id,
            eventType: transition.eventType,
            fromStatus: WorkflowStatus.IN_PROGRESS,
            toStatus: WorkflowStatus.APPROVED,
            actorId: userId,
          },
        });
      } else {
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { currentStep: transition.nextStep },
        });
        await tx.workflowTask.updateMany({
          where: { instanceId: instance.id, stepOrder: transition.nextStep },
          data: { status: WorkflowTaskStatus.PENDING },
        });
        await tx.workflowEvent.create({
          data: {
            instanceId: instance.id,
            eventType: transition.eventType,
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

    if (transition.isLast) {
      await this.applyApproveEntityEffect(
        tenantId,
        userId,
        entityType,
        entityId,
        (instance.metadata ?? {}) as Record<string, unknown>,
      );
    }

    this.eventEmitter.emit('workflow.approved', {
      tenantId,
      userId,
      taskId,
      entityType,
      entityId,
      final: transition.isLast,
    });

    return result;
  }

  async rejectTask(
    taskId: string,
    tenantId: string,
    userId: string,
    userRoles: string[] = [],
    comment?: string,
  ) {
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

    return this.prisma
      .$transaction(async (tx) => {
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
      })
      .then(async (result) => {
        const { entityType, entityId } = task.instance;
        await this.applyRejectEntityEffect(tenantId, entityType, entityId);
        this.eventEmitter.emit('workflow.rejected', {
          tenantId,
          userId,
          taskId,
          entityType,
          entityId,
          comment,
        });
        return result;
      });
  }
}
