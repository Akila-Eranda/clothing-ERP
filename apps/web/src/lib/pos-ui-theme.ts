/** POS terminal UI theme — synced with receipt Light/Dark header toggle. */

export type PosUiMode = "light" | "dark";

export type PosUiVars = Record<string, string>;

export function resolvePosUiMode(theme?: string | null): PosUiMode {
  return theme === "light" ? "light" : "dark";
}

/** CSS custom properties applied on the POS shell root. */
export function posUiCssVars(mode?: string | null): PosUiVars {
  if (resolvePosUiMode(mode) === "light") {
    return {
      "--pos-bg": "#F5F7FB",
      "--pos-panel": "#FFFFFF",
      "--pos-card": "#FFFFFF",
      "--pos-elevated": "#F8FAFC",
      "--pos-input": "#F1F5F9",
      "--pos-border": "#E2E8F0",
      "--pos-border-strong": "#CBD5E1",
      "--pos-muted": "#475569",
      "--pos-muted-2": "#64748B",
      "--pos-text": "#0F172A",
      "--pos-text-secondary": "#1E293B",
      "--pos-text-soft": "#334155",
      "--pos-kbd": "#E2E8F0",
      "--pos-hover": "rgba(15,23,42,0.06)",
      "--pos-overlay": "rgba(15,23,42,0.45)",
      "--pos-pin-bg": "#F5F7FB",
      "--pos-shadow": "0 1px 3px rgba(15,23,42,0.08)",
      "--pos-thumb": "#E8EEF7",
      "--pos-thumb-icon": "#94A3B8",
      "--pos-sales-bg": "linear-gradient(135deg,#EFF6FF,#DBEAFE)",
      "--pos-sales-fg": "#1D4ED8",
      "--pos-sales-muted": "#64748B",
      /* Warning / caution — rose instead of yellow in light mode */
      "--pos-warn": "#E11D48",
      "--pos-warn-soft": "#BE123C",
      "--pos-warn-bg": "rgba(225,29,72,0.12)",
      "--pos-warn-border": "rgba(225,29,72,0.35)",
      "--pos-warn-pill": "#E11D48",
      "--pos-accent": "#4f6ef7",
      "--pos-accent-soft": "#1D4ED8",
      "--pos-success-soft": "#047857",
      "--pos-violet-soft": "#6D28D9",
      "--pos-btn-bg": "#475569",
    };
  }
  return {
    "--pos-bg": "#0d1b2e",
    "--pos-panel": "#0f1f3a",
    "--pos-card": "#162338",
    "--pos-elevated": "#1a2b4a",
    "--pos-input": "#1a2b4a",
    "--pos-border": "#1e3356",
    "--pos-border-strong": "#2a3a5c",
    "--pos-muted": "#6a8ab8",
    "--pos-muted-2": "#4a6a8a",
    "--pos-text": "#ffffff",
    "--pos-text-secondary": "#a0b4d4",
    "--pos-text-soft": "#6a8ab8",
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
    "--pos-warn": "#f59e0b",
    "--pos-warn-soft": "#fbbf24",
    "--pos-warn-bg": "rgba(245,158,11,0.15)",
    "--pos-warn-border": "rgba(245,158,11,0.35)",
    "--pos-warn-pill": "#d97706",
    "--pos-accent": "#4f6ef7",
    "--pos-accent-soft": "#93c5fd",
    "--pos-success-soft": "#6ee7b7",
    "--pos-violet-soft": "#c4b5fd",
    "--pos-btn-bg": "#1a2b4a",
  };
}
