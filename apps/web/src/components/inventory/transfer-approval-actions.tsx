"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  canUserApproveWorkflow,
  transferApprovalStatusMessage,
  type WorkflowInstanceLike,
} from "@/lib/workflow-access";

interface Props {
  instance: WorkflowInstanceLike | null | undefined;
  userId?: string;
  userRole?: string;
  requestedBy?: string | null;
  acting?: boolean;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
}

export function TransferApprovalActions({
  instance,
  userId,
  userRole,
  requestedBy,
  acting,
  onApprove,
  onReject,
}: Props) {
  if (!instance || instance.status === "APPROVED") return null;

  if (instance.status === "REJECTED") {
    return <span className="text-[10px] text-red-600 font-medium">Rejected</span>;
  }

  const isSubmitter = !!(userId && requestedBy && requestedBy === userId);
  const { canAct, pendingTaskId } = canUserApproveWorkflow(userId, userRole, instance);
  const message = transferApprovalStatusMessage(instance, isSubmitter);

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] text-amber-700 leading-snug max-w-[220px]">{message || "Pending approval"}</p>
      {canAct && pendingTaskId && (
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[9px] gap-0.5 px-2 border-red-200 text-red-700 hover:bg-red-50"
            disabled={acting}
            onClick={() => onReject(pendingTaskId)}
          >
            {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />}
            Reject
          </Button>
          <Button
            size="sm"
            className="h-6 text-[9px] gap-0.5 px-2"
            disabled={acting}
            onClick={() => onApprove(pendingTaskId)}
          >
            {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}
