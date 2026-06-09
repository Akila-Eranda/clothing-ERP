"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, RefreshCw, GitBranch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface WorkflowTask {
  id: string;
  stepOrder: number;
  status: string;
  comment?: string | null;
  instance: {
    id: string;
    entityType: string;
    entityId: string;
    status: string;
    metadata: Record<string, unknown>;
    definition: { name: string; key: string };
    events: { eventType: string; createdAt: string }[];
  };
}

export default function WorkflowsPage() {
  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<WorkflowTask[]>("/workflows/tasks/pending");
      setTasks(Array.isArray(res.data) ? res.data : []);
    } catch {
      toast.error("Failed to load approval tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const act = async (taskId: string, action: "approve" | "reject") => {
    setActing(taskId);
    try {
      await api.put(`/workflows/tasks/${taskId}/${action}`, {});
      toast.success(action === "approve" ? "Approved" : "Rejected");
      fetchTasks();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Action failed");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-[1000px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><GitBranch className="h-6 w-6" /> Approval Workflows</h1>
          <p className="text-sm text-muted-foreground">PO, stock adjustments, discounts & transfers — multi-step approvals</p>
        </div>
        <Button variant="outline" size="sm" onClick={fetchTasks} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pending Approvals ({tasks.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : tasks.length === 0 ? (
            <p className="text-center py-10 text-muted-foreground">No pending approvals — all caught up!</p>
          ) : tasks.map((task) => (
            <div key={task.id} className="flex items-center justify-between p-4 rounded-xl border gap-4">
              <div className="min-w-0">
                <p className="font-semibold">{task.instance.definition.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Step {task.stepOrder} · {task.instance.entityType} · {task.instance.entityId.slice(0, 12)}…
                </p>
                <div className="flex gap-1.5 mt-2">
                  <Badge variant="secondary" className="text-[10px]">{task.instance.definition.key}</Badge>
                  <Badge variant="warning" className="text-[10px]">Pending</Badge>
                </div>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" className="gap-1 text-red-600" disabled={acting === task.id}
                  onClick={() => act(task.id, "reject")}>
                  {acting === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />} Reject
                </Button>
                <Button size="sm" className="gap-1" disabled={acting === task.id}
                  onClick={() => act(task.id, "approve")}>
                  {acting === task.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Approve
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Workflow Examples</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p><strong className="text-foreground">Purchase Order:</strong> Draft → Manager Approval → Finance Approval → GRN → Stock Update</p>
          <p><strong className="text-foreground">Discount Request:</strong> Cashier Request → Manager Approval → Applied to Invoice</p>
          <p><strong className="text-foreground">Stock Adjustment:</strong> Adjustment Request → Inventory Manager Approval → Ledger Entry</p>
        </CardContent>
      </Card>
    </div>
  );
}
