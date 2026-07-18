"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Building2,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Star,
  Truck,
  Warehouse,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { OpenRecordButton } from "@/components/table/open-record-button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useBranchStore } from "@/stores/branch-store";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { useAuthStore } from "@/stores/auth-store";
import {
  isTransferWorkflowApproved,
  type WorkflowInstanceLike,
} from "@/lib/workflow-access";
import { TransferApprovalActions } from "@/components/inventory/transfer-approval-actions";
import {
  AddWarehouseModal,
  type WarehouseRecord,
} from "@/components/warehouse/add-warehouse-modal";
import { WarehouseTransferModal } from "@/components/warehouse/warehouse-transfer-modal";

type WarehouseSection = "locations" | "stock" | "transfers";

const SECTION_META: Record<WarehouseSection, { title: string; description: string }> = {
  locations: { title: "Locations", description: "Warehouse locations for the active branch" },
  stock: { title: "Warehouse Stock", description: "On-hand quantities by warehouse location" },
  transfers: { title: "Transfers", description: "Move stock between warehouse locations" },
};

interface Dashboard {
  totals: {
    warehouses: number;
    skuCount: number;
    onHandQty: number;
    availableQty: number;
    stockValue: number;
    lowStockSkus: number;
    openTransfers: number;
  };
  warehouses: WarehouseRecord[];
}

interface StockRow {
  id: string;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  value: number;
  avgCost: number;
  variantId?: string;
  variant: { id?: string; sku: string; name: string; product: { name: string } };
}

interface TransferRow {
  id: string;
  status: string;
  createdAt: string;
  notes?: string | null;
  requestedBy?: string | null;
  fromBranchId?: string;
  toBranchId?: string;
  fromBranch?: { name: string; code: string } | null;
  toBranch?: { name: string; code: string } | null;
  fromWarehouse?: { name: string; code: string } | null;
  toWarehouse?: { name: string; code: string } | null;
  items: { requestedQty: number; variant: { sku: string; product: { name: string } } }[];
  workflow?: WorkflowInstanceLike | null;
}

const TRANSFER_STATUS: Record<string, { label: string; variant: "warning" | "info" | "success" | "secondary" | "danger" }> = {
  PENDING: { label: "Pending", variant: "warning" },
  IN_TRANSIT: { label: "In Transit", variant: "info" },
  RECEIVED: { label: "Received", variant: "success" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

export default function WarehousePage() {
  const { profile } = useShopWorkspace();
  const { user } = useAuthStore();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  const [section, setSection] = useState<WarehouseSection>("locations");
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseRecord[]>([]);
  const [selected, setSelected] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [transfers, setTransfers] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(false);
  const [transferActionId, setTransferActionId] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editWh, setEditWh] = useState<WarehouseRecord | undefined>();
  const [transferOpen, setTransferOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = activeBranchId ? `?branchId=${activeBranchId}` : "";
      const [dashRes, listRes, trRes] = await Promise.all([
        api.get<Dashboard>(`/warehouses/dashboard${q}`),
        api.get<WarehouseRecord[]>(`/warehouses${q}`),
        api.get<TransferRow[]>(`/warehouses/transfers${q}`),
      ]);
      setDash(dashRes.data ?? null);
      const list = Array.isArray(listRes.data) ? listRes.data : [];
      setWarehouses(list);
      setSelected((prev) => (prev && list.some((w) => w.id === prev) ? prev : list[0]?.id || ""));
      setTransfers(Array.isArray(trRes.data) ? trRes.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  const loadStock = useCallback(async (warehouseId: string) => {
    if (!warehouseId) {
      setStock([]);
      return;
    }
    setStockLoading(true);
    try {
      const res = await api.get<StockRow[]>(`/warehouses/${warehouseId}/stock`);
      setStock(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load stock");
    } finally {
      setStockLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (section === "stock" && selected) void loadStock(selected);
  }, [section, selected, loadStock]);

  const handleDelete = async (w: WarehouseRecord) => {
    if (w.isDefault) {
      toast.error("Cannot delete the default warehouse");
      return;
    }
    if (!window.confirm(`Delete "${w.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/warehouses/${w.id}`);
      toast.success(`"${w.name}" deleted`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Delete failed");
    }
  };

  const updateTransfer = async (id: string, status: string) => {
    setTransferActionId(id);
    try {
      await api.put(`/inventory/transfers/${id}/status`, { status });
      toast.success(
        status === "IN_TRANSIT" ? "Transfer dispatched" :
        status === "RECEIVED" ? "Transfer received" : `Transfer ${status.toLowerCase()}`,
      );
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Update failed");
    } finally {
      setTransferActionId(null);
    }
  };

  const actOnTransferWorkflow = async (taskId: string, action: "approve" | "reject") => {
    setTransferActionId(taskId);
    try {
      await api.put(`/workflows/tasks/${taskId}/${action}`, {});
      toast.success(action === "approve" ? "Transfer approved" : "Transfer rejected");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? `Failed to ${action} transfer`);
    } finally {
      setTransferActionId(null);
    }
  };

  const warehouseColumns = useMemo<ColumnDef<WarehouseRecord>[]>(() => [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Warehouse" />,
      cell: ({ row }) => {
        const w = row.original;
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Warehouse className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <OpenRecordButton
                  onClick={() => {
                    setEditWh(w);
                    setAddOpen(true);
                  }}
                  className="text-sm"
                  title="Edit warehouse"
                >
                  {w.name}
                </OpenRecordButton>
                {w.isDefault && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">
                    <Star className="h-2 w-2" />Default
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground font-mono">{w.code}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "branch",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Branch" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="h-3 w-3 shrink-0" />
          {row.original.branch?.name ?? "—"}
        </div>
      ),
    },
    {
      id: "address",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Address" />,
      cell: ({ row }) =>
        row.original.address ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground max-w-[200px]">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{row.original.address}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      id: "onHand",
      header: ({ column }) => <DataTableColumnHeader column={column} title="On Hand" />,
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums">
          {formatNumber(row.original.summary?.onHandQty ?? 0)}
        </span>
      ),
    },
    {
      id: "available",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Available" />,
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-emerald-600 tabular-nums">
          {formatNumber(row.original.summary?.availableQty ?? 0)}
        </span>
      ),
    },
    {
      id: "value",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Stock Value" />,
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">
          LKR {formatNumber(row.original.summary?.stockValue ?? 0)}
        </span>
      ),
    },
    {
      id: "low",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Low Stock" />,
      cell: ({ row }) => {
        const n = row.original.summary?.lowStockSkus ?? 0;
        return n > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
            <AlertTriangle className="h-3 w-3" />{n}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">0</span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          editAction={{
            action: () => {
              setEditWh(row.original);
              setAddOpen(true);
            },
          }}
          deleteAction={
            row.original.isDefault
              ? undefined
              : { action: () => handleDelete(row.original) }
          }
          dropMoreActions={[
            {
              text: "View stock",
              function: () => {
                setSelected(row.original.id);
                setSection("stock");
              },
            },
          ]}
        />
      ),
    },
  ], []);

  const stockColumns = useMemo<ColumnDef<StockRow>[]>(() => [
    {
      id: "product",
      accessorFn: (r) => r.variant.product.name,
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
      accessorFn: (r) => r.variant.sku,
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.variant.sku}</span>,
    },
    {
      accessorKey: "quantity",
      header: ({ column }) => <DataTableColumnHeader column={column} title="On Hand" />,
      cell: ({ row }) => <span className="font-bold text-sm tabular-nums">{row.original.quantity}</span>,
    },
    {
      accessorKey: "reservedQty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reserved" />,
      cell: ({ row }) => <span className="text-sm tabular-nums text-violet-600">{row.original.reservedQty}</span>,
    },
    {
      accessorKey: "availableQty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Available" />,
      cell: ({ row }) => (
        <span className="font-semibold text-emerald-600 tabular-nums">{row.original.availableQty}</span>
      ),
    },
    {
      accessorKey: "value",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
      cell: ({ row }) => <span className="text-xs tabular-nums">LKR {formatNumber(row.original.value)}</span>,
    },
  ], []);

  const transferColumns = useMemo<ColumnDef<TransferRow>[]>(() => [
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleString("en-LK")}
        </span>
      ),
    },
    {
      id: "route",
      accessorFn: (r) =>
        `${r.fromWarehouse?.name ?? r.fromBranch?.name ?? ""} → ${r.toWarehouse?.name ?? r.toBranch?.name ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="From → To" />,
      cell: ({ row }) => (
        <span className="text-xs">
          <span className="font-medium">{row.original.fromWarehouse?.name ?? row.original.fromBranch?.name ?? "—"}</span>
          {" → "}
          <span className="font-medium">{row.original.toWarehouse?.name ?? row.original.toBranch?.name ?? "—"}</span>
        </span>
      ),
    },
    {
      id: "items",
      accessorFn: (r) => r.items?.length ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => <span className="text-sm">{row.original.items?.length ?? 0} SKU(s)</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const conf = TRANSFER_STATUS[row.original.status] ?? { label: row.original.status, variant: "secondary" as const };
        const showPendingApproval = row.original.status === "PENDING" && row.original.workflow?.status === "IN_PROGRESS";
        return (
          <div>
            <Badge variant={conf.variant} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center gap-1">
              {row.original.status === "IN_TRANSIT" && <Truck className="h-2.5 w-2.5" />}
              {row.original.status === "RECEIVED" && <CheckCircle2 className="h-2.5 w-2.5" />}
              {row.original.status === "PENDING" && <Clock className="h-2.5 w-2.5" />}
              {conf.label}
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
        const wfActing = !!(transferActionId && t.workflow?.tasks?.some((task) => task.id === transferActionId));
        if (t.status === "PENDING" && t.workflow) {
          return (
            <TransferApprovalActions
              instance={t.workflow}
              userId={user?.id}
              userRole={user?.role}
              requestedBy={t.requestedBy}
              acting={wfActing}
              onApprove={(taskId) => void actOnTransferWorkflow(taskId, "approve")}
              onReject={(taskId) => void actOnTransferWorkflow(taskId, "reject")}
            />
          );
        }
        if (t.workflow?.status === "APPROVED" || (!t.workflow && t.status === "PENDING")) {
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
        const canDispatch = t.status === "PENDING" && approved;
        const canReceive = t.status === "IN_TRANSIT";
        const acting = transferActionId === t.id;
        if (!canDispatch && !canReceive) {
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        return (
          <div className="flex gap-1.5">
            {canDispatch && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={acting} onClick={() => void updateTransfer(t.id, "IN_TRANSIT")}>
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />} Dispatch
              </Button>
            )}
            {canReceive && (
              <Button size="sm" className="h-7 text-xs gap-1" disabled={acting} onClick={() => void updateTransfer(t.id, "RECEIVED")}>
                {acting ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Receive
              </Button>
            )}
          </div>
        );
      },
    },
  ], [transferActionId, user?.id, user?.role]);

  const locationRows = dash?.warehouses?.length ? dash.warehouses : warehouses;
  const lowStockTotal = dash?.totals.lowStockSkus ?? 0;

  const STATS = [
    { label: "Warehouses", value: dash?.totals.warehouses ?? warehouses.length, icon: Warehouse, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "On Hand Qty", value: formatNumber(dash?.totals.onHandQty ?? 0), icon: Package, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Stock Value", value: `LKR ${formatNumber(dash?.totals.stockValue ?? 0)}`, icon: CheckCircle2, color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { label: "Open Transfers", value: dash?.totals.openTransfers ?? 0, icon: ArrowRightLeft, color: "text-amber-500", bg: "bg-amber-500/10" },
  ];

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">{SECTION_META[section].title}</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {profile.label} · {SECTION_META[section].description}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={() => void load()} className="h-10 rounded-[12px] gap-1.5 text-sm">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" onClick={() => setTransferOpen(true)} className="h-10 rounded-[12px] gap-1.5 text-sm" disabled={warehouses.length < 2}>
            <ArrowRightLeft className="h-[18px] w-[18px]" /> Transfer
          </Button>
          <Button
            className="h-10 rounded-[12px] gap-1.5 text-sm"
            onClick={() => {
              setEditWh(undefined);
              setAddOpen(true);
            }}
          >
            <Plus className="h-[18px] w-[18px]" /> Add Warehouse
          </Button>
        </div>
      </div>

      {/* Stats */}
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
                <p className={`${typeof s.value === "string" && s.value.startsWith("LKR") ? "text-lg" : "text-[22px]"} font-bold leading-none tabular-nums`}>
                  {s.value}
                </p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {lowStockTotal > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {lowStockTotal} SKU(s) are below reorder level across warehouses
        </div>
      )}

      {/* Section toggle — same pattern as HR / Inventory */}
      <div className="flex items-center gap-2 border rounded-lg p-1 w-fit bg-muted/30">
        {([
          { id: "locations" as const, label: "Locations" },
          { id: "stock" as const, label: "Stock" },
          { id: "transfers" as const, label: "Transfers" },
        ]).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
              section === tab.id
                ? "bg-background shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Locations */}
      {section === "locations" && (
        loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <ClientSideTable
            data={locationRows}
            columns={warehouseColumns}
            pageCount={Math.ceil(locationRows.length / 10) || 1}
            searchableColumns={[
              { id: "name", title: "Warehouse" },
            ]}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "warehouses" }}
          />
        )
      )}

      {/* Stock */}
      {section === "stock" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-64 h-9">
                <SelectValue placeholder="Select warehouse…" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name} ({w.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              disabled={!selected || stockLoading}
              onClick={() => selected && void loadStock(selected)}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${stockLoading ? "animate-spin" : ""}`} /> Load
            </Button>
          </div>
          {stockLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : warehouses.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground border rounded-xl">
              <Warehouse className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p>No warehouses yet — add one to track stock by location</p>
            </div>
          ) : (
            <ClientSideTable
              data={stock}
              columns={stockColumns}
              pageCount={Math.ceil(stock.length / 10) || 1}
              searchableColumns={[
                { id: "product", title: "Product" },
                { id: "sku", title: "SKU" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "warehouse-stock" }}
            />
          )}
        </div>
      )}

      {/* Transfers */}
      {section === "transfers" && (
        loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <ClientSideTable
            data={transfers}
            columns={transferColumns}
            pageCount={Math.ceil(transfers.length / 10) || 1}
            searchableColumns={[
              { id: "route", title: "Route" },
              { id: "status", title: "Status" },
            ]}
            filterableColumns={[
              {
                id: "status",
                title: "Status",
                options: [
                  { value: "PENDING", label: "Pending" },
                  { value: "IN_TRANSIT", label: "In Transit" },
                  { value: "RECEIVED", label: "Received" },
                ],
              },
            ]}
            isShowExportButtons={{ isShow: true, fileName: "warehouse-transfers" }}
          />
        )
      )}

      <AddWarehouseModal
        open={addOpen}
        onClose={() => { setAddOpen(false); setEditWh(undefined); }}
        onSaved={() => void load()}
        branchId={activeBranchId}
        editWarehouse={editWh}
      />
      <WarehouseTransferModal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onCreated={() => void load()}
        warehouses={warehouses}
        defaultFromId={selected || warehouses[0]?.id}
      />
    </div>
  );
}
