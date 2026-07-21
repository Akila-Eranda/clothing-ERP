import { Module, forwardRef } from '@nestjs/common';
import { WorkflowModule } from '@/modules/workflow/workflow.module';
import { InventoryService } from './inventory.service';
import { InventoryController } from './inventory.controller';

/**
 * Inventory Engine — sole stock mutation boundary for the ERP.
 *
 * Public API (via InventoryService):
 * - adjustStock()
 * - assertSaleStockAvailable()
 * - reserveStock() / releaseReservations()
 * - createTransfer() / updateTransferStatus()
 * - requestAdjustmentApproval()
 * - seedOpeningStock()
 *
 * Consumers: POS, Returns, Procurement, Workflow, Warehouse, Products.
 */
@Module({
  imports: [forwardRef(() => WorkflowModule)],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

/** Alias — Shared Inventory Engine entrypoint. */
export { InventoryService, InventoryService as InventoryEngine } from './inventory.service';
export {
  AdjustStockDto,
  CreateTransferDto,
  LotAdjustDto,
  TransferItemDto,
} from './inventory.dto';
