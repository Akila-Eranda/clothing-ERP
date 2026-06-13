"use client";

import * as React from "react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { getStoredBranchId, useBranchStore } from "@/stores/branch-store";

export interface BranchOption {
  id: string;
  name: string;
  code: string;
  isDefault?: boolean;
  isActive?: boolean;
}

interface BranchContextValue {
  branches: BranchOption[];
  ready: boolean;
}

const BranchContext = React.createContext<BranchContextValue>({
  branches: [],
  ready: false,
});

export function useBranchContext() {
  return React.useContext(BranchContext);
}

function pickDefaultBranch(
  list: BranchOption[],
  userBranchId?: string,
): BranchOption | null {
  if (list.length === 0) return null;

  const storedId = getStoredBranchId();
  if (storedId) {
    const stored = list.find((b) => b.id === storedId);
    if (stored) return stored;
  }

  if (userBranchId) {
    const assigned = list.find((b) => b.id === userBranchId);
    if (assigned) return assigned;
  }

  return list.find((b) => b.isDefault) ?? list[0];
}

export function BranchProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuthStore();
  const { setBranch, activeBranchId } = useBranchStore();
  const [branches, setBranches] = React.useState<BranchOption[]>([]);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;

    // Use cached branch immediately so pages can fetch data without waiting on /branches.
    const cachedId = getStoredBranchId() ?? activeBranchId ?? user?.branchId ?? null;
    if (cachedId && !activeBranchId) {
      setBranch(cachedId, useBranchStore.getState().activeBranchName);
    }
    setReady(true);

    api
      .get<{ data: BranchOption[] }>("/branches?limit=50")
      .then((r) => {
        if (cancelled) return;
        const raw = r.data?.data ?? (Array.isArray(r.data) ? r.data : []);
        const list = (Array.isArray(raw) ? raw : []).filter(
          (b) => b.isActive !== false,
        );
        setBranches(list);

        const currentId =
          getStoredBranchId() ??
          useBranchStore.getState().activeBranchId ??
          user?.branchId ??
          null;
        const currentValid = currentId && list.some((b) => b.id === currentId);

        if (currentValid) {
          const current = list.find((b) => b.id === currentId)!;
          if (useBranchStore.getState().activeBranchName !== current.name) {
            setBranch(current.id, current.name);
          }
          return;
        }

        const chosen = pickDefaultBranch(list, user?.branchId);
        if (chosen) setBranch(chosen.id, chosen.name);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [user?.branchId, setBranch, activeBranchId]);

  return (
    <BranchContext.Provider value={{ branches, ready }}>
      {children}
    </BranchContext.Provider>
  );
}
