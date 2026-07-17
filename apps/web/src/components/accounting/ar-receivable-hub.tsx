"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FileText, Loader2, Printer, RefreshCw, Wallet, Banknote, FileMinus2,
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

type Tab = "dashboard" | "statement" | "payment";

type CreditCustomer = {
  id: string;
  code?: string | null;
  firstName: string;
  lastName?: string | null;
  phone: string;
  creditBalance: number;
  creditLimit: number;
  walletBalance?: number;
};

type ArDashboard = {
  asOf: string;
  kpis: {
    totalOutstanding: number;
    overdueAmount: number;
    customerCount: number;
    openChargeCount: number;
    collectedThisMonth: number;
    paymentCountThisMonth: number;
    creditNotesThisMonth: number;
    creditNoteCountThisMonth: number;
  };
  aging: {
    buckets: Record<string, { count: number; amount: number }>;
    total: number;
  };
  topDebtors: CreditCustomer[];
  overdueCharges: Array<{
    id: string;
    partyName: string;
    amount: number;
    daysPastDue: number;
    bucket: string;
    description?: string | null;
    customer?: CreditCustomer;
  }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    createdAt: string;
    description?: string | null;
    customer: { id: string; code?: string | null; firstName: string; lastName?: string | null };
  }>;
};

type Statement = {
  customer: CreditCustomer & { email?: string | null; creditDays?: number };
  opening: number;
  closing: number;
  currentBalance: number;
  period: { startDate: string | null; endDate: string | null };
  entries: Array<{
    id: string;
    type: string;
    amount: number;
    debit: number;
    credit: number;
    balanceAfter: number;
    createdAt: string;
    description?: string | null;
    sale?: { invoiceNumber: string } | null;
  }>;
  openCharges: Array<{
    id: string;
    open: number;
    dueDate?: string | null;
    description?: string | null;
    daysPastDue: number;
  }>;
};

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nameOf(c: { firstName: string; lastName?: string | null; code?: string | null }) {
  return `${c.firstName}${c.lastName ? ` ${c.lastName}` : ""}${c.code ? ` (${c.code})` : ""}`;
}

export function ArReceivableHub({ initialTab = "dashboard" }: { initialTab?: Tab }) {
  useShopWorkspace();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: "dashboard", label: "Receivable Dashboard", icon: Wallet },
    { id: "statement", label: "Customer Statement", icon: FileText },
    { id: "payment", label: "Payment Screen", icon: Banknote },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Accounts Receivable</h1>
        <p className="text-sm text-muted-foreground">
          Customer ledger, statements, collections, and credit notes — driven by sales credit charges
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

      {tab === "dashboard" && <DashboardPanel />}
      {tab === "statement" && <StatementPanel />}
      {tab === "payment" && <PaymentPanel />}
    </div>
  );
}

function DashboardPanel() {
  const [data, setData] = useState<ArDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ArDashboard>("/customers/credit/ar-dashboard");
      setData(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load AR dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const k = data?.kpis;
  const buckets = data?.aging?.buckets ?? {};

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Total outstanding", value: k?.totalOutstanding ?? 0 },
          { label: "Overdue", value: k?.overdueAmount ?? 0, warn: true },
          { label: "Collected (month)", value: k?.collectedThisMonth ?? 0 },
          { label: "Credit notes (month)", value: k?.creditNotesThisMonth ?? 0 },
        ].map((card) => (
          <Card key={card.label}>
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{card.label}</p>
              <p className={`text-xl font-bold tabular-nums mt-1 ${card.warn ? "text-amber-600" : ""}`}>
                LKR {formatNumber(card.value)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid sm:grid-cols-5 gap-2">
        {Object.entries(BUCKET_LABELS).map(([key, label]) => {
          const b = buckets[key] ?? { count: 0, amount: 0 };
          return (
            <Card key={key}>
              <CardContent className="p-3">
                <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
                <p className="text-sm font-bold tabular-nums">{formatNumber(b.amount)}</p>
                <p className="text-[10px] text-muted-foreground">{b.count} charges</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Top debtors</h3>
            {(data?.topDebtors ?? []).map((c) => (
              <div key={c.id} className="flex justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                <span>
                  {nameOf(c)}
                  <span className="text-muted-foreground text-xs ml-2">{c.phone}</span>
                </span>
                <span className="font-medium tabular-nums">{formatNumber(c.creditBalance)}</span>
              </div>
            ))}
            {!data?.topDebtors?.length && (
              <p className="text-sm text-muted-foreground py-6 text-center">No outstanding receivables</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Recent payments</h3>
            {(data?.recentPayments ?? []).map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                <span>
                  {nameOf(p.customer)}
                  <span className="text-muted-foreground text-xs ml-2">{fmt(p.createdAt)}</span>
                </span>
                <span className="font-medium tabular-nums text-emerald-600">+{formatNumber(p.amount)}</span>
              </div>
            ))}
            {!data?.recentPayments?.length && (
              <p className="text-sm text-muted-foreground py-6 text-center">No payments yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-semibold">Overdue open charges</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <th className="text-left px-4 py-2">Customer</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-right px-4 py-2">Amount</th>
                  <th className="text-right px-4 py-2">DPD</th>
                  <th className="text-left px-4 py-2">Bucket</th>
                </tr>
              </thead>
              <tbody>
                {(data?.overdueCharges ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-border/40">
                    <td className="px-4 py-2">{c.partyName}</td>
                    <td className="px-4 py-2 text-muted-foreground truncate max-w-[220px]">{c.description || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{formatNumber(c.amount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-600">{c.daysPastDue}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-[10px]">{BUCKET_LABELS[c.bucket] ?? c.bucket}</Badge>
                    </td>
                  </tr>
                ))}
                {!data?.overdueCharges?.length && (
                  <tr>
                    <td colSpan={5} className="text-center text-muted-foreground py-10">No overdue charges</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatementPanel() {
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<CreditCustomer[]>("/customers/credit/customers");
        setCustomers(Array.isArray(res.data) ? res.data : []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const load = async () => {
    if (!customerId) {
      toast.error("Select a customer");
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ startDate: start, endDate: end });
      const res = await api.get<Statement>(`/customers/${customerId}/credit/statement?${qs}`);
      setStmt(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load statement");
    } finally {
      setLoading(false);
    }
  };

  const print = () => {
    const html = printRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>Statement</title>
      <style>
        body{font-family:Georgia,serif;padding:32px;color:#111}
        h1{font-size:20px;margin:0 0 4px} .meta{color:#555;font-size:12px;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}
        .num{text-align:right;font-variant-numeric:tabular-nums}
      </style></head><body>${html}<script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[220px] flex-1">
            <Label className="text-xs">Customer</Label>
            <Select value={customerId || "_none"} onValueChange={(v) => setCustomerId(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select customer…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Select customer…</SelectItem>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {nameOf(c)} — {formatNumber(c.creditBalance)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-40" />
          </div>
          <Button size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load"}
          </Button>
          {stmt && (
            <Button size="sm" variant="outline" className="h-9" onClick={print}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print
            </Button>
          )}
        </CardContent>
      </Card>

      {stmt && (
        <Card>
          <CardContent className="p-6" ref={printRef}>
            <h1 className="text-lg font-bold">Customer Statement</h1>
            <div className="meta text-sm text-muted-foreground mb-4 space-y-0.5">
              <div className="text-foreground font-medium">{nameOf(stmt.customer)}</div>
              <div>{stmt.customer.phone}{stmt.customer.email ? ` · ${stmt.customer.email}` : ""}</div>
              <div>
                Period {fmt(stmt.period.startDate)} → {fmt(stmt.period.endDate)} · Terms{" "}
                {stmt.customer.creditDays ?? 0} days
              </div>
              <div>
                Opening {formatNumber(stmt.opening)} · Closing {formatNumber(stmt.closing)} · Current{" "}
                {formatNumber(stmt.currentBalance)}
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase text-muted-foreground">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Description</th>
                  <th className="text-right py-2">Debit</th>
                  <th className="text-right py-2">Credit</th>
                  <th className="text-right py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {stmt.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/40">
                    <td className="py-2 text-muted-foreground">{fmt(e.createdAt)}</td>
                    <td className="py-2"><Badge variant="outline" className="text-[10px]">{e.type}</Badge></td>
                    <td className="py-2">
                      {e.description || "—"}
                      {e.sale?.invoiceNumber ? ` · ${e.sale.invoiceNumber}` : ""}
                    </td>
                    <td className="py-2 text-right tabular-nums">{e.debit ? formatNumber(e.debit) : ""}</td>
                    <td className="py-2 text-right tabular-nums">{e.credit ? formatNumber(e.credit) : ""}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatNumber(e.balanceAfter)}</td>
                  </tr>
                ))}
                {!stmt.entries.length && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-8">No activity in period</td>
                  </tr>
                )}
              </tbody>
            </table>

            {!!stmt.openCharges.length && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Open charges</h3>
                <div className="space-y-1 text-sm">
                  {stmt.openCharges.map((c) => (
                    <div key={c.id} className="flex justify-between border-b border-border/30 py-1">
                      <span>
                        {c.description || "Charge"} · due {fmt(c.dueDate)}
                        {c.daysPastDue > 0 ? ` · ${c.daysPastDue}d overdue` : ""}
                      </span>
                      <span className="tabular-nums font-medium">{formatNumber(c.open)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PaymentPanel() {
  const [customers, setCustomers] = useState<CreditCustomer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [desc, setDesc] = useState("Credit payment received");
  const [fromWallet, setFromWallet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [cnAmount, setCnAmount] = useState("");
  const [cnDesc, setCnDesc] = useState("Credit note");
  const [cnBusy, setCnBusy] = useState(false);
  const [cnOpen, setCnOpen] = useState(false);
  const [payments, setPayments] = useState<ArDashboard["recentPayments"]>([]);
  const [selected, setSelected] = useState<CreditCustomer | null>(null);

  const loadCustomers = useCallback(async () => {
    try {
      const [c, p] = await Promise.all([
        api.get<CreditCustomer[]>("/customers/credit/customers"),
        api.get<{ payments: ArDashboard["recentPayments"] }>("/customers/credit/payments?limit=30"),
      ]);
      setCustomers(Array.isArray(c.data) ? c.data : []);
      setPayments(p.data?.payments ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setSelected(customers.find((c) => c.id === customerId) ?? null);
  }, [customerId, customers]);

  const pay = async () => {
    const amt = parseFloat(amount);
    if (!customerId || !(amt > 0)) {
      toast.error("Select customer and amount");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{
        appliedToCredit: number;
        advanceToWallet: number;
        creditBalance: number;
      }>(`/customers/${customerId}/credit/payment`, {
        amount: amt,
        description: desc,
        paymentMethod: method,
        applyFromWallet: fromWallet,
      });
      toast.success(
        `Applied ${formatNumber(res.data?.appliedToCredit ?? 0)}` +
          (res.data?.advanceToWallet ? ` · Advance ${formatNumber(res.data.advanceToWallet)}` : ""),
      );
      setAmount("");
      setReceiveOpen(false);
      await loadCustomers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  const issueCn = async () => {
    const amt = parseFloat(cnAmount);
    if (!customerId || !(amt > 0)) {
      toast.error("Select customer and credit note amount");
      return;
    }
    setCnBusy(true);
    try {
      await api.post(`/customers/${customerId}/credit/credit-notes`, {
        amount: amt,
        description: cnDesc,
      });
      toast.success("Credit note issued");
      setCnAmount("");
      setCnOpen(false);
      await loadCustomers();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Credit note failed");
    } finally {
      setCnBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Receive payment
            </h3>
            <div className="space-y-1">
              <Label className="text-xs">Customer</Label>
              <Select value={customerId || "_none"} onValueChange={(v) => setCustomerId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select customer…</SelectItem>
                  {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {nameOf(c)} — due {formatNumber(c.creditBalance)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected && (
              <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground flex justify-between">
                <span>Outstanding {formatNumber(selected.creditBalance)}</span>
                <span>Wallet {formatNumber(selected.walletBalance ?? 0)}</span>
                <span>Limit {formatNumber(selected.creditLimit)}</span>
              </div>
            )}
            <Button
              onClick={() => setReceiveOpen(true)}
              disabled={busy || !customerId}
              className="gap-1.5"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
              Receive payment
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileMinus2 className="h-4 w-4" /> Credit note
            </h3>
            <p className="text-xs text-muted-foreground">
              Reduces outstanding AR (FIFO against open charges). Returns from sales also create credit notes automatically.
            </p>
            <Button
              variant="secondary"
              onClick={() => setCnOpen(true)}
              disabled={cnBusy || !customerId}
              className="gap-1.5"
            >
              {cnBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileMinus2 className="h-3.5 w-3.5" />}
              Issue credit note
            </Button>
          </CardContent>
        </Card>
      </div>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Receive payment</DialogTitle>
            <DialogDescription>Apply payment to the selected customer.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  className="h-9"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={setMethod} disabled={fromWallet || busy}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="h-9" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={busy} />
            </div>

            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={fromWallet}
                onChange={(e) => setFromWallet(e.target.checked)}
                className="rounded"
                disabled={busy}
              />
              Settle from wallet advance
            </label>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" disabled={busy} onClick={() => setReceiveOpen(false)}>Cancel</Button>
            <Button onClick={() => void pay()} disabled={busy || !customerId} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
              Receive payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={cnOpen} onOpenChange={setCnOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Issue credit note</DialogTitle>
            <DialogDescription>Reduces outstanding AR (FIFO).</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                className="h-9"
                value={cnAmount}
                onChange={(e) => setCnAmount(e.target.value)}
                disabled={cnBusy}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="h-9" value={cnDesc} onChange={(e) => setCnDesc(e.target.value)} disabled={cnBusy} />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" disabled={cnBusy} onClick={() => setCnOpen(false)}>Cancel</Button>
            <Button variant="secondary" onClick={() => void issueCn()} disabled={cnBusy || !customerId} className="gap-1.5">
              {cnBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileMinus2 className="h-3.5 w-3.5" />}
              Issue credit note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b flex justify-between items-center">
            <h3 className="text-sm font-semibold">Recent AR payments</h3>
            <Button variant="ghost" size="sm" onClick={() => void loadCustomers()}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <th className="text-left px-4 py-2">Date</th>
                  <th className="text-left px-4 py-2">Customer</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-border/40">
                    <td className="px-4 py-2 text-muted-foreground">{fmt(p.createdAt)}</td>
                    <td className="px-4 py-2">{nameOf(p.customer)}</td>
                    <td className="px-4 py-2 text-muted-foreground">{p.description || "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium text-emerald-600">
                      {formatNumber(p.amount)}
                    </td>
                  </tr>
                ))}
                {!payments.length && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted-foreground py-10">No payments this period</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
