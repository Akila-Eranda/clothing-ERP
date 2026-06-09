"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Plus, FileText, Clock, CheckCircle2, XCircle, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ReceiveItemsModal, type PurchaseOrder } from "@/components/purchases/receive-items-modal";
import { useRouter } from "next/navigation";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";

// ── Status config ─────────────────────────────────────────────────────────
type Variant = "success" | "secondary" | "danger" | "warning" | "info";
const STATUS_CONFIG: Record<string, { label: string; variant: Variant; icon: React.ElementType }> = {
  DRAFT:              { label: "Draft",    variant: "secondary", icon: FileText },
  PENDING_APPROVAL:   { label: "Pending Approval", variant: "warning", icon: Clock },
  CONFIRMED:          { label: "Ordered",  variant: "info",      icon: Clock },
  SENT:               { label: "Ordered",  variant: "info",      icon: Clock },
  PARTIALLY_RECEIVED: { label: "Ordered",  variant: "info",      icon: Clock },
  RECEIVED:           { label: "Received", variant: "success",   icon: CheckCircle2 },
  CANCELLED:          { label: "Cancelled",variant: "danger",    icon: XCircle },
};

const RECEIVABLE = ["CONFIRMED", "SENT", "PARTIALLY_RECEIVED"];
const ORDERABLE  = ["DRAFT"];

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  onView: (po: PurchaseOrder) => void,
  onReceive: (po: PurchaseOrder) => void,
  onUpdateStatus: (po: PurchaseOrder, status: string) => void,
): ColumnDef<PurchaseOrder>[] {
  return [
    {
      accessorKey: "poNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="PO Number" />,
      cell: ({ row }) => (
        <button onClick={() => onView(row.original)} className="font-mono text-xs text-blue-500 font-semibold hover:underline">{row.original.poNumber}</button>
      ),
    },
    {
      id: "supplier",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.supplier.name}</p>
          <p className="text-xs text-muted-foreground">{row.original.supplier.phone}</p>
        </div>
      ),
    },
    {
      id: "items",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => <span className="text-sm">{row.original._count?.items ?? row.original.items?.length ?? 0} items</span>,
    },
    {
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => <span className="text-sm font-semibold">LKR {row.original.total.toFixed(2)}</span>,
    },
    {
      accessorKey: "orderDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Order Date" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.orderDate).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      accessorKey: "expectedDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expected" />,
      cell: ({ row }) => row.original.expectedDate ? (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.expectedDate).toLocaleDateString("en-LK", { day: "2-digit", month: "short" })}
        </span>
      ) : <span className="text-xs text-muted-foreground">—</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const conf = STATUS_CONFIG[row.original.status] ?? STATUS_CONFIG.DRAFT;
        const Icon = conf.icon;
        return (
          <Badge variant={conf.variant} className="text-[10px] gap-1">
            <Icon className="h-2.5 w-2.5" />{conf.label}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const po = row.original;
        const canReceive = RECEIVABLE.includes(po.status);
        return (
          <TableActionsRow
            showAction={canReceive ? { action: () => onReceive(po), tooltip: "Receive Items" } : undefined}
            dropMoreActions={[
              ...(canReceive ? [{ text: "Receive Items", function: () => onReceive(po) }] : []),
              ...(ORDERABLE.includes(po.status) ? [{ text: "Mark as Ordered", function: () => onUpdateStatus(po, "CONFIRMED") }] : []),
              ...(po.status !== "CANCELLED" && po.status !== "RECEIVED" ? [{ text: "Cancel PO", function: () => onUpdateStatus(po, "CANCELLED") }] : []),
            ]}
          />
        );
      },
    },
  ];
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const router = useRouter();
  const { profile, workspace } = useShopWorkspace();
  const routeLabels = getRouteLabels(workspace, profile);
  const [pos, setPos]             = useState<PurchaseOrder[]>([]);
  const [loading, setLoading]     = useState(true);
  const [receivePO, setReceivePO] = useState<PurchaseOrder | null>(null);
  const [reorder, setReorder]     = useState<{ variantId: string; productName: string; sku: string; branchName: string; currentQty: number; reorderPoint: number; suggestedOrderQty: number }[]>([]);
  const [supplierPerf, setSupplierPerf] = useState<{ supplierName: string; orderCount: number; totalSpend: number; onTimeRate: number | null; avgLeadDays: number | null }[]>([]);
  const [priceHistory, setPriceHistory] = useState<{ productName: string; supplierName: string; unitCost: number; poNumber: string; orderDate: string }[]>([]);

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const [res, reorderRes, perfRes, histRes] = await Promise.all([
        api.get<{ data: PurchaseOrder[] }>("/purchases?limit=200"),
        api.get<typeof reorder>("/purchases/reorder-suggestions"),
        api.get<typeof supplierPerf>("/reports/supplier-performance"),
        api.get<typeof priceHistory>("/reports/supplier-price-history?limit=8"),
      ]);
      setPos(res.data?.data ?? (res.data as unknown as PurchaseOrder[]) ?? []);
      setReorder(Array.isArray(reorderRes.data) ? reorderRes.data : []);
      setSupplierPerf(Array.isArray(perfRes.data) ? perfRes.data.slice(0, 5) : []);
      setPriceHistory(Array.isArray(histRes.data) ? histRes.data : []);
    } catch { toast.error("Failed to load purchase orders"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPOs(); }, [fetchPOs]);

  const handleUpdateStatus = async (po: PurchaseOrder, status: string) => {
    try {
      await api.put(`/purchases/${po.id}/status`, { status });
      toast.success(`PO ${po.poNumber} → ${status.replace("_", " ")}`);
      fetchPOs();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Status update failed"); }
  };

  const loadReceive = async (po: PurchaseOrder) => {
    try {
      const res = await api.get<PurchaseOrder>(`/purchases/${po.id}`);
      setReceivePO(res.data);
    } catch { toast.error("Failed to load PO details"); }
  };

  // Stats
  const total    = pos.length;
  const pending  = pos.filter((p) => p.status === "DRAFT" || p.status === "PENDING_APPROVAL").length;
  const ordered  = pos.filter((p) => ["CONFIRMED","SENT","PARTIALLY_RECEIVED"].includes(p.status)).length;
  const received = pos.filter((p) => p.status === "RECEIVED").length;
  const totalValue = pos.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.total, 0);

  const STATS = [
    { label: "Total POs",   value: total,                                   icon: ShoppingBag,   color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Pending",     value: pending,                                 icon: FileText,      color: "text-amber-500",   bg: "bg-amber-500/10" },
    { label: "Ordered",     value: ordered,                                 icon: Truck,         color: "text-violet-500",  bg: "bg-violet-500/10" },
    { label: "Received",    value: received,                                icon: CheckCircle2,  color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const columns = buildColumns((po) => router.push(`/purchases/${po.id}`), loadReceive, handleUpdateStatus);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{routeLabels["/purchases"]}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.emoji} {profile.label} — supplier orders, GRN & {routeLabels.printTags?.toLowerCase() ?? "labels"}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchPOs} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => router.push("/purchases/new")}>
            <Plus className="h-3.5 w-3.5" /> New PO
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Total value banner */}
      <div className="rounded-xl border bg-card p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">Total Purchase Value</p>
          <p className="text-2xl font-black mt-0.5">LKR {totalValue.toLocaleString("en-LK", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">PO Workflow</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs font-medium text-muted-foreground">
            {["Draft / Pending", "→ Approval", "→ Ordered", "→ GRN"].map((s) => (
              <span key={s} className="bg-muted/50 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        </div>
      </div>

      {(reorder.length > 0 || supplierPerf.length > 0 || priceHistory.length > 0) && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-2">Auto Reorder Suggestions</p>
              {reorder.length === 0 ? <p className="text-xs text-muted-foreground">All stock levels OK</p> : (
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {reorder.slice(0, 6).map((r) => (
                    <div key={`${r.variantId}-${r.branchName}`} className="flex justify-between text-xs border-b pb-1">
                      <span className="truncate flex-1">{r.productName}</span>
                      <span className="text-amber-600 font-semibold shrink-0 ml-2">Order {r.suggestedOrderQty}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-2">Supplier Performance</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {supplierPerf.map((s) => (
                  <div key={s.supplierName} className="flex justify-between text-xs border-b pb-1">
                    <span className="truncate flex-1">{s.supplierName}</span>
                    <span className="text-muted-foreground shrink-0 ml-2">{s.onTimeRate ?? 0}% on-time</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm font-semibold mb-2">Supplier Price History</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {priceHistory.map((h, i) => (
                  <div key={`${h.poNumber}-${i}`} className="flex justify-between text-xs border-b pb-1">
                    <span className="truncate flex-1">{h.productName}</span>
                    <span className="font-mono shrink-0 ml-2">LKR {h.unitCost.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <ClientSideTable
        data={pos}
        columns={columns}
        pageCount={Math.ceil(pos.length / 10)}
        searchableColumns={[{ id: "poNumber", title: "PO Number" }]}
        filterableColumns={[
          {
            id: "status",
            title: "Status",
            options: Object.entries(STATUS_CONFIG).map(([v, c]) => ({ value: v, label: c.label })),
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "purchase-orders-export" }}
      />

      <ReceiveItemsModal po={receivePO} onClose={() => setReceivePO(null)} onReceived={fetchPOs} />
    </div>
  );
}
