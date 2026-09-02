"use client";

import React from "react";
import { LucideIcon, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const PAGE_KPI_CARD_CLASS =
  "rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150";

export const PAGE_KPI_PRESETS = {
  slate: {
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/15",
    tint: "border-slate-200/80 bg-gradient-to-br from-slate-50 to-white dark:border-slate-500/20 dark:from-slate-500/10 dark:to-transparent",
  },
  emerald: {
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/15",
    tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent",
  },
  amber: {
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/15",
    tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent",
  },
  violet: {
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/15",
    tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent",
  },
  blue: {
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-500/15",
    tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent",
  },
  red: {
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/15",
    tint: "border-red-200/70 bg-gradient-to-br from-red-50 to-white dark:border-red-500/20 dark:from-red-500/10 dark:to-transparent",
  },
  teal: {
    color: "text-teal-600 dark:text-teal-400",
    bg: "bg-teal-500/15",
    tint: "border-teal-200/70 bg-gradient-to-br from-teal-50 to-white dark:border-teal-500/20 dark:from-teal-500/10 dark:to-transparent",
  },
  orange: {
    color: "text-orange-600 dark:text-orange-400",
    bg: "bg-orange-500/15",
    tint: "border-orange-200/70 bg-gradient-to-br from-orange-50 to-white dark:border-orange-500/20 dark:from-orange-500/10 dark:to-transparent",
  },
  indigo: {
    color: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-500/15",
    tint: "border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-transparent",
  },
  primary: {
    color: "text-primary",
    bg: "bg-primary/15",
    tint: "border-primary/20 bg-gradient-to-br from-primary/5 to-white dark:border-primary/25 dark:from-primary/10 dark:to-transparent",
  },
} as const;

export type PageKpiPreset = keyof typeof PAGE_KPI_PRESETS;

export interface PageKpiItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  tint: string;
  sub?: string;
}

export function pageKpi(
  label: string,
  value: string | number,
  icon: LucideIcon,
  preset: PageKpiPreset,
): PageKpiItem {
  const p = PAGE_KPI_PRESETS[preset];
  return { label, value, icon, ...p };
}

const GRID_COLS: Record<2 | 3 | 4 | 5 | 6, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 xl:grid-cols-3",
  4: "grid-cols-2 xl:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
};

export function PageKpiGrid({
  items,
  loading,
  cols = 4,
  className,
}: {
  items: PageKpiItem[];
  loading?: boolean;
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const skeletonCount = Math.min(items.length || cols, cols);

  if (loading) {
    return (
      <div className={cn("grid gap-3", GRID_COLS[cols], className)}>
        {Array.from({ length: skeletonCount }).map((_, i) => (
          <Card key={i} className={PAGE_KPI_CARD_CLASS}>
            <CardContent className="h-[68px] p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-[12px] bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-5 w-16 bg-muted animate-pulse rounded" />
                <div className="h-3 w-24 bg-muted animate-pulse rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3", GRID_COLS[cols], className)}>
      {items.map((s) => (
        <Card key={s.label} className={cn(PAGE_KPI_CARD_CLASS, s.tint)}>
          <CardContent className={cn("p-4 flex items-center gap-3", s.sub ? "min-h-[72px]" : "h-[68px]")}>
            <div className={cn("h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0", s.bg)}>
              <s.icon className={cn("h-[18px] w-[18px]", s.color)} strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  typeof s.value === "string" && s.value.length > 10 ? "text-lg" : "text-[22px]",
                  "font-bold leading-none tabular-nums truncate text-foreground",
                )}
              >
                {s.value}
              </p>
              <p className="text-[11px] text-secondary-foreground font-semibold mt-1 truncate">{s.label}</p>
              {s.sub ? (
                <p className="text-[10px] text-muted-foreground/80 truncate">{s.sub}</p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  onRefresh,
  refreshing,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-3">
      <div className="min-w-0">
        <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">{title}</h1>
        {description ? (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
        ) : null}
      </div>
      {(onRefresh || actions) && (
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {onRefresh ? (
            <Button type="button" variant="outline" onClick={onRefresh} className="gap-1.5">
              <RefreshCw className={cn("h-[18px] w-[18px]", refreshing && "animate-spin")} />
              Refresh
            </Button>
          ) : null}
          {actions ? (
            <>
              {onRefresh ? <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden /> : null}
              {actions}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
