"use client";

import { useState, useEffect, useCallback } from "react";
import { ShoppingBag, Plus, FileText, CheckCircle2, RefreshCw, Truck, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageKpiGrid } from "@/components/ui/page-kpi";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ReceiveItemsModal, type PurchaseOrder } from "@/components/purchases/receive-items-modal";
import { ViewPOModal, type FullPurchaseOrder } from "@/components/purchases/view-po-modal";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";
import { parseApiList } from "@/lib/parse-api-list";
import { POStatusBadge, PO_STATUS } from "@/components/purchases/purchase-table-badges";
// ── Status config (filters) ───────────────────────────────────────────────

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
      cell: ({ row }) => <POStatusBadge status={row.original.status} />,
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
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);

  const fetchPOs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: PurchaseOrder[] }>("/purchases?limit=200");
      setPos(parseApiList<PurchaseOrder>(res.data));
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

  const loadReceive = async (po: PurchaseOrder | FullPurchaseOrder) => {
    try {
      const res = await api.get<PurchaseOrder>(`/purchases/${po.id}`);
      setReceivePO(res.data);
    } catch { toast.error("Failed to load PO details"); }
  };

  const openViewPO = async (po: PurchaseOrder) => {
    try {
      const res = await api.get<PurchaseOrder>(`/purchases/${po.id}`);
      setViewPO(res.data ?? po);
    } catch {
      setViewPO(po);
    }
  };

  // Stats
  const total    = pos.length;
  const pending  = pos.filter((p) => p.status === "DRAFT" || p.status === "PENDING_APPROVAL").length;
  const ordered  = pos.filter((p) => ["CONFIRMED","SENT","PARTIALLY_RECEIVED"].includes(p.status)).length;
  const received = pos.filter((p) => p.status === "RECEIVED").length;

  const STATS = [
    { label: "Total POs",   value: total,                                   icon: ShoppingBag,   color: "text-blue-600",    bg: "bg-primary/10", tint: "bg-card border-border" },
    { label: "Pending",     value: pending,                                 icon: FileText,      color: "text-amber-600",   bg: "bg-amber-500/10", tint: "bg-card border-border" },
    { label: "Ordered",     value: ordered,                                 icon: Truck,         color: "text-violet-600",  bg: "bg-slate-500/10", tint: "bg-card border-border" },
    { label: "Received",    value: received,                                icon: CheckCircle2,  color: "text-emerald-600", bg: "bg-emerald-500/10", tint: "bg-card border-border" },
  ];

  const columns = buildColumns(openViewPO, loadReceive, handleUpdateStatus);

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
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={fetchPOs} className="gap-1.5">
              <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
            </Button>
            <Button variant="outline" asChild className="gap-1.5">
              <Link href="/purchases/grn">
                <PackageCheck className="h-[18px] w-[18px]" /> GRN History
              </Link>
            </Button>
          </div>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button className="gap-1.5" onClick={() => router.push("/purchases/new")}>
            <Plus className="h-[18px] w-[18px]" /> New Purchase Order
          </Button>
        </div>
      </div>

      {/* Stats — compact 68px cards */}
      <PageKpiGrid items={STATS} />

      {/* Table — fills remaining viewport */}
      <ClientSideTable
          data={pos}
          columns={columns}
          searchableColumns={[{ id: "poNumber", title: "PO Number" }]}
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: Object.entries(PO_STATUS).map(([v, c]) => ({ value: v, label: c.label })),
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: "purchase-orders-export" }}
        />

      <ReceiveItemsModal po={receivePO} onClose={() => setReceivePO(null)} onReceived={fetchPOs} />
      <ViewPOModal
        po={viewPO}
        onClose={() => setViewPO(null)}
        onReceive={loadReceive}
        onStatusUpdate={handleUpdateStatus}
        showPrintLabels={profile.labelTemplates.length > 0}
        printLabel={routeLabels.printTags ?? "Print Labels"}
      />
    </div>
  );
}