/**
 * Hexalyte Design System v2 — accent presets (user-selectable).
 * Values are HSL channels without `hsl()` for CSS variables.
 */

export type AccentId = "blue" | "violet" | "cyan" | "emerald" | "rose" | "orange";

export type AccentPreset = {
  id: AccentId;
  name: string;
  /** Primary brand — hex for swatches */
  hex: string;
  lightHex: string;
  /** HSL channels: "H S% L%" */
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primarySoft: string;
  /** Soft wash for light-mode ghost/hover (e.g. #EFF6FF) */
  softBg: string;
  softBgDark: string;
  ringGlow: string;
  /** Sidebar active text — light / dark */
  activeTextLight: string;
  activeTextDark: string;
  activeIconDark: string;
};

export const ACCENT_PRESETS: AccentPreset[] = [
  {
    id: "blue",
    name: "Blue",
    hex: "#1677FF",
    lightHex: "#1677FF",
    primary: "214 100% 54%",
    primaryHover: "214 84% 48%",
    primaryLight: "214 100% 60%",
    primarySoft: "214 100% 97%",
    softBg: "214 100% 97%",
    softBgDark: "214 100% 54%",
    ringGlow: "214 100% 54%",
    activeTextLight: "214 84% 48%",
    activeTextDark: "213 97% 87%",
    activeIconDark: "213 97% 78%",
  },
  {
    id: "violet",
    name: "Violet",
    hex: "#7C3AED",
    lightHex: "#8B5CF6",
    primary: "263 70% 58%",
    primaryHover: "263 70% 50%",
    primaryLight: "258 90% 66%",
    primarySoft: "270 100% 98%",
    softBg: "270 100% 98%",
    softBgDark: "263 70% 58%",
    ringGlow: "263 70% 58%",
    activeTextLight: "263 70% 50%",
    activeTextDark: "258 90% 84%",
    activeIconDark: "258 90% 76%",
  },
  {
    id: "cyan",
    name: "Cyan",
    hex: "#0891B2",
    lightHex: "#06B6D4",
    primary: "189 94% 37%",
    primaryHover: "192 91% 30%",
    primaryLight: "189 94% 43%",
    primarySoft: "186 100% 96%",
    softBg: "186 100% 96%",
    softBgDark: "189 94% 37%",
    ringGlow: "189 94% 37%",
    activeTextLight: "192 91% 30%",
    activeTextDark: "186 94% 82%",
    activeIconDark: "188 94% 70%",
  },
  {
    id: "emerald",
    name: "Emerald",
    hex: "#059669",
    lightHex: "#10B981",
    primary: "160 84% 31%",
    primaryHover: "161 94% 24%",
    primaryLight: "160 84% 39%",
    primarySoft: "152 81% 96%",
    softBg: "152 81% 96%",
    softBgDark: "160 84% 31%",
    ringGlow: "160 84% 31%",
    activeTextLight: "161 94% 24%",
    activeTextDark: "152 76% 80%",
    activeIconDark: "158 64% 62%",
  },
  {
    id: "rose",
    name: "Rose",
    hex: "#E11D48",
    lightHex: "#F43F5E",
    primary: "347 77% 50%",
    primaryHover: "347 77% 42%",
    primaryLight: "350 89% 60%",
    primarySoft: "356 100% 97%",
    softBg: "356 100% 97%",
    softBgDark: "347 77% 50%",
    ringGlow: "347 77% 50%",
    activeTextLight: "347 77% 42%",
    activeTextDark: "350 89% 82%",
    activeIconDark: "350 89% 70%",
  },
  {
    id: "orange",
    name: "Orange",
    hex: "#EA580C",
    lightHex: "#F97316",
    primary: "21 90% 48%",
    primaryHover: "17 88% 40%",
    primaryLight: "25 95% 53%",
    primarySoft: "33 100% 96%",
    softBg: "33 100% 96%",
    softBgDark: "21 90% 48%",
    ringGlow: "21 90% 48%",
    activeTextLight: "17 88% 40%",
    activeTextDark: "32 98% 83%",
    activeIconDark: "27 96% 70%",
  },
];

export const ACCENT_STORAGE_KEY = "hexalyte-accent";
export const DEFAULT_ACCENT: AccentId = "blue";

export function getAccentPreset(id: string | null | undefined): AccentPreset {
  return ACCENT_PRESETS.find((p) => p.id === id) ?? ACCENT_PRESETS[0];
}

/** @deprecated Use useThemeColorsStore().setLightAccent — kept for legacy callers */
export function applyAccentPreset(id: AccentId | string) {
  if (typeof document === "undefined" || id === "custom") return;
  void import("@/stores/theme-colors-store").then(({ useThemeColorsStore }) => {
    useThemeColorsStore.getState().setLightAccent(id as AccentId);
  });
}

export function loadStoredAccent(): AccentId {
  if (typeof window === "undefined") return DEFAULT_ACCENT;
  try {
    const v = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentId | null;
    if (v && ACCENT_PRESETS.some((p) => p.id === v)) return v;
  } catch { /* noop */ }
  return DEFAULT_ACCENT;
}

export function persistAccent(id: AccentId) {
  try {
    localStorage.setItem(ACCENT_STORAGE_KEY, id);
  } catch { /* noop */ }
  applyAccentPreset(id);
}
