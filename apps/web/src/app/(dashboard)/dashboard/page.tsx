"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  TrendingUp, TrendingDown, ShoppingCart, Users, Package, DollarSign,
  ArrowUpRight, ArrowDownRight, Sparkles, AlertTriangle, BarChart3,
  RefreshCw, Download, Plus, Eye, Clock, Zap,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCurrency, formatNumber, getInitials } from "@/lib/utils";
import {
  DUMMY_REVENUE_DATA, DUMMY_CATEGORY_DATA, DUMMY_TOP_PRODUCTS,
  DUMMY_RECENT_SALES, DUMMY_LOW_STOCK, CHART_COLORS,
} from "@/lib/constants";

const STATS = [
  {
    title: "Today's Revenue",
    value: "₹1,28,450",
    change: "+18.2%",
    trend: "up",
    icon: DollarSign,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    desc: "vs ₹1,08,650 yesterday",
  },
  {
    title: "Total Orders",
    value: "284",
    change: "+12.5%",
    trend: "up",
    icon: ShoppingCart,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    desc: "32 pending processing",
  },
  {
    title: "Active Customers",
    value: "1,847",
    change: "+5.3%",
    trend: "up",
    icon: Users,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    desc: "124 new this month",
  },
  {
    title: "Low Stock Alerts",
    value: "12",
    change: "-3",
    trend: "down",
    icon: Package,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    desc: "Requires immediate action",
  },
];

const AI_INSIGHTS = [
  { insight: "Sales 34% higher on Saturdays — consider extended hours", type: "opportunity", confidence: 94 },
  { insight: "Slim Fit Jeans trending +45% — restock recommended", type: "alert", confidence: 89 },
  { insight: "Customer retention drops after 45-day inactivity — automate re-engagement", type: "action", confidence: 82 },
  { insight: "Bundling T-shirts + Jeans can increase AOV by ₹380 avg", type: "opportunity", confidence: 77 },
];

const insightColors: Record<string, string> = {
  opportunity: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  alert: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  action: "text-blue-500 bg-blue-500/10 border-blue-500/20",
};

const insightIcons: Record<string, React.ElementType> = {
  opportunity: TrendingUp,
  alert: AlertTriangle,
  action: Zap,
};

const containerVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export default function DashboardPage() {
  const [period, setPeriod] = React.useState<"7d" | "30d" | "90d">("30d");

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="p-6 space-y-6 max-w-[1600px] mx-auto"
    >
      {/* Page header */}
      <motion.div variants={itemVariants} className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">AI Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time insights for your fashion retail business
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs font-medium text-emerald-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live Data
          </div>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            Export
          </Button>
          <Button variant="gradient" size="sm" className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            New Sale
          </Button>
        </div>
      </motion.div>

      {/* KPI Stats */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-lg transition-shadow duration-300 group">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">{stat.title}</p>
                    <p className="text-2xl font-bold tracking-tight">{stat.value}</p>
                    <div className="flex items-center gap-1 mt-1.5">
                      {stat.trend === "up" ? (
                        <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <ArrowDownRight className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                      )}
                      <span
                        className={`text-xs font-semibold ${
                          stat.trend === "up" ? "text-emerald-500" : "text-amber-500"
                        }`}
                      >
                        {stat.change}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">{stat.desc}</span>
                    </div>
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
      <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Revenue & Profit</CardTitle>
                <CardDescription>Daily performance overview</CardDescription>
              </div>
              <div className="flex gap-1">
                {(["7d", "30d", "90d"] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                      period === p
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={DUMMY_REVENUE_DATA.slice(period === "7d" ? -7 : period === "30d" ? -30 : -90)}>
                <defs>
                  <linearGradient id="revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={period === "7d" ? 0 : 4} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                  formatter={(v: number) => [`₹${formatNumber(v)}`, ""]}
                />
                <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#revenue)" name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke={CHART_COLORS.success} strokeWidth={2} fill="url(#profit)" name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category breakdown */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Sales by Category</CardTitle>
            <CardDescription>This month's breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={DUMMY_CATEGORY_DATA} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="revenue">
                  {DUMMY_CATEGORY_DATA.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                  formatter={(v: number) => [`₹${formatNumber(v)}`, ""]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {DUMMY_CATEGORY_DATA.map((cat) => (
                <div key={cat.category} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: cat.color }} />
                  <span className="text-xs text-muted-foreground flex-1 truncate">{cat.category}</span>
                  <span className="text-xs font-semibold">{cat.percentage}%</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* AI Insights + Top Products + Recent Sales */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* AI Insights */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-violet-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">AI Insights</CardTitle>
                <CardDescription>Powered by FashionAI™</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {AI_INSIGHTS.map((insight, i) => {
              const InsightIcon = insightIcons[insight.type];
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 * i }}
                  className={`p-3 rounded-lg border ${insightColors[insight.type]} cursor-pointer hover:opacity-90 transition-opacity`}
                >
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
                <CardTitle className="text-base">Top Products</CardTitle>
                <CardDescription>By revenue this month</CardDescription>
              </div>
              <Button variant="ghost" size="icon-sm">
                <Eye className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {DUMMY_TOP_PRODUCTS.map((product, i) => (
              <div key={product.id} className="flex items-center gap-3">
                <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">#{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{product.sold} sold</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    <span
                      className={`text-xs font-medium ${
                        product.stock < 10 ? "text-amber-500" : "text-muted-foreground"
                      }`}
                    >
                      {product.stock} in stock
                    </span>
                  </div>
                </div>
                <span className="text-sm font-semibold shrink-0">
                  ₹{formatNumber(product.revenue)}
                </span>
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
            {DUMMY_RECENT_SALES.map((sale) => (
              <div key={sale.id} className="flex items-center gap-3">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="text-[10px] font-semibold">
                    {getInitials(sale.customer)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{sale.customer}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-muted-foreground">{sale.id}</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground/50" />
                    <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{sale.time}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-semibold">₹{formatNumber(sale.amount)}</p>
                  <Badge
                    variant={sale.status === "completed" ? "success" : "danger"}
                    className="text-[10px] h-4 px-1.5"
                  >
                    {sale.status}
                  </Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </motion.div>

      {/* Low Stock Alerts + Orders Bar Chart */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
              <Badge variant="warning" className="ml-auto">
                {DUMMY_LOW_STOCK.length} items
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {DUMMY_LOW_STOCK.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.variant} · {item.sku}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-amber-500">{item.stock} left</p>
                  <p className="text-xs text-muted-foreground">min: {item.minStock}</p>
                </div>
                <Button size="sm" variant="warning" className="shrink-0 h-7 text-xs px-2.5">
                  Reorder
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Orders trend */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Daily Orders Trend</CardTitle>
            <CardDescription>Last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={DUMMY_REVENUE_DATA.slice(-14)} barSize={16}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                />
                <Bar dataKey="orders" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Orders" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
