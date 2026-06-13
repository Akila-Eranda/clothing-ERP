import { ForbiddenException } from '@nestjs/common';
import { bypassesWorkflowApproval } from './workflow-bypass.helper';

export interface WorkflowStepLike {
  stepOrder: number;
  approverRole?: string | null;
  approverUserId?: string | null;
}

export interface WorkflowTaskLike {
  stepOrder: number;
  assigneeId?: string | null;
}

export interface WorkflowInstanceLike {
  initiatedBy?: string | null;
}

/** Whether the user may approve/reject the current pending step (not self-approval). */
export function canUserActOnWorkflowTask(
  userId: string,
  userRoles: string[],
  task: WorkflowTaskLike,
  instance: WorkflowInstanceLike,
  steps: WorkflowStepLike[],
): boolean {
  if (bypassesWorkflowApproval(userRoles)) return true;

  if (instance.initiatedBy && instance.initiatedBy === userId) return false;

  if (task.assigneeId && task.assigneeId === userId) return true;

  const step = steps.find((s) => s.stepOrder === task.stepOrder);
  if (!step) return false;

  if (step.approverUserId && step.approverUserId === userId) return true;

  if (step.approverRole && userRoles.includes(step.approverRole)) return true;

  return false;
}

export function assertCanActOnWorkflowTask(
  userId: string,
  userRoles: string[],
  task: WorkflowTaskLike,
  instance: WorkflowInstanceLike,
  steps: WorkflowStepLike[],
): void {
  if (!canUserActOnWorkflowTask(userId, userRoles, task, instance, steps)) {
    throw new ForbiddenException(
      'You are not authorized to act on this approval step. A different role must approve this request.',
    );
  }
}
