"use client";

import * as React from "react";

/** POS terminal color customization (local per browser / terminal). */

export type PosUiColors = {
  accent: string;
  accent2: string;
  success: string;
  success2: string;
  /** Price / total amounts — empty = auto (white in dark, accent in light) */
  price: string;
  /** Product card surface — empty = theme card */
  cardBg: string;
  /** Product name on card — empty = theme text */
  cardTitle: string;
  /** Variant / subtitle on card — empty = theme muted */
  cardSub: string;
  /** Card border idle — empty = theme border */
  cardBorder: string;
};

export const POS_COLOR_DEFAULTS: PosUiColors = {
  accent: "#4f6ef7",
  accent2: "#7c3aed",
  success: "#10b981",
  success2: "#059669",
  price: "",
  cardBg: "",
  cardTitle: "",
  cardSub: "",
  cardBorder: "",
};

const LS_KEY = "pos_ui_colors";
export const POS_COLORS_EVENT = "pos-ui-colors-updated";

function normalizeHex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const a = v[1]!;
    const b = v[2]!;
    const c = v[3]!;
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase();
  }
  return fallback;
}

function optionalHex(value: unknown): string {
  if (typeof value !== "string") return "";
  const v = value.trim();
  if (!v) return "";
  if (/^#[0-9a-fA-F]{3,6}$/.test(v)) return normalizeHex(v, "");
  return "";
}

export function hexToRgbChannels(hex: string): string {
  const h = normalizeHex(hex, "#4f6ef7").slice(1);
  const n = parseInt(h, 16);
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

export function readPosUiColors(): PosUiColors {
  if (typeof window === "undefined") return { ...POS_COLOR_DEFAULTS };
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { ...POS_COLOR_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PosUiColors>;
    return {
      accent: normalizeHex(parsed.accent, POS_COLOR_DEFAULTS.accent),
      accent2: normalizeHex(parsed.accent2, POS_COLOR_DEFAULTS.accent2),
      success: normalizeHex(parsed.success, POS_COLOR_DEFAULTS.success),
      success2: normalizeHex(parsed.success2, POS_COLOR_DEFAULTS.success2),
      price: optionalHex(parsed.price),
      cardBg: optionalHex(parsed.cardBg),
      cardTitle: optionalHex(parsed.cardTitle),
      cardSub: optionalHex(parsed.cardSub),
      cardBorder: optionalHex(parsed.cardBorder),
    };
  } catch {
    return { ...POS_COLOR_DEFAULTS };
  }
}

export function writePosUiColors(patch: Partial<PosUiColors>): PosUiColors {
  const next = { ...readPosUiColors(), ...patch };
  next.accent = normalizeHex(next.accent, POS_COLOR_DEFAULTS.accent);
  next.accent2 = normalizeHex(next.accent2, POS_COLOR_DEFAULTS.accent2);
  next.success = normalizeHex(next.success, POS_COLOR_DEFAULTS.success);
  next.success2 = normalizeHex(next.success2, POS_COLOR_DEFAULTS.success2);
  next.price = optionalHex(next.price);
  next.cardBg = optionalHex(next.cardBg);
  next.cardTitle = optionalHex(next.cardTitle);
  next.cardSub = optionalHex(next.cardSub);
  next.cardBorder = optionalHex(next.cardBorder);
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(POS_COLORS_EVENT));
  } catch { /* noop */ }
  return next;
}

export function usePosUiColors(): [PosUiColors, (patch: Partial<PosUiColors>) => void] {
  const [colors, setColors] = React.useState<PosUiColors>(() => readPosUiColors());
  React.useEffect(() => {
    const sync = () => setColors(readPosUiColors());
    window.addEventListener(POS_COLORS_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(POS_COLORS_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const update = React.useCallback((patch: Partial<PosUiColors>) => {
    setColors(writePosUiColors(patch));
  }, []);
  return [colors, update];
}
