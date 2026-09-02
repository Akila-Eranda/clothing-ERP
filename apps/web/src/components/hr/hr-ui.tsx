"use client";

import React from "react";
import { cn } from "@/lib/utils";
import {
  PAGE_KPI_CARD_CLASS,
  PAGE_KPI_PRESETS,
  PageHeader,
  PageKpiGrid,
  pageKpi,
  type PageKpiItem,
  type PageKpiPreset,
} from "@/components/ui/page-kpi";

export const HR_CARD_CLASS = PAGE_KPI_CARD_CLASS;
export const HR_STAT_PRESETS = PAGE_KPI_PRESETS;
export type HrStatPreset = PageKpiPreset;
export type HrStatItem = PageKpiItem;
export const hrStat = pageKpi;
export const HrStatCards = PageKpiGrid;
export const HrPageHeader = PageHeader;

export function HrPageShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("page-shell space-y-4", className)}>{children}</div>;
}

export function HrPanel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {children}
    </div>
  );
}
