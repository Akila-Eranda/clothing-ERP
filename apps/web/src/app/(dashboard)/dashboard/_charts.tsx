"use client";

import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

const PMETHOD_COLORS: Record<string, string> = {
  CASH: "#10B981",
  CARD: "#F59E0B",
  UPI: "#6366F1",
  WALLET: "#8B5CF6",
  CUSTOMER_CREDIT: "#8B5CF6",
  CREDIT: "#8B5CF6",
  BANK_TRANSFER: "#3B82F6",
  CHEQUE: "#64748B",
};

const PMETHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  CARD: "Card",
  UPI: "UPI",
  WALLET: "Wallet",
  CUSTOMER_CREDIT: "Credit",
  CREDIT: "Credit",
  BANK_TRANSFER: "Bank",
  CHEQUE: "Cheque",
};

type ChartPoint = { date: string; revenue: number; orders: number };
type PMethod = { name: string; value: number };

function prettyMethod(name: string) {
  return PMETHOD_LABELS[name] ?? name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function RevenueChart({
  chartData, period, setPeriod, loading,
  todayRevenue = 0, weekRevenue = 0, monthRevenue = 0,
}: {
  chartData: ChartPoint[];
  period: "7d" | "30d" | "90d";
  setPeriod: (p: "7d" | "30d" | "90d") => void;
  loading: boolean;
  todayRevenue?: number;
  weekRevenue?: number;
  monthRevenue?: number;
}) {
  return (
    <Card className="xl:col-span-2 overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-base tracking-tight">Revenue Overview</CardTitle>
            <CardDescription>Daily revenue trend</CardDescription>
          </div>
          <div className="flex gap-1 p-1 rounded-xl bg-muted/80">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 rounded-[10px] text-xs font-semibold transition-all duration-150 ${
                  period === p
                    ? "bg-primary text-primary-foreground shadow-button"
                    : "text-muted-foreground hover:text-foreground hover:bg-card"
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pb-0">
        {loading ? (
          <Skeleton className="h-[240px] w-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev-grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366F1" stopOpacity={0.28} />
                  <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                interval={period === "7d" ? 0 : period === "30d" ? 4 : 8}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "12px",
                  fontSize: 12,
                  boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
                }}
                formatter={(v: number) => [`LKR ${formatNumber(v)}`, "Revenue"]}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#6366F1"
                strokeWidth={2.5}
                fill="url(#rev-grad)"
                name="Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <div className="grid grid-cols-3 gap-3 border-t border-border mt-2 py-4">
          {[
            { label: "Today", value: todayRevenue },
            { label: "This Week", value: weekRevenue },
            { label: "This Month", value: monthRevenue },
          ].map((s) => (
            <div key={s.label} className="text-center px-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{s.label}</p>
              <p className="text-sm font-bold tabular-nums mt-1 truncate">
                LKR {formatNumber(s.value)}
              </p>
            </div>
          ))}
        </div>
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
  const total = pmethods.reduce((s, m) => s + m.value, 0);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base tracking-tight">Sales by Payment Method</CardTitle>
        <CardDescription>Today&apos;s breakdown</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-[220px] w-full rounded-xl" />
        ) : pmethods.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-sm text-muted-foreground">
            No sales today
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative shrink-0">
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={pmethods}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={72}
                    paddingAngle={3}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    {pmethods.map((entry, i) => (
                      <Cell key={i} fill={PMETHOD_COLORS[entry.name] ?? "#94A3B8"} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "12px",
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`LKR ${formatNumber(v)}`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] text-muted-foreground font-medium">Total</p>
                <p className="text-xs font-bold tabular-nums">LKR {formatNumber(total)}</p>
              </div>
            </div>
            <div className="flex-1 w-full space-y-2.5 min-w-0">
              {pmethods.map((m) => {
                const pct = total > 0 ? Math.round((m.value / total) * 100) : 0;
                return (
                  <div key={m.name} className="flex items-center gap-2.5">
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: PMETHOD_COLORS[m.name] ?? "#94A3B8" }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{prettyMethod(m.name)}</span>
                        <span className="text-xs font-bold text-muted-foreground tabular-nums">{pct}%</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        LKR {formatNumber(m.value)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
