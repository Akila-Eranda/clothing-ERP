"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Bell, Search, Moon, Sun, Menu, RefreshCw, ChevronRight,
  Settings, User, LogOut, LifeBuoy, Keyboard, ShoppingCart,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuShortcut,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuthStore } from "@/stores/auth-store";
import { useUIStore } from "@/stores/ui-store";
import { BranchSwitcher } from "@/components/branch/branch-switcher";
import { getInitials } from "@/lib/utils";
import { DUMMY_RECENT_SALES } from "@/lib/constants";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";
import Link from "next/link";
import { APP_NAME } from "@/lib/constants";
import { AppLogo } from "@/components/brand/app-logo";
import { useMaintenanceStatus } from "@/components/maintenance/maintenance-banner";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog";
import { SupportDialog } from "@/components/layout/support-dialog";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function isModKey(e: KeyboardEvent): boolean {
  return e.metaKey || e.ctrlKey;
}

const BASE_ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/analytics": "Analytics",
  "/pos": "POS Terminal",
  "/sales": "Sales",
  "/returns": "Returns & Exchanges",
  "/products": "Products",
  "/categories": "Categories",
  "/brands": "Brands",
  "/inventory": "Stock Levels",
  "/inventory/ledger": "Inventory Ledger",
  "/inventory/abc": "ABC Analysis",
  "/inventory/dead-stock": "Dead Stock",
  "/inventory/aging": "Stock Aging",
  "/inventory/transfers": "Stock Transfers",
  "/inventory/expiry": "Expiry Dashboard",
  "/inventory/expiry/near": "Near Expiry",
  "/inventory/expiry/expired": "Expired",
  "/inventory/expiry/lots": "All Active Lots",
  "/inventory/expiry/transactions": "Batch Transactions",
  "/inventory/expiry/reconcile": "Reconciliation",
  "/customers": "Customers & CRM",
  "/suppliers": "Suppliers",
  "/purchases": "Purchase Orders",
  "/hr": "Employees",
  "/hr/attendance": "Attendance",
  "/hr/payroll": "Payroll",
  "/hr/leaves": "Leaves",
  "/accounting": "Overview",
  "/accounting/accounts": "Chart of Accounts",
  "/accounting/journals": "GL Journals",
  "/accounting/transactions": "GL Journals",
  "/accounting/banking": "Banking",
  "/accounting/reports": "Financial Reports",
  "/accounting/settings": "Settings",
  "/accounting/ar-ap": "AR / AP",
  "/accounting/cash-bank": "Cash & Bank",
  "/accounting/vat": "VAT / Tax",
  "/accounting/petty-cash": "Petty Cash",
  "/accounting/fixed-assets": "Fixed Assets",
  "/accounting/payroll": "Payroll",
  "/accounting/periods": "Financial Periods",
  "/accounting/audit": "Audit Trail",
  "/accounting/credit": "Credit Customers",
  "/accounting/credit/schedules": "Schedules",
  "/accounting/credit/reminders": "Reminders",
  "/accounting/credit/collections": "Collections",
  "/accounting/finance": "Finance Hub",
  "/accounting/finance/payable": "Payable",
  "/accounting/finance/receivable": "Receivable",
  "/accounting/finance/cash-book": "Cash Book",
  "/accounting/finance/banks": "Banks",
  "/accounting/finance/cheques": "Cheques",
  "/accounting/finance/reconciliation": "Reconciliation",
  "/expenses": "Expenses",
  "/branches": "Branches",
  "/reports": "Reports Overview",
  "/reports/sales": "Sales Reports",
  "/reports/purchases": "Purchase Reports",
  "/reports/inventory": "Inventory Reports",
  "/reports/suppliers": "Supplier Reports",
  "/reports/customers": "Customer Reports",
  "/reports/cashier": "Cashier Reports",
  "/reports/branches": "Branch Reports",
  "/reports/tax": "Tax Reports",
  "/reports/expiry": "Expiry Reports",
  "/reports/cheques": "Cheque Reports",
  "/reports/commission": "Commission Reports",
  "/reports/financial": "Financial Reports",
  "/promotions": "Promotions & Offers",
  "/notifications": "Notifications",
  "/settings": "Settings",
  "/users": "Users & Roles",
  "/vehicles": "Vehicle Compatibility",
  "/warranty": "Warranty Claims",
  "/quotations": "Quotations",
};

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const { user, logoutApi } = useAuthStore();
  const { toggleMobileSidebar, openPos } = useUIStore();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const { status: maintenance, isMaintenance } = useMaintenanceStatus(60_000);
  const { profile, workspace } = useShopWorkspace();
  const routeLabels = React.useMemo(
    () => ({ ...BASE_ROUTE_LABELS, ...getRouteLabels(workspace, profile) }),
    [workspace, profile],
  );

  const handleLogout = React.useCallback(async () => {
    await logoutApi();
    router.replace("/login");
  }, [logoutApi, router]);

  const goProfile = React.useCallback(() => {
    router.push("/settings?tab=profile");
  }, [router]);

  const goSettings = React.useCallback(() => {
    router.push("/settings");
  }, [router]);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;

      if (isModKey(e) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        goProfile();
        return;
      }
      if (isModKey(e) && e.key === ",") {
        e.preventDefault();
        goSettings();
        return;
      }
      if (isModKey(e) && e.shiftKey && e.key.toLowerCase() === "q") {
        e.preventDefault();
        void handleLogout();
        return;
      }
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goProfile, goSettings, handleLogout]);

  const pageTitle = routeLabels[pathname] || APP_NAME;
  const breadcrumbs = pathname.split("/").filter(Boolean);

  const crumbLabel = (index: number) => {
    const fullPath = "/" + breadcrumbs.slice(0, index + 1).join("/");
    const crumb = breadcrumbs[index];
    return routeLabels[fullPath]
      || routeLabels["/" + crumb]
      || crumb.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-4 border-b border-[#D8DEE9]/80 dark:border-border bg-[rgba(228,234,243,0.82)] dark:bg-background/80 backdrop-blur-[12px] px-6 shrink-0">
      {/* Mobile menu toggle */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="lg:hidden"
        onClick={toggleMobileSidebar}
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
        <Link href="/dashboard" className="shrink-0 hidden sm:block">
          <AppLogo variant="sidebar" theme="auto" />
        </Link>
        {breadcrumbs.map((crumb, i) => (
          <React.Fragment key={`${crumb}-${i}`}>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 hidden sm:block shrink-0" />
            <span
              className={
                i === breadcrumbs.length - 1
                  ? "font-semibold text-foreground truncate"
                  : "text-muted-foreground hidden sm:block truncate"
              }
            >
              {crumbLabel(i)}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Branch switcher — always visible when branches exist */}
      <BranchSwitcher />

      {/* Search */}
      <div className="hidden md:flex items-center">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search products, customers..."
            className="w-64 pl-8 h-10 text-sm bg-card/90 dark:bg-muted/50 border-border shadow-sm rounded-[10px]"
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none hidden h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex text-muted-foreground">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {/* POS button */}
        <Button
          onClick={openPos}
          size="sm"
          className="h-9 gap-1.5 text-xs font-semibold gradient-primary text-white border-0 hover:opacity-90 shadow-button"
        >
          <ShoppingCart className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">POS Terminal</span>
        </Button>

        {/* Live indicator */}
        <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-500">Live</span>
        </div>

        {/* Theme toggle */}
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="h-9 w-9 rounded-[10px] hover:bg-[#F3F6FC] dark:hover:bg-accent"
        >
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>

        {/* Refresh */}
        <Button variant="ghost" size="icon-sm" className="h-9 w-9 rounded-[10px] hover:bg-[#F3F6FC] dark:hover:bg-accent" onClick={() => router.refresh()}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="h-9 w-9 relative rounded-[10px] hover:bg-[#F3F6FC] dark:hover:bg-accent">
              <Bell className="h-4 w-4" />
              {(isMaintenance || 4 > 0) && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
                  {isMaintenance ? '!' : '4'}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              {isMaintenance && (
                <Badge variant="destructive" className="text-[10px] h-5">Maintenance</Badge>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {isMaintenance && maintenance && (
              <DropdownMenuItem className="flex flex-col items-start gap-1 py-3 cursor-default bg-amber-50/80 focus:bg-amber-50">
                <div className="flex items-center gap-2 w-full">
                  <span className="text-sm font-semibold text-amber-900">Maintenance Mode ON</span>
                  <span className="text-[10px] text-amber-600 ml-auto">Now</span>
                </div>
                <span className="text-xs text-amber-800 leading-relaxed">{maintenance.message}</span>
              </DropdownMenuItem>
            )}
            {[
              { title: "Low stock alert", desc: "Running Sports Shoes (Size 9) — 2 left", time: "2m ago", type: "warning" },
              { title: "New order received", desc: "INV-0891 — LKR 12,500 via UPI", time: "15m ago", type: "success" },
              { title: "Payment overdue", desc: "Supplier: DenimCo — LKR 85,000", time: "1h ago", type: "danger" },
              { title: "Birthday campaign sent", desc: "32 customers notified via WhatsApp", time: "3h ago", type: "info" },
            ].map((n, i) => (
              <DropdownMenuItem key={i} className="flex flex-col items-start gap-0.5 py-3 cursor-pointer">
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-medium">{n.title}</span>
                  <span className="text-[10px] text-muted-foreground">{n.time}</span>
                </div>
                <span className="text-xs text-muted-foreground">{n.desc}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="justify-center text-primary text-sm" onSelect={() => router.push("/notifications")}>
              View all notifications
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 gap-2 px-2 hover:bg-accent">
              <Avatar className="h-6 w-6">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-[10px]">
                  {getInitials(user?.name || "U")}
                </AvatarFallback>
              </Avatar>
              <span className="hidden sm:block text-sm font-medium max-w-[120px] truncate">
                {user?.name || "Admin"}
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={goProfile}>
              <User className="mr-2 h-4 w-4" />
              <span>Profile</span>
              <DropdownMenuShortcut>⇧⌘P</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={goSettings}>
              <Settings className="mr-2 h-4 w-4" />
              <span>Settings</span>
              <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShortcutsOpen(true)}>
              <Keyboard className="mr-2 h-4 w-4" />
              <span>Keyboard shortcuts</span>
              <DropdownMenuShortcut>?</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setSupportOpen(true)}>
              <LifeBuoy className="mr-2 h-4 w-4" />
              <span>Support</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => { void handleLogout(); }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Sign out</span>
              <DropdownMenuShortcut>⇧⌘Q</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
}
