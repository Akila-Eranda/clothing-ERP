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
import {
  getSidebarSkinChromePatch,
  getTopbarSkinChromePatch,
  isDefaultLightSidebar,
  isDefaultLightTopbar,
  type SidebarSkin,
  type TopbarSkin,
} from "@/lib/theme-layout";

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

  lightChromeBg: string;
  /** Gradient or image CSS for sidebar/header bg; empty = solid `lightChromeBg`. */
  lightChromeBgCss: string;
  lightChromeFg: string;
  lightChromeBorder: string;
  lightChromeMuted: string;
  lightChromeActive: string;
  lightChromeLogoBg: string;

  darkChromeBgCss: string;

  /** System button palette (applies dashboard + admin; primary follows Brand accent) */
  buttonSecondary: string;
  buttonSecondaryHover: string;
  buttonSuccess: string;
  buttonDanger: string;
  buttonWarning: string;
  buttonDestructive: string;
  buttonInfo: string;
};

export const THEME_COLORS_STORAGE_KEY = "hexalyte-theme-colors-v1";
export const THEME_COLORS_STORE_VERSION = 5;

/** Near-white canvas values from older builds — migrate to DreamsPOS gray. */
const LEGACY_LIGHT_CANVAS = new Set([
  "#fafbfe",
  "#ffffff",
  "#f8fafc",
  "#f9fafb",
  "#fbfcfe",
]);

export const DEFAULT_THEME_COLORS: ThemeColorsState = {
  lightAccent: "blue",
  customLightAccent: "#2563EB",
  darkAccent: "orange",
  customDarkAccent: "#FE9F43",

  lightBackground: "#F1F5F6",
  lightCard: "#FFFFFF",
  lightForeground: "#212B36",
  lightBorder: "#E6EAED",
  lightMutedForeground: "#646B72",

  darkBackground: "#0D0D0D",
  darkCard: "#171717",
  darkForeground: "#D8DFEE",
  darkBorder: "#1F2228",
  darkMutedForeground: "#6B7280",

  darkChromeBg: "#0D0D0D",
  darkChromeFg: "#D8DFEE",
  darkChromeBorder: "#1F2228",
  darkChromeMuted: "#6B7280",
  darkChromeActive: "#FE9F43",
  darkChromeLogoBg: "#141414",

  lightChromeBg: "#FFFFFF",
  lightChromeBgCss: "",
  lightChromeFg: "#0F172A",
  lightChromeBorder: "#E6EAED",
  lightChromeMuted: "#64748B",
  lightChromeActive: "#FE9F43",
  lightChromeLogoBg: "#FFFFFF",

  darkChromeBgCss: "",

  buttonSecondary: "#092C4C",
  buttonSecondaryHover: "#1E3A5F",
  buttonSuccess: "#3EB780",
  buttonDanger: "#E04F16",
  buttonWarning: "#FE9F43",
  buttonDestructive: "#EF4444",
  buttonInfo: "#155EEF",
};

export function normalizeThemeColorsState(
  state?: Partial<ThemeColorsState> | null,
): ThemeColorsState {
  const merged = { ...DEFAULT_THEME_COLORS, ...state } as ThemeColorsState;
  const bg = merged.lightBackground?.trim().toLowerCase();
  if (!bg || LEGACY_LIGHT_CANVAS.has(bg)) {
    merged.lightBackground = DEFAULT_THEME_COLORS.lightBackground;
  }
  merged.buttonSecondary ??= DEFAULT_THEME_COLORS.buttonSecondary;
  merged.buttonSecondaryHover ??= DEFAULT_THEME_COLORS.buttonSecondaryHover;
  merged.buttonSuccess ??= DEFAULT_THEME_COLORS.buttonSuccess;
  merged.buttonDanger ??= DEFAULT_THEME_COLORS.buttonDanger;
  merged.buttonWarning ??= DEFAULT_THEME_COLORS.buttonWarning;
  merged.buttonDestructive ??= DEFAULT_THEME_COLORS.buttonDestructive;
  merged.buttonInfo ??= DEFAULT_THEME_COLORS.buttonInfo;
  return merged;
}

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

type ChromeTokens = {
  bg: string;
  fg: string;
  border: string;
  muted: string;
  active: string;
  logoBg: string;
  hover: string;
  activeBg: string;
};

function chromeFromPatch(
  patch: Partial<ThemeColorsState>,
  state: ThemeColorsState,
  isDark: boolean,
): ChromeTokens {
  const preset = getAccentPreset(
    state.lightAccent === "custom" ? DEFAULT_ACCENT : state.lightAccent,
  );
  if (isDark) {
    const bgCss = (patch.darkChromeBgCss ?? state.darkChromeBgCss).trim();
    const active = patch.darkChromeActive ?? state.darkChromeActive;
    return {
      bg: bgCss || patch.darkChromeBg || state.darkChromeBg,
      fg: patch.darkChromeFg ?? state.darkChromeFg,
      border: patch.darkChromeBorder ?? state.darkChromeBorder,
      muted: patch.darkChromeMuted ?? state.darkChromeMuted,
      active,
      logoBg: patch.darkChromeLogoBg ?? state.darkChromeLogoBg,
      hover: "rgba(255, 255, 255, 0.05)",
      activeBg: hexToRgba(active, 0.14),
    };
  }
  const bgCss = (patch.lightChromeBgCss ?? state.lightChromeBgCss).trim();
  const active = patch.lightChromeActive ?? (state.lightChromeActive || preset.hex);
  const fg = patch.lightChromeFg ?? state.lightChromeFg;
  return {
    bg: bgCss || patch.lightChromeBg || state.lightChromeBg,
    fg,
    border: patch.lightChromeBorder ?? state.lightChromeBorder,
    muted: patch.lightChromeMuted ?? state.lightChromeMuted,
    active,
    logoBg: patch.lightChromeLogoBg ?? state.lightChromeLogoBg,
    hover: hexToRgba(fg, 0.06),
    activeBg: hexToRgba(active, 0.1),
  };
}

function resolveSidebarChrome(state: ThemeColorsState, isDark: boolean): ChromeTokens {
  const skin = (document.documentElement.dataset.sidebar ?? "light") as SidebarSkin;
  if (isDefaultLightSidebar(skin)) {
    return chromeFromPatch(
      isDark
        ? {
            darkChromeBg: state.darkChromeBg,
            darkChromeBgCss: state.darkChromeBgCss,
            darkChromeFg: state.darkChromeFg,
            darkChromeBorder: state.darkChromeBorder,
            darkChromeMuted: state.darkChromeMuted,
            darkChromeActive: state.darkChromeActive,
            darkChromeLogoBg: state.darkChromeLogoBg,
          }
        : {
            lightChromeBg: state.lightChromeBg,
            lightChromeBgCss: state.lightChromeBgCss,
            lightChromeFg: state.lightChromeFg,
            lightChromeBorder: state.lightChromeBorder,
            lightChromeMuted: state.lightChromeMuted,
            lightChromeActive: state.lightChromeActive,
            lightChromeLogoBg: state.lightChromeLogoBg,
          },
      state,
      isDark,
    );
  }
  return chromeFromPatch(getSidebarSkinChromePatch(skin, isDark), state, isDark);
}

function resolveTopbarChrome(state: ThemeColorsState, isDark: boolean): ChromeTokens {
  const skin = (document.documentElement.dataset.topbar ?? "white") as TopbarSkin;
  if (isDefaultLightTopbar(skin)) {
    return chromeFromPatch(
      isDark
        ? {
            darkChromeBg: state.darkChromeBg,
            darkChromeBgCss: state.darkChromeBgCss,
            darkChromeFg: state.darkChromeFg,
            darkChromeBorder: state.darkChromeBorder,
            darkChromeMuted: state.darkChromeMuted,
            darkChromeActive: state.darkChromeActive,
            darkChromeLogoBg: state.darkChromeLogoBg,
          }
        : {
            lightChromeBg: state.lightChromeBg,
            lightChromeBgCss: state.lightChromeBgCss,
            lightChromeFg: state.lightChromeFg,
            lightChromeBorder: state.lightChromeBorder,
            lightChromeMuted: state.lightChromeMuted,
            lightChromeActive: state.lightChromeActive,
            lightChromeLogoBg: state.lightChromeLogoBg,
          },
      state,
      isDark,
    );
  }
  return chromeFromPatch(getTopbarSkinChromePatch(skin, isDark), state, isDark);
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
  root.style.setProperty("--sidebar-background", isDark ? secondaryBg : hexToHslChannels(state.lightChromeBg));
  root.style.setProperty("--sidebar-foreground", isDark ? fg : hexToHslChannels(state.lightChromeFg));
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

    const sidebarChrome = resolveSidebarChrome(state, true);
    const topbarChrome = resolveTopbarChrome(state, true);

    root.style.setProperty("--retail-sidebar-bg", sidebarChrome.bg);
    root.style.setProperty("--retail-sidebar-fg", sidebarChrome.fg);
    root.style.setProperty("--retail-sidebar-muted", sidebarChrome.muted);
    root.style.setProperty("--retail-sidebar-border", sidebarChrome.border);
    root.style.setProperty("--retail-sidebar-hover", sidebarChrome.hover);
    root.style.setProperty("--retail-sidebar-active-bg", sidebarChrome.activeBg);
    root.style.setProperty("--retail-sidebar-active-fg", sidebarChrome.active);
    root.style.setProperty("--retail-topbar-bg", topbarChrome.bg);
    root.style.setProperty("--retail-topbar-fg", topbarChrome.fg);
    root.style.setProperty("--retail-topbar-border", topbarChrome.border);

    root.style.setProperty("--chrome-bg", sidebarChrome.bg);
    root.style.setProperty("--chrome-fg", sidebarChrome.fg);
    root.style.setProperty("--chrome-border", sidebarChrome.border);
    root.style.setProperty("--chrome-muted", sidebarChrome.muted);
    root.style.setProperty("--chrome-active-fg", sidebarChrome.active);
    root.style.setProperty("--chrome-active-bg", sidebarChrome.activeBg);
    root.style.setProperty("--chrome-hover", sidebarChrome.hover);
    root.style.setProperty("--chrome-logo-bg", sidebarChrome.logoBg);
  } else {
    const preset = getAccentPreset(
      state.lightAccent === "custom" ? DEFAULT_ACCENT : state.lightAccent,
    );
    root.style.setProperty("--accent", preset.softBg);
    root.style.setProperty("--accent-foreground", preset.primaryHover);
    root.style.setProperty("--sidebar-accent", preset.softBg);
    root.style.setProperty("--sidebar-accent-foreground", preset.activeTextLight);

    const sidebarChrome = resolveSidebarChrome(state, false);
    const topbarChrome = resolveTopbarChrome(state, false);

    root.style.setProperty("--retail-sidebar-bg", sidebarChrome.bg);
    root.style.setProperty("--retail-sidebar-fg", sidebarChrome.fg);
    root.style.setProperty("--retail-sidebar-muted", sidebarChrome.muted);
    root.style.setProperty("--retail-sidebar-border", sidebarChrome.border);
    root.style.setProperty("--retail-sidebar-hover", sidebarChrome.hover);
    root.style.setProperty("--retail-sidebar-active-bg", sidebarChrome.activeBg);
    root.style.setProperty("--retail-sidebar-active-fg", sidebarChrome.active);
    root.style.setProperty("--retail-topbar-bg", topbarChrome.bg);
    root.style.setProperty("--retail-topbar-fg", topbarChrome.fg);
    root.style.setProperty("--retail-topbar-border", topbarChrome.border);

    root.style.setProperty("--chrome-bg", sidebarChrome.bg);
    root.style.setProperty("--chrome-fg", sidebarChrome.fg);
    root.style.setProperty("--chrome-border", sidebarChrome.border);
    root.style.setProperty("--chrome-muted", sidebarChrome.muted);
    root.style.setProperty("--chrome-active-fg", sidebarChrome.active);
    root.style.setProperty("--chrome-active-bg", sidebarChrome.activeBg);
    root.style.setProperty("--chrome-hover", sidebarChrome.hover);
    root.style.setProperty("--chrome-logo-bg", sidebarChrome.logoBg);
  }

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

  /* Buttons — primary follows brand accent; other variants from customizer */
  root.style.setProperty("--btn-primary", accentHsl);
  root.style.setProperty("--btn-primary-hover", accentHover);
  root.style.setProperty("--btn-secondary", hexToHslChannels(state.buttonSecondary));
  root.style.setProperty("--btn-secondary-hover", hexToHslChannels(state.buttonSecondaryHover));
  root.style.setProperty("--btn-success", hexToHslChannels(state.buttonSuccess));
  root.style.setProperty("--btn-danger", hexToHslChannels(state.buttonDanger));
  root.style.setProperty("--btn-warning", hexToHslChannels(state.buttonWarning));
  root.style.setProperty("--btn-destructive", hexToHslChannels(state.buttonDestructive));
  root.style.setProperty("--btn-info", hexToHslChannels(state.buttonInfo));

  root.style.setProperty("--success", hexToHslChannels(state.buttonSuccess));
  root.style.setProperty("--destructive", hexToHslChannels(state.buttonDestructive));
  root.style.setProperty("--warning", hexToHslChannels(state.buttonWarning));
  root.style.setProperty("--info", hexToHslChannels(state.buttonInfo));

  root.dataset.accent = resolveAccentId(state, isDark);
}

export function loadStoredThemeColors(): ThemeColorsState {
  if (typeof window === "undefined") return DEFAULT_THEME_COLORS;

  try {
    const raw = localStorage.getItem(THEME_COLORS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { state?: Partial<ThemeColorsState> } & Partial<ThemeColorsState>;
      const colors = parsed.state ?? parsed;
      return normalizeThemeColorsState(colors);
    }
  } catch {
    /* fall through */
  }

  /* Migrate legacy accent-only storage */
  try {
    const legacy = localStorage.getItem(ACCENT_STORAGE_KEY) as AccentId | null;
    if (legacy && ACCENT_PRESETS.some((p) => p.id === legacy)) {
      return normalizeThemeColorsState({ lightAccent: legacy });
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
    "--retail-sidebar-bg", "--retail-sidebar-fg", "--retail-sidebar-muted",
    "--retail-sidebar-border", "--retail-sidebar-hover",
    "--retail-sidebar-active-bg", "--retail-sidebar-active-fg",
    "--retail-topbar-bg", "--retail-topbar-fg", "--retail-topbar-border",
    "--chrome-bg", "--chrome-fg", "--chrome-border", "--chrome-muted",
    "--chrome-active-fg", "--chrome-active-bg", "--chrome-hover", "--chrome-logo-bg",
    "--tc-background", "--tc-foreground", "--tc-card", "--tc-card-foreground",
    "--tc-popover", "--tc-popover-foreground", "--tc-primary", "--tc-secondary",
    "--tc-secondary-foreground", "--tc-muted", "--tc-muted-foreground", "--tc-accent",
    "--tc-accent-foreground", "--tc-border", "--tc-input", "--tc-ring",
    "--btn-primary", "--btn-primary-hover", "--btn-secondary", "--btn-secondary-hover",
    "--btn-success", "--btn-danger", "--btn-warning", "--btn-destructive", "--btn-info",
  ];
  for (const prop of props) root.style.removeProperty(prop);
}
