"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Banknote, FileMinus2, FileText, Loader2, Printer, RefreshCw, Scale,
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

type Tab = "dashboard" | "statement" | "payment";

type Supplier = {
  id: string;
  code?: string | null;
  name: string;
  phone?: string;
  balance: number;
  creditLimit?: number;
  creditDays?: number;
};

type ApDashboard = {
  asOf: string;
  kpis: {
    totalOutstanding: number;
    overdueAmount: number;
    supplierCount: number;
    openInvoiceCount: number;
    paidThisMonth: number;
    paymentCountThisMonth: number;
    debitNotesThisMonth: number;
    debitNoteCountThisMonth: number;
  };
  aging: {
    current: number;
    days1to30: number;
    days31to60: number;
    days61to90: number;
    days90plus: number;
    total: number;
  };
  topCreditors: Supplier[];
  overdueLines: Array<{
    id: string;
    source: string;
    docNumber: string;
    amount: number;
    daysPastDue: number;
    supplierName: string;
  }>;
  recentPayments: Array<{
    id: string;
    amount: number;
    paidAt: string;
    notes?: string | null;
    supplier: { id: string; code?: string | null; name: string };
    invoice?: { invoiceNumber: string } | null;
    purchase?: { poNumber: string } | null;
  }>;
};

type Statement = {
  supplier: Supplier & { email?: string | null };
  opening: number;
  closing: number;
  currentBalance: number;
  outstanding: number;
  period: { startDate: string | null; endDate: string | null };
  entries: Array<{
    id: string;
    entryType: string;
    amount: number;
    debit: number;
    credit: number;
    balanceAfter: number;
    createdAt: string;
    notes?: string | null;
  }>;
  openLines: Array<{
    id: string;
    source: string;
    docNumber: string;
    amount: number;
    dueDate: string;
  }>;
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

export function ApPayableHub({ initialTab = "dashboard" }: { initialTab?: Tab }) {
  useShopWorkspace();
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const tabs: { id: Tab; label: string; icon: typeof Scale }[] = [
    { id: "dashboard", label: "Payable Dashboard", icon: Scale },
    { id: "statement", label: "Supplier Statement", icon: FileText },
    { id: "payment", label: "Payment Screen", icon: Banknote },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Accounts Payable</h1>
        <p className="text-sm text-muted-foreground">
          Supplier bills, statements, payments, and debit notes — driven by purchases / GRN
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
  const [data, setData] = useState<ApDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ApDashboard>("/suppliers/ap/dashboard");
      setData(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load AP dashboard");
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
  const aging = data?.aging;

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
          { label: "Paid (month)", value: k?.paidThisMonth ?? 0 },
          { label: "Debit notes (month)", value: k?.debitNotesThisMonth ?? 0 },
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
        {[
          ["Current", aging?.current],
          ["1–30", aging?.days1to30],
          ["31–60", aging?.days31to60],
          ["61–90", aging?.days61to90],
          ["90+", aging?.days90plus],
        ].map(([label, amt]) => (
          <Card key={String(label)}>
            <CardContent className="p-3">
              <p className="text-[10px] font-semibold text-muted-foreground">{label}</p>
              <p className="text-sm font-bold tabular-nums">{formatNumber(Number(amt ?? 0))}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Top creditors</h3>
            {(data?.topCreditors ?? []).map((s) => (
              <div key={s.id} className="flex justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                <span>{s.name}{s.code ? ` (${s.code})` : ""}</span>
                <span className="font-medium tabular-nums">{formatNumber(s.balance)}</span>
              </div>
            ))}
            {!data?.topCreditors?.length && (
              <p className="text-sm text-muted-foreground py-6 text-center">No outstanding payables</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Recent payments</h3>
            {(data?.recentPayments ?? []).map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1.5 border-b border-border/40 last:border-0">
                <span>
                  {p.supplier.name}
                  <span className="text-muted-foreground text-xs ml-2">{fmt(p.paidAt)}</span>
                </span>
                <span className="font-medium tabular-nums text-emerald-600">{formatNumber(p.amount)}</span>
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
            <h3 className="text-sm font-semibold">Overdue open lines</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <th className="text-left px-4 py-2">Supplier</th>
                  <th className="text-left px-4 py-2">Doc</th>
                  <th className="text-right px-4 py-2">Amount</th>
                  <th className="text-right px-4 py-2">DPD</th>
                </tr>
              </thead>
              <tbody>
                {(data?.overdueLines ?? []).map((l) => (
                  <tr key={`${l.source}-${l.id}`} className="border-b border-border/40">
                    <td className="px-4 py-2">{l.supplierName}</td>
                    <td className="px-4 py-2">
                      <Badge variant="outline" className="text-[10px] mr-1">{l.source}</Badge>
                      {l.docNumber}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{formatNumber(l.amount)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-amber-600">{l.daysPastDue}</td>
                  </tr>
                ))}
                {!data?.overdueLines?.length && (
                  <tr>
                    <td colSpan={4} className="text-center text-muted-foreground py-10">No overdue lines</td>
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [stmt, setStmt] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.get<{ data: Supplier[] } | Supplier[]>("/suppliers?limit=200");
        const raw = res.data;
        setSuppliers(Array.isArray(raw) ? raw : raw?.data ?? []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const load = async () => {
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({ startDate: start, endDate: end });
      const res = await api.get<Statement>(`/suppliers/${supplierId}/ap/statement?${qs}`);
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
    w.document.write(`<!DOCTYPE html><html><head><title>Supplier Statement</title>
      <style>
        body{font-family:Georgia,serif;padding:32px;color:#111}
        h1{font-size:20px;margin:0 0 4px} table{width:100%;border-collapse:collapse;font-size:12px}
        th,td{border-bottom:1px solid #ddd;padding:6px 4px;text-align:left}
      </style></head><body>${html}<script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[220px] flex-1">
            <Label className="text-xs">Supplier</Label>
            <Select value={supplierId || "_none"} onValueChange={(v) => setSupplierId(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Select supplier…</SelectItem>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name} — {formatNumber(s.balance ?? 0)}
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
            <h1 className="text-lg font-bold">Supplier Statement</h1>
            <div className="text-sm text-muted-foreground mb-4 space-y-0.5">
              <div className="text-foreground font-medium">{stmt.supplier.name}</div>
              <div>{stmt.supplier.phone}{stmt.supplier.email ? ` · ${stmt.supplier.email}` : ""}</div>
              <div>
                Period {fmt(stmt.period.startDate)} → {fmt(stmt.period.endDate)} · Terms{" "}
                {stmt.supplier.creditDays ?? 0} days
              </div>
              <div>
                Opening {formatNumber(stmt.opening)} · Closing {formatNumber(stmt.closing)} · Outstanding{" "}
                {formatNumber(stmt.outstanding)}
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-[10px] uppercase text-muted-foreground">
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-left py-2">Notes</th>
                  <th className="text-right py-2">Debit</th>
                  <th className="text-right py-2">Credit</th>
                  <th className="text-right py-2">Balance</th>
                </tr>
              </thead>
              <tbody>
                {stmt.entries.map((e) => (
                  <tr key={e.id} className="border-b border-border/40">
                    <td className="py-2 text-muted-foreground">{fmt(e.createdAt)}</td>
                    <td className="py-2"><Badge variant="outline" className="text-[10px]">{e.entryType}</Badge></td>
                    <td className="py-2">{e.notes || "—"}</td>
                    <td className="py-2 text-right tabular-nums">{e.debit ? formatNumber(e.debit) : ""}</td>
                    <td className="py-2 text-right tabular-nums">{e.credit ? formatNumber(e.credit) : ""}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{formatNumber(e.balanceAfter)}</td>
                  </tr>
                ))}
                {!stmt.entries.length && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-8">No ledger activity in period</td>
                  </tr>
                )}
              </tbody>
            </table>

            {!!stmt.openLines?.length && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold mb-2">Open AP lines</h3>
                {stmt.openLines.map((l) => (
                  <div key={`${l.source}-${l.id}`} className="flex justify-between text-sm border-b border-border/30 py-1">
                    <span>
                      <Badge variant="outline" className="text-[9px] mr-1">{l.source}</Badge>
                      {l.docNumber} · due {fmt(l.dueDate)}
                    </span>
                    <span className="tabular-nums font-medium">{formatNumber(l.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PaymentPanel() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [notes, setNotes] = useState("Supplier payment");
  const [busy, setBusy] = useState(false);
  const [dnAmount, setDnAmount] = useState("");
  const [dnReason, setDnReason] = useState("Debit note");
  const [dnBusy, setDnBusy] = useState(false);
  const [payments, setPayments] = useState<ApDashboard["recentPayments"]>([]);
  const [bills, setBills] = useState<Array<{
    id: string;
    invoiceNumber: string;
    total: number;
    paidAmount: number;
    status: string;
    supplier?: { name: string };
  }>>([]);
  const [selected, setSelected] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    try {
      const [s, p, b] = await Promise.all([
        api.get<{ data: Supplier[] } | Supplier[]>("/suppliers?limit=200"),
        api.get<{ payments: ApDashboard["recentPayments"] }>("/suppliers/ap/payments?limit=30"),
        api.get<Array<{
          id: string;
          invoiceNumber: string;
          total: number;
          paidAmount: number;
          status: string;
          supplier?: { name: string };
        }>>("/suppliers/ap/bills?limit=30"),
      ]);
      const raw = s.data;
      setSuppliers(Array.isArray(raw) ? raw : raw?.data ?? []);
      setPayments(p.data?.payments ?? []);
      setBills(Array.isArray(b.data) ? b.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected(suppliers.find((s) => s.id === supplierId) ?? null);
  }, [supplierId, suppliers]);

  const pay = async () => {
    const amt = parseFloat(amount);
    if (!supplierId || !(amt > 0)) {
      toast.error("Select supplier and amount");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<{ appliedTotal: number }>(`/suppliers/${supplierId}/ap/payment`, {
        amount: amt,
        method,
        notes,
      });
      toast.success(`Applied LKR ${formatNumber(res.data?.appliedTotal ?? amt)}`);
      setAmount("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Payment failed");
    } finally {
      setBusy(false);
    }
  };

  const issueDn = async () => {
    const amt = parseFloat(dnAmount);
    if (!supplierId || !(amt > 0)) {
      toast.error("Select supplier and debit note amount");
      return;
    }
    setDnBusy(true);
    try {
      await api.post(`/suppliers/${supplierId}/ap/debit-notes`, {
        amount: amt,
        reason: dnReason,
      });
      toast.success("Debit note issued");
      setDnAmount("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Debit note failed");
    } finally {
      setDnBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Banknote className="h-4 w-4" /> Pay supplier
            </h3>
            <div className="space-y-1">
              <Label className="text-xs">Supplier</Label>
              <Select value={supplierId || "_none"} onValueChange={(v) => setSupplierId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select supplier…</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} — due {formatNumber(s.balance ?? 0)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selected && (
              <div className="rounded-lg border px-3 py-2 text-xs text-muted-foreground">
                Outstanding LKR {formatNumber(selected.balance ?? 0)} · Terms {selected.creditDays ?? 30}d
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input type="number" className="h-9" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Method</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Cash</SelectItem>
                    <SelectItem value="CARD">Card</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Bank transfer</SelectItem>
                    <SelectItem value="CHEQUE">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <Button onClick={() => void pay()} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Banknote className="h-3.5 w-3.5" />}
              Pay (FIFO bills → POs)
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <FileMinus2 className="h-4 w-4" /> Debit note
            </h3>
            <p className="text-xs text-muted-foreground">
              Reduces outstanding AP (FIFO). Purchase returns also credit AP via the returns flow.
            </p>
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" className="h-9" value={dnAmount} onChange={(e) => setDnAmount(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Input className="h-9" value={dnReason} onChange={(e) => setDnReason(e.target.value)} />
            </div>
            <Button variant="secondary" onClick={() => void issueDn()} disabled={dnBusy || !supplierId} className="gap-1.5">
              {dnBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileMinus2 className="h-3.5 w-3.5" />}
              Issue debit note
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b flex justify-between items-center">
              <h3 className="text-sm font-semibold">Recent payments</h3>
              <Button variant="ghost" size="sm" onClick={() => void load()}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {payments.map((p) => (
                <div key={p.id} className="px-4 py-2 text-sm flex justify-between">
                  <span>
                    {p.supplier.name}
                    <span className="text-muted-foreground text-xs ml-2">{fmt(p.paidAt)}</span>
                  </span>
                  <span className="tabular-nums font-medium">{formatNumber(p.amount)}</span>
                </div>
              ))}
              {!payments.length && (
                <p className="text-center text-muted-foreground text-sm py-8">No payments</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold">Recent bills</h3>
            </div>
            <div className="divide-y max-h-64 overflow-y-auto">
              {bills.map((b) => (
                <div key={b.id} className="px-4 py-2 text-sm flex justify-between gap-2">
                  <span className="truncate">
                    {b.invoiceNumber}
                    <Badge variant="outline" className="text-[9px] ml-1">{b.status}</Badge>
                  </span>
                  <span className="tabular-nums shrink-0">
                    {formatNumber(b.paidAmount)} / {formatNumber(b.total)}
                  </span>
                </div>
              ))}
              {!bills.length && (
                <p className="text-center text-muted-foreground text-sm py-8">No bills</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
