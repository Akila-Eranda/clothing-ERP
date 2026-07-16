"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, CalendarClock, FileBarChart, Package, RefreshCw, Loader2, Scale, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [batchFilter, setBatchFilter] = useState("");

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

  const filtered = batchFilter
    ? lots.filter((l) => (l.batchNumber ?? "").toLowerCase().includes(batchFilter.toLowerCase())
      || l.variant.sku.toLowerCase().includes(batchFilter.toLowerCase())
      || l.variant.product.name.toLowerCase().includes(batchFilter.toLowerCase()))
    : lots;

  const nearRows = dash?.nearExpiry
    ?? (dash?.urgent ?? []).filter((l) => (l.daysToExpiry ?? 0) >= 0);
  const expiredRows = dash?.expiredLots
    ?? (dash?.urgent ?? []).filter((l) => (l.daysToExpiry ?? 0) < 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expiry Management</h1>
          <p className="text-sm text-muted-foreground">
            Near expiry · expired · FEFO sales · POS block expired · batch reports
            {reconcile?.summary?.strategy ? ` · strategy: ${reconcile.summary.strategy}` : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => router.push("/reports?tab=expiry")} className="gap-1.5">
            <FileBarChart className="h-3.5 w-3.5" /> Expiry Reports
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push("/inventory")} className="gap-1.5">
            <Package className="h-3.5 w-3.5" /> Inventory
          </Button>
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </div>

      {dash?.policy && (
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={dash.policy.posBlockExpired ? "default" : "warning"} className="gap-1">
            <ShieldCheck className="h-3 w-3" />
            POS Block Expired: {dash.policy.posBlockExpired ? "ON" : "OFF"}
          </Badge>
          <Badge variant="outline">
            Allocation: {dash.policy.lotAllocation}
            {dash.policy.fefoSales ? " (FEFO sales)" : ""}
          </Badge>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          {
            label: "Expired",
            value: dash?.summary.expired.qty ?? 0,
            sub: `${dash?.summary.expired.lots ?? 0} lots${dash?.summary.expired.value != null ? ` · LKR ${formatNumber(dash.summary.expired.value)}` : ""}`,
            tone: "text-red-600",
            bg: "bg-red-500/10",
          },
          {
            label: "Near expiry (≤7d)",
            value: dash?.summary.within7Days.qty ?? 0,
            sub: `${dash?.summary.within7Days.lots ?? 0} lots`,
            tone: "text-amber-600",
            bg: "bg-amber-500/10",
          },
          {
            label: "8–30 days",
            value: dash?.summary.within30Days.qty ?? 0,
            sub: `${dash?.summary.within30Days.lots ?? 0} lots${dash?.summary.nearExpiryValue != null ? ` · LKR ${formatNumber(dash.summary.nearExpiryValue)}` : ""}`,
            tone: "text-orange-600",
            bg: "bg-orange-500/10",
          },
          {
            label: "Matched SKUs",
            value: reconcile?.summary.matched ?? 0,
            sub: `${reconcile?.summary.totalSkus ?? 0} total`,
            tone: "text-emerald-600",
            bg: "bg-emerald-500/10",
          },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className={`inline-flex p-2 rounded-lg ${s.bg} mb-2`}>
                <AlertTriangle className={`h-4 w-4 ${s.tone}`} />
              </div>
              <p className={`text-2xl font-bold ${s.tone}`}>{formatNumber(s.value)}</p>
              <p className="text-xs font-medium">{s.label}</p>
              <p className="text-[10px] text-muted-foreground">{s.sub}</p>
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
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (dash?.urgent?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No lots expiring within 30 days.</p>
          ) : (
            <LotTable rows={dash!.urgent} />
          )}
        </TabsContent>

        <TabsContent value="near" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : nearRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No near-expiry lots in the next 30 days.</p>
          ) : (
            <LotTable rows={nearRows} />
          )}
        </TabsContent>

        <TabsContent value="expired" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : expiredRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No expired lots on hand.</p>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Expired stock is blocked at POS when Block Expired is ON. Use Damage / adjustment to dispose.
              </p>
              <LotTable rows={expiredRows} />
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4 space-y-3">
          <Input
            placeholder="Filter by batch, SKU, or product…"
            value={batchFilter}
            onChange={(e) => setBatchFilter(e.target.value)}
            className="max-w-sm h-9"
          />
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <LotTable rows={filtered} />
          )}
        </TabsContent>

        <TabsContent value="ledger" className="mt-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    {["When", "Product", "Type", "Qty Δ", "Batch", "Notes"].map((h) => (
                      <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txns.length === 0 ? (
                    <tr><td colSpan={6} className="px-3 py-8 text-center text-muted-foreground text-sm">No batch transactions yet</td></tr>
                  ) : txns.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(t.createdAt).toLocaleString("en-LK")}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        <p className="font-medium">{t.variant.product.name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{t.variant.sku}</p>
                      </td>
                      <td className="px-3 py-2.5 text-xs font-semibold">{t.movementType}</td>
                      <td className={`px-3 py-2.5 text-xs font-bold ${t.quantityChange < 0 ? "text-red-600" : "text-emerald-600"}`}>
                        {t.quantityChange > 0 ? `+${t.quantityChange}` : t.quantityChange}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">{t.batchNumber ?? t.lot?.batchNumber ?? "—"}</td>
                      <td className="px-3 py-2.5 text-[10px] text-muted-foreground">{t.notes ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="reconcile" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Compare branch on-hand vs sum of lot quantities. LOT_SHORT / NO_LOTS can be synced into an UNLOTTED-SYNC lot without changing on-hand.
            </p>
            <Button size="sm" onClick={syncUnlotted} disabled={syncing} className="gap-1.5">
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
              Sync Unlotted → Lots
            </Button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Matched", val: reconcile?.summary.matched ?? 0 },
              { label: "Lot short", val: reconcile?.summary.lotShort ?? 0 },
              { label: "Lot over", val: reconcile?.summary.lotOver ?? 0 },
              { label: "No lots", val: reconcile?.summary.noLots ?? 0 },
            ].map((k) => (
              <Card key={k.label}>
                <CardContent className="p-3">
                  <p className="text-xl font-bold">{k.val}</p>
                  <p className="text-[10px] text-muted-foreground">{k.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  {["Product", "SKU", "On hand", "Lot qty", "Δ", "Status"].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(reconcile?.mismatches ?? []).length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-sm text-emerald-600 font-medium">All SKUs reconciled</td></tr>
                ) : (reconcile?.mismatches ?? []).map((r) => (
                  <tr key={`${r.branchId}:${r.variantId}`} className="border-t">
                    <td className="px-3 py-2.5 text-xs font-medium">{r.name ?? "—"}</td>
                    <td className="px-3 py-2.5 font-mono text-xs">{r.sku ?? "—"}</td>
                    <td className="px-3 py-2.5 text-xs font-bold">{r.inventoryQty}</td>
                    <td className="px-3 py-2.5 text-xs">{r.lotQty}</td>
                    <td className="px-3 py-2.5 text-xs font-semibold">{r.delta}</td>
                    <td className="px-3 py-2.5"><Badge variant="warning" className="text-[10px]">{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LotTable({ rows }: { rows: LotRow[] }) {
  return (
    <div className="rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr>
            {["Product", "SKU", "Batch", "MFD", "Expiry", "Qty", "Avail", "Value", "Status"].map((h) => (
              <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((lot) => (
            <tr key={lot.id} className="border-t">
              <td className="px-3 py-2.5">
                <p className="font-medium text-xs">{lot.variant.product.name}</p>
                <p className="text-[10px] text-muted-foreground">{lot.variant.name}</p>
              </td>
              <td className="px-3 py-2.5 font-mono text-xs">{lot.variant.sku}</td>
              <td className="px-3 py-2.5 font-mono text-xs">{lot.batchNumber ?? "—"}</td>
              <td className="px-3 py-2.5 text-xs">
                {lot.manufactureDate ? new Date(lot.manufactureDate).toLocaleDateString("en-LK") : "—"}
              </td>
              <td className="px-3 py-2.5 text-xs">
                {lot.expiryDate ? new Date(lot.expiryDate).toLocaleDateString("en-LK") : "—"}
                {lot.daysToExpiry != null && (
                  <span className="block text-[10px] text-muted-foreground">
                    {lot.daysToExpiry < 0 ? `${Math.abs(lot.daysToExpiry)}d overdue` : `${lot.daysToExpiry}d left`}
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 font-bold">{lot.quantity}</td>
              <td className="px-3 py-2.5 text-emerald-600 font-semibold">{lot.availableQty}</td>
              <td className="px-3 py-2.5 text-xs">
                LKR {formatNumber(lot.value ?? lot.quantity * (lot.unitCost || 0))}
              </td>
              <td className="px-3 py-2.5">{bucketBadge(lot.expiryBucket, lot.daysToExpiry)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
