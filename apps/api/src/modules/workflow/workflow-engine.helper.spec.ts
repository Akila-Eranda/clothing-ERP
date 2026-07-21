import {
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  QuotationStatus,
  TransferStatus,
  WorkflowStatus,
  WorkflowTaskStatus,
} from '@prisma/client';
import {
  WORKFLOW_CATALOG_KEYS,
  DEFAULT_WORKFLOW_DEFINITIONS,
  getDefaultDefinition,
  buildInitialTaskCreates,
  canStartWorkflow,
  resolveApproveTransition,
  resolveApproveEntityEffect,
  resolveRejectEntityEffect,
  buildDiscountRequestMetadata,
} from './workflow-engine.helper';

describe('Workflow Engine helpers', () => {
  it('exposes catalog keys with default definitions', () => {
    expect(WORKFLOW_CATALOG_KEYS).toContain('purchase_order');
    expect(getDefaultDefinition('purchase_order')?.name).toBe(
      DEFAULT_WORKFLOW_DEFINITIONS.purchase_order.name,
    );
    expect(getDefaultDefinition('unknown_key')).toBeNull();
  });

  it('builds initial tasks with only step 1 pending', () => {
    const tasks = buildInitialTaskCreates([
      { stepOrder: 1, approverUserId: 'u1' },
      { stepOrder: 2 },
    ]);
    expect(tasks[0]).toEqual({
      stepOrder: 1,
      assigneeId: 'u1',
      status: WorkflowTaskStatus.PENDING,
    });
    expect(tasks[1].status).toBe(WorkflowTaskStatus.SKIPPED);
    expect(tasks[1].assigneeId).toBeUndefined();
  });

  it('blocks start when workflow already in progress', () => {
    expect(canStartWorkflow(undefined)).toBe(true);
    expect(canStartWorkflow(WorkflowStatus.APPROVED)).toBe(true);
    expect(canStartWorkflow(WorkflowStatus.IN_PROGRESS)).toBe(false);
  });

  it('resolves approve transitions for mid and final steps', () => {
    const mid = resolveApproveTransition(1, 3);
    expect(mid.isLast).toBe(false);
    if (!mid.isLast) {
      expect(mid.nextStep).toBe(2);
      expect(mid.eventType).toBe('STEP_APPROVED');
    }

    const last = resolveApproveTransition(2, 2);
    expect(last.isLast).toBe(true);
    if (last.isLast) {
      expect(last.instanceStatus).toBe(WorkflowStatus.APPROVED);
      expect(last.eventType).toBe('APPROVED');
    }
  });

  it('maps approve entity effects', () => {
    const po = resolveApproveEntityEffect('PurchaseOrder', 'user-1');
    expect(po).toMatchObject({
      entityType: 'PurchaseOrder',
      whereStatus: PurchaseOrderStatus.PENDING_APPROVAL,
      data: { status: PurchaseOrderStatus.CONFIRMED },
    });

    const pr = resolveApproveEntityEffect('PurchaseRequest', 'user-1');
    expect(pr).toMatchObject({
      entityType: 'PurchaseRequest',
      data: { status: PurchaseRequestStatus.APPROVED, approvedBy: 'user-1' },
    });

    expect(resolveApproveEntityEffect('StockAdjustment', 'user-1')).toEqual({
      entityType: 'StockAdjustment',
      kind: 'inventory',
    });

    expect(resolveApproveEntityEffect('Unknown', 'user-1')).toBeNull();
  });

  it('maps reject entity effects', () => {
    expect(resolveRejectEntityEffect('PurchaseOrder')?.data.status).toBe(
      PurchaseOrderStatus.DRAFT,
    );
    expect(resolveRejectEntityEffect('StockTransfer')?.data.status).toBe(
      TransferStatus.CANCELLED,
    );
    expect(resolveRejectEntityEffect('Quotation')?.data.status).toBe(QuotationStatus.DRAFT);
    expect(resolveRejectEntityEffect('CashRegister')).toBeNull();
  });

  it('builds discount request metadata reference', () => {
    const id = 'abcdef12-3456-7890';
    const meta = buildDiscountRequestMetadata(id, {
      amount: 100,
      reason: 'VIP',
      cartTotal: 1000,
      discountPercent: 10,
    });
    expect(meta.reference).toBe('DISC-ABCDEF12');
    expect(meta.amount).toBe(100);
    expect(meta.reason).toBe('VIP');
  });
});
