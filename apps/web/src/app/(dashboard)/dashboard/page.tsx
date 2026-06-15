"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, ShoppingCart, Users, Package, DollarSign,
  ArrowUpRight, ArrowDownRight, Sparkles, AlertTriangle,
  RefreshCw, Plus, Eye, Clock, Zap,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
const RevenueChart = dynamic(() => import("./_charts").then((m) => m.RevenueChart), { ssr: false, loading: () => <Skeleton className="h-[300px] w-full rounded-xl" /> });
const PaymentMethodsChart = dynamic(() => import("./_charts").then((m) => m.PaymentMethodsChart), { ssr: false, loading: () => <Skeleton className="h-[240px] w-full rounded-xl" /> });
const DailyOrdersChart = dynamic(() => import("./_charts").then((m) => m.DailyOrdersChart), { ssr: false, loading: () => <Skeleton className="h-[280px] w-full rounded-xl" /> });
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatNumber, getInitials } from "@/lib/utils";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { toast } from "sonner";
import { useShopProfile } from "@/lib/use-shop-profile";
import { getWorkspace } from "@/lib/shop-workspace";

// ── Types ────────────────────────────────────────────────────────────────────
interface DailySummary {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  byPaymentMethod: Record<string, number>;
}
interface SaleRow {
  id: string;
  invoiceNumber: string;
  total: number;
  invoiceDate: string;
  status: string;
  customer?: { name: string } | null;
}
interface TopProduct {
  variantId: string;
  productName: string;
  sku: string;
  _sum: { quantity: number | null; total: number | null };
}
interface LowStockItem {
  id: string;
  quantity: number;
  minStockLevel: number;
  variant: { name: string; sku: string; product: { name: string } };
}
interface RevenuePoint {
  invoiceDate: string;
  total: number;
  taxAmount: number;
  discountAmount: number;
}

// ── Chart helpers ────────────────────────────────────────────────────────────
function groupByDate(raw: RevenuePoint[] | unknown, days: number) {
  const list = parseApiList<RevenuePoint>(raw);
  const map = new Map<string, { date: string; revenue: number; orders: number }>();
  const since = Date.now() - days * 864e5;
  list
    .filter((r) => new Date(r.invoiceDate).getTime() >= since)
    .forEach((r) => {
      const d = new Date(r.invoiceDate).toLocaleDateString("en-LK", { day: "2-digit", month: "short" });
      const prev = map.get(d) ?? { date: d, revenue: 0, orders: 0 };
      map.set(d, { date: d, revenue: prev.revenue + r.total, orders: prev.orders + 1 });
    });
  return Array.from(map.values());
}

const insightColors: Record<string, string> = {
  opportunity: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  alert:       "text-amber-500 bg-amber-500/10 border-amber-500/20",
  action:      "text-blue-500 bg-blue-500/10 border-blue-500/20",
};
const insightIcons: Record<string, React.ElementType> = {
  opportunity: TrendingUp, alert: AlertTriangle, action: Zap,
};

const CV = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.07 } } };
const IV = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } } };

// ── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const shopProfile = useShopProfile();
  const workspace = getWorkspace(shopProfile.type);
  const [period, setPeriod] = React.useState<"7d" | "30d">("30d");
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary]     = React.useState<DailySummary | null>(null);
  const [recentSales, setRecentSales] = React.useState<SaleRow[]>([]);
  const [topProducts, setTopProducts] = React.useState<TopProduct[]>([]);
  const [lowStock, setLowStock]   = React.useState<LowStockItem[]>([]);
  const [revenue, setRevenue]     = React.useState<RevenuePoint[]>([]);
  const [custTotal, setCustTotal] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, salesRes, topRes, lowRes, revRes, custRes] = await Promise.allSettled([
        api.get<DailySummary>("/pos/summary"),
        api.get<{ data: SaleRow[] }>("/sales?limit=5"),
        api.get<TopProduct[]>("/sales/top-products?days=30"),
        api.get<LowStockItem[]>("/inventory/low-stock"),
        api.get<RevenuePoint[]>("/sales/revenue?period=day"),
        api.get<{ total: number }>("/customers?limit=1"),
      ]);
      if (sumRes.status   === "fulfilled") setSummary(sumRes.value.data ?? null);
      if (salesRes.status === "fulfilled") setRecentSales(parseApiList<SaleRow>(salesRes.value.data));
      if (topRes.status   === "fulfilled") setTopProducts(parseApiList<TopProduct>(topRes.value.data));
      if (lowRes.status   === "fulfilled") setLowStock(parseApiList<LowStockItem>(lowRes.value.data));
      if (revRes.status   === "fulfilled") setRevenue(parseApiList<RevenuePoint>(revRes.value.data));
      if (custRes.status  === "fulfilled") {
        const payload = custRes.value.data as unknown as { total?: number; meta?: { total?: number } };
        setCustTotal(payload?.meta?.total ?? payload?.total ?? 0);
      }
      const errors = [sumRes, salesRes, topRes, lowRes, revRes, custRes]
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message);
      if (errors.length > 0) toast.error(`Dashboard: ${errors[0]}`);
    } catch { toast.error("Failed to load dashboard"); }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const chartData  = React.useMemo(() => groupByDate(revenue, period === "7d" ? 7 : 30), [revenue, period]);
  const pmethods   = React.useMemo(() => Object.entries(summary?.byPaymentMethod ?? {}).map(([name, value]) => ({ name, value })), [summary]);

  const AI_INSIGHTS = React.useMemo(() => {
    const insights = [];
    if (summary && summary.totalRevenue > 0) {
      insights.push({ insight: `Today's revenue is LKR ${formatNumber(summary.totalRevenue)} from ${summary.totalSales} sale${summary.totalSales !== 1 ? "s" : ""}`, type: "opportunity", confidence: 98 });
    }
    if (lowStock.length > 0) {
      insights.push({ insight: `${lowStock.length} product${lowStock.length > 1 ? "s are" : " is"} running low — restock soon to avoid lost sales`, type: "alert", confidence: 95 });
    }
    if (topProducts.length > 0) {
      insights.push({ insight: `"${topProducts[0]?.productName}" is your best seller this month with ${topProducts[0]?._sum?.quantity ?? 0} units sold`, type: "opportunity", confidence: 90 });
    }
    if (summary && summary.totalDiscount > 0) {
      const pct = ((summary.totalDiscount / (summary.totalRevenue + summary.totalDiscount)) * 100).toFixed(1);
      insights.push({ insight: `Discount rate today is ${pct}% — review promo effectiveness`, type: "action", confidence: 80 });
    }
    if (insights.length === 0) {
      insights.push({ insight: workspace.tips[0] ?? "Open POS to start selling", type: "action", confidence: 100 });
    }
    return insights;
  }, [summary, lowStock, topProducts, workspace.tips]);

  const statCards = [
    {
      title: "Today's Revenue",
      value: loading ? "—" : `LKR ${formatNumber(summary?.totalRevenue ?? 0)}`,
      sub: `${summary?.totalSales ?? 0} orders`,
      icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10",
    },
    {
      title: "Today's Orders",
      value: loading ? "—" : String(summary?.totalSales ?? 0),
      sub: `LKR ${formatNumber(summary?.totalDiscount ?? 0)} discounted`,
      icon: ShoppingCart, color: "text-blue-500", bg: "bg-blue-500/10",
    },
    {
      title: `Total ${workspace.customerLabel}`,
      value: loading ? "—" : formatNumber(custTotal),
      sub: "registered in system",
      icon: Users, color: "text-violet-500", bg: "bg-violet-500/10",
    },
    {
      title: "Low Stock Alerts",
      value: loading ? "—" : String(lowStock.length),
      sub: lowStock.length > 0 ? "Requires restock" : "All stock OK",
      icon: Package, color: "text-amber-500", bg: "bg-amber-500/10",
    },
  ];

  return (
    <motion.div variants={CV} initial="hidden" animate="show" className="p-6 space-y-6 max-w-[1600px] mx-auto">

      {/* Header */}
      <motion.div variants={IV} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Sales, inventory and business overview
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Data
          </div>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </motion.div>

      {/* KPI Stats */}
      <motion.div variants={IV} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-lg transition-shadow duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{stat.title}</p>
                    {loading ? <Skeleton className="h-7 w-24 mb-1" /> : <p className="text-2xl font-bold tracking-tight">{stat.value}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${stat.bg} shrink-0 group-hover:scale-110 transition-transform`}>
                    <Icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>

      {/* Charts row */}
      <motion.div variants={IV} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <RevenueChart chartData={chartData} period={period} setPeriod={setPeriod} loading={loading} />
        <PaymentMethodsChart pmethods={pmethods} loading={loading} />
      </motion.div>

      {/* AI Insights + Top Products + Recent Sales */}
      <motion.div variants={IV} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* AI Insights */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-violet-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">AI Insights</CardTitle>
                <CardDescription>Powered by {workspace.aiBrand}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />) :
              AI_INSIGHTS.map((insight, i) => {
                const InsightIcon = insightIcons[insight.type] ?? Zap;
                return (
                  <motion.div key={i} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 * i }}
                    className={`p-3 rounded-lg border ${insightColors[insight.type]} cursor-pointer hover:opacity-90 transition-opacity`}>
                    <div className="flex items-start gap-2.5">
                      <InsightIcon className="h-4 w-4 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-snug">{insight.insight}</p>
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Progress value={insight.confidence} className="h-1 flex-1" />
                          <span className="text-[10px] font-semibold shrink-0">{insight.confidence}%</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{workspace.topSellingLabel}</CardTitle>
                <CardDescription>By quantity sold — last 30 days</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />) :
              topProducts.length === 0 ? <p className="text-sm text-muted-foreground">No sales data yet</p> :
              topProducts.slice(0, 5).map((p, i) => (
                <div key={p.variantId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.productName}</p>
                    <p className="text-xs text-muted-foreground">{p.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">LKR {formatNumber(p._sum.total ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{p._sum.quantity ?? 0} units</p>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        {/* Recent Sales */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Sales</CardTitle>
                <CardDescription>Live transaction feed</CardDescription>
              </div>
              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {loading ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />) :
              recentSales.length === 0 ? <p className="text-sm text-muted-foreground">No recent sales</p> :
              recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center gap-3">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarFallback className="text-[10px] font-semibold">
                      {getInitials(sale.customer?.name ?? "Walk-in")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{sale.customer?.name ?? "Walk-in Customer"}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{sale.invoiceNumber}</span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                      <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(sale.invoiceDate).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">LKR {formatNumber(sale.total)}</p>
                    <Badge variant={sale.status === "COMPLETED" ? "success" : "secondary"} className="text-[10px] h-4 px-1.5">
                      {sale.status}
                    </Badge>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* Low Stock + Daily Orders Bar */}
      <motion.div variants={IV} className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Low Stock */}
        <Card className="border-amber-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-amber-500/10">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <CardTitle className="text-base">Low Stock Alerts</CardTitle>
                <CardDescription>Items needing immediate restock</CardDescription>
              </div>
              {!loading && (
                <Badge variant="warning" className="ml-auto">{lowStock.length} items</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />) :
              lowStock.length === 0 ? (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-sm text-emerald-600 font-medium">
                  All stock levels are healthy ✓
                </div>
              ) :
              lowStock.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.variant?.product?.name ?? "Unknown product"}</p>
                    <p className="text-xs text-muted-foreground">{item.variant?.name ?? "—"} · {item.variant?.sku ?? "—"}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold text-amber-500">{item.quantity} left</p>
                    <p className="text-xs text-muted-foreground">min: {item.minStockLevel}</p>
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>

        <DailyOrdersChart ordersData={groupByDate(revenue, 14)} loading={loading} />
      </motion.div>

    </motion.div>
  );
}
