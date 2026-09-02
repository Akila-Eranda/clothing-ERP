"use client";

import { Loading, LoadingCenter, LoadingScreen } from "@/components/ui/loading";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, FileBarChart, Loader2,
  Package, RefreshCw, Scale, ShieldCheck, Skull, TrendingDown,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableStatusBadge, TableValueBadge } from "@/components/ui/table-status-badge";
import { PageKpiGrid, PAGE_KPI_PRESETS, pageKpi } from "@/components/ui/page-kpi";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace, hasExpiryTracking, hasBatchTracking } from "@/lib/use-shop-profile";
import { useRouter } from "next/navigation";
import {
  LotActionModal,
  type LotActionMode,
  type LotActionTarget,
} from "@/components/inventory/lot-action-modal";

export type ExpirySection = "dashboard" | "near" | "expired" | "lots" | "transactions" | "reconcile";

const SECTION_META: Record<ExpirySection, { title: string; description: string }> = {
  dashboard: { title: "Expiry Dashboard", description: "Urgent lots needing attention" },
  near: { title: "Near Expiry", description: "Lots approaching expiry soon" },
  expired: { title: "Expired", description: "Expired stock blocked at POS when enabled" },
  lots: { title: "All Active Lots", description: "Every active batch/lot on hand" },
  transactions: { title: "Batch Transactions", description: "Lot movement history" },
  reconcile: { title: "Reconciliation", description: "Compare on-hand vs lot quantities" },
};

interface LotRow {
  id: string;
  batchNumber: string | null;
  expiryDate: string | null;
  manufactureDate?: string | null;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  unitCost: number;
  value?: number;
  expiryBucket: string | null;
  daysToExpiry: number | null;
  isExpired?: boolean;
  variant: { sku: string; name: string; product: { name: string } };
  branch?: { name: string };
}

interface ExpiryDashboard {
  policy?: {
    lotAllocation: string;
    posBlockExpired: boolean;
    fefoSales: boolean;
  };
  summary: {
    expired: { lots: number; qty: number; value?: number };
    within7Days: { lots: number; qty: number };
    within30Days: { lots: number; qty: number };
    within90Days: { lots: number; qty: number };
    nearExpiryValue?: number;
  };
  urgent: LotRow[];
  nearExpiry?: LotRow[];
  expiredLots?: LotRow[];
}

interface ReconcileSummary {
  totalSkus: number;
  matched: number;
  lotShort: number;
  lotOver: number;
  noLots: number;
  strategy: string;
}

interface ReconcileRow {
  variantId: string;
  branchId: string;
  inventoryQty: number;
  lotQty: number;
  delta: number;
  status: string;
  sku?: string | null;
  name?: string | null;
}

interface BatchTxn {
  id: string;
  movementType: string;
  quantityChange: number;
  batchNumber: string | null;
  expiryDate: string | null;
  notes: string | null;
  createdAt: string;
  variant: { sku: string; name: string; product: { name: string } };
  lot?: { batchNumber: string | null; manufactureDate: string | null } | null;
}

function unwrapLots(payload: unknown): LotRow[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as LotRow[];
  const nested = payload as { data?: LotRow[] };
  return Array.isArray(nested.data) ? nested.data : [];
}

function unwrapList<T>(payload: unknown): T[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload as T[];
  const nested = payload as { data?: T[] };
  return Array.isArray(nested.data) ? nested.data : [];
}

function bucketBadge(bucket: string | null, days: number | null) {
  if (bucket === "expired" || (days != null && days < 0)) {
    return <TableValueBadge label="Expired" variant="danger" />;
  }
  if (bucket === "7d" || (days != null && days <= 7)) {
    return <TableValueBadge label="≤7 days" variant="warning" />;
  }
  if (bucket === "30d" || (days != null && days <= 30)) {
    return <TableValueBadge label="≤30 days" variant="gold" />;
  }
  return <TableValueBadge label="OK" variant="success" />;
}

function buildLotColumns(onAction: (lot: LotRow, mode: LotActionMode) => void): ColumnDef<LotRow>[] {
  return [
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
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.variant.sku}</span>,
    },
    {
      id: "batch",
      accessorFn: (r) => r.batchNumber ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Batch" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.batchNumber ?? "—"}</span>,
    },
    {
      id: "mfd",
      header: ({ column }) => <DataTableColumnHeader column={column} title="MFD" />,
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.manufactureDate
            ? new Date(row.original.manufactureDate).toLocaleDateString("en-LK")
            : "—"}
        </span>
      ),
    },
    {
      id: "expiry",
      accessorFn: (r) => r.expiryDate ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expiry" />,
      cell: ({ row }) => {
        const lot = row.original;
        return (
          <div>
            <p className="text-xs">
              {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString("en-LK") : "—"}
            </p>
            {lot.daysToExpiry != null && (
              <p className="text-[10px] text-muted-foreground">
                {lot.daysToExpiry < 0
                  ? `${Math.abs(lot.daysToExpiry)}d overdue`
                  : `${lot.daysToExpiry}d left`}
              </p>
            )}
          </div>
        );
      },
    },
    {
      id: "qty",
      accessorKey: "quantity",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Qty" />,
      cell: ({ row }) => <span className="font-bold text-sm">{row.original.quantity}</span>,
    },
    {
      id: "avail",
      accessorKey: "availableQty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Available" />,
      cell: ({ row }) => (
        <span className="font-semibold text-emerald-600">{row.original.availableQty}</span>
      ),
    },
    {
      id: "value",
      accessorFn: (r) => r.value ?? r.quantity * (r.unitCost || 0),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
      cell: ({ row }) => (
        <span className="text-xs">
          LKR {formatNumber(row.original.value ?? row.original.quantity * (row.original.unitCost || 0))}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (r) => r.expiryBucket ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => bucketBadge(row.original.expiryBucket, row.original.daysToExpiry),
    },
    {
      id: "actions",
      enableSorting: false,
      cell: ({ row }) => {
        const lot = row.original;
        const canDispose = lot.availableQty > 0;
        return (
          <TableActionsRow
            dropMoreActions={[
              ...(canDispose
                ? [{ text: "Dispose", function: () => onAction(lot, "dispose") }]
                : []),
              { text: "Adjust qty", function: () => onAction(lot, "adjust") },
            ]}
          />
        );
      },
    },
  ];
}

function buildTxnColumns(): ColumnDef<BatchTxn>[] {
  return [
    {
      id: "when",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="When" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {new Date(row.original.createdAt).toLocaleString("en-LK")}
        </span>
      ),
    },
    {
      id: "product",
      accessorFn: (r) => r.variant.product.name,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.variant.product.name}</p>
          <p className="font-mono text-[10px] text-muted-foreground">{row.original.variant.sku}</p>
        </div>
      ),
    },
    {
      id: "type",
      accessorKey: "movementType",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => (
        <Badge variant="secondary" className="text-[9px]">{row.original.movementType}</Badge>
      ),
    },
    {
      id: "qty",
      accessorKey: "quantityChange",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Qty Δ" />,
      cell: ({ row }) => {
        const q = row.original.quantityChange;
        return (
          <span className={`font-bold text-sm ${q < 0 ? "text-red-600" : "text-emerald-600"}`}>
            {q > 0 ? `+${q}` : q}
          </span>
        );
      },
    },
    {
      id: "batch",
      accessorFn: (r) => r.batchNumber ?? r.lot?.batchNumber ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Batch" />,
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.batchNumber ?? row.original.lot?.batchNumber ?? "—"}
        </span>
      ),
    },
    {
      id: "notes",
      accessorKey: "notes",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Notes" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground max-w-[160px] truncate block">
          {row.original.notes ?? "—"}
        </span>
      ),
    },
  ];
}

function buildReconcileColumns(): ColumnDef<ReconcileRow>[] {
  return [
    {
      id: "name",
      accessorFn: (r) => r.name ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Product" />,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name ?? "—"}</span>,
    },
    {
      id: "sku",
      accessorFn: (r) => r.sku ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="SKU" />,
      cell: ({ row }) => <span className="font-mono text-xs">{row.original.sku ?? "—"}</span>,
    },
    {
      id: "onHand",
      accessorKey: "inventoryQty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="On Hand" />,
      cell: ({ row }) => <span className="font-bold text-sm">{row.original.inventoryQty}</span>,
    },
    {
      id: "lotQty",
      accessorKey: "lotQty",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Lot Qty" />,
      cell: ({ row }) => <span className="text-sm">{row.original.lotQty}</span>,
    },
    {
      id: "delta",
      accessorKey: "delta",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Δ" />,
      cell: ({ row }) => <span className="font-semibold text-sm">{row.original.delta}</span>,
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <TableStatusBadge status={row.original.status} />,
    },
  ];
}

export function ExpiryHub({ section }: { section: ExpirySection }) {
  const router = useRouter();
  const { profile } = useShopWorkspace();
  const showExpiry = hasExpiryTracking(profile);
  const showBatch = hasBatchTracking(profile);
  const meta = SECTION_META[section];
  const [dash, setDash] = useState<ExpiryDashboard | null>(null);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [nearLots, setNearLots] = useState<LotRow[]>([]);
  const [expiredLots, setExpiredLots] = useState<LotRow[]>([]);
  const [nearDays, setNearDays] = useState(30);
  const [reconcile, setReconcile] = useState<{ summary: ReconcileSummary; mismatches: ReconcileRow[] } | null>(null);
  const [txns, setTxns] = useState<BatchTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [actionMode, setActionMode] = useState<LotActionMode>("dispose");
  const [actionLot, setActionLot] = useState<LotActionTarget | null>(null);

  const openLotAction = useCallback((lot: LotRow, mode: LotActionMode) => {
    setActionLot(lot);
    setActionMode(mode);
    setActionOpen(true);
  }, []);

  const lotColumns = useMemo(() => buildLotColumns(openLotAction), [openLotAction]);
  const txnColumns = useMemo(() => buildTxnColumns(), []);
  const reconcileColumns = useMemo(() => buildReconcileColumns(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (section === "dashboard") {
        const [dashRes, recRes] = await Promise.all([
          api.get<ExpiryDashboard>("/inventory/lots/expiry-dashboard"),
          api.get<{ summary: ReconcileSummary; mismatches: ReconcileRow[] }>("/inventory/lots/reconcile"),
        ]);
        setDash(dashRes.data ?? null);
        setReconcile(recRes.data ?? null);
      }
      if (section === "near") {
        const nearRes = await api.get(`/inventory/lots?expiringWithinDays=${nearDays}&limit=500`);
        setNearLots(unwrapLots(nearRes.data));
        const dashRes = await api.get<ExpiryDashboard>("/inventory/lots/expiry-dashboard");
        setDash(dashRes.data ?? null);
      }
      if (section === "expired") {
        const expRes = await api.get("/inventory/lots?expiredOnly=true&limit=500");
        setExpiredLots(unwrapLots(expRes.data));
        const dashRes = await api.get<ExpiryDashboard>("/inventory/lots/expiry-dashboard");
        setDash(dashRes.data ?? null);
      }
      if (section === "lots") {
        const lotsRes = await api.get("/inventory/lots?limit=500");
        setLots(unwrapLots(lotsRes.data));
      }
      if (section === "transactions") {
        const txnRes = await api.get("/inventory/lots/transactions?limit=200");
        setTxns(unwrapList<BatchTxn>(txnRes.data));
      }
      if (section === "reconcile") {
        const recRes = await api.get<{ summary: ReconcileSummary; mismatches: ReconcileRow[] }>("/inventory/lots/reconcile");
        setReconcile(recRes.data ?? null);
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load expiry data");
    } finally {
      setLoading(false);
    }
  }, [section, nearDays]);

  useEffect(() => { load(); }, [load]);

  const syncUnlotted = async () => {
    setSyncing(true);
    try {
      const res = await api.post<{ synced: number }>("/inventory/lots/reconcile/sync-unlotted", {});
      toast.success(`Synced ${res.data?.synced ?? 0} SKU(s) into lots`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  if (!showExpiry && !showBatch) {
    return (
      <div className="p-6 max-w-lg mx-auto text-center space-y-3">
        <CalendarClock className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="text-xl font-bold">Expiry tracking not enabled</h1>
        <p className="text-sm text-muted-foreground">
          This shop type does not use batch/expiry modules. Switch to Grocery or Agriculture, or enable expiry in vertical settings.
        </p>
        <Button variant="outline" onClick={() => router.push("/inventory")}>Back to Inventory</Button>
      </div>
    );
  }

  const showSummaryStats = section === "dashboard";
  const STATS = [
    {
      label: "Expired Qty",
      value: formatNumber(dash?.summary.expired.qty ?? 0),
      sub: `${dash?.summary.expired.lots ?? 0} lots`,
      icon: Skull,
      color: "text-red-600 dark:text-red-400",
      bg: "bg-red-500/15",
      tint: PAGE_KPI_PRESETS.red.tint,
      href: "/inventory/expiry/expired",
    },
    {
      label: "Near Expiry (≤7d)",
      value: formatNumber(dash?.summary.within7Days.qty ?? 0),
      sub: `${dash?.summary.within7Days.lots ?? 0} lots`,
      icon: AlertTriangle,
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-500/15",
      tint: PAGE_KPI_PRESETS.amber.tint,
      href: "/inventory/expiry/near",
    },
    {
      label: "8–30 Days",
      value: formatNumber(dash?.summary.within30Days.qty ?? 0),
      sub: `${dash?.summary.within30Days.lots ?? 0} lots`,
      icon: Clock,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-500/15",
      tint: PAGE_KPI_PRESETS.orange.tint,
      href: "/inventory/expiry/near",
    },
    {
      label: "Matched SKUs",
      value: reconcile?.summary.matched ?? 0,
      sub: `${reconcile?.summary.totalSkus ?? 0} total`,
      icon: CheckCircle2,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-500/15",
      tint: PAGE_KPI_PRESETS.emerald.tint,
      href: "/inventory/expiry/reconcile",
    },
  ];

  const RECONCILE_KPI = [
    pageKpi("Matched", reconcile?.summary.matched ?? 0, CheckCircle2, "emerald"),
    pageKpi("Lot Short", reconcile?.summary.lotShort ?? 0, TrendingDown, "amber"),
    pageKpi("Lot Over", reconcile?.summary.lotOver ?? 0, AlertTriangle, "orange"),
    pageKpi("No Lots", reconcile?.summary.noLots ?? 0, Package, "red"),
  ];

  const lotSearch = [
    { id: "product", title: "Product" },
    { id: "sku", title: "SKU" },
    { id: "batch", title: "Batch" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · {meta.description}
            {section === "dashboard" && reconcile?.summary?.strategy ? ` · ${reconcile.summary.strategy}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {section === "near" && (
            <div className="flex rounded-lg border overflow-hidden">
              {[7, 30, 90].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setNearDays(d)}
                  className={`px-3 h-8 text-xs font-semibold transition-colors ${
                    nearDays === d ? "bg-primary text-primary-foreground" : "hover:bg-muted"
                  }`}
                >
                  ≤{d}d
                </button>
              ))}
            </div>
          )}
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/reports/expiry")} className="gap-1.5">
            <FileBarChart className="h-3.5 w-3.5" /> Expiry Reports
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/inventory")} className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Inventory
          </Button>
        </div>
      </div>

      {section === "dashboard" && dash?.policy && (
        <div className="flex flex-wrap gap-2">
          <Badge variant={dash.policy.posBlockExpired ? "default" : "warning"} className="gap-1 text-[10px]">
            <ShieldCheck className="h-3 w-3" />
            POS Block Expired: {dash.policy.posBlockExpired ? "ON" : "OFF"}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            Allocation: {dash.policy.lotAllocation}
            {dash.policy.fefoSales ? " · FEFO sales" : ""}
          </Badge>
          {dash.summary.expired.value != null && (
            <Badge variant="outline" className="text-[10px] gap-1">
              <TrendingDown className="h-3 w-3" />
              Expired value LKR {formatNumber(dash.summary.expired.value)}
            </Badge>
          )}
          {dash.summary.nearExpiryValue != null && (
            <Badge variant="outline" className="text-[10px]">
              Near-expiry value LKR {formatNumber(dash.summary.nearExpiryValue)}
            </Badge>
          )}
        </div>
      )}

      {showSummaryStats && (
        <PageKpiGrid items={STATS} />
      )}

      {section === "dashboard" && (
        loading ? (
          <LoadingCenter />
        ) : (
          <ClientSideTable
          fillHeight={false}
            data={dash?.urgent ?? []}
            columns={lotColumns}
            pageCount={Math.ceil((dash?.urgent?.length ?? 0) / 10) || 1}
            searchableColumns={lotSearch}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "expiry-urgent" }}
          />
        )
      )}

      {section === "near" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Showing lots expiring within {nearDays} days. Dispose write-offs or adjust quantities from Actions.
          </p>
          {loading ? (
            <LoadingCenter />
          ) : (
            <ClientSideTable
          fillHeight={false}
              data={nearLots}
              columns={lotColumns}
              pageCount={Math.ceil(nearLots.length / 10) || 1}
              searchableColumns={lotSearch}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "expiry-near" }}
            />
          )}
        </div>
      )}

      {section === "expired" && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Expired stock is blocked at POS when Block Expired is ON. Use Dispose to write off as Damage.
          </p>
          {loading ? (
            <LoadingCenter />
          ) : (
            <ClientSideTable
          fillHeight={false}
              data={expiredLots}
              columns={lotColumns}
              pageCount={Math.ceil(expiredLots.length / 10) || 1}
              searchableColumns={lotSearch}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "expiry-expired" }}
            />
          )}
        </div>
      )}

      {section === "lots" && (
        loading ? (
          <LoadingCenter />
        ) : (
          <ClientSideTable
          fillHeight={false}
            data={lots}
            columns={lotColumns}
            pageCount={Math.ceil(lots.length / 10) || 1}
            searchableColumns={lotSearch}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "expiry-lots" }}
          />
        )
      )}

      {section === "transactions" && (
        loading ? (
          <LoadingCenter />
        ) : (
          <ClientSideTable
          fillHeight={false}
            data={txns}
            columns={txnColumns}
            pageCount={Math.ceil(txns.length / 10) || 1}
            searchableColumns={[
              { id: "product", title: "Product" },
              { id: "batch", title: "Batch" },
              { id: "type", title: "Type" },
            ]}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "batch-transactions" }}
          />
        )
      )}

      {section === "reconcile" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Compare branch on-hand vs lot quantities. LOT_SHORT / NO_LOTS can be synced into an UNLOTTED-SYNC lot.
            </p>
            <Button size="sm" onClick={syncUnlotted} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
              Sync Unlotted → Lots
            </Button>
          </div>

          <PageKpiGrid items={RECONCILE_KPI} />

          {loading ? (
            <LoadingCenter />
          ) : (
            <ClientSideTable
          fillHeight={false}
              data={reconcile?.mismatches ?? []}
              columns={reconcileColumns}
              pageCount={Math.ceil((reconcile?.mismatches?.length ?? 0) / 10) || 1}
              searchableColumns={[
                { id: "name", title: "Product" },
                { id: "sku", title: "SKU" },
                { id: "status", title: "Status" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "lot-reconcile" }}
            />
          )}
        </div>
      )}

      <LotActionModal
        open={actionOpen}
        mode={actionMode}
        lot={actionLot}
        onClose={() => setActionOpen(false)}
        onDone={load}
      />
    </div>
  );
}
