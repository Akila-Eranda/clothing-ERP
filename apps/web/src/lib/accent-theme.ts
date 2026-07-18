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
    hex: "#2563EB",
    lightHex: "#3B82F6",
    primary: "217 91% 53%",
    primaryHover: "224 76% 48%",
    primaryLight: "217 91% 60%",
    primarySoft: "214 100% 97%",
    softBg: "214 100% 97%",
    softBgDark: "217 91% 53%",
    ringGlow: "217 91% 53%",
    activeTextLight: "224 76% 48%",
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

/** Apply accent CSS variables on :root (works with light + dark class). */
export function applyAccentPreset(id: AccentId | string) {
  if (typeof document === "undefined") return;
  const p = getAccentPreset(id);
  const root = document.documentElement;
  const isDark = root.classList.contains("dark");
  root.style.setProperty("--primary", p.primary);
  root.style.setProperty("--primary-hover", p.primaryHover);
  root.style.setProperty("--primary-light", p.primaryLight);
  root.style.setProperty("--primary-soft", isDark ? "217 40% 14%" : p.primarySoft);
  root.style.setProperty("--ring", p.primary);
  root.style.setProperty("--chart-1", p.primary);
  root.style.setProperty("--sidebar-primary", p.primary);
  root.style.setProperty("--sidebar-ring", p.primary);
  root.style.setProperty("--sidebar-active-text", p.activeTextLight);
  root.style.setProperty("--sidebar-active-text-dark", p.activeTextDark);
  root.style.setProperty("--sidebar-active-icon-dark", p.activeIconDark);
  root.style.setProperty("--primary-glow", `hsl(${p.ringGlow} / ${isDark ? "0.30" : "0.18"})`);
  if (!isDark) {
    root.style.setProperty("--accent", p.softBg);
    root.style.setProperty("--accent-foreground", p.primaryHover);
    root.style.setProperty("--sidebar-accent", p.softBg);
    root.style.setProperty("--sidebar-accent-foreground", p.activeTextLight);
  } else {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--accent-foreground");
    root.style.removeProperty("--sidebar-accent");
    root.style.removeProperty("--sidebar-accent-foreground");
  }
  root.dataset.accent = p.id;
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
