import type { CSSProperties } from "react";
import type { PosUiMode } from "@/lib/pos-ui-theme";

type BtnPalette = {
  bg: string;
  color: string;
  border: string;
  activeBg?: string;
  activeColor?: string;
  activeBorder?: string;
};

/** Per-button solid colors — readable in dark and light POS themes (no glass / yellow). */
const PALETTES: Record<PosUiMode, Record<string, BtnPalette>> = {
  dark: {
    "hold-bill": { bg: "#be185d", color: "#ffffff", border: "#9d174d" },
    "held-bills": { bg: "#7c3aed", color: "#ffffff", border: "#6d28d9" },
    reload: { bg: "#4f46e5", color: "#ffffff", border: "#4338ca", activeBg: "#4338ca", activeColor: "#ffffff", activeBorder: "#3730a3" },
    customer: { bg: "#334155", color: "#f8fafc", border: "#475569", activeBg: "#2563eb", activeColor: "#ffffff", activeBorder: "#1d4ed8" },
    products: { bg: "#2563eb", color: "#ffffff", border: "#1d4ed8", activeBg: "#1d4ed8", activeColor: "#ffffff", activeBorder: "#1e40af" },
    "quick-product": { bg: "#0d9488", color: "#ffffff", border: "#0f766e", activeBg: "#0f766e", activeColor: "#ffffff", activeBorder: "#115e59" },
    customers: { bg: "#0891b2", color: "#ffffff", border: "#0e7490", activeBg: "#0e7490", activeColor: "#ffffff", activeBorder: "#155e75" },
    "hold-bills": { bg: "#c026d3", color: "#ffffff", border: "#a21caf", activeBg: "#a21caf", activeColor: "#ffffff", activeBorder: "#86198f" },
    orders: { bg: "#e11d48", color: "#ffffff", border: "#be123c", activeBg: "#be123c", activeColor: "#ffffff", activeBorder: "#9f1239" },
    vouchers: { bg: "#db2777", color: "#ffffff", border: "#be185d", activeBg: "#be185d", activeColor: "#ffffff", activeBorder: "#9d174d" },
    "quick-grn": { bg: "#059669", color: "#ffffff", border: "#047857", activeBg: "#047857", activeColor: "#ffffff", activeBorder: "#065f46" },
    expenses: { bg: "#dc2626", color: "#ffffff", border: "#b91c1c", activeBg: "#b91c1c", activeColor: "#ffffff", activeBorder: "#991b1b" },
    returns: { bg: "#0f766e", color: "#ffffff", border: "#115e59", activeBg: "#115e59", activeColor: "#ffffff", activeBorder: "#134e4a" },
    warranty: { bg: "#9333ea", color: "#ffffff", border: "#7e22ce", activeBg: "#7e22ce", activeColor: "#ffffff", activeBorder: "#6b21a8" },
    discounts: { bg: "#16a34a", color: "#ffffff", border: "#15803d", activeBg: "#15803d", activeColor: "#ffffff", activeBorder: "#166534" },
    reports: { bg: "#6366f1", color: "#ffffff", border: "#4f46e5", activeBg: "#4f46e5", activeColor: "#ffffff", activeBorder: "#4338ca" },
    settings: { bg: "#64748b", color: "#ffffff", border: "#475569", activeBg: "#475569", activeColor: "#ffffff", activeBorder: "#334155" },
  },
  light: {
    "hold-bill": { bg: "#be185d", color: "#ffffff", border: "#9d174d" },
    "held-bills": { bg: "#7c3aed", color: "#ffffff", border: "#6d28d9" },
    reload: { bg: "#4f46e5", color: "#ffffff", border: "#4338ca", activeBg: "#4338ca", activeColor: "#ffffff", activeBorder: "#3730a3" },
    customer: { bg: "#475569", color: "#ffffff", border: "#334155", activeBg: "#2563eb", activeColor: "#ffffff", activeBorder: "#1d4ed8" },
    products: { bg: "#2563eb", color: "#ffffff", border: "#1d4ed8", activeBg: "#1d4ed8", activeColor: "#ffffff", activeBorder: "#1e40af" },
    "quick-product": { bg: "#0d9488", color: "#ffffff", border: "#0f766e", activeBg: "#0f766e", activeColor: "#ffffff", activeBorder: "#115e59" },
    customers: { bg: "#0891b2", color: "#ffffff", border: "#0e7490", activeBg: "#0e7490", activeColor: "#ffffff", activeBorder: "#155e75" },
    "hold-bills": { bg: "#c026d3", color: "#ffffff", border: "#a21caf", activeBg: "#a21caf", activeColor: "#ffffff", activeBorder: "#86198f" },
    orders: { bg: "#e11d48", color: "#ffffff", border: "#be123c", activeBg: "#be123c", activeColor: "#ffffff", activeBorder: "#9f1239" },
    vouchers: { bg: "#db2777", color: "#ffffff", border: "#be185d", activeBg: "#be185d", activeColor: "#ffffff", activeBorder: "#9d174d" },
    "quick-grn": { bg: "#059669", color: "#ffffff", border: "#047857", activeBg: "#047857", activeColor: "#ffffff", activeBorder: "#065f46" },
    expenses: { bg: "#dc2626", color: "#ffffff", border: "#b91c1c", activeBg: "#b91c1c", activeColor: "#ffffff", activeBorder: "#991b1b" },
    returns: { bg: "#0f766e", color: "#ffffff", border: "#115e59", activeBg: "#115e59", activeColor: "#ffffff", activeBorder: "#134e4a" },
    warranty: { bg: "#9333ea", color: "#ffffff", border: "#7e22ce", activeBg: "#7e22ce", activeColor: "#ffffff", activeBorder: "#6b21a8" },
    discounts: { bg: "#16a34a", color: "#ffffff", border: "#15803d", activeBg: "#15803d", activeColor: "#ffffff", activeBorder: "#166534" },
    reports: { bg: "#7c3aed", color: "#ffffff", border: "#6d28d9", activeBg: "#6d28d9", activeColor: "#ffffff", activeBorder: "#5b21b6" },
    settings: { bg: "#64748b", color: "#ffffff", border: "#475569", activeBg: "#475569", activeColor: "#ffffff", activeBorder: "#334155" },
  },
};

const FALLBACK: Record<PosUiMode, BtnPalette> = {
  dark: { bg: "#334155", color: "#f8fafc", border: "#475569" },
  light: { bg: "#475569", color: "#ffffff", border: "#334155" },
};

export function posToolbarBtnStyle(
  id: string,
  mode: PosUiMode,
  active = false,
): CSSProperties {
  const palette = PALETTES[mode][id] ?? FALLBACK[mode];
  if (active && palette.activeBg) {
    return {
      background: palette.activeBg,
      color: palette.activeColor ?? palette.color,
      border: `1px solid ${palette.activeBorder ?? palette.border}`,
    };
  }
  return {
    background: palette.bg,
    color: palette.color,
    border: `1px solid ${palette.border}`,
  };
}
