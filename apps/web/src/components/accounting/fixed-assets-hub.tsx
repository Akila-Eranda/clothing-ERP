"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, CalendarRange, Loader2, Plus, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type Tab = "list" | "schedule";

type Category = { id: string; code: string; name: string; usefulLifeMonths: number; method: string };

type Asset = {
  id: string;
  code: string;
  name: string;
  status: string;
  cost: number;
  residualValue: number;
  accumulatedDep: number;
  bookValue: number;
  usefulLifeMonths: number;
  method: string;
  acquisitionDate: string;
  location?: string | null;
  category?: { id: string; code: string; name: string } | null;
};

type Summary = {
  totalAssets: number;
  activeCount: number;
  disposedCount: number;
  totalCost: number;
  totalAccumDep: number;
  totalBookValue: number;
};

type ScheduleRow = {
  periodIndex: number;
  periodLabel: string;
  depreciation: number;
  accumulated: number;
  bookValue: number;
  posted: boolean;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(d?: string | null) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

export function FixedAssetsHub({ initialTab = "list" }: { initialTab?: Tab }) {
  useShopWorkspace();
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const tabs: { id: Tab; label: string; icon: typeof Building2 }[] = [
    { id: "list", label: "Asset List", icon: Building2 },
    { id: "schedule", label: "Depreciation Schedule", icon: CalendarRange },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Fixed Assets</h1>
        <p className="text-sm text-muted-foreground">
          Asset register, monthly depreciation, disposal, and transfers — posts to Chart of Accounts
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-px">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "list" && <AssetListPanel onOpenSchedule={() => setTab("schedule")} />}
      {tab === "schedule" && <SchedulePanel />}
    </div>
  );
}

function AssetListPanel({ onOpenSchedule }: { onOpenSchedule: () => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [cost, setCost] = useState("");
  const [acqDate, setAcqDate] = useState(today());
  const [life, setLife] = useState("60");
  const [categoryId, setCategoryId] = useState("");
  const [location, setLocation] = useState("");

  const [disposeId, setDisposeId] = useState<string | null>(null);
  const [proceeds, setProceeds] = useState("0");
  const [transferId, setTransferId] = useState<string | null>(null);
  const [toLocation, setToLocation] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = statusFilter !== "ALL" ? `?status=${statusFilter}` : "";
      const [aRes, cRes, sRes] = await Promise.all([
        api.get<Asset[]>(`/accounting/fixed-assets${q}`),
        api.get<Category[]>("/accounting/fixed-assets/categories"),
        api.get<Summary>("/accounting/fixed-assets/summary"),
      ]);
      setAssets(Array.isArray(aRes.data) ? aRes.data : []);
      setCategories(Array.isArray(cRes.data) ? cRes.data : []);
      setSummary(sRes.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load assets");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const seedCats = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ message?: string }>("/accounting/fixed-assets/categories/seed-defaults");
      toast.success(res.data?.message ?? "Categories seeded");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setBusy(false);
    }
  };

  const create = async () => {
    if (!code || !name || !cost) {
      toast.error("Code, name, and cost required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/accounting/fixed-assets", {
        code,
        name,
        cost: parseFloat(cost),
        acquisitionDate: acqDate,
        usefulLifeMonths: parseInt(life, 10) || 60,
        categoryId: categoryId || undefined,
        location: location || undefined,
        postAcquisitionJournal: true,
      });
      toast.success("Asset registered");
      setCode("");
      setName("");
      setCost("");
      setLocation("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const dispose = async () => {
    if (!disposeId) return;
    setBusy(true);
    try {
      await api.post(`/accounting/fixed-assets/${disposeId}/dispose`, {
        proceeds: parseFloat(proceeds) || 0,
        postToGl: true,
      });
      toast.success("Asset disposed");
      setDisposeId(null);
      setProceeds("0");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Dispose failed");
    } finally {
      setBusy(false);
    }
  };

  const transfer = async () => {
    if (!transferId || !toLocation.trim()) {
      toast.error("Location required");
      return;
    }
    setBusy(true);
    try {
      await api.post(`/accounting/fixed-assets/${transferId}/transfer`, {
        toLocation: toLocation.trim(),
      });
      toast.success("Asset transferred");
      setTransferId(null);
      setToLocation("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Active assets", value: String(summary.activeCount) },
            { label: "Total cost", value: `LKR ${formatNumber(summary.totalCost)}` },
            { label: "Accum. depreciation", value: `LKR ${formatNumber(summary.totalAccumDep)}` },
            { label: "Net book value", value: `LKR ${formatNumber(summary.totalBookValue)}` },
          ].map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase text-muted-foreground">{c.label}</p>
                <p className="text-xl font-bold tabular-nums mt-1">{c.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 justify-between">
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="FULLY_DEPRECIATED">Fully depreciated</SelectItem>
              <SelectItem value="DISPOSED">Disposed</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" className="h-9" disabled={busy} onClick={() => void seedCats()}>
            Seed categories
          </Button>
          <Button size="sm" className="h-9" variant="outline" onClick={onOpenSchedule}>
            Depreciation
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Plus className="h-4 w-4" /> Register asset
          </h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <Input className="h-9" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
            <Input className="h-9" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Input className="h-9" type="number" placeholder="Cost" value={cost} onChange={(e) => setCost(e.target.value)} />
            <Input className="h-9" type="date" value={acqDate} onChange={(e) => setAcqDate(e.target.value)} />
            <Input className="h-9" type="number" placeholder="Life (months)" value={life} onChange={(e) => setLife(e.target.value)} />
            <Input className="h-9" placeholder="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
            <Select value={categoryId || "__none"} onValueChange={(v) => setCategoryId(v === "__none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">No category</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="sm" className="h-9 gap-1.5" disabled={busy} onClick={() => void create()}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Register
            </Button>
          </div>
        </CardContent>
      </Card>

      {(disposeId || transferId) && (
        <Card>
          <CardContent className="p-4 flex flex-wrap items-end gap-3">
            {disposeId && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Disposal proceeds</Label>
                  <Input className="h-9 w-40" type="number" value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
                </div>
                <Button size="sm" className="h-9" disabled={busy} onClick={() => void dispose()}>Confirm dispose</Button>
                <Button size="sm" variant="ghost" className="h-9" onClick={() => setDisposeId(null)}>Cancel</Button>
              </>
            )}
            {transferId && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">New location</Label>
                  <Input className="h-9 w-56" value={toLocation} onChange={(e) => setToLocation(e.target.value)} />
                </div>
                <Button size="sm" className="h-9" disabled={busy} onClick={() => void transfer()}>Confirm transfer</Button>
                <Button size="sm" variant="ghost" className="h-9" onClick={() => setTransferId(null)}>Cancel</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Name</th>
                  <th className="text-left px-4 py-3">Acquired</th>
                  <th className="text-right px-4 py-3">Cost</th>
                  <th className="text-right px-4 py-3">Accum Dep</th>
                  <th className="text-right px-4 py-3">Book Value</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-b border-border/40">
                    <td className="px-4 py-2.5 font-mono text-xs">{a.code}</td>
                    <td className="px-4 py-2.5">
                      {a.name}
                      {a.location && <span className="text-xs text-muted-foreground ml-1">({a.location})</span>}
                    </td>
                    <td className="px-4 py-2.5">{fmt(a.acquisitionDate)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(a.cost)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(a.accumulatedDep)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(a.bookValue)}</td>
                    <td className="px-4 py-2.5"><Badge className="text-[10px]">{a.status}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {a.status !== "DISPOSED" && (
                          <>
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => { setTransferId(a.id); setDisposeId(null); setToLocation(a.location || ""); }}>
                              Transfer
                            </Button>
                            <Button variant="outline" size="sm" className="h-8" onClick={() => { setDisposeId(a.id); setTransferId(null); }}>
                              Dispose
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!assets.length && (
                  <tr>
                    <td colSpan={8} className="text-center text-muted-foreground py-10">No fixed assets yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SchedulePanel() {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetId, setAssetId] = useState("");
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [assetMeta, setAssetMeta] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));

  const loadAssets = useCallback(async () => {
    try {
      const res = await api.get<Asset[]>("/accounting/fixed-assets?status=ACTIVE");
      const list = Array.isArray(res.data) ? res.data : [];
      setAssets(list);
      if (!assetId && list.length) setAssetId(list[0].id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load assets");
    }
  }, [assetId]);

  const loadSchedule = useCallback(async () => {
    if (!assetId) {
      setRows([]);
      setAssetMeta(null);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{
        asset: Asset;
        schedule: ScheduleRow[];
      }>(`/accounting/fixed-assets/${assetId}/schedule`);
      setAssetMeta(res.data?.asset ?? null);
      setRows(Array.isArray(res.data?.schedule) ? res.data.schedule : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load schedule");
    } finally {
      setLoading(false);
    }
  }, [assetId]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  const runDep = async () => {
    setBusy(true);
    try {
      const res = await api.post<{
        periodLabel: string;
        postedCount: number;
        totalAmount: number;
      }>("/accounting/fixed-assets/depreciation/run", {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        assetIds: assetId ? [assetId] : undefined,
        postToGl: true,
      });
      toast.success(
        `Posted ${res.data?.postedCount ?? 0} for ${res.data?.periodLabel} · LKR ${formatNumber(res.data?.totalAmount ?? 0)}`,
      );
      await loadAssets();
      await loadSchedule();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Depreciation run failed");
    } finally {
      setBusy(false);
    }
  };

  const runAll = async () => {
    setBusy(true);
    try {
      const res = await api.post<{
        periodLabel: string;
        postedCount: number;
        totalAmount: number;
      }>("/accounting/fixed-assets/depreciation/run", {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        postToGl: true,
      });
      toast.success(
        `All assets: ${res.data?.postedCount ?? 0} posted · LKR ${formatNumber(res.data?.totalAmount ?? 0)}`,
      );
      await loadAssets();
      await loadSchedule();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Depreciation run failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Asset</Label>
            <Select value={assetId} onValueChange={setAssetId}>
              <SelectTrigger className="h-9 w-64"><SelectValue placeholder="Select asset" /></SelectTrigger>
              <SelectContent>
                {assets.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Year</Label>
            <Input className="h-9 w-24" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Month</Label>
            <Input className="h-9 w-20" type="number" min={1} max={12} value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button size="sm" className="h-9" disabled={busy || !assetId} onClick={() => void runDep()}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Post this asset
          </Button>
          <Button size="sm" variant="secondary" className="h-9" disabled={busy} onClick={() => void runAll()}>
            Post all assets
          </Button>
        </CardContent>
      </Card>

      {assetMeta && (
        <div className="grid sm:grid-cols-4 gap-3">
          {[
            { label: "Cost", value: assetMeta.cost },
            { label: "Accum. dep", value: assetMeta.accumulatedDep },
            { label: "Book value", value: assetMeta.bookValue },
            { label: "Life (mo)", value: assetMeta.usefulLifeMonths },
          ].map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase text-muted-foreground">{c.label}</p>
                <p className="text-lg font-bold tabular-nums mt-1">
                  {typeof c.value === "number" && c.label !== "Life (mo)"
                    ? `LKR ${formatNumber(c.value)}`
                    : c.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Period</th>
                  <th className="text-right px-4 py-3">Depreciation</th>
                  <th className="text-right px-4 py-3">Accumulated</th>
                  <th className="text-right px-4 py-3">Book Value</th>
                  <th className="text-left px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.periodLabel} className="border-b border-border/40">
                    <td className="px-4 py-2.5 tabular-nums">{r.periodIndex}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{r.periodLabel}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.depreciation)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.accumulated)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(r.bookValue)}</td>
                    <td className="px-4 py-2.5">
                      <Badge className={`text-[10px] ${r.posted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                        {r.posted ? "Posted" : "Projected"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-10">
                      {assetId ? "No schedule" : "Select an asset"}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
