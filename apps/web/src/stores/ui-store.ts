"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

interface UIStore {
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  theme: "light" | "dark" | "system";
  commandOpen: boolean;
  activeModal: string | null;
  posOpen: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleMobileSidebar: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setCommandOpen: (open: boolean) => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  openPos: () => void;
  closePos: () => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      theme: "dark",
      commandOpen: false,
      activeModal: null,
      posOpen: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

      toggleMobileSidebar: () =>
        set((state) => ({ sidebarMobileOpen: !state.sidebarMobileOpen })),

      setMobileSidebarOpen: (sidebarMobileOpen) => set({ sidebarMobileOpen }),

      setTheme: (theme) => set({ theme }),

      setCommandOpen: (commandOpen) => set({ commandOpen }),

      openModal: (activeModal) => set({ activeModal }),

      closeModal: () => set({ activeModal: null }),

      openPos: () => set({ posOpen: true }),

      closePos: () => set({ posOpen: false }),
    }),
    {
      name: "fashion-erp-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    }
  )
);
