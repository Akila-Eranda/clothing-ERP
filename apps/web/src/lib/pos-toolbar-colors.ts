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

/** Per-button colors — readable in dark and light POS themes. */
const PALETTES: Record<PosUiMode, Record<string, BtnPalette>> = {
  dark: {
    "hold-bill": { bg: "rgba(249,115,22,0.18)", color: "#fdba74", border: "rgba(249,115,22,0.45)" },
    "held-bills": { bg: "rgba(245,158,11,0.18)", color: "#fcd34d", border: "rgba(245,158,11,0.45)" },
    reload: { bg: "rgba(99,102,241,0.18)", color: "#a5b4fc", border: "rgba(99,102,241,0.45)", activeBg: "rgba(99,102,241,0.32)", activeColor: "#e0e7ff", activeBorder: "rgba(129,140,248,0.65)" },
    customer: { bg: "var(--pos-input)", color: "var(--pos-text-secondary)", border: "var(--pos-border)", activeBg: "rgba(79,110,247,0.22)", activeColor: "#c7d2fe", activeBorder: "rgba(79,110,247,0.55)" },
    products: { bg: "rgba(59,130,246,0.18)", color: "#93c5fd", border: "rgba(59,130,246,0.4)", activeBg: "rgba(59,130,246,0.32)", activeColor: "#dbeafe", activeBorder: "rgba(96,165,250,0.65)" },
    "quick-product": { bg: "rgba(20,184,166,0.18)", color: "#5eead4", border: "rgba(20,184,166,0.4)", activeBg: "rgba(20,184,166,0.32)", activeColor: "#ccfbf1", activeBorder: "rgba(45,212,191,0.65)" },
    customers: { bg: "rgba(6,182,212,0.18)", color: "#67e8f9", border: "rgba(6,182,212,0.4)", activeBg: "rgba(6,182,212,0.32)", activeColor: "#cffafe", activeBorder: "rgba(34,211,238,0.65)" },
    "hold-bills": { bg: "rgba(249,115,22,0.18)", color: "#fdba74", border: "rgba(249,115,22,0.4)", activeBg: "rgba(249,115,22,0.32)", activeColor: "#ffedd5", activeBorder: "rgba(251,146,60,0.65)" },
    orders: { bg: "rgba(244,63,94,0.18)", color: "#fda4af", border: "rgba(244,63,94,0.4)", activeBg: "rgba(244,63,94,0.32)", activeColor: "#ffe4e6", activeBorder: "rgba(251,113,133,0.65)" },
    vouchers: { bg: "rgba(236,72,153,0.18)", color: "#f9a8d4", border: "rgba(236,72,153,0.4)", activeBg: "rgba(236,72,153,0.32)", activeColor: "#fce7f3", activeBorder: "rgba(244,114,182,0.65)" },
    "quick-grn": { bg: "rgba(16,185,129,0.18)", color: "#6ee7b7", border: "rgba(16,185,129,0.4)", activeBg: "rgba(16,185,129,0.32)", activeColor: "#d1fae5", activeBorder: "rgba(52,211,153,0.65)" },
    expenses: { bg: "rgba(239,68,68,0.18)", color: "#fca5a5", border: "rgba(239,68,68,0.4)", activeBg: "rgba(239,68,68,0.32)", activeColor: "#fee2e2", activeBorder: "rgba(248,113,113,0.65)" },
    returns: { bg: "rgba(234,179,8,0.18)", color: "#fde047", border: "rgba(234,179,8,0.4)", activeBg: "rgba(234,179,8,0.32)", activeColor: "#fef9c3", activeBorder: "rgba(250,204,21,0.65)" },
    warranty: { bg: "rgba(168,85,247,0.18)", color: "#d8b4fe", border: "rgba(168,85,247,0.4)", activeBg: "rgba(168,85,247,0.32)", activeColor: "#f3e8ff", activeBorder: "rgba(192,132,252,0.65)" },
    discounts: { bg: "rgba(132,204,22,0.18)", color: "#bef264", border: "rgba(132,204,22,0.4)", activeBg: "rgba(132,204,22,0.32)", activeColor: "#ecfccb", activeBorder: "rgba(163,230,53,0.65)" },
    reports: { bg: "rgba(139,92,246,0.18)", color: "#c4b5fd", border: "rgba(139,92,246,0.4)", activeBg: "rgba(139,92,246,0.32)", activeColor: "#ede9fe", activeBorder: "rgba(167,139,250,0.65)" },
    settings: { bg: "rgba(100,116,139,0.22)", color: "#cbd5e1", border: "rgba(100,116,139,0.45)", activeBg: "rgba(100,116,139,0.35)", activeColor: "#f1f5f9", activeBorder: "rgba(148,163,184,0.65)" },
  },
  light: {
    "hold-bill": { bg: "#ea580c", color: "#ffffff", border: "#c2410c" },
    "held-bills": { bg: "#d97706", color: "#ffffff", border: "#b45309" },
    reload: { bg: "#4f46e5", color: "#ffffff", border: "#4338ca", activeBg: "#4338ca", activeColor: "#ffffff", activeBorder: "#3730a3" },
    customer: { bg: "#475569", color: "#ffffff", border: "#334155", activeBg: "#2563eb", activeColor: "#ffffff", activeBorder: "#1d4ed8" },
    products: { bg: "#2563eb", color: "#ffffff", border: "#1d4ed8", activeBg: "#1d4ed8", activeColor: "#ffffff", activeBorder: "#1e40af" },
    "quick-product": { bg: "#0d9488", color: "#ffffff", border: "#0f766e", activeBg: "#0f766e", activeColor: "#ffffff", activeBorder: "#115e59" },
    customers: { bg: "#0891b2", color: "#ffffff", border: "#0e7490", activeBg: "#0e7490", activeColor: "#ffffff", activeBorder: "#155e75" },
    "hold-bills": { bg: "#ea580c", color: "#ffffff", border: "#c2410c", activeBg: "#c2410c", activeColor: "#ffffff", activeBorder: "#9a3412" },
    orders: { bg: "#e11d48", color: "#ffffff", border: "#be123c", activeBg: "#be123c", activeColor: "#ffffff", activeBorder: "#9f1239" },
    vouchers: { bg: "#db2777", color: "#ffffff", border: "#be185d", activeBg: "#be185d", activeColor: "#ffffff", activeBorder: "#9d174d" },
    "quick-grn": { bg: "#059669", color: "#ffffff", border: "#047857", activeBg: "#047857", activeColor: "#ffffff", activeBorder: "#065f46" },
    expenses: { bg: "#dc2626", color: "#ffffff", border: "#b91c1c", activeBg: "#b91c1c", activeColor: "#ffffff", activeBorder: "#991b1b" },
    returns: { bg: "#ca8a04", color: "#ffffff", border: "#a16207", activeBg: "#a16207", activeColor: "#ffffff", activeBorder: "#854d0e" },
    warranty: { bg: "#9333ea", color: "#ffffff", border: "#7e22ce", activeBg: "#7e22ce", activeColor: "#ffffff", activeBorder: "#6b21a8" },
    discounts: { bg: "#65a30d", color: "#ffffff", border: "#4d7c0f", activeBg: "#4d7c0f", activeColor: "#ffffff", activeBorder: "#3f6212" },
    reports: { bg: "#7c3aed", color: "#ffffff", border: "#6d28d9", activeBg: "#6d28d9", activeColor: "#ffffff", activeBorder: "#5b21b6" },
    settings: { bg: "#64748b", color: "#ffffff", border: "#475569", activeBg: "#475569", activeColor: "#ffffff", activeBorder: "#334155" },
  },
};

const FALLBACK: Record<PosUiMode, BtnPalette> = {
  dark: { bg: "var(--pos-input)", color: "var(--pos-text-secondary)", border: "var(--pos-border)" },
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
