"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BookOpen, TrendingUp, TrendingDown, DollarSign, Plus, RefreshCw,
  X, Loader2, Trash2, Pencil, ArrowUpRight, ArrowDownRight, FileText,
  BarChart2, CreditCard, Wallet, Scale,
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, Legend } from "recharts";
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
const ACCT_TYPE_CFG: Record<string, { label: string; color: string; bg: string }> = {
  ASSET:     { label: "Asset",     color: "text-emerald-600", bg: "bg-emerald-500/10" },
  LIABILITY: { label: "Liability", color: "text-red-600",     bg: "bg-red-500/10" },
  EQUITY:    { label: "Equity",    color: "text-blue-600",    bg: "bg-blue-500/10" },
  REVENUE:   { label: "Revenue",   color: "text-violet-600",  bg: "bg-violet-500/10" },
  EXPENSE:   { label: "Expense",   color: "text-amber-600",   bg: "bg-amber-500/10" },
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AccountingPage() {
  const thisMonth = { start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split("T")[0], end: new Date().toISOString().split("T")[0] };
  const lastMonth = { start: new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().split("T")[0], end: new Date(new Date().getFullYear(), new Date().getMonth(), 0).toISOString().split("T")[0] };

  const [plRange, setPlRange]         = useState({ start: lastMonth.start, end: lastMonth.end });
  const [cfRange, setCfRange]         = useState({ start: lastMonth.start, end: lastMonth.end });
  const [expenses, setExpenses]       = useState<Expense[]>([]);
  const [accounts, setAccounts]       = useState<Account[]>([]);
  const [monthlyPL, setMonthlyPL]     = useState<PLData[]>([]);
  const [plReport, setPlReport]       = useState<PLReport | null>(null);
  const [cashFlow, setCashFlow]       = useState<{ data: CashFlowDay[]; totalInflow: number; totalOutflow: number } | null>(null);
  const [journalEntries, setJournal]  = useState<JournalEntry[]>([]);
  const [balanceSheet, setBS]         = useState<BalanceSheet | null>(null);
  const [loading, setLoading]         = useState(true);

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

  const pl = plReport;
  const netProfit = pl?.netProfit ?? 0;
  const revenue = pl?.revenue?.net ?? 0;
  const totalExp = pl?.expenses?.total ?? 0;
  const margin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : "0";

  const KPI_CARDS = [
    { label: "Net Revenue",   value: `LKR ${formatNumber(revenue)}`,   icon: TrendingUp,   color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Expenses",value: `LKR ${formatNumber(totalExp)}`,  icon: TrendingDown, color: "text-red-500",     bg: "bg-red-500/10" },
    { label: "Net Profit",    value: `LKR ${formatNumber(netProfit)}`, icon: DollarSign,   color: netProfit >= 0 ? "text-blue-500" : "text-red-500", bg: netProfit >= 0 ? "bg-blue-500/10" : "bg-red-500/10" },
    { label: "Profit Margin", value: `${margin}%`,                      icon: BarChart2,    color: "text-violet-500", bg: "bg-violet-500/10" },
  ];

  // Expense columns
  const expenseCols: ColumnDef<Expense>[] = [
    { accessorKey: "description", header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />, cell: ({ row }) => <span className="font-medium text-sm">{row.original.description}</span> },
    { accessorKey: "categoryId",  header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,    cell: ({ row }) => <Badge variant="default" className="text-[10px]">{row.original.categoryId ?? "—"}</Badge> },
    { accessorKey: "paymentMethod",header:({ column }) => <DataTableColumnHeader column={column} title="Method" />,      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.paymentMethod?.replace("_"," ")}</span> },
    { accessorKey: "date",        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,        cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.date).toLocaleDateString("en-LK",{ day:"2-digit",month:"short",year:"numeric" })}</span> },
    { accessorKey: "amount",      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,      cell: ({ row }) => <span className="font-bold text-red-500 text-sm">LKR {formatNumber(row.original.amount)}</span> },
    { id:"actions", cell: ({ row }) => <TableActionsRow dropMoreActions={[{ text:"Edit", function: () => setEditExpense(row.original) },{ text:"Delete", function: () => deleteExpense(row.original.id) }]} /> },
  ];

  // Account columns
  const accountCols: ColumnDef<Account>[] = [
    { accessorKey: "code",    header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,    cell: ({ row }) => <span className="font-mono text-xs">{row.original.code}</span> },
    { accessorKey: "name",    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,    cell: ({ row }) => <span className="font-medium text-sm">{row.original.name}</span> },
    { accessorKey: "type",    header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,    cell: ({ row }) => { const cfg = ACCT_TYPE_CFG[row.original.type] ?? ACCT_TYPE_CFG.ASSET; return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>; } },
    { accessorKey: "balance", header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />, cell: ({ row }) => <span className={`font-bold text-sm ${row.original.balance < 0 ? "text-red-500" : ""}`}>LKR {formatNumber(row.original.balance)}</span> },
  ];

  // Journal columns
  const journalCols: ColumnDef<JournalEntry>[] = [
    { accessorKey: "entryNumber", header: ({ column }) => <DataTableColumnHeader column={column} title="Entry #" />, cell: ({ row }) => <span className="font-mono text-xs">{row.original.entryNumber}</span> },
    { accessorKey: "description", header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />, cell: ({ row }) => <span className="text-sm">{row.original.description}</span> },
    { accessorKey: "date",        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />, cell: ({ row }) => <span className="text-xs text-muted-foreground">{new Date(row.original.date).toLocaleDateString("en-LK",{ day:"2-digit",month:"short",year:"numeric" })}</span> },
    { id: "lines",                header: ({ column }) => <DataTableColumnHeader column={column} title="Lines" />, cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.lines?.length ?? 0}</span> },
    { accessorKey: "isPosted",    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />, cell: ({ row }) => <Badge variant={row.original.isPosted ? "success" : "warning"} className="text-[10px]">{row.original.isPosted ? "Posted" : "Draft"}</Badge> },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Accounting</h1>
          <p className="text-sm text-muted-foreground">Full financial management — P&amp;L, expenses, journal, balance sheet</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddExpenseOpen(true)}><Plus className="h-3.5 w-3.5" /> Record Expense</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {KPI_CARDS.map((card) => (
          <Card key={card.label}><CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${card.bg}`}><card.icon className={`h-5 w-5 ${card.color}`} /></div>
            <div><p className="text-lg font-bold leading-tight">{card.value}</p><p className="text-xs text-muted-foreground">{card.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><BarChart2 className="h-3.5 w-3.5 mr-1" />Overview</TabsTrigger>
          <TabsTrigger value="expenses"><TrendingDown className="h-3.5 w-3.5 mr-1" />Expenses</TabsTrigger>
          <TabsTrigger value="pl"><FileText className="h-3.5 w-3.5 mr-1" />P&amp;L Report</TabsTrigger>
          <TabsTrigger value="cashflow"><Wallet className="h-3.5 w-3.5 mr-1" />Cash Flow</TabsTrigger>
          <TabsTrigger value="journal"><BookOpen className="h-3.5 w-3.5 mr-1" />Journal</TabsTrigger>
          <TabsTrigger value="accounts"><Scale className="h-3.5 w-3.5 mr-1" />Accounts</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-base">Revenue vs Expenses — Last 6 Months</CardTitle></CardHeader>
            <CardContent>
              {monthlyPL.length > 0 ? (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthlyPL} barGap={3}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} />
                    <Legend />
                    <Bar dataKey="revenue"  name="Revenue"  fill="#6366f1" radius={[4,4,0,0]} />
                    <Bar dataKey="expenses" name="Expenses" fill="#f43f5e" radius={[4,4,0,0]} />
                    <Bar dataKey="profit"   name="Profit"   fill="#10b981" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <div className="h-[280px] flex items-center justify-center text-muted-foreground text-sm">No data</div>}
            </CardContent>
          </Card>
          {balanceSheet && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { label: "Total Assets",      value: balanceSheet.assets.total,      color: "text-emerald-600" },
                { label: "Total Liabilities", value: balanceSheet.liabilities.total, color: "text-red-600" },
                { label: "Equity",            value: balanceSheet.equity.total,      color: "text-blue-600" },
                { label: "Retained Earnings", value: balanceSheet.equity.retainedEarnings, color: balanceSheet.equity.retainedEarnings >= 0 ? "text-emerald-600" : "text-red-600" },
              ].map((item) => (
                <Card key={item.label}><CardContent className="p-4">
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className={`text-xl font-bold mt-1 ${item.color}`}>LKR {formatNumber(item.value)}</p>
                </CardContent></Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── EXPENSES ── */}
        <TabsContent value="expenses" className="mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2 items-center">
              <Input type="date" value={plRange.start} onChange={(e) => setPlRange((p) => ({ ...p, start: e.target.value }))} className="h-8 text-xs w-36" />
              <span className="text-muted-foreground text-xs">to</span>
              <Input type="date" value={plRange.end} onChange={(e) => setPlRange((p) => ({ ...p, end: e.target.value }))} className="h-8 text-xs w-36" />
              <Button size="sm" variant="outline" onClick={loadAll} className="h-8 gap-1"><RefreshCw className="h-3.5 w-3.5" /></Button>
            </div>
            <Button size="sm" className="gap-1.5" onClick={() => setAddExpenseOpen(true)}><Plus className="h-3.5 w-3.5" /> Record Expense</Button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Expenses</p><p className="text-xl font-bold text-red-500 mt-1">LKR {formatNumber(expenses.reduce((s, e) => s + e.amount, 0))}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Count</p><p className="text-xl font-bold mt-1">{expenses.length}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Average</p><p className="text-xl font-bold mt-1">LKR {formatNumber(expenses.length ? expenses.reduce((s, e) => s + e.amount, 0) / expenses.length : 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Largest</p><p className="text-xl font-bold mt-1">LKR {formatNumber(expenses.length ? Math.max(...expenses.map((e) => e.amount)) : 0)}</p></CardContent></Card>
          </div>
          <ClientSideTable data={expenses} columns={expenseCols} pageCount={Math.ceil(expenses.length / 20)}
            searchableColumns={[{ id: "description", title: "Description" }]}
            filterableColumns={[{ id: "paymentMethod", title: "Method", options: PAY_METHODS.map((m) => ({ label: m.replace("_"," "), value: m })) }, { id: "categoryId", title: "Category", options: CATEGORIES.map((c) => ({ label: c, value: c })) }]}
            isShowExportButtons={{ isShow: true, fileName: "expenses-export" }} />
        </TabsContent>

        {/* ── P&L REPORT ── */}
        <TabsContent value="pl" className="mt-4 space-y-4">
          <div className="flex gap-2 items-center flex-wrap">
            <Input type="date" value={plRange.start} onChange={(e) => setPlRange((p) => ({ ...p, start: e.target.value }))} className="h-8 text-xs w-36" />
            <span className="text-muted-foreground text-xs">to</span>
            <Input type="date" value={plRange.end} onChange={(e) => setPlRange((p) => ({ ...p, end: e.target.value }))} className="h-8 text-xs w-36" />
            <Button size="sm" variant="outline" onClick={loadAll} className="h-8 gap-1"><RefreshCw className="h-3.5 w-3.5" />Apply</Button>
          </div>
          {pl && (
            <Card><CardContent className="p-6">
              <h3 className="font-bold text-lg mb-4">Profit &amp; Loss Statement</h3>
              <p className="text-xs text-muted-foreground mb-4">{pl.period.startDate} → {pl.period.endDate} · {pl.salesCount} sales</p>
              <div className="space-y-1 text-sm max-w-md">
                <div className="flex justify-between py-1.5 border-b"><span className="text-muted-foreground">Gross Revenue</span><span className="font-semibold">LKR {formatNumber(pl.revenue.gross)}</span></div>
                <div className="flex justify-between py-1.5 border-b"><span className="text-muted-foreground">Less: Returns &amp; Refunds</span><span className="text-red-500">- LKR {formatNumber(pl.revenue.returns)}</span></div>
                <div className="flex justify-between py-1.5 border-b font-semibold"><span>Net Revenue</span><span>LKR {formatNumber(pl.revenue.net)}</span></div>
                <div className="flex justify-between py-1.5 border-b"><span className="text-muted-foreground">Operating Expenses ({pl.expenses.count})</span><span className="text-red-500">- LKR {formatNumber(pl.expenses.total)}</span></div>
                <div className={`flex justify-between py-2 mt-2 rounded-lg px-3 font-bold text-base ${pl.netProfit >= 0 ? "bg-emerald-500/10 text-emerald-700" : "bg-red-500/10 text-red-700"}`}>
                  <span>{pl.netProfit >= 0 ? "Net Profit" : "Net Loss"}</span>
                  <span>LKR {formatNumber(Math.abs(pl.netProfit))}</span>
                </div>
                <div className="flex justify-between py-1.5 text-xs text-muted-foreground pt-3"><span>Profit Margin</span><span className="font-semibold">{pl.profitMargin}%</span></div>
              </div>
            </CardContent></Card>
          )}
        </TabsContent>

        {/* ── CASH FLOW ── */}
        <TabsContent value="cashflow" className="mt-4 space-y-4">
          <div className="flex gap-2 items-center flex-wrap">
            <Input type="date" value={cfRange.start} onChange={(e) => setCfRange((p) => ({ ...p, start: e.target.value }))} className="h-8 text-xs w-36" />
            <span className="text-muted-foreground text-xs">to</span>
            <Input type="date" value={cfRange.end} onChange={(e) => setCfRange((p) => ({ ...p, end: e.target.value }))} className="h-8 text-xs w-36" />
            <Button size="sm" variant="outline" onClick={loadAll} className="h-8 gap-1"><RefreshCw className="h-3.5 w-3.5" />Apply</Button>
          </div>
          {cashFlow && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Inflow (Sales)</p><p className="text-xl font-bold text-emerald-600 mt-1">LKR {formatNumber(cashFlow.totalInflow)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Outflow (Expenses)</p><p className="text-xl font-bold text-red-500 mt-1">LKR {formatNumber(cashFlow.totalOutflow)}</p></CardContent></Card>
                <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Net Cash Flow</p><p className={`text-xl font-bold mt-1 ${cashFlow.totalInflow - cashFlow.totalOutflow >= 0 ? "text-blue-600" : "text-red-600"}`}>LKR {formatNumber(cashFlow.totalInflow - cashFlow.totalOutflow)}</p></CardContent></Card>
              </div>
              <Card><CardHeader className="pb-2"><CardTitle className="text-base">Daily Cash Flow</CardTitle></CardHeader>
                <CardContent>
                  {cashFlow.data.length > 0 ? (
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={cashFlow.data}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} />
                        <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} />
                        <Legend />
                        <Area type="monotone" dataKey="inflow"  name="Inflow"  fill="#10b981" stroke="#10b981" fillOpacity={0.15} />
                        <Area type="monotone" dataKey="outflow" name="Outflow" fill="#f43f5e" stroke="#f43f5e" fillOpacity={0.15} />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No cash flow data for this period</div>}
                </CardContent>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ── JOURNAL ── */}
        <TabsContent value="journal" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-1.5" onClick={() => setAddJournalOpen(true)}><Plus className="h-3.5 w-3.5" /> New Journal Entry</Button>
          </div>
          <ClientSideTable data={journalEntries} columns={journalCols} pageCount={Math.ceil(journalEntries.length / 20)}
            searchableColumns={[{ id: "entryNumber", title: "Entry #" }, { id: "description", title: "Description" }]}
            isShowExportButtons={{ isShow: true, fileName: "journal-export" }} />
        </TabsContent>

        {/* ── ACCOUNTS ── */}
        <TabsContent value="accounts" className="mt-4 space-y-4">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => window.open("/accounting/trial-balance")}><Scale className="h-3.5 w-3.5" /> Trial Balance</Button>
            <Button size="sm" className="gap-1.5" onClick={() => setAddAccountOpen(true)}><Plus className="h-3.5 w-3.5" /> New Account</Button>
          </div>
          {Object.entries(ACCT_TYPE_CFG).map(([typeKey, cfg]) => {
            const accts = accounts.filter((a) => a.type === typeKey);
            if (!accts.length) return null;
            return (
              <Card key={typeKey}><CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                  <span className="text-muted-foreground font-normal">{accts.length} accounts · Balance: LKR {formatNumber(accts.reduce((s, a) => s + a.balance, 0))}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="rounded-xl border overflow-hidden divide-y">
                  {accts.map((acct) => (
                    <div key={acct.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/20">
                      <span className="font-mono text-xs text-muted-foreground w-16 shrink-0">{acct.code}</span>
                      <span className="flex-1 text-sm font-medium">{acct.name}</span>
                      {acct.description && <span className="text-xs text-muted-foreground hidden md:block">{acct.description}</span>}
                      <span className={`font-bold text-sm shrink-0 ${acct.balance < 0 ? "text-red-500" : ""}`}>LKR {formatNumber(acct.balance)}</span>
                    </div>
                  ))}
                </div>
              </CardContent></Card>
            );
          })}
        </TabsContent>
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
