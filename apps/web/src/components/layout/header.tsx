"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell, Search, Moon, Sun, Menu, RefreshCw, ChevronRight,
  Settings, User, LogOut, LifeBuoy, Keyboard, Monitor,
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
import { cn, getInitials } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getRouteLabels } from "@/lib/shop-vertical";
import { APP_NAME } from "@/lib/constants";
import { AppLogo } from "@/components/brand/app-logo";
import { useMaintenanceStatus } from "@/components/maintenance/maintenance-banner";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog";
import { SupportDialog } from "@/components/layout/support-dialog";
import { DREAMSPOS_DARK_CHROME, isDefaultLightTopbar } from "@/lib/theme-layout";
import { useThemeLayoutStore } from "@/stores/theme-layout-store";

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
  "/purchases/grn": "Goods Receipt (GRN)",
  "/purchases/procurement": "Procurement Hub",
  "/purchases/supplier-payments": "Supplier Payments",
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
  const { theme, resolvedTheme, setTheme } = useTheme();
  const { user, logoutApi } = useAuthStore();
  const { toggleMobileSidebar, openPos } = useUIStore();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const { status: maintenance, isMaintenance } = useMaintenanceStatus(60_000);
  const { profile, workspace } = useShopWorkspace();
  const isDarkHeader = resolvedTheme === "dark";
  const topbarSkin = useThemeLayoutStore((s) => s.topbarSkin);
  const dreamsDarkHeader = isDarkHeader && isDefaultLightTopbar(topbarSkin);
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

  const currentTitle = breadcrumbs.length > 0
    ? crumbLabel(breadcrumbs.length - 1)
    : pageTitle;

  return (
    <header
      className={cn(
        "hex-retail-header sticky top-0 z-40 flex h-[60px] items-center gap-2 border-b backdrop-blur-[12px] px-3 md:px-5 shrink-0",
        dreamsDarkHeader && "hex-retail-header--dreams-dark",
      )}
      style={{
        background: dreamsDarkHeader
          ? DREAMSPOS_DARK_CHROME.bg
          : isDarkHeader
            ? "var(--retail-topbar-bg, #0d0d0d)"
            : "var(--retail-topbar-bg, hsl(var(--background) / 0.98))",
        color: dreamsDarkHeader
          ? DREAMSPOS_DARK_CHROME.fg
          : "var(--retail-topbar-fg, hsl(var(--foreground)))",
        borderColor: dreamsDarkHeader
          ? DREAMSPOS_DARK_CHROME.border
          : "var(--retail-topbar-border, hsl(var(--border)))",
      }}
    >
      {/* ── Left: menu + page context ── */}
      <div className="hex-header-start flex min-w-0 items-center gap-2 md:gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="hex-header-icon-btn lg:hidden shrink-0"
          onClick={toggleMobileSidebar}
        >
          <Menu className="h-4 w-4" />
        </Button>

        <nav className="hex-header-breadcrumb min-w-0" aria-label="Breadcrumb">
          {breadcrumbs.length > 1 && (
            <ol className="hidden md:flex items-center gap-1 text-[11px] text-muted-foreground mb-0.5">
              {breadcrumbs.slice(0, -1).map((crumb, i) => {
                const href = "/" + breadcrumbs.slice(0, i + 1).join("/");
                return (
                  <li key={href} className="flex items-center gap-1 min-w-0">
                    {i > 0 && <ChevronRight className="h-3 w-3 shrink-0 opacity-40" />}
                    <Link href={href} className="truncate hover:text-foreground transition-colors">
                      {crumbLabel(i)}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
          <div className="flex items-center gap-2 min-w-0">
            <Link href="/dashboard" className="shrink-0 hidden lg:block opacity-90 hover:opacity-100">
              <AppLogo variant="sidebar" theme="auto" />
            </Link>
            <h1 className="hex-header-title truncate text-[15px] font-semibold leading-tight text-foreground md:text-base">
              {currentTitle}
            </h1>
          </div>
        </nav>
      </div>

      {/* ── Center: search ── */}
      <div className="hex-header-center hidden flex-1 justify-center px-2 md:flex max-w-xl mx-auto">
        <div className="hex-header-search relative w-full max-w-[420px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70 pointer-events-none" />
          <Input
            placeholder="Search products, customers..."
            className="hex-header-search-input h-10 w-full rounded-[5px] border bg-muted/40 pl-10 pr-14 text-sm shadow-none focus-visible:ring-1 focus-visible:ring-[#fe9f43]/40"
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setSearchOpen(false)}
          />
          <kbd className="hex-header-kbd pointer-events-none absolute right-2.5 top-1/2 hidden h-6 -translate-y-1/2 select-none items-center rounded border border-border/80 bg-background/80 px-1.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* ── Right: branch, POS, tools, user ── */}
      <div className="hex-header-end flex shrink-0 items-center gap-2 md:gap-2.5 ml-auto">
        <BranchSwitcher />

        <span className="hex-header-divider hidden sm:block" aria-hidden />

        <Button
          onClick={openPos}
          variant="pos"
          size="sm"
          className="hex-header-pos h-9 gap-1.5 rounded-[5px] px-3.5 text-xs font-semibold shadow-none"
        >
          <Monitor className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">POS</span>
        </Button>

        <div className="hex-header-live hidden lg:flex items-center gap-1.5 rounded-[5px] border border-emerald-200/80 bg-emerald-50 px-2.5 py-1.5 dark:border-emerald-500/25 dark:bg-emerald-500/10">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">Live</span>
        </div>

        <span className="hex-header-divider hidden md:block" aria-hidden />

        <div className="hex-header-tools flex items-center gap-0.5 rounded-[5px] border border-border/80 bg-muted/20 p-0.5 dark:bg-white/[0.04]">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="hex-header-icon-btn h-8 w-8 rounded-[4px]"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            <span className="sr-only">Toggle theme</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hex-header-icon-btn h-8 w-8 rounded-[4px] hidden sm:inline-flex"
            onClick={() => router.refresh()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="hex-header-icon-btn relative h-8 w-8 rounded-[4px]">
                <Bell className="h-4 w-4" />
                {(isMaintenance || 4 > 0) && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#fe9f43] px-0.5 text-[9px] font-bold text-white">
                    {isMaintenance ? "!" : "4"}
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
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="hex-header-user h-9 gap-2 rounded-[5px] border border-[#092c4c] bg-[#092c4c] px-2.5 text-white hover:bg-[#0a3558] hover:text-white dark:border-[#092c4c]">
              <Avatar className="h-7 w-7 ring-1 ring-white/20">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="bg-[#fe9f43] text-[10px] font-bold text-white">
                  {getInitials(user?.name || "U")}
                </AvatarFallback>
              </Avatar>
              <span className="hidden max-w-[110px] truncate text-xs font-semibold md:block">
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
