"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  GitBranch, RefreshCw, Loader2, CheckCircle2, XCircle, Clock,
  ShoppingBag, Package, Tag, ArrowLeftRight, Shield, ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";
import { useRouter } from "next/navigation";

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
    createdAt?: string;
    metadata: Record<string, unknown>;
    definition: { name: string; key: string };
    events: { eventType: string; createdAt: string }[];
  };
}

const WORKFLOW_CFG: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  purchase_order:   { label: "Purchase Order",   icon: ShoppingBag,    color: "text-blue-500",    bg: "bg-blue-500/10" },
  stock_adjustment: { label: "Stock Adjustment", icon: Package,        color: "text-amber-500",   bg: "bg-amber-500/10" },
  discount_request: { label: "Discount Request", icon: Tag,            color: "text-violet-500",  bg: "bg-violet-500/10" },
  stock_transfer:   { label: "Stock Transfer",   icon: ArrowLeftRight, color: "text-emerald-500", bg: "bg-emerald-500/10" },
};

const GUIDE = [
  { key: "purchase_order", title: "Purchase Order", steps: "Draft → Manager → Finance → GRN", href: "/purchases" },
  { key: "discount_request", title: "Discount Request", steps: "Cashier request → Manager approval", href: "/pos" },
  { key: "stock_adjustment", title: "Stock Adjustment", steps: "Request → Inventory manager approval", href: "/inventory" },
  { key: "stock_transfer", title: "Stock Transfer", steps: "Request → Branch manager approval", href: "/inventory" },
];

interface WorkflowCatalogItem {
  key: string;
  name: string;
  stepCount: number;
  steps: string[];
  status: "active";
  triggerFrom: string;
}

interface WorkflowCatalog {
  operational: boolean;
  workflows: WorkflowCatalogItem[];
}

function workflowCfg(key: string) {
  return WORKFLOW_CFG[key] ?? { label: key.replace(/_/g, " "), icon: GitBranch, color: "text-muted-foreground", bg: "bg-muted/50" };
}

function entityLink(task: WorkflowTask): string | null {
  const key = task.instance.definition.key;
  if (task.instance.entityType === "PurchaseOrder") return `/purchases/${task.instance.entityId}`;
  if (key === "stock_transfer") return "/inventory";
  if (key === "stock_adjustment") return "/inventory";
  if (key === "discount_request") return "/pos";
  return null;
}

function referenceLabel(task: WorkflowTask): string {
  const meta = task.instance.metadata ?? {};
  if (typeof meta.poNumber === "string") return meta.poNumber;
  if (typeof meta.reference === "string") return meta.reference;
  return task.instance.entityId.slice(0, 10) + "…";
}

function submittedAt(task: WorkflowTask): string {
  const ev = task.instance.events?.find((e) => e.eventType === "SUBMITTED");
  const raw = ev?.createdAt ?? task.instance.createdAt;
  if (!raw) return "—";
  return new Date(raw).toLocaleString("en-LK", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function buildColumns(
  acting: string | null,
  onAct: (taskId: string, action: "approve" | "reject") => void,
): ColumnDef<WorkflowTask>[] {
  return [
    {
      id: "workflow",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Workflow" />,
      cell: ({ row }) => {
        const cfg = workflowCfg(row.original.instance.definition.key);
        const Icon = cfg.icon;
        return (
          <div className="flex items-center gap-3 min-w-[180px]">
            <div className={`p-2 rounded-lg shrink-0 ${cfg.bg}`}>
              <Icon className={`h-4 w-4 ${cfg.color}`} />
            </div>
            <div>
              <p className="text-sm font-semibold leading-tight">{row.original.instance.definition.name}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{cfg.label}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "reference",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reference" />,
      cell: ({ row }) => {
        const href = entityLink(row.original);
        const label = referenceLabel(row.original);
        const total = row.original.instance.metadata?.total;
        return (
          <div>
            {href ? (
              <Link href={href} className="text-sm font-mono font-semibold text-blue-500 hover:underline">{label}</Link>
            ) : (
              <span className="text-sm font-mono font-medium">{label}</span>
            )}
            {typeof total === "number" && (
              <p className="text-[11px] text-muted-foreground mt-0.5">LKR {formatNumber(total)}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "stepOrder",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Step" />,
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[10px] font-mono">
          Step {row.original.stepOrder}
        </Badge>
      ),
    },
    {
      id: "submitted",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Submitted" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{submittedAt(row.original)}</span>
      ),
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: () => (
        <Badge variant="warning" className="text-[10px] gap-1">
          <Clock className="h-2.5 w-2.5" /> Pending
        </Badge>
      ),
    },
    {
      id: "actions",
      header: () => <span className="text-xs font-semibold">Actions</span>,
      cell: ({ row }) => {
        const id = row.original.id;
        const busy = acting === id;
        return (
          <div className="flex items-center gap-1.5 justify-end">
            <Button
              size="sm"
              variant="outline"
              className="h-8 gap-1 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              disabled={busy}
              onClick={() => onAct(id, "reject")}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
              Reject
            </Button>
            <Button size="sm" className="h-8 gap-1" disabled={busy} onClick={() => onAct(id, "approve")}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Approve
            </Button>
          </div>
        );
      },
    },
  ];
}

export default function WorkflowsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const adminBypass = bypassesWorkflowApproval(user?.role);

  const [tasks, setTasks] = useState<WorkflowTask[]>([]);
  const [catalog, setCatalog] = useState<WorkflowCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const [tasksRes, catalogRes] = await Promise.all([
        api.get<WorkflowTask[]>("/workflows/tasks/pending"),
        api.get<WorkflowCatalog>("/workflows/catalog"),
      ]);
      setTasks(Array.isArray(tasksRes.data) ? tasksRes.data : []);
      setCatalog(catalogRes.data ?? null);
    } catch {
      toast.error("Failed to load approval tasks");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (adminBypass) {
      router.replace("/dashboard");
      return;
    }
    fetchTasks();
  }, [fetchTasks, adminBypass, router]);

  const act = async (taskId: string, action: "approve" | "reject") => {
    setActing(taskId);
    try {
      await api.put(`/workflows/tasks/${taskId}/${action}`, {});
      toast.success(action === "approve" ? "Approved successfully" : "Request rejected");
      fetchTasks();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Action failed");
    } finally {
      setActing(null);
    }
  };

  const poCount = tasks.filter((t) => t.instance.definition.key === "purchase_order").length;
  const otherCount = tasks.length - poCount;
  const filterOptions = useMemo(() => {
    const keys = Array.from(new Set(tasks.map((t) => t.instance.definition.key)));
    return ["ALL", ...keys];
  }, [tasks]);

  const displayed = typeFilter === "ALL"
    ? tasks
    : tasks.filter((t) => t.instance.definition.key === typeFilter);

  const STATS = [
    { label: "Pending Approvals", value: tasks.length, icon: Clock,         color: "text-amber-500",   bg: "bg-amber-500/10" },
    { label: "Purchase Orders",   value: poCount,      icon: ShoppingBag,    color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Other Requests",    value: otherCount,   icon: Shield,         color: "text-violet-500",  bg: "bg-violet-500/10" },
    { label: "Active Workflows",  value: catalog?.workflows.length ?? GUIDE.length, icon: GitBranch, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const columns = useMemo(() => buildColumns(acting, act), [acting]);

  if (adminBypass) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-sm text-muted-foreground">
        Redirecting…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 w-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Approval Workflows</h1>
          <p className="text-sm text-muted-foreground">
            Review and approve purchase orders, discounts, stock adjustments & transfers
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchTasks} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" asChild>
            <Link href="/purchases"><ExternalLink className="h-3.5 w-3.5" /> Purchases</Link>
          </Button>
        </div>
      </div>

      {/* System status */}
      {catalog?.operational && (
        <Card className="border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 flex-1">
              <div className="p-2.5 rounded-xl bg-emerald-500/15">
                <CheckCircle2 className="h-6 w-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  All approval workflows are active and working
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {catalog.workflows.length} workflow types configured — Purchase Orders, Discounts, Stock Adjustments & Transfers
                </p>
              </div>
            </div>
            <Badge className="bg-emerald-500 hover:bg-emerald-500 text-white shrink-0 w-fit">
              System Operational
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter pills */}
      {filterOptions.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Filter:</span>
          {filterOptions.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                typeFilter === f
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "ALL" ? "All" : workflowCfg(f).label}
            </button>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-24 rounded-xl border bg-card">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : displayed.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="p-4 rounded-2xl bg-emerald-500/10">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            </div>
            <p className="text-base font-semibold">All caught up</p>
            <p className="text-sm text-muted-foreground text-center max-w-sm">
              No pending approvals right now. Submit a purchase order from Purchases to start a workflow.
            </p>
            <Button size="sm" variant="outline" className="mt-2 gap-1.5" asChild>
              <Link href="/purchases"><ShoppingBag className="h-3.5 w-3.5" /> Go to Purchases</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ClientSideTable
          data={displayed}
          columns={columns}
          pageCount={Math.ceil(displayed.length / 10)}
        />
      )}

      {/* Workflow guide */}
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">Supported Workflows</h2>
          <p className="text-xs text-muted-foreground mt-0.5">All paths are live — submit from the linked module to start approval</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {GUIDE.map((g) => {
            const cfg = workflowCfg(g.key);
            const Icon = cfg.icon;
            const live = catalog?.workflows.find((w) => w.key === g.key);
            return (
              <Card key={g.key} className="hover:shadow-md transition-shadow border-emerald-500/10">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-2 rounded-lg shrink-0 ${cfg.bg}`}>
                        <Icon className={`h-4 w-4 ${cfg.color}`} />
                      </div>
                      <p className="text-sm font-semibold leading-tight">{g.title}</p>
                    </div>
                    <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 shrink-0">
                      Active
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{g.steps}</p>
                  {live && (
                    <p className="text-[10px] text-emerald-600/90 font-medium">
                      {live.stepCount} step{live.stepCount !== 1 ? "s" : ""} · {live.triggerFrom}
                    </p>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs gap-1 -ml-2" asChild>
                    <Link href={g.href}>
                      Open module <ExternalLink className="h-3 w-3" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
