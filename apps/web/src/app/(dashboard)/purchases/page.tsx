"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Plus, FileText, Clock, CheckCircle2, XCircle, RefreshCw, Truck, PackageCheck } from "lucide-react";
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
import Link from "next/link";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";
import { OpenRecordButton } from "@/components/table/open-record-button";

// ── Status config ─────────────────────────────────────────────────────────
type Variant = "success" | "secondary" | "danger" | "warning" | "info";
const STATUS_CONFIG: Record<string, { label: string; variant: Variant; icon: React.ElementType }> = {
  DRAFT:              { label: "Draft",    variant: "secondary", icon: FileText },
  PENDING_APPROVAL:   { label: "Pending Approval", variant: "warning", icon: Clock },
  CONFIRMED:          { label: "Ordered",  variant: "info",      icon: Clock },
  SENT:               { label: "Ordered",  variant: "info",      icon: Clock },
  PARTIALLY_RECEIVED: { label: "Partial",  variant: "warning",   icon: Clock },
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
        <OpenRecordButton onClick={() => onView(row.original)} className="font-mono text-xs">
          {row.original.poNumber}
        </OpenRecordButton>
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
          <Badge variant={conf.variant} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center gap-1">
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
            showAction={{ action: () => onView(po), tooltip: "View PO" }}
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
  const pending  = pos.filter((p) => p.status === "DRAFT" || p.status === "PENDING_APPROVAL").length;
  const ordered  = pos.filter((p) => ["CONFIRMED","SENT","PARTIALLY_RECEIVED"].includes(p.status)).length;
  const received = pos.filter((p) => p.status === "RECEIVED").length;

  const STATS = [
    { label: "Total POs",   value: total,                                   icon: ShoppingBag,   color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Pending",     value: pending,                                 icon: FileText,      color: "text-amber-500",   bg: "bg-amber-500/10" },
    { label: "Ordered",     value: ordered,                                 icon: Truck,         color: "text-violet-500",  bg: "bg-violet-500/10" },
    { label: "Received",    value: received,                                icon: CheckCircle2,  color: "text-emerald-500", bg: "bg-emerald-500/10" },
  ];

  const columns = buildColumns((po) => router.push(`/purchases/${po.id}`), loadReceive, handleUpdateStatus);

  return (
    <div className="page-shell">
      {/* Header — compact single row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">{routeLabels["/purchases"]}</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {profile.emoji} {profile.label} — recommended: Create PO → Confirm → Receive (GRN)
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={fetchPOs} className="h-10 rounded-[12px] gap-1.5 text-sm">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" asChild className="h-10 rounded-[12px] gap-1.5 text-sm">
            <Link href="/purchases/grn">
              <PackageCheck className="h-[18px] w-[18px]" /> GRN History
            </Link>
          </Button>
          <Button className="h-10 rounded-[12px] gap-1.5 text-sm" onClick={() => router.push("/purchases/new")}>
            <Plus className="h-[18px] w-[18px]" /> New Purchase Order
          </Button>
        </div>
      </div>

      {/* Stats — compact 68px cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {STATS.map((s) => (
          <Card
            key={s.label}
            className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150"
          >
            <CardContent className="h-[68px] p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-[22px] font-bold leading-none tabular-nums">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table — fills remaining viewport */}
      <div className="overflow-y-auto" style={{ height: "calc(100vh - 240px)" }}>
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
      </div>

      <ReceiveItemsModal po={receivePO} onClose={() => setReceivePO(null)} onReceived={fetchPOs} />
    </div>
  );
}
