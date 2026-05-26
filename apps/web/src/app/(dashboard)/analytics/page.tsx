"use client";

import * as React from "react";
import { BarChart3, TrendingUp, Users, ShoppingCart, DollarSign, RefreshCw, Package, User } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

const COLORS = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#ec4899","#84cc16","#f97316","#6366f1"];
const TT_STYLE = { background:"hsl(var(--popover))", border:"1px solid hsl(var(--border))", borderRadius:"10px", fontSize:"11px" };
const fmtDate = (d: Date) => d.toISOString().split("T")[0];
const today = () => fmtDate(new Date());
const monthStart = () => { const d = new Date(); d.setDate(1); return fmtDate(d); };
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate()-n); return fmtDate(d); };
const PRESETS = [
  { label:"Today", start:today(), end:today() },
  { label:"This Week", start:daysAgo(6), end:today() },
  { label:"This Month", start:monthStart(), end:today() },
  { label:"Last 30 Days", start:daysAgo(29), end:today() },
  { label:"Last 90 Days", start:daysAgo(89), end:today() },
];

interface BestItem { productName:string; sku:string; totalQty:number; totalRevenue:number; orderCount:number }
interface CashierRow { cashierId:string|null; cashierName:string; salesCount:number; totalRevenue:number; totalDiscount:number }
interface ProfitRow { productName:string; variantName:string; sku:string; qty:number; revenue:number; cost:number; profit:number }
interface ProfitReport { rows:ProfitRow[]; totals:{revenue:number;cost:number;profit:number}; margin:string }
interface MonthlyPL { month:string; revenue:number; expenses:number; profit:number }

export default function AnalyticsPage() {
  const [range, setRange] = React.useState({ label:"This Month", start:monthStart(), end:today() });
  const [loading, setLoading] = React.useState(true);
  const [bestSelling, setBestSelling] = React.useState<BestItem[]>([]);
  const [cashier, setCashier] = React.useState<CashierRow[]>([]);
  const [profit, setProfit] = React.useState<ProfitReport|null>(null);
  const [monthly, setMonthly] = React.useState<MonthlyPL[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const { start, end } = range;
      const [bs, ca, pr, mo] = await Promise.all([
        api.get<BestItem[]>(`/reports/best-selling?startDate=${start}&endDate=${end}&limit=15`),
        api.get<CashierRow[]>(`/reports/cashier?startDate=${start}&endDate=${end}`),
        api.get<ProfitReport>(`/reports/profit?startDate=${start}&endDate=${end}`),
        api.get<MonthlyPL[]>(`/accounting/monthly-pl?months=12`),
      ]);
      setBestSelling(Array.isArray(bs.data) ? bs.data : []);
      setCashier(Array.isArray(ca.data) ? ca.data : []);
      setProfit(pr.data ?? null);
      setMonthly(Array.isArray(mo.data) ? mo.data : []);
    } catch { toast.error("Failed to load analytics"); }
    finally { setLoading(false); }
  }, [range.start, range.end]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => { load(); }, [load]);

  const kpis = [
    { label:"Total Revenue", val:`LKR ${formatNumber(profit?.totals.revenue??0)}`, icon:DollarSign, color:"text-emerald-500", bg:"bg-emerald-500/10" },
    { label:"Total Cost", val:`LKR ${formatNumber(profit?.totals.cost??0)}`, icon:Package, color:"text-orange-500", bg:"bg-orange-500/10" },
    { label:"Gross Profit", val:`LKR ${formatNumber(profit?.totals.profit??0)}`, icon:TrendingUp, color:"text-blue-500", bg:"bg-blue-500/10" },
    { label:"Profit Margin", val:`${profit?.margin??'0'}%`, icon:BarChart3, color:"text-violet-500", bg:"bg-violet-500/10" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">Real-time business intelligence</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {PRESETS.map(p => (
            <Button key={p.label} size="sm" variant={range.label===p.label?"default":"outline"} onClick={()=>setRange(p)}>{p.label}</Button>
          ))}
          <Button size="sm" variant="outline" onClick={load} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/></Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${k.bg}`}><k.icon className={`h-5 w-5 ${k.color}`}/></div>
              <div>
                <p className="text-xl font-bold">{k.val}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="monthly">
        <TabsList>
          <TabsTrigger value="monthly">Monthly Trend</TabsTrigger>
          <TabsTrigger value="bestselling">Best Selling</TabsTrigger>
          <TabsTrigger value="profit">Profit by Product</TabsTrigger>
          <TabsTrigger value="cashier">Cashier Performance</TabsTrigger>
        </TabsList>

        {/* Monthly Revenue vs Profit */}
        <TabsContent value="monthly" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue vs Expenses vs Profit (12 months)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={monthly} barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                    <Tooltip contentStyle={TT_STYLE} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,""]}/>
                    <Legend formatter={v=><span className="text-xs">{v}</span>}/>
                    <Bar dataKey="revenue" fill={COLORS[0]} radius={[3,3,0,0]} name="Revenue"/>
                    <Bar dataKey="expenses" fill={COLORS[3]} radius={[3,3,0,0]} name="Expenses"/>
                    <Bar dataKey="profit" fill={COLORS[1]} radius={[3,3,0,0]} name="Profit"/>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Profit Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={monthly}>
                    <defs>
                      <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS[1]} stopOpacity={0.3}/>
                        <stop offset="95%" stopColor={COLORS[1]} stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                    <XAxis dataKey="month" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                    <Tooltip contentStyle={TT_STYLE} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,""]}/>
                    <Area type="monotone" dataKey="profit" stroke={COLORS[1]} strokeWidth={2} fill="url(#profitGrad)" name="Profit"/>
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Best Selling */}
        <TabsContent value="bestselling" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Top Products by Quantity Sold</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={bestSelling.slice(0,10)} layout="vertical" barSize={14}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false}/>
                    <XAxis type="number" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="productName" tick={{fontSize:10}} axisLine={false} tickLine={false} width={120}/>
                    <Tooltip contentStyle={TT_STYLE}/>
                    <Bar dataKey="totalQty" radius={[0,3,3,0]} name="Qty Sold">
                      {bestSelling.slice(0,10).map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Top Products by Revenue</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {bestSelling.map((b,i)=>(
                  <div key={b.sku} className="flex items-center gap-3">
                    <span className="text-xs font-bold text-muted-foreground w-5">{i+1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{b.productName}</p>
                      <p className="text-xs text-muted-foreground">{b.sku} · {b.orderCount} orders</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">LKR {formatNumber(b.totalRevenue)}</p>
                      <p className="text-xs text-muted-foreground">{b.totalQty} units</p>
                    </div>
                  </div>
                ))}
                {!bestSelling.length && <p className="text-sm text-muted-foreground text-center py-8">No sales data for this period</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Profit by Product */}
        <TabsContent value="profit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profit by Product — Total Margin: {profit?.margin ?? 0}%</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-4">Product</th>
                    <th className="py-2 pr-4">SKU</th>
                    <th className="py-2 pr-4 text-right">Qty</th>
                    <th className="py-2 pr-4 text-right">Revenue</th>
                    <th className="py-2 pr-4 text-right">Cost</th>
                    <th className="py-2 pr-4 text-right">Profit</th>
                    <th className="py-2 text-right">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {profit?.rows.map(r => {
                    const margin = r.revenue > 0 ? ((r.profit/r.revenue)*100).toFixed(1) : '0';
                    return (
                      <tr key={r.sku} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2 pr-4 font-medium">{r.productName} <span className="text-muted-foreground font-normal">{r.variantName}</span></td>
                        <td className="py-2 pr-4 text-muted-foreground font-mono text-xs">{r.sku}</td>
                        <td className="py-2 pr-4 text-right">{r.qty}</td>
                        <td className="py-2 pr-4 text-right">LKR {formatNumber(r.revenue)}</td>
                        <td className="py-2 pr-4 text-right text-red-500">LKR {formatNumber(r.cost)}</td>
                        <td className="py-2 pr-4 text-right font-bold text-emerald-500">LKR {formatNumber(r.profit)}</td>
                        <td className="py-2 text-right"><span className={`text-xs font-bold ${parseFloat(margin)>=20?"text-emerald-500":parseFloat(margin)>=10?"text-amber-500":"text-red-500"}`}>{margin}%</span></td>
                      </tr>
                    );
                  })}
                  {!profit?.rows.length && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No data for this period</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cashier Performance */}
        <TabsContent value="cashier" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by Cashier</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={cashier} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false}/>
                    <XAxis dataKey="cashierName" tick={{fontSize:10}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10}} axisLine={false} tickLine={false} tickFormatter={v=>`${(v/1000).toFixed(0)}k`}/>
                    <Tooltip contentStyle={TT_STYLE} formatter={(v:number)=>[`LKR ${formatNumber(v)}`,""]}/>
                    <Bar dataKey="totalRevenue" radius={[4,4,0,0]} name="Revenue">
                      {cashier.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Cashier Summary</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {cashier.map((c,i)=>(
                  <div key={c.cashierId??i} className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center text-white text-sm font-bold`} style={{background:COLORS[i%COLORS.length]}}>
                      <User className="h-4 w-4"/>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{c.cashierName}</p>
                      <p className="text-xs text-muted-foreground">{c.salesCount} sales · LKR {formatNumber(c.totalDiscount)} discount given</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">LKR {formatNumber(c.totalRevenue)}</p>
                    </div>
                  </div>
                ))}
                {!cashier.length && <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
