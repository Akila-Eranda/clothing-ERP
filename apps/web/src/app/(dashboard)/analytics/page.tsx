"use client";

import * as React from "react";
import { BarChart3, TrendingUp, Users, ShoppingCart, DollarSign, Activity, Brain } from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import { DUMMY_REVENUE_DATA, DUMMY_CATEGORY_DATA, CHART_COLORS } from "@/lib/constants";

const KPI_DATA = [
  { label: "Revenue Growth", value: "+18.3%", sub: "vs last month", icon: TrendingUp, color: "text-emerald-500", bg: "bg-emerald-500/10", positive: true },
  { label: "Customer Acquisition", value: "+124", sub: "new this month", icon: Users, color: "text-blue-500", bg: "bg-blue-500/10", positive: true },
  { label: "Avg Basket Size", value: "LKR 4,523", sub: "+6.2% vs last", icon: ShoppingCart, color: "text-violet-500", bg: "bg-violet-500/10", positive: true },
  { label: "Return Rate", value: "2.4%", sub: "-0.3% vs last", icon: Activity, color: "text-amber-500", bg: "bg-amber-500/10", positive: true },
];

const AI_INSIGHTS = [
  { type: "opportunity", text: "T-Shirts in size M are 40% faster selling than other sizes. Consider increasing stock by 50 units.", impact: "High" },
  { type: "warning", text: "Weekend footfall dropped 12% last week. Consider running a weekend promotion.", impact: "Medium" },
  { type: "trend", text: "Denim demand peaks every Friday–Saturday. Schedule restocking on Thursdays.", impact: "High" },
  { type: "opportunity", text: "Gold tier customers have 3x higher AOV. Launch exclusive bundle offers to boost engagement.", impact: "High" },
];

export default function AnalyticsPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-muted-foreground">AI-powered insights and business intelligence</p>
        </div>
        <Badge variant="purple" className="gap-1.5 px-3 py-1.5">
          <Brain className="h-3.5 w-3.5" />
          AI Insights Active
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {KPI_DATA.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl ${k.bg}`}><k.icon className={`h-5 w-5 ${k.color}`} /></div>
              <div>
                <p className="text-xl font-bold">{k.value}</p>
                <p className="text-xs text-muted-foreground">{k.label}</p>
                <p className={`text-[10px] font-medium ${k.positive ? "text-emerald-500" : "text-red-500"}`}>{k.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="ai">AI Insights</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue vs Profit</CardTitle>
                <CardDescription>Last 30 days daily trend</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={DUMMY_REVENUE_DATA}>
                    <defs>
                      <linearGradient id="revA" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={6} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `LKR ${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} />
                    <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#revA)" name="Revenue" />
                    <Area type="monotone" dataKey="profit" stroke={CHART_COLORS.success} strokeWidth={2} fill="transparent" name="Profit" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Daily Orders Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={DUMMY_REVENUE_DATA.slice(-14)} barSize={18}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} />
                    <Bar dataKey="orders" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Orders" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Revenue by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={DUMMY_CATEGORY_DATA} cx="50%" cy="50%" innerRadius={70} outerRadius={110} dataKey="revenue" nameKey="category" paddingAngle={3}>
                      {DUMMY_CATEGORY_DATA.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} formatter={(v: number) => [`LKR ${formatNumber(v)}`, "Revenue"]} />
                    <Legend formatter={(value) => <span className="text-xs">{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Category Breakdown</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {DUMMY_CATEGORY_DATA.map((cat) => (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: cat.color }} />
                        <span className="text-sm font-medium">{cat.category}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm text-muted-foreground">LKR {formatNumber(cat.revenue)}</span>
                        <span className="text-sm font-bold w-10 text-right">{cat.percentage}%</span>
                      </div>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, background: cat.color }} />
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <div className="space-y-3">
            {AI_INSIGHTS.map((insight, i) => (
              <Card key={i} className={`border-l-4 ${insight.type === "opportunity" ? "border-l-emerald-500" : insight.type === "warning" ? "border-l-amber-500" : "border-l-blue-500"}`}>
                <CardContent className="p-4 flex items-start gap-3">
                  <Brain className={`h-5 w-5 mt-0.5 shrink-0 ${insight.type === "opportunity" ? "text-emerald-500" : insight.type === "warning" ? "text-amber-500" : "text-blue-500"}`} />
                  <div className="flex-1">
                    <p className="text-sm">{insight.text}</p>
                  </div>
                  <Badge variant={insight.impact === "High" ? "success" : "warning"} className="shrink-0 text-[10px]">
                    {insight.impact} Impact
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
