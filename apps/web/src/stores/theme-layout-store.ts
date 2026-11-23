"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  applyThemeLayout,
  isDefaultLightSidebar,
  DEFAULT_THEME_LAYOUT,
  getSidebarSkinChromePatch,
  type LayoutMode,
  type LayoutWidth,
  type SidebarSkin,
  type ThemeLayoutState,
  type TopbarSkin,
} from "@/lib/theme-layout";
import { contrastRatio, hexToRgb } from "@/lib/wcag";
import { DEFAULT_THEME_COLORS, type ThemeColorsState } from "@/lib/theme-colors";
import { useThemeColorsStore } from "@/stores/theme-colors-store";

function isDarkDocument() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

/**
 * The default light sidebar reads the stored light chrome colours. Those fields are overwritten whenever a coloured
 * sidebar skin is picked, so a previous coloured skin (white text, gradient) must not leak into the default skin.
 * Gradient CSS and white text never come from the Colors tab, so they identify leaked skin palettes.
 */
function lightChromeIsLeakedSkin(c: ThemeColorsState): boolean {
  if (c.lightChromeBgCss?.trim()) return true;
  try {
    return contrastRatio(hexToRgb(c.lightChromeFg), hexToRgb(c.lightChromeBg)) < 3; // unreadable combination
  } catch {
    return false;
  }
}

const DEFAULT_LIGHT_CHROME: Partial<ThemeColorsState> = {
  lightChromeBg: DEFAULT_THEME_COLORS.lightChromeBg,
  lightChromeBgCss: DEFAULT_THEME_COLORS.lightChromeBgCss,
  lightChromeFg: DEFAULT_THEME_COLORS.lightChromeFg,
  lightChromeBorder: DEFAULT_THEME_COLORS.lightChromeBorder,
  lightChromeMuted: DEFAULT_THEME_COLORS.lightChromeMuted,
  lightChromeActive: DEFAULT_THEME_COLORS.lightChromeActive,
  lightChromeLogoBg: DEFAULT_THEME_COLORS.lightChromeLogoBg,
};

function syncChromeFromSidebarSkin(sidebarSkin: SidebarSkin, leftColouredSkin = false) {
  const patch = getSidebarSkinChromePatch(sidebarSkin, isDarkDocument());
  const colors = useThemeColorsStore.getState();
  if (Object.keys(patch).length > 0) {
    colors.patchColors(patch);
  } else if (leftColouredSkin || lightChromeIsLeakedSkin(colors)) {
    colors.patchColors(DEFAULT_LIGHT_CHROME);
  } else {
    colors.apply();
  }
}

/** The topbar resolves its own palette from its skin (see resolveTopbarChrome); it must never overwrite sidebar chrome. */
function syncChromeFromTopbarSkin() {
  useThemeColorsStore.getState().apply();
}

interface ThemeLayoutStore extends ThemeLayoutState {
  setLayout: (layout: LayoutMode) => void;
  setWidth: (width: LayoutWidth) => void;
  setSidebarSkin: (sidebarSkin: SidebarSkin) => void;
  setTopbarSkin: (topbarSkin: TopbarSkin) => void;
  reset: () => void;
  apply: () => void;
}

export const useThemeLayoutStore = create<ThemeLayoutStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_THEME_LAYOUT,

      setLayout: (layout) => {
        set({ layout });
        applyThemeLayout({ ...get(), layout });
      },

      setWidth: (width) => {
        set({ width });
        applyThemeLayout({ ...get(), width });
      },

      setSidebarSkin: (sidebarSkin) => {
        const previous = get().sidebarSkin;
        set({ sidebarSkin });
        applyThemeLayout({ ...get(), sidebarSkin });
        syncChromeFromSidebarSkin(sidebarSkin, !isDefaultLightSidebar(previous));
      },

      setTopbarSkin: (topbarSkin) => {
        set({ topbarSkin });
        applyThemeLayout({ ...get(), topbarSkin });
        syncChromeFromTopbarSkin();
      },

      reset: () => {
        set({ ...DEFAULT_THEME_LAYOUT });
        applyThemeLayout(DEFAULT_THEME_LAYOUT);
        syncChromeFromSidebarSkin(DEFAULT_THEME_LAYOUT.sidebarSkin);
      },

      apply: () => {
        const state = get();
        applyThemeLayout(state);
        syncChromeFromSidebarSkin(state.sidebarSkin);
      },
    }),
    {
      name: "hexalyte-theme-layout-v1",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyThemeLayout(state);
          syncChromeFromSidebarSkin(state.sidebarSkin);
        }
      },
    },
  ),
);
