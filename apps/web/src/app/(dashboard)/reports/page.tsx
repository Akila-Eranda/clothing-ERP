"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { FileBarChart, Download, Calendar, BarChart3, TrendingUp, Users, Package, DollarSign } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatNumber } from "@/lib/utils";
import { DUMMY_REVENUE_DATA, DUMMY_CATEGORY_DATA, CHART_COLORS } from "@/lib/constants";

const REPORT_CARDS = [
  { title: "Revenue Report", desc: "Monthly & yearly revenue breakdown", icon: DollarSign, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  { title: "Sales Analysis", desc: "Product & category performance", icon: BarChart3, color: "text-blue-500", bg: "bg-blue-500/10" },
  { title: "Customer Report", desc: "Acquisition, retention & LTV", icon: Users, color: "text-violet-500", bg: "bg-violet-500/10" },
  { title: "Inventory Report", desc: "Stock levels & movement history", icon: Package, color: "text-amber-500", bg: "bg-amber-500/10" },
];

export default function ReportsPage() {
  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reports & Analytics</h1>
          <p className="text-sm text-muted-foreground">Comprehensive business intelligence and insights</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />Date Range</Button>
          <Button variant="gradient" size="sm" className="gap-1.5"><Download className="h-3.5 w-3.5" />Export All</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {REPORT_CARDS.map((r) => (
          <motion.div key={r.title} whileHover={{ y: -2 }} transition={{ duration: 0.2 }}>
            <Card className="cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className={`p-2.5 rounded-xl ${r.bg} w-fit mb-3`}>
                  <r.icon className={`h-5 w-5 ${r.color}`} />
                </div>
                <p className="font-semibold text-sm">{r.title}</p>
                <p className="text-xs text-muted-foreground mt-1">{r.desc}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <Tabs defaultValue="revenue">
        <TabsList>
          <TabsTrigger value="revenue">Revenue</TabsTrigger>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="categories">Categories</TabsTrigger>
        </TabsList>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Revenue Trend (Last 30 Days)</CardTitle>
              <CardDescription>Daily revenue and profit overview</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={DUMMY_REVENUE_DATA.slice(-30)}>
                  <defs>
                    <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} formatter={(v: number) => [`₹${formatNumber(v)}`, ""]} />
                  <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                  <Area type="monotone" dataKey="profit" stroke={CHART_COLORS.success} strokeWidth={2} fill="transparent" name="Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Daily Orders</CardTitle>
              <CardDescription>Order volume over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={DUMMY_REVENUE_DATA.slice(-14)} barSize={20}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} />
                  <Bar dataKey="orders" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Orders" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="categories" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DUMMY_CATEGORY_DATA.map((cat) => (
              <Card key={cat.category}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: cat.color }} />
                      <span className="font-medium text-sm">{cat.category}</span>
                    </div>
                    <span className="text-sm font-bold">{cat.percentage}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${cat.percentage}%`, background: cat.color }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">₹{formatNumber(cat.revenue)} revenue</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
