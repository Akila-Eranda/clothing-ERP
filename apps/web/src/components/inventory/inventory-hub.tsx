"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Package, TrendingDown, BarChart3, RefreshCw, ShoppingBag,
  Layers, Clock, Skull, CheckCircle2, XCircle, Loader2, ArrowLeftRight, Truck, Ban, Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { StockAdjustModal, type InventoryItem } from "@/components/inventory/stock-adjust-modal";
import { StockTransferModal } from "@/components/inventory/stock-transfer-modal";
import { TransferApprovalActions } from "@/components/inventory/transfer-approval-actions";
import { CreatePOModal } from "@/components/purchases/create-po-modal";
import { useRouter } from "next/navigation";
import { formatNumber } from "@/lib/utils";
import { isTransferWorkflowApproved, type WorkflowInstanceLike } from "@/lib/workflow-access";
import { useShopWorkspace, hasExpiryTracking, hasBatchTracking } from "@/lib/use-shop-profile";
import { variantTableColumns } from "@/lib/shop-vertical";
import { useAuthStore } from "@/stores/auth-store";
import { useBranchStore } from "@/stores/branch-store";

export type InventorySection = "stock" | "ledger" | "abc" | "dead" | "aging" | "transfers";

const SECTION_META: Record<InventorySection, { title: string; description: string }> = {
  stock: { title: "Stock Levels", description: "On-hand quantities, low stock and adjustments" },
  ledger: { title: "Inventory Ledger", description: "Stock movement history and quantity changes" },
  abc: { title: "ABC Analysis", description: "Classify SKUs by revenue contribution" },
  dead: { title: "Dead Stock", description: "Items with stock but no recent sales" },
  aging: { title: "Stock Aging", description: "How long inventory has been sitting" },
  transfers: { title: "Stock Transfers", description: "Move stock between branches with approval" },
};

interface LedgerLog {
  id: string;
  movementType: string;
  quantityChange: number;
  quantityBefore: number;
  quantityAfter: number;
  reservedBefore: number;
  reservedAfter: number;
  damagedBefore: number;
  damagedAfter: number;
  notes?: string | null;
  createdAt: string;
  variant: { sku: string; name: string; product: { name: string } };
}

interface LedgerSummary {
  onHand: number;
  reserved: number;
  available: number;
  damaged: number;
  returned: number;
  value: number;
  skuCount: number;
}

interface AbcRow {
  sku: string;
  name: string;
  quantity: number;
  revenue: number;
  grade: string;
  cumulativePct: number;
}

interface AgingDetail {
  name: string;
  ageDays: number;
  qty: number;
}

function gradeBadge(grade: string) {
  if (grade === "A") return "bg-emerald-500/15 text-emerald-700 border-emerald-500/25";
  if (grade === "B") return "bg-amber-500/15 text-amber-700 border-amber-500/25";
  return "bg-slate-500/15 text-slate-700 border-slate-500/25";
}

function ageBucket(days: number) {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  return "90+";
}

const ABC_COLUMNS: ColumnDef<AbcRow>[] = [
  {
    accessorKey: "grade",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Grade" />,
    cell: ({ row }) => (
      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${gradeBadge(row.original.grade)}`}>
        {row.original.grade}
      </span>
    ),
    filterFn: (row, _id, value: string[]) => !value?.length || value.includes(row.original.grade),
  },
  {
    accessorKey: "sku",
    header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
    cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku}</span>,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "quantity",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Qty" />,
    cell: ({ row }) => <span className="tabular-nums font-semibold">{row.original.quantity}</span>,
  },
  {
    accessorKey: "revenue",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Revenue" />,
    cell: ({ row }) => <span className="text-sm font-semibold tabular-nums">LKR {formatNumber(row.original.revenue)}</span>,
  },
  {
    accessorKey: "cumulativePct",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Cumulative %" />,
    cell: ({ row }) => (
      <div className="flex items-center gap-2 min-w-[120px]">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full ${row.original.grade === "A" ? "bg-emerald-500" : row.original.grade === "B" ? "bg-amber-500" : "bg-slate-400"}`}
            style={{ width: `${Math.min(100, row.original.cumulativePct)}%` }}
          />
        </div>
        <span className="text-xs tabular-nums text-muted-foreground w-10 text-right">{row.original.cumulativePct}%</span>
      </div>
    ),
  },
];

const AGING_COLUMNS: ColumnDef<AgingDetail & { bucket: string }>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
    cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
  },
  {
    accessorKey: "ageDays",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Age (days)" />,
    cell: ({ row }) => {
      const d = row.original.ageDays;
      const color = d > 90 ? "text-red-600" : d > 60 ? "text-amber-600" : d > 30 ? "text-blue-600" : "text-emerald-600";
      return <span className={`font-semibold tabular-nums ${color}`}>{d}</span>;
    },
  },
  {
    accessorKey: "bucket",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Bucket" />,
    cell: ({ row }) => {
      const b = row.original.bucket;
      const cls =
        b === "90+" ? "bg-red-500/10 text-red-700 border-red-500/20"
          : b === "61-90" ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
            : b === "31-60" ? "bg-blue-500/10 text-blue-700 border-blue-500/20"
              : "bg-emerald-500/10 text-emerald-700 border-emerald-500/20";
      return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{b} days</span>;
    },
    filterFn: (row, _id, value: string[]) => !value?.length || value.includes(row.original.bucket),
  },
  {
    accessorKey: "qty",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Qty" />,
    cell: ({ row }) => <span className="font-semibold tabular-nums">{row.original.qty}</span>,
  },
];

interface StockTransferRow {
  id: string;
  fromBranchId: string;
  toBranchId: string;
  status: "PENDING" | "IN_TRANSIT" | "RECEIVED" | "CANCELLED";
  notes?: string | null;
  requestedBy?: string | null;
  createdAt: string;
  items: {
    id: string;
    requestedQty: number;
    sentQty: number;
    receivedQty: number;
    variant?: { sku: string; name: string; product: { name: string } };
  }[];
  fromBranch?: { id: string; name: string; code?: string | null };
  toBranch?: { id: string; name: string; code?: string | null } | null;
  workflow?: WorkflowInstanceLike | null;
}

const TRANSFER_STATUS: Record<StockTransferRow["status"], { label: string; variant: "warning" | "success" | "secondary" | "danger" | "info" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  IN_TRANSIT: { label: "In Transit", variant: "info" },
  RECEIVED: { label: "Received", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "danger" },
};

function buildTransferColumns(opts: {
  userId?: string;
  userRole?: string;
  branchScopeId?: string;
  transferActionId: string | null;
  onDispatch: (id: string) => void;
  onReceive: (id: string) => void;
  onCancel: (id: string) => void;
  onApprove: (taskId: string) => void;
  onReject: (taskId: string) => void;
}): ColumnDef<StockTransferRow>[] {
  return [
    {
      id: "date",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleString("en-LK", {
            day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      id: "from",
      header: ({ column }) => <DataTableColumnHeader column={column} title="From" />,
      accessorFn: (r) => r.fromBranch?.name ?? "",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.fromBranch?.name ?? "—"}</span>,
    },
    {
      id: "to",
      header: ({ column }) => <DataTableColumnHeader column={column} title="To" />,
      accessorFn: (r) => r.toBranch?.name ?? "",
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.toBranch?.name ?? "—"}</span>,
    },
    {
      id: "items",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => {
        const t = row.original;
        const summary = t.items
          .map((i) => `${i.variant?.product?.name ?? "Item"} ×${i.requestedQty}`)
          .slice(0, 2)
          .join(", ");
        return (
          <div className="max-w-[220px]">
            <p className="text-sm truncate">{summary || "—"}</p>
            <p className="text-[10px] text-muted-foreground">
              {t.items.length} line{t.items.length === 1 ? "" : "s"}
              {t.items.length > 2 ? ` · +${t.items.length - 2} more` : ""}
            </p>
          </div>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const t = row.original;
        const st = TRANSFER_STATUS[t.status];
        const showPendingApproval = t.status === "PENDING" && t.workflow?.status === "IN_PROGRESS";
        return (
          <div>
            <Badge variant={st.variant} className="text-[10px] gap-1">
              {t.status === "IN_TRANSIT" && <Truck className="h-2.5 w-2.5" />}
              {t.status === "RECEIVED" && <CheckCircle2 className="h-2.5 w-2.5" />}
              {t.status === "PENDING" && <Clock className="h-2.5 w-2.5" />}
              {t.status === "CANCELLED" && <Ban className="h-2.5 w-2.5" />}
              {st.label}
            </Badge>
            {showPendingApproval && (
              <p className="text-[10px] text-amber-600 mt-1 font-medium">Awaiting approval</p>
            )}
          </div>
        );
      },
      filterFn: (row, _id, value: string[]) => !value?.length || value.includes(row.original.status),
    },
    {
      id: "approval",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Approval" />,
      cell: ({ row }) => {
        const t = row.original;
        const wfActing = !!(opts.transferActionId && t.workflow?.tasks?.some((task) => task.id === opts.transferActionId));
        if (t.status === "PENDING" && t.workflow) {
          return (
            <TransferApprovalActions
              instance={t.workflow}
              userId={opts.userId}
              userRole={opts.userRole}
              requestedBy={t.requestedBy}
              acting={wfActing}
              onApprove={opts.onApprove}
              onReject={opts.onReject}
            />
          );
        }
        if (t.workflow?.status === "APPROVED") {
          return <span className="text-xs font-medium text-emerald-600">Approved</span>;
        }
        if (t.workflow?.status === "REJECTED") {
          return <span className="text-xs font-medium text-red-600">Rejected</span>;
        }
        return <span className="text-xs text-muted-foreground">—</span>;
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const t = row.original;
        const approved = isTransferWorkflowApproved(t.workflow);
        const canDispatch = t.status === "PENDING" && approved && (!opts.branchScopeId || t.fromBranchId === opts.branchScopeId);
        const canReceive = t.status === "IN_TRANSIT" && (!opts.branchScopeId || t.toBranchId === opts.branchScopeId);
        const canCancel = t.status === "PENDING" && (!opts.branchScopeId || t.fromBranchId === opts.branchScopeId);
        const acting = opts.transferActionId === t.id;
        if (!canDispatch && !canReceive && !canCancel) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex gap-1.5 flex-wrap justify-end">
            {canDispatch && (
              <Button size="sm" variant="outline" className="h-8 text-xs gap-1.5" disabled={acting}
                onClick={() => opts.onDispatch(t.id)}>
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                Dispatch
              </Button>
            )}
            {canReceive && (
              <Button size="sm" className="h-8 text-xs gap-1.5" disabled={acting}
                onClick={() => opts.onReceive(t.id)}>
                {acting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                Receive
              </Button>
            )}
            {canCancel && (
              <Button size="sm" variant="ghost" className="h-8 text-xs gap-1.5 text-red-600 hover:text-red-700" disabled={acting}
                onClick={() => opts.onCancel(t.id)}>
                <Ban className="h-3.5 w-3.5" /> Cancel
              </Button>
            )}
          </div>
        );
      },
    },
  ];
}

function getStockStatus(qty: number) {
  if (qty === 0) return "out_of_stock";
  if (qty <= 5) return "low_stock";
  return "in_stock";
}

function buildStockColumns(
  onAdjust: (item: InventoryItem) => void,
  onCreatePO: (item: InventoryItem) => void,
  opts: { showBatch: boolean; showExpiry: boolean; variantCols: ReturnType<typeof variantTableColumns> },
): ColumnDef<InventoryItem & { latestBatch?: string | null; latestExpiry?: string | null }>[] {
  const cols: ColumnDef<InventoryItem & { latestBatch?: string | null; latestExpiry?: string | null }>[] = [
    {
      id: "product",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.variant.product.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.variant.name}</p>
        </div>
      ),
    },
    {
      id: "sku",
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.variant.sku}</span>,
    },
    ...opts.variantCols.map((col) => ({
      id: col.field,
      header: ({ column }: { column: { id: string } }) => <DataTableColumnHeader column={column as never} title={col.label} />,
      cell: ({ row }: { row: { original: InventoryItem } }) => (
        <span className="text-xs text-muted-foreground">
          {(row.original.variant as InventoryItem["variant"] & { size?: string; color?: string; material?: string; style?: string })[col.field] ?? "—"}
        </span>
      ),
    })),
    {
      accessorKey: "quantity",
      header: ({ column }) => <DataTableColumnHeader column={column} title="On Hand" />,
      cell: ({ row }) => <span className="font-bold">{row.original.quantity}</span>,
    },
    {
      id: "reserved",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reserved" />,
      cell: ({ row }) => {
        const v = (row.original as InventoryItem & { reservedQty?: number }).reservedQty ?? 0;
        return <span className={v > 0 ? "text-amber-600 font-semibold" : "text-muted-foreground"}>{v}</span>;
      },
    },
    {
      id: "available",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Available" />,
      cell: ({ row }) => {
        const r = row.original as InventoryItem & { reservedQty?: number };
        const avail = Math.max(0, row.original.quantity - (r.reservedQty ?? 0));
        return <span className="font-semibold text-emerald-600">{avail}</span>;
      },
    },
    {
      id: "damaged",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Damaged" />,
      cell: ({ row }) => {
        const v = (row.original as InventoryItem & { damagedQty?: number }).damagedQty ?? 0;
        return <span className={v > 0 ? "text-red-500" : "text-muted-foreground"}>{v}</span>;
      },
    },
    {
      id: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const s = getStockStatus(row.original.quantity);
        return (
          <Badge variant={s === "out_of_stock" ? "danger" : s === "low_stock" ? "warning" : "success"} className="text-[10px]">
            {s === "out_of_stock" ? "Out of Stock" : s === "low_stock" ? "Low Stock" : "In Stock"}
          </Badge>
        );
      },
    },
  ];

  if (opts.showBatch) {
    cols.splice(cols.length - 1, 0, {
      id: "batch",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Batch" />,
      cell: ({ row }) => (
        <span className="text-xs font-mono text-muted-foreground">{(row.original as { latestBatch?: string | null }).latestBatch ?? "—"}</span>
      ),
    });
  }
  if (opts.showExpiry) {
    cols.splice(cols.length - 1, 0, {
      id: "expiry",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expiry" />,
      cell: ({ row }) => {
        const d = (row.original as { latestExpiry?: string | null }).latestExpiry;
        if (!d) return <span className="text-xs text-muted-foreground">—</span>;
        const exp = new Date(d);
        const soon = exp.getTime() - Date.now() < 7 * 86400000;
        return <span className={`text-xs ${soon ? "text-amber-600 font-semibold" : "text-muted-foreground"}`}>{exp.toLocaleDateString("en-LK")}</span>;
      },
    });
  }

  cols.push({
    id: "actions",
    cell: ({ row }) => (
      <TableActionsRow
        editAction={{ action: () => onAdjust(row.original), tooltip: "Adjust Stock" }}
        dropMoreActions={[{ text: "Create PO", function: () => onCreatePO(row.original) }]}
      />
    ),
  });
  return cols;
}

export function InventoryHub({ section }: { section: InventorySection }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userBranchId = user?.branchId;
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const branchScopeId = activeBranchId ?? userBranchId;
  const { profile, workspace } = useShopWorkspace();
  const showBatch = hasBatchTracking(profile);
  const showExpiry = hasExpiryTracking(profile);
  const variantCols = variantTableColumns(profile);
  const meta = SECTION_META[section];

  const [stock, setStock] = useState<(InventoryItem & { latestBatch?: string | null; latestExpiry?: string | null })[]>([]);
  const [logs, setLogs] = useState<LedgerLog[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [abc, setAbc] = useState<AbcRow[]>([]);
  const [deadStock, setDeadStock] = useState<{ name: string; sku: string; quantity: number; value: number }[]>([]);
  const [aging, setAging] = useState<{ buckets: Record<string, number>; details: { name: string; ageDays: number; qty: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [poOpen, setPoOpen] = useState(false);
  const [prefillVariant, setPrefillVariant] = useState<string | undefined>();
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferActionId, setTransferActionId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (section === "stock" || section === "transfers") {
        const [stockRes, summaryRes] = await Promise.all([
          api.get<{ data: InventoryItem[] }>("/inventory?limit=500"),
          api.get<LedgerSummary>("/inventory/ledger/summary"),
        ]);
        setStock(stockRes.data?.data ?? (stockRes.data as unknown as InventoryItem[]) ?? []);
        setSummary(summaryRes.data ?? null);
      }
      if (section === "ledger") {
        const [logsRes, summaryRes] = await Promise.all([
          api.get<{ data: LedgerLog[] }>("/inventory/logs?limit=100"),
          api.get<LedgerSummary>("/inventory/ledger/summary"),
        ]);
        setLogs(logsRes.data?.data ?? (logsRes.data as unknown as LedgerLog[]) ?? []);
        setSummary(summaryRes.data ?? null);
      }
      if (section === "abc") {
        const abcRes = await api.get<AbcRow[]>("/inventory/analytics/abc");
        setAbc(Array.isArray(abcRes.data) ? abcRes.data : []);
      }
      if (section === "dead") {
        const deadRes = await api.get<{ name: string; sku: string; quantity: number; value: number }[]>("/inventory/analytics/dead-stock");
        setDeadStock(Array.isArray(deadRes.data) ? deadRes.data : []);
      }
      if (section === "aging") {
        const agingRes = await api.get<{ buckets: Record<string, number>; details: { name: string; ageDays: number; qty: number }[] }>("/inventory/analytics/aging");
        setAging(agingRes.data ?? null);
      }
      if (section === "transfers") {
        const transfersRes = await api.get<StockTransferRow[]>("/inventory/transfers");
        setTransfers(Array.isArray(transfersRes.data) ? transfersRes.data : []);
      }
    } catch {
      toast.error("Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, [section]);

  const updateTransferStatus = async (id: string, status: StockTransferRow["status"]) => {
    setTransferActionId(id);
    try {
      await api.put(`/inventory/transfers/${id}/status`, { status });
      toast.success(status === "IN_TRANSIT" ? "Transfer dispatched" : status === "RECEIVED" ? "Transfer received" : "Transfer cancelled");
      fetchData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update transfer");
    } finally {
      setTransferActionId(null);
    }
  };

  const actOnTransferWorkflow = async (taskId: string, action: "approve" | "reject") => {
    setTransferActionId(taskId);
    try {
      await api.put(`/workflows/tasks/${taskId}/${action}`, {});
      toast.success(action === "approve" ? "Transfer approved" : "Transfer rejected");
      fetchData();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? `Failed to ${action} transfer`);
    } finally {
      setTransferActionId(null);
    }
  };

  useEffect(() => { fetchData(); }, [fetchData]);

  const columns = buildStockColumns(
    (item) => { setAdjustItem(item); setAdjustOpen(true); },
    (item) => { setPrefillVariant(item.variantId); setPoOpen(true); },
    { showBatch, showExpiry, variantCols },
  );

  const transferColumns = buildTransferColumns({
    userId: user?.id,
    userRole: user?.role,
    branchScopeId,
    transferActionId,
    onDispatch: (id) => updateTransferStatus(id, "IN_TRANSIT"),
    onReceive: (id) => updateTransferStatus(id, "RECEIVED"),
    onCancel: (id) => updateTransferStatus(id, "CANCELLED"),
    onApprove: (taskId) => actOnTransferWorkflow(taskId, "approve"),
    onReject: (taskId) => actOnTransferWorkflow(taskId, "reject"),
  });

  const lowCount = stock.filter((i) => {
    const threshold = (i.reorderPoint != null && i.reorderPoint > 0) ? i.reorderPoint : 5;
    return i.quantity > 0 && i.quantity <= threshold;
  }).length;
  const outCount = stock.filter((i) => i.quantity === 0).length;
  const transferPending = transfers.filter((t) => t.status === "PENDING").length;
  const transferInTransit = transfers.filter((t) => t.status === "IN_TRANSIT").length;
  const transferReceived = transfers.filter((t) => t.status === "RECEIVED").length;
  const transferCancelled = transfers.filter((t) => t.status === "CANCELLED").length;

  const abcA = abc.filter((r) => r.grade === "A").length;
  const abcB = abc.filter((r) => r.grade === "B").length;
  const abcC = abc.filter((r) => r.grade === "C").length;
  const abcRevenue = abc.reduce((s, r) => s + (r.revenue || 0), 0);

  const agingRows = (aging?.details ?? []).map((d) => ({
    ...d,
    bucket: ageBucket(d.ageDays),
  }));
  const agingBucketStats = [
    { label: "0–30 days", key: "0-30", value: aging?.buckets?.["0-30"] ?? aging?.buckets?.["0–30"] ?? agingRows.filter((r) => r.bucket === "0-30").reduce((s, r) => s + r.qty, 0), icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "31–60 days", key: "31-60", value: aging?.buckets?.["31-60"] ?? aging?.buckets?.["31–60"] ?? agingRows.filter((r) => r.bucket === "31-60").reduce((s, r) => s + r.qty, 0), icon: Clock, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "61–90 days", key: "61-90", value: aging?.buckets?.["61-90"] ?? aging?.buckets?.["61–90"] ?? agingRows.filter((r) => r.bucket === "61-90").reduce((s, r) => s + r.qty, 0), icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "90+ days", key: "90+", value: aging?.buckets?.["90+"] ?? aging?.buckets?.["90+"] ?? agingRows.filter((r) => r.bucket === "90+").reduce((s, r) => s + r.qty, 0), icon: TrendingDown, color: "text-red-500", bg: "bg-red-500/10" },
  ];

  const sectionSubtitle =
    section === "transfers"
      ? "Move stock between branches — approval required before dispatch"
      : section === "abc"
        ? "Classify SKUs by revenue — A: top 80%, B: next 15%, C: remaining 5%"
        : section === "aging"
          ? "How long inventory has been sitting without movement"
          : `${profile.label} · ${workspace.productLabel} · ${meta.description}`;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{sectionSubtitle}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchData} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {section === "stock" && (
            <>
              <Button variant="outline" size="sm" onClick={() => router.push("/purchases")} className="gap-1.5">
                <ShoppingBag className="h-3.5 w-3.5" /> Purchase Orders
              </Button>
              <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="gap-1.5">
                <ArrowLeftRight className="h-3.5 w-3.5" /> Stock Transfer
              </Button>
              {(showBatch || showExpiry) && (
                <Button variant="outline" size="sm" onClick={() => router.push("/inventory/expiry")} className="gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Expiry Dashboard
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => router.push("/warehouse")} className="gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Warehouses
              </Button>
            </>
          )}
          {section === "transfers" && (
            <Button size="sm" onClick={() => setTransferOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> New Transfer
            </Button>
          )}
        </div>
      </div>

      {(section === "stock" || section === "ledger") && (
        <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
          {[
            { label: "On Hand", value: summary?.onHand ?? 0, icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Available", value: summary?.available ?? 0, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: "Reserved", value: summary?.reserved ?? 0, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "Damaged", value: summary?.damaged ?? 0, icon: XCircle, color: "text-red-500", bg: "bg-red-500/10" },
            { label: "Returned", value: summary?.returned ?? 0, icon: TrendingDown, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: "Stock Value", value: `LKR ${formatNumber(summary?.value ?? 0)}`, icon: BarChart3, color: "text-indigo-500", bg: "bg-indigo-500/10" },
          ].map((s) => (
            <Card key={s.label}>
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-4 w-4 ${s.color}`} /></div>
                <div>
                  <p className="text-lg font-bold leading-tight">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {section === "stock" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { label: "Total SKUs", value: stock.length, icon: Package, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Low Stock", value: lowCount, icon: TrendingDown, color: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "Out of Stock", value: outCount, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
              { label: "SKUs Tracked", value: summary?.skuCount ?? stock.length, icon: BarChart3, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-3 flex items-center gap-2">
                  <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-4 w-4 ${s.color}`} /></div>
                  <div><p className="text-lg font-bold">{s.value}</p><p className="text-[10px] text-muted-foreground">{s.label}</p></div>
                </CardContent>
              </Card>
            ))}
          </div>
          <ClientSideTable data={stock} columns={columns} pageCount={Math.ceil(stock.length / 10)} searchableColumns={[]} filterableColumns={[]} isShowExportButtons={{ isShow: true, fileName: "inventory" }} />
        </>
      )}

      {section === "ledger" && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    {["Date", "Product", "Type", "Change", "Before", "After", "Reserved", "Damaged", "Notes"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">No ledger entries yet</td></tr>
                  ) : logs.map((log) => (
                    <tr key={log.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 text-xs whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-xs">{log.variant.product.name}</p>
                        <p className="text-[10px] text-muted-foreground">{log.variant.sku}</p>
                      </td>
                      <td className="px-3 py-2"><Badge variant="secondary" className="text-[9px]">{log.movementType}</Badge></td>
                      <td className={`px-3 py-2 font-bold ${log.quantityChange >= 0 ? "text-emerald-600" : "text-red-500"}`}>{log.quantityChange >= 0 ? "+" : ""}{log.quantityChange}</td>
                      <td className="px-3 py-2">{log.quantityBefore}</td>
                      <td className="px-3 py-2 font-semibold">{log.quantityAfter}</td>
                      <td className="px-3 py-2 text-xs">{log.reservedBefore} → {log.reservedAfter}</td>
                      <td className="px-3 py-2 text-xs">{log.damagedBefore} → {log.damagedAfter}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[120px] truncate">{log.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {section === "abc" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Grade A", value: abcA, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { label: "Grade B", value: abcB, icon: BarChart3, color: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "Grade C", value: abcC, icon: Package, color: "text-slate-500", bg: "bg-slate-500/10" },
              { label: "Total Revenue", value: `LKR ${formatNumber(abcRevenue)}`, icon: TrendingDown, color: "text-blue-500", bg: "bg-blue-500/10" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
                  <div>
                    <p className="text-xl font-bold truncate">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <ClientSideTable
            data={abc}
            columns={ABC_COLUMNS}
            pageCount={Math.max(1, Math.ceil(abc.length / 10))}
            searchableColumns={[
              { id: "sku", title: "SKU" },
              { id: "name", title: "Product" },
            ]}
            filterableColumns={[
              {
                id: "grade",
                title: "Grade",
                options: [
                  { label: "A", value: "A" },
                  { label: "B", value: "B" },
                  { label: "C", value: "C" },
                ],
              },
            ]}
            isShowExportButtons={{ isShow: true, fileName: "abc-analysis-export" }}
          />
        </>
      )}

      {section === "dead" && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3"><Skull className="h-4 w-4 text-muted-foreground" /><p className="text-sm text-muted-foreground">Items with stock but no sales in the last 90 days</p></div>
            {deadStock.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">No dead stock detected</p>
            ) : (
              <div className="space-y-2">
                {deadStock.slice(0, 30).map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg border">
                    <div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.sku} · Qty {item.quantity}</p></div>
                    <span className="text-sm font-bold text-red-500">LKR {formatNumber(item.value)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {section === "aging" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {agingBucketStats.map((s) => (
              <Card key={s.key}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
                  <div>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <ClientSideTable
            data={agingRows}
            columns={AGING_COLUMNS}
            pageCount={Math.max(1, Math.ceil(agingRows.length / 10))}
            searchableColumns={[{ id: "name", title: "Product" }]}
            filterableColumns={[
              {
                id: "bucket",
                title: "Bucket",
                options: [
                  { label: "0–30 days", value: "0-30" },
                  { label: "31–60 days", value: "31-60" },
                  { label: "61–90 days", value: "61-90" },
                  { label: "90+ days", value: "90+" },
                ],
              },
            ]}
            isShowExportButtons={{ isShow: true, fileName: "stock-aging-export" }}
          />
        </>
      )}

      {section === "transfers" && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { label: "Pending", value: transferPending, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "In Transit", value: transferInTransit, icon: Truck, color: "text-blue-500", bg: "bg-blue-500/10" },
              { label: "Received", value: transferReceived, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { label: "Cancelled", value: transferCancelled, icon: Ban, color: "text-red-500", bg: "bg-red-500/10" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
                  <div>
                    <p className="text-xl font-bold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <ClientSideTable
            data={transfers}
            columns={transferColumns}
            pageCount={Math.max(1, Math.ceil(transfers.length / 10))}
            searchableColumns={[
              { id: "from", title: "From branch" },
              { id: "to", title: "To branch" },
            ]}
            filterableColumns={[
              {
                id: "status",
                title: "Status",
                options: [
                  { label: "Pending", value: "PENDING" },
                  { label: "In Transit", value: "IN_TRANSIT" },
                  { label: "Received", value: "RECEIVED" },
                  { label: "Cancelled", value: "CANCELLED" },
                ],
              },
            ]}
            isShowExportButtons={{ isShow: true, fileName: "stock-transfers-export" }}
          />
        </>
      )}

      <StockAdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} onAdjusted={fetchData} item={adjustItem} />
      <StockTransferModal open={transferOpen} onClose={() => setTransferOpen(false)} onCreated={fetchData} stock={stock} currentBranchId={branchScopeId} />
      <CreatePOModal open={poOpen} onClose={() => { setPoOpen(false); setPrefillVariant(undefined); }} onCreated={() => { setPoOpen(false); fetchData(); }} prefillVariantId={prefillVariant} />
    </div>
  );
}
