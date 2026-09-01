"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { AccentId } from "@/lib/accent-theme";
import {
  applyThemeColors,
  clearThemeColorOverrides,
  DEFAULT_THEME_COLORS,
  type DarkAccentChoice,
  type ThemeColorsState,
  THEME_COLORS_STORAGE_KEY,
} from "@/lib/theme-colors";

type ThemeColorsStore = ThemeColorsState & {
  setLightAccent: (accent: AccentId) => void;
  setCustomLightAccent: (hex: string) => void;
  setDarkAccent: (accent: DarkAccentChoice) => void;
  setCustomDarkAccent: (hex: string) => void;
  setColor: <K extends keyof ThemeColorsState>(key: K, value: ThemeColorsState[K]) => void;
  reset: () => void;
  apply: () => void;
};

function commit(state: ThemeColorsState) {
  applyThemeColors(state);
}

export const useThemeColorsStore = create<ThemeColorsStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_THEME_COLORS,

      setLightAccent: (accent) => {
        set({ lightAccent: accent });
        commit(get());
      },

      setCustomLightAccent: (hex) => {
        set({ lightAccent: "custom", customLightAccent: hex });
        commit(get());
      },

      setDarkAccent: (accent) => {
        set({ darkAccent: accent });
        commit(get());
      },

      setCustomDarkAccent: (hex) => {
        set({ darkAccent: "custom", customDarkAccent: hex });
        commit(get());
      },

      setColor: (key, value) => {
        set((state) => {
          const next = { ...state, [key]: value } as ThemeColorsState;
          applyThemeColors(next);
          return next;
        });
      },

      reset: () => {
        clearThemeColorOverrides();
        set({ ...DEFAULT_THEME_COLORS });
        commit(DEFAULT_THEME_COLORS);
      },

      apply: () => {
        commit(get());
      },
    }),
    {
      name: THEME_COLORS_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) commit(state);
      },
    },
  ),
);
