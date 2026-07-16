"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CalendarClock, CheckCircle2, Clock, FileBarChart, Loader2,
  Package, RefreshCw, Scale, ShieldCheck, Skull, TrendingDown,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace, hasExpiryTracking, hasBatchTracking } from "@/lib/use-shop-profile";
import { useRouter } from "next/navigation";

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

function bucketBadge(bucket: string | null, days: number | null) {
  if (bucket === "expired" || (days != null && days < 0)) {
    return <Badge variant="danger" className="text-[10px]">Expired</Badge>;
  }
  if (bucket === "7d" || (days != null && days <= 7)) {
    return <Badge variant="warning" className="text-[10px]">≤7 days</Badge>;
  }
  if (bucket === "30d" || (days != null && days <= 30)) {
    return <Badge variant="secondary" className="text-[10px]">≤30 days</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">OK</Badge>;
}

function buildLotColumns(): ColumnDef<LotRow>[] {
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
      cell: ({ row }) => <Badge variant="warning" className="text-[10px]">{row.original.status}</Badge>,
    },
  ];
}

export default function ExpiryDashboardPage() {
  const router = useRouter();
  const { profile } = useShopWorkspace();
  const showExpiry = hasExpiryTracking(profile);
  const showBatch = hasBatchTracking(profile);
  const [dash, setDash] = useState<ExpiryDashboard | null>(null);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [reconcile, setReconcile] = useState<{ summary: ReconcileSummary; mismatches: ReconcileRow[] } | null>(null);
  const [txns, setTxns] = useState<BatchTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const lotColumns = useMemo(() => buildLotColumns(), []);
  const txnColumns = useMemo(() => buildTxnColumns(), []);
  const reconcileColumns = useMemo(() => buildReconcileColumns(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, lotsRes, recRes, txnRes] = await Promise.all([
        api.get<ExpiryDashboard>("/inventory/lots/expiry-dashboard"),
        api.get<{ data: LotRow[] }>("/inventory/lots?limit=200"),
        api.get<{ summary: ReconcileSummary; mismatches: ReconcileRow[] }>("/inventory/lots/reconcile"),
        api.get<{ data: BatchTxn[] }>("/inventory/lots/transactions?limit=100"),
      ]);
      setDash(dashRes.data ?? null);
      setLots(lotsRes.data?.data ?? (Array.isArray(lotsRes.data) ? lotsRes.data as unknown as LotRow[] : []));
      setReconcile(recRes.data ?? null);
      setTxns(txnRes.data?.data ?? (Array.isArray(txnRes.data) ? txnRes.data as unknown as BatchTxn[] : []));
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load expiry data");
    } finally {
      setLoading(false);
    }
  }, []);

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

  const nearRows = dash?.nearExpiry
    ?? (dash?.urgent ?? []).filter((l) => (l.daysToExpiry ?? 0) >= 0);
  const expiredRows = dash?.expiredLots
    ?? (dash?.urgent ?? []).filter((l) => (l.daysToExpiry ?? 0) < 0);

  const STATS = [
    {
      label: "Expired Qty",
      value: formatNumber(dash?.summary.expired.qty ?? 0),
      sub: `${dash?.summary.expired.lots ?? 0} lots`,
      icon: Skull,
      color: "text-red-500",
      bg: "bg-red-500/10",
    },
    {
      label: "Near Expiry (≤7d)",
      value: formatNumber(dash?.summary.within7Days.qty ?? 0),
      sub: `${dash?.summary.within7Days.lots ?? 0} lots`,
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "8–30 Days",
      value: formatNumber(dash?.summary.within30Days.qty ?? 0),
      sub: `${dash?.summary.within30Days.lots ?? 0} lots`,
      icon: Clock,
      color: "text-orange-500",
      bg: "bg-orange-500/10",
    },
    {
      label: "Matched SKUs",
      value: reconcile?.summary.matched ?? 0,
      sub: `${reconcile?.summary.totalSkus ?? 0} total`,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
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
          <h1 className="text-2xl font-bold">Expiry Management</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Near expiry, FEFO sales, POS block expired
            {reconcile?.summary?.strategy ? ` · ${reconcile.summary.strategy}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/reports?tab=expiry")} className="gap-1.5">
            <FileBarChart className="h-3.5 w-3.5" /> Expiry Reports
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/inventory")} className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Inventory
          </Button>
        </div>
      </div>

      {dash?.policy && (
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

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${s.bg}`}>
                <s.icon className={`h-5 w-5 ${s.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-[10px] text-muted-foreground">{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="dashboard">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="near">Near Expiry</TabsTrigger>
          <TabsTrigger value="expired">Expired</TabsTrigger>
          <TabsTrigger value="all">All Active Lots</TabsTrigger>
          <TabsTrigger value="ledger">Batch Transactions</TabsTrigger>
          <TabsTrigger value="reconcile">Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ClientSideTable
              data={dash?.urgent ?? []}
              columns={lotColumns}
              pageCount={Math.ceil((dash?.urgent?.length ?? 0) / 10) || 1}
              searchableColumns={lotSearch}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "expiry-urgent" }}
            />
          )}
        </TabsContent>

        <TabsContent value="near" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ClientSideTable
              data={nearRows}
              columns={lotColumns}
              pageCount={Math.ceil(nearRows.length / 10) || 1}
              searchableColumns={lotSearch}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "expiry-near" }}
            />
          )}
        </TabsContent>

        <TabsContent value="expired" className="mt-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Expired stock is blocked at POS when Block Expired is ON. Use Damage / adjustment to dispose.
          </p>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ClientSideTable
              data={expiredRows}
              columns={lotColumns}
              pageCount={Math.ceil(expiredRows.length / 10) || 1}
              searchableColumns={lotSearch}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "expiry-expired" }}
            />
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ClientSideTable
              data={lots}
              columns={lotColumns}
              pageCount={Math.ceil(lots.length / 10) || 1}
              searchableColumns={lotSearch}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "expiry-lots" }}
            />
          )}
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ClientSideTable
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
          )}
        </TabsContent>

        <TabsContent value="reconcile" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Compare branch on-hand vs lot quantities. LOT_SHORT / NO_LOTS can be synced into an UNLOTTED-SYNC lot.
            </p>
            <Button size="sm" onClick={syncUnlotted} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
              Sync Unlotted → Lots
            </Button>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { label: "Matched", value: reconcile?.summary.matched ?? 0, icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
              { label: "Lot Short", value: reconcile?.summary.lotShort ?? 0, icon: TrendingDown, color: "text-amber-500", bg: "bg-amber-500/10" },
              { label: "Lot Over", value: reconcile?.summary.lotOver ?? 0, icon: AlertTriangle, color: "text-orange-500", bg: "bg-orange-500/10" },
              { label: "No Lots", value: reconcile?.summary.noLots ?? 0, icon: Package, color: "text-red-500", bg: "bg-red-500/10" },
            ].map((s) => (
              <Card key={s.label}>
                <CardContent className="p-3 flex items-center gap-2.5">
                  <div className={`p-2 rounded-lg ${s.bg}`}>
                    <s.icon className={`h-4 w-4 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-lg font-bold leading-tight">{s.value}</p>
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ClientSideTable
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
        </TabsContent>
      </Tabs>
    </div>
  );
}
