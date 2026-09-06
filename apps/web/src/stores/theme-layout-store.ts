"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  applyThemeLayout,
  DEFAULT_THEME_LAYOUT,
  getSidebarSkinChromePatch,
  getTopbarSkinChromePatch,
  type LayoutMode,
  type LayoutWidth,
  type SidebarSkin,
  type ThemeLayoutState,
  type TopbarSkin,
} from "@/lib/theme-layout";
import { useThemeColorsStore } from "@/stores/theme-colors-store";

function isDarkDocument() {
  if (typeof document === "undefined") return false;
  return document.documentElement.classList.contains("dark");
}

function syncChromeFromSidebarSkin(sidebarSkin: SidebarSkin) {
  const patch = getSidebarSkinChromePatch(sidebarSkin, isDarkDocument());
  if (Object.keys(patch).length > 0) {
    useThemeColorsStore.getState().patchColors(patch);
  } else {
    useThemeColorsStore.getState().apply();
  }
}

function syncChromeFromTopbarSkin(topbarSkin: TopbarSkin) {
  const patch = getTopbarSkinChromePatch(topbarSkin, isDarkDocument());
  if (Object.keys(patch).length > 0) {
    useThemeColorsStore.getState().patchColors(patch);
  } else {
    useThemeColorsStore.getState().apply();
  }
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
        set({ sidebarSkin });
        applyThemeLayout({ ...get(), sidebarSkin });
        syncChromeFromSidebarSkin(sidebarSkin);
      },

      setTopbarSkin: (topbarSkin) => {
        set({ topbarSkin });
        applyThemeLayout({ ...get(), topbarSkin });
        syncChromeFromTopbarSkin(topbarSkin);
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
