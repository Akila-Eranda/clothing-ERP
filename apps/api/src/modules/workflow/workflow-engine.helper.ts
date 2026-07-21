/**
 * Workflow Engine — pure transition / definition helpers.
 * I/O (Prisma, Inventory, events) stays in WorkflowService.
 */

import {
  CashRegisterStatus,
  PurchaseOrderStatus,
  PurchaseRequestStatus,
  QuotationStatus,
  TransferStatus,
  WorkflowStatus,
  WorkflowTaskStatus,
} from '@prisma/client';

export const WORKFLOW_CATALOG_KEYS = [
  'purchase_order',
  'purchase_request',
  'stock_adjustment',
  'discount_request',
  'stock_transfer',
  'cash_variance',
  'quotation',
] as const;

export type WorkflowCatalogKey = (typeof WORKFLOW_CATALOG_KEYS)[number];

export type WorkflowStepTemplate = {
  name: string;
  approverRole: string;
};

export type WorkflowDefinitionTemplate = {
  name: string;
  steps: WorkflowStepTemplate[];
};

export const DEFAULT_WORKFLOW_DEFINITIONS: Record<
  WorkflowCatalogKey,
  WorkflowDefinitionTemplate
> = {
  purchase_order: {
    name: 'Purchase Order Approval',
    steps: [
      { name: 'Manager Review', approverRole: 'BRANCH_MANAGER' },
      { name: 'Finance Approval', approverRole: 'ACCOUNTANT' },
    ],
  },
  purchase_request: {
    name: 'Purchase Request Approval',
    steps: [{ name: 'Manager Review', approverRole: 'BRANCH_MANAGER' }],
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

export const WORKFLOW_TRIGGER_FROM: Record<WorkflowCatalogKey, string> = {
  purchase_order: 'Purchases → Submit for approval',
  purchase_request: 'Purchase Requests → Submit for approval',
  stock_adjustment: 'Inventory → Adjust stock (manual)',
  discount_request: 'POS → Manager discount override',
  stock_transfer: 'Inventory → Stock transfer',
  cash_variance: 'POS → Cash close with variance over threshold',
  quotation: 'Quotations → Submit for approval',
};

export function isWorkflowCatalogKey(key: string): key is WorkflowCatalogKey {
  return (WORKFLOW_CATALOG_KEYS as readonly string[]).includes(key);
}

export function getDefaultDefinition(key: string): WorkflowDefinitionTemplate | null {
  if (!isWorkflowCatalogKey(key)) return null;
  return DEFAULT_WORKFLOW_DEFINITIONS[key];
}

/** Initial task rows: step 1 PENDING, rest SKIPPED. */
export function buildInitialTaskCreates(
  steps: { stepOrder: number; approverUserId?: string | null }[],
): {
  stepOrder: number;
  assigneeId: string | undefined;
  status: WorkflowTaskStatus;
}[] {
  return steps.map((step) => ({
    stepOrder: step.stepOrder,
    assigneeId: step.approverUserId ?? undefined,
    status: step.stepOrder === 1 ? WorkflowTaskStatus.PENDING : WorkflowTaskStatus.SKIPPED,
  }));
}

export function canStartWorkflow(existingStatus: WorkflowStatus | null | undefined): boolean {
  return existingStatus !== WorkflowStatus.IN_PROGRESS;
}

export type ApproveTransition =
  | {
      isLast: true;
      eventType: 'APPROVED';
      instanceStatus: typeof WorkflowStatus.APPROVED;
    }
  | {
      isLast: false;
      nextStep: number;
      eventType: 'STEP_APPROVED';
    };

export function resolveApproveTransition(
  stepOrder: number,
  totalSteps: number,
): ApproveTransition {
  if (stepOrder >= totalSteps) {
    return {
      isLast: true,
      eventType: 'APPROVED',
      instanceStatus: WorkflowStatus.APPROVED,
    };
  }
  return {
    isLast: false,
    nextStep: stepOrder + 1,
    eventType: 'STEP_APPROVED',
  };
}

/** Entity side-effect descriptors applied after final approve (except StockAdjustment → Inventory). */
export type ApproveEntityEffect =
  | {
      entityType: 'PurchaseOrder';
      whereStatus: typeof PurchaseOrderStatus.PENDING_APPROVAL;
      data: { status: typeof PurchaseOrderStatus.CONFIRMED };
    }
  | {
      entityType: 'PurchaseRequest';
      whereStatus: typeof PurchaseRequestStatus.PENDING_APPROVAL;
      data: { status: typeof PurchaseRequestStatus.APPROVED; approvedBy: string };
    }
  | { entityType: 'StockAdjustment'; kind: 'inventory' }
  | {
      entityType: 'CashRegister';
      whereStatus: typeof CashRegisterStatus.PENDING_APPROVAL;
      data: {
        status: typeof CashRegisterStatus.CLOSED;
        approvedById: string;
        approvedAt: Date;
      };
    }
  | {
      entityType: 'StockTransfer';
      whereStatus: typeof TransferStatus.PENDING;
      data: { approvedBy: string };
    }
  | {
      entityType: 'Quotation';
      whereStatus: typeof QuotationStatus.PENDING_APPROVAL;
      data: { status: typeof QuotationStatus.SENT };
    };

export type RejectEntityEffect =
  | {
      entityType: 'PurchaseOrder';
      whereStatus: typeof PurchaseOrderStatus.PENDING_APPROVAL;
      data: { status: typeof PurchaseOrderStatus.DRAFT };
    }
  | {
      entityType: 'PurchaseRequest';
      whereStatus: typeof PurchaseRequestStatus.PENDING_APPROVAL;
      data: { status: typeof PurchaseRequestStatus.REJECTED };
    }
  | {
      entityType: 'StockTransfer';
      whereStatus: typeof TransferStatus.PENDING;
      data: { status: typeof TransferStatus.CANCELLED };
    }
  | {
      entityType: 'Quotation';
      whereStatus: typeof QuotationStatus.PENDING_APPROVAL;
      data: { status: typeof QuotationStatus.DRAFT };
    };

export function resolveApproveEntityEffect(
  entityType: string,
  userId: string,
  now = new Date(),
): ApproveEntityEffect | null {
  switch (entityType) {
    case 'PurchaseOrder':
      return {
        entityType: 'PurchaseOrder',
        whereStatus: PurchaseOrderStatus.PENDING_APPROVAL,
        data: { status: PurchaseOrderStatus.CONFIRMED },
      };
    case 'PurchaseRequest':
      return {
        entityType: 'PurchaseRequest',
        whereStatus: PurchaseRequestStatus.PENDING_APPROVAL,
        data: { status: PurchaseRequestStatus.APPROVED, approvedBy: userId },
      };
    case 'StockAdjustment':
      return { entityType: 'StockAdjustment', kind: 'inventory' };
    case 'CashRegister':
      return {
        entityType: 'CashRegister',
        whereStatus: CashRegisterStatus.PENDING_APPROVAL,
        data: {
          status: CashRegisterStatus.CLOSED,
          approvedById: userId,
          approvedAt: now,
        },
      };
    case 'StockTransfer':
      return {
        entityType: 'StockTransfer',
        whereStatus: TransferStatus.PENDING,
        data: { approvedBy: userId },
      };
    case 'Quotation':
      return {
        entityType: 'Quotation',
        whereStatus: QuotationStatus.PENDING_APPROVAL,
        data: { status: QuotationStatus.SENT },
      };
    default:
      return null;
  }
}

export function resolveRejectEntityEffect(entityType: string): RejectEntityEffect | null {
  switch (entityType) {
    case 'PurchaseOrder':
      return {
        entityType: 'PurchaseOrder',
        whereStatus: PurchaseOrderStatus.PENDING_APPROVAL,
        data: { status: PurchaseOrderStatus.DRAFT },
      };
    case 'PurchaseRequest':
      return {
        entityType: 'PurchaseRequest',
        whereStatus: PurchaseRequestStatus.PENDING_APPROVAL,
        data: { status: PurchaseRequestStatus.REJECTED },
      };
    case 'StockTransfer':
      return {
        entityType: 'StockTransfer',
        whereStatus: TransferStatus.PENDING,
        data: { status: TransferStatus.CANCELLED },
      };
    case 'Quotation':
      return {
        entityType: 'Quotation',
        whereStatus: QuotationStatus.PENDING_APPROVAL,
        data: { status: QuotationStatus.DRAFT },
      };
    default:
      return null;
  }
}

export function buildDiscountRequestMetadata(
  id: string,
  input: {
    amount: number;
    reason: string;
    cartTotal?: number;
    discountPercent?: number;
  },
): Record<string, unknown> {
  return {
    reference: `DISC-${id.slice(0, 8).toUpperCase()}`,
    amount: input.amount,
    total: input.amount,
    discountPercent: input.discountPercent,
    reason: input.reason,
    cartTotal: input.cartTotal,
  };
}
