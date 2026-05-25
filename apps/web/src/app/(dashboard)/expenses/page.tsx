"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingDown, Plus, RefreshCw, ArrowUpRight, DollarSign,
  BarChart2, X, Loader2, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

// ── Constants ─────────────────────────────────────────────────────────────────
const CATEGORIES = ["Payroll", "Rent", "Utilities", "Marketing", "Operations", "Assets", "Logistics", "Maintenance", "Other"];
const PAY_METHODS = ["CASH", "BANK_TRANSFER", "CREDIT_CARD", "CHEQUE", "ONLINE"];
const CAT_COLORS = ["#6366f1", "#f43f5e", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ── Date presets ───────────────────────────────────────────────────────────────
const _n = new Date();
const PRESETS = [
  { label: "This Month", start: new Date(_n.getFullYear(), _n.getMonth(), 1).toISOString().split("T")[0],   end: _n.toISOString().split("T")[0] },
  { label: "Last Month", start: new Date(_n.getFullYear(), _n.getMonth()-1, 1).toISOString().split("T")[0], end: new Date(_n.getFullYear(), _n.getMonth(), 0).toISOString().split("T")[0] },
  { label: "Last 3M",    start: new Date(_n.getFullYear(), _n.getMonth()-3, 1).toISOString().split("T")[0], end: _n.toISOString().split("T")[0] },
  { label: "This Year",  start: `${_n.getFullYear()}-01-01`,                                                end: _n.toISOString().split("T")[0] },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Expense {
  id: string; description: string; amount: number; date: string;
  categoryId?: string | null; paymentMethod: string; reference?: string | null;
}
interface Summary {
  total: number;
  byCategory: Array<{ name: string; amount: number }>;
  byPaymentMethod: Array<{ method: string; amount: number }>;
}

// ── Expense Modal ─────────────────────────────────────────────────────────────
function ExpenseModal({ edit, onClose, onSaved }: { edit?: Expense | null; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().split("T")[0];
  const [amount, setAmount]           = useState(edit?.amount?.toString() ?? "");
  const [description, setDescription] = useState(edit?.description ?? "");
  const [date, setDate]               = useState(edit?.date ? edit.date.split("T")[0] : today);
  const [categoryId, setCategoryId]   = useState(edit?.categoryId ?? "");
  const [method, setMethod]           = useState(edit?.paymentMethod ?? "CASH");
  const [reference, setReference]     = useState(edit?.reference ?? "");
  const [saving, setSaving]           = useState(false);

  const save = async () => {
    if (!amount || !description || !date) { toast.error("Amount, description and date are required"); return; }
    setSaving(true);
    try {
      const body = { amount: parseFloat(amount), description, date, categoryId: categoryId || undefined, paymentMethod: method, reference: reference || undefined };
      if (edit) {
        await api.put(`/accounting/expenses/${edit.id}`, body);
        toast.success("Expense updated");
      } else {
        await api.post("/accounting/expenses", body);
        toast.success("Expense recorded");
      }
      onSaved(); onClose();
    } catch { toast.error(edit ? "Failed to update" : "Failed to record expense"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-md flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-bold text-slate-800">{edit ? "Edit Expense" : "Record Expense"}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-6 py-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Amount (LKR) *</Label><Input type="number" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs font-semibold">Date *</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Description *</Label><Input placeholder="e.g. Office rent – January" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Category</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAY_METHODS.map((m) => <SelectItem key={m} value={m}>{m.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Reference</Label><Input placeholder="e.g. EXP-2024-001" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="bg-red-500 hover:bg-red-600 min-w-[110px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : edit ? "Save Changes" : "Record"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ExpensesPage() {
  const [range, setRange]           = useState({ start: PRESETS[0].start, end: PRESETS[0].end });
  const [expenses, setExpenses]     = useState<Expense[]>([]);
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [loading, setLoading]       = useState(true);
  const [addOpen, setAddOpen]       = useState(false);
  const [editItem, setEditItem]     = useState<Expense | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, sumRes] = await Promise.all([
        api.get<{ data: Expense[] }>(`/accounting/expenses?limit=500&startDate=${range.start}&endDate=${range.end}`),
        api.get<Summary>(`/accounting/expenses/summary?startDate=${range.start}&endDate=${range.end}`),
      ]);
      setExpenses((expRes.data as any)?.data ?? expRes.data ?? []);
      setSummary(sumRes.data as Summary);
    } catch { toast.error("Failed to load expenses"); }
    finally { setLoading(false); }
  }, [range]);

  useEffect(() => { load(); }, [load]);

  const deleteExpense = async (id: string) => {
    if (!confirm("Delete this expense?")) return;
    try { await api.delete(`/accounting/expenses/${id}`); toast.success("Deleted"); load(); }
    catch { toast.error("Failed to delete"); }
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const total   = summary?.total ?? expenses.reduce((s, e) => s + e.amount, 0);
  const avg     = expenses.length > 0 ? total / expenses.length : 0;
  const largest = expenses.length > 0 ? Math.max(...expenses.map((e) => e.amount)) : 0;
  const catData = (summary?.byCategory ?? []).map((c, i) => ({ ...c, color: CAT_COLORS[i % CAT_COLORS.length] }));
  const methodData = (summary?.byPaymentMethod ?? []).map((m) => ({ name: m.method.replace(/_/g, " "), value: m.amount }));

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns: ColumnDef<Expense>[] = [
    { accessorKey: "reference",    header: ({ column }) => <DataTableColumnHeader column={column} title="Ref" />,         cell: ({ row }) => <span className="font-mono text-xs text-slate-400">{row.original.reference ?? "—"}</span> },
    { accessorKey: "description",  header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />, cell: ({ row }) => <span className="font-medium text-sm text-slate-800">{row.original.description}</span> },
    { accessorKey: "categoryId",   header: ({ column }) => <DataTableColumnHeader column={column} title="Category" />,    cell: ({ row }) => {
      const cat = row.original.categoryId;
      const idx = catData.findIndex((c) => c.name === cat);
      const color = idx >= 0 ? catData[idx].color : "#94a3b8";
      return cat
        ? <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />{cat}</span>
        : <span className="text-slate-400 text-xs">—</span>;
    }},
    { accessorKey: "paymentMethod", header: ({ column }) => <DataTableColumnHeader column={column} title="Method" />,     cell: ({ row }) => <span className="text-xs text-slate-500 capitalize">{row.original.paymentMethod?.replace(/_/g, " ") ?? "—"}</span> },
    { accessorKey: "date",          header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,       cell: ({ row }) => <span className="text-xs text-slate-500">{new Date(row.original.date).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}</span> },
    { accessorKey: "amount",        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,     cell: ({ row }) => <span className="font-bold text-red-500">LKR {formatNumber(row.original.amount)}</span> },
    { id: "actions", cell: ({ row }) => <TableActionsRow dropMoreActions={[{ text: "Edit", function: () => setEditItem(row.original) }, { text: "Delete", function: () => deleteExpense(row.original.id) }]} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-6 py-4 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-500 rounded-xl p-2.5"><TrendingDown className="h-5 w-5 text-white" /></div>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Expenses</h1>
              <p className="text-xs text-slate-500">Track and manage all business expenses</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} className="h-9 w-9 p-0">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button size="sm" className="gap-1.5 h-9 bg-red-500 hover:bg-red-600" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Record Expense
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-6">

        {/* ── Date filter bar ─────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl p-3 flex items-center gap-2 flex-wrap shadow-sm">
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setRange({ start: p.start, end: p.end })}
              className={`px-3 py-1.5 text-xs rounded-lg border font-medium transition-all ${range.start === p.start && range.end === p.end ? "bg-red-500 text-white border-red-500" : "bg-white text-slate-500 hover:bg-slate-50 border-slate-200"}`}>
              {p.label}
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200" />
          <Input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="h-7 text-xs w-32" />
          <span className="text-slate-400 text-xs">–</span>
          <Input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="h-7 text-xs w-32" />
          <Button size="sm" variant="outline" onClick={load} className="h-7 px-3 text-xs ml-1">Apply</Button>
          <span className="ml-auto text-xs text-slate-400">{expenses.length} entries found</span>
        </div>

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {([
            { label: "Total Expenses",    value: `LKR ${formatNumber(total)}`,   icon: TrendingDown, bg: "bg-red-500",    sub: `${expenses.length} entries in period` },
            { label: "Average per Entry", value: `LKR ${formatNumber(avg)}`,     icon: Activity,     bg: "bg-amber-500",  sub: "Per recorded expense" },
            { label: "Largest Expense",   value: `LKR ${formatNumber(largest)}`, icon: ArrowUpRight, bg: "bg-purple-500", sub: "Single highest entry" },
            { label: "Categories Used",   value: String(catData.length),         icon: BarChart2,    bg: "bg-blue-500",   sub: `of ${CATEGORIES.length} total categories` },
          ] as { label: string; value: string; icon: React.ComponentType<{ className?: string }>; bg: string; sub: string }[]).map((kpi) => (
            <Card key={kpi.label} className="bg-white border shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-5 flex items-center gap-4">
                <div className={`${kpi.bg} rounded-full p-2.5 shrink-0`}><kpi.icon className="h-5 w-5 text-white" /></div>
                <div className="min-w-0">
                  <p className="text-xs text-slate-500 font-medium">{kpi.label}</p>
                  <p className="text-xl font-bold text-slate-800 truncate">{kpi.value}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ── Charts ──────────────────────────────────────────────────────── */}
        {catData.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

            {/* Category donut */}
            <Card className="lg:col-span-2 bg-white border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">By Category</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={catData.map((c) => ({ name: c.name, value: c.amount }))} cx="50%" cy="50%" innerRadius={48} outerRadius={75} paddingAngle={3} dataKey="value">
                      {catData.map((c, i) => <Cell key={i} fill={c.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-3 max-h-[130px] overflow-y-auto pr-1">
                  {catData.map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="text-xs text-slate-500 flex-1 truncate">{c.name}</span>
                      <span className="text-xs font-semibold text-slate-700">LKR {formatNumber(c.amount)}</span>
                      <span className="text-xs text-slate-400 w-8 text-right">{total > 0 ? ((c.amount / total) * 100).toFixed(0) : 0}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Payment method bar */}
            <Card className="lg:col-span-3 bg-white border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-slate-700">By Payment Method</CardTitle>
              </CardHeader>
              <CardContent>
                {methodData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={methodData} barCategoryGap="35%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number) => [`LKR ${formatNumber(v)}`, "Amount"]} contentStyle={{ borderRadius: "10px", fontSize: "12px" }} />
                      <Bar dataKey="value" fill="#f43f5e" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">No data</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Category breakdown bars ──────────────────────────────────────── */}
        {catData.length > 0 && (
          <Card className="bg-white border shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-slate-700">Expense Breakdown by Category</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {catData.map((c) => (
                <div key={c.name} className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-24 shrink-0 truncate">{c.name}</span>
                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${total > 0 ? (c.amount / total) * 100 : 0}%`, background: c.color }} />
                  </div>
                  <span className="text-xs font-semibold text-slate-700 w-32 text-right shrink-0">LKR {formatNumber(c.amount)}</span>
                  <span className="text-xs text-slate-400 w-8 text-right shrink-0">{total > 0 ? ((c.amount / total) * 100).toFixed(0) : 0}%</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Expenses Table ───────────────────────────────────────────────── */}
        <Card className="bg-white border shadow-sm">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-slate-700">All Expenses</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">{expenses.length} records · LKR {formatNumber(total)}</span>
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setAddOpen(true)}><Plus className="h-3 w-3" />Add</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="h-40 flex items-center justify-center text-slate-400">
                <RefreshCw className="h-5 w-5 animate-spin mr-2" /> Loading…
              </div>
            ) : expenses.length === 0 ? (
              <div className="h-40 flex flex-col items-center justify-center text-slate-400">
                <TrendingDown className="h-10 w-10 mb-2 opacity-20" />
                <p className="text-sm font-medium">No expenses for this period</p>
                <button onClick={() => setAddOpen(true)} className="mt-2 text-xs text-red-500 hover:underline">Record the first one →</button>
              </div>
            ) : (
              <ClientSideTable
                data={expenses}
                columns={columns}
                pageCount={Math.ceil(expenses.length / 20)}
                searchableColumns={[{ id: "description", title: "Description" }, { id: "reference", title: "Reference" }]}
                filterableColumns={[
                  { id: "paymentMethod", title: "Method",   options: PAY_METHODS.map((m) => ({ label: m.replace(/_/g, " "), value: m })) },
                  { id: "categoryId",    title: "Category", options: CATEGORIES.map((c) => ({ label: c, value: c })) },
                ]}
                isShowExportButtons={{ isShow: true, fileName: "expenses-export" }}
              />
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Modal ───────────────────────────────────────────────────────────── */}
      {(addOpen || editItem) && (
        <ExpenseModal edit={editItem} onClose={() => { setAddOpen(false); setEditItem(null); }} onSaved={load} />
      )}
    </div>
  );
}
