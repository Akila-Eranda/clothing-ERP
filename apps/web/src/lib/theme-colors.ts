/**
 * System-wide theme colors — controlled from Theme Customizer.
 * Values stored as hex; applied as HSL channels on :root CSS variables.
 */

import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  DEFAULT_ACCENT,
  getAccentPreset,
  type AccentId,
} from "@/lib/accent-theme";

export type LightAccentChoice = AccentId | "custom";
export type DarkAccentChoice = AccentId | "custom" | "match-light";

export type ThemeColorsState = {
  lightAccent: LightAccentChoice;
  customLightAccent: string;
  darkAccent: DarkAccentChoice;
  customDarkAccent: string;

  lightBackground: string;
  lightCard: string;
  lightForeground: string;
  lightBorder: string;
  lightMutedForeground: string;

  darkBackground: string;
  darkCard: string;
  darkForeground: string;
  darkBorder: string;
  darkMutedForeground: string;

  darkChromeBg: string;
  darkChromeFg: string;
  darkChromeBorder: string;
  darkChromeMuted: string;
  darkChromeActive: string;
  darkChromeLogoBg: string;
};

export const THEME_COLORS_STORAGE_KEY = "hexalyte-theme-colors-v1";

export const DEFAULT_THEME_COLORS: ThemeColorsState = {
  lightAccent: "blue",
  customLightAccent: "#2563EB",
  darkAccent: "orange",
  customDarkAccent: "#FE9F43",

  lightBackground: "#FFFFFF",
  lightCard: "#FFFFFF",
  lightForeground: "#0F172A",
  lightBorder: "#E2E8F0",
  lightMutedForeground: "#475569",

  darkBackground: "#0D0D0D",
  darkCard: "#1A1A1A",
  darkForeground: "#D8DFEE",
  darkBorder: "#262626",
  darkMutedForeground: "#6B7280",

  darkChromeBg: "#0D0D0D",
  darkChromeFg: "#D8DFEE",
  darkChromeBorder: "#1F2228",
  darkChromeMuted: "#6B7280",
  darkChromeActive: "#FE9F43",
  darkChromeLogoBg: "#141414",
};

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized.split("").map((c) => c + c).join("")
      : normalized;
  if (!/^[a-f\d]{6}$/i.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function hexToHslChannels(hex: string): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return "0 0% 50%";

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function adjustHslLightness(hsl: string, delta: number): string {
  const parts = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
  if (!parts) return hsl;
  const l = Math.max(0, Math.min(100, parseInt(parts[3], 10) + delta));
  return `${parts[1]} ${parts[2]}% ${l}%`;
}

export function hexToRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(0, 0, 0, ${alpha})`;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function accentHue(hsl: string): string {
  return hsl.split(" ")[0] ?? "32";
}

function resolveAccentHsl(state: ThemeColorsState, isDark: boolean): string {
  if (isDark) {
    if (state.darkAccent === "match-light") {
      return resolveAccentHsl({ ...state, darkAccent: state.lightAccent }, false);
    }
    if (state.darkAccent === "custom") {
      return hexToHslChannels(state.customDarkAccent);
    }
    return getAccentPreset(state.darkAccent).primary;
  }

  if (state.lightAccent === "custom") {
    return hexToHslChannels(state.customLightAccent);
  }
  return getAccentPreset(state.lightAccent).primary;
}

function resolveAccentId(state: ThemeColorsState, isDark: boolean): string {
  if (isDark) {
    if (state.darkAccent === "match-light") {
      return state.lightAccent === "custom" ? "custom" : state.lightAccent;
    }
    return state.darkAccent === "custom" ? "custom" : state.darkAccent;
  }
  return state.lightAccent === "custom" ? "custom" : state.lightAccent;
}

/** Apply all customizable system colors to :root. */
export function applyThemeColors(state: ThemeColorsState) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  const isDark = root.classList.contains("dark");

  const accentHsl = resolveAccentHsl(state, isDark);
  const accentHover = adjustHslLightness(accentHsl, isDark ? -5 : -8);
  const accentLight = adjustHslLightness(accentHsl, isDark ? 5 : 7);
  const accentSoft = isDark
    ? `${accentHue(accentHsl)} 40% 14%`
    : getAccentPreset(
        state.lightAccent === "custom" ? DEFAULT_ACCENT : state.lightAccent,
      ).primarySoft;

  const bg = hexToHslChannels(isDark ? state.darkBackground : state.lightBackground);
  const card = hexToHslChannels(isDark ? state.darkCard : state.lightCard);
  const fg = hexToHslChannels(isDark ? state.darkForeground : state.lightForeground);
  const border = hexToHslChannels(isDark ? state.darkBorder : state.lightBorder);
  const mutedFg = hexToHslChannels(
    isDark ? state.darkMutedForeground : state.lightMutedForeground,
  );

  const secondaryBg = adjustHslLightness(bg, isDark ? 2 : -1);
  const cardHover = adjustHslLightness(card, isDark ? 2 : -1);
  const popover = adjustHslLightness(bg, isDark ? 3 : 0);
  const muted = adjustHslLightness(bg, isDark ? 5 : -1);
  const input = adjustHslLightness(border, isDark ? 1 : -2);
  const hover = adjustHslLightness(bg, isDark ? 7 : -1);
  const selected = isDark ? `${accentHue(accentHsl)} 50% 18%` : accentSoft;

  root.style.setProperty("--background", bg);
  root.style.setProperty("--secondary-background", secondaryBg);
  root.style.setProperty("--foreground", fg);
  root.style.setProperty("--card", card);
  root.style.setProperty("--card-foreground", fg);
  root.style.setProperty("--card-hover", cardHover);
  root.style.setProperty("--popover", popover);
  root.style.setProperty("--popover-foreground", fg);
  root.style.setProperty("--muted", muted);
  root.style.setProperty("--muted-foreground", mutedFg);
  root.style.setProperty("--secondary", secondaryBg);
  root.style.setProperty("--secondary-foreground", fg);
  root.style.setProperty("--border", border);
  root.style.setProperty("--border-hsl", border);
  root.style.setProperty("--input", input);
  root.style.setProperty("--divider", adjustHslLightness(border, isDark ? -1 : 3));
  root.style.setProperty("--line", border);
  root.style.setProperty("--header-background", bg);
  root.style.setProperty("--hover", hover);
  root.style.setProperty("--selected", selected);

  root.style.setProperty("--primary", accentHsl);
  root.style.setProperty("--primary-hover", accentHover);
  root.style.setProperty("--primary-light", accentLight);
  root.style.setProperty("--primary-soft", accentSoft);
  root.style.setProperty("--ring", accentHsl);
  root.style.setProperty("--chart-1", accentHsl);
  root.style.setProperty("--sidebar-background", secondaryBg);
  root.style.setProperty("--sidebar-foreground", fg);
  root.style.setProperty("--sidebar-primary", accentHsl);
  root.style.setProperty("--sidebar-ring", accentHsl);
  root.style.setProperty("--sidebar-border", border);
  root.style.setProperty("--sidebar-active-text", accentHover);
  root.style.setProperty("--sidebar-active-text-dark", adjustHslLightness(accentHsl, 15));
  root.style.setProperty("--sidebar-active-icon-dark", accentHsl);
  root.style.setProperty(
    "--primary-glow",
    hexToRgba(
      isDark ? state.customDarkAccent : state.customLightAccent,
      isDark ? 0.28 : 0.18,
    ),
  );

  if (isDark) {
    root.style.setProperty("--accent", adjustHslLightness(bg, 7));
    root.style.setProperty("--accent-foreground", accentHsl);
    root.style.setProperty("--sidebar-accent", accentSoft);
    root.style.setProperty("--sidebar-accent-foreground", accentHsl);
  } else {
    const preset = getAccentPreset(
      state.lightAccent === "custom" ? DEFAULT_ACCENT : state.lightAccent,
    );
    root.style.setProperty("--accent", preset.softBg);
    root.style.setProperty("--accent-foreground", preset.primaryHover);
    root.style.setProperty("--sidebar-accent", preset.softBg);
    root.style.setProperty("--sidebar-accent-foreground", preset.activeTextLight);
  }

  /* Chrome (sidebar/header in dark default skins) */
  root.style.setProperty("--chrome-bg", state.darkChromeBg);
  root.style.setProperty("--chrome-fg", state.darkChromeFg);
  root.style.setProperty("--chrome-border", state.darkChromeBorder);
  root.style.setProperty("--chrome-muted", state.darkChromeMuted);
  root.style.setProperty("--chrome-active-fg", state.darkChromeActive);
  root.style.setProperty(
    "--chrome-active-bg",
    hexToRgba(state.darkChromeActive, 0.14),
  );
  root.style.setProperty("--chrome-hover", "rgba(255, 255, 255, 0.05)");
  root.style.setProperty("--chrome-logo-bg", state.darkChromeLogoBg);

  /* react-table-craft tokens */
  root.style.setProperty("--tc-background", bg);
  root.style.setProperty("--tc-foreground", fg);
  root.style.setProperty("--tc-card", card);
  root.style.setProperty("--tc-card-foreground", fg);
  root.style.setProperty("--tc-popover", popover);
  root.style.setProperty("--tc-popover-foreground", fg);
  root.style.setProperty("--tc-primary", accentHsl);
  root.style.setProperty("--tc-secondary", secondaryBg);
  root.style.setProperty("--tc-secondary-foreground", fg);
  root.style.setProperty("--tc-muted", muted);
  root.style.setProperty("--tc-muted-foreground", mutedFg);
  root.style.setProperty("--tc-accent", isDark ? adjustHslLightness(bg, 7) : accentSoft);
  root.style.setProperty("--tc-accent-foreground", accentHsl);
  root.style.setProperty("--tc-border", border);
  root.style.setProperty("--tc-input", input);
  root.style.setProperty("--tc-ring", accentHsl);

  root.dataset.accent = resolveAccentId(state, isDark);
}

export function loadStoredThemeColors(): ThemeColorsState {
  if (typeof window === "undefined") return DEFAULT_THEME_COLORS;

  try {
    const raw = localStorage.getItem(THEME_COLORS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeColorsState>;
      return { ...DEFAULT_THEME_COLORS, ...parsed };
    }
  } catch {
    /* fall through */
  }

  /* Migrate legacy accent-only storage */
  try {
    const legacy = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentId | null;
    if (legacy && ACCENT_PRESETS.some((p) => p.id === legacy)) {
      return { ...DEFAULT_THEME_COLORS, lightAccent: legacy };
    }
  } catch {
    /* noop */
  }

  return DEFAULT_THEME_COLORS;
}

export function clearThemeColorOverrides() {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const props = [
    "--background", "--secondary-background", "--foreground", "--card", "--card-foreground",
    "--card-hover", "--popover", "--popover-foreground", "--muted", "--muted-foreground",
    "--secondary", "--secondary-foreground", "--border", "--border-hsl", "--input",
    "--divider", "--line", "--header-background", "--hover", "--selected",
    "--primary", "--primary-hover", "--primary-light", "--primary-soft", "--ring",
    "--chart-1", "--sidebar-background", "--sidebar-foreground", "--sidebar-primary",
    "--sidebar-ring", "--sidebar-border", "--sidebar-active-text", "--sidebar-active-text-dark",
    "--sidebar-active-icon-dark", "--primary-glow", "--accent", "--accent-foreground",
    "--sidebar-accent", "--sidebar-accent-foreground",
    "--chrome-bg", "--chrome-fg", "--chrome-border", "--chrome-muted",
    "--chrome-active-fg", "--chrome-active-bg", "--chrome-hover", "--chrome-logo-bg",
    "--tc-background", "--tc-foreground", "--tc-card", "--tc-card-foreground",
    "--tc-popover", "--tc-popover-foreground", "--tc-primary", "--tc-secondary",
    "--tc-secondary-foreground", "--tc-muted", "--tc-muted-foreground", "--tc-accent",
    "--tc-accent-foreground", "--tc-border", "--tc-input", "--tc-ring",
  ];
  for (const prop of props) root.style.removeProperty(prop);
}
