/**
 * DreamsPOS-style layout / skin presets — adapted for Hexalyte (Next.js + CSS vars).
 */

export type LayoutMode = "default" | "mini";
export type LayoutWidth = "fluid" | "box";
export type SidebarSkin =
  | "light"
  | "sidebarcolorone"
  | "sidebarcolortwo"
  | "sidebarcolorthree"
  | "sidebarcolorfour"
  | "sidebarcolorfive"
  | "sidebarcolorsix"
  | "sidebarcolorseven"
  | "sidebarcoloreight"
  | "sidebarcolornine"
  | "sidebarcolorten"
  | "sidebarcoloreleven"
  | "sidebarcolortwelve"
  | "sidebarcolorthirteen"
  | "sidebarcolorfourteen";

export type TopbarSkin =
  | "white"
  | "topbarcolorone"
  | "topbarcolortwo"
  | "topbarcolorthree"
  | "topbarcolorfour"
  | "topbarcolorfive"
  | "topbarcolorsix"
  | "topbarcolorseven"
  | "topbarcoloreight"
  | "topbarcolornine"
  | "topbarcolorten"
  | "topbarcoloreleven"
  | "topbarcolortwelve"
  | "topbarcolorthirteen"
  | "topbarcolorfourteen";

export type ThemeLayoutState = {
  layout: LayoutMode;
  width: LayoutWidth;
  sidebarSkin: SidebarSkin;
  topbarSkin: TopbarSkin;
};

export const THEME_LAYOUT_STORAGE_KEY = "hexalyte-theme-layout-v1";

export const DEFAULT_THEME_LAYOUT: ThemeLayoutState = {
  layout: "default",
  width: "fluid",
  sidebarSkin: "light",
  topbarSkin: "white",
};

export type ChromeSkinPalette = {
  bg: string;
  fg: string;
  muted: string;
  border: string;
  activeFg: string;
  logoBg: string;
};

const LIGHT_SIDEBAR_PALETTE: ChromeSkinPalette = {
  bg: "#FFFFFF",
  fg: "#212B36",
  muted: "#646B72",
  border: "#E6EAED",
  activeFg: "#FE9F43",
  logoBg: "#FFFFFF",
};

const SNOW_SIDEBAR_PALETTE: ChromeSkinPalette = {
  bg: "#FBFBFB",
  fg: "#1F2937",
  muted: "#6B7280",
  border: "#E8EAED",
  activeFg: "#FE9F43",
  logoBg: "#FBFBFB",
};

const COLORED_SIDEBAR_TEXT: Omit<ChromeSkinPalette, "bg" | "logoBg"> = {
  fg: "#FFFFFF",
  muted: "#B8C4CE",
  border: "rgba(255,255,255,0.12)",
  activeFg: "#FFFFFF",
};

/** Full chrome palette per sidebar skin (DreamsPOS presets). */
export const SIDEBAR_SKIN_PALETTES: Record<SidebarSkin, ChromeSkinPalette> = {
  light: LIGHT_SIDEBAR_PALETTE,
  sidebarcolorone: SNOW_SIDEBAR_PALETTE,
  sidebarcolortwo: { bg: "#505969", logoBg: "#505969", ...COLORED_SIDEBAR_TEXT },
  sidebarcolorthree: { bg: "#2C2C2C", logoBg: "#2C2C2C", ...COLORED_SIDEBAR_TEXT },
  sidebarcolorfour: { bg: "#1D51B6", logoBg: "#1D51B6", ...COLORED_SIDEBAR_TEXT },
  sidebarcolorfive: { bg: "#6C0BA9", logoBg: "#6C0BA9", ...COLORED_SIDEBAR_TEXT },
  sidebarcolorsix: { bg: "#0B897D", logoBg: "#0B897D", ...COLORED_SIDEBAR_TEXT },
  sidebarcolorseven: {
    bg: "linear-gradient(180deg, #4B749F 0%, #243748 100%)",
    logoBg: "#4B749F",
    ...COLORED_SIDEBAR_TEXT,
  },
  sidebarcoloreight: {
    bg: "linear-gradient(180deg, #18ACCF 0%, #0F59AD 100%)",
    logoBg: "#18ACCF",
    ...COLORED_SIDEBAR_TEXT,
  },
  sidebarcolornine: {
    bg: "linear-gradient(180deg, #7D90B8 0%, #103783 100%)",
    logoBg: "#7D90B8",
    ...COLORED_SIDEBAR_TEXT,
  },
  sidebarcolorten: {
    bg: "linear-gradient(180deg, #8E4BEB 0%, #472282 100%)",
    logoBg: "#8E4BEB",
    ...COLORED_SIDEBAR_TEXT,
  },
  sidebarcoloreleven: {
    bg: "linear-gradient(180deg, #309F92 0%, #0C5666 100%)",
    logoBg: "#309F92",
    ...COLORED_SIDEBAR_TEXT,
  },
  sidebarcolortwelve: {
    bg: "linear-gradient(90deg, #FF9966 1.92%, #FF5E62 100%)",
    logoBg: "#FF9966",
    ...COLORED_SIDEBAR_TEXT,
  },
  sidebarcolorthirteen: {
    bg: "linear-gradient(90deg, #760762 1.92%, #883907 100%)",
    logoBg: "#760762",
    ...COLORED_SIDEBAR_TEXT,
  },
  sidebarcolorfourteen: {
    bg: "linear-gradient(90deg, #4471CC 1.92%, #AE7BD4 100%)",
    logoBg: "#4471CC",
    ...COLORED_SIDEBAR_TEXT,
  },
};

function swatchDisplayHex(css: string): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(css.trim())) return css.trim().toUpperCase();
  const match = css.match(/#[0-9A-Fa-f]{6}/i);
  return match?.[0]?.toUpperCase() ?? "#FFFFFF";
}

function paletteToChromePatch(
  palette: ChromeSkinPalette,
  mode: "light" | "dark",
): Partial<import("@/lib/theme-colors").ThemeColorsState> {
  const bgCss = palette.bg.includes("gradient") ? palette.bg : "";
  const bgHex = swatchDisplayHex(palette.bg);
  if (mode === "light") {
    return {
      lightChromeBg: bgHex,
      lightChromeBgCss: bgCss,
      lightChromeFg: palette.fg,
      lightChromeBorder: palette.border,
      lightChromeMuted: palette.muted,
      lightChromeActive: palette.activeFg,
      lightChromeLogoBg: palette.logoBg,
    };
  }
  return {
    darkChromeBg: bgHex,
    darkChromeBgCss: bgCss,
    darkChromeFg: palette.fg,
    darkChromeBorder: palette.border,
    darkChromeMuted: palette.muted,
    darkChromeActive: palette.activeFg,
    darkChromeLogoBg: palette.logoBg,
  };
}

export function sidebarSkinToSidebarId(topbarSkin: TopbarSkin): SidebarSkin {
  if (topbarSkin === "white") return "light";
  if (topbarSkin === "topbarcolorone") return "sidebarcolorone";
  return topbarSkin.replace("topbar", "sidebar") as SidebarSkin;
}

/** Map a layout skin to theme color store fields for the active color mode. */
export function getSidebarSkinChromePatch(
  skin: SidebarSkin,
  isDarkMode: boolean,
): Partial<import("@/lib/theme-colors").ThemeColorsState> {
  if (isDarkMode && isDefaultLightSidebar(skin)) {
    return paletteToChromePatch(
      {
        bg: DREAMSPOS_DARK_CHROME.bg,
        fg: DREAMSPOS_DARK_CHROME.fg,
        muted: DREAMSPOS_DARK_CHROME.muted,
        border: DREAMSPOS_DARK_CHROME.border,
        activeFg: DREAMSPOS_DARK_CHROME.activeFg,
        logoBg: DREAMSPOS_DARK_CHROME.logoBg,
      },
      "dark",
    );
  }
  return paletteToChromePatch(SIDEBAR_SKIN_PALETTES[skin], isDarkMode ? "dark" : "light");
}

export function getTopbarSkinChromePatch(
  skin: TopbarSkin,
  isDarkMode: boolean,
): Partial<import("@/lib/theme-colors").ThemeColorsState> {
  return getSidebarSkinChromePatch(sidebarSkinToSidebarId(skin), isDarkMode);
}

/** Solid + gradient sidebar swatches (from DreamsPOS variables). */
export const SIDEBAR_SKIN_SWATCHES: { id: SidebarSkin; label: string; css: string }[] = [
  { id: "light", label: "Light", css: "#F8FAFC" },
  { id: "sidebarcolorone", label: "Snow", css: "#FBFBFB" },
  { id: "sidebarcolortwo", label: "Slate", css: "#505969" },
  { id: "sidebarcolorthree", label: "Charcoal", css: "#2C2C2C" },
  { id: "sidebarcolorfour", label: "Blue", css: "#1D51B6" },
  { id: "sidebarcolorfive", label: "Purple", css: "#6C0BA9" },
  { id: "sidebarcolorsix", label: "Teal", css: "#0B897D" },
  { id: "sidebarcolorseven", label: "Navy grad", css: "linear-gradient(180deg, #4B749F 0%, #243748 100%)" },
  { id: "sidebarcoloreight", label: "Ocean grad", css: "linear-gradient(180deg, #18ACCF 0%, #0F59AD 100%)" },
  { id: "sidebarcolornine", label: "Steel grad", css: "linear-gradient(180deg, #7D90B8 0%, #103783 100%)" },
  { id: "sidebarcolorten", label: "Violet grad", css: "linear-gradient(180deg, #8E4BEB 0%, #472282 100%)" },
  { id: "sidebarcoloreleven", label: "Mint grad", css: "linear-gradient(180deg, #309F92 0%, #0C5666 100%)" },
  { id: "sidebarcolortwelve", label: "Sunset grad", css: "linear-gradient(90deg, #FF9966 1.92%, #FF5E62 100%)" },
  { id: "sidebarcolorthirteen", label: "Wine grad", css: "linear-gradient(90deg, #760762 1.92%, #883907 100%)" },
  { id: "sidebarcolorfourteen", label: "Lilac grad", css: "linear-gradient(90deg, #4471CC 1.92%, #AE7BD4 100%)" },
];

export const TOPBAR_SKIN_SWATCHES: { id: TopbarSkin; label: string; css: string }[] = [
  { id: "white", label: "White", css: "#FFFFFF" },
  ...SIDEBAR_SKIN_SWATCHES.filter((s) => s.id !== "light").map((s) => ({
    id: s.id.replace("sidebar", "topbar") as TopbarSkin,
    label: s.label,
    css: s.css,
  })),
];

export function isDarkSidebarSkin(skin: SidebarSkin): boolean {
  return skin !== "light" && skin !== "sidebarcolorone";
}

export function isDefaultLightTopbar(topbarSkin: TopbarSkin): boolean {
  return topbarSkin === "white" || topbarSkin === "topbarcolorone";
}

export function isDefaultLightSidebar(sidebarSkin: SidebarSkin): boolean {
  return sidebarSkin === "light" || sidebarSkin === "sidebarcolorone";
}

/** DreamsPOS dark chrome palette (sidebar + header). */
export const DREAMSPOS_DARK_CHROME = {
  bg: "#0d0d0d",
  fg: "#d8dfee",
  muted: "#6b7280",
  border: "#1f2228",
  hover: "rgba(255, 255, 255, 0.05)",
  activeBg: "rgba(254, 159, 67, 0.14)",
  activeFg: "#fe9f43",
  logoBg: "#141414",
} as const;

export function applyThemeLayout(state: ThemeLayoutState) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const body = document.body;

  root.dataset.layout = state.layout;
  root.dataset.width = state.width;
  root.dataset.sidebar = state.sidebarSkin;
  root.dataset.topbar = state.topbarSkin;

  if (state.width === "box") {
    body.classList.add("layout-boxed");
  } else {
    body.classList.remove("layout-boxed");
  }

  if (state.layout === "mini") {
    body.classList.add("mini-sidebar");
  } else {
    body.classList.remove("mini-sidebar");
  }
}

export function loadStoredThemeLayout(): ThemeLayoutState {
  if (typeof window === "undefined") return DEFAULT_THEME_LAYOUT;
  try {
    const raw = localStorage.getItem(THEME_LAYOUT_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_LAYOUT;
    const parsed = JSON.parse(raw) as Partial<ThemeLayoutState>;
    return { ...DEFAULT_THEME_LAYOUT, ...parsed };
  } catch {
    return DEFAULT_THEME_LAYOUT;
  }
}
