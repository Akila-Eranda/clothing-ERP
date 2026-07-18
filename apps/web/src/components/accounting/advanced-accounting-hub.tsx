"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRightLeft, BarChart3, Building2, CheckCircle2,
  CircleDollarSign, Gauge, Layers3, Loader2, Play, Plus, RefreshCw, Repeat2,
  ShieldCheck, Sparkles, Target, TrendingUp, WalletCards,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type Tab = "overview" | "budgets" | "cost-centers" | "recurring" | "currency" | "forecast";

type Account = { id: string; code: string; name: string; type: string; isActive?: boolean };
type CostCenter = {
  id: string; code: string; name: string; description?: string | null;
  manager?: string | null; isActive: boolean; _count?: { budgetLines: number };
};
type BudgetLine = {
  id: string; month: number; amount: number;
  account: { id: string; code: string; name: string; type: string };
  costCenter?: { id: string; code: string; name: string } | null;
};
type Budget = {
  id: string; name: string; fiscalYear: number; status: string; notes?: string | null;
  lines: BudgetLine[];
};
type Recurring = {
  id: string; name: string; description: string; frequency: string; nextRunDate: string;
  lastRunDate?: string | null; autoPost: boolean; isActive: boolean;
};
type ExchangeRate = {
  id: string; fromCurrency: string; toCurrency: string; rate: number;
  effectiveAt: string; source?: string | null;
};
type Diagnostic = {
  healthScore: number;
  status: string;
  missingJournals: { sales: number; grns: number; expenses: number; supplierPayments: number };
  unpostedTotal: number;
  overdueRecurring: number;
  missingAccounts: string[];
  checkedAt: string;
};
type ForecastRow = { month: string; revenue: number; expense: number; profit: number };
type Dashboard = {
  diagnostics: Diagnostic;
  budget: { budget: number; actual: number; variance: number };
  forecast: ForecastRow[];
  monthlyGrowthPct: number;
  activeRecurring: number;
  activeCostCenters: number;
  activeExchangeRates: number;
};
type Consolidation = {
  total: { revenue: number; expense: number; net: number };
  branches: Array<{
    id: string; code: string; name: string; revenue: number; expense: number;
    net: number; transactions: number; postedJournals: number;
  }>;
};
type Forecast = {
  historical: ForecastRow[];
  projected: ForecastRow[];
  monthlyGrowthPct: number;
  method: string;
};
type Variance = {
  budget: { id: string; name: string; fiscalYear: number } | null;
  totals: { budget: number; actual: number; variance: number };
  rows: Array<{
    accountId: string; code: string; name: string; budget: number; actual: number;
    variance: number; utilizationPct: number;
  }>;
};

const TABS: Array<{ id: Tab; label: string; icon: typeof Activity }> = [
  { id: "overview", label: "Command Center", icon: Gauge },
  { id: "budgets", label: "Budgets", icon: Target },
  { id: "cost-centers", label: "Cost Centers", icon: Layers3 },
  { id: "recurring", label: "Recurring", icon: Repeat2 },
  { id: "currency", label: "Multi-Currency", icon: ArrowRightLeft },
  { id: "forecast", label: "Forecast & Consolidation", icon: TrendingUp },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CURRENT_YEAR = new Date().getFullYear();

function money(value: number) {
  return `LKR ${formatNumber(Math.round(value || 0))}`;
}

function StatCard({
  label, value, hint, icon: Icon, tone,
}: {
  label: string; value: string; hint: string; icon: typeof Activity; tone: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5 flex items-center gap-4">
        <div className={cn("h-11 w-11 rounded-xl grid place-items-center text-white shadow-md", tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-tight tabular-nums truncate">{value}</p>
          <p className="text-xs font-semibold text-muted-foreground mt-0.5">{label}</p>
          <p className="text-[11px] text-muted-foreground/80 mt-0.5 truncate">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/25 px-5 py-10 text-center">
      <Sparkles className="h-7 w-7 mx-auto text-primary/60 mb-2" />
      <p className="text-sm font-semibold">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{text}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function AdvancedAccountingHub() {
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [diagnostics, setDiagnostics] = useState<Diagnostic | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [variance, setVariance] = useState<Variance | null>(null);
  const [recurring, setRecurring] = useState<Recurring[]>([]);
  const [rates, setRates] = useState<ExchangeRate[]>([]);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [consolidation, setConsolidation] = useState<Consolidation | null>(null);

  const [costOpen, setCostOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);

  const [costForm, setCostForm] = useState({ code: "", name: "", manager: "", description: "" });
  const [budgetForm, setBudgetForm] = useState({
    name: `Operating Budget ${CURRENT_YEAR}`, fiscalYear: String(CURRENT_YEAR),
    accountId: "", annualAmount: "", costCenterId: "",
  });
  const [recForm, setRecForm] = useState({
    name: "", description: "", frequency: "MONTHLY", startDate: new Date().toISOString().slice(0, 10),
    debitAccountId: "", creditAccountId: "", amount: "",
  });
  const [rateForm, setRateForm] = useState({
    fromCurrency: "USD", toCurrency: "LKR", rate: "", source: "Manual",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [
        dashboardRes, accountsRes, costRes, budgetRes, varianceRes, recurringRes,
        ratesRes, forecastRes, consolidationRes,
      ] = await Promise.all([
        api.get<Dashboard>("/accounting/advanced/dashboard"),
        api.get<{ flat?: Account[]; data?: Account[] } | Account[]>("/accounting/accounts?flat=true"),
        api.get<CostCenter[]>("/accounting/advanced/cost-centers"),
        api.get<Budget[]>(`/accounting/advanced/budgets?fiscalYear=${CURRENT_YEAR}`),
        api.get<Variance>(`/accounting/advanced/budget-variance?fiscalYear=${CURRENT_YEAR}`),
        api.get<Recurring[]>("/accounting/advanced/recurring-journals"),
        api.get<ExchangeRate[]>("/accounting/advanced/exchange-rates"),
        api.get<Forecast>("/accounting/advanced/forecast?months=6"),
        api.get<Consolidation>("/accounting/advanced/consolidation"),
      ]);
      setDashboard(dashboardRes.data);
      setDiagnostics(dashboardRes.data?.diagnostics ?? null);
      const raw = accountsRes.data as { flat?: Account[]; data?: Account[] } | Account[];
      setAccounts((Array.isArray(raw) ? raw : raw?.flat ?? raw?.data ?? []).filter((a) => a.isActive !== false));
      setCostCenters(costRes.data ?? []);
      setBudgets(budgetRes.data ?? []);
      setVariance(varianceRes.data);
      setRecurring(recurringRes.data ?? []);
      setRates(ratesRes.data ?? []);
      setForecast(forecastRes.data);
      setConsolidation(consolidationRes.data);
    } catch (error) {
      toast.error((error as Error).message || "Failed to load advanced accounting");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const expenseAccounts = useMemo(
    () => accounts.filter((a) => a.type === "EXPENSE"),
    [accounts],
  );

  const createCostCenter = async () => {
    if (!costForm.code.trim() || !costForm.name.trim()) return toast.error("Code and name are required");
    setBusy(true);
    try {
      await api.post("/accounting/advanced/cost-centers", costForm);
      toast.success("Cost center created");
      setCostOpen(false);
      setCostForm({ code: "", name: "", manager: "", description: "" });
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Failed to create cost center");
    } finally { setBusy(false); }
  };

  const createBudget = async () => {
    const annual = Number(budgetForm.annualAmount);
    if (!budgetForm.name.trim() || !budgetForm.accountId || !annual) {
      return toast.error("Budget name, account, and annual amount are required");
    }
    const monthly = Math.round((annual / 12) * 100) / 100;
    setBusy(true);
    try {
      await api.post("/accounting/advanced/budgets", {
        name: budgetForm.name,
        fiscalYear: Number(budgetForm.fiscalYear),
        lines: MONTHS.map((_, index) => ({
          accountId: budgetForm.accountId,
          costCenterId: budgetForm.costCenterId || undefined,
          month: index + 1,
          amount: monthly,
        })),
      });
      toast.success("Annual budget created and distributed across 12 months");
      setBudgetOpen(false);
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Failed to create budget");
    } finally { setBusy(false); }
  };

  const approveBudget = async (id: string) => {
    setBusy(true);
    try {
      await api.put(`/accounting/advanced/budgets/${id}/status`, { status: "APPROVED" });
      toast.success("Budget approved");
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Approval failed");
    } finally { setBusy(false); }
  };

  const createRecurring = async () => {
    const amount = Number(recForm.amount);
    if (!recForm.name || !recForm.debitAccountId || !recForm.creditAccountId || !amount) {
      return toast.error("Complete all recurring journal fields");
    }
    setBusy(true);
    try {
      await api.post("/accounting/advanced/recurring-journals", {
        name: recForm.name,
        description: recForm.description || recForm.name,
        frequency: recForm.frequency,
        startDate: recForm.startDate,
        autoPost: true,
        lines: [
          { accountId: recForm.debitAccountId, side: "DEBIT", amount },
          { accountId: recForm.creditAccountId, side: "CREDIT", amount },
        ],
      });
      toast.success("Recurring journal scheduled");
      setRecurringOpen(false);
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Failed to schedule journal");
    } finally { setBusy(false); }
  };

  const runRecurring = async (id: string) => {
    setBusy(true);
    try {
      await api.post(`/accounting/advanced/recurring-journals/${id}/run`, {});
      toast.success("Recurring journal executed");
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Journal run failed");
    } finally { setBusy(false); }
  };

  const createRate = async () => {
    const rate = Number(rateForm.rate);
    if (!rate) return toast.error("Enter a valid exchange rate");
    setBusy(true);
    try {
      await api.post("/accounting/advanced/exchange-rates", { ...rateForm, rate });
      toast.success("Exchange rate saved");
      setRateOpen(false);
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Failed to save rate");
    } finally { setBusy(false); }
  };

  const repairLedger = async () => {
    setBusy(true);
    try {
      await api.post("/accounting/bootstrap", {});
      const scan = await api.post<{ missing: number }>("/accounting/sync/scan?limit=200", {});
      const processed = await api.post<{ posted: number; failed: number }>(
        "/accounting/sync/process?limit=200",
        {},
      );
      const result = await api.post<{ journalsPosted: number }>("/accounting/backfill?limit=500", {});
      toast.success(
        `Synced — scanned ${scan.data?.missing ?? 0}, posted ${processed.data?.posted ?? 0}, backfill ${result.data?.journalsPosted ?? 0}`,
      );
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Ledger repair failed");
    } finally { setBusy(false); }
  };

  const runSyncOnly = async () => {
    setBusy(true);
    try {
      await api.post("/accounting/sync/scan?limit=200", {});
      const processed = await api.post<{ posted: number; failed: number; skipped: number }>(
        "/accounting/sync/process?limit=200",
        {},
      );
      toast.success(
        `Outbox processed — posted ${processed.data?.posted ?? 0}, failed ${processed.data?.failed ?? 0}`,
      );
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Sync failed");
    } finally { setBusy(false); }
  };

  if (loading && !dashboard) {
    return (
      <div className="page-shell min-h-[420px] grid place-items-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
          <p className="text-sm text-muted-foreground mt-3">Loading advanced accounting…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 grid place-items-center text-white shadow-button">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Advanced Accounting</h1>
              <p className="text-sm text-muted-foreground">
                Planning, automation, currency, consolidation, and financial controls
              </p>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border/70 bg-card p-1.5 shadow-card">
        {TABS.map((item) => {
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={cn(
                "h-9 shrink-0 rounded-lg px-3 flex items-center gap-2 text-xs font-semibold transition-all",
                active ? "bg-primary text-primary-foreground shadow-button" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && dashboard && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
              label="Accounting Health"
              value={`${dashboard.diagnostics.healthScore}%`}
              hint={dashboard.diagnostics.status.replace(/_/g, " ")}
              icon={ShieldCheck}
              tone={dashboard.diagnostics.healthScore >= 90 ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-amber-500 to-orange-600"}
            />
            <StatCard
              label="Budget Remaining"
              value={money(dashboard.budget.variance)}
              hint={`${money(dashboard.budget.actual)} used`}
              icon={Target}
              tone="bg-gradient-to-br from-indigo-500 to-violet-600"
            />
            <StatCard
              label="Active Automations"
              value={String(dashboard.activeRecurring)}
              hint={`${dashboard.activeCostCenters} cost centers`}
              icon={Repeat2}
              tone="bg-gradient-to-br from-sky-500 to-blue-600"
            />
            <StatCard
              label="Growth Forecast"
              value={`${dashboard.monthlyGrowthPct >= 0 ? "+" : ""}${dashboard.monthlyGrowthPct}%`}
              hint={`${dashboard.activeExchangeRates} active FX rates`}
              icon={TrendingUp}
              tone="bg-gradient-to-br from-fuchsia-500 to-pink-600"
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1.25fr_.75fr] gap-5">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  3-Month Financial Outlook
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  {dashboard.forecast.map((row) => (
                    <div key={row.month} className="rounded-xl border bg-muted/30 p-4">
                      <p className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground">{row.month}</p>
                      <p className="text-base font-bold mt-2 tabular-nums">{money(row.profit)}</p>
                      <div className="mt-3 space-y-1 text-[11px]">
                        <div className="flex justify-between"><span className="text-muted-foreground">Revenue</span><span className="text-emerald-700 font-semibold">{money(row.revenue)}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Expense</span><span className="text-red-600 font-semibold">{money(row.expense)}</span></div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className={cn(
              "border-l-4",
              diagnostics?.status === "HEALTHY" ? "border-l-emerald-500" : "border-l-amber-500",
            )}>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" /> Ledger Diagnostics
                  </span>
                  <Badge variant={diagnostics?.status === "HEALTHY" ? "default" : "outline"}>
                    {diagnostics?.status.replace(/_/g, " ")}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    ["Missing sales", diagnostics?.missingJournals.sales ?? 0],
                    ["Missing GRNs", diagnostics?.missingJournals.grns ?? 0],
                    ["Missing expenses", diagnostics?.missingJournals.expenses ?? 0],
                    ["Overdue schedules", diagnostics?.overdueRecurring ?? 0],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-lg bg-muted/50 p-2.5 flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className={cn("font-bold tabular-nums", Number(value) > 0 && "text-amber-600")}>{value}</span>
                    </div>
                  ))}
                </div>
                <div className="flex flex-col gap-2">
                  <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => void runSyncOnly()} disabled={busy}>
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    Scan & process outbox
                  </Button>
                  {(diagnostics?.unpostedTotal ?? 0) > 0 || (diagnostics?.missingAccounts.length ?? 0) > 0 ? (
                    <Button size="sm" className="w-full gap-1.5" onClick={() => void repairLedger()} disabled={busy}>
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      Repair & Backfill Ledger
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg p-2.5">
                      <CheckCircle2 className="h-4 w-4" /> All source transactions are posted
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "budgets" && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold">Budgets & Variance</h2>
              <p className="text-xs text-muted-foreground">Set annual plans and compare actual ledger spend</p>
            </div>
            <Button size="sm" onClick={() => setBudgetOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New Budget</Button>
          </div>

          {variance?.budget && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard label="Approved Budget" value={money(variance.totals.budget)} hint={variance.budget.name} icon={Target} tone="bg-gradient-to-br from-indigo-500 to-violet-600" />
              <StatCard label="Actual Spend" value={money(variance.totals.actual)} hint={`${variance.rows.length} ledger accounts`} icon={CircleDollarSign} tone="bg-gradient-to-br from-amber-500 to-orange-600" />
              <StatCard label="Remaining" value={money(variance.totals.variance)} hint={variance.totals.variance >= 0 ? "Within budget" : "Over budget"} icon={WalletCards} tone={variance.totals.variance >= 0 ? "bg-gradient-to-br from-emerald-500 to-teal-600" : "bg-gradient-to-br from-red-500 to-rose-600"} />
            </div>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {budgets.length === 0 ? (
                <div className="p-5"><EmptyState title="No budgets yet" text="Create an annual budget. The system will spread it across all 12 months and track actuals automatically." action={<Button size="sm" onClick={() => setBudgetOpen(true)}>Create first budget</Button>} /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/70">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="p-3">Budget</th><th className="p-3">Year</th><th className="p-3">Lines</th>
                      <th className="p-3">Total</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {budgets.map((budget) => (
                      <tr key={budget.id} className="border-t hover:bg-accent/50">
                        <td className="p-3 font-semibold">{budget.name}</td>
                        <td className="p-3 tabular-nums">{budget.fiscalYear}</td>
                        <td className="p-3">{budget.lines.length}</td>
                        <td className="p-3 font-semibold tabular-nums">{money(budget.lines.reduce((s, line) => s + line.amount, 0))}</td>
                        <td className="p-3"><Badge variant={budget.status === "APPROVED" ? "default" : "outline"}>{budget.status}</Badge></td>
                        <td className="p-3 text-right">
                          {budget.status === "DRAFT" && <Button variant="outline" size="sm" onClick={() => void approveBudget(budget.id)} disabled={busy}>Approve</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {(variance?.rows.length ?? 0) > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Account Variance</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {variance!.rows.map((row) => (
                  <div key={row.accountId}>
                    <div className="flex justify-between gap-3 text-xs mb-1.5">
                      <span className="font-semibold">{row.code} · {row.name}</span>
                      <span className="text-muted-foreground">{money(row.actual)} / {money(row.budget)} · {row.utilizationPct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={cn("h-full rounded-full", row.utilizationPct > 100 ? "bg-red-500" : row.utilizationPct > 85 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${Math.min(100, row.utilizationPct)}%` }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {tab === "cost-centers" && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <div><h2 className="text-lg font-bold">Cost Centers</h2><p className="text-xs text-muted-foreground">Track budgets by department, team, or business unit</p></div>
            <Button size="sm" onClick={() => setCostOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New Cost Center</Button>
          </div>
          {costCenters.length === 0 ? (
            <EmptyState title="No cost centers" text="Create departments such as Retail, Warehouse, Admin, or Marketing." action={<Button size="sm" onClick={() => setCostOpen(true)}>Create cost center</Button>} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {costCenters.map((center) => (
                <Card key={center.id} className="card-hover">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-200 grid place-items-center">
                        <Building2 className="h-4.5 w-4.5" />
                      </div>
                      <Badge variant="outline">{center.code}</Badge>
                    </div>
                    <p className="font-bold mt-4">{center.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 min-h-8">{center.description || "No description"}</p>
                    <div className="line-rule my-3" />
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{center.manager || "No manager"}</span>
                      <span className="font-semibold">{center._count?.budgetLines ?? 0} budget lines</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "recurring" && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <div><h2 className="text-lg font-bold">Recurring Journals</h2><p className="text-xs text-muted-foreground">Automatically post rent, subscriptions, accruals, and standing entries</p></div>
            <Button size="sm" onClick={() => setRecurringOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> New Schedule</Button>
          </div>
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              {recurring.length === 0 ? (
                <div className="p-5"><EmptyState title="No recurring journals" text="Schedule balanced journals to post daily, weekly, monthly, quarterly, or yearly." /></div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/70"><tr className="text-left text-xs text-muted-foreground"><th className="p-3">Schedule</th><th className="p-3">Frequency</th><th className="p-3">Next Run</th><th className="p-3">Mode</th><th className="p-3">Status</th><th className="p-3 text-right">Action</th></tr></thead>
                  <tbody>
                    {recurring.map((row) => (
                      <tr key={row.id} className="border-t hover:bg-accent/50">
                        <td className="p-3"><p className="font-semibold">{row.name}</p><p className="text-[11px] text-muted-foreground">{row.description}</p></td>
                        <td className="p-3"><Badge variant="outline">{row.frequency}</Badge></td>
                        <td className="p-3 text-xs tabular-nums">{new Date(row.nextRunDate).toLocaleDateString()}</td>
                        <td className="p-3 text-xs">{row.autoPost ? "Auto-post" : "Draft"}</td>
                        <td className="p-3">{row.isActive ? <span className="text-emerald-700 text-xs font-semibold">Active</span> : <span className="text-muted-foreground text-xs">Paused</span>}</td>
                        <td className="p-3 text-right"><Button variant="outline" size="sm" onClick={() => void runRecurring(row.id)} disabled={busy || !row.isActive}><Play className="h-3 w-3 mr-1" /> Run now</Button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "currency" && (
        <div className="space-y-5">
          <div className="flex justify-between items-center">
            <div><h2 className="text-lg font-bold">Multi-Currency</h2><p className="text-xs text-muted-foreground">Maintain effective-dated exchange rates for foreign transactions</p></div>
            <Button size="sm" onClick={() => setRateOpen(true)}><Plus className="h-3.5 w-3.5 mr-1" /> Add Rate</Button>
          </div>
          {rates.length === 0 ? (
            <EmptyState title="No exchange rates" text="Add the first currency pair, for example USD to LKR." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {rates.map((rate) => (
                <Card key={rate.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-lg">
                        <span>{rate.fromCurrency}</span><ArrowRightLeft className="h-4 w-4 text-primary" /><span>{rate.toCurrency}</span>
                      </div>
                      <Badge variant="outline">{rate.source || "Manual"}</Badge>
                    </div>
                    <p className="text-2xl font-bold tabular-nums mt-4">{formatNumber(rate.rate)}</p>
                    <p className="text-xs text-muted-foreground mt-1">1 {rate.fromCurrency} = {formatNumber(rate.rate)} {rate.toCurrency}</p>
                    <p className="text-[11px] text-muted-foreground mt-3">Effective {new Date(rate.effectiveAt).toLocaleDateString()}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "forecast" && forecast && consolidation && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-bold">Forecast & Branch Consolidation</h2>
            <p className="text-xs text-muted-foreground">Forward outlook from posted GL trends and consolidated branch performance</p>
          </div>
          <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_.85fr] gap-5">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Revenue & Profit Forecast</span>
                  <Badge variant="outline">{forecast.method}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-2 h-52 border-b border-border pb-2">
                  {[...forecast.historical.slice(-3), ...forecast.projected].map((row, index, all) => {
                    const max = Math.max(1, ...all.map((r) => Math.max(r.revenue, r.expense)));
                    return (
                      <div key={`${row.month}-${index}`} className="flex-1 h-full flex flex-col justify-end">
                        <div className="flex items-end justify-center gap-1 h-[170px]">
                          <div title={`Revenue ${money(row.revenue)}`} className={cn("w-2/5 rounded-t", index >= 3 ? "bg-indigo-400/60" : "bg-indigo-500")} style={{ height: `${Math.max(3, row.revenue / max * 100)}%` }} />
                          <div title={`Expense ${money(row.expense)}`} className={cn("w-2/5 rounded-t", index >= 3 ? "bg-amber-400/60" : "bg-amber-500")} style={{ height: `${Math.max(3, row.expense / max * 100)}%` }} />
                        </div>
                        <p className="text-[9px] text-muted-foreground text-center mt-2 truncate">{row.month.slice(5)}</p>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-4 mt-3 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Revenue</span>
                  <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Expense</span>
                  <span className="ml-auto font-semibold">Growth {forecast.monthlyGrowthPct >= 0 ? "+" : ""}{forecast.monthlyGrowthPct}% / month</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Consolidated Total</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4">
                  <p className="text-xs text-emerald-700">Net operating result</p>
                  <p className="text-2xl font-bold text-emerald-800 mt-1">{money(consolidation.total.net)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Revenue</p><p className="font-bold mt-1">{money(consolidation.total.revenue)}</p></div>
                  <div className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">Expenses</p><p className="font-bold mt-1">{money(consolidation.total.expense)}</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {consolidation.branches.map((branch) => (
              <Card key={branch.id}>
                <CardContent className="p-5">
                  <div className="flex justify-between items-start">
                    <div><p className="font-bold">{branch.name}</p><p className="text-[11px] text-muted-foreground">{branch.code}</p></div>
                    <Badge variant="outline">{branch.transactions} sales</Badge>
                  </div>
                  <p className={cn("text-xl font-bold mt-4", branch.net >= 0 ? "text-emerald-700" : "text-red-600")}>{money(branch.net)}</p>
                  <div className="flex justify-between text-[11px] text-muted-foreground mt-3"><span>{branch.postedJournals} journals</span><span>Revenue {money(branch.revenue)}</span></div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Dialog open={costOpen} onOpenChange={setCostOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Cost Center</DialogTitle><DialogDescription>Create a department or business unit for budget tracking.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>Code</Label><Input value={costForm.code} onChange={(e) => setCostForm((f) => ({ ...f, code: e.target.value }))} placeholder="MKT" /></div>
            <div className="space-y-1.5"><Label>Name</Label><Input value={costForm.name} onChange={(e) => setCostForm((f) => ({ ...f, name: e.target.value }))} placeholder="Marketing" /></div>
            <div className="space-y-1.5 col-span-2"><Label>Manager</Label><Input value={costForm.manager} onChange={(e) => setCostForm((f) => ({ ...f, manager: e.target.value }))} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Description</Label><Input value={costForm.description} onChange={(e) => setCostForm((f) => ({ ...f, description: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button><Button onClick={() => void createCostCenter()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Annual Budget</DialogTitle><DialogDescription>The annual amount is automatically distributed across 12 months.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Budget name</Label><Input value={budgetForm.name} onChange={(e) => setBudgetForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Fiscal year</Label><Input type="number" value={budgetForm.fiscalYear} onChange={(e) => setBudgetForm((f) => ({ ...f, fiscalYear: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Annual amount</Label><Input type="number" value={budgetForm.annualAmount} onChange={(e) => setBudgetForm((f) => ({ ...f, annualAmount: e.target.value }))} placeholder="1200000" /></div>
            </div>
            <div className="space-y-1.5"><Label>Expense account</Label><Select value={budgetForm.accountId} onValueChange={(value) => setBudgetForm((f) => ({ ...f, accountId: value }))}><SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger><SelectContent>{expenseAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Cost center (optional)</Label><Select value={budgetForm.costCenterId || "NONE"} onValueChange={(value) => setBudgetForm((f) => ({ ...f, costCenterId: value === "NONE" ? "" : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="NONE">All company</SelectItem>{costCenters.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBudgetOpen(false)}>Cancel</Button><Button onClick={() => void createBudget()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Create Budget</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={recurringOpen} onOpenChange={setRecurringOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule Recurring Journal</DialogTitle><DialogDescription>Create a balanced entry that posts automatically.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5"><Label>Name</Label><Input value={recForm.name} onChange={(e) => setRecForm((f) => ({ ...f, name: e.target.value }))} placeholder="Monthly rent" /></div>
            <div className="space-y-1.5"><Label>Description</Label><Input value={recForm.description} onChange={(e) => setRecForm((f) => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5"><Label>Frequency</Label><Select value={recForm.frequency} onValueChange={(value) => setRecForm((f) => ({ ...f, frequency: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"].map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5"><Label>First run</Label><Input type="date" value={recForm.startDate} onChange={(e) => setRecForm((f) => ({ ...f, startDate: e.target.value }))} /></div>
            </div>
            <div className="space-y-1.5"><Label>Debit account</Label><Select value={recForm.debitAccountId} onValueChange={(value) => setRecForm((f) => ({ ...f, debitAccountId: value }))}><SelectTrigger><SelectValue placeholder="Select debit" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Credit account</Label><Select value={recForm.creditAccountId} onValueChange={(value) => setRecForm((f) => ({ ...f, creditAccountId: value }))}><SelectTrigger><SelectValue placeholder="Select credit" /></SelectTrigger><SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} · {a.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Amount</Label><Input type="number" value={recForm.amount} onChange={(e) => setRecForm((f) => ({ ...f, amount: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRecurringOpen(false)}>Cancel</Button><Button onClick={() => void createRecurring()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Schedule</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Exchange Rate</DialogTitle><DialogDescription>Store an effective-dated currency conversion rate.</DialogDescription></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>From</Label><Input maxLength={3} value={rateForm.fromCurrency} onChange={(e) => setRateForm((f) => ({ ...f, fromCurrency: e.target.value.toUpperCase() }))} /></div>
            <div className="space-y-1.5"><Label>To</Label><Input maxLength={3} value={rateForm.toCurrency} onChange={(e) => setRateForm((f) => ({ ...f, toCurrency: e.target.value.toUpperCase() }))} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Rate</Label><Input type="number" step="0.000001" value={rateForm.rate} onChange={(e) => setRateForm((f) => ({ ...f, rate: e.target.value }))} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Source</Label><Input value={rateForm.source} onChange={(e) => setRateForm((f) => ({ ...f, source: e.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setRateOpen(false)}>Cancel</Button><Button onClick={() => void createRate()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Save Rate</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
