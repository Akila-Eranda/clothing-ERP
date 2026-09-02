"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileText, Repeat, Gift, Wallet, Layers, PieChart, LifeBuoy, Hash,
  Info, UserCheck, Users, ShoppingCart, CalendarDays, Package,
  AlertTriangle, Box, Flag, MapPin,
} from "lucide-react";
import { api } from "@/lib/api";
import { parseApiList } from "@/lib/parse-api-list";
import { formatNumber, getInitials } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/auth-store";
import { useShopProfile } from "@/lib/use-shop-profile";
import { getWorkspace } from "@/lib/shop-workspace";
import {
  DreamsSalesPurchaseChart,
  DreamsSalesStaticsChart,
  DreamsCategoryDonut,
  DreamsCustomerRadialChart,
  DreamsOrderHeatmap,
  type SalesPurchasePoint,
} from "./dreams-dashboard-charts";
import "./dreams-dashboard.css";
import {
  DreamsDateRangePicker,
  defaultDreamsDateRange,
  isDateInRange,
  type DreamsDateRange,
} from "./dreams-date-range-picker";

/* ── Types ── */
interface DailySummary {
  totalSales: number;
  totalRevenue: number;
  totalDiscount: number;
  byPaymentMethod: Record<string, number>;
}
interface Overview {
  today: { revenue: number; transactions: number };
  thisMonth: { revenue: number; transactions: number };
  growth: { revenue: string };
  totalCustomers: number;
  totalProducts: number;
  outstanding: { customerReceivables: number };
}
interface SaleRow {
  id: string;
  invoiceNumber: string;
  total: number;
  invoiceDate: string;
  status: string;
  customer?: { name?: string; firstName?: string; lastName?: string } | null;
}
interface TopProduct {
  variantId?: string;
  productName: string;
  sku: string;
  _sum?: { quantity: number | null; total: number | null };
}
interface LowStockItem {
  id: string;
  quantity: number;
  minStockLevel: number;
  variant: { name: string; sku: string; product: { name: string } };
}
interface PurchaseOrder {
  id: string;
  total: number;
  orderDate: string;
  status: string;
  poNumber?: string;
  supplier?: { name: string };
}
interface ReturnRow {
  refundAmount: number;
  createdAt: string;
}
interface DebitNote {
  amount: number;
  noteDate: string;
}
interface MonthlyPL {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}
interface TopCustomer {
  id: string;
  firstName: string;
  lastName: string;
  phone?: string;
  totalSpent: number;
  totalOrders: number;
}
interface CategorySale {
  name: string;
  total: number;
  count: number;
}

function pctChange(cur: number, prev: number) {
  if (prev <= 0) return { value: "0%", up: true };
  const p = ((cur - prev) / prev) * 100;
  return { value: `${Math.abs(p).toFixed(0)}%`, up: p >= 0 };
}
function custName(s: SaleRow) {
  if (s.customer?.name) return s.customer.name;
  return `${s.customer?.firstName ?? ""} ${s.customer?.lastName ?? ""}`.trim() || "Walk-in";
}
function statusBadge(status: string) {
  const s = status.toUpperCase();
  if (s === "COMPLETED" || s === "RECEIVED") return "badge-success";
  if (s === "CANCELLED") return "badge-danger";
  if (s === "DRAFT" || s === "INITIATED") return "badge-pink";
  if (s === "PENDING" || s === "PARTIALLY_RECEIVED") return "badge-cyan";
  return "bg-purple";
}
function KpiBadge({ current, previous }: { current: number; previous: number }) {
  const { value, up } = pctChange(current, previous);
  return (
    <span className={`badge ${up ? "badge-soft-primary" : "badge-soft-danger"}`}>
      {up ? "↑" : "↓"} {value}
    </span>
  );
}

export function DreamsDashboard() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const shopProfile = useShopProfile();
  const workspace = getWorkspace(shopProfile.type);
  const displayName = user?.name?.split(" ")[0] || user?.name || "Admin";

  const [loading, setLoading] = React.useState(true);
  const [chartPeriod, setChartPeriod] = React.useState("1Y");
  const [txnTab, setTxnTab] = React.useState<"sale" | "purchase">("sale");
  const [dateRange, setDateRange] = React.useState<DreamsDateRange>(() => defaultDreamsDateRange());
  const [salesRows, setSalesRows] = React.useState<SaleRow[]>([]);

  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [summary, setSummary] = React.useState<DailySummary | null>(null);
  const [recentSales, setRecentSales] = React.useState<SaleRow[]>([]);
  const [topProducts, setTopProducts] = React.useState<TopProduct[]>([]);
  const [lowStock, setLowStock] = React.useState<LowStockItem[]>([]);
  const [purchases, setPurchases] = React.useState<PurchaseOrder[]>([]);
  const [returns, setReturns] = React.useState<ReturnRow[]>([]);
  const [debitNotes, setDebitNotes] = React.useState<DebitNote[]>([]);
  const [monthlyPl, setMonthlyPl] = React.useState<MonthlyPL[]>([]);
  const [expenseTotal, setExpenseTotal] = React.useState(0);
  const [supplierTotal, setSupplierTotal] = React.useState(0);
  const [topCustomers, setTopCustomers] = React.useState<TopCustomer[]>([]);
  const [categories, setCategories] = React.useState<CategorySale[]>([]);
  const [categoryCount, setCategoryCount] = React.useState(0);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        api.get<Overview>("/dashboard/overview"),
        api.get<DailySummary>("/pos/summary"),
        api.get<{ data: SaleRow[] }>("/sales?limit=8"),
        api.get<{ data: SaleRow[] }>("/sales?limit=300"),
        api.get<TopProduct[]>("/dashboard/top-products"),
        api.get<LowStockItem[]>("/inventory/low-stock"),
        api.get<{ data: PurchaseOrder[] }>("/purchases?limit=300"),
        api.get<{ data: ReturnRow[] }>("/returns?limit=300"),
        api.get<DebitNote[]>("/suppliers/ap/debit-notes"),
        api.get<MonthlyPL[]>("/accounting/monthly-pl?months=12"),
        api.get<{ total: number }>("/accounting/expenses/summary"),
        api.get<TopCustomer[]>("/dashboard/top-customers"),
        api.get<CategorySale[]>("/dashboard/sales-by-category"),
        api.get<{ total: number }>("/suppliers?limit=1"),
        api.get<{ total: number }>("/categories?limit=1"),
      ]);

      const [ovRes, sumRes, salesRes, salesAllRes, topRes, lowRes, poRes, retRes, noteRes, plRes, expRes, tcRes, catRes, supRes, catCntRes] = results;

      if (ovRes.status === "fulfilled") setOverview(ovRes.value.data ?? null);
      if (sumRes.status === "fulfilled") setSummary(sumRes.value.data ?? null);
      if (salesRes.status === "fulfilled") setRecentSales(parseApiList<SaleRow>(salesRes.value.data));
      if (salesAllRes.status === "fulfilled") setSalesRows(parseApiList<SaleRow>(salesAllRes.value.data));
      if (topRes.status === "fulfilled") setTopProducts(parseApiList<TopProduct>(topRes.value.data));
      if (lowRes.status === "fulfilled") setLowStock(parseApiList<LowStockItem>(lowRes.value.data));
      if (poRes.status === "fulfilled") setPurchases(parseApiList<PurchaseOrder>(poRes.value.data));
      if (retRes.status === "fulfilled") setReturns(parseApiList<ReturnRow>(retRes.value.data));
      if (noteRes.status === "fulfilled") setDebitNotes(parseApiList<DebitNote>(noteRes.value.data));
      if (plRes.status === "fulfilled") setMonthlyPl(parseApiList<MonthlyPL>(plRes.value.data));
      if (expRes.status === "fulfilled") setExpenseTotal(expRes.value.data?.total ?? 0);
      if (tcRes.status === "fulfilled") setTopCustomers(parseApiList<TopCustomer>(tcRes.value.data));
      if (catRes.status === "fulfilled") setCategories(parseApiList<CategorySale>(catRes.value.data));
      if (supRes.status === "fulfilled") {
        const p = supRes.value as unknown as { data?: { meta?: { total?: number }; total?: number } };
        setSupplierTotal(p.data?.meta?.total ?? p.data?.total ?? 0);
      }
      if (catCntRes.status === "fulfilled") {
        const p = catCntRes.value as unknown as { data?: { meta?: { total?: number }; total?: number }; meta?: { total?: number } };
        setCategoryCount(p.data?.meta?.total ?? p.meta?.total ?? p.data?.total ?? 0);
      }

      const perm = (msg?: string) => !!msg && /insufficient permissions|forbidden|403/i.test(msg);
      const errs = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message as string)
        .filter((m) => m && !perm(m));
      if (errs[0]) toast.error(`Dashboard: ${errs[0]}`);
    } catch {
      toast.error("Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const inRange = React.useCallback(
    (iso: string) => isDateInRange(iso, dateRange),
    [dateRange],
  );

  const rangeSales = React.useMemo(
    () => salesRows.filter((s) => inRange(s.invoiceDate)),
    [salesRows, inRange],
  );
  const rangePurchases = React.useMemo(
    () => purchases.filter((p) => p.status !== "CANCELLED" && inRange(p.orderDate)),
    [purchases, inRange],
  );
  const rangeReturns = React.useMemo(
    () => returns.filter((r) => inRange(r.createdAt)),
    [returns, inRange],
  );
  const rangeDebitNotes = React.useMemo(
    () => debitNotes.filter((n) => inRange(n.noteDate)),
    [debitNotes, inRange],
  );

  const rangeSalesTotal = React.useMemo(
    () => rangeSales.reduce((s, r) => s + r.total, 0),
    [rangeSales],
  );
  const rangePurchaseTotal = React.useMemo(
    () => rangePurchases.reduce((s, p) => s + p.total, 0),
    [rangePurchases],
  );
  const rangeReturnsTotal = React.useMemo(
    () => rangeReturns.reduce((s, r) => s + (r.refundAmount ?? 0), 0),
    [rangeReturns],
  );
  const rangePurchaseReturnTotal = React.useMemo(
    () => rangeDebitNotes.reduce((s, n) => s + (n.amount ?? 0), 0),
    [rangeDebitNotes],
  );

  const filteredRecentSales = React.useMemo(
    () => rangeSales.slice(0, 8),
    [rangeSales],
  );

  const curMonth = monthlyPl[monthlyPl.length - 1];
  const prevMonth = monthlyPl[monthlyPl.length - 2];
  const monthSales = rangeSalesTotal || overview?.thisMonth?.revenue || curMonth?.revenue || 0;
  const prevMonthSales = prevMonth?.revenue ?? 0;
  const monthReturns = rangeReturnsTotal;
  const prevReturns = returns.filter((r) => {
    const d = new Date(r.createdAt);
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  }).reduce((s, r) => s + (r.refundAmount ?? 0), 0);
  const monthPurchases = rangePurchaseTotal;
  const prevPurchases = purchases.filter((p) => {
    if (p.status === "CANCELLED") return false;
    const d = new Date(p.orderDate);
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  }).reduce((s, p) => s + p.total, 0);
  const monthPurchaseReturn = rangePurchaseReturnTotal;
  const prevPurchaseReturn = debitNotes.filter((n) => {
    const d = new Date(n.noteDate);
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    return d.getMonth() === prev.getMonth() && d.getFullYear() === prev.getFullYear();
  }).reduce((s, n) => s + (n.amount ?? 0), 0);

  const chartMonths = chartPeriod === "1D" ? 1 : chartPeriod === "1W" ? 1 : chartPeriod === "1M" ? 3 : chartPeriod === "3M" ? 3 : chartPeriod === "6M" ? 6 : 12;
  const chartData: SalesPurchasePoint[] = React.useMemo(() => {
    const plSlice = monthlyPl.slice(-chartMonths);
    const pmap = new Map<string, number>();
    purchases.forEach((po) => {
      if (po.status === "CANCELLED") return;
      const lbl = new Date(po.orderDate).toLocaleDateString("en-LK", { month: "short" });
      pmap.set(lbl, (pmap.get(lbl) ?? 0) + po.total);
    });
    return plSlice.map((m) => ({
      label: m.month.split(" ")[0],
      sales: m.revenue,
      purchase: pmap.get(m.month.split(" ")[0] ?? "") ?? 0,
    }));
  }, [monthlyPl, purchases, chartMonths]);

  const salesByDay = React.useMemo(() => {
    const days = [0, 0, 0, 0, 0, 0, 0];
    rangeSales.forEach((s) => {
      const dow = new Date(s.invoiceDate).getDay();
      const idx = dow === 0 ? 6 : dow - 1;
      days[idx] += s.total;
    });
    return days;
  }, [rangeSales]);

  const returnCustomerPct = overview?.totalCustomers
    ? Math.min(100, Math.round(((overview.totalCustomers - (overview.today?.transactions ?? 0)) / overview.totalCustomers) * 100))
    : 30;

  const ordersToday = summary?.totalSales ?? overview?.today?.transactions ?? 0;

  const kpiCards = [
    { title: "Total Sales", value: monthSales, prev: prevMonthSales, icon: FileText, bg: "bg-primary", href: "/sales" },
    { title: "Total Sales Return", value: monthReturns, prev: prevReturns, icon: Repeat, bg: "bg-secondary", href: "/returns" },
    { title: "Total Purchase", value: monthPurchases, prev: prevPurchases, icon: Gift, bg: "bg-teal", href: "/purchases" },
    { title: "Total Purchase Return", value: monthPurchaseReturn, prev: prevPurchaseReturn, icon: Wallet, bg: "bg-info", href: "/purchases/purchase-returns" },
  ];

  const secondary = [
    { title: "Profit", value: curMonth?.profit ?? 0, prev: prevMonth?.profit ?? 0, icon: Layers, iconBg: "bg-cyan-transparent text-info", href: "/accounting/reports" },
    { title: "Invoice Due", value: overview?.outstanding?.customerReceivables ?? 0, prev: 0, icon: PieChart, iconBg: "bg-teal-transparent text-teal", href: "/customers" },
    { title: "Total Expenses", value: expenseTotal || curMonth?.expenses || 0, prev: prevMonth?.expenses ?? 0, icon: LifeBuoy, iconBg: "bg-orange-transparent text-orange", href: "/accounting/expenses" },
    { title: "Total Payment Returns", value: monthReturns, prev: prevReturns, icon: Hash, iconBg: "bg-indigo-transparent", href: "/returns" },
  ];

  return (
    <div className="dreams-pos-dash">
      <div className="content">
        {/* Header */}
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-2 dp-page-header">
          <div className="mb-3">
            <h1 className="mb-1">Welcome, {displayName}</h1>
            <p className="fw-medium">
              You have <span className="text-primary fw-bold">{loading ? "—" : ordersToday}</span> Orders, Today
            </p>
          </div>
          <div className="input-icon-start position-relative mb-3">
            <DreamsDateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </div>

        {/* KPI row */}
        <div className="row">
          {kpiCards.map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.title} className="col-xl-3 col-lg-3 col-sm-6 col-12 d-flex">
                <button type="button" className={`card ${c.bg} sale-widget flex-fill`} style={{ cursor: "pointer", textAlign: "left" }} onClick={() => router.push(c.href)}>
                  <div className="card-body d-flex align-items-center">
                    <span className="sale-icon bg-white">
                      <Icon size={24} />
                    </span>
                    <div className="ms-2">
                      <p className="text-white mb-1">{c.title}</p>
                      <div className="d-inline-flex align-items-center flex-wrap gap-2">
                        <h4 className="text-white">
                          {loading ? "—" : `LKR ${formatNumber(c.value)}`}
                        </h4>
                        {!loading && <KpiBadge current={c.value} previous={c.prev} />}
                      </div>
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Secondary row */}
        <div className="row">
          {secondary.map((c) => {
            const Icon = c.icon;
            const ch = pctChange(c.value, c.prev);
            return (
              <div key={c.title} className="col-xl-3 col-lg-3 col-sm-6 col-12 d-flex">
                <div className="card revenue-widget flex-fill">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between mb-3 pb-3 border-bottom">
                      <div>
                        <h4 className="mb-1">{loading ? "—" : `LKR ${formatNumber(c.value)}`}</h4>
                        <p>{c.title}</p>
                      </div>
                      <span className={`revenue-icon ${c.iconBg}`}>
                        <Icon size={16} />
                      </span>
                    </div>
                    <div className="d-flex align-items-center justify-content-between">
                      <p className="mb-0">
                        <span className={`fs-13 fw-bold ${ch.up ? "text-success" : "text-danger"}`}>
                          {ch.up ? "+" : "-"}{ch.value}
                        </span> vs Last Month
                      </p>
                      <Link href={c.href} className="text-decoration-underline fs-13 fw-medium link-primary">
                        View All
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Sales chart + Overall info */}
        <div className="row">
          <div className="col-xxl-8 col-xl-7 col-lg-12 col-md-12 col-12 d-flex">
            <div className="card flex-fill">
              <DreamsSalesPurchaseChart
                data={chartData}
                loading={loading}
                salesTotal={chartData.reduce((s, d) => s + d.sales, 0)}
                purchaseTotal={chartData.reduce((s, d) => s + d.purchase, 0)}
                period={chartPeriod}
                onPeriod={setChartPeriod}
              />
            </div>
          </div>
          <div className="col-xxl-4 col-xl-5 col-lg-12 col-md-12 col-12 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-info"><Info size={16} /></span>
                  <h5 className="card-title mb-0">Overall Information</h5>
                </div>
              </div>
              <div className="card-body">
                <div className="dp-info-grid">
                  {[
                    { label: "Suppliers", val: supplierTotal, icon: UserCheck, color: "text-info" },
                    { label: workspace.customerLabel, val: overview?.totalCustomers ?? 0, icon: Users, color: "text-orange" },
                    { label: "Orders", val: ordersToday, icon: ShoppingCart, color: "text-teal" },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <div key={item.label}>
                        <div className="info-item border bg-light p-3 text-center">
                          <div className={`mb-3 ${item.color} fs-24`}><Icon size={24} style={{ margin: "0 auto" }} /></div>
                          <p className="mb-1">{item.label}</p>
                          <h5>{loading ? "—" : formatNumber(item.val)}</h5>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="card-footer pb-sm-0">
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3">
                  <h6>Customers Overview</h6>
                  <span className="btn btn-sm btn-white"><CalendarDays size={14} className="me-1" />Today</span>
                </div>
                <div className="dp-customer-overview">
                  <DreamsCustomerRadialChart returnPct={returnCustomerPct} />
                  <div className="dp-customer-stats">
                    <div className="text-center border-end">
                      <h2 className="mb-1">{loading ? "—" : formatNumber(overview?.today?.transactions ?? 0)}</h2>
                      <p className="text-orange mb-2">First Time</p>
                      <span className="badge badge-success badge-xs">↑ 25%</span>
                    </div>
                    <div className="text-center">
                      <h2 className="mb-1">{loading ? "—" : formatNumber(overview?.totalCustomers ?? 0)}</h2>
                      <p className="text-teal mb-2">Return</p>
                      <span className="badge badge-success badge-xs">↑ 21%</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top products / Low stock / Recent sales */}
        <div className="row">
          <div className="col-xxl-4 col-md-6 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-pink"><Box size={16} /></span>
                  <h5 className="card-title mb-0">Top Selling Products</h5>
                </div>
                <span className="btn btn-sm btn-white"><CalendarDays size={14} className="me-1" />Today</span>
              </div>
              <div className="card-body sell-product">
                {loading ? (
                  <div className="dp-skeleton" style={{ height: 200 }} />
                ) : topProducts.length === 0 ? (
                  <p className="text-center fs-13">No sales data yet</p>
                ) : (
                  topProducts.slice(0, 5).map((p) => (
                    <div key={p.variantId ?? p.sku} className="d-flex align-items-center justify-content-between border-bottom dp-list-row">
                      <div className="d-flex align-items-center" style={{ minWidth: 0, flex: 1 }}>
                        <span className="avatar avatar-lg flex-shrink-0">{getInitials(p.productName)}</span>
                        <div className="ms-2" style={{ minWidth: 0 }}>
                          <h6 className="fw-bold mb-1 dp-truncate">
                            <button type="button" style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700 }} onClick={() => router.push("/products")}>
                              {p.productName}
                            </button>
                          </h6>
                          <div className="item-list">
                            <p>LKR {formatNumber(p._sum?.total ?? 0)}</p>
                            <p>{p._sum?.quantity ?? 0}+ Sales</p>
                          </div>
                        </div>
                      </div>
                      <span className="badge bg-outline-success badge-xs">↑ 25%</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="col-xxl-4 col-md-6 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-danger"><AlertTriangle size={16} /></span>
                  <h5 className="card-title mb-0">Low Stock Products</h5>
                </div>
                <Link href="/inventory" className="fs-13 fw-bold text-decoration-underline link-primary">View All</Link>
              </div>
              <div className="card-body">
                {loading ? (
                  <div className="dp-skeleton" style={{ height: 200 }} />
                ) : lowStock.length === 0 ? (
                  <p className="text-center fs-13">All stock levels OK</p>
                ) : (
                  lowStock.slice(0, 5).map((item, i) => (
                    <div key={item.id} className={`d-flex align-items-center justify-content-between dp-list-row ${i < 4 ? "mb-4" : "mb-0"}`}>
                      <div className="d-flex align-items-center">
                        <span className="avatar avatar-lg"><Package size={20} /></span>
                        <div className="ms-2">
                          <h6 className="fw-bold mb-1">{item.variant.product.name}</h6>
                          <p className="fs-13">ID : #{item.variant.sku}</p>
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="fs-13 mb-1">Instock</p>
                        <h6 className="text-orange fw-bold">{item.quantity}</h6>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="col-xxl-4 col-md-12 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-pink"><Box size={16} /></span>
                  <h5 className="card-title mb-0">Recent Sales</h5>
                </div>
                <span className="btn btn-sm btn-white"><CalendarDays size={14} className="me-1" />Weekly</span>
              </div>
              <div className="card-body">
                {loading ? (
                  <div className="dp-skeleton" style={{ height: 200 }} />
                ) : filteredRecentSales.length === 0 ? (
                  <p className="text-center fs-13">No sales in selected range</p>
                ) : (
                  filteredRecentSales.slice(0, 5).map((sale, i) => (
                    <div key={sale.id} className={`d-flex align-items-center justify-content-between dp-list-row ${i < 4 ? "mb-4" : "mb-0"}`}>
                      <div className="d-flex align-items-center">
                        <span className="avatar avatar-lg">{getInitials(custName(sale))}</span>
                        <div className="ms-2">
                          <h6 className="fw-bold mb-1">{custName(sale)}</h6>
                          <div className="item-list">
                            <p>{sale.invoiceNumber}</p>
                            <p className="text-gray-9">LKR {formatNumber(sale.total)}</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-end">
                        <p className="fs-13 mb-1">
                          {new Date(sale.invoiceDate).toLocaleDateString("en-LK", { day: "numeric", month: "short" })}
                        </p>
                        <span className={`badge ${statusBadge(sale.status)} badge-xs`}>● {sale.status}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Sales statics + Recent transactions */}
        <div className="row">
          <div className="col-xl-6 col-lg-12 col-md-12 col-12 d-flex">
            <div className="card flex-fill">
              <DreamsSalesStaticsChart
                data={monthlyPl}
                loading={loading}
                revenue={curMonth?.revenue ?? 0}
                expense={curMonth?.expenses ?? expenseTotal}
                revenuePct={pctChange(curMonth?.revenue ?? 0, prevMonth?.revenue ?? 0)}
                expensePct={pctChange(curMonth?.expenses ?? 0, prevMonth?.expenses ?? 0)}
              />
            </div>
          </div>
          <div className="col-xl-6 col-lg-12 col-md-12 col-12 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex align-items-center justify-content-between flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-orange"><Flag size={16} /></span>
                  <h5 className="card-title mb-0">Recent Transactions</h5>
                </div>
                <Link href="/sales" className="fs-13 fw-medium text-decoration-underline link-primary">View All</Link>
              </div>
              <div className="card-body p-0">
                <ul className="transaction-tab nav-tabs">
                  <li className="nav-item">
                    <button type="button" className={`nav-link ${txnTab === "sale" ? "active" : ""}`} onClick={() => setTxnTab("sale")}>Sale</button>
                  </li>
                  <li className="nav-item">
                    <button type="button" className={`nav-link ${txnTab === "purchase" ? "active" : ""}`} onClick={() => setTxnTab("purchase")}>Purchase</button>
                  </li>
                </ul>
                <div className="table-responsive">
                  <table className="table table-borderless custom-table">
                    <thead className="thead-light">
                      <tr>
                        <th>Date</th>
                        <th>{txnTab === "sale" ? "Customer" : "Supplier"}</th>
                        <th className="dp-col-hide-sm">Status</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txnTab === "sale"
                        ? filteredRecentSales.slice(0, 6).map((s) => (
                            <tr key={s.id} style={{ cursor: "pointer" }} onClick={() => router.push("/sales")}>
                              <td>{new Date(s.invoiceDate).toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" })}</td>
                              <td>
                                <div className="d-flex align-items-center">
                                  <span className="avatar avatar-md me-2">{getInitials(custName(s))}</span>
                                  <div>
                                    <h6 className="fw-medium mb-0" style={{ fontSize: 13 }}>{custName(s)}</h6>
                                    <span className="fs-13 text-orange">{s.invoiceNumber}</span>
                                  </div>
                                </div>
                              </td>
                              <td><span className={`badge ${statusBadge(s.status)} badge-xs dp-col-hide-sm`}>● {s.status}</span></td>
                              <td className="fs-16 fw-bold text-gray-9">LKR {formatNumber(s.total)}</td>
                            </tr>
                          ))
                        : rangePurchases.slice(0, 6).map((p) => (
                            <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/purchases/${p.id}`)}>
                              <td>{new Date(p.orderDate).toLocaleDateString("en-LK", { day: "numeric", month: "short", year: "numeric" })}</td>
                              <td><span className="fw-semibold">{p.supplier?.name ?? "—"}</span></td>
                              <td><span className={`badge ${statusBadge(p.status)} badge-xs dp-col-hide-sm`}>● {p.status}</span></td>
                              <td className="text-gray-9">LKR {formatNumber(p.total)}</td>
                            </tr>
                          ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Top customers / Categories / Order stats */}
        <div className="row">
          <div className="col-xxl-4 col-md-6 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-orange"><Users size={16} /></span>
                  <h5 className="card-title mb-0">Top Customers</h5>
                </div>
                <Link href="/customers" className="fs-13 fw-medium text-decoration-underline link-primary">View All</Link>
              </div>
              <div className="card-body">
                {loading ? (
                  <div className="dp-skeleton" style={{ height: 200 }} />
                ) : topCustomers.length === 0 ? (
                  <p className="text-center fs-13">No customers yet</p>
                ) : (
                  topCustomers.slice(0, 5).map((c, i) => (
                    <div key={c.id} className={`d-flex align-items-center justify-content-between border-bottom flex-wrap gap-2 ${i < 4 ? "mb-3 pb-3" : ""}`}>
                      <div className="d-flex align-items-center">
                        <span className="avatar avatar-lg flex-shrink-0">{getInitials(`${c.firstName} ${c.lastName}`)}</span>
                        <div className="ms-2">
                          <h6 className="fs-14 fw-bold mb-1">{c.firstName} {c.lastName}</h6>
                          <div className="item-list">
                            <p className="d-inline-flex align-items-center"><MapPin size={12} className="me-1" />{c.phone ?? "—"}</p>
                            <p>{c.totalOrders} Orders</p>
                          </div>
                        </div>
                      </div>
                      <div className="text-end"><h5>LKR {formatNumber(c.totalSpent)}</h5></div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="col-xxl-4 col-md-6 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-orange"><PieChart size={16} /></span>
                  <h5 className="card-title mb-0">Top Categories</h5>
                </div>
                <span className="btn btn-sm btn-white"><CalendarDays size={14} className="me-1" />Weekly</span>
              </div>
              <div className="card-body">
                <DreamsCategoryDonut
                  categories={categories}
                  loading={loading}
                  totalProducts={overview?.totalProducts ?? 0}
                  totalCategories={categoryCount}
                />
                <h6 className="mb-2">Category Statistics</h6>
                <div className="border br-8">
                  <div className="d-flex align-items-center justify-content-between border-bottom p-2">
                    <p className="d-inline-flex align-items-center mb-0">
                      <span className="text-indigo me-2">■</span> Total Number Of Categories
                    </p>
                    <h5>{categoryCount}</h5>
                  </div>
                  <div className="d-flex align-items-center justify-content-between p-2">
                    <p className="d-inline-flex align-items-center mb-0">
                      <span className="text-orange me-2">■</span> Total Number Of Products
                    </p>
                    <h5>{overview?.totalProducts ?? 0}</h5>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-xxl-4 col-md-12 d-flex">
            <div className="card flex-fill">
              <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div className="card-header-title">
                  <span className="title-icon bg-soft-indigo"><Package size={16} /></span>
                  <h5 className="card-title mb-0">Order Statistics</h5>
                </div>
                <span className="btn btn-sm btn-white"><CalendarDays size={14} className="me-1" />Weekly</span>
              </div>
              <div className="card-body pb-0">
                <DreamsOrderHeatmap salesByDay={salesByDay} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
