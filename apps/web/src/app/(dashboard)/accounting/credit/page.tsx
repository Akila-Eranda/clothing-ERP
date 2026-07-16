"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell, CalendarClock, FileBarChart, Loader2, Plus, RefreshCw, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

type CreditCustomer = {
  id: string; code?: string | null; firstName: string; lastName?: string | null;
  phone: string; creditLimit: number; creditBalance: number; creditDays: number;
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

export default function CustomerCreditPage() {
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

  if (loading && !customers.length) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customer Credit</h1>
          <p className="text-sm text-muted-foreground">Due dates, schedules, reminders & collections</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Outstanding</div>
          <div className="text-xl font-semibold tabular-nums">LKR {formatNumber(report?.outstanding ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Overdue</div>
          <div className="text-xl font-semibold tabular-nums text-amber-600">LKR {formatNumber(report?.overdueAmount ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Collected (period)</div>
          <div className="text-xl font-semibold tabular-nums text-emerald-600">LKR {formatNumber(report?.collectedInPeriod ?? 0)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4">
          <div className="text-xs text-muted-foreground">Recovery rate</div>
          <div className="text-xl font-semibold tabular-nums">{report?.recoveryRate ?? 0}%</div>
        </CardContent></Card>
      </div>

      <Tabs defaultValue="customers">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="customers"><Users className="h-3.5 w-3.5 mr-1.5" />Credit Customers</TabsTrigger>
          <TabsTrigger value="schedules"><CalendarClock className="h-3.5 w-3.5 mr-1.5" />Schedules</TabsTrigger>
          <TabsTrigger value="reminders"><Bell className="h-3.5 w-3.5 mr-1.5" />Reminders</TabsTrigger>
          <TabsTrigger value="collections"><FileBarChart className="h-3.5 w-3.5 mr-1.5" />Collections</TabsTrigger>
        </TabsList>

        <TabsContent value="customers" className="mt-4 space-y-3">
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                  <th className="px-3 py-2 text-right">Limit</th>
                  <th className="px-3 py-2">Terms</th>
                  <th className="px-3 py-2">Next due</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.firstName} {c.lastName}</div>
                      <div className="text-xs text-muted-foreground">{c.phone}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">LKR {formatNumber(c.creditBalance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">LKR {formatNumber(c.creditLimit)}</td>
                    <td className="px-3 py-2 text-xs">{c.creditDays}d</td>
                    <td className="px-3 py-2 text-xs">{c.nextDueDate ? String(c.nextDueDate).slice(0, 10) : "—"}</td>
                    <td className="px-3 py-2">
                      {c.isOverdue
                        ? <Badge variant="destructive">{c.daysPastDue}d overdue</Badge>
                        : c.creditBalance > 0
                          ? <Badge variant="outline">Current</Badge>
                          : <Badge variant="secondary">Clear</Badge>}
                    </td>
                    <td className="px-3 py-2">
                      {c.creditBalance > 0 && (
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => sendReminder(c.id)}>
                          Remind
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!customers.length && (
                  <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No credit customers</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="schedules" className="mt-4 space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="text-sm font-medium flex items-center gap-2"><Plus className="h-4 w-4" /> New installment plan</h3>
            <div className="grid sm:grid-cols-4 gap-2">
              <select
                className="h-10 rounded-md border bg-background px-3 text-sm"
                value={schCustomerId}
                onChange={(e) => setSchCustomerId(e.target.value)}
              >
                <option value="">Select customer</option>
                {customers.filter((c) => c.creditBalance > 0).map((c) => (
                  <option key={c.id} value={c.id}>{c.firstName} {c.lastName} — {formatNumber(c.creditBalance)}</option>
                ))}
              </select>
              <Input type="number" placeholder="Total amount" value={schAmount} onChange={(e) => setSchAmount(e.target.value)} />
              <Input type="number" placeholder="Installments" value={schCount} onChange={(e) => setSchCount(e.target.value)} />
              <Button onClick={createSchedule} disabled={schBusy}>
                {schBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {schedules.map((s) => (
              <div key={s.id} className="rounded-lg border p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium">{s.customer.firstName} {s.customer.lastName}</div>
                    <div className="text-xs text-muted-foreground">{s.installmentCount} installments · LKR {formatNumber(s.totalAmount)}</div>
                  </div>
                  <Badge variant="outline">{s.status}</Badge>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {s.lines.map((l) => (
                    <div key={l.sequence} className="rounded border px-2 py-1.5 text-xs">
                      <div className="text-muted-foreground">#{l.sequence} · {String(l.dueDate).slice(0, 10)}</div>
                      <div className="font-medium tabular-nums">LKR {formatNumber(l.amount)}</div>
                      <div className="text-muted-foreground">{l.status} · paid {formatNumber(l.paidAmount)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {!schedules.length && <p className="text-sm text-muted-foreground text-center py-6">No schedules yet</p>}
          </div>
        </TabsContent>

        <TabsContent value="reminders" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={queueOverdue}>
              <Bell className="h-4 w-4 mr-2" /> Queue overdue reminders
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Sent</th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.customer.firstName} {r.customer.lastName}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{r.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1">{r.message}</div>
                    </td>
                    <td className="px-3 py-2"><Badge variant="outline">{r.status}</Badge></td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.sentAt ? String(r.sentAt).slice(0, 16).replace("T", " ") : "—"}
                    </td>
                  </tr>
                ))}
                {!reminders.length && (
                  <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">No reminders yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="collections" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={repStart} onChange={(e) => setRepStart(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={repEnd} onChange={(e) => setRepEnd(e.target.value)} className="w-40" />
            </div>
            <Button size="sm" onClick={() => load()}>Load report</Button>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold bg-muted/40">Payments received</div>
              <table className="w-full text-sm">
                <tbody>
                  {(report?.payments ?? []).map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="px-3 py-2">{p.customer.firstName}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{String(p.createdAt).slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-emerald-600">LKR {formatNumber(p.amount)}</td>
                    </tr>
                  ))}
                  {!report?.payments?.length && (
                    <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={3}>No payments in period</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <div className="px-3 py-2 text-xs font-semibold bg-muted/40">Overdue charges</div>
              <table className="w-full text-sm">
                <tbody>
                  {(report?.overdue ?? []).map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="px-3 py-2">{o.customer.firstName}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{o.daysPastDue}d · due {String(o.dueDate).slice(0, 10)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-amber-600">LKR {formatNumber(o.amount)}</td>
                    </tr>
                  ))}
                  {!report?.overdue?.length && (
                    <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={3}>No overdue charges</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
