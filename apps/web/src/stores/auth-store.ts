"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { User } from "@/types";
import { authApi, api, tokenStorage } from "@/lib/api";
import { setStoredShopType, ShopType } from "@/lib/shop-profiles";

interface AuthStore {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (user: User, accessToken: string, refreshToken: string) => void;
  logout: () => void;
  loginWithApi: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logoutApi: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  setLoading: (loading: boolean) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,

      login: (user, accessToken, refreshToken) => {
        tokenStorage.setAccess(accessToken);
        tokenStorage.setRefresh(refreshToken);
        set({ user, accessToken, refreshToken, isAuthenticated: true });
      },

      logout: () => {
        tokenStorage.clear();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      loginWithApi: async (email, password, tenantSlug) => {
        set({ isLoading: true });
        try {
          const res = await authApi.login(email, password, tenantSlug);
          const { accessToken, refreshToken, user: apiUser } = res.data;
          tokenStorage.setAccess(accessToken);
          tokenStorage.setRefresh(refreshToken);
          tokenStorage.setTenant(apiUser.tenantId);
          const user: User = {
            id: apiUser.id,
            name: `${apiUser.firstName} ${apiUser.lastName}`,
            email: apiUser.email,
            role: (apiUser.roles?.[0] ?? 'cashier') as any,
            permissions: [],
            isActive: true,
            twoFactorEnabled: false,
            branchId: apiUser.branchId ?? undefined,
            createdAt: new Date(),
          };
          set({ user, accessToken, refreshToken, isAuthenticated: true, isLoading: false });
          try {
            const tenantRes = await api.get<{ shopType?: ShopType }>('/tenants/me');
            if (tenantRes.data?.shopType) setStoredShopType(tenantRes.data.shopType);
          } catch { /* tenant profile optional on first paint */ }
        } catch (e) {
          set({ isLoading: false });
          throw e;
        }
      },

      logoutApi: async () => {
        try { await authApi.logout(); } catch {}
        tokenStorage.clear();
        set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
      },

      updateUser: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),

      setLoading: (isLoading) => set({ isLoading }),

      setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),
    }),
    {
      name: "fashion-erp-auth",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Mock user for demo purposes
export const DEMO_USER: User = {
  id: "usr_1",
  name: "Arjun Mehta",
  email: "arjun@fashionerp.com",
  phone: "+91 98765 43210",
  role: "admin",
  permissions: ["*"],
  isActive: true,
  twoFactorEnabled: false,
  lastLogin: new Date(),
  createdAt: new Date("2024-01-01"),
  branch: {
    id: "br_1",
    tenantId: "ten_1",
    name: "Main Store - Mumbai",
    code: "MUM-001",
    address: "123, Fashion Street",
    city: "Mumbai",
    state: "Maharashtra",
    phone: "+91 22 1234 5678",
    isActive: true,
    createdAt: new Date("2024-01-01"),
  },
};
