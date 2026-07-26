"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { clearPosCounterId } from "@/lib/pos-counter";
import { posCashierStorage } from "@/lib/pos-cashier";

const BRANCH_KEY = "fe_active_branch";

interface BranchStore {
  activeBranchId: string | null;
  activeBranchName: string | null;
  branchRevision: number;
  setBranch: (id: string | null, name?: string | null) => void;
  clearBranch: () => void;
}

export const useBranchStore = create<BranchStore>()(
  persist(
    (set, get) => ({
      activeBranchId: null,
      activeBranchName: null,
      branchRevision: 0,
      setBranch: (id, name = null) => {
        const prev = get().activeBranchId;
        const changed = id !== prev;
        if (typeof window !== "undefined") {
          if (id) localStorage.setItem(BRANCH_KEY, id);
          else localStorage.removeItem(BRANCH_KEY);
          // Counter IDs are branch-scoped — clear when switching branches.
          if (changed) {
            clearPosCounterId();
            posCashierStorage.clear();
          }
        }
        set((state) => ({
          activeBranchId: id,
          activeBranchName: name,
          branchRevision: changed ? state.branchRevision + 1 : state.branchRevision,
        }));
      },
      clearBranch: () => {
        if (typeof window !== "undefined") {
          localStorage.removeItem(BRANCH_KEY);
          clearPosCounterId();
          posCashierStorage.clear();
        }
        set({ activeBranchId: null, activeBranchName: null, branchRevision: 0 });
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
