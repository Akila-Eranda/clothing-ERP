"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { POSOverlay } from "@/components/pos/pos-overlay";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { BranchProvider } from "@/components/branch/branch-provider";
import { useBranchStore } from "@/stores/branch-store";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const { sidebarMobileOpen, setMobileSidebarOpen } = useUIStore();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const branchRevision = useBranchStore((s) => s.branchRevision);
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (mounted && !isAuthenticated) {
      router.replace("/login");
    }
  }, [mounted, isAuthenticated, router]);

  if (!mounted || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      </div>
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
