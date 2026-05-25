"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign, Plus, RefreshCw,
  X, Loader2, Trash2, Pencil, ArrowUpRight, ArrowDownRight, FileText,
  BarChart2, CreditCard, Wallet, Scale, Printer, Activity, Building2,
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend, PieChart, Pie, Cell } from "recharts";
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
  const [loading, setLoading]         = useState(true);
  const [activeTab, setActiveTab]     = useState("overview");

  const [addExpenseOpen, setAddExpenseOpen]   = useState(false);
  const [editExpense, setEditExpense]         = useState<Expense | null>(null);
  const [addAccountOpen, setAddAccountOpen]   = useState(false);
  const [addJournalOpen, setAddJournalOpen]   = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, accRes, plRes, cfRes, jeRes, bsRes, monthRes] = await Promise.all([
        api.get<{ data: Expense[] }>("/accounting/expenses?limit=200"),
        api.get<Account[]>("/accounting/accounts"),
        api.get<PLReport>(`/accounting/profit-loss?startDate=${plRange.start}&endDate=${plRange.end}`),
        api.get<{ data: CashFlowDay[]; totalInflow: number; totalOutflow: number }>(`/accounting/cash-flow?startDate=${cfRange.start}&endDate=${cfRange.end}`),
        api.get<{ data: JournalEntry[] }>("/accounting/journal-entries?limit=50"),
        api.get<BalanceSheet>("/accounting/balance-sheet"),
        api.get<PLData[]>("/accounting/monthly-pl?months=6"),
      ]);
      setExpenses((expRes.data?.data ?? expRes.data ?? []) as Expense[]);
      setAccounts((Array.isArray(accRes.data) ? accRes.data : []) as Account[]);
      setPlReport(plRes.data as PLReport);
      setCashFlow(cfRes.data as any);
      setJournal((jeRes.data?.data ?? []) as JournalEntry[]);
      setBS(bsRes.data as BalanceSheet);
      setMonthlyPL((Array.isArray(monthRes.data) ? monthRes.data : []) as PLData[]);
    } catch { toast.error("Failed to load accounting data"); }
    finally { setLoading(false); }
  }, [plRange, cfRange]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const deleteExpense = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try { await api.delete(`/accounting/expenses/${id}`); toast.success("Deleted"); loadAll(); }
    catch { toast.error("Failed to delete"); }
  };

  const applyPreset = (p: typeof DATE_PRESETS[0]) => { setPlRange({ start: p.start, end: p.end }); setCfRange({ start: p.start, end: p.end }); };

  // ── Derived ──────────────────────────────────────────────────────────────
  const pl         = plReport;
  const netProfit  = pl?.netProfit ?? 0;
  const revenue    = pl?.revenue?.net ?? 0;
  const totalExp   = pl?.expenses?.total ?? 0;
  const margin     = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";
  const expTotal   = expenses.reduce((s, e) => s + e.amount, 0);
  const recentExp  = [...expenses].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
  const expByCat   = CATEGORIES.map((cat, i) => ({ name: cat, value: expenses.filter((e) => e.categoryId === cat).reduce((s, e) => s + e.amount, 0), color: CAT_COLORS[i % CAT_COLORS.length] })).filter((c) => c.value > 0);

  const KPI_CARDS = [
    { label: "Net Revenue",   value: `LKR ${formatNumber(revenue)}`,   icon: TrendingUp,   accentColor: "text-emerald-300", accentBg: "bg-emerald-500/25", sub: `${pl?.salesCount ?? 0} sales`, subColor: "text-emerald-200" },
    { label: "Total Expenses",value: `LKR ${formatNumber(totalExp)}`,  icon: TrendingDown, accentColor: "text-red-300",     accentBg: "bg-red-500/25",     sub: `${expenses.length} entries`,  subColor: "text-red-200" },
    { label: "Net Profit",    value: `LKR ${formatNumber(netProfit)}`, icon: DollarSign,   accentColor: netProfit >= 0 ? "text-blue-200" : "text-red-300", accentBg: netProfit >= 0 ? "bg-blue-500/25" : "bg-red-500/25", sub: netProfit >= 0 ? "Profitable ✓" : "In Loss", subColor: netProfit >= 0 ? "text-emerald-200" : "text-red-300" },
    { label: "Profit Margin", value: `${margin}%`,                      icon: BarChart2,    accentColor: "text-violet-200",  accentBg: "bg-violet-500/25",  sub: "Of net revenue",              subColor: "text-indigo-200" },
  ];

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
    <div className="min-h-screen bg-muted/30">
      {/* ── GRADIENT BANNER ────────────────────────────── */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 pt-8 pb-24">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-start justify-between flex-wrap gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-white/20 rounded-xl"><BookOpen className="h-5 w-5 text-white" /></div>
                <span className="text-indigo-200 text-sm font-medium">Finance & Accounting</span>
              </div>
              <h1 className="text-3xl font-bold text-white">Accounting Dashboard</h1>
              <p className="text-indigo-200 text-sm mt-1">P&amp;L · Expenses · Cash Flow · Journal · Balance Sheet</p>
            </div>
            <div className="flex gap-2 flex-wrap items-center">
              <PresetBar range={plRange} onApply={applyPreset} />
              <div className="w-px h-5 bg-white/20" />
              <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5 bg-white/10 border-white/20 text-white hover:bg-white/20">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Button size="sm" onClick={() => setAddExpenseOpen(true)} className="gap-1.5 bg-white text-indigo-700 hover:bg-white/90 font-semibold shadow-lg">
                <Plus className="h-3.5 w-3.5" /> Record Expense
              </Button>
            </div>
          </div>

          {/* KPI cards in banner */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {KPI_CARDS.map((card) => (
              <div key={card.label} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-indigo-100 text-xs font-semibold uppercase tracking-wide">{card.label}</span>
                  <div className={`p-1.5 rounded-lg ${card.accentBg}`}><card.icon className={`h-4 w-4 ${card.accentColor}`} /></div>
                </div>
                <p className="text-white text-2xl font-bold leading-none">{card.value}</p>
                <p className={`text-xs mt-1.5 font-medium ${card.subColor}`}>{card.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TABS (overlapping banner) ───────────────────── */}
      <div className="max-w-[1600px] mx-auto px-6 -mt-14 pb-12 space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-card border rounded-2xl shadow-xl p-1.5 h-auto flex-wrap gap-0.5 inline-flex">
            {[
              { value: "overview", icon: BarChart2,    label: "Overview" },
              { value: "expenses", icon: TrendingDown, label: "Expenses" },
              { value: "pl",       icon: FileText,     label: "P&L Report" },
              { value: "cashflow", icon: Wallet,       label: "Cash Flow" },
              { value: "journal",  icon: BookOpen,     label: "Journal" },
              { value: "accounts", icon: Scale,        label: "Accounts" },
            ].map((t) => (
              <TabsTrigger key={t.value} value={t.value}
                className="rounded-xl gap-1.5 text-xs px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow">
                <t.icon className="h-3.5 w-3.5" />{t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* ── OVERVIEW ─────────────────────────────────── */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <Card className="lg:col-span-7 shadow-sm">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-base">Revenue vs Expenses</CardTitle>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">Last 6 Months</span>
                </CardHeader>
                <CardContent>
                  {monthlyPL.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={monthlyPL} barGap={3} barCategoryGap="28%">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "12px", border: "1px solid hsl(var(--border))", fontSize: "12px" }} />
                        <Legend />
                        <Bar dataKey="revenue"  name="Revenue"  fill="#6366f1" radius={[5,5,0,0]} />
                        <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[5,5,0,0]} />
                        <Bar dataKey="profit"   name="Profit"   fill="#10b981" radius={[5,5,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data yet for the period</div>}
                </CardContent>
              </Card>

              <Card className="lg:col-span-5 shadow-sm">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-base">Expense Breakdown</CardTitle>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{expenses.length} entries</span>
                </CardHeader>
                <CardContent>
                  {expByCat.length > 0 ? (
                    <div className="space-y-3">
                      <ResponsiveContainer width="100%" height={170}>
                        <PieChart>
                          <Pie data={expByCat} cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={3} dataKey="value">
                            {expByCat.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                        {expByCat.map((cat) => (
                          <div key={cat.name} className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                            <span className="text-xs text-muted-foreground w-20 shrink-0">{cat.name}</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${Math.min((cat.value / expTotal) * 100, 100)}%`, background: cat.color }} />
                            </div>
                            <span className="text-xs font-bold shrink-0 w-10 text-right">{expTotal > 0 ? ((cat.value / expTotal) * 100).toFixed(0) : 0}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No expenses recorded yet</div>}
                </CardContent>
              </Card>
            </div>

            {balanceSheet && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {[
                  { label: "Total Assets",      value: balanceSheet.assets.total,               icon: TrendingUp,   grad: "from-emerald-500 to-teal-500",   text: "text-emerald-600" },
                  { label: "Total Liabilities", value: balanceSheet.liabilities.total,          icon: TrendingDown, grad: "from-red-500 to-rose-500",       text: "text-red-600" },
                  { label: "Total Equity",      value: balanceSheet.equity.total,               icon: Scale,        grad: "from-blue-500 to-indigo-500",    text: "text-blue-600" },
                  { label: "Retained Earnings", value: balanceSheet.equity.retainedEarnings,    icon: DollarSign,   grad: balanceSheet.equity.retainedEarnings >= 0 ? "from-violet-500 to-purple-500" : "from-red-500 to-rose-500", text: balanceSheet.equity.retainedEarnings >= 0 ? "text-violet-600" : "text-red-600" },
                ].map((item) => (
                  <Card key={item.label} className="shadow-sm overflow-hidden">
                    <CardContent className="p-0">
                      <div className={`h-1 bg-gradient-to-r ${item.grad}`} />
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-2"><p className="text-xs text-muted-foreground">{item.label}</p><item.icon className={`h-4 w-4 ${item.text}`} /></div>
                        <p className={`text-xl font-bold ${item.text}`}>LKR {formatNumber(item.value)}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {recentExp.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-3 flex-row items-center justify-between">
                  <CardTitle className="text-base">Recent Expenses</CardTitle>
                  <button onClick={() => setActiveTab("expenses")} className="text-xs text-primary hover:underline">View all →</button>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {recentExp.map((exp) => {
                      const idx = CATEGORIES.indexOf(exp.categoryId ?? "");
                      const dot = idx >= 0 ? CAT_COLORS[idx % CAT_COLORS.length] : "#888";
                      return (
                        <div key={exp.id} className="flex items-center gap-3 px-6 py-3 hover:bg-muted/20 transition-colors">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-red-500/10 shrink-0"><TrendingDown className="h-3.5 w-3.5 text-red-500" /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{exp.description}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {exp.categoryId && <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />{exp.categoryId}</span>}
                              <span className="text-[10px] text-muted-foreground">· {new Date(exp.date).toLocaleDateString("en-LK",{ day:"2-digit",month:"short" })}</span>
                            </div>
                          </div>
                          <span className="font-bold text-sm text-red-500 shrink-0">− LKR {formatNumber(exp.amount)}</span>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── EXPENSES ─────────────────────────────────── */}
          <TabsContent value="expenses" className="space-y-4 mt-0">
            <div className="flex items-center justify-between flex-wrap gap-3 bg-card border rounded-xl p-3 shadow-sm">
              <div className="flex gap-2 items-center flex-wrap">
                <PresetBar range={plRange} onApply={(p) => setPlRange({ start: p.start, end: p.end })} />
                <div className="w-px h-4 bg-border" />
                <Input type="date" value={plRange.start} onChange={(e) => setPlRange((p) => ({ ...p, start: e.target.value }))} className="h-7 text-xs w-32" />
                <span className="text-muted-foreground text-xs">–</span>
                <Input type="date" value={plRange.end} onChange={(e) => setPlRange((p) => ({ ...p, end: e.target.value }))} className="h-7 text-xs w-32" />
                <Button size="sm" variant="outline" onClick={loadAll} className="h-7 px-2"><RefreshCw className="h-3 w-3" /></Button>
              </div>
              <Button size="sm" className="gap-1.5" onClick={() => setAddExpenseOpen(true)}><Plus className="h-3.5 w-3.5" /> Record Expense</Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total",      value: `LKR ${formatNumber(expTotal)}`,                         sub: `${expenses.length} entries`,           icon: TrendingDown, color: "text-red-500",     bg: "bg-red-500/10",     grad: "from-red-500 to-rose-500" },
                { label: "Average",    value: `LKR ${formatNumber(expenses.length ? expTotal/expenses.length : 0)}`, sub: "Per entry",                icon: Activity,     color: "text-amber-600",   bg: "bg-amber-500/10",   grad: "from-amber-500 to-orange-500" },
                { label: "Largest",    value: `LKR ${formatNumber(expenses.length ? Math.max(...expenses.map((e) => e.amount)) : 0)}`, sub: "Single entry", icon: ArrowUpRight, color: "text-violet-600",  bg: "bg-violet-500/10",  grad: "from-violet-500 to-purple-500" },
                { label: "Categories", value: `${expByCat.length} of ${CATEGORIES.length}`,             sub: "Category types used",                 icon: BarChart2,    color: "text-blue-600",    bg: "bg-blue-500/10",    grad: "from-blue-500 to-indigo-500" },
              ].map((s) => (
                <Card key={s.label} className="shadow-sm overflow-hidden">
                  <CardContent className="p-0">
                    <div className={`h-1 bg-gradient-to-r ${s.grad}`} />
                    <div className="p-4 flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${s.bg} shrink-0`}><s.icon className={`h-4 w-4 ${s.color}`} /></div>
                      <div className="min-w-0">
                        <p className="font-bold text-lg leading-tight truncate">{s.value}</p>
                        <p className="text-xs text-muted-foreground">{s.label} · {s.sub}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {expByCat.length > 0 && (
              <Card className="shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">By Category</CardTitle></CardHeader>
                <CardContent className="space-y-2.5">
                  {expByCat.map((cat) => (
                    <div key={cat.name} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color }} />
                      <span className="text-xs text-muted-foreground w-24 shrink-0">{cat.name}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(cat.value / expTotal) * 100}%`, background: cat.color }} />
                      </div>
                      <span className="text-xs font-semibold w-28 text-right shrink-0">LKR {formatNumber(cat.value)}</span>
                      <span className="text-xs text-muted-foreground w-8 text-right shrink-0">{((cat.value / expTotal) * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <ClientSideTable data={expenses} columns={expenseCols} pageCount={Math.ceil(expenses.length / 20)}
              searchableColumns={[{ id: "description", title: "Description" }]}
              filterableColumns={[{ id: "paymentMethod", title: "Method", options: PAY_METHODS.map((m) => ({ label: m.replace(/_/g," "), value: m })) }, { id: "categoryId", title: "Category", options: CATEGORIES.map((c) => ({ label: c, value: c })) }]}
              isShowExportButtons={{ isShow: true, fileName: "expenses-export" }} />
          </TabsContent>

          {/* ── P&L REPORT ───────────────────────────────── */}
          <TabsContent value="pl" className="space-y-4 mt-0">
            <div className="flex gap-2 items-center flex-wrap bg-card border rounded-xl p-3 shadow-sm">
              <PresetBar range={plRange} onApply={(p) => setPlRange({ start: p.start, end: p.end })} />
              <div className="w-px h-4 bg-border" />
              <Input type="date" value={plRange.start} onChange={(e) => setPlRange((p) => ({ ...p, start: e.target.value }))} className="h-7 text-xs w-32" />
              <span className="text-muted-foreground text-xs">–</span>
              <Input type="date" value={plRange.end} onChange={(e) => setPlRange((p) => ({ ...p, end: e.target.value }))} className="h-7 text-xs w-32" />
              <Button size="sm" variant="outline" onClick={loadAll} className="h-7 px-2 gap-1"><RefreshCw className="h-3 w-3" />Apply</Button>
              <Button size="sm" variant="outline" onClick={() => window.print()} className="h-7 px-2 gap-1 ml-auto"><Printer className="h-3.5 w-3.5" />Print</Button>
            </div>

            {pl && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                <Card className="lg:col-span-7 shadow-sm">
                  <CardContent className="p-8">
                    <div className="text-center mb-8">
                      <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-3">
                        <FileText className="h-3.5 w-3.5" /> PROFIT &amp; LOSS STATEMENT
                      </div>
                      <p className="text-sm font-medium">{pl.period.startDate} — {pl.period.endDate}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{pl.salesCount} sales transactions</p>
                    </div>

                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-border" /><span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-2">Revenue</span><div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gross Sales Revenue</span><span className="font-semibold">LKR {formatNumber(pl.revenue.gross)}</span></div>
                        {pl.revenue.returns > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Less: Returns &amp; Refunds</span><span className="text-red-500">− LKR {formatNumber(pl.revenue.returns)}</span></div>}
                        <div className="h-px bg-emerald-500/20" />
                        <div className="flex justify-between text-sm font-bold"><span>Net Revenue</span><span className="text-emerald-600">LKR {formatNumber(pl.revenue.net)}</span></div>
                      </div>
                    </div>

                    <div className="mb-5">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="h-px flex-1 bg-border" /><span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase px-2">Expenses</span><div className="h-px flex-1 bg-border" />
                      </div>
                      <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between text-sm"><span className="text-muted-foreground">Operating Expenses <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.5 rounded">{pl.expenses.count}</span></span><span className="text-red-500 font-semibold">LKR {formatNumber(pl.expenses.total)}</span></div>
                        <div className="h-px bg-red-500/20" />
                        <div className="flex justify-between text-sm font-bold"><span>Total Expenses</span><span className="text-red-600">LKR {formatNumber(pl.expenses.total)}</span></div>
                      </div>
                    </div>

                    <div className={`rounded-2xl p-5 ${pl.netProfit >= 0 ? "bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20" : "bg-gradient-to-br from-red-500/10 to-rose-500/5 border border-red-500/20"}`}>
                      <div className="flex justify-between items-start">
                        <div><p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{pl.netProfit >= 0 ? "Net Profit" : "Net Loss"}</p>
                          <p className={`text-3xl font-bold ${pl.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>LKR {formatNumber(Math.abs(pl.netProfit))}</p>
                        </div>
                        <div className="text-right"><p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Profit Margin</p>
                          <p className={`text-2xl font-bold ${pl.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pl.profitMargin}%</p>
                        </div>
                      </div>
                      {pl.revenue.net > 0 && (
                        <div className="mt-4">
                          <div className="h-2.5 bg-black/10 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all ${pl.netProfit >= 0 ? "bg-emerald-500" : "bg-red-500"}`} style={{ width: `${Math.min(Math.abs(parseFloat(pl.profitMargin)), 100)}%` }} />
                          </div>
                          <div className="flex justify-between text-[10px] text-muted-foreground mt-1"><span>0%</span><span>50%</span><span>100%</span></div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="lg:col-span-5 space-y-4">
                  <Card className="shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Revenue Breakdown</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                      {[
                        { label: "Gross Revenue", value: pl.revenue.gross, color: "#6366f1", pct: 100 },
                        { label: "Returns",        value: pl.revenue.returns, color: "#f43f5e", pct: pl.revenue.gross > 0 ? (pl.revenue.returns / pl.revenue.gross) * 100 : 0 },
                        { label: "Net Revenue",    value: pl.revenue.net, color: "#10b981",  pct: pl.revenue.gross > 0 ? (pl.revenue.net / pl.revenue.gross) * 100 : 0 },
                        { label: "Expenses",       value: pl.expenses.total, color: "#f59e0b", pct: pl.revenue.net > 0 ? (pl.expenses.total / pl.revenue.net) * 100 : 0 },
                      ].map((item) => (
                        <div key={item.label} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: item.color }} /><span className="text-muted-foreground">{item.label}</span></span>
                            <span className="font-semibold">LKR {formatNumber(item.value)}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.min(item.pct, 100)}%`, background: item.color }} />
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <Card className="shadow-sm">
                    <CardHeader className="pb-2"><CardTitle className="text-sm">6-Month Profit Trend</CardTitle></CardHeader>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={130}>
                        <AreaChart data={monthlyPL}>
                          <defs>
                            <linearGradient id="pGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "10px", fontSize: "11px" }} />
                          <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#pGrad)" strokeWidth={2.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── CASH FLOW ────────────────────────────────── */}
          <TabsContent value="cashflow" className="space-y-4 mt-0">
            <div className="flex gap-2 items-center flex-wrap bg-card border rounded-xl p-3 shadow-sm">
              <PresetBar range={cfRange} onApply={(p) => setCfRange({ start: p.start, end: p.end })} />
              <div className="w-px h-4 bg-border" />
              <Input type="date" value={cfRange.start} onChange={(e) => setCfRange((p) => ({ ...p, start: e.target.value }))} className="h-7 text-xs w-32" />
              <span className="text-muted-foreground text-xs">–</span>
              <Input type="date" value={cfRange.end} onChange={(e) => setCfRange((p) => ({ ...p, end: e.target.value }))} className="h-7 text-xs w-32" />
              <Button size="sm" variant="outline" onClick={loadAll} className="h-7 px-2 gap-1"><RefreshCw className="h-3 w-3" />Apply</Button>
            </div>

            {cashFlow && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { label: "Total Inflow",  value: cashFlow.totalInflow,  sub: "From sales",    icon: ArrowUpRight,  text: "text-emerald-600", grad: "from-emerald-500 to-teal-500" },
                    { label: "Total Outflow", value: cashFlow.totalOutflow, sub: "From expenses", icon: ArrowDownRight,text: "text-red-500",     grad: "from-red-500 to-rose-500" },
                    { label: cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? "Cash Surplus" : "Cash Deficit",
                      value: Math.abs(cashFlow.totalInflow - cashFlow.totalOutflow),
                      sub: cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? "Positive cash flow ✓" : "Negative cash flow",
                      icon: cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? TrendingUp : TrendingDown,
                      text: cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? "text-blue-600" : "text-red-600",
                      grad: cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? "from-blue-500 to-indigo-500" : "from-red-500 to-rose-500" },
                  ].map((item) => (
                    <Card key={item.label} className="shadow-sm overflow-hidden">
                      <CardContent className="p-0">
                        <div className={`h-1.5 bg-gradient-to-r ${item.grad}`} />
                        <div className="p-5 flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${item.grad.includes("emerald") ? "bg-emerald-500/10" : item.grad.includes("red") ? "bg-red-500/10" : "bg-blue-500/10"}`}>
                            <item.icon className={`h-5 w-5 ${item.text}`} />
                          </div>
                          <div>
                            <p className={`text-xl font-bold ${item.text}`}>LKR {formatNumber(item.value)}</p>
                            <p className="text-xs text-muted-foreground">{item.label} · {item.sub}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {cashFlow.totalInflow + cashFlow.totalOutflow > 0 && (
                  <Card className="shadow-sm">
                    <CardContent className="px-6 py-4">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Inflow vs Outflow Ratio</p>
                      <div className="flex h-4 rounded-full overflow-hidden gap-0.5">
                        <div className="bg-emerald-500 transition-all" style={{ width: `${(cashFlow.totalInflow / (cashFlow.totalInflow + cashFlow.totalOutflow)) * 100}%` }} />
                        <div className="bg-red-500 flex-1" />
                      </div>
                      <div className="flex justify-between mt-2 text-xs">
                        <span className="text-emerald-600 font-semibold">Inflow {cashFlow.totalInflow + cashFlow.totalOutflow > 0 ? ((cashFlow.totalInflow / (cashFlow.totalInflow + cashFlow.totalOutflow)) * 100).toFixed(1) : 0}%</span>
                        <span className="text-red-500 font-semibold">Outflow {cashFlow.totalInflow + cashFlow.totalOutflow > 0 ? ((cashFlow.totalOutflow / (cashFlow.totalInflow + cashFlow.totalOutflow)) * 100).toFixed(1) : 0}%</span>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="shadow-sm">
                  <CardHeader className="pb-2 flex-row items-center justify-between">
                    <CardTitle className="text-base">Daily Cash Flow</CardTitle>
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{cashFlow.data.length} active days</span>
                  </CardHeader>
                  <CardContent>
                    {cashFlow.data.length > 0 ? (
                      <ResponsiveContainer width="100%" height={270}>
                        <AreaChart data={cashFlow.data}>
                          <defs>
                            <linearGradient id="iGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.25} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                            <linearGradient id="oGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f43f5e" stopOpacity={0.25} /><stop offset="95%" stopColor="#f43f5e" stopOpacity={0} /></linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} />
                          <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "12px", fontSize: "12px" }} />
                          <Legend />
                          <Area type="monotone" dataKey="inflow"  name="Inflow"  fill="url(#iGrad)" stroke="#10b981" strokeWidth={2} dot={false} />
                          <Area type="monotone" dataKey="outflow" name="Outflow" fill="url(#oGrad)" stroke="#f43f5e" strokeWidth={2} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    ) : <div className="h-[270px] flex items-center justify-center text-muted-foreground text-sm">No activity in this period</div>}
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── JOURNAL ──────────────────────────────────── */}
          <TabsContent value="journal" className="space-y-4 mt-0">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">{journalEntries.length} journal entries total</p>
              <Button size="sm" className="gap-1.5" onClick={() => setAddJournalOpen(true)}><Plus className="h-3.5 w-3.5" /> New Journal Entry</Button>
            </div>
            <ClientSideTable data={journalEntries} columns={journalCols} pageCount={Math.ceil(journalEntries.length / 20)}
              searchableColumns={[{ id: "entryNumber", title: "Entry #" }, { id: "description", title: "Description" }]}
              isShowExportButtons={{ isShow: true, fileName: "journal-export" }} />
          </TabsContent>

          {/* ── ACCOUNTS ─────────────────────────────────── */}
          <TabsContent value="accounts" className="space-y-4 mt-0">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{accounts.length} accounts total</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="gap-1.5"><Scale className="h-3.5 w-3.5" />Trial Balance</Button>
                <Button size="sm" className="gap-1.5" onClick={() => setAddAccountOpen(true)}><Plus className="h-3.5 w-3.5" />New Account</Button>
              </div>
            </div>

            {Object.entries(ACCT_TYPE_CFG).map(([typeKey, cfg]) => {
              const accts = accounts.filter((a) => a.type === typeKey);
              if (!accts.length) return null;
              const total = accts.reduce((s, a) => s + a.balance, 0);
              return (
                <Card key={typeKey} className="shadow-sm overflow-hidden">
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
                        <div key={acct.id} className="flex items-center gap-4 px-4 py-3 hover:bg-muted/20 transition-colors">
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
        </Tabs>
      </div>

      {/* Modals */}
      {(addExpenseOpen || editExpense) && (
        <ExpenseModal edit={editExpense} onClose={() => { setAddExpenseOpen(false); setEditExpense(null); }} onSaved={loadAll} />
      )}
      {addAccountOpen && <AccountModal onClose={() => setAddAccountOpen(false)} onSaved={loadAll} />}
      {addJournalOpen && <JournalModal accounts={accounts} onClose={() => setAddJournalOpen(false)} onSaved={loadAll} />}
    </div>
  );
}
