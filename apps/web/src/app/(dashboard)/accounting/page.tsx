"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign, Plus, RefreshCw,
  X, Loader2, Trash2, Pencil, ArrowUpRight, ArrowDownRight, FileText,
  BarChart2, CreditCard, Wallet, Scale, Printer, Activity, Building2, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, PieChart, Pie, Cell, LineChart, Line } from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────
interface Expense {
  id: string; description: string; amount: number; date: string;
  categoryId?: string | null; paymentMethod: string; reference?: string | null;
  createdAt: string;
}
interface Account { id: string; code: string; name: string; type: string; balance: number; description?: string | null; }
interface PLData { month: string; revenue: number; expenses: number; profit: number; }
interface PLReport { period: { startDate: string; endDate: string }; revenue: { gross: number; returns: number; net: number }; expenses: { total: number; count: number }; netProfit: number; profitMargin: string; salesCount: number; }
interface CashFlowDay { date: string; inflow: number; outflow: number; }
interface JournalEntry { id: string; entryNumber: string; description: string; date: string; isPosted: boolean; lines: { id: string; type: string; amount: number; debitAccount?: { name: string; code: string } | null; creditAccount?: { name: string; code: string } | null; }[]; }
interface BalanceSheet { assets: { accounts: Account[]; operatingCash: number; totalExpenses: number; total: number }; liabilities: { accounts: Account[]; total: number }; equity: { accounts: Account[]; retainedEarnings: number; total: number }; revenue: { accounts: Account[]; total: number }; expenseAcct: { accounts: Account[]; total: number }; }

const PAY_METHODS = ["CASH","CARD","BANK_TRANSFER","ONLINE","CREDIT","CHEQUE"];
const CATEGORIES  = ["Payroll","Rent","Utilities","Marketing","Operations","Logistics","Assets","Other"];
const CAT_COLORS = ["#6366f1","#f43f5e","#10b981","#f59e0b","#3b82f6","#8b5cf6","#06b6d4","#84cc16","#ec4899"];

const ACCT_TYPE_CFG: Record<string, { label: string; color: string; bg: string; grad: string }> = {
  ASSET:     { label: "Asset",     color: "text-emerald-600", bg: "bg-emerald-500/10", grad: "from-emerald-500 to-teal-500" },
  LIABILITY: { label: "Liability", color: "text-red-600",     bg: "bg-red-500/10",     grad: "from-red-500 to-rose-500" },
  EQUITY:    { label: "Equity",    color: "text-blue-600",    bg: "bg-blue-500/10",    grad: "from-blue-500 to-indigo-500" },
  REVENUE:   { label: "Revenue",   color: "text-violet-600",  bg: "bg-violet-500/10", grad: "from-violet-500 to-purple-500" },
  EXPENSE:   { label: "Expense",   color: "text-amber-600",   bg: "bg-amber-500/10",  grad: "from-amber-500 to-orange-500" },
};

// ── Expense Modal ────────────────────────────────────────────────────────────
function ExpenseModal({ edit, onClose, onSaved }: { edit?: Expense | null; onClose: () => void; onSaved: () => void }) {
  const [amount, setAmount]       = useState(edit?.amount?.toString() ?? "");
  const [description, setDesc]    = useState(edit?.description ?? "");
  const [date, setDate]           = useState(edit?.date ? edit.date.split("T")[0] : new Date().toISOString().split("T")[0]);
  const [category, setCategory]   = useState(edit?.categoryId ?? "");
  const [method, setMethod]       = useState(edit?.paymentMethod ?? "CASH");
  const [reference, setReference] = useState(edit?.reference ?? "");
  const [saving, setSaving]       = useState(false);

  const save = async () => {
    if (!amount || !description || !date) { toast.error("Fill required fields"); return; }
    setSaving(true);
    try {
      const payload = { amount: parseFloat(amount), description, date, categoryId: category || null, paymentMethod: method, reference: reference || null };
      if (edit) { await api.put(`/accounting/expenses/${edit.id}`, payload); toast.success("Expense updated"); }
      else       { await api.post("/accounting/expenses", payload);           toast.success("Expense recorded"); }
      onSaved(); onClose();
    } catch { toast.error("Failed to save expense"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold">{edit ? "Edit Expense" : "Record Expense"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount (LKR) *</Label>
              <Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Description *</Label>
            <Input placeholder="e.g. Store Rent - January" value={description} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reference</Label>
            <Input placeholder="Invoice or receipt number…" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="min-w-[100px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : edit ? "Update" : "Record"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Account Modal ────────────────────────────────────────────────────────────
function AccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [code, setCode]     = useState("");
  const [name, setName]     = useState("");
  const [type, setType]     = useState("ASSET");
  const [desc, setDesc]     = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!code || !name) { toast.error("Code and Name are required"); return; }
    setSaving(true);
    try {
      await api.post("/accounting/accounts", { code, name, type, description: desc || undefined });
      toast.success("Account created");
      onSaved(); onClose();
    } catch { toast.error("Failed to create account"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-sm flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold">New Account</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Code *</Label><Input placeholder="1000" value={code} onChange={(e) => setCode(e.target.value)} /></div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Type *</Label>
              <Select value={type} onValueChange={setType}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ACCT_TYPE_CFG).map(([v, c]) => <SelectItem key={v} value={v}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Account Name *</Label><Input placeholder="e.g. Cash in Hand" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Description</Label><Input placeholder="Optional…" value={desc} onChange={(e) => setDesc(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Journal Entry Modal ───────────────────────────────────────────────────────
function JournalModal({ accounts, onClose, onSaved }: { accounts: Account[]; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [desc, setDesc]     = useState("");
  const [date, setDate]     = useState(today);
  const [lines, setLines]   = useState([{ debitAccountId: "", creditAccountId: "", amount: "", description: "" }]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!desc || !date) { toast.error("Fill description and date"); return; }
    const validLines = lines.filter((l) => l.debitAccountId && l.creditAccountId && parseFloat(l.amount) > 0);
    if (!validLines.length) { toast.error("Add at least one valid line"); return; }
    setSaving(true);
    try {
      await api.post("/accounting/journal-entries", { description: desc, date, lines: validLines.map((l) => ({ ...l, amount: parseFloat(l.amount) })) });
      toast.success("Journal entry posted");
      onSaved(); onClose();
    } catch { toast.error("Failed to post journal entry"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold">New Journal Entry</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2"><Label className="text-xs font-semibold">Description *</Label><Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Monthly rent payment" /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Date *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between"><Label className="text-xs font-semibold">Lines *</Label>
              <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, { debitAccountId: "", creditAccountId: "", amount: "", description: "" }])}>+ Add Line</Button>
            </div>
            <div className="rounded-xl border overflow-hidden divide-y">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/30 text-[10px] font-semibold text-muted-foreground">
                <span className="col-span-4">Debit Account</span><span className="col-span-4">Credit Account</span><span className="col-span-2">Amount</span><span className="col-span-2">Note</span>
              </div>
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                  <div className="col-span-4">
                    <Select value={line.debitAccountId} onValueChange={(v) => setLines((p) => p.map((l, j) => j === i ? { ...l, debitAccountId: v } : l))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Debit…" /></SelectTrigger>
                      <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-4">
                    <Select value={line.creditAccountId} onValueChange={(v) => setLines((p) => p.map((l, j) => j === i ? { ...l, creditAccountId: v } : l))}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Credit…" /></SelectTrigger>
                      <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2"><Input className="h-7 text-xs" type="number" placeholder="0.00" value={line.amount} onChange={(e) => setLines((p) => p.map((l, j) => j === i ? { ...l, amount: e.target.value } : l))} /></div>
                  <div className="col-span-1"><Input className="h-7 text-xs" placeholder="…" value={line.description} onChange={(e) => setLines((p) => p.map((l, j) => j === i ? { ...l, description: e.target.value } : l))} /></div>
                  <button className="col-span-1 flex justify-center hover:text-red-500" onClick={() => setLines((p) => p.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">Total: LKR {formatNumber(lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0))}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="min-w-[120px]">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post Entry"}</Button>
        </div>
      </div>
    </div>
  );
}

// ── Date presets (module level) ────────────────────────────────────────────
const _now = new Date();
const DATE_PRESETS = [
  { label: "This Month", start: new Date(_now.getFullYear(), _now.getMonth(), 1).toISOString().split("T")[0],    end: _now.toISOString().split("T")[0] },
  { label: "Last Month", start: new Date(_now.getFullYear(), _now.getMonth()-1, 1).toISOString().split("T")[0],  end: new Date(_now.getFullYear(), _now.getMonth(), 0).toISOString().split("T")[0] },
  { label: "Last 3M",    start: new Date(_now.getFullYear(), _now.getMonth()-3, 1).toISOString().split("T")[0],  end: _now.toISOString().split("T")[0] },
  { label: "This Year",  start: `${_now.getFullYear()}-01-01`, end: _now.toISOString().split("T")[0] },
];
const DEFAULT_RANGE = DATE_PRESETS[1];

type Preset = typeof DATE_PRESETS[0];
function PresetBar({ range, onApply }: { range: { start: string; end: string }; onApply: (p: Preset) => void }) {
  return (
    <div className="flex gap-1.5 flex-wrap items-center">
      {DATE_PRESETS.map((p) => (
        <button key={p.label} onClick={() => onApply(p)}
          className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-all ${
            range.start === p.start && range.end === p.end
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground hover:bg-muted border-border"
          }`}>
          {p.label}
        </button>
      ))}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AccountingPage() {
  const defaultRange = DEFAULT_RANGE;

  const [plRange, setPlRange]         = useState({ start: defaultRange.start, end: defaultRange.end });
  const [cfRange, setCfRange]         = useState({ start: defaultRange.start, end: defaultRange.end });
  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [accounts, setAccounts]       = useState<Account[]>([]);
  const [monthlyPL, setMonthlyPL]     = useState<PLData[]>([]);
  const [plReport, setPlReport]       = useState<PLReport | null>(null);
  const [cashFlow, setCashFlow]       = useState<{ data: CashFlowDay[]; totalInflow: number; totalOutflow: number } | null>(null);
  const [journalEntries, setJournal]  = useState<JournalEntry[]>([]);
  const [balanceSheet, setBS]         = useState<BalanceSheet | null>(null);
  const [thisMonthPL, setThisMonthPL] = useState<PLReport | null>(null);
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState("dashboard");

  const [addExpenseOpen, setAddExpenseOpen]   = useState(false);
  const [editExpense, setEditExpense]         = useState<Expense | null>(null);
  const [addAccountOpen, setAddAccountOpen]   = useState(false);
  const [addJournalOpen, setAddJournalOpen]   = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const tmStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0];
      const tmEnd   = new Date().toISOString().split("T")[0];
      const [expRes, accRes, plRes, cfRes, jeRes, bsRes, monthRes, tmRes] = await Promise.all([
        api.get<{ data: Expense[] }>("/accounting/expenses?limit=200"),
        api.get<Account[]>("/accounting/accounts"),
        api.get<PLReport>(`/accounting/profit-loss?startDate=${plRange.start}&endDate=${plRange.end}`),
        api.get<{ data: CashFlowDay[]; totalInflow: number; totalOutflow: number }>(`/accounting/cash-flow?startDate=${cfRange.start}&endDate=${cfRange.end}`),
        api.get<{ data: JournalEntry[] }>("/accounting/journal-entries?limit=50"),
        api.get<BalanceSheet>("/accounting/balance-sheet"),
        api.get<PLData[]>("/accounting/monthly-pl?months=6"),
        api.get<PLReport>(`/accounting/profit-loss?startDate=${tmStart}&endDate=${tmEnd}`),
      ]);
      setExpenses((expRes.data?.data ?? expRes.data ?? []) as Expense[]);
      setAccounts((Array.isArray(accRes.data) ? accRes.data : []) as Account[]);
      setPlReport(plRes.data as PLReport);
      setCashFlow(cfRes.data as any);
      setJournal((jeRes.data?.data ?? []) as JournalEntry[]);
      setBS(bsRes.data as BalanceSheet);
      setMonthlyPL((Array.isArray(monthRes.data) ? monthRes.data : []) as PLData[]);
      setThisMonthPL(tmRes.data as PLReport);
    } catch { toast.error("Failed to load accounting data"); }
    finally { setLoading(false); }
  }, [plRange, cfRange]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const deleteExpense = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try { await api.delete(`/accounting/expenses/${id}`); toast.success("Deleted"); loadAll(); }
    catch { toast.error("Failed to delete"); }
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const pl         = plReport;
  const netProfit  = pl?.netProfit ?? 0;
  const revenue    = pl?.revenue?.net ?? 0;
  const totalExp   = pl?.expenses?.total ?? 0;
  const margin     = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";
  const expTotal   = expenses.reduce((s, e) => s + e.amount, 0);
  const recentExp  = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const expByCat   = CATEGORIES.map((cat, i) => ({ name: cat, value: expenses.filter((e) => e.categoryId === cat).reduce((s, e) => s + e.amount, 0), color: CAT_COLORS[i % CAT_COLORS.length] })).filter((c) => c.value > 0);
  const topAccounts = [...accounts].sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 8);

  // ── This-month KPI values (always current month, independent of range filter)
  const tmRevenue   = thisMonthPL?.revenue?.net ?? 0;
  const tmProfit    = thisMonthPL?.netProfit ?? 0;
  const tmMargin    = tmRevenue > 0 ? ((tmProfit / tmRevenue) * 100).toFixed(1) : "0";
  const tmSales     = thisMonthPL?.salesCount ?? 0;

  // ── Month-over-month % change from monthlyPL (last 2 months)
  const lastM = monthlyPL.at(-1);
  const prevM = monthlyPL.at(-2);
  const revMoM    = lastM && prevM && prevM.revenue !== 0
    ? ((lastM.revenue - prevM.revenue) / Math.abs(prevM.revenue)) * 100 : null;
  const profitMoM = lastM && prevM && prevM.profit !== 0
    ? ((lastM.profit - prevM.profit) / Math.abs(prevM.profit)) * 100 : null;

  // ── Balance sheet ratios
  const bsAssets  = balanceSheet?.assets.total ?? 0;
  const bsLiab    = balanceSheet?.liabilities.total ?? 0;
  const bsEquity  = balanceSheet?.equity.total ?? 0;
  const bsRetained = balanceSheet?.equity?.retainedEarnings ?? 0;
  const debtRatio  = bsAssets > 0 ? (bsLiab / bsAssets) * 100 : 0;
  const equityRatio = bsAssets > 0 ? (bsEquity / bsAssets) * 100 : 0;

  // ── Table columns ──────────────────────────────────────────────────────────
  const expenseCols: ColumnDef<Expense>[] = [
    { accessorKey: "description",  header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />, cell: ({ row }) => <span className="font-medium text-sm">{row.original.description}</span> },
    { accessorKey: "categoryId",   header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,   cell: ({ row }) => { const cat = row.original.categoryId; const idx = CATEGORIES.indexOf(cat ?? ""); return <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full bg-muted">{cat ? <><span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: idx >= 0 ? CAT_COLORS[idx % CAT_COLORS.length] : "#888" }} />{cat}</> : "—"}</span>; } },
    { accessorKey: "paymentMethod", header: ({ column }) => <DataTableColumnHeader column={column} title="Method" />,    cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.paymentMethod?.replace(/_/g," ")}</span> },
    { accessorKey: "date",          header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,      cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.date).toLocaleDateString("en-LK",{ day:"2-digit",month:"short",year:"numeric" })}</span> },
    { accessorKey: "amount",        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,    cell: ({ row }) => <span className="font-bold text-red-500 text-sm">LKR {formatNumber(row.original.amount)}</span> },
    { id: "actions", cell: ({ row }) => <TableActionsRow dropMoreActions={[{ text: "Edit", function: () => setEditExpense(row.original) }, { text: "Delete", function: () => deleteExpense(row.original.id) }]} /> },
  ];
  const journalCols: ColumnDef<JournalEntry>[] = [
    { accessorKey: "entryNumber", header: ({ column }) => <DataTableColumnHeader column={column} title="Entry #" />,     cell: ({ row }) => <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{row.original.entryNumber}</span> },
    { accessorKey: "description", header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />, cell: ({ row }) => <span className="text-sm">{row.original.description}</span> },
    { accessorKey: "date",        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.date).toLocaleDateString("en-LK",{ day:"2-digit",month:"short",year:"numeric" })}</span> },
    { id: "lines",                header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />,       cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.lines?.length ?? 0} lines</span> },
    { accessorKey: "isPosted",    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,      cell: ({ row }) => <Badge variant={row.original.isPosted ? "success" : "warning"} className="text-[10px]">{row.original.isPosted ? "Posted" : "Draft"}</Badge> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* ── Sub-navigation ───────────────────────────── */}
        <div className="bg-white border-b sticky top-0 z-10">
          <div className="max-w-[1600px] mx-auto px-6 flex items-center justify-between h-14">
            <TabsList className="h-14 bg-transparent p-0 gap-0 rounded-none border-none">
              {[
                { value: "dashboard",    label: "Dashboard" },
                { value: "transactions", label: "Transactions" },
                { value: "accounts",     label: "Chart of Accounts" },
                { value: "banking",      label: "Banking" },
                { value: "reports",      label: "Reports" },
                { value: "settings",     label: "Settings" },
              ].map((t) => (
                <TabsTrigger key={t.value} value={t.value}
                  className="h-14 px-4 rounded-none text-sm font-medium text-slate-500 border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:text-blue-600 data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-slate-700 transition-colors">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5 h-8">
                <Download className="h-3.5 w-3.5" /> Import Transaction
              </Button>
              <Button size="sm" className="gap-1.5 h-8 bg-blue-600 hover:bg-blue-700" onClick={() => setAddJournalOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> New Journal Entry
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-[1600px] mx-auto px-6 py-6">

          {/* ══ DASHBOARD ══ */}
          <TabsContent value="dashboard" className="m-0 space-y-5">

            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
              {([
                { label: "Total Assets",       value: bsAssets,   icon: CreditCard,  bg: "bg-blue-600",    up: bsEquity > 0,         change: bsAssets > 0 ? `Equity ratio: ${equityRatio.toFixed(1)}%` : "No balance sheet data" },
                { label: "Total Liabilities",  value: bsLiab,     icon: Wallet,      bg: "bg-purple-600",  up: bsLiab < bsAssets,    change: bsAssets > 0 ? `Debt ratio: ${debtRatio.toFixed(1)}%` : "No balance sheet data" },
                { label: "Total Equity",       value: bsEquity,   icon: BarChart2,   bg: "bg-emerald-600", up: bsEquity >= 0,        change: bsAssets > 0 ? `Retained: LKR ${formatNumber(Math.abs(bsRetained))}` : "No balance sheet data" },
                { label: "Total Income (MTD)", value: tmRevenue,  icon: TrendingUp,  bg: "bg-orange-500",  up: revMoM !== null ? revMoM >= 0 : tmRevenue > 0,    change: revMoM !== null ? `${revMoM >= 0 ? "+" : ""}${revMoM.toFixed(1)}% from last month` : `${tmSales} sales this month` },
                { label: "Net Profit (MTD)",   value: tmProfit,   icon: DollarSign,  bg: "bg-teal-600",    up: profitMoM !== null ? profitMoM >= 0 : tmProfit >= 0, change: profitMoM !== null ? `${profitMoM >= 0 ? "+" : ""}${profitMoM.toFixed(1)}% from last month` : `Margin: ${tmMargin}%` },
              ] as { label: string; value: number; icon: React.ComponentType<{className?: string}>; bg: string; up: boolean; change: string }[]).map((kpi) => (
                <Card key={kpi.label} className="bg-white shadow-sm hover:shadow-md transition-shadow border">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className={`${kpi.bg} rounded-full p-2.5 shrink-0`}>
                        <kpi.icon className="h-5 w-5 text-white" />
                      </div>
                      <p className="text-xs font-medium text-slate-500 leading-tight">{kpi.label}</p>
                    </div>
                    <p className="text-xl font-bold text-slate-800">LKR {formatNumber(Math.abs(kpi.value))}</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      {kpi.up ? <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <ArrowDownRight className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                      <span className={`text-xs font-medium ${kpi.up ? "text-emerald-600" : "text-red-500"}`}>{kpi.change}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* Income vs Expense Line Chart */}
              <Card className="lg:col-span-3 bg-white shadow-sm border">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-700">Income vs Expense (This Month)</CardTitle>
                  <Select defaultValue={DATE_PRESETS[0].label} onValueChange={(v) => { const p = DATE_PRESETS.find((d) => d.label === v); if (p) setCfRange({ start: p.start, end: p.end }); }}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DATE_PRESETS.map((p) => <SelectItem key={p.label} value={p.label} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  {cashFlow && cashFlow.data.length > 0 ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <LineChart data={cashFlow.data} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }}
                          tickFormatter={(v) => { const d = new Date(v); return `${d.getDate().toString().padStart(2,"0")} ${d.toLocaleString("default",{month:"short"})}`; }}
                          axisLine={false} tickLine={false} interval={Math.max(0, Math.floor(cashFlow.data.length / 6) - 1)} />
                        <YAxis tickFormatter={(v: number) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(v)}
                          tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "11px" }} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                        <Line type="monotone" dataKey="inflow"  name="Income"   stroke="#3b82f6" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                        <Line type="monotone" dataKey="outflow" name="Expenses" stroke="#ef4444" strokeWidth={2}   dot={false} activeDot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-[250px] flex items-center justify-center text-slate-400 text-sm">No cash flow data for this period</div>
                  )}
                </CardContent>
              </Card>

              {/* Expense by Category Donut */}
              <Card className="lg:col-span-2 bg-white shadow-sm border">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-700">Expense by Category (This Month)</CardTitle>
                  <Select defaultValue={DATE_PRESETS[0].label}>
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{DATE_PRESETS.map((p) => <SelectItem key={p.label} value={p.label} className="text-xs">{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </CardHeader>
                <CardContent className="pt-2">
                  {expByCat.length > 0 ? (
                    <div className="flex items-center gap-3">
                      <div className="shrink-0">
                        <PieChart width={140} height={175}>
                          <Pie data={expByCat} cx={70} cy={87} innerRadius={42} outerRadius={68} paddingAngle={2} dataKey="value">
                            {expByCat.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "8px", fontSize: "11px" }} />
                        </PieChart>
                      </div>
                      <div className="flex-1 space-y-2.5 min-w-0 pr-1">
                        {expByCat.slice(0, 5).map((cat) => (
                          <div key={cat.name} className="flex items-center justify-between gap-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                              <span className="text-xs text-slate-600 truncate">{cat.name}</span>
                            </div>
                            <div className="shrink-0 text-right ml-1">
                              <span className="text-xs font-semibold text-slate-700 block">LKR {formatNumber(cat.value)}</span>
                              <span className="text-[10px] text-slate-400">({expTotal > 0 ? ((cat.value/expTotal)*100).toFixed(1) : 0}%)</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="h-[175px] flex items-center justify-center text-slate-400 text-sm">No expense data</div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Tables Row */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

              {/* Recent Transactions */}
              <Card className="lg:col-span-3 bg-white shadow-sm border">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-700">Recent Transactions</CardTitle>
                  <button onClick={() => setActiveTab("transactions")} className="text-xs text-blue-600 hover:underline font-medium">View All</button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-y bg-slate-50">
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Date</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Reference</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Description</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Account</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Type</th>
                          <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Amount (LKR)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {recentExp.length > 0 ? recentExp.map((exp) => (
                          <tr key={exp.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(exp.date).toLocaleDateString("en-LK",{day:"2-digit",month:"short",year:"numeric"})}</td>
                            <td className="px-4 py-3 text-xs text-blue-600 font-medium whitespace-nowrap">{exp.reference || "—"}</td>
                            <td className="px-4 py-3 text-xs text-slate-700 max-w-[160px] truncate">{exp.description}</td>
                            <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{exp.categoryId || "General"}</td>
                            <td className="px-4 py-3"><span className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-600">Expense</span></td>
                            <td className="px-4 py-3 text-xs font-semibold text-red-500 text-right whitespace-nowrap">−{formatNumber(exp.amount)}</td>
                          </tr>
                        )) : (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">No recent transactions</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 border-t bg-slate-50/50">
                    <p className="text-xs text-slate-400">Showing 1 to {Math.min(5, recentExp.length)} of {expenses.length} entries</p>
                  </div>
                </CardContent>
              </Card>

              {/* Top Accounts */}
              <Card className="lg:col-span-2 bg-white shadow-sm border">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-700">Top Accounts</CardTitle>
                  <button onClick={() => setActiveTab("accounts")} className="text-xs text-blue-600 hover:underline font-medium">View All</button>
                </CardHeader>
                <CardContent className="p-0">
                  <table className="w-full">
                    <thead>
                      <tr className="border-y bg-slate-50">
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Account Name</th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500">Account Type</th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500">Balance (LKR)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {topAccounts.length > 0 ? topAccounts.map((acct) => (
                        <tr key={acct.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="px-4 py-3 text-xs font-medium text-slate-700">{acct.name}</td>
                          <td className="px-4 py-3 text-xs text-slate-500">{ACCT_TYPE_CFG[acct.type]?.label ?? acct.type}</td>
                          <td className="px-4 py-3 text-xs font-semibold text-right text-slate-700">{formatNumber(Math.abs(acct.balance))}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-400">No accounts found</td></tr>
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            {/* Quick Actions Bar */}
            <Card className="bg-white shadow-sm border">
              <CardContent className="px-6 py-4">
                <div className="flex items-center justify-around gap-1 flex-wrap">
                  {[
                    { icon: Scale,      label: "Chart of\nAccounts",   fn: () => setActiveTab("accounts") },
                    { icon: BookOpen,   label: "Journal\nEntry",       fn: () => setAddJournalOpen(true) },
                    { icon: CreditCard, label: "Bank\nReconciliation", fn: () => {} },
                    { icon: FileText,   label: "Trial\nBalance",       fn: () => setActiveTab("reports") },
                    { icon: TrendingUp, label: "Profit &\nLoss",       fn: () => setActiveTab("reports") },
                    { icon: Building2,  label: "Balance\nSheet",       fn: () => setActiveTab("reports") },
                    { icon: Wallet,     label: "Cash\nFlow",           fn: () => setActiveTab("reports") },
                  ].map((item) => (
                    <button key={item.label} onClick={item.fn}
                      className="flex flex-col items-center gap-2 px-5 py-3 rounded-xl hover:bg-blue-50 group transition-colors min-w-[80px]">
                      <item.icon className="h-5 w-5 text-slate-500 group-hover:text-blue-600 transition-colors" />
                      <span className="text-[11px] font-medium text-slate-500 group-hover:text-blue-600 text-center leading-tight transition-colors whitespace-pre-line">{item.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══ TRANSACTIONS ══ */}
          <TabsContent value="transactions" className="m-0 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3 bg-white border rounded-xl p-3 shadow-sm">
              <div className="flex gap-2 items-center flex-wrap">
                <PresetBar range={plRange} onApply={(p) => setPlRange({ start: p.start, end: p.end })} />
                <div className="w-px h-4 bg-border" />
                <Input type="date" value={plRange.start} onChange={(e) => setPlRange((p) => ({ ...p, start: e.target.value }))} className="h-7 text-xs w-32" />
                <span className="text-muted-foreground text-xs">–</span>
                <Input type="date" value={plRange.end} onChange={(e) => setPlRange((p) => ({ ...p, end: e.target.value }))} className="h-7 text-xs w-32" />
                <Button size="sm" variant="outline" onClick={loadAll} className="h-7 px-2"><RefreshCw className="h-3 w-3" /></Button>
              </div>
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setAddExpenseOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Record Expense
              </Button>
            </div>
            <ClientSideTable data={expenses} columns={expenseCols} pageCount={Math.ceil(expenses.length / 20)}
              searchableColumns={[{ id: "description", title: "Description" }]}
              filterableColumns={[{ id: "paymentMethod", title: "Method", options: PAY_METHODS.map((m) => ({ label: m.replace(/_/g," "), value: m })) }, { id: "categoryId", title: "Category", options: CATEGORIES.map((c) => ({ label: c, value: c })) }]}
              isShowExportButtons={{ isShow: true, fileName: "expenses-export" }} />
            <div className="flex items-center justify-between pt-2">
              <h2 className="text-sm font-semibold text-slate-700">Journal Entries</h2>
              <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setAddJournalOpen(true)}><Plus className="h-3.5 w-3.5" /> New Entry</Button>
            </div>
            <ClientSideTable data={journalEntries} columns={journalCols} pageCount={Math.ceil(journalEntries.length / 20)}
              searchableColumns={[{ id: "entryNumber", title: "Entry #" }, { id: "description", title: "Description" }]}
              isShowExportButtons={{ isShow: true, fileName: "journal-export" }} />
          </TabsContent>

          {/* ══ CHART OF ACCOUNTS ══ */}
          <TabsContent value="accounts" className="m-0 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{accounts.length} accounts total</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5"><Scale className="h-3.5 w-3.5" />Trial Balance</Button>
                <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700" onClick={() => setAddAccountOpen(true)}><Plus className="h-3.5 w-3.5" />New Account</Button>
              </div>
            </div>
            {Object.entries(ACCT_TYPE_CFG).map(([typeKey, cfg]) => {
              const accts = accounts.filter((a) => a.type === typeKey);
              if (!accts.length) return null;
              const total = accts.reduce((s, a) => s + a.balance, 0);
              return (
                <Card key={typeKey} className="bg-white shadow-sm overflow-hidden border">
                  <div className={`h-1 bg-gradient-to-r ${cfg.grad}`} />
                  <CardHeader className="pb-0 pt-4 px-5">
                    <div className="flex items-center justify-between">
                      <span className={`px-3 py-1 rounded-lg text-xs font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                      <div className="flex items-center gap-3 text-sm">
                        <span className="text-muted-foreground text-xs">{accts.length} accounts</span>
                        <span className="font-bold">LKR {formatNumber(total)}</span>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-4 pt-3">
                    <div className="rounded-xl border overflow-hidden divide-y">
                      {accts.map((acct) => (
                        <div key={acct.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50 transition-colors">
                          <span className="font-mono text-xs text-muted-foreground w-14 shrink-0">{acct.code}</span>
                          <span className="flex-1 text-sm font-medium">{acct.name}</span>
                          {acct.description && <span className="text-xs text-muted-foreground hidden lg:block max-w-[200px] truncate">{acct.description}</span>}
                          <span className={`font-bold text-sm shrink-0 ${acct.balance < 0 ? "text-red-500" : acct.balance > 0 ? "" : "text-muted-foreground"}`}>LKR {formatNumber(acct.balance)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>

          {/* ══ REPORTS ══ */}
          <TabsContent value="reports" className="m-0 space-y-4">
            <div className="flex gap-2 items-center flex-wrap bg-white border rounded-xl p-3 shadow-sm">
              <PresetBar range={plRange} onApply={(p) => setPlRange({ start: p.start, end: p.end })} />
              <div className="w-px h-4 bg-border" />
              <Input type="date" value={plRange.start} onChange={(e) => setPlRange((p) => ({ ...p, start: e.target.value }))} className="h-7 text-xs w-32" />
              <span className="text-muted-foreground text-xs">–</span>
              <Input type="date" value={plRange.end} onChange={(e) => setPlRange((p) => ({ ...p, end: e.target.value }))} className="h-7 text-xs w-32" />
              <Button size="sm" variant="outline" onClick={loadAll} className="h-7 px-2 gap-1"><RefreshCw className="h-3 w-3" />Apply</Button>
              <Button size="sm" variant="outline" onClick={() => window.print()} className="h-7 px-2 gap-1 ml-auto"><Printer className="h-3.5 w-3.5" />Print</Button>
            </div>
            {pl ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <Card className="lg:col-span-7 bg-white shadow-sm border">
                  <CardContent className="p-8">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-3">
                        <FileText className="h-3.5 w-3.5" /> PROFIT &amp; LOSS STATEMENT
                      </div>
                      <p className="text-sm font-medium">{pl.period.startDate} — {pl.period.endDate}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{pl.salesCount} sales transactions</p>
                    </div>
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-3"><div className="h-px flex-1 bg-border" /><span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-2">Revenue</span><div className="h-px flex-1 bg-border" /></div>
                      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gross Sales Revenue</span><span className="font-semibold">LKR {formatNumber(pl.revenue.gross)}</span></div>
                        {pl.revenue.returns > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Less: Returns &amp; Refunds</span><span className="text-red-500">− LKR {formatNumber(pl.revenue.returns)}</span></div>}
                        <div className="h-px bg-emerald-500/20" />
                        <div className="flex justify-between text-sm font-bold"><span>Net Revenue</span><span className="text-emerald-600">LKR {formatNumber(pl.revenue.net)}</span></div>
                      </div>
                    </div>
                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-3"><div className="h-px flex-1 bg-border" /><span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-2">Expenses</span><div className="h-px flex-1 bg-border" /></div>
                      <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Operating Expenses <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.5 rounded">{pl.expenses.count}</span></span><span className="text-red-500 font-semibold">LKR {formatNumber(pl.expenses.total)}</span></div>
                        <div className="h-px bg-red-500/20" />
                        <div className="flex justify-between text-sm font-bold"><span>Total Expenses</span><span className="text-red-600">LKR {formatNumber(pl.expenses.total)}</span></div>
                      </div>
                    </div>
                    <div className={`rounded-2xl p-5 ${pl.netProfit >= 0 ? "bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20" : "bg-gradient-to-br from-red-500/10 to-rose-500/5 border border-red-500/20"}`}>
                      <div className="flex justify-between items-start">
                        <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{pl.netProfit >= 0 ? "Net Profit" : "Net Loss"}</p>
                          <p className={`text-3xl font-bold ${pl.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>LKR {formatNumber(Math.abs(pl.netProfit))}</p></div>
                        <div className="text-right"><p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Profit Margin</p>
                          <p className={`text-2xl font-bold ${pl.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pl.profitMargin}%</p></div>
                      </div>
                      {pl.revenue.net > 0 && (
                        <div className="mt-4">
                          <div className="h-2.5 bg-black/10 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pl.netProfit >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(Math.abs(parseFloat(pl.profitMargin)), 100)}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0%</span><span>50%</span><span>100%</span></div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
                <div className="lg:col-span-5 space-y-4">
                  <Card className="bg-white shadow-sm border">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">6-Month Profit Trend</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={160}>
                        <AreaChart data={monthlyPL}>
                          <defs><linearGradient id="pGradR" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient></defs>
                          <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "10px", fontSize: "11px" }} />
                          <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#pGradR)" strokeWidth={2.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  {cashFlow && (
                    <Card className="bg-white shadow-sm border">
                      <CardHeader className="pb-2"><CardTitle className="text-sm">Cash Flow Summary</CardTitle></CardHeader>
                      <CardContent className="space-y-3">
                        {[{ label: "Total Inflow", value: cashFlow.totalInflow, color: "text-emerald-600" }, { label: "Total Outflow", value: cashFlow.totalOutflow, color: "text-red-500" }].map((row) => (
                          <div key={row.label} className="flex justify-between items-center">
                            <span className="text-sm text-muted-foreground">{row.label}</span>
                            <span className={`font-bold ${row.color}`}>LKR {formatNumber(row.value)}</span>
                          </div>
                        ))}
                        <div className="h-px bg-border" />
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-semibold">{cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? "Net Surplus" : "Net Deficit"}</span>
                          <span className={`font-bold text-base ${cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? "text-emerald-600" : "text-red-500"}`}>LKR {formatNumber(Math.abs(cashFlow.totalInflow - cashFlow.totalOutflow))}</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-40 flex items-center justify-center text-slate-400 bg-white rounded-xl border shadow-sm">No report data for selected period</div>
            )}
          </TabsContent>

          {/* ══ BANKING ══ */}
          <TabsContent value="banking" className="m-0">
            <div className="h-64 flex items-center justify-center text-slate-400 bg-white rounded-xl border shadow-sm">
              <div className="text-center"><CreditCard className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm font-medium">Banking module coming soon</p></div>
            </div>
          </TabsContent>

          {/* ══ SETTINGS ══ */}
          <TabsContent value="settings" className="m-0">
            <div className="h-64 flex items-center justify-center text-slate-400 bg-white rounded-xl border shadow-sm">
              <div className="text-center"><Scale className="h-10 w-10 mx-auto mb-3 opacity-30" /><p className="text-sm font-medium">Settings coming soon</p></div>
            </div>
          </TabsContent>

        </div>
      </Tabs>

      {/* Modals */}
      {(addExpenseOpen || editExpense) && (
        <ExpenseModal edit={editExpense} onClose={() => { setAddExpenseOpen(false); setEditExpense(null); }} onSaved={loadAll} />
      )}
      {addAccountOpen && <AccountModal onClose={() => setAddAccountOpen(false)} onSaved={loadAll} />}
      {addJournalOpen && <JournalModal accounts={accounts} onClose={() => setAddJournalOpen(false)} onSaved={loadAll} />}
    </div>
  );
}
