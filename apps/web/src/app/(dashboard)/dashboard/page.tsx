"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, ShoppingCart, Users, Package, DollarSign,
  Sparkles, AlertTriangle, Clock, Zap, Wallet, CalendarDays,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import dynamic from "next/dynamic";
const RevenueChart = dynamic(() => import("./_charts").then((m) => m.RevenueChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[340px] w-full rounded-xl xl:col-span-2" />,
});
const PaymentMethodsChart = dynamic(() => import("./_charts").then((m) => m.PaymentMethodsChart), {
  ssr: false,
  loading: () => <Skeleton className="h-[340px] w-full rounded-xl" />,
});
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { formatNumber, getInitials } from "@/lib/utils";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { toast } from "sonner";
import { useShopProfile } from "@/lib/use-shop-profile";
import { getWorkspace } from "@/lib/shop-workspace";
import { useAuthStore } from "@/stores/auth-store";

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
interface ActiveCash {
  id: string;
  openingCash: number;
  expectedCash?: number | null;
  status: string;
  registerName?: string | null;
  branch?: { name?: string } | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
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

function sumRevenueSince(raw: RevenuePoint[], days: number) {
  const since = Date.now() - days * 864e5;
  return raw
    .filter((r) => new Date(r.invoiceDate).getTime() >= since)
    .reduce((s, r) => s + r.total, 0);
}

function greetingForNow() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatLongDate(d = new Date()) {
  return d.toLocaleDateString("en-LK", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const insightColors: Record<string, string> = {
  opportunity: "text-emerald-800 bg-emerald-50 border-emerald-100",
  alert: "text-amber-800 bg-amber-50 border-amber-100",
  action: "text-blue-800 bg-blue-50 border-blue-100",
};
const insightIcons: Record<string, React.ElementType> = {
  opportunity: TrendingUp,
  alert: AlertTriangle,
  action: Zap,
};

const CV = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };
const IV = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

export default function DashboardPage() {
  const shopProfile = useShopProfile();
  const workspace = getWorkspace(shopProfile.type);
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = React.useState<"7d" | "30d" | "90d">("30d");
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState<DailySummary | null>(null);
  const [recentSales, setRecentSales] = React.useState<SaleRow[]>([]);
  const [topProducts, setTopProducts] = React.useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = React.useState<LowStockItem[]>([]);
  const [revenue, setRevenue] = React.useState<RevenuePoint[]>([]);
  const [custTotal, setCustTotal] = React.useState(0);
  const [cashDrawer, setCashDrawer] = React.useState<ActiveCash | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, salesRes, topRes, lowRes, revRes, custRes, cashRes] = await Promise.allSettled([
        api.get<DailySummary>("/pos/summary"),
        api.get<{ data: SaleRow[] }>("/sales?limit=6"),
        api.get<TopProduct[]>("/sales/top-products?days=30"),
        api.get<LowStockItem[]>("/inventory/low-stock"),
        api.get<RevenuePoint[]>("/sales/revenue?period=day"),
        api.get<{ total: number }>("/customers?limit=1"),
        api.get<ActiveCash | null>("/cash/active"),
      ]);
      if (sumRes.status === "fulfilled") setSummary(sumRes.value.data ?? null);
      if (salesRes.status === "fulfilled") setRecentSales(parseApiList<SaleRow>(salesRes.value.data));
      if (topRes.status === "fulfilled") setTopProducts(parseApiList<TopProduct>(topRes.value.data));
      if (lowRes.status === "fulfilled") setLowStock(parseApiList<LowStockItem>(lowRes.value.data));
      if (revRes.status === "fulfilled") setRevenue(parseApiList<RevenuePoint>(revRes.value.data));
      if (custRes.status === "fulfilled") {
        const payload = custRes.value.data as unknown as { total?: number; meta?: { total?: number } };
        setCustTotal(payload?.meta?.total ?? payload?.total ?? 0);
      } else {
        setCustTotal(0);
      }
      if (cashRes.status === "fulfilled") {
        const c = cashRes.value.data;
        setCashDrawer(c && (c as ActiveCash).status === "OPEN" ? (c as ActiveCash) : null);
      } else {
        setCashDrawer(null);
      }

      const isPermissionError = (msg?: string) =>
        !!msg && /insufficient permissions|forbidden|403/i.test(msg);
      const errors = [sumRes, salesRes, topRes, lowRes, revRes, custRes]
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message as string | undefined)
        .filter((msg) => msg && !isPermissionError(msg));
      if (errors.length > 0) toast.error(`Dashboard: ${errors[0]}`);
    } catch {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const periodDays = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const chartData = React.useMemo(() => groupByDate(revenue, periodDays), [revenue, periodDays]);
  const pmethods = React.useMemo(
    () => Object.entries(summary?.byPaymentMethod ?? {}).map(([name, value]) => ({ name, value })),
    [summary],
  );

  const weekRevenue = React.useMemo(() => sumRevenueSince(revenue, 7), [revenue]);
  const monthRevenue = React.useMemo(() => sumRevenueSince(revenue, 30), [revenue]);
  const todayRevenue = summary?.totalRevenue ?? 0;

  const displayName = user?.name?.split(" ")[0] || user?.name || "Admin";

  const AI_INSIGHTS = React.useMemo(() => {
    const insights: { insight: string; type: string; confidence: number }[] = [];
    if (summary && summary.totalRevenue > 0) {
      insights.push({
        insight: `Today's revenue is LKR ${formatNumber(summary.totalRevenue)} from ${summary.totalSales} sale${summary.totalSales !== 1 ? "s" : ""}`,
        type: "opportunity",
        confidence: 98,
      });
    }
    if (lowStock.length > 0) {
      insights.push({
        insight: `${lowStock.length} product${lowStock.length > 1 ? "s are" : " is"} running low — restock soon to avoid lost sales`,
        type: "alert",
        confidence: 95,
      });
    }
    if (topProducts.length > 0) {
      insights.push({
        insight: `"${topProducts[0]?.productName}" is your best seller this month with ${topProducts[0]?._sum?.quantity ?? 0} units sold`,
        type: "opportunity",
        confidence: 90,
      });
    }
    if (summary && summary.totalDiscount > 0) {
      const pct = ((summary.totalDiscount / (summary.totalRevenue + summary.totalDiscount)) * 100).toFixed(1);
      insights.push({
        insight: `Discount rate today is ${pct}% — review promo effectiveness`,
        type: "action",
        confidence: 80,
      });
    }
    if (insights.length === 0) {
      insights.push({
        insight: workspace.tips[0] ?? "Open POS to start selling",
        type: "action",
        confidence: 100,
      });
    }
    return insights.slice(0, 3);
  }, [summary, lowStock, topProducts, workspace.tips]);

  const cashAmount = cashDrawer?.expectedCash ?? cashDrawer?.openingCash ?? 0;
  const cashLabel = cashDrawer
    ? cashDrawer.registerName || cashDrawer.branch?.name || "Main Register"
    : "No open shift";

  const statCards = [
    {
      title: "Today's Revenue",
      value: loading ? "—" : `LKR ${formatNumber(todayRevenue)}`,
      sub: `${summary?.totalSales ?? 0} orders today`,
      subTone: "text-emerald-600",
      icon: DollarSign,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
    {
      title: "Today's Orders",
      value: loading ? "—" : String(summary?.totalSales ?? 0),
      sub: `LKR ${formatNumber(summary?.totalDiscount ?? 0)} discounted`,
      subTone: "text-muted-foreground",
      icon: ShoppingCart,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      title: `Total ${workspace.customerLabel}`,
      value: loading ? "—" : formatNumber(custTotal),
      sub: "registered in system",
      subTone: "text-muted-foreground",
      icon: Users,
      color: "text-violet-600",
      bg: "bg-violet-50",
    },
    {
      title: "Low Stock Alerts",
      value: loading ? "—" : String(lowStock.length),
      sub: lowStock.length > 0 ? "Requires restock" : "All stock OK",
      subTone: lowStock.length > 0 ? "text-amber-600" : "text-emerald-600",
      icon: Package,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      title: "Cash in Drawer",
      value: loading ? "—" : cashDrawer ? `LKR ${formatNumber(cashAmount)}` : "—",
      sub: cashLabel,
      subTone: "text-muted-foreground",
      icon: Wallet,
      color: "text-sky-600",
      bg: "bg-sky-50",
    },
  ];

  return (
    <motion.div variants={CV} initial="hidden" animate="show" className="page-shell">
      {/* Greeting */}
      <motion.div variants={IV} className="flex items-start justify-between flex-wrap gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {greetingForNow()}, {displayName}!{" "}
            <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm font-normal text-muted-foreground leading-relaxed">
            Here&apos;s what&apos;s happening in your store today
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-100">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Data
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] bg-card text-xs font-medium text-muted-foreground ring-1 ring-slate-900/[0.05] ">
            <CalendarDays className="h-3.5 w-3.5" />
            {formatLongDate()}
          </div>
        </div>
      </motion.div>

      {/* KPI row — 5 cards like reference */}
      <motion.div variants={IV} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="card-hover">
              <CardContent className="p-5 flex items-center gap-3.5">
                <div className={`h-11 w-11 rounded-full flex items-center justify-center shrink-0 ${stat.bg}`}>
                  <Icon className={`h-5 w-5 ${stat.color}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-muted-foreground truncate">{stat.title}</p>
                  {loading ? (
                    <Skeleton className="h-6 w-20 mt-1" />
                  ) : (
                    <p className="text-xl font-bold tracking-tight tabular-nums truncate mt-0.5">
                      {stat.value}
                    </p>
                  )}
                  <p className={`text-[11px] font-medium mt-1 truncate ${stat.subTone}`}>{stat.sub}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </motion.div>

      {/* Charts */}
      <motion.div variants={IV} className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <RevenueChart
          chartData={chartData}
          period={period}
          setPeriod={setPeriod}
          loading={loading}
          todayRevenue={todayRevenue}
          weekRevenue={weekRevenue}
          monthRevenue={monthRevenue}
        />
        <PaymentMethodsChart pmethods={pmethods} loading={loading} />
      </motion.div>

      {/* Bottom widgets */}
      <motion.div variants={IV} className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* AI Insights */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full bg-violet-50 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-violet-600" />
              </div>
              <div>
                <CardTitle className="text-base">AI Insights</CardTitle>
                <CardDescription>Powered by {workspace.aiBrand}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {loading
              ? Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-xl" />
                ))
              : AI_INSIGHTS.map((insight, i) => {
                  const InsightIcon = insightIcons[insight.type] ?? Zap;
                  return (
                    <div
                      key={i}
                      className={`flex items-start gap-2.5 p-3.5 rounded-xl border ${insightColors[insight.type]}`}
                    >
                      <InsightIcon className="h-4 w-4 mt-0.5 shrink-0" />
                      <p className="text-xs font-medium leading-relaxed">{insight.insight}</p>
                    </div>
                  );
                })}
          </CardContent>
        </Card>

        {/* Fast-moving */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{workspace.topSellingLabel || "Fast-Moving Items"}</CardTitle>
            <CardDescription>Top sellers — last 30 days</CardDescription>
          </CardHeader>
          <CardContent className="space-y-0 divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full my-2 rounded-lg" />
              ))
            ) : topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No sales data yet</p>
            ) : (
              topProducts.slice(0, 5).map((p, i) => (
                <div key={p.variantId} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="text-[11px] font-bold text-primary w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.productName}</p>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">{p.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold tabular-nums">LKR {formatNumber(p._sum.total ?? 0)}</p>
                    <p className="text-[11px] text-muted-foreground">{p._sum.quantity ?? 0} units</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent transactions */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Recent Transactions</CardTitle>
                <CardDescription>Live sale feed</CardDescription>
              </div>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
          </CardHeader>
          <CardContent className="space-y-0 divide-y divide-border">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full my-2 rounded-lg" />
              ))
            ) : recentSales.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">No recent sales</p>
            ) : (
              recentSales.map((sale) => (
                <div key={sale.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                      {getInitials(sale.customer?.name ?? "Walk-in")}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {sale.customer?.name ?? "Walk-in Customer"}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {sale.invoiceNumber}
                      </span>
                      <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                      <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(sale.invoiceDate).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0 space-y-1">
                    <p className="text-sm font-bold tabular-nums">LKR {formatNumber(sale.total)}</p>
                    <Badge
                      variant={sale.status === "COMPLETED" ? "success" : "secondary"}
                      className="text-[10px] h-5 px-1.5"
                    >
                      {sale.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
