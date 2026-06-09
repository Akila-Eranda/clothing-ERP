"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  BarChart3, TrendingUp, TrendingDown, DollarSign, RefreshCw, Package,
  User, ShoppingCart, Percent, Award, AlertCircle, CalendarDays,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ComposedChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

// ── constants ────────────────────────────────────────────────────────────────
const C = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316","#3b82f6"];
const TT: React.CSSProperties = { background:"hsl(var(--popover))", border:"1px solid hsl(var(--border))", borderRadius:"12px", fontSize:"11px" };
const fmt = (d: Date) => d.toISOString().split("T")[0];
const today   = () => fmt(new Date());
const monStart= () => { const d=new Date(); d.setDate(1); return fmt(d); };
const ago     = (n:number) => { const d=new Date(); d.setDate(d.getDate()-n); return fmt(d); };
const PRESETS = [
  { label:"Today",        start:today(),    end:today() },
  { label:"This Week",    start:ago(6),     end:today() },
  { label:"This Month",   start:monStart(), end:today() },
  { label:"Last 30 Days", start:ago(29),    end:today() },
  { label:"Last 90 Days", start:ago(89),    end:today() },
];
const CV = { hidden:{opacity:0}, show:{opacity:1,transition:{staggerChildren:0.06}} };
const IV = { hidden:{opacity:0,y:14}, show:{opacity:1,y:0,transition:{duration:0.3,ease:"easeOut"}} };

// ── types ─────────────────────────────────────────────────────────────────────
interface BestItem   { productName:string; sku:string; totalQty:number; totalRevenue:number; orderCount:number }
interface CashierRow { cashierId:string|null; cashierName:string; salesCount:number; totalRevenue:number; totalDiscount:number; totalTax:number }
interface ProfitRow  { productName:string; variantName:string; sku:string; qty:number; revenue:number; cost:number; profit:number }
interface ProfitRpt  { rows:ProfitRow[]; totals:{revenue:number;cost:number;profit:number}; margin:string }
interface MonthlyPL  { month:string; revenue:number; expenses:number; profit:number }
interface RevPoint   { invoiceDate:string; total:number }
interface BranchRow  { branchId:string|null; branchName:string; branchCode:string; salesCount:number; totalRevenue:number; totalTax:number; totalDiscount:number }

// ── helper components ─────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color, bg, loading }:
  { label:string; value:string; sub?:string; icon:React.ElementType; color:string; bg:string; loading:boolean }) {
  return (
    <Card className="hover:shadow-lg transition-shadow group">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-muted-foreground mb-1">{label}</p>
            {loading ? <Skeleton className="h-7 w-28 mb-1"/> : <p className="text-2xl font-bold tracking-tight">{value}</p>}
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-xl ${bg} shrink-0 group-hover:scale-110 transition-transform`}>
            <Icon className={`h-5 w-5 ${color}`}/>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Empty({ msg="No data for this period" }:{msg?:string}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-muted-foreground">
      <AlertCircle className="h-8 w-8 opacity-30"/>
      <p className="text-sm">{msg}</p>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [range, setRange]           = React.useState({ label:"This Month", start:monStart(), end:today() });
  const [loading, setLoading]       = React.useState(true);
  const [bestSelling, setBest]      = React.useState<BestItem[]>([]);
  const [cashier, setCashier]       = React.useState<CashierRow[]>([]);
  const [profit, setProfit]         = React.useState<ProfitRpt|null>(null);
  const [monthly, setMonthly]       = React.useState<MonthlyPL[]>([]);
  const [revPoints, setRevPoints]   = React.useState<RevPoint[]>([]);
  const [branches, setBranches]     = React.useState<BranchRow[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { start, end } = range;
    const [bs, ca, pr, mo, rv, br] = await Promise.allSettled([
      api.get<BestItem[]>(`/reports/best-selling?startDate=${start}&endDate=${end}&limit=15`),
      api.get<CashierRow[]>(`/reports/cashier?startDate=${start}&endDate=${end}`),
      api.get<ProfitRpt>(`/reports/profit?startDate=${start}&endDate=${end}`),
      api.get<MonthlyPL[]>(`/accounting/monthly-pl?months=12`),
      api.get<RevPoint[]>(`/sales/revenue?period=day`),
      api.get<BranchRow[]>(`/reports/branches?startDate=${start}&endDate=${end}`),
    ]);
    if (bs.status==="fulfilled") setBest(Array.isArray(bs.value.data) ? bs.value.data : []);
    if (ca.status==="fulfilled") setCashier(Array.isArray(ca.value.data) ? ca.value.data : []);
    if (pr.status==="fulfilled") setProfit(pr.value.data ?? null);
    if (mo.status==="fulfilled") setMonthly(Array.isArray(mo.value.data) ? mo.value.data : []);
    if (rv.status==="fulfilled") setRevPoints(Array.isArray(rv.value.data) ? rv.value.data : []);
    if (br.status==="fulfilled") setBranches(Array.isArray(br.value.data) ? br.value.data : []);
    else toast.error("Some analytics data failed to load");
    setLoading(false);
  }, [range.start, range.end]); // eslint-disable-line

  React.useEffect(() => { load(); }, [load]);

  // derived
  const revChartData = React.useMemo(() => {
    const map = new Map<string, number>();
    revPoints.forEach(r => {
      const d = new Date(r.invoiceDate).toLocaleDateString("en-LK",{day:"2-digit",month:"short"});
      map.set(d, (map.get(d)??0) + r.total);
    });
    return Array.from(map.entries()).map(([date,revenue])=>({date,revenue}));
  }, [revPoints]);

  const maxRev = Math.max(...bestSelling.map(b=>b.totalRevenue), 1);

  const kpis = [
    { label:"Total Revenue", value:`LKR ${formatNumber(profit?.totals.revenue??0)}`, sub:`${range.label}`, icon:DollarSign, color:"text-emerald-500", bg:"bg-emerald-500/10" },
    { label:"Total Cost",    value:`LKR ${formatNumber(profit?.totals.cost??0)}`,    sub:"Cost of goods sold",  icon:Package,   color:"text-orange-500", bg:"bg-orange-500/10" },
    { label:"Gross Profit",  value:`LKR ${formatNumber(profit?.totals.profit??0)}`,  sub:"Revenue minus cost",  icon:TrendingUp, color:"text-blue-500", bg:"bg-blue-500/10" },
    { label:"Profit Margin", value:`${profit?.margin??0}%`,  sub:"Overall gross margin",  icon:Percent, color:"text-violet-500", bg:"bg-violet-500/10" },
    { label:"Top Sellers",   value:String(bestSelling.length), sub:"Unique products sold", icon:Award, color:"text-amber-500", bg:"bg-amber-500/10" },
    { label:"Cashiers Active", value:String(cashier.length), sub:"Staff with sales", icon:User, color:"text-pink-500", bg:"bg-pink-500/10" },
  ];

  return (
    <motion.div variants={CV} initial="hidden" animate="show" className="p-6 space-y-6 max-w-[1700px] mx-auto">

      {/* ── Header ── */}
      <motion.div variants={IV} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Deep business intelligence — powered by live data</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground ml-1.5"/>
            {PRESETS.map(p=>(
              <button key={p.label}
                onClick={()=>setRange(p)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${range.label===p.label?"bg-primary text-primary-foreground shadow":"text-muted-foreground hover:text-foreground"}`}
              >{p.label}</button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/>Refresh
          </Button>
        </div>
      </motion.div>

      {/* ── KPI Grid ── */}
      <motion.div variants={IV} className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4">
        {kpis.map(k=><KpiCard key={k.label} {...k} loading={loading}/>)}
      </motion.div>

      {/* ── Revenue Trend (30 days) ── */}
      <motion.div variants={IV} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Revenue Trend</CardTitle>
            <CardDescription>Daily revenue — last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full rounded-xl"/> : revChartData.length===0 ? <Empty/> : (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={revChartData}>
                  <defs>
                    <linearGradient id="rg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={C[0]} stopOpacity={0.3}/>
                      <stop offset="95%" stopColor={C[0]} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                  <XAxis dataKey="date" tick={{fontSize:10}} axisLine={false} tickLine={false} interval={4}/>
                  <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                  <Tooltip contentStyle={TT} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,"Revenue"]}/>
                  <Area type="monotone" dataKey="revenue" stroke={C[0]} strokeWidth={2.5} fill="url(#rg)" name="Revenue"/>
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Top 5 by revenue donut */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Top 5 Products</CardTitle>
            <CardDescription>By revenue — {range.label.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-[220px] w-full rounded-xl"/> : bestSelling.length===0 ? <Empty/> : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={bestSelling.slice(0,5)} cx="50%" cy="50%" innerRadius={38} outerRadius={62} paddingAngle={3} dataKey="totalRevenue">
                      {bestSelling.slice(0,5).map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                    </Pie>
                    <Tooltip contentStyle={TT} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,"Revenue"]}/>
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 space-y-1.5">
                  {bestSelling.slice(0,5).map((b,i)=>(
                    <div key={b.sku} className="flex items-center gap-2 text-xs">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{background:C[i%C.length]}}/>
                      <span className="flex-1 truncate text-muted-foreground">{b.productName}</span>
                      <span className="font-semibold">{((b.totalRevenue/maxRev)*100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Tabs ── */}
      <motion.div variants={IV}>
        <Tabs defaultValue="monthly">
          <TabsList className="h-10 p-1">
            <TabsTrigger value="monthly"  className="text-[13px]">Monthly P&L</TabsTrigger>
            <TabsTrigger value="bestselling" className="text-[13px]">Best Selling</TabsTrigger>
            <TabsTrigger value="profit"   className="text-[13px]">Profit by Product</TabsTrigger>
            <TabsTrigger value="cashier"  className="text-[13px]">Cashier Performance</TabsTrigger>
            <TabsTrigger value="branches" className="text-[13px]">Top Branches</TabsTrigger>
          </TabsList>

          {/* ── Monthly P&L ── */}
          <TabsContent value="monthly" className="mt-4 space-y-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Revenue vs Expenses vs Profit</CardTitle>
                  <CardDescription>Last 12 months grouped</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[280px] w-full rounded-xl"/> : monthly.length===0 ? <Empty/> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={monthly} barSize={12}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                        <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                        <Tooltip contentStyle={TT} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,""]}/>
                        <Legend formatter={v=><span className="text-[11px]">{v}</span>}/>
                        <Bar dataKey="revenue"  fill={C[0]} radius={[3,3,0,0]} name="Revenue"/>
                        <Bar dataKey="expenses" fill={C[3]} radius={[3,3,0,0]} name="Expenses"/>
                        <Bar dataKey="profit"   fill={C[1]} radius={[3,3,0,0]} name="Profit"/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Profit Trend</CardTitle>
                  <CardDescription>Monthly net profit curve</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[280px] w-full rounded-xl"/> : monthly.length===0 ? <Empty/> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={monthly}>
                        <defs>
                          <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={C[1]} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={C[1]} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                        <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                        <Tooltip contentStyle={TT} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,""]}/>
                        <Area type="monotone" dataKey="profit" stroke={C[1]} strokeWidth={2.5} fill="url(#pg)" name="Profit"/>
                        <Line type="monotone" dataKey="revenue" stroke={C[0]} strokeWidth={1.5} dot={false} name="Revenue" strokeDasharray="4 2"/>
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* P&L summary table */}
            {!loading && monthly.length>0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Monthly P&L Summary</CardTitle>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="py-2 pr-4 text-left">Month</th>
                        <th className="py-2 pr-4 text-right">Revenue</th>
                        <th className="py-2 pr-4 text-right">Expenses</th>
                        <th className="py-2 pr-4 text-right">Profit</th>
                        <th className="py-2 text-right">Margin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...monthly].reverse().map(m=>{
                        const margin = m.revenue>0 ? ((m.profit/m.revenue)*100).toFixed(1) : "0";
                        return (
                          <tr key={m.month} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 pr-4 font-medium">{m.month}</td>
                            <td className="py-2 pr-4 text-right">LKR {formatNumber(m.revenue)}</td>
                            <td className="py-2 pr-4 text-right text-red-500">LKR {formatNumber(m.expenses)}</td>
                            <td className="py-2 pr-4 text-right font-bold text-emerald-500">LKR {formatNumber(m.profit)}</td>
                            <td className="py-2 text-right">
                              <Badge variant={parseFloat(margin)>=20?"success":parseFloat(margin)>=10?"warning":"destructive"} className="text-[10px] h-4 px-1.5">{margin}%</Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Best Selling ── */}
          <TabsContent value="bestselling" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Units Sold — Top 10</CardTitle>
                  <CardDescription>Horizontal bar chart by quantity</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[320px] w-full rounded-xl"/> : bestSelling.length===0 ? <Empty/> : (
                    <ResponsiveContainer width="100%" height={320}>
                      <BarChart data={bestSelling.slice(0,10)} layout="vertical" barSize={13}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false}/>
                        <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis type="category" dataKey="productName" tick={{fontSize:10}} axisLine={false} tickLine={false} width={110}/>
                        <Tooltip contentStyle={TT} formatter={(v:number)=>[`${v} units`,"Sold"]}/>
                        <Bar dataKey="totalQty" radius={[0,4,4,0]} name="Qty Sold">
                          {bestSelling.slice(0,10).map((_,i)=><Cell key={i} fill={C[i%C.length]}/>)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Revenue Leaderboard</CardTitle>
                  <CardDescription>Ranked with progress bars</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-80 overflow-y-auto">
                  {loading ? Array.from({length:6}).map((_,i)=><Skeleton key={i} className="h-12 w-full rounded-lg"/>) :
                   bestSelling.length===0 ? <Empty/> :
                   bestSelling.map((b,i)=>(
                    <div key={b.sku}>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold w-5 text-muted-foreground">#{i+1}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{b.productName}</p>
                          <p className="text-[11px] text-muted-foreground">{b.sku} · {b.orderCount} orders · {b.totalQty} units</p>
                        </div>
                        <span className="text-sm font-bold shrink-0">LKR {formatNumber(b.totalRevenue)}</span>
                      </div>
                      <Progress value={(b.totalRevenue/maxRev)*100} className="h-1.5" style={{"--tw-ring-color":C[i%C.length]} as React.CSSProperties}/>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Profit by Product ── */}
          <TabsContent value="profit" className="mt-4 space-y-4">
            {/* top 8 bar chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Revenue vs Cost vs Profit — Top 8 Products</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? <Skeleton className="h-[260px] w-full rounded-xl"/> :
                 !profit?.rows.length ? <Empty/> : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={profit.rows.slice(0,8)} barSize={11}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                      <XAxis dataKey="productName" tick={{fontSize:9}} axisLine={false} tickLine={false} tickFormatter={v=>v.length>12?v.slice(0,12)+"…":v}/>
                      <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                      <Tooltip contentStyle={TT} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,""]}/>
                      <Legend formatter={v=><span className="text-[11px]">{v}</span>}/>
                      <Bar dataKey="revenue" fill={C[0]} radius={[3,3,0,0]} name="Revenue"/>
                      <Bar dataKey="cost"    fill={C[3]} radius={[3,3,0,0]} name="Cost"/>
                      <Bar dataKey="profit"  fill={C[1]} radius={[3,3,0,0]} name="Profit"/>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* table */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Product Profit Table</CardTitle>
                  <Badge variant="outline" className="text-xs">Overall margin: {profit?.margin ?? 0}%</Badge>
                </div>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="py-2 pr-3 text-left">Product</th>
                      <th className="py-2 pr-3 text-left font-mono">SKU</th>
                      <th className="py-2 pr-3 text-right">Qty</th>
                      <th className="py-2 pr-3 text-right">Revenue</th>
                      <th className="py-2 pr-3 text-right">Cost</th>
                      <th className="py-2 pr-3 text-right">Profit</th>
                      <th className="py-2 text-right">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? Array.from({length:5}).map((_,i)=>(
                      <tr key={i}><td colSpan={7} className="py-2"><Skeleton className="h-8 w-full"/></td></tr>
                    )) :
                    profit?.rows.map(r=>{
                      const m = r.revenue>0 ? ((r.profit/r.revenue)*100).toFixed(1) : "0";
                      const mf = parseFloat(m);
                      return (
                        <tr key={r.sku} className="border-b hover:bg-muted/30 transition-colors">
                          <td className="py-2.5 pr-3 font-medium">{r.productName} <span className="text-muted-foreground font-normal text-xs">{r.variantName}</span></td>
                          <td className="py-2.5 pr-3 text-muted-foreground font-mono text-xs">{r.sku}</td>
                          <td className="py-2.5 pr-3 text-right">{r.qty}</td>
                          <td className="py-2.5 pr-3 text-right">LKR {formatNumber(r.revenue)}</td>
                          <td className="py-2.5 pr-3 text-right text-red-500">LKR {formatNumber(r.cost)}</td>
                          <td className="py-2.5 pr-3 text-right font-bold text-emerald-500">LKR {formatNumber(r.profit)}</td>
                          <td className="py-2.5 text-right">
                            <span className={`text-xs font-bold ${mf>=20?"text-emerald-500":mf>=10?"text-amber-500":"text-red-500"}`}>{m}%</span>
                          </td>
                        </tr>
                      );
                    })}
                    {!loading && !profit?.rows.length && <tr><td colSpan={7}><Empty/></td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Cashier Performance ── */}
          <TabsContent value="cashier" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Revenue by Cashier</CardTitle>
                  <CardDescription>Grouped bar — revenue, discount, tax</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[280px] w-full rounded-xl"/> : cashier.length===0 ? <Empty/> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={cashier} barSize={18}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                        <XAxis dataKey="cashierName" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                        <Tooltip contentStyle={TT} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,""]}/>
                        <Legend formatter={v=><span className="text-[11px]">{v}</span>}/>
                        <Bar dataKey="totalRevenue"  fill={C[0]} radius={[4,4,0,0]} name="Revenue"/>
                        <Bar dataKey="totalDiscount" fill={C[2]} radius={[4,4,0,0]} name="Discount"/>
                        <Bar dataKey="totalTax"      fill={C[4]} radius={[4,4,0,0]} name="Tax"/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Cashier Leaderboard</CardTitle>
                  <CardDescription>Ranked by total revenue</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {loading ? Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-16 w-full rounded-lg"/>) :
                   cashier.length===0 ? <Empty/> :
                   cashier.map((c,i)=>{
                     const maxCRev = Math.max(...cashier.map(x=>x.totalRevenue), 1);
                     return (
                       <div key={c.cashierId??i} className="p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
                         <div className="flex items-center gap-3 mb-2">
                           <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{background:C[i%C.length]}}>
                             {i===0 ? <Award className="h-4 w-4"/> : <User className="h-4 w-4"/>}
                           </div>
                           <div className="flex-1 min-w-0">
                             <div className="flex items-center gap-2">
                               <p className="text-sm font-semibold truncate">{c.cashierName}</p>
                               {i===0 && <Badge className="text-[9px] h-4 px-1" style={{background:C[0]}}>Top</Badge>}
                             </div>
                             <p className="text-xs text-muted-foreground">{c.salesCount} sales · LKR {formatNumber(c.totalDiscount)} discount</p>
                           </div>
                           <p className="text-sm font-bold shrink-0">LKR {formatNumber(c.totalRevenue)}</p>
                         </div>
                         <Progress value={(c.totalRevenue/maxCRev)*100} className="h-1.5"/>
                       </div>
                     );
                   })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ── Top Branches ── */}
          <TabsContent value="branches" className="mt-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Revenue by Branch</CardTitle>
                  <CardDescription>{range.label.toLowerCase()}</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? <Skeleton className="h-[280px] w-full rounded-xl"/> : branches.length===0 ? <Empty/> : (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={branches} barSize={22}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                        <XAxis dataKey="branchName" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                        <Tooltip contentStyle={TT} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,"Revenue"]}/>
                        <Bar dataKey="totalRevenue" fill={C[0]} radius={[4,4,0,0]} name="Revenue"/>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Branch Leaderboard</CardTitle>
                  <CardDescription>Ranked by sales count and revenue</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 max-h-80 overflow-y-auto">
                  {loading ? Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-14 w-full rounded-lg"/>) :
                   branches.length===0 ? <Empty/> :
                   branches.map((b,i)=>{
                     const maxBRev = Math.max(...branches.map(x=>x.totalRevenue), 1);
                     return (
                       <div key={b.branchId??i} className="p-3 rounded-xl border bg-card hover:bg-muted/30 transition-colors">
                         <div className="flex items-center gap-3 mb-2">
                           <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0" style={{background:C[i%C.length]}}>
                             #{i+1}
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-semibold truncate">{b.branchName}</p>
                             <p className="text-xs text-muted-foreground">{b.branchCode} · {b.salesCount} sales</p>
                           </div>
                           <p className="text-sm font-bold shrink-0">LKR {formatNumber(b.totalRevenue)}</p>
                         </div>
                         <Progress value={(b.totalRevenue/maxBRev)*100} className="h-1.5"/>
                       </div>
                     );
                   })}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </motion.div>

    </motion.div>
  );
}
