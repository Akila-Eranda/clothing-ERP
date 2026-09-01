/** POS terminal UI theme — synced with receipt Light/Dark header toggle. */

import {
  hexToRgbChannels,
  POS_COLOR_DEFAULTS,
  type PosUiColors,
} from "@/lib/pos-ui-colors";

export type PosUiMode = "light" | "dark";

export type PosUiVars = Record<string, string>;

export function resolvePosUiMode(theme?: string | null): PosUiMode {
  return theme === "light" ? "light" : "dark";
}

function withCustomColors(base: PosUiVars, mode: PosUiMode, colors?: Partial<PosUiColors> | null): PosUiVars {
  const accent = colors?.accent || POS_COLOR_DEFAULTS.accent;
  const accent2 = colors?.accent2 || POS_COLOR_DEFAULTS.accent2;
  const success = colors?.success || POS_COLOR_DEFAULTS.success;
  const success2 = colors?.success2 || POS_COLOR_DEFAULTS.success2;
  const price =
    colors?.price
    || (mode === "dark" ? "#ffffff" : accent);
  const cardBg = colors?.cardBg || base["--pos-card"]!;
  const cardTitle = colors?.cardTitle || base["--pos-text"]!;
  const cardSub = colors?.cardSub || base["--pos-muted"]!;
  const cardBorder = colors?.cardBorder || base["--pos-border"]!;

  return {
    ...base,
    "--pos-accent": accent,
    "--pos-accent-2": accent2,
    "--pos-accent-soft": mode === "light" ? accent : accent,
    "--pos-accent-rgb": hexToRgbChannels(accent),
    "--pos-accent-grad": `linear-gradient(135deg,${accent},${accent2})`,
    "--pos-success": success,
    "--pos-success-2": success2,
    "--pos-success-soft": success,
    "--pos-success-rgb": hexToRgbChannels(success),
    "--pos-success-grad": `linear-gradient(135deg,${success},${success2})`,
    "--pos-on-accent": "#FFFFFF",
    "--pos-price": price,
    "--pos-product-card": cardBg,
    "--pos-product-title": cardTitle,
    "--pos-product-sub": cardSub,
    "--pos-product-border": cardBorder,
    "--pos-product-price": price,
    "--pos-sales-bg": mode === "light"
      ? base["--pos-sales-bg"]!
      : `linear-gradient(135deg,${accent},${accent2})`,
    "--pos-violet-soft": accent2,
  };
}

/** CSS custom properties applied on the POS shell root. */
export function posUiCssVars(
  mode?: string | null,
  colors?: Partial<PosUiColors> | null,
): PosUiVars {
  const resolved = resolvePosUiMode(mode);
  if (resolved === "light") {
    return withCustomColors({
      "--pos-bg": "#F5F7FB",
      "--pos-panel": "#FFFFFF",
      "--pos-card": "#FFFFFF",
      "--pos-elevated": "#F8FAFC",
      "--pos-input": "#F1F5F9",
      "--pos-border": "#E2E8F0",
      "--pos-border-strong": "#94A3B8",
      "--pos-muted": "#475569",
      "--pos-muted-2": "#64748B",
      "--pos-text": "#0F172A",
      "--pos-text-secondary": "#1E293B",
      "--pos-text-soft": "#334155",
      "--pos-kbd": "#E2E8F0",
      "--pos-hover": "rgba(15,23,42,0.06)",
      "--pos-overlay": "rgba(15,23,42,0.5)",
      "--pos-pin-bg": "#F5F7FB",
      "--pos-shadow": "0 1px 3px rgba(15,23,42,0.08)",
      "--pos-thumb": "#E8EEF7",
      "--pos-thumb-icon": "#64748B",
      "--pos-sales-bg": "linear-gradient(135deg,#EFF6FF,#DBEAFE)",
      "--pos-sales-fg": "#1D4ED8",
      "--pos-sales-muted": "#64748B",
      "--pos-warn": "#E11D48",
      "--pos-warn-soft": "#BE123C",
      "--pos-warn-bg": "rgba(225,29,72,0.12)",
      "--pos-warn-border": "rgba(225,29,72,0.35)",
      "--pos-warn-pill": "#E11D48",
      "--pos-change": "#0284C7",
      "--pos-change-bg": "#E0F2FE",
      "--pos-change-border": "#7DD3FC",
      "--pos-btn-bg": "#475569",
      "--pos-toggle-off": "#CBD5E1",
    }, resolved, colors);
  }
  return withCustomColors({
    "--pos-bg": "#0d1b2e",
    "--pos-panel": "#0f1f3a",
    "--pos-card": "#162338",
    "--pos-elevated": "#1a2b4a",
    "--pos-input": "#1a2b4a",
    "--pos-border": "#1e3356",
    "--pos-border-strong": "#2a3a5c",
    "--pos-muted": "#8eabcf",
    "--pos-muted-2": "#6b8ab0",
    "--pos-text": "#ffffff",
    "--pos-text-secondary": "#d2dff0",
    "--pos-text-soft": "#9eb6d4",
    "--pos-kbd": "#2a3a5c",
    "--pos-hover": "rgba(255,255,255,0.1)",
    "--pos-overlay": "rgba(0,0,0,0.85)",
    "--pos-pin-bg": "#0d1b2e",
    "--pos-shadow": "none",
    "--pos-thumb": "#162338",
    "--pos-thumb-icon": "rgba(255,255,255,0.25)",
    "--pos-sales-bg": "linear-gradient(135deg,#4f6ef7,#7c3aed)",
    "--pos-sales-fg": "#ffffff",
    "--pos-sales-muted": "rgba(255,255,255,0.7)",
    "--pos-warn": "#f43f5e",
    "--pos-warn-soft": "#fda4af",
    "--pos-warn-bg": "#3f1824",
    "--pos-warn-border": "#881337",
    "--pos-warn-pill": "#e11d48",
    "--pos-change": "#38bdf8",
    "--pos-change-bg": "#0c2a3d",
    "--pos-change-border": "#0369a1",
    "--pos-btn-bg": "#1a2b4a",
    "--pos-toggle-off": "#1e3356",
  }, resolved, colors);
}
