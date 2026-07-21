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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
    return <Badge className="text-[10px] gap-1 rounded-full"><Unlock className="h-3 w-3" /> Open</Badge>;
  }
  if (status === "LOCKED") {
    return <Badge variant="secondary" className="text-[10px] gap-1 rounded-full"><ShieldCheck className="h-3 w-3" /> Locked</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] gap-1 rounded-full"><Lock className="h-3 w-3" /> Closed</Badge>;
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

  const runYearEndReopen = async () => {
    if (!selected) return;
    if (!window.confirm(`Reopen fiscal year ${selected.name}? This reverses the year-end closing journal.`)) {
      return;
    }
    setBusy("year-reopen");
    try {
      await api.post(`/accounting/fiscal-years/${selected.id}/reopen`, {
        notes: "Year-end reopen from Periods UI",
      });
      toast.success("Fiscal year reopened · closing journal reversed");
      setPreview(null);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Year reopen failed");
    } finally {
      setBusy(null);
    }
  };

  const openCount = selected?.periods.filter((p) => p.status === "OPEN").length ?? 0;
  const closedCount = selected?.periods.filter((p) => p.status !== "OPEN").length ?? 0;

  return (
    <div className="page-shell w-full">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Financial Periods</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {profile.label} · Fiscal years · open / close periods · year-end close
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button variant="outline" onClick={load} className="h-10 rounded-[12px] gap-1.5 text-sm px-3.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button className="h-10 rounded-[12px] gap-1.5 text-sm px-4" onClick={() => setShowCreate(true)}>
            <Plus className="h-[18px] w-[18px]" /> New Fiscal Year
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1 rounded-[14px] border bg-muted/40 w-fit max-w-full">
        {([
          { id: "periods" as Tab, label: "Period Management", icon: CalendarRange },
          { id: "settings" as Tab, label: "Fiscal Year Settings", icon: Settings2 },
        ]).map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-[10px] text-sm font-semibold transition-all ${
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && !years.length ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !years.length ? (
        <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
          <CardContent className="p-12 text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-[14px] bg-blue-500/15 text-blue-600 flex items-center justify-center">
              <CalendarRange className="h-6 w-6" />
            </div>
            <p className="text-sm text-muted-foreground">No fiscal year yet. Create one to generate 12 monthly periods.</p>
            <Button onClick={() => setShowCreate(true)} className="h-10 rounded-[12px] gap-1.5">
              <Plus className="h-[18px] w-[18px]" /> Create Fiscal Year
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 min-w-[240px]">
              <Label className="text-xs">Fiscal year</Label>
              <Select value={selected?.id ?? ""} onValueChange={setSelectedId}>
                <SelectTrigger className="h-10 rounded-[12px]"><SelectValue /></SelectTrigger>
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
              <div className="flex gap-2 items-center text-xs text-muted-foreground pb-1.5 flex-wrap">
                <span className="font-mono">{fmt(selected.startDate)} → {fmt(selected.endDate)}</span>
                {statusBadge(selected.status)}
                {selected.isCurrent && (
                  <Badge className="text-[10px] gap-1 rounded-full">
                    <CheckCircle2 className="h-3 w-3" /> Current
                  </Badge>
                )}
              </div>
            )}
          </div>

          {tab === "periods" && selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                <Card className="rounded-[18px] border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent">
                  <CardContent className="h-[72px] p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-[12px] bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <Unlock className="h-[18px] w-[18px] text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-none tabular-nums">{openCount}</p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-1">Open periods</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[18px] border-amber-200/70 bg-gradient-to-br from-amber-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent">
                  <CardContent className="h-[72px] p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-[12px] bg-amber-500/15 flex items-center justify-center shrink-0">
                      <Lock className="h-[18px] w-[18px] text-amber-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-none tabular-nums">{closedCount}</p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-1">Closed / locked</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[18px] border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-transparent">
                  <CardContent className="h-[72px] p-4 flex items-center gap-3">
                    <div className="h-9 w-9 rounded-[12px] bg-indigo-500/15 flex items-center justify-center shrink-0">
                      <CalendarRange className="h-[18px] w-[18px] text-indigo-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-none tabular-nums">{selected.periods.length}</p>
                      <p className="text-[11px] text-muted-foreground font-medium mt-1">Total periods</p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="rounded-[18px] border-slate-200/70 bg-gradient-to-br from-slate-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-slate-500/20 dark:from-slate-500/10 dark:to-transparent">
                  <CardContent className="h-[72px] p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] text-muted-foreground font-medium">Bulk action</p>
                      <p className="text-sm font-semibold mt-0.5">Close all open</p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-10 w-10 rounded-[12px] p-0 shrink-0"
                      disabled={selected.status === "CLOSED" || openCount === 0 || busy === "close-all"}
                      onClick={closeAllPeriods}
                    >
                      {busy === "close-all" ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Lock className="h-[18px] w-[18px]" />}
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <Card className="rounded-[18px] overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
                  <div className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-[10px] bg-blue-500/15 text-blue-600 flex items-center justify-center">
                      <CalendarRange className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold">Monthly periods</h3>
                  </div>
                  <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-[11px] font-semibold">
                    {selected.periods.length}
                  </Badge>
                </div>
                <CardContent className="p-0">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 border-b bg-muted/20 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <span className="col-span-1">#</span>
                    <span className="col-span-4">Period</span>
                    <span className="col-span-3">Range</span>
                    <span className="col-span-2">Status</span>
                    <span className="col-span-2 text-right">Action</span>
                  </div>
                  <div className="divide-y">
                    {selected.periods.map((p) => (
                      <div key={p.id} className="grid grid-cols-12 gap-2 items-center px-4 py-2.5 text-sm hover:bg-muted/20 transition-colors">
                        <span className="col-span-1 text-xs text-muted-foreground tabular-nums">{p.sequence}</span>
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
                              className="h-8 text-xs gap-1 rounded-[10px]"
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
                              className="h-8 text-xs gap-1 rounded-[10px]"
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

              {selected.status === "CLOSED" && (
                <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
                  <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">Year closed</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Reopen reverses the year-end closing journal and unlocks periods
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      className="h-10 rounded-[12px] gap-1.5"
                      disabled={busy === "year-reopen"}
                      onClick={() => void runYearEndReopen()}
                    >
                      {busy === "year-reopen" ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Unlock className="h-[18px] w-[18px]" />}
                      Reopen year
                    </Button>
                  </CardContent>
                </Card>
              )}

              {selected.status === "OPEN" && (
                <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
                  <div className="flex items-center justify-between flex-wrap gap-3 px-4 py-3 border-b bg-muted/30">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-[10px] bg-red-500/15 text-red-600 flex items-center justify-center shrink-0">
                        <ShieldCheck className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold">Year-end closing</h3>
                        <p className="text-[11px] text-muted-foreground truncate">
                          Close P&amp;L into Retained Earnings and lock all periods
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="h-10 rounded-[12px] gap-1.5" disabled={busy === "preview"} onClick={loadPreview}>
                        {busy === "preview" ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : null}
                        Preview rules
                      </Button>
                      <Button
                        variant="destructive"
                        className="h-10 rounded-[12px] gap-1.5"
                        disabled={busy === "year-end"}
                        onClick={runYearEndClose}
                      >
                        {busy === "year-end" ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : null}
                        Close year
                      </Button>
                    </div>
                  </div>
                  {preview && (
                    <CardContent className="p-4 space-y-3">
                      {preview.rules.ok ? (
                        <p className="text-emerald-600 text-xs font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Ready for year-end close
                        </p>
                      ) : (
                        <div className="text-amber-600 text-xs space-y-1">
                          <p className="font-semibold flex items-center gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5" /> Not ready
                          </p>
                          {preview.rules.reasons.map((r) => (
                            <p key={r}>• {r}</p>
                          ))}
                        </div>
                      )}
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div className="rounded-[14px] border bg-muted/20 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Revenue</p>
                          <p className="text-sm font-bold tabular-nums mt-1">LKR {formatNumber(preview.closing.revenueTotal)}</p>
                        </div>
                        <div className="rounded-[14px] border bg-muted/20 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Expenses</p>
                          <p className="text-sm font-bold tabular-nums mt-1">LKR {formatNumber(preview.closing.expenseTotal)}</p>
                        </div>
                        <div className="rounded-[14px] border bg-muted/20 p-3">
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Net income</p>
                          <p className={`text-sm font-bold tabular-nums mt-1 ${preview.closing.netIncome < 0 ? "text-red-500" : "text-emerald-600"}`}>
                            LKR {formatNumber(preview.closing.netIncome)}
                          </p>
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        RE account: {preview.retainedEarningsAccount
                          ? `${preview.retainedEarningsAccount.code} — ${preview.retainedEarningsAccount.name}`
                          : "Not found — seed COA or set in Settings"}
                      </p>
                    </CardContent>
                  )}
                </Card>
              )}
            </div>
          )}

          {tab === "settings" && selected && (
            <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
              <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/30">
                <div className="h-8 w-8 rounded-[10px] bg-indigo-500/15 text-indigo-600 flex items-center justify-center">
                  <Settings2 className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold">Fiscal year settings</h3>
              </div>
              <CardContent className="p-5 space-y-4">
                <div className="grid lg:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Fiscal year name</Label>
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      disabled={selected.status === "CLOSED"}
                      className="h-10 rounded-[12px]"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Retained Earnings account (year-end)</Label>
                    <Select value={editReId || "__auto__"} onValueChange={(v) => setEditReId(v === "__auto__" ? "" : v)}>
                      <SelectTrigger className="h-10 rounded-[12px]"><SelectValue placeholder="Auto (3100 / name match)" /></SelectTrigger>
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
                  <div className="space-y-1">
                    <Label className="text-xs">Start</Label>
                    <Input value={fmt(selected.startDate)} disabled className="h-10 rounded-[12px] font-mono" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End</Label>
                    <Input value={fmt(selected.endDate)} disabled className="h-10 rounded-[12px] font-mono" />
                  </div>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-3 pt-1">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {statusBadge(selected.status)}
                    <span>Dates are fixed after create. Set this year as current when saving.</span>
                  </div>
                  <Button onClick={saveSettings} disabled={busy === "settings"} className="h-10 rounded-[12px] gap-1.5">
                    {busy === "settings" && <Loader2 className="h-[18px] w-[18px] animate-spin" />}
                    Save settings
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog open={showCreate} onOpenChange={(open) => { if (busy !== "create") setShowCreate(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Fiscal Year</DialogTitle>
            <DialogDescription>Creates 12 monthly accounting periods automatically.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={fyName} onChange={(e) => setFyName(e.target.value)} className="h-9" placeholder="FY 2026" disabled={busy === "create"} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Start date</Label>
                <Input type="date" value={fyStart} onChange={(e) => setFyStart(e.target.value)} className="h-9" disabled={busy === "create"} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">End date</Label>
                <Input type="date" value={fyEnd} onChange={(e) => setFyEnd(e.target.value)} className="h-9" disabled={busy === "create"} />
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Tip: Apr–Mar year → start 2025-04-01, end 2026-03-31
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" disabled={busy === "create"} onClick={createFy} className="gap-1.5">
              {busy === "create" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
