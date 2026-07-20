"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { posCashierStorage } from "@/lib/pos-cashier";

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
      theme: "light",
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

      closePos: () => {
        posCashierStorage.clear();
        set({ posOpen: false });
      },
    }),
    {
      name: "fashion-erp-ui-v2",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
        posOpen: state.posOpen,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && !state.posOpen) posCashierStorage.clear();
      },
    }
  )
);
