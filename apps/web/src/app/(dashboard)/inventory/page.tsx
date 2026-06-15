"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle, Package, TrendingDown, BarChart3, RefreshCw, ShoppingBag,
  Layers, Clock, Skull, CheckCircle2, XCircle, Loader2, ArrowLeftRight, Truck, Ban,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const TRANSFER_STATUS: Record<StockTransferRow["status"], { label: string; variant: "warning" | "success" | "secondary" | "danger" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  IN_TRANSIT: { label: "In Transit", variant: "secondary" },
  RECEIVED: { label: "Received", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "danger" },
};

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
          {(row.original.variant as InventoryItem['variant'] & { size?: string; color?: string; material?: string; style?: string })[col.field] ?? "—"}
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

export default function InventoryPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const userBranchId = user?.branchId;
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const branchScopeId = activeBranchId ?? userBranchId;
  const { profile, workspace } = useShopWorkspace();
  const showBatch = hasBatchTracking(profile);
  const showExpiry = hasExpiryTracking(profile);
  const variantCols = variantTableColumns(profile);
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
  const [cycleLoading, setCycleLoading] = useState(false);
  const [transfers, setTransfers] = useState<StockTransferRow[]>([]);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferActionId, setTransferActionId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [
        stockRes,
        logsRes,
        summaryRes,
        abcRes,
        deadRes,
        agingRes,
        transfersRes,
      ] = await Promise.all([
        api.get<{ data: InventoryItem[] }>("/inventory?limit=500"),
        api.get<{ data: LedgerLog[] }>("/inventory/logs?limit=100"),
        api.get<LedgerSummary>("/inventory/ledger/summary"),
        api.get<AbcRow[]>("/inventory/analytics/abc"),
        api.get<{ name: string; sku: string; quantity: number; value: number }[]>("/inventory/analytics/dead-stock"),
        api.get<{ buckets: Record<string, number>; details: { name: string; ageDays: number; qty: number }[] }>("/inventory/analytics/aging"),
        api.get<StockTransferRow[]>("/inventory/transfers"),
      ]);
      setStock(stockRes.data?.data ?? (stockRes.data as unknown as InventoryItem[]) ?? []);
      setLogs(logsRes.data?.data ?? (logsRes.data as unknown as LedgerLog[]) ?? []);
      setSummary(summaryRes.data ?? null);
      setAbc(Array.isArray(abcRes.data) ? abcRes.data : []);
      setDeadStock(Array.isArray(deadRes.data) ? deadRes.data : []);
      setAging(agingRes.data ?? null);
      setTransfers(Array.isArray(transfersRes.data) ? transfersRes.data : []);
    } catch {
      toast.error("Failed to load inventory data");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTransferStatus = async (id: string, status: StockTransferRow["status"]) => {
    setTransferActionId(id);
    try {
      await api.put(`/inventory/transfers/${id}/status`, { status });
      toast.success(status === "IN_TRANSIT" ? "Transfer dispatched" : status === "RECEIVED" ? "Transfer received" : "Transfer cancelled");
      fetchAll();
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
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? `Failed to ${action} transfer`);
    } finally {
      setTransferActionId(null);
    }
  };

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const startCycleCount = async () => {
    setCycleLoading(true);
    try {
      await api.post("/inventory/cycle-count", { notes: "Manual cycle count" });
      toast.success("Cycle count session started");
      fetchAll();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to start cycle count");
    } finally {
      setCycleLoading(false);
    }
  };

  const columns = buildStockColumns(
    (item) => { setAdjustItem(item); setAdjustOpen(true); },
    (item) => { setPrefillVariant(item.variantId); setPoOpen(true); },
    { showBatch, showExpiry, variantCols },
  );

  const lowCount = stock.filter((i) => i.quantity > 0 && i.quantity <= 5).length;
  const outCount = stock.filter((i) => i.quantity === 0).length;

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Inventory — {workspace.productLabel}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · {showBatch || showExpiry ? "Batch & expiry tracking enabled" : "Stock ledger, ABC analysis, cycle count"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchAll} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/purchases")} className="gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" /> Purchase Orders
          </Button>
          <Button variant="outline" size="sm" onClick={() => setTransferOpen(true)} className="gap-1.5">
            <ArrowLeftRight className="h-3.5 w-3.5" /> Stock Transfer
          </Button>
          <Button size="sm" onClick={startCycleCount} disabled={cycleLoading} className="gap-1.5">
            {cycleLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Layers className="h-3.5 w-3.5" />}
            Start Cycle Count
          </Button>
        </div>
      </div>

      {/* Ledger summary KPIs */}
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

      <Tabs defaultValue="stock">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="ledger">Inventory Ledger</TabsTrigger>
          <TabsTrigger value="abc">ABC Analysis</TabsTrigger>
          <TabsTrigger value="dead">Dead Stock</TabsTrigger>
          <TabsTrigger value="aging">Stock Aging</TabsTrigger>
          <TabsTrigger value="transfers">Stock Transfers</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
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
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
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
        </TabsContent>

        <TabsContent value="abc" className="mt-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground mb-3">ABC classification by revenue contribution — A: top 80%, B: next 15%, C: remaining 5%</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b">{["Grade", "SKU", "Product", "Qty", "Revenue", "Cumulative %"].map((h) => <th key={h} className="text-left py-2 px-2 text-xs text-muted-foreground">{h}</th>)}</tr></thead>
                  <tbody className="divide-y">
                    {abc.slice(0, 50).map((row, i) => (
                      <tr key={i}>
                        <td className="py-2 px-2"><Badge className={row.grade === "A" ? "bg-emerald-500" : row.grade === "B" ? "bg-amber-500" : "bg-muted-foreground"}>{row.grade}</Badge></td>
                        <td className="py-2 px-2 font-mono text-xs">{row.sku}</td>
                        <td className="py-2 px-2 text-xs">{row.name}</td>
                        <td className="py-2 px-2">{row.quantity}</td>
                        <td className="py-2 px-2 font-semibold">LKR {formatNumber(row.revenue)}</td>
                        <td className="py-2 px-2">{row.cumulativePct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dead" className="mt-4">
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
        </TabsContent>

        <TabsContent value="aging" className="mt-4">
          <Card>
            <CardContent className="p-4">
              {aging ? (
                <>
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {Object.entries(aging.buckets).map(([bucket, qty]) => (
                      <div key={bucket} className="rounded-xl border p-3 text-center">
                        <p className="text-2xl font-bold">{qty}</p>
                        <p className="text-xs text-muted-foreground">{bucket} days</p>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-1.5">
                    {aging.details.slice(0, 20).map((d, i) => (
                      <div key={i} className="flex justify-between text-sm py-1.5 border-b last:border-0">
                        <span className="truncate">{d.name}</span>
                        <span className="text-muted-foreground shrink-0 ml-2">{d.ageDays}d · qty {d.qty}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-center py-8 text-muted-foreground">No aging data</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transfers" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-sm text-muted-foreground">
              Move stock between branches — manager/admin approval required before dispatch.
            </p>
            <Button size="sm" onClick={() => setTransferOpen(true)} className="gap-1.5">
              <ArrowLeftRight className="h-3.5 w-3.5" /> New Transfer
            </Button>
          </div>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b">
                    <tr>
                      {["Date", "From", "To", "Items", "Status", "Approval", "Actions"].map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {transfers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                          No stock transfers yet. Create one to move inventory between branches.
                        </td>
                      </tr>
                    ) : transfers.map((t) => {
                      const st = TRANSFER_STATUS[t.status];
                      const itemSummary = t.items
                        .map((i) => `${i.variant?.product?.name ?? "Item"} ×${i.requestedQty}`)
                        .slice(0, 2)
                        .join(", ");
                      const approved = isTransferWorkflowApproved(t.workflow);
                      const canDispatch = t.status === "PENDING" && approved && (!branchScopeId || t.fromBranchId === branchScopeId);
                      const canReceive = t.status === "IN_TRANSIT" && (!branchScopeId || t.toBranchId === branchScopeId);
                      const canCancel = t.status === "PENDING" && (!branchScopeId || t.fromBranchId === branchScopeId);
                      const acting = transferActionId === t.id;
                      const wfActing = !!(transferActionId && t.workflow?.tasks?.some((task) => task.id === transferActionId));
                      const showPendingApproval = t.status === "PENDING" && t.workflow?.status === "IN_PROGRESS";
                      return (
                        <tr key={t.id} className="hover:bg-muted/20">
                          <td className="px-3 py-2.5 text-xs whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-xs font-medium">{t.fromBranch?.name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-xs font-medium">{t.toBranch?.name ?? "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px]">
                            {itemSummary}{t.items.length > 2 ? ` +${t.items.length - 2} more` : ""}
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge variant={st.variant} className="text-[9px]">{st.label}</Badge>
                            {showPendingApproval && (
                              <p className="text-[9px] text-amber-600 mt-1">Awaiting approval</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 align-top">
                            {t.status === "PENDING" && t.workflow ? (
                              <TransferApprovalActions
                                instance={t.workflow}
                                userId={user?.id}
                                userRole={user?.role}
                                requestedBy={t.requestedBy}
                                acting={wfActing}
                                onApprove={(taskId) => actOnTransferWorkflow(taskId, "approve")}
                                onReject={(taskId) => actOnTransferWorkflow(taskId, "reject")}
                              />
                            ) : t.workflow?.status === "APPROVED" ? (
                              <span className="text-[10px] text-emerald-600 font-medium">Approved</span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex gap-1.5 flex-wrap">
                              {canDispatch && (
                                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" disabled={acting}
                                  onClick={() => updateTransferStatus(t.id, "IN_TRANSIT")}>
                                  {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                                  Dispatch
                                </Button>
                              )}
                              {canReceive && (
                                <Button size="sm" className="h-7 text-[10px] gap-1" disabled={acting}
                                  onClick={() => updateTransferStatus(t.id, "RECEIVED")}>
                                  {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                                  Receive
                                </Button>
                              )}
                              {canCancel && (
                                <Button size="sm" variant="ghost" className="h-7 text-[10px] gap-1 text-red-500" disabled={acting}
                                  onClick={() => updateTransferStatus(t.id, "CANCELLED")}>
                                  <Ban className="h-3 w-3" /> Cancel
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <StockAdjustModal open={adjustOpen} onClose={() => setAdjustOpen(false)} onAdjusted={fetchAll} item={adjustItem} />
      <StockTransferModal open={transferOpen} onClose={() => setTransferOpen(false)} onCreated={fetchAll} stock={stock} currentBranchId={branchScopeId} />
      <CreatePOModal open={poOpen} onClose={() => { setPoOpen(false); setPrefillVariant(undefined); }} onCreated={() => { setPoOpen(false); fetchAll(); }} prefillVariantId={prefillVariant} />
    </div>
  );
}
