"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package,
  RefreshCw, Printer, ArrowUpRight, ArrowDownRight, FileText,
  CreditCard, AlertTriangle, BarChart2,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useBranchStore } from "@/stores/branch-store";

// ── Types ─────────────────────────────────────────────────────────────────
interface PLReport {
  period: { startDate: string; endDate: string };
  revenue: { gross: number; returns: number; net: number };
  costOfGoodsSold?: number;
  grossProfit?: number;
  expenses: { total: number; count: number };
  netProfit: number; profitMargin: string; salesCount: number;
}
interface MonthlyPL   { month: string; revenue: number; expenses: number; profit: number }
interface CashFlowDay { date: string; inflow: number; outflow: number }
interface CashFlow    { data: CashFlowDay[]; totalInflow: number; totalOutflow: number }
interface ExpSummary  { total: number; byCategory: { name: string; amount: number }[] }
interface SaleItem    { productName: string; quantity: number; total: number }
interface Payment     { method: string; amount: number }
interface Sale        { id: string; invoiceDate: string; total: number; status: string; items?: SaleItem[]; payments?: Payment[] }
interface Customer    { id: string; firstName: string; lastName: string; phone: string; tier: string; totalSpent: number; totalOrders: number; loyaltyPoints: number; lastPurchaseAt: string | null }
interface InvVariant  { sku: string; costPrice: number; sellingPrice: number; product: { name: string; category?: { name: string } | null } }
interface InvItem     { id: string; quantity: number; variant: InvVariant }
interface ExpiryRow {
  lotId: string;
  batchNumber: string | null;
  expiryDate: string | null;
  daysToExpiry: number | null;
  status: string;
  quantity: number;
  availableQty: number;
  value: number;
  sku: string;
  productName: string;
  variantName: string;
  category: string | null;
  branch: string;
}
interface TaxRate     { taxRate: number; _sum: { taxAmount: number; total: number; quantity: number } }
interface TaxReport   { summary: { total: number; taxAmount: number; subtotal: number; discountAmount: number } | null; count: number; byTaxRate: TaxRate[] }
interface CashierRow  { cashierName: string; salesCount: number; totalRevenue: number; totalDiscount: number; totalTax: number }

// ── Constants ─────────────────────────────────────────────────────────────
const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316","#6366f1"];
const TIER_CFG: Record<string, { color: string; bg: string }> = {
  DIAMOND:  { color: "text-violet-700", bg: "bg-violet-500/10" },
  PLATINUM: { color: "text-yellow-700", bg: "bg-yellow-500/10" },
  GOLD:     { color: "text-amber-600",  bg: "bg-amber-500/10" },
  SILVER:   { color: "text-slate-600",  bg: "bg-muted/50" },
  BRONZE:   { color: "text-orange-700", bg: "bg-orange-500/10" },
};
const TABS = [
  { value: "overview",    label: "Overview" },
  { value: "sales",       label: "Sales" },
  { value: "purchases",   label: "Purchases" },
  { value: "inventory",   label: "Inventory" },
  { value: "suppliers",   label: "Suppliers" },
  { value: "customers",   label: "Customers" },
  { value: "cashier",     label: "Cashier" },
  { value: "branches",    label: "Branches" },
  { value: "tax",         label: "Tax" },
  { value: "expiry",      label: "Expiry" },
  { value: "cheques",     label: "Cheques" },
  { value: "commission",  label: "Commission" },
  { value: "financial",   label: "Financial" },
];

function unwrapRows<T>(data: T[] | { rows?: T[] } | null | undefined): T[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.rows)) return data.rows;
  return [];
}

// ── Date helpers ──────────────────────────────────────────────────────────
const fmtDate = (d: Date) => d.toISOString().split("T")[0];
const today     = () => fmtDate(new Date());
const monthStart= () => { const d = new Date(); d.setDate(1); return fmtDate(d); };
const yearStart = () => { const d = new Date(); d.setMonth(0, 1); return fmtDate(d); };
const daysAgo   = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return fmtDate(d); };
const PRESETS = [
  { label: "Today",        start: today(),      end: today()      },
  { label: "This Week",    start: daysAgo(6),   end: today()      },
  { label: "This Month",   start: monthStart(), end: today()      },
  { label: "Last 30 Days", start: daysAgo(29),  end: today()      },
  { label: "Last 90 Days", start: daysAgo(89),  end: today()      },
  { label: "This Year",    start: yearStart(),  end: today()      },
];

const TT_STYLE = { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "10px", fontSize: "11px" };

// ── Tooltip formatter helpers ─────────────────────────────────────────────
function fmtLKR(v: number) { return `LKR ${formatNumber(v)}`; }
function invUnitCost(v?: InvVariant | null) { return v?.costPrice ?? 0; }

// ── Page ──────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  const searchParams = useSearchParams();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const activeBranchName = useBranchStore((s) => s.activeBranchName);
  const initialTab = TABS.some((t) => t.value === searchParams.get("tab"))
    ? (searchParams.get("tab") as string)
    : "overview";
  const [activeTab, setActiveTab]   = useState(initialTab);
  const [range, setRange]           = useState({ label: "This Month", start: monthStart(), end: today() });
  const [loading, setLoading]       = useState(true);
  const [pl,          setPL]        = useState<PLReport | null>(null);
  const [monthlyPL,   setMonthlyPL] = useState<MonthlyPL[]>([]);
  const [cashFlow,    setCashFlow]  = useState<CashFlow | null>(null);
  const [expSummary,  setExpSummary]= useState<ExpSummary | null>(null);
  const [salesData,   setSalesData] = useState<Sale[]>([]);
  const [customers,   setCusts]     = useState<Customer[]>([]);
  const [inventory,   setInv]       = useState<InvItem[]>([]);
  const [expiryRows,  setExpiry]    = useState<ExpiryRow[]>([]);
  const [taxReport,   setTax]       = useState<TaxReport | null>(null);
  const [cashiers,    setCashiers]  = useState<CashierRow[]>([]);
  const [branches,    setBranches]  = useState<{ branchName: string; branchCode: string; salesCount: number; totalRevenue: number; totalTax: number; totalDiscount: number }[]>([]);
  const [purchases,   setPurchases] = useState<{ poNumber: string; supplierName: string; status: string; total: number; paidAmount: number; outstanding: number; orderDate: string }[]>([]);
  const [purchaseSum, setPurchaseSum] = useState<{ orderCount: number; total: number; paidAmount: number; outstanding: number; paymentsTotal: number } | null>(null);
  const [suppliers,   setSuppliers] = useState<{ name: string; phone: string; totalPaid: number; paymentCount: number; _count?: { purchases: number } }[]>([]);
  const [cheques,     setCheques]   = useState<{ chequeNumber: string; direction: string; status: string; amount: number; partyName: string | null; dueDate: string | null }[]>([]);
  const [chequeSum,   setChequeSum] = useState<{ count: number; totalAmount: number; overdue: number; dueSoon: number } | null>(null);
  const [commRows,    setCommRows]  = useState<{ helperName: string; salesCount: number; salesTotal: number; commissionTotal: number }[]>([]);
  const [commSum,     setCommSum]   = useState<{ helpers: number; salesCount: number; salesTotal: number; commissionTotal: number } | null>(null);

  const branchQ = activeBranchId ? `&branchId=${activeBranchId}` : "";

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = range;
      const [plR, mplR, cfR, expR, salR, custR, invR, taxR, cashR, expLotR, brR, poR, supR, chqR, comR] = await Promise.all([
        api.get<PLReport>    (`/accounting/profit-loss?startDate=${start}&endDate=${end}`),
        api.get<MonthlyPL[]> (`/accounting/monthly-pl?months=12`),
        api.get<CashFlow>    (`/accounting/cash-flow?startDate=${start}&endDate=${end}`),
        api.get<ExpSummary>  (`/accounting/expenses/summary?startDate=${start}&endDate=${end}`),
        api.get<Sale[]>      (`/reports/sales?startDate=${start}&endDate=${end}${branchQ}`),
        api.get<{ rows?: Customer[] } | Customer[]>(`/reports/customers`),
        api.get<{ rows?: InvItem[] } | InvItem[]>(`/reports/inventory${activeBranchId ? `?branchId=${activeBranchId}` : ""}`),
        api.get<TaxReport>   (`/reports/tax?startDate=${start}&endDate=${end}${branchQ}`),
        api.get<{ rows?: CashierRow[] } | CashierRow[]>(`/reports/cashier?startDate=${start}&endDate=${end}${branchQ}`),
        api.get<{ summary?: unknown; rows?: ExpiryRow[] } | ExpiryRow[]>(`/reports/expiry?withinDays=90${branchQ}`),
        api.get<{ rows?: { branchName: string; branchCode: string; salesCount: number; totalRevenue: number; totalTax: number; totalDiscount: number }[] }>(`/reports/branches?startDate=${start}&endDate=${end}`),
        api.get<{ summary?: { orderCount: number; total: number; paidAmount: number; outstanding: number; paymentsTotal: number }; rows?: { poNumber: string; supplierName: string; status: string; total: number; paidAmount: number; outstanding: number; orderDate: string }[] }>(`/reports/purchases?startDate=${start}&endDate=${end}${branchQ}`),
        api.get<{ rows?: { name: string; phone: string; totalPaid: number; paymentCount: number; _count?: { purchases: number } }[] }>(`/reports/suppliers`),
        api.get<{ summary?: { count: number; totalAmount: number; overdue: number; dueSoon: number }; rows?: { chequeNumber: string; direction: string; status: string; amount: number; partyName: string | null; dueDate: string | null }[] }>(`/reports/cheques?startDate=${start}&endDate=${end}`),
        api.get<{ summary?: { helpers: number; salesCount: number; salesTotal: number; commissionTotal: number }; rows?: { helperName: string; salesCount: number; salesTotal: number; commissionTotal: number }[] }>(`/reports/commission?startDate=${start}&endDate=${end}${branchQ}`),
      ]);
      setPL(plR.data);
      setMonthlyPL(Array.isArray(mplR.data) ? mplR.data : []);
      setCashFlow(cfR.data);
      setExpSummary(expR.data);
      setSalesData(Array.isArray(salR.data) ? salR.data : []);
      setCusts(unwrapRows(custR.data));
      setInv(unwrapRows(invR.data));
      setTax(taxR.data);
      setCashiers(unwrapRows(cashR.data));
      setExpiry(unwrapRows(expLotR.data as { rows?: ExpiryRow[] } | ExpiryRow[]));
      setBranches(unwrapRows(brR.data));
      setPurchases(unwrapRows(poR.data));
      setPurchaseSum(poR.data && !Array.isArray(poR.data) ? poR.data.summary ?? null : null);
      setSuppliers(unwrapRows(supR.data));
      setCheques(unwrapRows(chqR.data));
      setChequeSum(chqR.data && !Array.isArray(chqR.data) ? chqR.data.summary ?? null : null);
      setCommRows(unwrapRows(comR.data));
      setCommSum(comR.data && !Array.isArray(comR.data) ? comR.data.summary ?? null : null);
    } catch { toast.error("Failed to load report data"); }
    finally { setLoading(false); }
  }, [range.start, range.end, branchQ, activeBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Derived: Sales ────────────────────────────────────────────────────
  const doneSales = useMemo(() => salesData, [salesData]);

  const dailySales = useMemo(() => {
    const map: Record<string, { date: string; revenue: number; orders: number }> = {};
    for (const s of doneSales) {
      const key = s.invoiceDate.slice(0, 10);
      if (!map[key]) map[key] = { date: key, revenue: 0, orders: 0 };
      map[key].revenue += s.total; map[key].orders += 1;
    }
    return Object.values(map).sort((a, b) => a.date.localeCompare(b.date));
  }, [doneSales]);

  const topProducts = useMemo(() => {
    const map: Record<string, { name: string; qty: number; rev: number }> = {};
    for (const s of doneSales)
      for (const item of s.items ?? []) {
        if (!map[item.productName]) map[item.productName] = { name: item.productName, qty: 0, rev: 0 };
        map[item.productName].qty += item.quantity;
        map[item.productName].rev += item.total;
      }
    return Object.values(map).sort((a, b) => b.rev - a.rev).slice(0, 10);
  }, [doneSales]);

  const payBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of doneSales)
      for (const p of s.payments ?? [])
        map[p.method] = (map[p.method] ?? 0) + p.amount;
    return Object.entries(map).map(([method, amount], i) => ({ method, amount, fill: COLORS[i % COLORS.length] }));
  }, [doneSales]);

  const avgOrder = doneSales.length > 0 ? (pl?.revenue.net ?? 0) / doneSales.length : 0;

  // ── Derived: Inventory ────────────────────────────────────────────────
  const lowStock   = useMemo(() => inventory.filter(i => i.quantity > 0 && i.quantity <= 10).sort((a, b) => a.quantity - b.quantity).slice(0, 20), [inventory]);
  const outOfStock = useMemo(() => inventory.filter(i => i.quantity === 0).length, [inventory]);
  const stockValue = useMemo(() => inventory.reduce((s, i) => s + i.quantity * invUnitCost(i.variant), 0), [inventory]);
  const topInv     = useMemo(() => [...inventory].sort((a, b) => (b.quantity * invUnitCost(b.variant)) - (a.quantity * invUnitCost(a.variant))).slice(0, 10), [inventory]);

  // ── Derived: Customers ────────────────────────────────────────────────
  const tierDist = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of customers) { const t = c.tier ?? "BRONZE"; map[t] = (map[t] ?? 0) + 1; }
    return Object.entries(map).map(([tier, count]) => ({ tier, count })).sort((a, b) => b.count - a.count);
  }, [customers]);

  // ── KPI cards ─────────────────────────────────────────────────────────
  const kpis = [
    { label: "Net Revenue",    val: pl?.revenue.net ?? 0,              currency: true,  icon: DollarSign,  bg: "bg-emerald-600", pos: (pl?.revenue.net ?? 0) >= 0 },
    { label: "Net Profit",     val: pl?.netProfit ?? 0,                currency: true,  icon: TrendingUp,  bg: "bg-teal-600",    pos: (pl?.netProfit ?? 0) >= 0 },
    { label: "Expenses",       val: pl?.expenses.total ?? 0,           currency: true,  icon: TrendingDown,bg: "bg-red-500",     pos: false },
    { label: "Orders",         val: pl?.salesCount ?? 0,               currency: false, icon: ShoppingCart,bg: "bg-blue-600",    pos: true },
    { label: "Avg Order",      val: avgOrder,                          currency: true,  icon: BarChart2,   bg: "bg-violet-600",  pos: avgOrder > 0 },
    { label: "Profit Margin",  val: parseFloat(pl?.profitMargin ?? "0"), currency: false, suffix: "%", icon: CreditCard, bg: "bg-orange-500", pos: parseFloat(pl?.profitMargin ?? "0") >= 0 },
  ];

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

        {/* Nav */}
        <div className="bg-card border-b sticky top-0 z-10">
          <div className="px-6 flex items-center justify-between h-14">
            <TabsList className="h-auto min-h-14 bg-transparent p-0 gap-0 rounded-none border-none flex flex-wrap items-center">
              <span className="text-sm font-bold mr-3 text-foreground py-2">Reports</span>
              {activeBranchName && (
                <span className="text-[10px] font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full mr-2">{activeBranchName}</span>
              )}
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}
                  className="h-10 px-2.5 rounded-none text-xs font-medium text-muted-foreground border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none hover:text-foreground transition-colors">
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-1.5 h-8 hidden sm:flex">
                <Printer className="h-3.5 w-3.5" /> Print
              </Button>
              <Button variant="outline" size="sm" onClick={loadAll} className="gap-1.5 h-8">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
              </Button>
            </div>
          </div>
        </div>

        {/* Date range filter */}
        <div className="bg-card border-b px-6 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 flex-wrap">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => setRange({ ...p })}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${range.label === p.label ? "bg-primary text-primary-foreground" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-border" />
          <div className="flex items-center gap-1.5">
            <Input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, label: "Custom", start: e.target.value }))} className="h-7 text-xs w-32" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="date" value={range.end}  onChange={(e) => setRange((r) => ({ ...r, label: "Custom", end: e.target.value }))}   className="h-7 text-xs w-32" />
            <Button size="sm" variant="outline" onClick={loadAll} className="h-7 px-3 text-xs">Apply</Button>
          </div>
          {loading && <span className="text-xs text-muted-foreground animate-pulse ml-1">Loading…</span>}
        </div>

        <div className="px-6 py-6">

          {/* ══════════════════════ OVERVIEW ══════════════════════ */}
          <TabsContent value="overview" className="m-0 space-y-5">

            {/* KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
              {kpis.map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2.5">
                      <div className={`${k.bg} rounded-lg p-1.5 shrink-0`}><k.icon className="h-3.5 w-3.5 text-white" /></div>
                      <p className="text-[11px] text-muted-foreground font-medium leading-tight">{k.label}</p>
                    </div>
                    <p className="text-lg font-bold text-foreground">
                      {k.currency ? `LKR ${formatNumber(Math.abs(k.val))}` : k.suffix ? `${(k.val as number).toFixed(1)}${k.suffix}` : k.val}
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      {k.pos ? <ArrowUpRight className="h-3 w-3 text-emerald-500" /> : <ArrowDownRight className="h-3 w-3 text-red-500" />}
                      <span className={`text-[10px] font-medium ${k.pos ? "text-emerald-600" : "text-red-500"}`}>{k.pos ? "Positive" : "Negative"}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* 12-month trend + cash flow */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              <Card className="lg:col-span-3 bg-card border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">12-Month Revenue vs Expenses</CardTitle></CardHeader>
                <CardContent>
                  {monthlyPL.length > 0 ? (
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={monthlyPL} barCategoryGap="28%">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => [fmtLKR(v), ""]} contentStyle={TT_STYLE} />
                        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                        <Bar dataKey="revenue"  name="Revenue"  fill="#3b82f6" radius={[3,3,0,0]} />
                        <Bar dataKey="expenses" name="Expenses" fill="#ef4444" radius={[3,3,0,0]} />
                        <Bar dataKey="profit"   name="Profit"   fill="#10b981" radius={[3,3,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : <div className="h-[240px] flex items-center justify-center text-muted-foreground text-sm">No data</div>}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 bg-card border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Cash Flow (Period)</CardTitle></CardHeader>
                <CardContent>
                  {cashFlow && cashFlow.data.length > 0 ? (
                    <>
                      <ResponsiveContainer width="100%" height={185}>
                        <AreaChart data={cashFlow.data}>
                          <defs>
                            <linearGradient id="cfIn"  x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.25}/><stop offset="95%" stopColor="#10b981" stopOpacity={0}/></linearGradient>
                            <linearGradient id="cfOut" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.25}/><stop offset="95%" stopColor="#ef4444" stopOpacity={0}/></linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} interval={Math.max(0,Math.floor(cashFlow.data.length/6)-1)} />
                          <YAxis tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                          <Tooltip formatter={(v: number) => [fmtLKR(v), ""]} contentStyle={TT_STYLE} />
                          <Area type="monotone" dataKey="inflow"  name="Inflow"  stroke="#10b981" fill="url(#cfIn)"  strokeWidth={1.5} dot={false} />
                          <Area type="monotone" dataKey="outflow" name="Outflow" stroke="#ef4444" fill="url(#cfOut)" strokeWidth={1.5} dot={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t mt-1 text-center">
                        {[
                          { label: "Inflow",  val: cashFlow.totalInflow,  color: "text-emerald-600" },
                          { label: "Outflow", val: cashFlow.totalOutflow, color: "text-red-500" },
                          { label: "Net",     val: cashFlow.totalInflow - cashFlow.totalOutflow, color: cashFlow.totalInflow >= cashFlow.totalOutflow ? "text-emerald-600" : "text-red-500" },
                        ].map((r) => (
                          <div key={r.label}>
                            <p className="text-[10px] text-muted-foreground">{r.label}</p>
                            <p className={`text-xs font-bold ${r.color}`}>LKR {formatNumber(Math.abs(r.val))}</p>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <div className="h-[185px] flex items-center justify-center text-muted-foreground text-sm">No cash flow data</div>}
                </CardContent>
              </Card>
            </div>

            {/* Top products + expense breakdown */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card className="bg-card border shadow-sm">
                <CardHeader className="pb-2 flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Top Products (Revenue)</CardTitle>
                  <button onClick={() => setActiveTab("sales")} className="text-xs text-primary hover:underline">See all →</button>
                </CardHeader>
                <CardContent className="p-0">
                  {topProducts.length > 0 ? topProducts.slice(0, 5).map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3 px-4 py-2.5 border-t first:border-t-0">
                      <span className="text-[11px] font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">{p.name}</p>
                        <p className="text-[10px] text-muted-foreground">{p.qty} units sold</p>
                      </div>
                      <span className="text-xs font-bold shrink-0">LKR {formatNumber(p.rev)}</span>
                    </div>
                  )) : <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No sales data for this period</div>}
                </CardContent>
              </Card>

              <Card className="bg-card border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Expenses by Category</CardTitle></CardHeader>
                <CardContent className="space-y-2.5">
                  {expSummary && expSummary.byCategory.length > 0 ? (
                    <>
                      {expSummary.byCategory.slice(0, 6).map((cat, i) => (
                        <div key={cat.name}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="flex items-center gap-1.5 font-medium">
                              <span className="w-2 h-2 rounded-full inline-block" style={{ background: COLORS[i % COLORS.length] }} />{cat.name}
                            </span>
                            <span className="font-bold">LKR {formatNumber(cat.amount)}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${expSummary.total > 0 ? (cat.amount/expSummary.total)*100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between text-xs pt-1 border-t font-bold">
                        <span>Total Expenses</span><span className="text-red-500">LKR {formatNumber(expSummary.total)}</span>
                      </div>
                    </>
                  ) : <div className="h-28 flex items-center justify-center text-muted-foreground text-sm">No expense data</div>}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══════════════════════ SALES ══════════════════════ */}
          <TabsContent value="sales" className="m-0 space-y-5">

            <Card className="bg-card border shadow-sm">
              <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Daily Revenue & Orders</CardTitle></CardHeader>
              <CardContent>
                {dailySales.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={dailySales} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9 }} tickFormatter={(v) => v.slice(5)} axisLine={false} tickLine={false} interval={Math.max(0,Math.floor(dailySales.length/10)-1)} />
                      <YAxis yAxisId="r" tickFormatter={(v) => `${(v/1000).toFixed(0)}K`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="o" orientation="right" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip formatter={(v: number, name: string) => [name === "Revenue" ? fmtLKR(v) : v, name]} contentStyle={TT_STYLE} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                      <Bar yAxisId="r" dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[3,3,0,0]} />
                      <Bar yAxisId="o" dataKey="orders"  name="Orders"  fill="#10b981" radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">No sales data for this period</div>}
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              {/* Payment methods */}
              <Card className="bg-card border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Payment Methods</CardTitle></CardHeader>
                <CardContent>
                  {payBreakdown.length > 0 ? (
                    <div className="flex items-center gap-6">
                      <ResponsiveContainer width={150} height={160}>
                        <PieChart>
                          <Pie data={payBreakdown} dataKey="amount" cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={2}>
                            {payBreakdown.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          </Pie>
                          <Tooltip formatter={(v: number) => [fmtLKR(v), ""]} contentStyle={TT_STYLE} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="flex-1 space-y-2">
                        {payBreakdown.map((p) => {
                          const tot = payBreakdown.reduce((s, x) => s + x.amount, 0);
                          return (
                            <div key={p.method} className="flex items-center justify-between text-xs">
                              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />{p.method.replace(/_/g," ")}</span>
                              <div className="text-right">
                                <span className="font-bold">LKR {formatNumber(p.amount)}</span>
                                <span className="text-[10px] text-muted-foreground ml-1">({tot > 0 ? ((p.amount/tot)*100).toFixed(1) : 0}%)</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">No payment data</div>}
                </CardContent>
              </Card>

              {/* Period summary */}
              <Card className="bg-card border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Period Summary</CardTitle></CardHeader>
                <CardContent className="space-y-2.5">
                  {[
                    { label: "Gross Revenue",    val: `LKR ${formatNumber(pl?.revenue.gross ?? 0)}`,              color: "text-foreground" },
                    { label: "Less: Returns",    val: `− LKR ${formatNumber(pl?.revenue.returns ?? 0)}`,          color: "text-red-500" },
                    { label: "Net Revenue",      val: `LKR ${formatNumber(pl?.revenue.net ?? 0)}`,                color: "text-emerald-600", bold: true },
                    { label: "Cost of Goods",    val: `− LKR ${formatNumber(pl?.costOfGoodsSold ?? 0)}`,          color: "text-orange-600", hide: !(pl?.costOfGoodsSold ?? 0) },
                    { label: "Gross Profit",     val: `LKR ${formatNumber(pl?.grossProfit ?? 0)}`,               color: (pl?.grossProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600", bold: true, hide: !(pl?.costOfGoodsSold ?? 0) },
                    { label: "Expenses",         val: `− LKR ${formatNumber(pl?.expenses.total ?? 0)}`,           color: "text-red-500" },
                    { label: "Net Profit",       val: `LKR ${formatNumber(Math.abs(pl?.netProfit ?? 0))}`,        color: (pl?.netProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600", bold: true },
                    { label: "Profit Margin",    val: `${pl?.profitMargin ?? 0}%`,                                color: parseFloat(pl?.profitMargin ?? "0") >= 0 ? "text-emerald-600" : "text-red-600" },
                    { label: "Avg Order Value",  val: `LKR ${formatNumber(avgOrder)}`,                           color: "text-foreground" },
                    { label: "Total Orders",     val: `${pl?.salesCount ?? 0} orders`,                           color: "text-foreground" },
                  ].filter((r) => !("hide" in r && r.hide)).map((r) => (
                    <div key={r.label} className={`flex justify-between items-center text-xs ${r.bold ? "border-t pt-2 mt-1" : ""}`}>
                      <span className="text-muted-foreground">{r.label}</span>
                      <span className={`${r.bold ? "font-bold text-sm" : "font-semibold"} ${r.color}`}>{r.val}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>

            {/* Top products full table */}
            <Card className="bg-card border shadow-sm">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold">Top Products by Revenue</CardTitle></CardHeader>
              <CardContent className="p-0 mt-3">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["#","Product","Units Sold","Revenue","% of Total"].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topProducts.length > 0 ? topProducts.map((p, i) => {
                      const tot = topProducts.reduce((s, x) => s + x.rev, 0);
                      return (
                        <tr key={p.name} className="hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-4 py-2.5 text-xs font-medium">{p.name}</td>
                          <td className="px-4 py-2.5 text-xs text-right">{p.qty}</td>
                          <td className="px-4 py-2.5 text-xs font-bold text-right">LKR {formatNumber(p.rev)}</td>
                          <td className="px-4 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${tot > 0 ? (p.rev/tot)*100 : 0}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-8 text-right">{tot > 0 ? ((p.rev/tot)*100).toFixed(1) : 0}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No product sales data for this period</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card className="bg-card border shadow-sm">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold">Cashier Performance</CardTitle></CardHeader>
              <CardContent className="p-0 mt-3">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Cashier","Orders","Revenue","Discounts","Tax"].map((h, i) => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${i >= 1 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {cashiers.length > 0 ? cashiers.map((c) => (
                      <tr key={c.cashierName} className="hover:bg-muted/50 transition-colors">
                        <td className="px-4 py-2.5 text-xs font-medium">{c.cashierName}</td>
                        <td className="px-4 py-2.5 text-xs text-right">{c.salesCount}</td>
                        <td className="px-4 py-2.5 text-xs font-bold text-right">LKR {formatNumber(c.totalRevenue)}</td>
                        <td className="px-4 py-2.5 text-xs text-right text-amber-600">LKR {formatNumber(c.totalDiscount)}</td>
                        <td className="px-4 py-2.5 text-xs text-right text-blue-600">LKR {formatNumber(c.totalTax)}</td>
                      </tr>
                    )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No cashier data for this period</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ CUSTOMERS ══════════════════════ */}
          <TabsContent value="customers" className="m-0 space-y-5">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total Customers",   val: customers.length,                                                     icon: Users,       bg: "bg-blue-600",    curr: false },
                { label: "Platinum / Diamond", val: customers.filter(c => c.tier === "PLATINUM" || c.tier === "DIAMOND").length, icon: TrendingUp,  bg: "bg-amber-500",   curr: false },
                { label: "Ordered at Least 1", val: customers.filter(c => c.totalOrders > 0).length,                     icon: ShoppingCart,bg: "bg-emerald-600", curr: false },
                { label: "Total Lifetime Value",val: customers.reduce((s, c) => s + c.totalSpent, 0),                    icon: DollarSign,  bg: "bg-violet-600",  curr: true  },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`${k.bg} rounded-lg p-2 shrink-0`}><k.icon className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-lg font-bold">{k.curr ? `LKR ${formatNumber(k.val)}` : k.val}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Card className="bg-card border shadow-sm">
                <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Customer Tiers</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {tierDist.length > 0 ? tierDist.map((t) => {
                    const cfg = TIER_CFG[t.tier] ?? { color: "text-foreground", bg: "bg-muted/40" };
                    return (
                      <div key={t.tier} className="flex items-center gap-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${cfg.bg} ${cfg.color}`}>{t.tier}</span>
                        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${customers.length > 0 ? (t.count/customers.length)*100 : 0}%` }} />
                        </div>
                        <span className="text-xs font-bold w-6 text-right shrink-0">{t.count}</span>
                      </div>
                    );
                  }) : <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">No data</div>}
                </CardContent>
              </Card>

              <Card className="lg:col-span-2 bg-card border shadow-sm">
                <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold">Top Customers by Lifetime Value</CardTitle></CardHeader>
                <CardContent className="p-0 mt-3">
                  <table className="w-full">
                    <thead>
                      <tr className="border-y bg-muted/30">
                        {["#","Customer","Phone","Tier","Orders","Total Spent"].map((h,i) => (
                          <th key={h} className={`px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase ${i>=4?"text-right":"text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {customers.slice(0, 10).length > 0 ? customers.slice(0, 10).map((c, i) => {
                        const cfg = TIER_CFG[c.tier] ?? { color: "text-foreground", bg: "bg-muted/40" };
                        return (
                          <tr key={c.id} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="px-4 py-2.5 text-xs font-medium">{c.firstName} {c.lastName}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{c.phone}</td>
                            <td className="px-4 py-2.5"><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{c.tier}</span></td>
                            <td className="px-4 py-2.5 text-xs text-right">{c.totalOrders}</td>
                            <td className="px-4 py-2.5 text-xs font-bold text-right text-primary">LKR {formatNumber(c.totalSpent)}</td>
                          </tr>
                        );
                      }) : <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No customer data</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══════════════════════ INVENTORY ══════════════════════ */}
          <TabsContent value="inventory" className="m-0 space-y-5">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Total SKUs",    val: inventory.length, icon: Package,       bg: "bg-blue-600",    curr: false },
                { label: "Out of Stock",  val: outOfStock,       icon: AlertTriangle, bg: "bg-red-500",     curr: false },
                { label: "Low Stock",     val: lowStock.length,  icon: TrendingDown,  bg: "bg-amber-500",   curr: false },
                { label: "Total Value (Cost)", val: stockValue, icon: DollarSign, bg: "bg-emerald-600", curr: true },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`${k.bg} rounded-lg p-2 shrink-0`}><k.icon className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-lg font-bold">{k.curr ? `LKR ${formatNumber(k.val)}` : k.val}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

              <Card className="bg-card border shadow-sm">
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" /> Low Stock Alert (≤ 10 units)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0 mt-3">
                  {lowStock.length > 0 ? (
                    <table className="w-full">
                      <thead>
                        <tr className="border-y bg-muted/30">
                          {["Product","SKU","Category","Qty"].map((h,i) => (
                            <th key={h} className={`px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase ${i===3?"text-right":"text-left"}`}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {lowStock.map((item) => (
                          <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                            <td className="px-4 py-2.5 text-xs font-medium">{item.variant?.product?.name}</td>
                            <td className="px-4 py-2.5 text-[10px] text-muted-foreground font-mono">{item.variant?.sku}</td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">{item.variant?.product?.category?.name ?? "—"}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${item.quantity <= 3 ? "bg-red-500/10 text-red-600" : "bg-amber-500/10 text-amber-600"}`}>{item.quantity}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="h-32 flex items-center justify-center text-emerald-600 text-sm font-medium">All products well stocked ✓</div>}
                </CardContent>
              </Card>

              <Card className="bg-card border shadow-sm">
                <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold">Top Stock by Value</CardTitle></CardHeader>
                <CardContent className="p-0 mt-3">
                  <table className="w-full">
                    <thead>
                      <tr className="border-y bg-muted/30">
                        {["Product","SKU","Qty","Unit Cost","Value"].map((h,i) => (
                          <th key={h} className={`px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase ${i>=2?"text-right":"text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {topInv.length > 0 ? topInv.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/50 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-medium">{item.variant?.product?.name}</td>
                          <td className="px-4 py-2.5 text-[10px] text-muted-foreground font-mono">{item.variant?.sku}</td>
                          <td className="px-4 py-2.5 text-xs text-right">{item.quantity}</td>
                          <td className="px-4 py-2.5 text-xs text-right">LKR {formatNumber(invUnitCost(item.variant))}</td>
                          <td className="px-4 py-2.5 text-xs font-bold text-right">LKR {formatNumber(item.quantity * invUnitCost(item.variant))}</td>
                        </tr>
                      )) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No inventory data</td></tr>}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ══════════════════════ PURCHASES ══════════════════════ */}
          <TabsContent value="purchases" className="m-0 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "PO Count", val: purchaseSum?.orderCount ?? purchases.length, curr: false },
                { label: "PO Total", val: purchaseSum?.total ?? 0, curr: true },
                { label: "Paid", val: purchaseSum?.paidAmount ?? 0, curr: true },
                { label: "Outstanding", val: purchaseSum?.outstanding ?? 0, curr: true },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-lg font-bold">{k.curr ? `LKR ${formatNumber(k.val)}` : k.val}</p>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="bg-card border shadow-sm">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold">Purchase Orders</CardTitle></CardHeader>
              <CardContent className="p-0 mt-3">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["PO", "Supplier", "Date", "Status", "Total", "Paid", "Due"].map((h) => (
                        <th key={h} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {purchases.length ? purchases.map((p) => (
                      <tr key={p.poNumber} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs font-mono">{p.poNumber}</td>
                        <td className="px-4 py-2.5 text-xs">{p.supplierName}</td>
                        <td className="px-4 py-2.5 text-xs">{p.orderDate ? new Date(p.orderDate).toLocaleDateString("en-LK") : "—"}</td>
                        <td className="px-4 py-2.5 text-[10px] font-semibold">{p.status}</td>
                        <td className="px-4 py-2.5 text-xs font-bold">LKR {formatNumber(p.total)}</td>
                        <td className="px-4 py-2.5 text-xs">LKR {formatNumber(p.paidAmount)}</td>
                        <td className="px-4 py-2.5 text-xs text-amber-600">LKR {formatNumber(p.outstanding)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No purchases in range</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ SUPPLIERS ══════════════════════ */}
          <TabsContent value="suppliers" className="m-0 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="bg-card border shadow-sm"><CardContent className="p-4"><p className="text-lg font-bold">{suppliers.length}</p><p className="text-xs text-muted-foreground">Suppliers</p></CardContent></Card>
              <Card className="bg-card border shadow-sm"><CardContent className="p-4"><p className="text-lg font-bold">{suppliers.reduce((s, r) => s + (r._count?.purchases ?? 0), 0)}</p><p className="text-xs text-muted-foreground">Purchase orders</p></CardContent></Card>
              <Card className="bg-card border shadow-sm"><CardContent className="p-4"><p className="text-lg font-bold">LKR {formatNumber(suppliers.reduce((s, r) => s + r.totalPaid, 0))}</p><p className="text-xs text-muted-foreground">Total paid</p></CardContent></Card>
            </div>
            <Card className="bg-card border shadow-sm">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Supplier", "Phone", "POs", "Payments", "Paid"].map((h) => (
                        <th key={h} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {suppliers.length ? suppliers.map((s) => (
                      <tr key={s.name + s.phone} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs font-medium">{s.name}</td>
                        <td className="px-4 py-2.5 text-xs">{s.phone}</td>
                        <td className="px-4 py-2.5 text-xs">{s._count?.purchases ?? 0}</td>
                        <td className="px-4 py-2.5 text-xs">{s.paymentCount}</td>
                        <td className="px-4 py-2.5 text-xs font-bold">LKR {formatNumber(s.totalPaid)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No suppliers</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ CASHIER ══════════════════════ */}
          <TabsContent value="cashier" className="m-0 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Cashiers", val: cashiers.length },
                { label: "Sales", val: cashiers.reduce((s, c) => s + c.salesCount, 0) },
                { label: "Revenue", val: cashiers.reduce((s, c) => s + c.totalRevenue, 0), curr: true },
                { label: "Tax", val: cashiers.reduce((s, c) => s + c.totalTax, 0), curr: true },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-lg font-bold">{k.curr ? `LKR ${formatNumber(k.val)}` : k.val}</p>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="bg-card border shadow-sm">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Cashier", "Sales", "Revenue", "Discount", "Tax"].map((h) => (
                        <th key={h} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cashiers.length ? cashiers.map((c) => (
                      <tr key={c.cashierName} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs font-medium">{c.cashierName}</td>
                        <td className="px-4 py-2.5 text-xs">{c.salesCount}</td>
                        <td className="px-4 py-2.5 text-xs font-bold">LKR {formatNumber(c.totalRevenue)}</td>
                        <td className="px-4 py-2.5 text-xs">LKR {formatNumber(c.totalDiscount)}</td>
                        <td className="px-4 py-2.5 text-xs">LKR {formatNumber(c.totalTax)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No cashier sales in range</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ BRANCHES ══════════════════════ */}
          <TabsContent value="branches" className="m-0 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card className="bg-card border shadow-sm"><CardContent className="p-4"><p className="text-lg font-bold">{branches.length}</p><p className="text-xs text-muted-foreground">Branches with sales</p></CardContent></Card>
              <Card className="bg-card border shadow-sm"><CardContent className="p-4"><p className="text-lg font-bold">LKR {formatNumber(branches.reduce((s, b) => s + b.totalRevenue, 0))}</p><p className="text-xs text-muted-foreground">Total revenue</p></CardContent></Card>
              <Card className="bg-card border shadow-sm"><CardContent className="p-4"><p className="text-lg font-bold">{branches.reduce((s, b) => s + b.salesCount, 0)}</p><p className="text-xs text-muted-foreground">Orders</p></CardContent></Card>
            </div>
            <Card className="bg-card border shadow-sm">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Branch", "Code", "Sales", "Revenue", "Tax", "Discount"].map((h) => (
                        <th key={h} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {branches.length ? branches.map((b) => (
                      <tr key={b.branchName + b.branchCode} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs font-medium">{b.branchName}</td>
                        <td className="px-4 py-2.5 text-xs font-mono">{b.branchCode}</td>
                        <td className="px-4 py-2.5 text-xs">{b.salesCount}</td>
                        <td className="px-4 py-2.5 text-xs font-bold">LKR {formatNumber(b.totalRevenue)}</td>
                        <td className="px-4 py-2.5 text-xs">LKR {formatNumber(b.totalTax)}</td>
                        <td className="px-4 py-2.5 text-xs">LKR {formatNumber(b.totalDiscount)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No branch sales in range</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ CHEQUES ══════════════════════ */}
          <TabsContent value="cheques" className="m-0 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Cheques", val: chequeSum?.count ?? cheques.length, curr: false },
                { label: "Total amount", val: chequeSum?.totalAmount ?? 0, curr: true },
                { label: "Overdue", val: chequeSum?.overdue ?? 0, curr: true },
                { label: "Due ≤7d", val: chequeSum?.dueSoon ?? 0, curr: true },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-lg font-bold">{k.curr ? `LKR ${formatNumber(k.val)}` : k.val}</p>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="bg-card border shadow-sm">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Cheque #", "Direction", "Party", "Due", "Status", "Amount"].map((h) => (
                        <th key={h} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {cheques.length ? cheques.map((c) => (
                      <tr key={c.chequeNumber + c.status} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs font-mono">{c.chequeNumber}</td>
                        <td className="px-4 py-2.5 text-xs">{c.direction}</td>
                        <td className="px-4 py-2.5 text-xs">{c.partyName ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs">{c.dueDate ? new Date(c.dueDate).toLocaleDateString("en-LK") : "—"}</td>
                        <td className="px-4 py-2.5 text-[10px] font-semibold">{c.status}</td>
                        <td className="px-4 py-2.5 text-xs font-bold">LKR {formatNumber(c.amount)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">No cheques in range</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ COMMISSION ══════════════════════ */}
          <TabsContent value="commission" className="m-0 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Helpers", val: commSum?.helpers ?? commRows.length, curr: false },
                { label: "Sales", val: commSum?.salesCount ?? 0, curr: false },
                { label: "Sales total", val: commSum?.salesTotal ?? 0, curr: true },
                { label: "Commission", val: commSum?.commissionTotal ?? 0, curr: true },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4">
                    <p className="text-lg font-bold">{k.curr ? `LKR ${formatNumber(k.val)}` : k.val}</p>
                    <p className="text-xs text-muted-foreground">{k.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="bg-card border shadow-sm">
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Helper", "Sales", "Sales total", "Commission"].map((h) => (
                        <th key={h} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {commRows.length ? commRows.map((r) => (
                      <tr key={r.helperName} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs font-medium">{r.helperName}</td>
                        <td className="px-4 py-2.5 text-xs">{r.salesCount}</td>
                        <td className="px-4 py-2.5 text-xs">LKR {formatNumber(r.salesTotal)}</td>
                        <td className="px-4 py-2.5 text-xs font-bold text-emerald-600">LKR {formatNumber(r.commissionTotal)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">No helper commission in range</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ EXPIRY ══════════════════════ */}
          <TabsContent value="expiry" className="m-0 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Expired", val: expiryRows.filter((r) => r.status === "EXPIRED").length, bg: "bg-red-500" },
                { label: "Critical (≤7d)", val: expiryRows.filter((r) => r.status === "CRITICAL").length, bg: "bg-amber-500" },
                { label: "Warning (≤30d)", val: expiryRows.filter((r) => r.status === "WARNING").length, bg: "bg-orange-500" },
                { label: "At-risk qty", val: expiryRows.reduce((s, r) => s + r.quantity, 0), bg: "bg-blue-600" },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`${k.bg} rounded-lg p-2 shrink-0`}><AlertTriangle className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-lg font-bold">{k.val}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="bg-card border shadow-sm">
              <CardHeader className="pb-0">
                <CardTitle className="text-sm font-semibold">Batch Expiry Report (90 days)</CardTitle>
              </CardHeader>
              <CardContent className="p-0 mt-3">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Product", "Batch", "Expiry", "Days", "Qty", "Value", "Status"].map((h) => (
                        <th key={h} className="px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase text-left">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {expiryRows.length ? expiryRows.map((r) => (
                      <tr key={r.lotId} className="hover:bg-muted/50">
                        <td className="px-4 py-2.5 text-xs font-medium">
                          {r.productName}
                          <span className="block text-[10px] text-muted-foreground font-mono">{r.sku}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs font-mono">{r.batchNumber ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs">{r.expiryDate ? new Date(r.expiryDate).toLocaleDateString("en-LK") : "—"}</td>
                        <td className="px-4 py-2.5 text-xs">{r.daysToExpiry ?? "—"}</td>
                        <td className="px-4 py-2.5 text-xs font-bold">{r.quantity}</td>
                        <td className="px-4 py-2.5 text-xs">LKR {formatNumber(r.value)}</td>
                        <td className="px-4 py-2.5 text-[10px] font-semibold">{r.status}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">No near-expiry lots (receive stock with batch/expiry on GRN)</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════════════════ FINANCIAL ══════════════════════ */}
          <TabsContent value="financial" className="m-0 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">

              {/* P&L statement */}
              <Card className="lg:col-span-7 bg-card border shadow-sm">
                <CardContent className="p-8">
                  {pl ? (
                    <>
                      <div className="text-center mb-7">
                        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1.5 rounded-full text-xs font-bold tracking-wide mb-2">
                          <FileText className="h-3.5 w-3.5" /> PROFIT & LOSS STATEMENT
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">{pl.period.startDate} — {pl.period.endDate}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{pl.salesCount} transactions included</p>
                      </div>
                      <div className="space-y-4">
                        <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-4 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Revenue</p>
                          <div className="flex justify-between text-sm"><span className="text-muted-foreground">Gross Sales</span><span className="font-semibold">LKR {formatNumber(pl.revenue.gross)}</span></div>
                          {pl.revenue.returns > 0 && <div className="flex justify-between text-sm"><span className="text-muted-foreground">Less: Returns & Refunds</span><span className="text-red-500">− LKR {formatNumber(pl.revenue.returns)}</span></div>}
                          <div className="h-px bg-emerald-500/20 my-1" />
                          <div className="flex justify-between text-sm font-bold"><span>Net Revenue</span><span className="text-emerald-600">LKR {formatNumber(pl.revenue.net)}</span></div>
                        </div>
                        {(pl.costOfGoodsSold ?? 0) > 0 && (
                          <div className="bg-orange-500/5 border border-orange-500/15 rounded-xl p-4 space-y-2">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Cost of Goods Sold</p>
                            <div className="flex justify-between text-sm"><span className="text-muted-foreground">Product Costs</span><span className="text-orange-600 font-semibold">LKR {formatNumber(pl.costOfGoodsSold ?? 0)}</span></div>
                            <div className="h-px bg-orange-500/20 my-1" />
                            <div className="flex justify-between text-sm font-bold"><span>Gross Profit</span><span className={(pl.grossProfit ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}>LKR {formatNumber(pl.grossProfit ?? 0)}</span></div>
                          </div>
                        )}
                        <div className="bg-red-500/5 border border-red-500/15 rounded-xl p-4 space-y-2">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Expenses</p>
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Operating Expenses <span className="ml-1 text-[10px] bg-muted px-1.5 py-0.5 rounded-full">{pl.expenses.count} records</span></span>
                            <span className="text-red-500 font-semibold">LKR {formatNumber(pl.expenses.total)}</span>
                          </div>
                        </div>
                        <div className={`rounded-2xl p-5 ${pl.netProfit >= 0 ? "bg-gradient-to-br from-emerald-500/10 to-teal-500/5 border border-emerald-500/20" : "bg-gradient-to-br from-red-500/10 to-rose-500/5 border border-red-500/20"}`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">{pl.netProfit >= 0 ? "Net Profit" : "Net Loss"}</p>
                              <p className={`text-3xl font-black ${pl.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>LKR {formatNumber(Math.abs(pl.netProfit))}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Margin</p>
                              <p className={`text-2xl font-black ${pl.netProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>{pl.profitMargin}%</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">No financial data for this period</div>}
                </CardContent>
              </Card>

              <div className="lg:col-span-5 space-y-5">
                <Card className="bg-card border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">Expense Breakdown</CardTitle></CardHeader>
                  <CardContent className="space-y-2.5">
                    {expSummary && expSummary.byCategory.length > 0 ? expSummary.byCategory.map((cat, i) => (
                      <div key={cat.name}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="flex items-center gap-1.5 font-medium">
                            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{cat.name}
                          </span>
                          <span className="font-bold">LKR {formatNumber(cat.amount)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${expSummary.total > 0 ? (cat.amount/expSummary.total)*100 : 0}%`, background: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    )) : <div className="h-20 flex items-center justify-center text-muted-foreground text-sm">No expenses for this period</div>}
                  </CardContent>
                </Card>

                <Card className="bg-card border shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">12-Month Profit Trend</CardTitle></CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={155}>
                      <AreaChart data={monthlyPL}>
                        <defs>
                          <linearGradient id="profG" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                        <Tooltip formatter={(v: number) => [fmtLKR(v), ""]} contentStyle={TT_STYLE} />
                        <Area type="monotone" dataKey="profit" stroke="#10b981" fill="url(#profG)" strokeWidth={2} dot={false} name="Profit" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* ══════════════════════ TAX ══════════════════════ */}
          <TabsContent value="tax" className="m-0 space-y-5">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Tax Collected",     val: taxReport?.summary?.taxAmount ?? 0,     curr: true,  icon: DollarSign,  bg: "bg-blue-600"    },
                { label: "Gross Sales",        val: taxReport?.summary?.total ?? 0,          curr: true,  icon: ShoppingCart,bg: "bg-emerald-600" },
                { label: "Total Discounts",    val: taxReport?.summary?.discountAmount ?? 0, curr: true,  icon: TrendingDown,bg: "bg-amber-500"   },
                { label: "Transactions",       val: taxReport?.count ?? 0,                   curr: false, icon: FileText,    bg: "bg-violet-600"  },
              ].map((k) => (
                <Card key={k.label} className="bg-card border shadow-sm">
                  <CardContent className="p-4 flex items-center gap-3">
                    <div className={`${k.bg} rounded-lg p-2 shrink-0`}><k.icon className="h-4 w-4 text-white" /></div>
                    <div>
                      <p className="text-lg font-bold">{k.curr ? `LKR ${formatNumber(k.val)}` : k.val}</p>
                      <p className="text-xs text-muted-foreground">{k.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card className="bg-card border shadow-sm">
              <CardHeader className="pb-0"><CardTitle className="text-sm font-semibold">Tax Breakdown by Rate</CardTitle></CardHeader>
              <CardContent className="p-0 mt-3">
                <table className="w-full">
                  <thead>
                    <tr className="border-y bg-muted/30">
                      {["Tax Rate","Items Sold","Gross Sales","Tax Collected","% of Total Tax"].map((h,i) => (
                        <th key={h} className={`px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${i>=1?"text-right":"text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {taxReport && taxReport.byTaxRate.length > 0 ? (
                      <>
                        {taxReport.byTaxRate.map((row) => {
                          const totalTax = taxReport.summary?.taxAmount ?? 1;
                          return (
                            <tr key={row.taxRate} className="hover:bg-muted/50 transition-colors">
                              <td className="px-4 py-3 text-xs font-medium">
                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">{row.taxRate}%</span>
                              </td>
                              <td className="px-4 py-3 text-xs text-right">{row._sum.quantity ?? 0}</td>
                              <td className="px-4 py-3 text-xs font-semibold text-right">LKR {formatNumber(row._sum.total ?? 0)}</td>
                              <td className="px-4 py-3 text-xs font-bold text-right text-blue-600">LKR {formatNumber(row._sum.taxAmount ?? 0)}</td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex items-center justify-end gap-2">
                                  <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${totalTax > 0 ? ((row._sum.taxAmount??0)/totalTax)*100 : 0}%` }} />
                                  </div>
                                  <span className="text-[10px] text-muted-foreground w-8 text-right">{totalTax > 0 ? (((row._sum.taxAmount??0)/totalTax)*100).toFixed(1) : 0}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-muted/20 font-bold border-t-2">
                          <td className="px-4 py-3 text-xs">Total</td>
                          <td className="px-4 py-3 text-xs text-right">{taxReport.byTaxRate.reduce((s, r) => s + (r._sum.quantity??0), 0)}</td>
                          <td className="px-4 py-3 text-xs font-bold text-right">LKR {formatNumber(taxReport.summary?.total ?? 0)}</td>
                          <td className="px-4 py-3 text-xs font-bold text-right text-blue-600">LKR {formatNumber(taxReport.summary?.taxAmount ?? 0)}</td>
                          <td className="px-4 py-3 text-xs text-right text-muted-foreground">100%</td>
                        </tr>
                      </>
                    ) : <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">No tax data for this period</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

        </div>
      </Tabs>
    </div>
  );
}
