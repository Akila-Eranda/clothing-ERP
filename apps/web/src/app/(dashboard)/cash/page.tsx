"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Banknote, PlayCircle, StopCircle, History, AlertTriangle,
  RefreshCw, Loader2, CheckCircle2, ArrowDownCircle, ArrowUpCircle,
  Clock, DollarSign, Activity, Plus, LayoutDashboard, Zap, Eye,
} from "lucide-react";
import { toast } from "sonner";
import { ColumnDef } from "@tanstack/react-table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { api } from "@/lib/api";
import { formatNumber, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { OpenRecordButton } from "@/components/table/open-record-button";
import { DenominationInput, denominationTotal } from "@/components/cash/denomination-input";
import { CashMovementLedger, type CashMovement } from "@/components/cash/cash-movement-ledger";
import { ShiftDetailSheet } from "@/components/cash/shift-detail-sheet";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval, isWorkflowApproverRole } from "@/lib/workflow-access";

const TABS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "open", label: "Cash Open", icon: PlayCircle },
  { id: "close", label: "Cash Close", icon: StopCircle },
  { id: "movements", label: "Cash In / Out", icon: ArrowUpCircle },
  { id: "history", label: "History", icon: History },
  { id: "variance", label: "Variance", icon: AlertTriangle },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface CashRegister {
  id: string;
  openingCash: number;
  openingTime: string;
  closingTime?: string | null;
  expectedCash?: number | null;
  actualCash?: number | null;
  variance?: number | null;
  status: "OPEN" | "CLOSED" | "PENDING_APPROVAL";
  cashierName?: string;
  denominationCount?: Record<string, number>;
  movements?: CashMovement[];
  summary?: {
    openingCash: number;
    cashSales: number;
    cashReceived: number;
    cashExpenses: number;
    cashRefunds: number;
    expectedCash: number;
  };
  branch?: { name: string };
}

interface TodaySummary {
  from?: string;
  to?: string;
  isToday?: boolean;
  openShifts: number;
  closedToday: number;
  expected: number;
  actual: number;
  difference: number;
  pendingApproval: number;
}

interface OpeningSuggestion {
  suggestedOpening: number | null;
  lastClosedAt: string | null;
  lastVariance: number | null;
  lastOpening: number | null;
}

const VARIANCE_THRESHOLD = 500;
const FLOAT_PRESETS = [5000, 10000, 15000, 20000];
const AUTO_REFRESH_MS = 30_000;

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

const _now = new Date();
const TODAY = isoDate(_now);

const DATE_PRESETS = [
  { label: "Today", from: TODAY, to: TODAY },
  { label: "Yesterday", from: isoDate(new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 1)), to: isoDate(new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 1)) },
  { label: "This Week", from: isoDate(new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - _now.getDay())), to: TODAY },
  { label: "This Month", from: isoDate(new Date(_now.getFullYear(), _now.getMonth(), 1)), to: TODAY },
  { label: "Last 7 Days", from: isoDate(new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 6)), to: TODAY },
  { label: "Last 30 Days", from: isoDate(new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() - 29)), to: TODAY },
];

function formatRangeLabel(from: string, to: string) {
  const fmt = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
  return from === to ? fmt(from) : `${fmt(from)} – ${fmt(to)}`;
}

function statusBadge(status: CashRegister["status"]) {
  if (status === "OPEN") return <Badge variant="success" className="text-[10px]">Open</Badge>;
  if (status === "PENDING_APPROVAL") return <Badge variant="warning" className="text-[10px]">Pending Approval</Badge>;
  return <Badge variant="secondary" className="text-[10px]">Closed</Badge>;
}

export default function CashManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = (searchParams.get("tab") as TabId) || "overview";
  const { user } = useAuthStore();

  const [loading, setLoading] = React.useState(true);
  const [active, setActive] = React.useState<CashRegister | null>(null);
  const [today, setToday] = React.useState<TodaySummary | null>(null);
  const [suggestion, setSuggestion] = React.useState<OpeningSuggestion | null>(null);
  const [openingCash, setOpeningCash] = React.useState("");
  const [openingNotes, setOpeningNotes] = React.useState("");
  const [opening, setOpening] = React.useState(false);
  const [denominations, setDenominations] = React.useState<Record<string, number>>({});
  const [closeNotes, setCloseNotes] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const [history, setHistory] = React.useState<CashRegister[]>([]);
  const [dateRange, setDateRange] = React.useState({ from: TODAY, to: TODAY });
  const [varianceDays, setVarianceDays] = React.useState("30");
  const [varianceReport, setVarianceReport] = React.useState<{
    totalShifts: number;
    totalVariance: number;
    overCount: number;
    shortCount: number;
    pendingApproval: number;
    registers: CashRegister[];
  } | null>(null);
  const [movementType, setMovementType] = React.useState<"DEPOSIT" | "WITHDRAWAL" | "EXPENSE">("DEPOSIT");
  const [movementAmount, setMovementAmount] = React.useState("");
  const [movementDesc, setMovementDesc] = React.useState("");
  const [moving, setMoving] = React.useState(false);
  const [detailShiftId, setDetailShiftId] = React.useState<string | null>(null);
  const [autoRouted, setAutoRouted] = React.useState(false);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);

  const setTab = (id: string) => router.push(`/cash?tab=${id}`);

  const loadActive = React.useCallback(async () => {
    try {
      const res = await api.get<CashRegister | null>("/cash/active");
      setActive(res.data ?? null);
    } catch {
      setActive(null);
    }
  }, []);

  const loadToday = React.useCallback(async () => {
    try {
      const res = await api.get<TodaySummary>(
        `/cash/summary?from=${dateRange.from}&to=${dateRange.to}`,
      );
      setToday(res.data ?? null);
    } catch {
      setToday(null);
    }
  }, [dateRange]);

  const loadSuggestion = React.useCallback(async () => {
    try {
      const res = await api.get<OpeningSuggestion>("/cash/opening-suggestion");
      setSuggestion(res.data ?? null);
    } catch {
      setSuggestion(null);
    }
  }, []);

  const loadHistory = React.useCallback(async () => {
    try {
      const res = await api.get<{ data: CashRegister[] }>(
        `/cash/history?limit=100&from=${dateRange.from}&to=${dateRange.to}`,
      );
      setHistory((res.data as { data?: CashRegister[] })?.data ?? []);
    } catch {
      toast.error("Failed to load cash history");
    }
  }, [dateRange]);

  const loadVariance = React.useCallback(async () => {
    try {
      const useRange = dateRange.from !== TODAY || dateRange.to !== TODAY;
      const url = useRange
        ? `/cash/variance-report?from=${dateRange.from}&to=${dateRange.to}`
        : `/cash/variance-report?days=${varianceDays}`;
      const res = await api.get<typeof varianceReport>(url);
      setVarianceReport(res.data ?? null);
    } catch {
      toast.error("Failed to load variance report");
    }
  }, [dateRange, varianceDays]);

  const refresh = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    await Promise.all([loadActive(), loadToday(), loadSuggestion(), loadHistory(), loadVariance()]);
    setLastRefreshed(new Date());
    if (!silent) setLoading(false);
  }, [loadActive, loadToday, loadSuggestion, loadHistory, loadVariance]);

  React.useEffect(() => { void refresh(); }, [refresh]);

  const isViewingToday = dateRange.from === TODAY && dateRange.to === TODAY;
  const rangeLabel = formatRangeLabel(dateRange.from, dateRange.to);

  const applyPreset = (from: string, to: string) => setDateRange({ from, to });

  // Auto-reload when date filter changes
  React.useEffect(() => {
    void loadToday();
    void loadHistory();
    void loadVariance();
  }, [dateRange, loadToday, loadHistory, loadVariance]);

  // Auto-route to sensible tab on first load
  React.useEffect(() => {
    if (loading || autoRouted) return;
    const urlTab = searchParams.get("tab");
    if (!urlTab) {
      if (active?.status === "OPEN") setTab("overview");
      else if (active?.status === "PENDING_APPROVAL") setTab("variance");
      else setTab("open");
    }
    setAutoRouted(true);
  }, [loading, active, autoRouted, searchParams]);

  // Pre-fill opening float from last shift
  React.useEffect(() => {
    if (suggestion?.suggestedOpening != null && !openingCash && active?.status !== "OPEN") {
      setOpeningCash(String(suggestion.suggestedOpening));
    }
  }, [suggestion, openingCash, active?.status]);

  const shiftOpen = active?.status === "OPEN";
  const shiftPending = active?.status === "PENDING_APPROVAL";
  const canApproveVariance =
    bypassesWorkflowApproval(user?.role)
    || isWorkflowApproverRole(user?.role);

  // Live refresh while shift is open (today only)
  React.useEffect(() => {
    if (!shiftOpen || !isViewingToday) return;
    const id = setInterval(() => {
      void loadActive();
      void loadToday();
      setLastRefreshed(new Date());
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [shiftOpen, isViewingToday, loadActive, loadToday]);

  const handleOpenShift = async () => {
    const amount = parseFloat(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter a valid opening amount");
      return;
    }
    setOpening(true);
    try {
      await api.post("/cash/open", { openingCash: amount, notes: openingNotes || undefined });
      toast.success("Shift started");
      setOpeningCash("");
      setOpeningNotes("");
      await refresh();
      setTab("overview");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to open shift");
    } finally {
      setOpening(false);
    }
  };

  const handleCloseShift = async () => {
    if (!active) return;
    const actual = denominationTotal(denominations);
    if (actual <= 0) {
      toast.error("Enter physical cash count");
      return;
    }
    setClosing(true);
    try {
      const res = await api.post<{ needsApproval?: boolean; variance?: number }>(
        `/cash/${active.id}/close`,
        { actualCash: actual, denominations, notes: closeNotes || undefined },
      );
      const needsApproval = res.data?.needsApproval;
      const variance = res.data?.variance ?? 0;
      if (needsApproval) {
        toast.warning(`Shift closed — variance LKR ${formatNumber(Math.abs(variance))} pending manager approval`);
      } else {
        toast.success("Shift closed successfully");
      }
      setDenominations({});
      setCloseNotes("");
      await refresh();
      setTab("open");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to close shift");
    } finally {
      setClosing(false);
    }
  };

  const handleMovement = async () => {
    if (!active) {
      toast.error("Open a shift first");
      return;
    }
    const amount = parseFloat(movementAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setMoving(true);
    try {
      await api.post(`/cash/${active.id}/movements`, {
        type: movementType,
        amount,
        description: movementDesc || undefined,
      });
      toast.success(movementType === "DEPOSIT" ? "Cash in recorded" : "Cash out recorded");
      setMovementAmount("");
      setMovementDesc("");
      await loadActive();
      await loadToday();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to record movement");
    } finally {
      setMoving(false);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await api.put(`/cash/${id}/approve`);
      toast.success("Variance approved");
      await refresh();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Approval failed");
    }
  };

  const cashierName = active?.cashierName ?? user?.name ?? "Cashier";
  const todayLabel = new Date().toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
  const summary = active?.summary;
  const actualTotal = denominationTotal(denominations);
  const periodExpected = isViewingToday && shiftOpen
    ? (summary?.expectedCash ?? active?.expectedCash ?? today?.expected ?? 0)
    : (today?.expected ?? 0);
  const expected = periodExpected;
  const variancePreview = actualTotal > 0 ? actualTotal - expected : 0;
  const needsApprovalPreview = Math.abs(variancePreview) > VARIANCE_THRESHOLD;
  const movements = active?.movements ?? [];
  const autoSalesTotal = movements.filter((m) => m.type === "SALE").reduce((s, m) => s + m.amount, 0);
  const pendingItems = [
    ...(active?.status === "PENDING_APPROVAL" ? [active] : []),
    ...(varianceReport?.registers.filter((r) => r.status === "PENDING_APPROVAL") ?? []),
  ].filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i);

  const varianceChartData = React.useMemo(() => {
    if (!varianceReport?.registers.length) return [];
    const byDay = new Map<string, number>();
    for (const r of varianceReport.registers) {
      if (!r.closingTime) continue;
      const day = new Date(r.closingTime).toLocaleDateString("en-LK", { day: "2-digit", month: "short" });
      byDay.set(day, (byDay.get(day) ?? 0) + (r.variance ?? 0));
    }
    return Array.from(byDay.entries()).map(([day, variance]) => ({ day, variance })).reverse();
  }, [varianceReport]);

  const KPI = [
    {
      label: "Shift Status",
      value: isViewingToday && shiftOpen ? "Open" : isViewingToday && shiftPending ? "Pending" : `${today?.closedToday ?? 0} closed`,
      icon: isViewingToday && shiftOpen ? CheckCircle2 : Clock,
      bg: isViewingToday && shiftOpen ? "bg-emerald-600" : isViewingToday && shiftPending ? "bg-amber-500" : "bg-slate-500",
      sub: isViewingToday && shiftOpen
        ? `Opened LKR ${formatNumber(active?.openingCash ?? 0)}`
        : isViewingToday && shiftPending
          ? "Awaiting manager approval"
          : `${today?.openShifts ?? 0} open · ${rangeLabel}`,
    },
    {
      label: "Expected Cash",
      value: `LKR ${formatNumber(periodExpected)}`,
      icon: DollarSign,
      bg: "bg-blue-600",
      sub: isViewingToday && shiftOpen ? "Live · updates from POS" : rangeLabel,
    },
    {
      label: "Cash Difference",
      value: `LKR ${formatNumber(Math.abs(today?.difference ?? 0))}`,
      icon: Activity,
      bg: (today?.difference ?? 0) < 0 ? "bg-red-500" : "bg-teal-600",
      sub: (today?.difference ?? 0) >= 0 ? "Over / balanced" : "Short count",
    },
    {
      label: "Pending Approvals",
      value: String(today?.pendingApproval ?? varianceReport?.pendingApproval ?? 0),
      icon: AlertTriangle,
      bg: "bg-orange-500",
      sub: rangeLabel,
    },
  ];

  const historyColumns: ColumnDef<CashRegister>[] = [
    {
      accessorKey: "cashierName",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Cashier" />,
      cell: ({ row }) => (
        <div>
          <OpenRecordButton
            onClick={() => setDetailShiftId(row.original.id)}
            className="text-sm"
            title="View shift details"
          >
            {row.original.cashierName ?? "Cashier"}
          </OpenRecordButton>
          <p className="text-[10px] text-muted-foreground">{row.original.branch?.name ?? "Branch"}</p>
        </div>
      ),
    },
    {
      id: "opened",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Opened" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.openingTime).toLocaleString("en-LK", {
            day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
          })}
        </span>
      ),
    },
    {
      id: "closed",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Closed" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.closingTime
            ? new Date(row.original.closingTime).toLocaleString("en-LK", {
                day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
              })
            : "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => statusBadge(row.original.status),
    },
    {
      id: "variance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Variance" />,
      cell: ({ row }) => {
        const v = row.original.variance;
        if (v == null) return <span className="text-xs text-muted-foreground">—</span>;
        return (
          <span className={cn("text-sm font-bold tabular-nums", v < 0 ? "text-red-600" : v > 0 ? "text-emerald-600" : "")}>
            {v >= 0 ? "+" : ""}{formatNumber(v)}
          </span>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          showAction={{ action: () => setDetailShiftId(row.original.id), tooltip: "View details" }}
          dropMoreActions={[
            ...(row.original.status === "PENDING_APPROVAL"
              ? [{ text: "Approve variance", function: () => void handleApprove(row.original.id) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Tabs value={tab} onValueChange={setTab} className="w-full">

        {/* Header */}
        <div className="bg-card border-b sticky top-0 z-10">
          <div className="px-6 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="bg-emerald-600 rounded-xl p-2.5 shrink-0">
                <Banknote className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-foreground">Cash Management</h1>
                <p className="text-xs text-muted-foreground truncate">
                  Automated POS tracking · shift control · variance
                  {lastRefreshed && shiftOpen && (
                    <span className="ml-1">· Live {lastRefreshed.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => void refresh()} className="h-9 w-9 p-0">
                <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              </Button>
              {!shiftOpen && !shiftPending && (
                <Button size="sm" className="gap-1.5 h-9 bg-emerald-600 hover:bg-emerald-700" onClick={() => setTab("open")}>
                  <Plus className="h-4 w-4" /> Start Shift
                </Button>
              )}
              {shiftOpen && (
                <Button size="sm" className="gap-1.5 h-9 bg-red-600 hover:bg-red-700" onClick={() => setTab("close")}>
                  <StopCircle className="h-4 w-4" /> Cash Close
                </Button>
              )}
            </div>
          </div>

          <div className="px-6 border-t">
            <TabsList className="h-12 bg-transparent p-0 gap-0 rounded-none border-none w-full justify-start overflow-x-auto">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.id}
                  value={t.id}
                  className="h-12 px-4 rounded-none text-sm font-medium text-muted-foreground border-b-2 border-transparent data-[state=active]:border-emerald-600 data-[state=active]:text-emerald-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-colors gap-1.5"
                >
                  <t.icon className="h-3.5 w-3.5" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        <div className="px-6 py-6 space-y-6">

          {/* Date filter — auto-applies to KPI, history & variance */}
          <div className="bg-card rounded-xl p-3 flex items-center gap-2 flex-wrap  border border-border">
            {DATE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.from, p.to)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-lg border font-medium transition-all",
                  dateRange.from === p.from && dateRange.to === p.to
                    ? "bg-emerald-600 text-white border-emerald-600"
                    : "bg-background text-muted-foreground hover:bg-muted border",
                )}
              >
                {p.label}
              </button>
            ))}
            <div className="w-px h-4 bg-border" />
            <Input
              type="date"
              value={dateRange.from}
              max={dateRange.to}
              onChange={(e) => {
                const from = e.target.value;
                setDateRange((r) => ({ from, to: from > r.to ? from : r.to }));
              }}
              className="h-8 text-xs w-36"
            />
            <span className="text-muted-foreground text-xs">to</span>
            <Input
              type="date"
              value={dateRange.to}
              min={dateRange.from}
              max={TODAY}
              onChange={(e) => setDateRange((r) => ({ ...r, to: e.target.value }))}
              className="h-8 text-xs w-36"
            />
            <span className="ml-auto text-xs text-muted-foreground">
              {history.length} shift{history.length !== 1 ? "s" : ""} · {rangeLabel}
            </span>
          </div>

          {/* Pending approval banner */}
          {pendingItems.length > 0 && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {pendingItems.length} shift{pendingItems.length > 1 ? "s" : ""} pending approval
                  </p>
                  <p className="text-xs text-muted-foreground">Variance exceeds LKR {VARIANCE_THRESHOLD} — manager action required</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canApproveVariance && pendingItems[0] && (
                  <Button
                    size="sm"
                    className="bg-amber-600 hover:bg-amber-700"
                    onClick={() => void handleApprove(pendingItems[0].id)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1.5" />
                    Approve now
                  </Button>
                )}
                <Button size="sm" variant="outline" className="border-amber-500 text-amber-700" onClick={() => setTab("variance")}>
                  Review variances
                </Button>
              </div>
            </div>
          )}

          {/* KPI row */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {loading
              ? Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
                ))
              : KPI.map((kpi) => (
                  <Card key={kpi.label} className="card-hover">
                    <CardContent className="p-5 flex items-center gap-4">
                      <div className={cn(kpi.bg, "rounded-full p-2.5 shrink-0")}>
                        <kpi.icon className="h-5 w-5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground font-medium">{kpi.label}</p>
                        <p className="text-xl font-bold text-foreground truncate">{kpi.value}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{kpi.sub}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
          </div>

          {/* Overview — live shift dashboard */}
          <TabsContent value="overview" className="m-0 mt-0 space-y-4">
            {!shiftOpen ? (
              <Card className="card-hover">
                <CardContent className="py-16 text-center">
                  <LayoutDashboard className="h-12 w-12 mx-auto mb-3 opacity-30 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground mb-4">
                    {shiftPending
                      ? "Previous shift awaiting approval — approve the variance to start a new shift."
                      : "No active shift. Open cash to start tracking POS sales automatically."}
                  </p>
                  {shiftPending && active && canApproveVariance ? (
                    <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1.5" onClick={() => void handleApprove(active.id)}>
                      <CheckCircle2 className="h-4 w-4" /> Approve variance & continue
                    </Button>
                  ) : !shiftPending ? (
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 gap-1.5" onClick={() => setTab("open")}>
                      <PlayCircle className="h-4 w-4" /> Start Shift
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => setTab("variance")}>
                      View pending variances
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 lg:grid-cols-5">
                <Card className="lg:col-span-2 border shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <Zap className="h-4 w-4 text-emerald-600" /> Live Shift Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Cashier</span>
                      <span className="font-semibold">{cashierName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Opened</span>
                      <span>{new Date(active!.openingTime).toLocaleTimeString("en-LK")}</span>
                    </div>
                    {[
                      ["Opening float", summary?.openingCash ?? active!.openingCash],
                      ["POS cash sales", summary?.cashSales ?? autoSalesTotal],
                      ["Cash in", summary?.cashReceived ?? 0],
                      ["Cash out / expenses", summary?.cashExpenses ?? 0],
                      ["Refunds", summary?.cashRefunds ?? 0],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between py-1 border-b border-dashed">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold tabular-nums">LKR {formatNumber(Number(val))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between pt-2 font-bold text-base">
                      <span>Expected in drawer</span>
                      <span className="text-emerald-600 tabular-nums">LKR {formatNumber(expected)}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" /> Auto-refreshes every 30s · POS sales recorded automatically
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setTab("movements")}>Cash In/Out</Button>
                      <Button size="sm" className="flex-1 bg-red-600 hover:bg-red-700" onClick={() => setTab("close")}>Close Shift</Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-3 border shadow-sm">
                  <CardHeader className="pb-3 flex flex-row items-center justify-between">
                    <CardTitle className="text-sm font-semibold">Activity Log</CardTitle>
                    <Badge variant="outline" className="text-[10px]">{movements.length} entries</Badge>
                  </CardHeader>
                  <CardContent className="max-h-[420px] overflow-y-auto">
                    <CashMovementLedger movements={movements} emptyMessage="Sales and movements appear here automatically" />
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Cash Open */}
          <TabsContent value="open" className="m-0 mt-0">
            <Card className="card-hover">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <PlayCircle className="h-4 w-4 text-emerald-600" /> Opening Cash
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 max-w-xl">
                {shiftOpen ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      <span className="font-semibold text-emerald-700 dark:text-emerald-400">Shift is open</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Opened with LKR {formatNumber(active!.openingCash)} at{" "}
                      {new Date(active!.openingTime).toLocaleTimeString("en-LK")}
                    </p>
                    <Button className="mt-4" size="sm" onClick={() => setTab("overview")}>Go to Overview</Button>
                  </div>
                ) : shiftPending ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-3">
                    <p className="font-semibold text-amber-700 dark:text-amber-400">Previous shift pending manager approval</p>
                    <p className="text-sm text-muted-foreground">
                      Close variance must be approved before opening a new shift
                      {active?.variance != null && (
                        <> (variance LKR {formatNumber(Math.abs(active.variance))})</>
                      )}.
                    </p>
                    {canApproveVariance && active ? (
                      <Button size="sm" className="bg-amber-600 hover:bg-amber-700 gap-1.5" onClick={() => void handleApprove(active.id)}>
                        <CheckCircle2 className="h-4 w-4" /> Approve variance
                      </Button>
                    ) : (
                      <p className="text-xs text-muted-foreground">Ask a branch manager or admin to approve from Cash Management → Variance.</p>
                    )}
                  </div>
                ) : (
                  <>
                    {suggestion?.suggestedOpening != null && (
                      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-4 flex items-start gap-3">
                        <Zap className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-blue-800 dark:text-blue-300">Suggested opening float</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            From last close
                            {suggestion.lastClosedAt && ` (${new Date(suggestion.lastClosedAt).toLocaleDateString("en-LK")})`}
                            {suggestion.lastVariance != null && suggestion.lastVariance !== 0 && (
                              <span> · variance was {suggestion.lastVariance >= 0 ? "+" : ""}{formatNumber(suggestion.lastVariance)}</span>
                            )}
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="mt-2 h-7 text-xs border-blue-500/50"
                            onClick={() => setOpeningCash(String(suggestion.suggestedOpening))}
                          >
                            Use LKR {formatNumber(suggestion.suggestedOpening)}
                          </Button>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground text-xs">Cashier</span>
                        <p className="font-semibold">{cashierName}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground text-xs">Date</span>
                        <p className="font-semibold">{todayLabel}</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Opening amount (LKR)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder="10,000.00"
                        value={openingCash}
                        onChange={(e) => setOpeningCash(e.target.value)}
                        className="text-lg font-semibold h-12"
                      />
                      <div className="flex flex-wrap gap-2">
                        {FLOAT_PRESETS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setOpeningCash(String(p))}
                            className={cn(
                              "px-3 py-1 text-xs rounded-lg border font-medium transition-all",
                              openingCash === String(p)
                                ? "bg-emerald-600 text-white border-emerald-600"
                                : "bg-background text-muted-foreground hover:bg-muted",
                            )}
                          >
                            {formatNumber(p)}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-semibold">Notes (optional)</Label>
                      <Textarea value={openingNotes} onChange={(e) => setOpeningNotes(e.target.value)} rows={2} />
                    </div>
                    <Button onClick={() => void handleOpenShift()} disabled={opening} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                      {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                      Start Shift
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cash Close */}
          <TabsContent value="close" className="m-0 mt-0">
            {!shiftOpen ? (
              <Card className="card-hover">
                <CardContent className="py-16 text-center text-muted-foreground">
                  <StopCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">No open shift. Start a shift from Cash Open first.</p>
                  <Button className="mt-4" size="sm" variant="outline" onClick={() => setTab("open")}>Cash Open</Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="card-hover">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Daily Cash Close</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {[
                      ["Opening Cash", summary?.openingCash ?? active!.openingCash],
                      ["Cash Sales (auto)", summary?.cashSales ?? autoSalesTotal],
                      ["Cash Received", summary?.cashReceived ?? 0],
                      ["Cash Expenses", summary?.cashExpenses ?? 0],
                      ["Cash Refunds (auto)", summary?.cashRefunds ?? 0],
                    ].map(([label, val]) => (
                      <div key={String(label)} className="flex justify-between py-1.5 border-b border-dashed">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-semibold tabular-nums">LKR {formatNumber(Number(val))}</span>
                      </div>
                    ))}
                    <div className="flex justify-between py-2 font-bold text-base">
                      <span>Expected Cash</span>
                      <span className="text-emerald-600 tabular-nums">LKR {formatNumber(expected)}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="card-hover">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Physical Count</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DenominationInput value={denominations} onChange={setDenominations} />
                    {actualTotal > 0 && (
                      <div className="mt-4 space-y-2 rounded-xl bg-muted/50 border p-4 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expected</span>
                          <span className="tabular-nums font-medium">{formatNumber(expected)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Actual</span>
                          <span className="tabular-nums font-medium">{formatNumber(actualTotal)}</span>
                        </div>
                        <div className={cn(
                          "flex justify-between font-bold pt-1 border-t",
                          variancePreview < 0 ? "text-red-600" : variancePreview > 0 ? "text-emerald-600" : "",
                        )}>
                          <span>Variance</span>
                          <span className="tabular-nums">
                            {variancePreview >= 0 ? "+" : ""}{formatNumber(variancePreview)}
                          </span>
                        </div>
                        {needsApprovalPreview && (
                          <Badge variant="outline" className="mt-2 border-amber-500 text-amber-600">
                            Pending approval — variance &gt; LKR {VARIANCE_THRESHOLD}
                          </Badge>
                        )}
                      </div>
                    )}
                    <div className="space-y-2 mt-4">
                      <Label className="text-xs font-semibold">Closing notes (optional)</Label>
                      <Textarea
                        placeholder="Notes for this close…"
                        value={closeNotes}
                        onChange={(e) => setCloseNotes(e.target.value)}
                        rows={2}
                      />
                    </div>
                    <Button
                      onClick={() => void handleCloseShift()}
                      disabled={closing || actualTotal <= 0}
                      className="w-full mt-4 h-11 gap-2 bg-red-600 hover:bg-red-700"
                    >
                      {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <StopCircle className="h-4 w-4" />}
                      Close Shift
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="m-0 mt-0 space-y-4">
            <ClientSideTable
              data={history}
              columns={historyColumns}
              pageCount={Math.max(1, Math.ceil(history.length / 10))}
              searchableColumns={[{ id: "cashierName", title: "Cashier" }]}
              filterableColumns={[{
                id: "status",
                title: "Status",
                options: [
                  { value: "CLOSED", label: "Closed" },
                  { value: "PENDING_APPROVAL", label: "Pending Approval" },
                  { value: "OPEN", label: "Open" },
                ],
              }]}
              isShowExportButtons={{ isShow: true, fileName: "cash-history-export" }}
            />
          </TabsContent>

          {/* Variance */}
          <TabsContent value="variance" className="m-0 mt-0 space-y-4">
            {dateRange.from === TODAY && dateRange.to === TODAY ? (
              <div className="flex items-center gap-3">
                <Label className="text-xs font-semibold shrink-0">Period</Label>
                <Select value={varianceDays} onValueChange={setVarianceDays}>
                  <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Showing variances for {rangeLabel}</p>
            )}
            {loading ? (
              <Skeleton className="h-48 w-full rounded-xl" />
            ) : varianceReport ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { label: "Total Shifts", value: varianceReport.totalShifts, color: "text-blue-600", bg: "bg-blue-500/10" },
                    { label: "Net Variance", value: varianceReport.totalVariance, color: "text-foreground", bg: "bg-muted" },
                    { label: "Over Count", value: varianceReport.overCount, color: "text-emerald-600", bg: "bg-emerald-500/10" },
                    { label: "Short Count", value: varianceReport.shortCount, color: "text-red-600", bg: "bg-red-500/10" },
                  ].map((s) => (
                    <Card key={s.label} className="card-hover">
                      <CardContent className="p-5">
                        <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                        <p className={cn("text-2xl font-bold tabular-nums mt-1", s.color)}>
                          {formatNumber(Number(s.value))}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {varianceChartData.length > 0 && (
                  <Card className="card-hover">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold">Variance trend</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={varianceChartData}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis dataKey="day" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, "Variance"]} />
                          <Bar dataKey="variance" radius={[4, 4, 0, 0]}>
                            {varianceChartData.map((entry, i) => (
                              <Cell key={i} fill={entry.variance >= 0 ? "#10b981" : "#ef4444"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                <Card className="card-hover">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Recent variances ({varianceDays} days)</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {varianceReport.registers.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8 text-sm">No variance data yet</p>
                    ) : (
                      varianceReport.registers.map((r) => (
                        <div key={r.id} className="flex items-center justify-between p-3 rounded-xl border text-sm hover:bg-muted/30 transition-colors">
                          <div className="flex items-center gap-3">
                            <div>
                              <p className="font-medium">{r.cashierName ?? "Cashier"}</p>
                              <p className="text-xs text-muted-foreground">
                                {r.closingTime ? new Date(r.closingTime).toLocaleDateString("en-LK") : "—"}
                              </p>
                            </div>
                            {r.status === "PENDING_APPROVAL" && statusBadge(r.status)}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "font-bold tabular-nums",
                              (r.variance ?? 0) < 0 ? "text-red-600" : "text-emerald-600",
                            )}>
                              {(r.variance ?? 0) >= 0 ? "+" : ""}{formatNumber(r.variance ?? 0)}
                            </span>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setDetailShiftId(r.id)}>
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {r.status === "PENDING_APPROVAL" && (
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void handleApprove(r.id)}>
                                Approve
                              </Button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <Card className="card-hover">
                <CardContent className="py-12 text-center text-muted-foreground text-sm">No variance report available</CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Movements */}
          <TabsContent value="movements" className="m-0 mt-0">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="card-hover">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4 text-emerald-600" /> Record Movement
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!shiftOpen ? (
                    <p className="text-muted-foreground text-sm">Open a shift to record cash movements.</p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        {(["DEPOSIT", "WITHDRAWAL", "EXPENSE"] as const).map((t) => (
                          <Button
                            key={t}
                            size="sm"
                            variant={movementType === t ? "default" : "outline"}
                            className={movementType === t ? "bg-emerald-600 hover:bg-emerald-700" : ""}
                            onClick={() => setMovementType(t)}
                          >
                            {t === "DEPOSIT" ? "Cash In" : t === "WITHDRAWAL" ? "Cash Out" : "Petty Expense"}
                          </Button>
                        ))}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Amount (LKR)</Label>
                          <Input type="number" value={movementAmount} onChange={(e) => setMovementAmount(e.target.value)} />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Description</Label>
                          <Input value={movementDesc} onChange={(e) => setMovementDesc(e.target.value)} placeholder="Reason…" />
                        </div>
                      </div>
                      <Button onClick={() => void handleMovement()} disabled={moving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                        {moving ? <Loader2 className="h-4 w-4 animate-spin" /> : movementType === "DEPOSIT" ? <ArrowDownCircle className="h-4 w-4" /> : <ArrowUpCircle className="h-4 w-4" />}
                        Record Movement
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>

              {shiftOpen && (
                <Card className="card-hover">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Today&apos;s movements</CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-[360px] overflow-y-auto">
                    <CashMovementLedger movements={movements} />
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {detailShiftId && (
        <ShiftDetailSheet shiftId={detailShiftId} onClose={() => setDetailShiftId(null)} />
      )}
    </div>
  );
}
