"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Calculator, Eye, FileText, LayoutDashboard, Loader2, RefreshCw,
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
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type Tab = "dashboard" | "process" | "payslips";

type Dashboard = {
  period: { month: number; year: number; label: string };
  settings: { epfEmployeeRate: number; epfEmployerRate: number; etfEmployerRate: number };
  activeEmployees: number;
  entryCount: number;
  paidCount: number;
  unpaidCount: number;
  run: {
    id: string;
    status: string;
    totalGross: number;
    totalNet: number;
    totalEpfEmployee: number;
    totalEpfEmployer: number;
    totalEtf: number;
  } | null;
  totals: {
    totalGross: number;
    totalNet: number;
    totalEpfEmployee: number;
    totalEpfEmployer: number;
    totalEtf: number;
  };
  recentPayslips: Array<{
    id: string;
    payslipNumber: string;
    periodLabel: string;
    employee: { firstName: string; lastName: string; code?: string | null };
  }>;
};

type PayrollRun = {
  id: string;
  month: number;
  year: number;
  periodLabel: string;
  status: string;
  employeeCount: number;
  totalGross: number;
  totalNet: number;
  totalEpfEmployee: number;
  totalEpfEmployer: number;
  totalEtf: number;
  journalEntryId?: string | null;
  entries?: Array<{
    id: string;
    basicSalary: number;
    allowances: number;
    deductions: number;
    grossSalary: number;
    epfEmployee: number;
    epfEmployer: number;
    etfEmployer: number;
    netSalary: number;
    isPaid: boolean;
    employee: { firstName: string; lastName: string; code?: string | null };
    payslip?: { id: string; payslipNumber: string } | null;
  }>;
};

type Payslip = {
  id: string;
  payslipNumber: string;
  periodLabel: string;
  issuedAt: string;
  snapshot: Record<string, unknown>;
  employee: { firstName: string; lastName: string; code?: string | null; designation?: string | null };
};

type PayrollEntry = NonNullable<PayrollRun["entries"]>[number];

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function PayrollHub({ initialTab = "dashboard" }: { initialTab?: Tab }) {
  useShopWorkspace();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [viewPayslipId, setViewPayslipId] = useState<string | null>(null);
  useEffect(() => setTab(initialTab), [initialTab]);

  const tabs: { id: Tab; label: string; icon: typeof LayoutDashboard }[] = [
    { id: "dashboard", label: "Payroll Dashboard", icon: LayoutDashboard },
    { id: "process", label: "Salary Processing", icon: Calculator },
    { id: "payslips", label: "Payslip Viewer", icon: FileText },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Payroll</h1>
        <p className="text-sm text-muted-foreground">
          Salary processing with allowances, deductions, Sri Lanka EPF/ETF, and payslips — uses HR employees
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

      {tab === "dashboard" && (
        <DashboardPanel onOpenPayslip={(id) => { setViewPayslipId(id); setTab("payslips"); }} />
      )}
      {tab === "process" && <ProcessPanel />}
      {tab === "payslips" && (
        <PayslipsPanel initialId={viewPayslipId} onCleared={() => setViewPayslipId(null)} />
      )}
    </div>
  );
}

function DashboardPanel({ onOpenPayslip }: { onOpenPayslip: (id: string) => void }) {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [epfEmp, setEpfEmp] = useState("8");
  const [epfEr, setEpfEr] = useState("12");
  const [etf, setEtf] = useState("3");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Dashboard>(
        `/accounting/payroll/dashboard?month=${month}&year=${year}`,
      );
      setData(res.data ?? null);
      if (res.data?.settings) {
        setEpfEmp(String(res.data.settings.epfEmployeeRate));
        setEpfEr(String(res.data.settings.epfEmployerRate));
        setEtf(String(res.data.settings.etfEmployerRate));
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSettings = async () => {
    setBusy(true);
    try {
      await api.put("/accounting/payroll/settings", {
        epfEmployeeRate: parseFloat(epfEmp) || 8,
        epfEmployerRate: parseFloat(epfEr) || 12,
        etfEmployerRate: parseFloat(etf) || 3,
      });
      toast.success("EPF/ETF rates saved");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const seed = async () => {
    try {
      const res = await api.post<{ message?: string }>("/accounting/payroll/components/seed-defaults");
      toast.success(res.data?.message ?? "Components seeded");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    }
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Month</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Year</Label>
            <Input className="h-9 w-24" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" className="h-9" onClick={() => void load()}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" variant="secondary" className="h-9" onClick={() => void seed()}>
            Seed allowances
          </Button>
        </CardContent>
      </Card>

      {data && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Active employees", value: String(data.activeEmployees) },
              { label: "Gross payroll", value: `LKR ${formatNumber(data.totals.totalGross)}` },
              { label: "Net pay", value: `LKR ${formatNumber(data.totals.totalNet)}` },
              { label: "Paid / entries", value: `${data.paidCount}/${data.entryCount}` },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase text-muted-foreground">{c.label}</p>
                  <p className="text-xl font-bold tabular-nums mt-1">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">Statutory (EPF / ETF)</h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">EPF emp %</Label>
                    <Input className="h-9" type="number" value={epfEmp} onChange={(e) => setEpfEmp(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">EPF er %</Label>
                    <Input className="h-9" type="number" value={epfEr} onChange={(e) => setEpfEr(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">ETF %</Label>
                    <Input className="h-9" type="number" value={etf} onChange={(e) => setEtf(e.target.value)} />
                  </div>
                </div>
                <Button size="sm" disabled={busy} onClick={() => void saveSettings()}>Save rates</Button>
                <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
                  <p>EPF employee this period: LKR {formatNumber(data.totals.totalEpfEmployee)}</p>
                  <p>EPF employer: LKR {formatNumber(data.totals.totalEpfEmployer)}</p>
                  <p>ETF employer: LKR {formatNumber(data.totals.totalEtf)}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <h3 className="text-sm font-semibold">Current run</h3>
                {data.run ? (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Period</span>
                      <span>{data.run.status && <Badge className="mr-2 text-[10px]">{data.run.status}</Badge>}{data.period.label}</span>
                    </div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Gross</span><span className="tabular-nums">{formatNumber(data.run.totalGross)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Net</span><span className="tabular-nums font-medium">{formatNumber(data.run.totalNet)}</span></div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No run for this month — process salaries in the next tab.</p>
                )}
                <h4 className="text-xs font-semibold uppercase text-muted-foreground pt-2">Recent payslips</h4>
                <ul className="space-y-1.5 text-sm">
                  {data.recentPayslips.map((p) => (
                    <li key={p.id} className="flex justify-between items-center">
                      <span>{p.payslipNumber} · {p.employee.firstName} {p.employee.lastName}</span>
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => onOpenPayslip(p.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                  {!data.recentPayslips.length && (
                    <li className="text-muted-foreground">No payslips yet</li>
                  )}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function ProcessPanel() {
  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [bonus, setBonus] = useState("0");
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [busy, setBusy] = useState(false);
  const [processOpen, setProcessOpen] = useState(false);

  const loadRuns = useCallback(async () => {
    try {
      const res = await api.get<PayrollRun[]>("/accounting/payroll/runs");
      setRuns(Array.isArray(res.data) ? res.data : []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  const process = async () => {
    setBusy(true);
    try {
      const res = await api.post<PayrollRun>("/accounting/payroll/runs/process", {
        month: parseInt(month, 10),
        year: parseInt(year, 10),
        bonus: parseFloat(bonus) || 0,
      });
      setRun(res.data ?? null);
      toast.success(`Calculated ${res.data?.employeeCount ?? 0} employees`);
      setProcessOpen(false);
      await loadRuns();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Process failed");
    } finally {
      setBusy(false);
    }
  };

  const openRun = async (id: string) => {
    setBusy(true);
    try {
      const res = await api.get<PayrollRun>(`/accounting/payroll/runs/${id}`);
      setRun(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    if (!run) return;
    setBusy(true);
    try {
      await api.post(`/accounting/payroll/runs/${run.id}/approve`, {});
      toast.success("Run approved");
      await openRun(run.id);
      await loadRuns();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Approve failed");
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!run) return;
    setBusy(true);
    try {
      const res = await api.post<PayrollRun>(`/accounting/payroll/runs/${run.id}/pay`, {
        postToGl: true,
      });
      setRun(res.data ?? null);
      toast.success("Payroll paid — journals & payslips created");
      await loadRuns();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Pay failed");
    } finally {
      setBusy(false);
    }
  };

  const runColumns = useMemo<ColumnDef<PayrollRun>[]>(
    () => [
      {
        id: "period",
        accessorKey: "periodLabel",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Period" />,
        cell: ({ row }) => <span>{row.original.periodLabel}</span>,
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Badge className="text-[10px]">{row.original.status}</Badge>,
      },
      {
        id: "employees",
        accessorKey: "employeeCount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Employees" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.employeeCount}</span>
        ),
      },
      {
        id: "net",
        accessorKey: "totalNet",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Net" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.totalNet)}</span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => void openRun(row.original.id)}>
            Open
          </Button>
        ),
      },
    ],
    [],
  );

  const entryColumns = useMemo<ColumnDef<PayrollEntry>[]>(
    () => [
      {
        id: "employee",
        accessorFn: (e) => `${e.employee.firstName} ${e.employee.lastName}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
        cell: ({ row }) => {
          const e = row.original;
          return (
            <span>
              {e.employee.firstName} {e.employee.lastName}
              {e.employee.code && (
                <span className="text-xs text-muted-foreground ml-1">({e.employee.code})</span>
              )}
            </span>
          );
        },
      },
      {
        id: "basic",
        accessorKey: "basicSalary",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Basic" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.basicSalary)}</span>
        ),
      },
      {
        id: "allowances",
        accessorKey: "allowances",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Allow." />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.allowances)}</span>
        ),
      },
      {
        id: "gross",
        accessorKey: "grossSalary",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Gross" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.grossSalary)}</span>
        ),
      },
      {
        id: "epf",
        accessorKey: "epfEmployee",
        header: ({ column }) => <DataTableColumnHeader column={column} title="EPF" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.epfEmployee)}</span>
        ),
      },
      {
        id: "etf",
        accessorKey: "etfEmployer",
        header: ({ column }) => <DataTableColumnHeader column={column} title="ETF" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.etfEmployer)}</span>
        ),
      },
      {
        id: "net",
        accessorKey: "netSalary",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Net" />,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">{formatNumber(row.original.netSalary)}</span>
        ),
      },
      {
        id: "payStatus",
        accessorFn: (e) => (e.isPaid ? "PAID" : "PENDING"),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => (
          <Badge className="text-[10px]">{row.original.isPaid ? "PAID" : "PENDING"}</Badge>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setProcessOpen(true)} className="gap-1.5">
          <Calculator className="h-3.5 w-3.5" /> Calculate run
        </Button>
      </div>

      <Dialog open={processOpen} onOpenChange={setProcessOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Calculate payroll run</DialogTitle>
            <DialogDescription>Process salaries for a month with optional flat bonus.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Month</Label>
              <Select value={month} onValueChange={setMonth} disabled={busy}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => (
                    <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input className="h-9" type="number" value={year} onChange={(e) => setYear(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Flat bonus</Label>
              <Input className="h-9" type="number" value={bonus} onChange={(e) => setBonus(e.target.value)} disabled={busy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" disabled={busy} onClick={() => void process()} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Calculate run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {runs.length > 0 && (
        <ClientSideTable
          fillHeight={false}
          data={runs}
          columns={runColumns}
          pageCount={Math.max(1, Math.ceil(runs.length / 10))}
          searchableColumns={[
            { id: "period", title: "Period" },
            { id: "status", title: "Status" },
          ] as { id: keyof PayrollRun; title: string }[]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "payroll-runs" }}
        />
      )}

      {run && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <Badge>{run.periodLabel}</Badge>
            <Badge variant="outline">{run.status}</Badge>
            <span className="text-sm text-muted-foreground">
              Gross {formatNumber(run.totalGross)} · EPF emp {formatNumber(run.totalEpfEmployee)} ·
              EPF er {formatNumber(run.totalEpfEmployer)} · ETF {formatNumber(run.totalEtf)} ·
              Net {formatNumber(run.totalNet)}
            </span>
            <div className="ml-auto flex gap-2">
              {(run.status === "CALCULATED" || run.status === "DRAFT") && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void approve()}>Approve</Button>
              )}
              {(run.status === "APPROVED" || run.status === "CALCULATED") && (
                <Button size="sm" disabled={busy} onClick={() => void pay()}>
                  Pay &amp; post GL
                </Button>
              )}
            </div>
          </div>

          <ClientSideTable
          fillHeight={false}
            data={run.entries ?? []}
            columns={entryColumns}
            pageCount={Math.max(1, Math.ceil((run.entries?.length ?? 0) / 10))}
            searchableColumns={[{ id: "employee", title: "Employee" }]}
            filterableColumns={[]}
            isShowExportButtons={{ isShow: true, fileName: "payroll-run-entries" }}
          />
        </>
      )}
    </div>
  );
}

function PayslipsPanel({
  initialId,
  onCleared,
}: {
  initialId: string | null;
  onCleared: () => void;
}) {
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<Payslip[]>("/accounting/payroll/payslips");
      setSlips(Array.isArray(res.data) ? res.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load payslips");
    } finally {
      setLoading(false);
    }
  }, []);

  const open = useCallback(async (id: string) => {
    try {
      const res = await api.get<Payslip>(`/accounting/payroll/payslips/${id}`);
      setSelected(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to open payslip");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (initialId) {
      void open(initialId);
      onCleared();
    }
  }, [initialId, open, onCleared]);

  const slipColumns = useMemo<ColumnDef<Payslip>[]>(
    () => [
      {
        id: "payslip",
        accessorKey: "payslipNumber",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Payslip" />,
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.payslipNumber}</span>
        ),
      },
      {
        id: "employee",
        accessorFn: (s) => `${s.employee.firstName} ${s.employee.lastName}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Employee" />,
        cell: ({ row }) => (
          <span>
            {row.original.employee.firstName} {row.original.employee.lastName}
          </span>
        ),
      },
      {
        id: "period",
        accessorKey: "periodLabel",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Period" />,
        cell: ({ row }) => <span>{row.original.periodLabel}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button variant="ghost" size="sm" className="h-8" onClick={() => void open(row.original.id)}>
            <Eye className="h-3.5 w-3.5" />
          </Button>
        ),
      },
    ],
    [open],
  );

  const snap = selected?.snapshot as {
    employee?: { name?: string; designation?: string | null; epfNumber?: string | null; etfNumber?: string | null };
    earnings?: { basicSalary?: number; allowances?: number; bonus?: number; commission?: number; grossSalary?: number };
    deductions?: { other?: number; epfEmployee?: number; total?: number };
    employer?: { epfEmployer?: number; etfEmployer?: number };
    epfWage?: number;
    netSalary?: number;
    periodLabel?: string;
    payslipNumber?: string;
  } | undefined;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ClientSideTable
          fillHeight={false}
          data={slips}
          columns={slipColumns}
          pageCount={Math.max(1, Math.ceil(slips.length / 10))}
          searchableColumns={[
            { id: "payslip", title: "Payslip" },
            { id: "employee", title: "Employee" },
            { id: "period", title: "Period" },
          ] as { id: keyof Payslip; title: string }[]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "payslips" }}
        />
      )}

      <Card>
        <CardContent className="p-6">
          {!selected || !snap ? (
            <p className="text-sm text-muted-foreground text-center py-12">Select a payslip to view</p>
          ) : (
            <div className="space-y-4 max-w-md mx-auto">
              {/* TODO: remaining tables → ClientSideTable — payslip detail is a print-style layout */}
              <div className="text-center border-b pb-3">
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Payslip</p>
                <h2 className="text-lg font-bold">{snap.payslipNumber ?? selected.payslipNumber}</h2>
                <p className="text-sm text-muted-foreground">{snap.periodLabel ?? selected.periodLabel}</p>
              </div>
              <div>
                <p className="font-semibold">{snap.employee?.name}</p>
                {snap.employee?.designation && (
                  <p className="text-sm text-muted-foreground">{snap.employee.designation}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  EPF: {snap.employee?.epfNumber || "—"} · ETF: {snap.employee?.etfNumber || "—"}
                </p>
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Earnings</p>
                <Row label="Basic" value={snap.earnings?.basicSalary} />
                <Row label="Allowances" value={snap.earnings?.allowances} />
                <Row label="Bonus" value={snap.earnings?.bonus} />
                <Row label="Commission" value={snap.earnings?.commission} />
                <Row label="Gross" value={snap.earnings?.grossSalary} bold />
              </div>
              <div className="space-y-1 text-sm">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Deductions</p>
                <Row label="Other" value={snap.deductions?.other} />
                <Row label="EPF (employee)" value={snap.deductions?.epfEmployee} />
                <Row label="Total deductions" value={snap.deductions?.total} bold />
              </div>
              <div className="space-y-1 text-sm border-t pt-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Employer contributions</p>
                <Row label="EPF wage base" value={snap.epfWage} />
                <Row label="EPF employer 12%" value={snap.employer?.epfEmployer} />
                <Row label="ETF employer 3%" value={snap.employer?.etfEmployer} />
              </div>
              <div className="flex justify-between items-center border-t pt-3">
                <span className="font-semibold">Net pay</span>
                <span className="text-xl font-bold tabular-nums">LKR {formatNumber(snap.netSalary ?? 0)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value?: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-medium pt-1" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{formatNumber(value ?? 0)}</span>
    </div>
  );
}
