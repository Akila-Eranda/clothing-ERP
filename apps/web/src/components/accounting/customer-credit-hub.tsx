"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, Bell, CalendarClock, CheckCircle2, FileBarChart, Loader2, Plus, RefreshCw, TrendingUp, Users, Wallet,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type CreditCustomer = {
  id: string; code?: string | null; firstName: string; lastName?: string | null;
  phone: string; creditLimit: number; creditBalance: number; creditDays: number;
  walletBalance?: number;
  available: number; utilizationPct: number; nextDueDate?: string | null;
  daysPastDue: number; isOverdue: boolean;
};

type Schedule = {
  id: string; totalAmount: number; installmentCount: number; status: string; startDate: string;
  customer: { firstName: string; lastName?: string | null; phone: string };
  lines: { sequence: number; dueDate: string; amount: number; paidAmount: number; status: string }[];
};

type Reminder = {
  id: string; title: string; message: string; status: string; sentAt?: string | null; createdAt: string;
  customer: { firstName: string; lastName?: string | null; phone: string; creditBalance: number };
};

type CollectionReport = {
  outstanding: number; overdueAmount: number; collectedInPeriod: number; chargedInPeriod: number;
  recoveryRate: number; creditCustomerCount: number; overdueCustomerCount: number;
  payments: { id: string; amount: number; createdAt: string; customer: { firstName: string; phone: string } }[];
  overdue: { id: string; amount: number; dueDate: string; daysPastDue: number; customer: { firstName: string; phone: string } }[];
};

type PaymentRow = CollectionReport["payments"][number];
type OverdueRow = CollectionReport["overdue"][number];

export type CreditSection = "customers" | "schedules" | "reminders" | "collections";

const SECTION_META: Record<CreditSection, { title: string; description: string }> = {
  customers: { title: "Credit Customers", description: "Limits, balances and overdue status" },
  schedules: { title: "Schedules", description: "Installment plans and due lines" },
  reminders: { title: "Reminders", description: "Queued and sent credit reminders" },
  collections: { title: "Collections", description: "Recovery rates and overdue charges" },
};

export function CustomerCreditHub({ section }: { section: CreditSection }) {
  const { profile, workspace } = useShopWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [report, setReport] = useState<CollectionReport | null>(null);
  const [repStart, setRepStart] = useState(monthStart);
  const [repEnd, setRepEnd] = useState(today);

  const [schCustomerId, setSchCustomerId] = useState("");
  const [schAmount, setSchAmount] = useState("");
  const [schCount, setSchCount] = useState("3");
  const [schBusy, setSchBusy] = useState(false);

  const [payCustomer, setPayCustomer] = useState<CreditCustomer | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [payChequeNumber, setPayChequeNumber] = useState("");
  const [payChequeBank, setPayChequeBank] = useState("");
  const [payChequeDue, setPayChequeDue] = useState("");
  const [payFromWallet, setPayFromWallet] = useState(false);
  const [payBusy, setPayBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cR, sR, rR, repR] = await Promise.all([
        api.get<CreditCustomer[]>("/customers/credit/customers"),
        api.get<Schedule[]>("/customers/credit/schedules"),
        api.get<Reminder[]>("/customers/credit/reminders"),
        api.get<CollectionReport>(`/customers/credit/collection-report?startDate=${repStart}&endDate=${repEnd}`),
      ]);
      setCustomers(Array.isArray(cR.data) ? cR.data : []);
      setSchedules(Array.isArray(sR.data) ? sR.data : []);
      setReminders(Array.isArray(rR.data) ? rR.data : []);
      setReport(repR.data ?? null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load credit data");
    } finally {
      setLoading(false);
    }
  }, [repStart, repEnd]);

  useEffect(() => { load(); }, [load]);

  const createSchedule = async () => {
    if (!schCustomerId || !schAmount) { toast.error("Select customer and amount"); return; }
    setSchBusy(true);
    try {
      await api.post("/customers/credit/schedules", {
        customerId: schCustomerId,
        totalAmount: parseFloat(schAmount),
        installmentCount: parseInt(schCount, 10) || 3,
        startDate: today,
      });
      toast.success("Payment schedule created");
      setSchAmount("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Schedule failed");
    } finally {
      setSchBusy(false);
    }
  };

  const sendReminder = async (customerId: string) => {
    try {
      await api.post("/customers/credit/reminders", { customerId, sendNow: true });
      toast.success("Reminder sent");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Reminder failed");
    }
  };

  const queueOverdue = async () => {
    try {
      const r = await api.post<{ queued: number }>("/customers/credit/reminders/queue-overdue", {});
      toast.success(`Queued ${(r.data as { queued?: number })?.queued ?? 0} overdue reminders`);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Queue failed");
    }
  };

  const openSettle = (c: CreditCustomer) => {
    setPayCustomer(c);
    setPayAmount(c.creditBalance > 0 ? String(c.creditBalance) : "");
    setPayMethod("CASH");
    setPayChequeNumber("");
    setPayChequeBank("");
    setPayChequeDue("");
    setPayFromWallet(false);
  };

  const submitSettle = async () => {
    if (!payCustomer) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter a valid amount"); return; }
    if (payFromWallet && amt > (payCustomer.walletBalance ?? 0) + 0.01) {
      toast.error("Amount exceeds wallet advance");
      return;
    }
    if (!payFromWallet && payMethod === "CHEQUE" && !payChequeNumber.trim()) {
      toast.error("Cheque number is required");
      return;
    }
    setPayBusy(true);
    try {
      const res = await api.post<{
        appliedToCredit?: number;
        advanceToWallet?: number;
        creditBalance?: number;
        walletBalance?: number;
      }>(`/customers/${payCustomer.id}/credit/payment`, {
        amount: amt,
        description: payFromWallet ? "Credit settled from wallet advance" : "Credit payment received",
        paymentMethod: payFromWallet ? "WALLET" : payMethod,
        applyFromWallet: payFromWallet,
        ...(!payFromWallet && payMethod === "CHEQUE"
          ? {
              chequeNumber: payChequeNumber.trim(),
              chequeBankName: payChequeBank.trim() || undefined,
              chequeDueDate: payChequeDue || undefined,
            }
          : {}),
      });
      const applied = res.data?.appliedToCredit ?? amt;
      const advance = res.data?.advanceToWallet ?? 0;
      if (advance > 0) {
        toast.success(`Settled LKR ${formatNumber(applied)} · Advance LKR ${formatNumber(advance)} → wallet`);
      } else {
        toast.success(`Settled LKR ${formatNumber(applied)}`);
      }
      setPayCustomer(null);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Payment failed");
    } finally {
      setPayBusy(false);
    }
  };

  const cancelSchedule = async (id: string) => {
    try {
      await api.post(`/customers/credit/schedules/${id}/cancel`, {});
      toast.success("Schedule cancelled");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Cancel failed");
    }
  };

  const customerColumns = useMemo<ColumnDef<CreditCustomer>[]>(() => [
    {
      id: "customer",
      accessorFn: (c) => `${c.firstName} ${c.lastName ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.firstName} {row.original.lastName}</p>
          <p className="text-xs text-muted-foreground">{row.original.phone}</p>
        </div>
      ),
    },
    {
      id: "balance",
      accessorKey: "creditBalance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium tabular-nums">LKR {formatNumber(row.original.creditBalance)}</span>
      ),
    },
    {
      id: "advance",
      accessorFn: (c) => c.walletBalance ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Advance" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">
          LKR {formatNumber(row.original.walletBalance ?? 0)}
        </span>
      ),
    },
    {
      id: "limit",
      accessorKey: "creditLimit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Limit" />,
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground tabular-nums">LKR {formatNumber(row.original.creditLimit)}</span>
      ),
    },
    {
      id: "terms",
      accessorKey: "creditDays",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Terms" />,
      cell: ({ row }) => <span className="text-xs">{row.original.creditDays}d</span>,
    },
    {
      id: "nextDue",
      accessorFn: (c) => c.nextDueDate ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Next Due" />,
      cell: ({ row }) => (
        <span className="text-xs">
          {row.original.nextDueDate ? String(row.original.nextDueDate).slice(0, 10) : "—"}
        </span>
      ),
    },
    {
      id: "status",
      accessorFn: (c) => (c.isOverdue ? "overdue" : c.creditBalance > 0 ? "current" : "clear"),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const c = row.original;
        if (c.isOverdue) return <Badge variant="danger" className="text-[10px]">{c.daysPastDue}d overdue</Badge>;
        if (c.creditBalance > 0) return <Badge variant="outline" className="text-[10px]">Current</Badge>;
        return <Badge variant="secondary" className="text-[10px]">Clear</Badge>;
      },
    },
    {
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      cell: ({ row }) => {
        const c = row.original;
        return (
          <div className="flex gap-1.5 justify-end">
            {(c.creditBalance > 0 || (c.walletBalance ?? 0) > 0) && (
              <Button size="sm" className="h-7 text-xs gap-1 bg-amber-600 hover:bg-amber-700" onClick={() => openSettle(c)}>
                <Wallet className="h-3 w-3" /> Settle
              </Button>
            )}
            {c.creditBalance > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => sendReminder(c.id)}>
                <Bell className="h-3 w-3" /> Remind
              </Button>
            )}
          </div>
        );
      },
    },
  ], []);

  const reminderColumns = useMemo<ColumnDef<Reminder>[]>(() => [
    {
      id: "customer",
      accessorFn: (r) => `${r.customer.firstName} ${r.customer.lastName ?? ""}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium">
          {row.original.customer.firstName} {row.original.customer.lastName}
        </span>
      ),
    },
    {
      id: "title",
      accessorKey: "title",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Title" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.title}</p>
          <p className="text-xs text-muted-foreground line-clamp-1">{row.original.message}</p>
        </div>
      ),
    },
    {
      id: "status",
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => <Badge variant="outline" className="text-[10px]">{row.original.status}</Badge>,
    },
    {
      id: "sent",
      accessorFn: (r) => r.sentAt ?? "",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sent" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.sentAt ? String(row.original.sentAt).slice(0, 16).replace("T", " ") : "—"}
        </span>
      ),
    },
  ], []);

  const paymentColumns = useMemo<ColumnDef<PaymentRow>[]>(() => [
    {
      id: "customer",
      accessorFn: (p) => p.customer.firstName,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.customer.firstName}</span>,
    },
    {
      id: "date",
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">{String(row.original.createdAt).slice(0, 10)}</span>
      ),
    },
    {
      id: "amount",
      accessorKey: "amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium tabular-nums text-emerald-600">
          LKR {formatNumber(row.original.amount)}
        </span>
      ),
    },
  ], []);

  const overdueColumns = useMemo<ColumnDef<OverdueRow>[]>(() => [
    {
      id: "customer",
      accessorFn: (o) => o.customer.firstName,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.customer.firstName}</span>,
    },
    {
      id: "due",
      accessorFn: (o) => `${o.daysPastDue} · ${o.dueDate}`,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {row.original.daysPastDue}d · due {String(row.original.dueDate).slice(0, 10)}
        </span>
      ),
    },
    {
      id: "amount",
      accessorKey: "amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="text-sm font-medium tabular-nums text-amber-600">
          LKR {formatNumber(row.original.amount)}
        </span>
      ),
    },
  ], []);

  const STATS = [
    {
      label: "Outstanding",
      value: `LKR ${formatNumber(report?.outstanding ?? 0)}`,
      icon: Wallet,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: "Overdue",
      value: `LKR ${formatNumber(report?.overdueAmount ?? 0)}`,
      icon: AlertTriangle,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
    {
      label: "Collected (period)",
      value: `LKR ${formatNumber(report?.collectedInPeriod ?? 0)}`,
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Recovery Rate",
      value: `${report?.recoveryRate ?? 0}%`,
      icon: TrendingUp,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">{SECTION_META[section].title}</h1>
          <p className="text-sm text-muted-foreground">
            {profile.label} · {workspace.customerLabel} · {SECTION_META[section].description}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => load()} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={queueOverdue} className="gap-1.5">
            <Bell className="h-3.5 w-3.5" /> Queue Overdue
          </Button>
        </div>
      </div>

      {(section === "customers" || section === "collections") && (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((st) => (
          <Card key={st.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${st.bg}`}>
                <st.icon className={`h-5 w-5 ${st.color}`} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight">{st.value}</p>
                <p className="text-xs text-muted-foreground">{st.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      )}

        {section === "customers" && (
        <div className="mt-0">
          {loading && !customers.length ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={customers}
              columns={customerColumns}
              pageCount={Math.ceil(customers.length / 10) || 1}
              searchableColumns={[
                { id: "customer", title: "Customer" },
                { id: "status", title: "Status" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "credit-customers" }}
            />
          )}
        </div>
        )}

        {section === "schedules" && (
        <div className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-500/10">
                  <Plus className="h-4 w-4 text-indigo-500" />
                </div>
                <h3 className="text-sm font-semibold">New installment plan</h3>
              </div>
              <div className="grid sm:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Customer</label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={schCustomerId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSchCustomerId(id);
                      const c = customers.find((x) => x.id === id);
                      if (c?.creditBalance) setSchAmount(String(c.creditBalance));
                    }}
                  >
                    <option value="">Select customer</option>
                    {customers.filter((c) => c.creditBalance > 0).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.firstName} {c.lastName} — {formatNumber(c.creditBalance)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Total amount</label>
                  <Input type="number" placeholder="Amount" value={schAmount} onChange={(e) => setSchAmount(e.target.value)} className="h-9" />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Installments</label>
                  <Input type="number" placeholder="Count" value={schCount} onChange={(e) => setSchCount(e.target.value)} className="h-9" />
                </div>
                <Button onClick={createSchedule} disabled={schBusy} className="h-9 gap-1.5">
                  {schBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {schedules.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-semibold text-sm">{s.customer.firstName} {s.customer.lastName}</p>
                      <p className="text-xs text-muted-foreground">
                        {s.installmentCount} installments · LKR {formatNumber(s.totalAmount)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{s.status}</Badge>
                      {s.status === "ACTIVE" && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={() => cancelSchedule(s.id)}>
                          Cancel
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {s.lines.map((l) => (
                      <div key={l.sequence} className="rounded-xl border px-3 py-2 text-xs">
                        <p className="text-muted-foreground">#{l.sequence} · {String(l.dueDate).slice(0, 10)}</p>
                        <p className="font-semibold tabular-nums mt-0.5">LKR {formatNumber(l.amount)}</p>
                        <p className="text-muted-foreground mt-0.5">{l.status} · paid {formatNumber(l.paidAmount)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {!schedules.length && (
              <p className="text-sm text-muted-foreground text-center py-8">No schedules yet</p>
            )}
          </div>
        </div>
        )}

        {section === "reminders" && (
        <div className="mt-4">
          {loading && !reminders.length ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientSideTable
              data={reminders}
              columns={reminderColumns}
              pageCount={Math.ceil(reminders.length / 10) || 1}
              searchableColumns={[
                { id: "customer", title: "Customer" },
                { id: "title", title: "Title" },
                { id: "status", title: "Status" },
              ]}
              filterableColumns={[]}
              isShowExportButtons={{ isShow: true, fileName: "credit-reminders" }}
            />
          )}
        </div>
        )}

        {section === "collections" && (
        <div className="mt-4 space-y-4">
          <Card>
            <CardContent className="p-4 flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">From</label>
                <Input type="date" value={repStart} onChange={(e) => setRepStart(e.target.value)} className="w-40 h-9" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold">To</label>
                <Input type="date" value={repEnd} onChange={(e) => setRepEnd(e.target.value)} className="w-40 h-9" />
              </div>
              <Button size="sm" onClick={() => load()} className="h-9 gap-1.5">
                <FileBarChart className="h-3.5 w-3.5" /> Load Report
              </Button>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm font-semibold">Payments received</p>
              <ClientSideTable
                data={report?.payments ?? []}
                columns={paymentColumns}
                pageCount={Math.ceil((report?.payments?.length ?? 0) / 10) || 1}
                searchableColumns={[{ id: "customer", title: "Customer" }]}
                filterableColumns={[]}
                isShowExportButtons={{ isShow: true, fileName: "credit-payments" }}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold">Overdue charges</p>
              <ClientSideTable
                data={report?.overdue ?? []}
                columns={overdueColumns}
                pageCount={Math.ceil((report?.overdue?.length ?? 0) / 10) || 1}
                searchableColumns={[{ id: "customer", title: "Customer" }]}
                filterableColumns={[]}
                isShowExportButtons={{ isShow: true, fileName: "credit-overdue" }}
              />
            </div>
          </div>
        </div>
        )}

      {payCustomer && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !payBusy) setPayCustomer(null);
          }}
        >
          <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="text-base font-bold">Settle / Advance</h2>
              <p className="text-xs text-muted-foreground">
                {payCustomer.firstName} {payCustomer.lastName} · Outstanding LKR {formatNumber(payCustomer.creditBalance)}
                {(payCustomer.walletBalance ?? 0) > 0
                  ? ` · Wallet LKR ${formatNumber(payCustomer.walletBalance ?? 0)}`
                  : ""}
              </p>
            </div>
            <div className="p-5 space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold">Amount (LKR)</label>
                <Input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="h-9"
                />
                <p className="text-[10px] text-muted-foreground">
                  Overpay settles AR first; excess becomes wallet advance for future sales.
                </p>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={payFromWallet}
                  onChange={(e) => {
                    setPayFromWallet(e.target.checked);
                    if (e.target.checked) {
                      const max = Math.min(payCustomer.creditBalance, payCustomer.walletBalance ?? 0);
                      setPayAmount(max > 0 ? String(max) : "");
                    }
                  }}
                  disabled={(payCustomer.walletBalance ?? 0) <= 0 || payCustomer.creditBalance <= 0}
                />
                Apply from wallet advance
              </label>
              {!payFromWallet && (
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Method</label>
                  <select
                    className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    <option value="CASH">Cash</option>
                    <option value="CARD">Card</option>
                    <option value="BANK_TRANSFER">Bank transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="CHEQUE">Cheque</option>
                  </select>
                </div>
              )}
              {!payFromWallet && payMethod === "CHEQUE" && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Cheque number *</label>
                    <Input
                      className="h-9"
                      value={payChequeNumber}
                      onChange={(e) => setPayChequeNumber(e.target.value)}
                      placeholder="Cheque #"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Cheque bank</label>
                      <Input
                        className="h-9"
                        value={payChequeBank}
                        onChange={(e) => setPayChequeBank(e.target.value)}
                        placeholder="e.g. BOC"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-semibold">Due date</label>
                      <Input
                        type="date"
                        className="h-9"
                        value={payChequeDue}
                        onChange={(e) => setPayChequeDue(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className={modalBarFooterClass}>
              <Button variant="outline" size="sm" disabled={payBusy} onClick={() => setPayCustomer(null)}>
                Cancel
              </Button>
              <Button size="sm" disabled={payBusy} onClick={submitSettle} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
                {payBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
