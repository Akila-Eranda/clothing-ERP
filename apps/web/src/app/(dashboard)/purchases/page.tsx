"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Plus, FileText, Clock, CheckCircle2, XCircle, RefreshCw, PackageCheck, Truck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CreatePOModal } from "@/components/purchases/create-po-modal";
import { ReceiveItemsModal, type PurchaseOrder } from "@/components/purchases/receive-items-modal";

// ── Status config ─────────────────────────────────────────────────────────
type Variant = "success" | "secondary" | "danger" | "warning" | "info";
const STATUS_CONFIG: Record<string, { label: string; variant: Variant; icon: React.ElementType }> = {
  DRAFT:              { label: "Draft",              variant: "secondary", icon: FileText },
  ORDERED:            { label: "Ordered",            variant: "info",      icon: Clock },
  SENT:               { label: "Sent",               variant: "info",      icon: Truck },
  IN_TRANSIT:         { label: "In Transit",         variant: "warning",   icon: Truck },
  PARTIALLY_RECEIVED: { label: "Partial",            variant: "warning",   icon: AlertCircle },
  RECEIVED:           { label: "Received",           variant: "success",   icon: CheckCircle2 },
  CANCELLED:          { label: "Cancelled",          variant: "danger",    icon: XCircle },
};

const RECEIVABLE = ["ORDERED", "SENT", "IN_TRANSIT", "PARTIALLY_RECEIVED"];

// ── Column builder ────────────────────────────────────────────────────────
function buildColumns(
  onReceive: (po: PurchaseOrder) => void,
  onUpdateStatus: (po: PurchaseOrder, status: string) => void,
): ColumnDef<PurchaseOrder>[] {
  return [
    {
      accessorKey: "poNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="PO Number" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs text-blue-500 font-semibold">{row.original.poNumber}</span>
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
      cell: ({ row }) => <span className="text-sm font-semibold">₹{row.original.total.toFixed(2)}</span>,
    },
    {
      accessorKey: "orderDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Order Date" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.orderDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      accessorKey: "expectedDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expected" />,
      cell: ({ row }) => row.original.expectedDate ? (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.expectedDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
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
              ...(po.status === "DRAFT" ? [{ text: "Mark as Ordered", function: () => onUpdateStatus(po, "ORDERED") }] : []),
              ...(po.status === "ORDERED" ? [{ text: "Mark In Transit", function: () => onUpdateStatus(po, "IN_TRANSIT") }] : []),
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
  const [pos, setPos]               = useState<PurchaseOrder[]>([]);
  const [loading, setLoading]       = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [receivePO, setReceivePO]   = useState<PurchaseOrder | null>(null);

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: PurchaseOrder[] }>("/purchases?limit=200");
      setPos(res.data?.data ?? (res.data as unknown as PurchaseOrder[]) ?? []);
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
  const pending  = pos.filter((p) => ["DRAFT","ORDERED","SENT"].includes(p.status)).length;
  const transit  = pos.filter((p) => ["IN_TRANSIT","PARTIALLY_RECEIVED"].includes(p.status)).length;
  const received = pos.filter((p) => p.status === "RECEIVED").length;
  const totalValue = pos.reduce((s, p) => s + p.total, 0);

  const STATS = [
    { label: "Total POs",   value: total,                                   icon: ShoppingBag,   color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Pending",     value: pending,                                 icon: Clock,         color: "text-amber-500",   bg: "bg-amber-500/10" },
    { label: "In Transit",  value: transit,                                 icon: Truck,         color: "text-violet-500",  bg: "bg-violet-500/10" },
    { label: "Received",    value: received,                                icon: CheckCircle2,  color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const columns = buildColumns(loadReceive, handleUpdateStatus);

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Purchase Orders</h1>
          <p className="text-sm text-muted-foreground">Manage supplier POs and restock inventory</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={fetchPOs} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
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
          <p className="text-2xl font-black mt-0.5">₹{totalValue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">PO Workflow</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs font-medium text-muted-foreground">
            {["Draft","→ Ordered","→ In Transit","→ Received"].map((s) => (
              <span key={s} className="bg-muted/50 px-2 py-0.5 rounded-full">{s}</span>
            ))}
          </div>
        </div>
      </div>

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

      {/* Modals */}
      <CreatePOModal open={createOpen} onClose={() => setCreateOpen(false)} onCreated={() => { fetchPOs(); setCreateOpen(false); }} />
      <ReceiveItemsModal po={receivePO} onClose={() => setReceivePO(null)} onReceived={fetchPOs} />
    </div>
  );
}
