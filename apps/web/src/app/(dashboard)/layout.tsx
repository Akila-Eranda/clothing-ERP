"use client";

import { PosErrorBoundary } from "@/components/pos/pos-error-boundary";
import { LoadingScreen } from "@/components/ui/loading";
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
import { PlatformAnnouncementsBanner } from "@/components/announcements/platform-announcements-banner";
import { ThemeCustomizer } from "@/components/layout/theme-customizer";
import { ThemeLayoutApplier } from "@/components/layout/theme-layout-applier";

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

  // Mobile drawer: lock background scroll, close on Escape or when resized up to tablet/desktop.
  React.useEffect(() => {
    if (!sidebarMobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileSidebarOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onResize);
    };
  }, [sidebarMobileOpen, setMobileSidebarOpen]);

  // Drawer a11y: move focus in, trap Tab inside, and give focus back to the opener on close.
  const drawerRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!sidebarMobileOpen) return;
    const opener = document.activeElement as HTMLElement | null;
    const raf = requestAnimationFrame(() =>
      drawerRef.current?.querySelector<HTMLElement>('[aria-label="Close menu"]')?.focus(),
    );
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const root = drawerRef.current;
      if (!root) return;
      const items = Array.from(
        root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.closest("[inert]") && el.getClientRects().length > 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !root.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onTab);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onTab);
      if (opener?.isConnected) opener.focus();
    };
  }, [sidebarMobileOpen]);

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
      <LoadingScreen />
    );
  }

  if (!isAuthenticated && !hasStoredSession) {
    return (
      <LoadingScreen />
    );
  }

  if (posOnly) {
    return (
      <BranchProvider>
        <MaintenanceBanner />
        <div className="px-3 pt-2">
          <PlatformAnnouncementsBanner />
        </div>
        <PosErrorBoundary>
          <POSOverlay key={`pos-${activeBranchId ?? "none"}-${branchRevision}`} posOnly />
        </PosErrorBoundary>
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
      <ThemeLayoutApplier />
      <div className="dashboard-shell flex h-screen overflow-hidden bg-background">
        {/* Desktop sidebar (expanded / collapsed) */}
        <div className="hidden lg:flex">
          <Sidebar />
        </div>

        {/* Tablet: compact icon rail */}
        <div className="hidden md:flex lg:hidden">
          <Sidebar forceCollapsed />
        </div>

        {/* Mobile: off-canvas drawer */}
        {sidebarMobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
            <div
              className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200 motion-reduce:animate-none"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
            <div ref={drawerRef} className="relative h-full w-fit shadow-2xl animate-in slide-in-from-left duration-200 motion-reduce:animate-none">
              <Sidebar mobile />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex flex-1 flex-col overflow-hidden min-w-0">
          <Header />
          <MaintenanceBanner />
          <div className="px-4 pt-3 lg:px-6">
            <PlatformAnnouncementsBanner />
          </div>
            <main className="flex-1 overflow-y-auto">
            <div className="min-h-full" key={`${activeBranchId ?? "none"}-${branchRevision}`}>
              {children}
            </div>
          </main>
        </div>

        {/* POS full-screen overlay — remount when branch changes */}
        <PosErrorBoundary>
          <POSOverlay key={`pos-${activeBranchId ?? "none"}-${branchRevision}`} />
        </PosErrorBoundary>
        <ThemeCustomizer />
      </div>
    </BranchProvider>
  );
}
