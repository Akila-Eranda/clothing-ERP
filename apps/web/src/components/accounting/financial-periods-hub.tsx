"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarRange, CheckCircle2, Loader2, Lock, Plus, RefreshCw, Settings2,
  ShieldCheck, Unlock, AlertTriangle,
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

type PeriodStatus = "OPEN" | "CLOSED" | "LOCKED";
type FyStatus = "OPEN" | "CLOSED";

type Period = {
  id: string;
  name: string;
  sequence: number;
  startDate: string;
  endDate: string;
  status: PeriodStatus;
  closedAt?: string | null;
  notes?: string | null;
};

type FiscalYear = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: FyStatus;
  isCurrent: boolean;
  retainedEarningsAccountId?: string | null;
  closingNotes?: string | null;
  periods: Period[];
};

type EquityAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
};

type YearEndPreview = {
  rules: { ok: boolean; reasons: string[]; openPeriodNames: string[] };
  retainedEarningsAccount: { id: string; code: string; name: string } | null;
  closing: {
    revenueTotal: number;
    expenseTotal: number;
    netIncome: number;
    description: string;
  };
};

type Tab = "periods" | "settings";

function fmt(d?: string | null) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function statusBadge(status: string) {
  if (status === "OPEN") {
    return <Badge className="text-[10px] gap-1"><Unlock className="h-3 w-3" /> Open</Badge>;
  }
  if (status === "LOCKED") {
    return <Badge variant="secondary" className="text-[10px] gap-1"><ShieldCheck className="h-3 w-3" /> Locked</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] gap-1"><Lock className="h-3 w-3" /> Closed</Badge>;
}

export function FinancialPeriodsHub() {
  const { profile } = useShopWorkspace();
  const [tab, setTab] = useState<Tab>("periods");
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [equityAccounts, setEquityAccounts] = useState<EquityAccount[]>([]);

  // Create FY form
  const [showCreate, setShowCreate] = useState(false);
  const [fyName, setFyName] = useState(`${new Date().getFullYear()}`);
  const [fyStart, setFyStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [fyEnd, setFyEnd] = useState(`${new Date().getFullYear()}-12-31`);

  // Settings form
  const [editName, setEditName] = useState("");
  const [editReId, setEditReId] = useState("");

  const selected = useMemo(
    () => years.find((y) => y.id === selectedId) ?? years[0] ?? null,
    [years, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [fyRes, coaRes] = await Promise.all([
        api.get<FiscalYear[]>("/accounting/fiscal-years"),
        api.get<{ data?: EquityAccount[] } | EquityAccount[]>("/accounting/accounts?flat=true"),
      ]);
      const list = Array.isArray(fyRes.data) ? fyRes.data : [];
      setYears(list);
      setSelectedId((prev) => {
        if (prev && list.some((y) => y.id === prev)) return prev;
        return (list.find((y) => y.isCurrent) ?? list[0])?.id ?? "";
      });

      const raw = coaRes.data;
      const nodes = Array.isArray(raw) ? raw : ((raw as { data?: EquityAccount[] })?.data ?? []);
      setEquityAccounts(nodes.filter((n) => n.type === "EQUITY"));
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load periods");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditReId(selected.retainedEarningsAccountId ?? "");
    setPreview(null);
  }, [selected]);

  const createFy = async () => {
    if (!fyName.trim() || !fyStart || !fyEnd) {
      toast.error("Name, start and end dates required");
      return;
    }
    setBusy("create");
    try {
      const res = await api.post<FiscalYear>("/accounting/fiscal-years", {
        name: fyName.trim(),
        startDate: fyStart,
        endDate: fyEnd,
        setCurrent: true,
      });
      toast.success(`Fiscal year ${res.data?.name ?? fyName} created`);
      setShowCreate(false);
      await load();
      if (res.data?.id) setSelectedId(res.data.id);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Create failed");
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async () => {
    if (!selected) return;
    setBusy("settings");
    try {
      await api.put(`/accounting/fiscal-years/${selected.id}`, {
        name: editName.trim(),
        setCurrent: true,
        retainedEarningsAccountId: editReId || null,
      });
      toast.success("Fiscal year settings saved");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Save failed");
    } finally {
      setBusy(null);
    }
  };

  const togglePeriod = async (p: Period, close: boolean) => {
    setBusy(p.id);
    try {
      if (close) {
        await api.post(`/accounting/periods/${p.id}/close`, {});
        toast.success(`${p.name} closed`);
      } else {
        await api.post(`/accounting/periods/${p.id}/reopen`, {});
        toast.success(`${p.name} reopened`);
      }
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Period update failed");
    } finally {
      setBusy(null);
    }
  };

  const closeAllPeriods = async () => {
    if (!selected) return;
    if (!window.confirm(`Close all open periods in ${selected.name}?`)) return;
    setBusy("close-all");
    try {
      const res = await api.post<{ closed: number }>(`/accounting/fiscal-years/${selected.id}/close-periods`, {});
      toast.success(`Closed ${res.data?.closed ?? 0} period(s)`);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed");
    } finally {
      setBusy(null);
    }
  };

  const loadPreview = async () => {
    if (!selected) return;
    setBusy("preview");
    try {
      const res = await api.get<YearEndPreview>(`/accounting/fiscal-years/${selected.id}/year-end-preview`);
      setPreview(res.data ?? null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Preview failed");
    } finally {
      setBusy(null);
    }
  };

  const runYearEndClose = async () => {
    if (!selected) return;
    const auto = preview?.rules.openPeriodNames?.length
      ? window.confirm("Some periods are still open. Auto-close them and continue year-end?")
      : window.confirm(`Close fiscal year ${selected.name}? This locks periods and posts closing journal.`);
    if (!auto) return;
    setBusy("year-end");
    try {
      const res = await api.post<{ entryNumber?: string | null }>(
        `/accounting/fiscal-years/${selected.id}/close`,
        {
          autoClosePeriods: !!preview?.rules.openPeriodNames?.length,
          notes: "Year-end close from Periods UI",
        },
      );
      toast.success(
        res.data?.entryNumber
          ? `Year closed · Journal ${res.data.entryNumber}`
          : "Fiscal year closed",
      );
      setPreview(null);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Year-end close failed");
    } finally {
      setBusy(null);
    }
  };

  const openCount = selected?.periods.filter((p) => p.status === "OPEN").length ?? 0;
  const closedCount = selected?.periods.filter((p) => p.status !== "OPEN").length ?? 0;

  return (
    <div className="p-6 space-y-5 max-w-[1200px] mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarRange className="h-6 w-6 text-primary" />
            Financial Periods
          </h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · Phase 01 Sprint 2 · Fiscal years, open/close, year-end
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="h-3.5 w-3.5" /> New Fiscal Year
          </Button>
        </div>
      </div>

      <div className="flex gap-2 border-b">
        <button
          type="button"
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${
            tab === "periods" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("periods")}
        >
          Period Management
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px inline-flex items-center gap-1.5 ${
            tab === "settings" ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
          }`}
          onClick={() => setTab("settings")}
        >
          <Settings2 className="h-3.5 w-3.5" /> Fiscal Year Settings
        </button>
      </div>

      {loading && !years.length ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !years.length ? (
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">No fiscal year yet. Create one to generate 12 monthly periods.</p>
            <Button onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Create Fiscal Year
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 min-w-[220px]">
              <Label className="text-xs">Fiscal year</Label>
              <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.id} value={y.id}>
                      {y.name}{y.isCurrent ? " (current)" : ""} · {y.status}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected && (
              <div className="flex gap-2 items-center text-xs text-muted-foreground pb-1">
                <span>{fmt(selected.startDate)} → {fmt(selected.endDate)}</span>
                {statusBadge(selected.status)}
                {selected.isCurrent && <Badge className="text-[10px] gap-1"><CheckCircle2 className="h-3 w-3" /> Current</Badge>}
              </div>
            )}
          </div>

          {tab === "periods" && selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Open periods</p><p className="text-xl font-bold">{openCount}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Closed / locked</p><p className="text-xl font-bold">{closedCount}</p></CardContent></Card>
                <Card><CardContent className="p-3"><p className="text-[10px] text-muted-foreground">Total</p><p className="text-xl font-bold">{selected.periods.length}</p></CardContent></Card>
                <Card>
                  <CardContent className="p-3 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Bulk</p>
                      <p className="text-xs font-semibold">Close all open</p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={selected.status === "CLOSED" || openCount === 0 || busy === "close-all"}
                      onClick={closeAllPeriods}
                    >
                      {busy === "close-all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="p-0">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b bg-muted/30 text-[10px] font-semibold uppercase text-muted-foreground">
                    <span className="col-span-1">#</span>
                    <span className="col-span-4">Period</span>
                    <span className="col-span-3">Range</span>
                    <span className="col-span-2">Status</span>
                    <span className="col-span-2 text-right">Action</span>
                  </div>
                  <div className="divide-y">
                    {selected.periods.map((p) => (
                      <div key={p.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2.5 text-sm">
                        <span className="col-span-1 text-xs text-muted-foreground">{p.sequence}</span>
                        <span className="col-span-4 font-medium">{p.name}</span>
                        <span className="col-span-3 text-xs font-mono text-muted-foreground">
                          {fmt(p.startDate)} → {fmt(p.endDate)}
                        </span>
                        <span className="col-span-2">{statusBadge(p.status)}</span>
                        <div className="col-span-2 flex justify-end">
                          {selected.status === "CLOSED" || p.status === "LOCKED" ? (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          ) : p.status === "OPEN" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              disabled={busy === p.id}
                              onClick={() => togglePeriod(p, true)}
                            >
                              {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Lock className="h-3 w-3" />}
                              Close
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              disabled={busy === p.id}
                              onClick={() => togglePeriod(p, false)}
                            >
                              {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Unlock className="h-3 w-3" />}
                              Reopen
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {selected.status === "OPEN" && (
                <Card>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-sm font-semibold">Year-end closing</h3>
                        <p className="text-xs text-muted-foreground">
                          Close P&amp;L into Retained Earnings and lock all periods
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" disabled={busy === "preview"} onClick={loadPreview}>
                          {busy === "preview" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Preview rules
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={busy === "year-end"}
                          onClick={runYearEndClose}
                        >
                          {busy === "year-end" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                          Close year
                        </Button>
                      </div>
                    </div>
                    {preview && (
                      <div className="rounded-xl border p-3 space-y-2 text-sm">
                        {preview.rules.ok ? (
                          <p className="text-emerald-600 text-xs font-semibold flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Ready for year-end close
                          </p>
                        ) : (
                          <div className="text-amber-600 text-xs space-y-1">
                            <p className="font-semibold flex items-center gap-1">
                              <AlertTriangle className="h-3.5 w-3.5" /> Not ready
                            </p>
                            {preview.rules.reasons.map((r) => (
                              <p key={r}>• {r}</p>
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>Revenue: <b>LKR {formatNumber(preview.closing.revenueTotal)}</b></div>
                          <div>Expenses: <b>LKR {formatNumber(preview.closing.expenseTotal)}</b></div>
                          <div>Net income: <b className={preview.closing.netIncome < 0 ? "text-red-500" : "text-emerald-600"}>
                            LKR {formatNumber(preview.closing.netIncome)}
                          </b></div>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          RE account: {preview.retainedEarningsAccount
                            ? `${preview.retainedEarningsAccount.code} — ${preview.retainedEarningsAccount.name}`
                            : "Not found — seed COA or set in Settings"}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {tab === "settings" && selected && (
            <Card>
              <CardContent className="p-5 space-y-4 max-w-xl">
                <div className="space-y-1">
                  <Label className="text-xs">Fiscal year name</Label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    disabled={selected.status === "CLOSED"}
                    className="h-9"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input value={fmt(selected.startDate)} disabled className="h-9 font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End</Label>
                    <Input value={fmt(selected.endDate)} disabled className="h-9 font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Retained Earnings account (year-end)</Label>
                  <Select value={editReId || "__auto__"} onValueChange={(v) => setEditReId(v === "__auto__" ? "" : v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Auto (3100 / name match)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__auto__">Auto-detect (code 3100)</SelectItem>
                      {equityAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[10px] text-muted-foreground">
                    Used when closing the year to transfer net income from Income / Expense accounts.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {statusBadge(selected.status)}
                  <span>Dates are fixed after create. Set this year as current when saving.</span>
                </div>
                <Button onClick={saveSettings} disabled={busy === "settings"} className="gap-1.5">
                  {busy === "settings" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Save settings
                </Button>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && busy !== "create") setShowCreate(false); }}
        >
          <div className="bg-background rounded-2xl border shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-base font-bold">New Fiscal Year</h2>
              <p className="text-xs text-muted-foreground">Creates 12 monthly accounting periods automatically</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={fyName} onChange={(e) => setFyName(e.target.value)} className="h-9" placeholder="FY 2026" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Start date</Label>
                  <Input type="date" value={fyStart} onChange={(e) => setFyStart(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">End date</Label>
                  <Input type="date" value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} className="h-9" />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Tip: Apr–Mar year → start 2025-04-01, end 2026-03-31
              </p>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-muted/10">
              <Button variant="outline" size="sm" disabled={busy === "create"} onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy === "create"} onClick={createFy} className="gap-1.5">
                {busy === "create" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
