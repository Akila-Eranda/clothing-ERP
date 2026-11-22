"use client";

import * as React from "react";
import { create } from "zustand";
import { api } from "@/lib/api";

const POLL_MS = 60_000;

interface UnreadStore {
  count: number;
  refresh: () => Promise<void>;
}

const useUnreadStore = create<UnreadStore>((set) => ({
  count: 0,
  refresh: async () => {
    try {
      // Server counts only the authenticated user's notifications within their tenant.
      const res = await api.get<number>("/notifications/unread-count");
      if (typeof res.data === "number") set({ count: res.data });
    } catch {
      /* badge is best-effort; keep the last known value */
    }
  },
}));

// One shared poller for every subscriber (header + all mounted sidebar instances).
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Live unread-notification count for the signed-in user.
 * Refreshes on mount, every 60s, and whenever `refreshKey` changes (e.g. the route).
 */
export function useUnreadNotifications(refreshKey?: string): number {
  const count = useUnreadStore((s) => s.count);
  const refresh = useUnreadStore((s) => s.refresh);

  React.useEffect(() => {
    subscribers += 1;
    if (!timer) timer = setInterval(() => void useUnreadStore.getState().refresh(), POLL_MS);
    return () => {
      subscribers -= 1;
      if (subscribers === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);

  return count;
}
