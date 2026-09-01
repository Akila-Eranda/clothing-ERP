"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { formatNumber } from "@/lib/utils";

const ORANGE = "#FE9F43";
const ORANGE_LIGHT = "#FFE3CB";
const TEAL = "#0E9384";
const EXPENSE = "#E04F16";
const REVENUE = "#0E9384";

export type SalesPurchasePoint = { label: string; sales: number; purchase: number };

export function DreamsSalesPurchaseChart({
  data,
  loading,
  purchaseTotal,
  salesTotal,
  period,
  onPeriod,
}: {
  data: SalesPurchasePoint[];
  loading: boolean;
  purchaseTotal: number;
  salesTotal: number;
  period: string;
  onPeriod: (p: string) => void;
}) {
  const periods = ["1D", "1W", "1M", "3M", "6M", "1Y"];

  return (
    <>
      <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
        <div className="card-header-title">
          <span className="title-icon bg-soft-primary">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
          </span>
          <h5 className="card-title mb-0">Sales &amp; Purchase</h5>
        </div>
        <div className="dp-period-scroll">
          <div className="btn-group custom-btn-group">
            {periods.map((p) => (
              <button
                key={p}
                type="button"
                className={`btn btn-outline-light ${period === p ? "active" : ""}`}
                onClick={() => onPeriod(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="card-body pb-0">
        <div className="dp-chart-summary mb-3">
          <div className="border p-2 br-8">
            <p className="d-inline-flex align-items-center mb-1">
              <span className="text-primary-300 me-1">●</span>
              Total Purchase
            </p>
            <h4 style={{ fontSize: "clamp(0.9rem, 2.5vw, 1.15rem)" }}>{loading ? "—" : `LKR ${formatNumber(purchaseTotal)}`}</h4>
          </div>
          <div className="border p-2 br-8">
            <p className="d-inline-flex align-items-center mb-1">
              <span className="text-primary me-1">●</span>
              Total Sales
            </p>
            <h4 style={{ fontSize: "clamp(0.9rem, 2.5vw, 1.15rem)" }}>{loading ? "—" : `LKR ${formatNumber(salesTotal)}`}</h4>
          </div>
        </div>
        {loading ? (
          <div className="dp-skeleton dp-chart-wrap" style={{ height: 220 }} />
        ) : (
          <div className="dp-chart-wrap" style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 8, left: -10, bottom: 0 }} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="5 5" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 12, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : String(v))}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e6eaed" }}
                formatter={(v: number, name: string) => [
                  `LKR ${formatNumber(v)}`,
                  name === "sales" ? "Sales" : "Purchase",
                ]}
              />
              <Bar dataKey="purchase" stackId="a" fill={ORANGE_LIGHT} radius={[0, 0, 8, 8]} />
              <Bar dataKey="sales" stackId="a" fill={ORANGE} radius={[8, 8, 0, 0]} />
            </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </>
  );
}

export function DreamsSalesStaticsChart({
  data,
  loading,
  revenue,
  expense,
  revenuePct,
  expensePct,
}: {
  data: { month: string; revenue: number; expenses: number }[];
  loading: boolean;
  revenue: number;
  expense: number;
  revenuePct: { value: string; up: boolean };
  expensePct: { value: string; up: boolean };
}) {
  const chartData = data.map((d) => ({
    month: d.month.split(" ")[0],
    revenue: d.revenue,
    expenses: -d.expenses,
  }));

  return (
    <>
      <div className="card-header d-flex justify-content-between align-items-center">
        <div className="card-header-title">
          <span className="title-icon bg-soft-danger">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </span>
          <h5 className="card-title mb-0">Sales Statics</h5>
        </div>
        <span className="btn btn-sm btn-white">{new Date().getFullYear()}</span>
      </div>
      <div className="card-body pb-0">
        <div className="dp-chart-summary mb-3">
          <div className="border p-2 br-8">
            <h5 className="d-inline-flex align-items-center flex-wrap text-teal mb-1" style={{ fontSize: "clamp(0.85rem, 2vw, 1rem)" }}>
              LKR {formatNumber(revenue)}
              <span className={`badge badge-${revenuePct.up ? "success" : "danger"} badge-xs ms-2`}>
                {revenuePct.up ? "↑" : "↓"} {revenuePct.value}
              </span>
            </h5>
            <p>Revenue</p>
          </div>
          <div className="border p-2 br-8">
            <h5 className="d-inline-flex align-items-center flex-wrap text-orange mb-1" style={{ fontSize: "clamp(0.85rem, 2vw, 1rem)" }}>
              LKR {formatNumber(expense)}
              <span className={`badge badge-${expensePct.up ? "success" : "danger"} badge-xs ms-2`}>
                {expensePct.up ? "↑" : "↓"} {expensePct.value}
              </span>
            </h5>
            <p>Expense</p>
          </div>
        </div>
        {loading ? (
          <div className="dp-skeleton dp-chart-wrap" style={{ height: 240 }} />
        ) : (
          <div className="dp-chart-wrap" style={{ height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#6B7280" }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${Math.abs(v / 1000).toFixed(0)}K`}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [
                  `LKR ${formatNumber(Math.abs(v))}`,
                  name === "revenue" ? "Revenue" : "Expenses",
                ]}
              />
              <Bar dataKey="revenue" fill={REVENUE} radius={4} barSize={16} />
              <Bar dataKey="expenses" fill={EXPENSE} radius={4} barSize={16} />
            </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </>
  );
}

export function DreamsCategoryDonut({
  categories,
  loading,
  totalProducts,
  totalCategories,
}: {
  categories: { name: string; count: number; total: number }[];
  loading: boolean;
  totalProducts: number;
  totalCategories: number;
}) {
  const colors = ["#FE9F43", "#E04F16", "#0E9384", "#6938EF", "#092C4C"];
  const slices = categories.slice(0, 3).map((c, i) => ({
    name: c.name,
    value: c.count,
    color: colors[i % colors.length],
  }));
  const top3 = categories.slice(0, 3);

  return (
    <div className="d-flex align-items-center justify-content-between flex-wrap gap-4 mb-4 dp-category-layout">
      <div style={{ width: "100%", maxWidth: 200, height: 200, margin: "0 auto" }}>
        {loading ? (
          <div className="dp-skeleton" style={{ width: 200, height: 200, borderRadius: "50%" }} />
        ) : slices.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={slices}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={80}
                paddingAngle={4}
                dataKey="value"
                strokeWidth={5}
                stroke="#fff"
              >
                {slices.map((s, i) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center text-muted fs-13" style={{ paddingTop: 80 }}>No data</div>
        )}
      </div>
      <div>
        {top3.map((c, i) => (
          <div
            key={c.name}
            className={`category-item category-${i === 0 ? "primary" : i === 1 ? "orange" : "secondary"}`}
          >
            <p className="fs-13 mb-1">{c.name}</p>
            <h2 className="d-flex align-items-center" style={{ fontSize: "1.5rem", fontWeight: 700 }}>
              {c.count}
              <span className="fs-13 fw-medium text-gray-9 ms-1" style={{ fontWeight: 400, color: "#646b72" }}>
                Sales
              </span>
            </h2>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DreamsCustomerRadialChart({ returnPct }: { returnPct: number }) {
  const firstPct = Math.max(0, Math.min(100, 100 - returnPct));
  const data = [
    { name: "First Time", value: firstPct, fill: "#E04F16" },
    { name: "Return", value: returnPct, fill: TEAL },
  ];

  return (
    <div id="customer-chart">
      <ResponsiveContainer width="100%" height={130}>
        <RadialBarChart
          cx="50%"
          cy="50%"
          innerRadius="30%"
          outerRadius="100%"
          barSize={8}
          data={data}
          startAngle={90}
          endAngle={-270}
        >
          <RadialBar background={{ fill: "#E6EAED" }} dataKey="value" cornerRadius={8} />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DreamsOrderHeatmap({ salesByDay }: { salesByDay: number[] }) {
  const max = Math.max(...salesByDay, 1);
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="dp-heatmap">
      {days.map((day, i) => {
        const intensity = salesByDay[i] ?? 0;
        const ratio = intensity / max;
        const bg = ratio > 0.5 ? ORANGE : ORANGE_LIGHT;
        const opacity = 0.3 + ratio * 0.7;
        return (
          <div key={day} className="text-center">
            <div
              className="dp-heatmap-cell"
              style={{ background: bg, opacity }}
              title={`${day}: LKR ${formatNumber(intensity)}`}
            />
            <p className="fs-13 mt-1 mb-0">{day}</p>
          </div>
        );
      })}
    </div>
  );
}
