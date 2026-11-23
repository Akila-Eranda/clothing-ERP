"use client";

import { useTheme } from "next-themes";
import { CHART_CHROME } from "./chart-colors";

/** Recharts-friendly colors that respect light/dark mode */
export function useChartTheme() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const c = isDark ? CHART_CHROME.dark : CHART_CHROME.light;
  return {
    grid: c.grid,
    tick: c.tick,
    tooltipBorder: c.tooltipBorder,
    tooltipBg: c.tooltipBg,
    tooltipColor: c.tooltipColor,
    tooltipStyle: {
      borderRadius: "8px",
      border: `1px solid ${c.tooltipBorder}`,
      background: c.tooltipBg,
      color: c.tooltipColor,
      fontSize: "11px",
    } as const,
  };
}
