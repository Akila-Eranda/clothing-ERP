"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { BranchProvider } from "@/components/branch/branch-provider";
import { useBranchStore } from "@/stores/branch-store";
import { isPosOnlyRole } from "@/lib/role-access";
import { PosOnlyLanding } from "@/components/pos/pos-only-landing";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { MaintenanceBanner } from "@/components/maintenance/maintenance-banner";

const POSOverlay = dynamic(
  () => import("@/components/pos/pos-overlay").then((m) => m.POSOverlay),
  { ssr: false },
);

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, user, logoutApi } = useAuthStore();
  const { sidebarMobileOpen, setMobileSidebarOpen, posOpen, openPos } = useUIStore();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const branchRevision = useBranchStore((s) => s.branchRevision);
  const { settings: receiptSettings } = useReceiptSettings();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const posOnly = isPosOnlyRole(user?.role);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, router]);

  React.useEffect(() => {
    if (mounted && isAuthenticated && posOnly) {
      openPos();
    }
  }, [mounted, isAuthenticated, posOnly, openPos]);

  const handlePosOnlyLogout = React.useCallback(async () => {
    await logoutApi();
    router.replace("/login");
  }, [logoutApi, router]);

  // Show shell immediately when a session token exists (persist rehydrates from localStorage).
  const hasStoredSession =
    mounted &&
    typeof window !== "undefined" &&
    !!localStorage.getItem("fe_access_token");

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated && !hasStoredSession) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
    );
  }

  if (posOnly) {
    return (
      <BranchProvider>
        <MaintenanceBanner />
        <POSOverlay key={`pos-${activeBranchId ?? "none"}-${branchRevision}`} posOnly />
        {!posOpen && (
          <PosOnlyLanding
            shopLabel={receiptSettings.shopName || undefined}
            onOpenPos={openPos}
            onLogout={handlePosOnlyLogout}
          />
        )}
      </BranchProvider>
    );
  }

  return (
    <BranchProvider>
      <div className="flex h-screen overflow-hidden bg-white dark:bg-background">
        {/* Desktop Sidebar */}
        <div className="hidden lg:flex">
          <Sidebar />
        </div>

        {/* Mobile sidebar overlay */}
        {sidebarMobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <div className="relative h-full w-fit shadow-2xl">
              <Sidebar />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header />
          <MaintenanceBanner />
          <main className="flex-1 overflow-y-auto">
            <div className="h-full" key={`${activeBranchId ?? "none"}-${branchRevision}`}>
              {children}
            </div>
          </main>
        </div>

        {/* POS full-screen overlay — remount when branch changes */}
        <POSOverlay key={`pos-${activeBranchId ?? "none"}-${branchRevision}`} />
      </div>
    </BranchProvider>
  );
}
