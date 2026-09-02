"use client";

import { Loading, LoadingCenter } from "@/components/ui/loading";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, FileBarChart, Loader2,
  Package, RefreshCw, Scale, ShieldCheck, Skull, TrendingDown, ScrollText, List,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { TableStatusBadge, TableValueBadge } from "@/components/ui/table-status-badge";
import { PageHeader, PageKpiGrid, pageKpi, type PageKpiItem } from "@/components/ui/page-kpi";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useShopWorkspace, hasExpiryTracking, hasBatchTracking } from "@/lib/use-shop-profile";
import { useRouter } from "next/navigation";
import {
  LotActionModal,
  type LotActionMode,
  type LotActionTarget,
} from "@/components/inventory/lot-action-modal";

export type ExpirySection = "dashboard" | "near" | "expired" | "lots" | "transactions" | "reconcile";

const SECTION_META: Record<ExpirySection, { title: string; description: string }> = {
  dashboard: { title: "Expiry Dashboard", description: "Urgent lots needing attention across your inventory" },
  near: { title: "Near Expiry", description: "Lots approaching expiry — dispose or adjust before they expire" },
  expired: { title: "Expired Stock", description: "Expired batches blocked at POS when policy is enabled" },
  lots: { title: "All Active Lots", description: "Every active batch and lot currently on hand" },
  transactions: { title: "Batch Transactions", description: "Lot movement and adjustment history" },
  reconcile: { title: "Lot Reconciliation", description: "Compare branch on-hand quantities vs lot totals" },
};

const EXPIRY_NAV: { section: ExpirySection; label: string; href: string; icon: typeof CalendarClock }[] = [
  { section: "dashboard", label: "Dashboard", href: "/inventory/expiry", icon: CalendarClock },
  { section: "near", label: "Near Expiry", href: "/inventory/expiry/near", icon: AlertTriangle },
  { section: "expired", label: "Expired", href: "/inventory/expiry/expired", icon: Skull },
  { section: "lots", label: "All Lots", href: "/inventory/expiry/lots", icon: List },
  { section: "transactions", label: "Transactions", href: "/inventory/expiry/transactions", icon: ScrollText },
  { section: "reconcile", label: "Reconcile", href: "/inventory/expiry/reconcile", icon: Scale },
];

function sumLotQty(rows: LotRow[]) {
  return rows.reduce((s, r) => s + r.quantity, 0);
}

function sumLotAvail(rows: LotRow[]) {
  return rows.reduce((s, r) => s + r.availableQty, 0);
}

function sumLotValue(rows: LotRow[]) {
  return rows.reduce((s, r) => s + (r.value ?? r.quantity * (r.unitCost || 0)), 0);
}

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
      cell: ({ row }) => <TableValueBadge label={row.original.movementType} />,
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
        const [lotsRes, dashRes] = await Promise.all([
          api.get("/inventory/lots?limit=500"),
          api.get<ExpiryDashboard>("/inventory/lots/expiry-dashboard"),
        ]);
        setLots(unwrapLots(lotsRes.data));
        setDash(dashRes.data ?? null);
      }
      if (section === "transactions") {
        const [txnRes, dashRes] = await Promise.all([
          api.get("/inventory/lots/transactions?limit=200"),
          api.get<ExpiryDashboard>("/inventory/lots/expiry-dashboard"),
        ]);
        setTxns(unwrapList<BatchTxn>(txnRes.data));
        setDash(dashRes.data ?? null);
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

  const sectionKpis = useMemo((): PageKpiItem[] => {
    if (section === "dashboard") {
      return [
        { ...pageKpi("Expired Qty", formatNumber(dash?.summary.expired.qty ?? 0), Skull, "danger"), sub: `${dash?.summary.expired.lots ?? 0} lots`, href: "/inventory/expiry/expired" },
        { ...pageKpi("Near Expiry (≤7d)", formatNumber(dash?.summary.within7Days.qty ?? 0), AlertTriangle, "warning"), sub: `${dash?.summary.within7Days.lots ?? 0} lots`, href: "/inventory/expiry/near" },
        { ...pageKpi("8–30 Days", formatNumber(dash?.summary.within30Days.qty ?? 0), Clock, "warning"), sub: `${dash?.summary.within30Days.lots ?? 0} lots`, href: "/inventory/expiry/near" },
        { ...pageKpi("Matched SKUs", reconcile?.summary.matched ?? 0, CheckCircle2, "success"), sub: `${reconcile?.summary.totalSkus ?? 0} total`, href: "/inventory/expiry/reconcile" },
      ];
    }
    if (section === "near") {
      const critical = nearLots.filter((l) => l.daysToExpiry != null && l.daysToExpiry <= 7).length;
      return [
        { ...pageKpi("Lots in Window", nearLots.length, Package, "warning"), sub: `Within ${nearDays} days` },
        { ...pageKpi("Total Qty", formatNumber(sumLotQty(nearLots)), AlertTriangle, "warning"), sub: "Units at risk" },
        { ...pageKpi("Critical ≤7d", critical, Clock, "danger"), sub: "Needs urgent action" },
        { ...pageKpi("Est. Value", `LKR ${formatNumber(sumLotValue(nearLots))}`, TrendingDown, "primary"), sub: "Stock value" },
      ];
    }
    if (section === "expired") {
      return [
        { ...pageKpi("Expired Lots", expiredLots.length, Skull, "danger"), sub: `${formatNumber(sumLotQty(expiredLots))} units` },
        { ...pageKpi("Expired Value", `LKR ${formatNumber(dash?.summary.expired.value ?? sumLotValue(expiredLots))}`, TrendingDown, "danger"), sub: "Write-off exposure" },
        { ...pageKpi("POS Block", dash?.policy?.posBlockExpired ? "ON" : "OFF", ShieldCheck, dash?.policy?.posBlockExpired ? "success" : "warning"), sub: "Expired sales policy" },
        { ...pageKpi("Available Qty", formatNumber(sumLotAvail(expiredLots)), Package, "neutral"), sub: "Still on hand" },
      ];
    }
    if (section === "lots") {
      const skus = new Set(lots.map((l) => l.variant.sku)).size;
      return [
        { ...pageKpi("Active Lots", lots.length, Package, "primary"), sub: `${skus} SKUs` },
        { ...pageKpi("Total Qty", formatNumber(sumLotQty(lots)), List, "info"), sub: "On hand" },
        { ...pageKpi("Available", formatNumber(sumLotAvail(lots)), CheckCircle2, "success"), sub: "Sellable units" },
        { ...pageKpi("Stock Value", `LKR ${formatNumber(sumLotValue(lots))}`, TrendingDown, "neutral"), sub: "At cost" },
      ];
    }
    if (section === "transactions") {
      const inbound = txns.filter((t) => t.quantityChange > 0).length;
      const outbound = txns.filter((t) => t.quantityChange < 0).length;
      const net = txns.reduce((s, t) => s + t.quantityChange, 0);
      return [
        { ...pageKpi("Movements", txns.length, ScrollText, "neutral"), sub: "Recent entries" },
        { ...pageKpi("Inbound", inbound, TrendingDown, "success"), sub: "Qty increases" },
        { ...pageKpi("Outbound", outbound, AlertTriangle, "danger"), sub: "Qty decreases" },
        { ...pageKpi("Net Qty Δ", net > 0 ? `+${net}` : String(net), Scale, net >= 0 ? "primary" : "warning"), sub: "Period total" },
      ];
    }
    if (section === "reconcile") {
      return [
        { ...pageKpi("Matched", reconcile?.summary.matched ?? 0, CheckCircle2, "success"), sub: `${reconcile?.summary.totalSkus ?? 0} SKUs checked` },
        { ...pageKpi("Lot Short", reconcile?.summary.lotShort ?? 0, TrendingDown, "warning"), sub: "Below on-hand" },
        { ...pageKpi("Lot Over", reconcile?.summary.lotOver ?? 0, AlertTriangle, "warning"), sub: "Above on-hand" },
        { ...pageKpi("No Lots", reconcile?.summary.noLots ?? 0, Package, "danger"), sub: "Missing batch data" },
      ];
    }
    return [];
  }, [section, dash, reconcile, nearLots, nearDays, expiredLots, lots, txns]);

  if (!showExpiry && !showBatch) {
    return (
      <div className="page-shell">
        <EmptyState
          icon={CalendarClock}
          title="Expiry tracking not enabled"
          description="This shop type does not use batch/expiry modules. Switch to Grocery or Agriculture, or enable expiry in vertical settings."
          action={<Button variant="outline" size="sm" onClick={() => router.push("/inventory")}>Back to Inventory</Button>}
        />
      </div>
    );
  }

  const lotSearch = [
    { id: "product", title: "Product" },
    { id: "sku", title: "SKU" },
    { id: "batch", title: "Batch" },
  ];

  return (
    <div className="page-shell space-y-4">
      <PageHeader
        title={meta.title}
        description={`${profile.label} · ${meta.description}${section === "dashboard" && reconcile?.summary?.strategy ? ` · ${reconcile.summary.strategy}` : ""}`}
        onRefresh={load}
        refreshing={loading}
        actions={(
          <>
            {section === "near" && (
              <div className="flex rounded-lg border border-border overflow-hidden bg-card">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setNearDays(d)}
                    className={cn(
                      "px-3 h-9 text-xs font-semibold transition-colors",
                      nearDays === d ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground",
                    )}
                  >
                    ≤{d}d
                  </button>
                ))}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/reports/expiry")}
              className="gap-1.5"
            >
              <FileBarChart className="h-4 w-4" /> Expiry Reports
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/inventory")}
              className="gap-1.5"
            >
              <Package className="h-4 w-4" /> Inventory
            </Button>
          </>
        )}
      />

      <nav className="flex flex-wrap gap-0 border-b border-border -mx-1 px-1">
        {EXPIRY_NAV.map((item) => {
          const Icon = item.icon;
          const active = section === item.section;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-1.5 h-9 px-3 text-xs font-semibold border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border",
              )}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <PageKpiGrid items={sectionKpis} loading={loading} />

      {section === "near" && (
        <p className="text-xs text-muted-foreground -mt-1">
          Showing lots expiring within {nearDays} days. Dispose write-offs or adjust quantities from row actions.
        </p>
      )}

      {section === "expired" && (
        <p className="text-xs text-muted-foreground -mt-1">
          Expired stock is blocked at POS when Block Expired is ON. Use Dispose to write off as damage.
        </p>
      )}

      {section === "reconcile" && (
        <div className="flex flex-wrap items-center justify-between gap-3 -mt-1">
          <p className="text-xs text-muted-foreground">
            Compare branch on-hand vs lot quantities. LOT_SHORT / NO_LOTS can be synced into an UNLOTTED-SYNC lot.
          </p>
          <Button size="sm" onClick={syncUnlotted} disabled={syncing} className="gap-1.5 shrink-0">
            {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
            Sync Unlotted → Lots
          </Button>
        </div>
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
        loading ? (
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
        )
      )}

      {section === "expired" && (
        loading ? (
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
        )
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
        loading ? (
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
        )
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
