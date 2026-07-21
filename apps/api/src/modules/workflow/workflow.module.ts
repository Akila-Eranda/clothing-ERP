import { Module, forwardRef } from '@nestjs/common';
import { InventoryModule } from '@/modules/inventory/inventory.module';
import { WorkflowService } from './workflow.service';
import { WorkflowController } from './workflow.controller';

/**
 * Workflow Engine — sole approval orchestration boundary.
 *
 * Public API (via WorkflowService):
 * - start() / ensureDefinition()
 * - approveTask() / rejectTask()
 * - getPendingTasks() / getInstance()
 * - getCatalog() / listDefinitions() / updateDefinition()
 *
 * Consumers: Inventory, Procurement/Suppliers, Cash, Spare-parts quotations.
 * POS discount requests use HTTP POST /workflows/discount-request.
 */
@Module({
  imports: [forwardRef(() => InventoryModule)],
  controllers: [WorkflowController],
  providers: [WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}

/** Alias — Shared Workflow Engine entrypoint. */
export { WorkflowService, WorkflowService as WorkflowEngine } from './workflow.service';
export {
  StartWorkflowDto,
  ActOnTaskDto,
  UpdateWorkflowDefinitionDto,
  DiscountRequestDto,
} from './workflow.dto';
export {
  WORKFLOW_CATALOG_KEYS,
  DEFAULT_WORKFLOW_DEFINITIONS,
  resolveApproveTransition,
  buildInitialTaskCreates,
  canStartWorkflow,
} from './workflow-engine.helper';
