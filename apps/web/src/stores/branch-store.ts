"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const BRANCH_KEY = "fe_active_branch";

interface BranchStore {
  activeBranchId: string | null;
  activeBranchName: string | null;
  setBranch: (id: string | null, name?: string | null) => void;
  clearBranch: () => void;
}

export const useBranchStore = create<BranchStore>()(
  persist(
    (set) => ({
      activeBranchId: null,
      activeBranchName: null,
      setBranch: (id, name = null) => {
        if (typeof window !== "undefined") {
          if (id) localStorage.setItem(BRANCH_KEY, id);
          else localStorage.removeItem(BRANCH_KEY);
        }
        set({ activeBranchId: id, activeBranchName: name });
      },
      clearBranch: () => {
        if (typeof window !== "undefined") localStorage.removeItem(BRANCH_KEY);
        set({ activeBranchId: null, activeBranchName: null });
      },
    }),
    {
      name: "fe-branch-context",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ activeBranchId: s.activeBranchId, activeBranchName: s.activeBranchName }),
    },
  ),
);

export function getStoredBranchId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(BRANCH_KEY);
}
