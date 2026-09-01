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
