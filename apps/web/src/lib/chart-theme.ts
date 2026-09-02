"use client";

import { useTheme } from "next-themes";

/** Recharts-friendly colors that respect light/dark mode */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return {
    grid: isDark ? "#334155" : "#f1f5f9",
    tick: isDark ? "#94a3b8" : "#64748b",
    tooltipBorder: isDark ? "#475569" : "#e2e8f0",
    tooltipBg: isDark ? "#1e293b" : "#ffffff",
    tooltipColor: isDark ? "#f1f5f9" : "#0f172a",
    tooltipStyle: {
      borderRadius: "8px",
      border: `1px solid ${isDark ? "#475569" : "#e2e8f0"}`,
      background: isDark ? "#1e293b" : "#ffffff",
      color: isDark ? "#f1f5f9" : "#0f172a",
      fontSize: "11px",
    } as const,
  };
}
