"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  BarChart3,
  Building2,
  CreditCard,
  FileText,
  LayoutDashboard,
  Package,
  Percent,
  Receipt,
  ShoppingCart,
  Store,
  Truck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  REPORTS_TABS,
  reportsPath,
  type ReportsSection,
} from "@/components/reports/reports-config";

// ── Date presets ────────────────────────────────────────────────────────────
export type ReportDateRange = { label: string; start: string; end: string };

const fmtDate = (d: Date) => d.toISOString().split("T")[0];
const today = () => fmtDate(new Date());
const monthStart = () => {
  const d = new Date();
  d.setDate(1);
  return fmtDate(d);
};
const yearStart = () => {
  const d = new Date();
  d.setMonth(0, 1);
  return fmtDate(d);
};
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return fmtDate(d);
};

export const REPORT_DATE_PRESETS: ReportDateRange[] = [
  { label: "Today", start: today(), end: today() },
  { label: "This Week", start: daysAgo(6), end: today() },
  { label: "This Month", start: monthStart(), end: today() },
  { label: "Last 30 Days", start: daysAgo(29), end: today() },
  { label: "Last 90 Days", start: daysAgo(89), end: today() },
  { label: "This Year", start: yearStart(), end: today() },
];

export const SECTION_META: Record<
  ReportsSection,
  { title: string; description: string; icon: LucideIcon }
> = {
  overview: {
    title: "Reports Overview",
    description: "Business snapshot — revenue, profit, cash flow & key metrics",
    icon: LayoutDashboard,
  },
  sales: {
    title: "Sales Reports",
    description: "Revenue trends, payment mix, top products & cashier performance",
    icon: ShoppingCart,
  },
  purchases: {
    title: "Purchase Reports",
    description: "PO totals, payments, outstanding & supplier orders",
    icon: Truck,
  },
  inventory: {
    title: "Inventory Reports",
    description: "Stock levels, valuation, low-stock alerts & SKU analysis",
    icon: Package,
  },
  suppliers: {
    title: "Supplier Reports",
    description: "Supplier payments, purchase history & payables",
    icon: Store,
  },
  customers: {
    title: "Customer Reports",
    description: "Lifetime value, tiers, loyalty & top customers",
    icon: Users,
  },
  cashier: {
    title: "Cashier Reports",
    description: "Staff sales, discounts, tax & shift performance",
    icon: Wallet,
  },
  branches: {
    title: "Branch Reports",
    description: "Multi-branch revenue comparison & performance",
    icon: Building2,
  },
  tax: {
    title: "Tax Reports",
    description: "VAT/tax collected by rate and period summary",
    icon: Receipt,
  },
  expiry: {
    title: "Expiry Reports",
    description: "Batch expiry risk, critical lots & at-risk inventory",
    icon: AlertCircle,
  },
  cheques: {
    title: "Cheque Reports",
    description: "Cheque register, due dates, overdue & status",
    icon: CreditCard,
  },
  commission: {
    title: "Commission Reports",
    description: "Helper sales & commission breakdown",
    icon: Percent,
  },
  financial: {
    title: "Financial Summary",
    description: "P&L statement, expenses & profit trends",
    icon: FileText,
  },
};

// ── KPI ───────────────────────────────────────────────────────────────────────
export type ReportKpiItem = {
  label: string;
  value: string;
  sub?: string;
  icon: LucideIcon;
  tone?: "emerald" | "blue" | "violet" | "amber" | "red" | "orange" | "teal" | "slate";
};

const KPI_TONES: Record<NonNullable<ReportKpiItem["tone"]>, { icon: string; bg: string }> = {
  emerald: { icon: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  blue: { icon: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  violet: { icon: "text-violet-600 dark:text-violet-400", bg: "bg-violet-500/10" },
  amber: { icon: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  red: { icon: "text-red-600 dark:text-red-400", bg: "bg-red-500/10" },
  orange: { icon: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
  teal: { icon: "text-teal-600 dark:text-teal-400", bg: "bg-teal-500/10" },
  slate: { icon: "text-slate-600 dark:text-slate-400", bg: "bg-slate-500/10" },
};

export function ReportKpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "blue",
  loading,
}: ReportKpiItem & { loading?: boolean }) {
  const t = KPI_TONES[tone];
  return (
    <Card className="reports-kpi-card border-border/70 shadow-sm hover:shadow-md transition-all duration-200">
      <CardContent className="p-4 md:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              {label}
            </p>
            {loading ? (
              <Skeleton className="h-7 w-28 mb-1" />
            ) : (
              <p className="text-xl md:text-2xl font-bold tracking-tight text-foreground tabular-nums truncate">
                {value}
              </p>
            )}
            {sub && !loading && (
              <p className="text-[11px] text-muted-foreground mt-1 truncate">{sub}</p>
            )}
          </div>
          <div className={cn("rounded-xl p-2.5 shrink-0", t.bg)}>
            <Icon className={cn("h-5 w-5", t.icon)} strokeWidth={1.75} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReportKpiGrid({
  items,
  loading,
  cols = 6,
}: {
  items: ReportKpiItem[];
  loading?: boolean;
  cols?: 2 | 3 | 4 | 6;
}) {
  const grid =
    cols === 6
      ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6"
      : cols === 4
        ? "grid-cols-2 md:grid-cols-4"
        : cols === 3
          ? "grid-cols-1 sm:grid-cols-3"
          : "grid-cols-2";
  return (
    <div className={cn("grid gap-3 md:gap-4", grid)}>
      {items.map((k) => (
        <ReportKpiCard key={k.label} {...k} loading={loading} />
      ))}
    </div>
  );
}

// ── Cards & empty states ──────────────────────────────────────────────────────
export function ReportChartCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("reports-chart-card border-border/70 shadow-sm", className)}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {description && <CardDescription className="text-xs mt-0.5">{description}</CardDescription>}
        </div>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function ReportEmpty({ message = "No data for this period" }: { message?: string }) {
  return (
    <div className="reports-empty flex flex-col items-center justify-center py-14 gap-2 text-muted-foreground">
      <BarChart3 className="h-9 w-9 opacity-25" />
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

// ── Date filter bar ───────────────────────────────────────────────────────────
export function ReportDateFilterBar({
  range,
  onRangeChange,
  onApply,
  loading,
}: {
  range: ReportDateRange;
  onRangeChange: (r: ReportDateRange) => void;
  onApply?: () => void;
  loading?: boolean;
}) {
  return (
    <div className="reports-filter-bar flex flex-wrap items-center gap-2 md:gap-3">
      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted/40 border border-border/60">
        {REPORT_DATE_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onRangeChange({ ...p })}
            className={cn(
              "px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              range.label === p.label
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-background/80",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="hidden sm:block w-px h-6 bg-border" />
      <div className="flex items-center gap-1.5 flex-wrap">
        <Input
          type="date"
          value={range.start}
          onChange={(e) => onRangeChange({ ...range, label: "Custom", start: e.target.value })}
          className="h-8 text-xs w-[8.5rem] bg-background"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          type="date"
          value={range.end}
          onChange={(e) => onRangeChange({ ...range, label: "Custom", end: e.target.value })}
          className="h-8 text-xs w-[8.5rem] bg-background"
        />
        {onApply && (
          <Button type="button" size="sm" variant="secondary" onClick={onApply} className="h-8 px-3 text-xs">
            Apply
          </Button>
        )}
      </div>
      {loading && (
        <span className="text-xs text-muted-foreground animate-pulse ml-auto">Updating…</span>
      )}
    </div>
  );
}

// ── Tab navigation ────────────────────────────────────────────────────────────
export function ReportTabNav({ active }: { active: ReportsSection }) {
  const pathname = usePathname();
  return (
    <nav className="reports-tab-nav flex gap-0.5 overflow-x-auto pb-px -mb-px scrollbar-thin" aria-label="Report sections">
      {REPORTS_TABS.map((t) => {
        const href = reportsPath(t.value);
        const isActive = t.value === active || pathname === href;
        const Icon = SECTION_META[t.value].icon;
        return (
          <Link
            key={t.value}
            href={href}
            className={cn(
              "reports-tab-nav__item shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors",
              isActive
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="whitespace-nowrap">{t.label}</span>
          </Link>
        );
      })}
      <Link
        href="/accounting/reports"
        className={cn(
          "reports-tab-nav__item shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors ml-1",
          pathname?.startsWith("/accounting/reports")
            ? "border-primary text-primary bg-primary/5"
            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
        )}
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">GL Reports</span>
      </Link>
      <Link
        href="/analytics"
        className={cn(
          "reports-tab-nav__item shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-t-lg border-b-2 transition-colors",
          pathname === "/analytics"
            ? "border-primary text-primary bg-primary/5"
            : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/40",
        )}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        <span className="whitespace-nowrap">Analytics</span>
      </Link>
    </nav>
  );
}

// ── Page header ───────────────────────────────────────────────────────────────
export function ReportsPageHeader({
  title,
  description,
  icon: Icon,
  branchName,
  actions,
}: {
  title: string;
  description?: string;
  icon?: LucideIcon;
  branchName?: string | null;
  actions?: React.ReactNode;
}) {
  return (
    <div className="reports-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3 min-w-0">
        {Icon && (
          <div className="reports-page-header__icon shrink-0 rounded-xl bg-primary p-2.5 shadow-sm">
            <Icon className="h-5 w-5 text-white" />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">{title}</h1>
            {branchName && (
              <span className="text-[10px] font-bold uppercase tracking-wide text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                {branchName}
              </span>
            )}
          </div>
          {description && (
            <p className="text-sm text-muted-foreground mt-0.5 max-w-2xl">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
    </div>
  );
}
