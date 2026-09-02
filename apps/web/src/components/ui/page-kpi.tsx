"use client";

import React from "react";
import Link from "next/link";
import { LucideIcon, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ERP_KPI_CARD_CLASS, ERP_TYPOGRAPHY } from "@/lib/design-tokens";

export const PAGE_KPI_CARD_CLASS = ERP_KPI_CARD_CLASS;

/** Secondary header actions — neutral outline, not rainbow tones */
export const PAGE_HEADER_BTN_TONES = {
  blue: "border-border bg-card text-foreground hover:bg-muted hover:text-foreground",
  secondary: "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
} as const;

export type PageHeaderBtnTone = keyof typeof PAGE_HEADER_BTN_TONES;

/** Semantic KPI presets — white cards, icon chip accent only (no gradients) */
export const PAGE_KPI_PRESETS = {
  neutral: {
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    tint: "bg-card border-border",
  },
  primary: {
    color: "text-primary",
    bg: "bg-primary/10",
    tint: "bg-card border-border",
  },
  success: {
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    tint: "bg-card border-border",
  },
  warning: {
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    tint: "bg-card border-border",
  },
  danger: {
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    tint: "bg-card border-border",
  },
  red: {
    color: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10",
    tint: "bg-card border-border",
  },
  info: {
    color: "text-primary",
    bg: "bg-primary/10",
    tint: "bg-card border-border",
  },
  /* backward-compatible aliases */
  slate: {
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    tint: "bg-card border-border",
  },
  blue: {
    color: "text-primary",
    bg: "bg-primary/10",
    tint: "bg-card border-border",
  },
  emerald: {
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    tint: "bg-card border-border",
  },
  amber: {
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    tint: "bg-card border-border",
  },
  violet: {
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    tint: "bg-card border-border",
  },
  teal: {
    color: "text-primary",
    bg: "bg-primary/10",
    tint: "bg-card border-border",
  },
  indigo: {
    color: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    tint: "bg-card border-border",
  },
  orange: {
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    tint: "bg-card border-border",
  },
} as const;

/** @deprecated use semantic names — mapped for backward compatibility */
const LEGACY_PRESET_MAP: Record<string, PageKpiPreset> = {
  slate: "neutral",
  blue: "primary",
  primary: "primary",
  emerald: "success",
  amber: "warning",
  red: "danger",
  orange: "warning",
  violet: "neutral",
  teal: "info",
  indigo: "neutral",
};

export type PageKpiPreset = keyof typeof PAGE_KPI_PRESETS;

export interface PageKpiItem {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string;
  bg: string;
  tint: string;
  sub?: string;
  href?: string;
}

export function pageKpi(
  label: string,
  value: string | number,
  icon: LucideIcon,
  preset: PageKpiPreset | keyof typeof LEGACY_PRESET_MAP,
): PageKpiItem {
  const key = (LEGACY_PRESET_MAP[preset as string] ?? preset) as PageKpiPreset;
  const p = PAGE_KPI_PRESETS[key] ?? PAGE_KPI_PRESETS.neutral;
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
            <CardContent className="h-16 p-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-14 bg-muted animate-pulse rounded" />
                <div className="h-3 w-20 bg-muted animate-pulse rounded" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("grid gap-3", GRID_COLS[cols], className)}>
      {items.map((s) => {
        const inner = (
          <Card
            className={cn(
              PAGE_KPI_CARD_CLASS,
              s.tint,
              s.href && "cursor-pointer hover:border-primary/25 transition-colors",
            )}
          >
            <CardContent className="p-3 flex items-center gap-3 min-h-[4rem]">
              <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center shrink-0", s.bg)}>
                <s.icon className={cn("h-4 w-4", s.color)} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn(ERP_TYPOGRAPHY.kpiValue, "truncate")}>{s.value}</p>
                <p className={cn(ERP_TYPOGRAPHY.kpiLabel, "mt-0.5 truncate")}>{s.label}</p>
                {s.sub ? (
                  <p className="text-[10px] text-muted-foreground truncate mt-0.5">{s.sub}</p>
                ) : null}
              </div>
            </CardContent>
          </Card>
        );

        if (s.href) {
          return (
            <Link
              key={s.label}
              href={s.href}
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl"
            >
              {inner}
            </Link>
          );
        }

        return <React.Fragment key={s.label}>{inner}</React.Fragment>;
      })}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  onRefresh,
  refreshing,
  actions,
  refreshTone = "blue",
}: {
  title: string;
  description?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  actions?: React.ReactNode;
  refreshTone?: PageHeaderBtnTone;
}) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-3">
      <div className="min-w-0">
        <h1 className={ERP_TYPOGRAPHY.pageTitle}>{title}</h1>
        {description ? (
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        ) : null}
      </div>
      {(onRefresh || actions) && (
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              className={cn("gap-1.5", PAGE_HEADER_BTN_TONES[refreshTone])}
            >
              <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
              Refresh
            </Button>
          ) : null}
          {actions}
        </div>
      )}
    </div>
  );
}
