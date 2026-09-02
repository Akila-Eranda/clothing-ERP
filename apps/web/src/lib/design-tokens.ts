/**
 * Hexalyte ERP — global design tokens (source of truth for TS/Tailwind consumers).
 * CSS variables in globals.css mirror these values.
 */

export const ERP_COLORS = {
  primary: "#1677FF",
  primaryHover: "#1268E6",
  text: "#1F2937",
  textSecondary: "#64748B",
  textMuted: "#94A3B8",
  background: "#F5F7FA",
  surface: "#FFFFFF",
  border: "#E5E7EB",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  info: "#1677FF",
} as const;

export const ERP_RADIUS = {
  card: "0.75rem", // 12px
  control: "0.5rem", // 8px
  badge: "0.375rem", // 6px
} as const;

export const ERP_SPACING = {
  pagePadding: "1rem",
  pagePaddingMd: "1.25rem",
  sectionGap: "1rem",
  cardPadding: "1rem",
} as const;

export const ERP_TYPOGRAPHY = {
  pageTitle: "text-[28px] md:text-[30px] font-semibold tracking-tight text-foreground",
  sectionTitle: "text-lg font-semibold text-foreground",
  body: "text-sm text-foreground",
  secondary: "text-[13px] text-muted-foreground",
  tableHeader: "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground",
  kpiValue: "text-[22px] md:text-2xl font-bold tabular-nums leading-none text-foreground",
  kpiLabel: "text-xs font-medium text-muted-foreground",
} as const;

export const ERP_SHADOW = {
  card: "0 1px 2px rgba(15, 23, 42, 0.04)",
  dropdown: "0 4px 12px rgba(15, 23, 42, 0.08)",
} as const;

/** Enterprise KPI card shell — white, bordered, soft lift */
export const ERP_KPI_CARD_CLASS =
  "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

/** Enterprise panel / table shell */
export const ERP_PANEL_CLASS =
  "rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

/** Filter / toolbar row inside a panel */
export const ERP_TOOLBAR_CLASS =
  "flex flex-wrap items-center gap-2 p-3 border-b border-border bg-card";

/** Sub-navigation tabs (border-bottom style container) */
export const ERP_SUBNAV_CLASS =
  "flex flex-wrap gap-0 border-b border-border bg-transparent";

export const ERP_SUBNAV_LINK_ACTIVE =
  "inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 border-primary text-primary font-semibold -mb-px";

export const ERP_SUBNAV_LINK_IDLE =
  "inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 border-transparent text-muted-foreground hover:text-foreground -mb-px";

/** Native select / control shell for forms outside Radix Select */
export const ERP_SELECT_CLASS =
  "flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

/** Settings / preference toggle row */
export const ERP_TOGGLE_ROW_CLASS =
  "flex items-center justify-between gap-4 py-3 border-b border-border last:border-0";
