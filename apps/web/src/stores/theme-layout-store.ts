"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  applyThemeLayout,
  DEFAULT_THEME_LAYOUT,
  type LayoutMode,
  type LayoutWidth,
  type SidebarSkin,
  type ThemeLayoutState,
  type TopbarSkin,
} from "@/lib/theme-layout";
import { useThemeColorsStore } from "@/stores/theme-colors-store";

function refreshChromeColors() {
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
        set({ sidebarSkin });
        applyThemeLayout({ ...get(), sidebarSkin });
        refreshChromeColors();
      },

      setTopbarSkin: (topbarSkin) => {
        set({ topbarSkin });
        applyThemeLayout({ ...get(), topbarSkin });
        refreshChromeColors();
      },

      reset: () => {
        set({ ...DEFAULT_THEME_LAYOUT });
        applyThemeLayout(DEFAULT_THEME_LAYOUT);
      },

      apply: () => {
        applyThemeLayout(get());
      },
    }),
    {
      name: "hexalyte-theme-layout-v1",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) applyThemeLayout(state);
      },
    },
  ),
);
