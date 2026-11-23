/** Chart text and chrome colours (pure data, shared by `useChartTheme` and the colour guard tests). */
export const CHART_CHROME = {
  light: { surface: "#ffffff", grid: "#f1f5f9", tick: "#64748b", tooltipBorder: "#e2e8f0", tooltipBg: "#ffffff", tooltipColor: "#0f172a" },
  dark: { surface: "#16181d", grid: "#334155", tick: "#94a3b8", tooltipBorder: "#475569", tooltipBg: "#1e293b", tooltipColor: "#f1f5f9" },
} as const;

/** Series colours used by the dashboard / reports / accounting charts (identity colours, kept as-is). */
export const CHART_SERIES = [
  "#10B981", "#F59E0B", "#6366F1", "#8B5CF6", "#3B82F6", "#64748B", "#EF4444", "#F43F5E",
  "#EC4899", "#F97316", "#84CC16", "#14B8A6", "#2563EB", "#94A3B8",
] as const;
