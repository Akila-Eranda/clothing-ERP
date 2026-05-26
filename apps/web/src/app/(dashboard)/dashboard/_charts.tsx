"use client";

import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";
import { CHART_COLORS } from "@/lib/constants";

const PMETHOD_COLORS: Record<string, string> = {
  CASH: CHART_COLORS.chart4,
  CARD: CHART_COLORS.chart1,
  UPI: CHART_COLORS.chart2,
  WALLET: CHART_COLORS.chart3,
};

type ChartPoint = { date: string; revenue: number; orders: number };
type PMethod = { name: string; value: number };

export function RevenueChart({
  chartData, period, setPeriod, loading,
}: {
  chartData: ChartPoint[];
  period: "7d" | "30d";
  setPeriod: (p: "7d" | "30d") => void;
  loading: boolean;
}) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base">Revenue Trend</CardTitle>
            <CardDescription>Daily revenue grouped by date</CardDescription>
          </div>
          <div className="flex gap-1">
            {(["7d", "30d"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${period === p ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                {p}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-4">
        {loading ? <Skeleton className="h-[240px] w-full rounded-xl" /> : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} interval={period === "7d" ? 0 : 4} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                formatter={(v: number) => [`LKR ${formatNumber(v)}`, "Revenue"]} />
              <Area type="monotone" dataKey="revenue" stroke={CHART_COLORS.primary} strokeWidth={2} fill="url(#rev-grad)" name="Revenue" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export function PaymentMethodsChart({
  pmethods, loading,
}: {
  pmethods: PMethod[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Payment Methods</CardTitle>
        <CardDescription>Today&apos;s breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[160px] w-full rounded-xl" /> : pmethods.length === 0 ? (
          <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">No sales today</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={pmethods} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                  {pmethods.map((entry, i) => (
                    <Cell key={i} fill={PMETHOD_COLORS[entry.name] ?? CHART_COLORS.chart5} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }}
                  formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-3 space-y-2">
              {pmethods.map((m) => (
                <div key={m.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: PMETHOD_COLORS[m.name] ?? CHART_COLORS.chart5 }} />
                  <span className="text-xs text-muted-foreground flex-1">{m.name}</span>
                  <span className="text-xs font-semibold">LKR {formatNumber(m.value)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function DailyOrdersChart({
  ordersData, loading,
}: {
  ordersData: ChartPoint[];
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Daily Orders Trend</CardTitle>
        <CardDescription>Orders per day — last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? <Skeleton className="h-[220px] w-full rounded-xl" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ordersData} barSize={14}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: "12px", fontSize: 12 }} />
              <Bar dataKey="orders" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} name="Orders" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
