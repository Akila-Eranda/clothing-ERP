import { normalizeRole } from '@/lib/utils';

/** Super Admin & Tenant Admin skip approval workflows in the shop UI. */
export function bypassesWorkflowApproval(role?: string | null): boolean {
  const r = normalizeRole(role);
  return r === 'super_admin' || r === 'tenant_admin';
}

/** Cart discount above this % requires manager workflow approval (non-admin). */
export const DISCOUNT_APPROVAL_THRESHOLD_PCT = 10;

/** Roles that typically see pending approval tasks. */
export function isWorkflowApproverRole(role?: string | null): boolean {
  const r = normalizeRole(role);
  return ['branch_manager', 'inventory_manager', 'accountant'].includes(r);
}

const APPROVER_ROLE_LABELS: Record<string, string> = {
  branch_manager: 'Branch Manager',
  inventory_manager: 'Inventory Manager',
  accountant: 'Accountant',
};

export function approverRoleLabel(role?: string | null): string {
  if (!role) return 'Approver';
  const key = role.toLowerCase();
  return APPROVER_ROLE_LABELS[key] ?? role.replace(/_/g, ' ');
}

export interface WorkflowStepLike {
  stepOrder: number;
  name: string;
  approverRole?: string | null;
}

export interface WorkflowTaskLike {
  id: string;
  stepOrder: number;
  status: string;
}

export interface WorkflowInstanceLike {
  initiatedBy?: string | null;
  status?: string;
  definition?: { steps?: WorkflowStepLike[] };
  tasks?: WorkflowTaskLike[];
}

/** Whether the current user may approve/reject the pending step on this instance. */
export function canUserApproveWorkflow(
  userId: string | undefined,
  userRole: string | undefined,
  instance: WorkflowInstanceLike | null,
): { canAct: boolean; pendingTaskId?: string; pendingStep?: WorkflowStepLike } {
  if (!instance || !userId || instance.status !== 'IN_PROGRESS') {
    return { canAct: false };
  }
  if (bypassesWorkflowApproval(userRole)) {
    const pending = instance.tasks?.find((t) => t.status === 'PENDING');
    return { canAct: !!pending, pendingTaskId: pending?.id, pendingStep: instance.definition?.steps?.find((s) => s.stepOrder === pending?.stepOrder) };
  }
  if (instance.initiatedBy && instance.initiatedBy === userId) return { canAct: false };

  const pendingTask = instance.tasks?.find((t) => t.status === 'PENDING');
  if (!pendingTask) return { canAct: false };

  const step = instance.definition?.steps?.find((s) => s.stepOrder === pendingTask.stepOrder);
  if (!step?.approverRole) return { canAct: false };

  const userNorm = normalizeRole(userRole);
  const stepNorm = step.approverRole.toLowerCase();
  const matches = userNorm === stepNorm;

  return { canAct: matches, pendingTaskId: pendingTask.id, pendingStep: step };
}

/** Human-readable status for the current approval step. */
export function poApprovalStatusMessage(
  instance: WorkflowInstanceLike | null,
  isSubmitter: boolean,
): string {
  if (!instance || instance.status !== 'IN_PROGRESS') return '';
  const pendingTask = instance.tasks?.find((t) => t.status === 'PENDING');
  if (!pendingTask) return 'Approval in progress…';
  const step = instance.definition?.steps?.find((s) => s.stepOrder === pendingTask.stepOrder);
  const who = approverRoleLabel(step?.approverRole);
  if (isSubmitter) {
    return `Waiting for ${who} to approve (${step?.name ?? 'review'}). You cannot approve your own request.`;
  }
  return `${step?.name ?? 'Review'} — ${who} approval required`;
}
