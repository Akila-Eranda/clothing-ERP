"use client";

import React from "react";
import Link from "next/link";
import { CheckCircle2, Clock, GitBranch, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  approverRoleLabel,
  canUserApproveWorkflow,
  poApprovalStatusMessage,
  type WorkflowInstanceLike,
  type WorkflowStepLike,
} from "@/lib/workflow-access";

interface QuotationApprovalPanelProps {
  instance: WorkflowInstanceLike | null;
  userId?: string;
  userRole?: string;
  acting?: boolean;
  onApprove?: (taskId: string) => void;
  onReject?: (taskId: string) => void;
}

function stepState(
  step: WorkflowStepLike,
  tasks: WorkflowInstanceLike["tasks"],
): "done" | "active" | "pending" {
  const task = tasks?.find((t) => t.stepOrder === step.stepOrder);
  if (!task) return "pending";
  if (task.status === "APPROVED") return "done";
  if (task.status === "PENDING") return "active";
  return "pending";
}

export function QuotationApprovalPanel({
  instance,
  userId,
  userRole,
  acting,
  onApprove,
  onReject,
}: QuotationApprovalPanelProps) {
  if (!instance || instance.status === "APPROVED") return null;

  const steps = instance.definition?.steps ?? [];
  const tasks = instance.tasks ?? [];
  const isSubmitter = !!(userId && instance.initiatedBy === userId);
  const { canAct, pendingTaskId, pendingStep } = canUserApproveWorkflow(userId, userRole, instance);
  const message = poApprovalStatusMessage(instance, isSubmitter);

  if (instance.status === "REJECTED") {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        This quotation was rejected during approval. Edit and submit again from Draft status.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50/80 p-4 space-y-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-teal-100 shrink-0">
          <GitBranch className="h-5 w-5 text-teal-700" />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <p className="font-semibold text-sm text-teal-900">Quotation approval in progress</p>
          {message && <p className="text-xs text-teal-800">{message}</p>}
          <p className="text-xs text-teal-700/80">
            Quote can be sent to the customer only after all approval steps are complete.
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0 h-8 text-xs" asChild>
          <Link href="/workflows">All approvals</Link>
        </Button>
      </div>

      {steps.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          {steps.map((step, i) => {
            const state = stepState(step, tasks);
            return (
              <React.Fragment key={step.stepOrder}>
                {i > 0 && <div className="hidden sm:block w-6 h-px bg-teal-200 self-center shrink-0" />}
                <div
                  className={`flex-1 rounded-lg border px-3 py-2 text-xs ${
                    state === "done"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : state === "active"
                        ? "border-teal-300 bg-white text-teal-900 ring-1 ring-teal-200"
                        : "border-teal-100 bg-teal-50/50 text-teal-600"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-medium">
                    {state === "done" ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : state === "active" ? (
                      <Clock className="h-3.5 w-3.5 text-teal-600 shrink-0 animate-pulse" />
                    ) : (
                      <span className="h-3.5 w-3.5 rounded-full border border-teal-300 shrink-0" />
                    )}
                    {step.name}
                  </div>
                  <p className="text-[10px] mt-0.5 opacity-80">{approverRoleLabel(step.approverRole)}</p>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      )}

      {canAct && pendingTaskId && onApprove && onReject && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-teal-200/80">
          <span className="text-xs text-teal-800 mr-auto">
            You can approve: <strong>{pendingStep?.name}</strong>
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1 border-red-200 text-red-700 hover:bg-red-50"
            disabled={acting}
            onClick={() => onReject(pendingTaskId)}
          >
            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
            Reject
          </Button>
          <Button size="sm" className="h-8 gap-1" disabled={acting} onClick={() => onApprove(pendingTaskId)}>
            {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Approve
          </Button>
        </div>
      )}
    </div>
  );
}
