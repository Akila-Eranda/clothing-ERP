"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell, Search, Moon, Sun, Menu, RefreshCw, ChevronRight,
  Settings, User, LogOut, LifeBuoy, Keyboard, Monitor, Home,
} from "lucide-react";
import { useTheme } from "next-themes";
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
import { useMaintenanceStatus } from "@/components/maintenance/maintenance-banner";
import { KeyboardShortcutsDialog } from "@/components/layout/keyboard-shortcuts-dialog";
import { SupportDialog } from "@/components/layout/support-dialog";
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
  "/purchases/purchase-returns": "Purchase Returns",
  "/purchases/procurement": "Procurement Hub",
  "/purchases/supplier-payments": "Supplier Payments",
  "/hr": "Employees",
  "/hr/attendance": "Attendance",
  "/hr/payroll": "Payroll",
  "/hr/leaves": "Leaves",
  "/hr/departments": "Departments",
  "/hr/designations": "Designations",
  "/hr/shifts": "Shifts",
  "/hr/leave-types": "Leave Types",
  "/hr/holidays": "Holidays",
  "/hr/employees": "Employee Profile",
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
  const { resolvedTheme, setTheme } = useTheme();
  const isDarkHeader = resolvedTheme === "dark";
  const { user, logoutApi } = useAuthStore();
  const { toggleMobileSidebar, openPos } = useUIStore();
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);
  const { status: maintenance, isMaintenance } = useMaintenanceStatus(60_000);
  const { profile, workspace } = useShopWorkspace();
  useThemeLayoutStore((s) => s.topbarSkin);
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

      if (isModKey(e) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
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

  const notificationCount = isMaintenance ? 1 : 4;

  return (
    <header
      className="hex-retail-header hex-header sticky top-0 z-40 shrink-0"
      style={{
        background: "var(--retail-topbar-bg, hsl(var(--background) / 0.98))",
        color: "var(--retail-topbar-fg, hsl(var(--foreground)))",
        borderColor: "var(--retail-topbar-border, hsl(var(--border)))",
      }}
    >
      <div className="hex-header__inner">
        {/* ── Left: context ── */}
        <div className="hex-header__left">
          <button
            type="button"
            className="hex-header__icon-btn lg:hidden"
            onClick={toggleMobileSidebar}
            aria-label="Open menu"
          >
            <Menu className="h-[18px] w-[18px]" />
          </button>

          <nav className="hex-header__context" aria-label="Breadcrumb">
            <ol className="hex-header__crumbs hidden sm:flex">
              <li>
                <Link href="/dashboard" className="hex-header__crumb-home" aria-label="Dashboard">
                  <Home className="h-3.5 w-3.5" />
                </Link>
              </li>
              {breadcrumbs.map((_, i) => {
                const href = "/" + breadcrumbs.slice(0, i + 1).join("/");
                const isLast = i === breadcrumbs.length - 1;
                return (
                  <li key={href} className="hex-header__crumb-item">
                    <ChevronRight className="hex-header__crumb-sep h-3 w-3" aria-hidden />
                    {isLast ? (
                      <span className="hex-header__crumb-current" aria-current="page">
                        {crumbLabel(i)}
                      </span>
                    ) : (
                      <Link href={href} className="hex-header__crumb-link">
                        {crumbLabel(i)}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ol>

            <h1 className="hex-header__title sm:hidden">{currentTitle}</h1>
          </nav>
        </div>

        {/* ── Center: search ── */}
        <div className="hex-header__search-wrap">
          <div className="hex-header__search">
            <Search className="hex-header__search-icon" />
            <Input
              ref={searchRef}
              placeholder="Search products, customers, orders..."
              className="hex-header__search-input"
            />
            <kbd className="hex-header__search-kbd">⌘K</kbd>
          </div>
        </div>

        {/* ── Right: actions ── */}
        <div className="hex-header__right">
          <div className="hex-header__actions">
            <BranchSwitcher className="hex-header__branch hidden lg:flex" />

            <div className="hex-header__actions-primary">
              <button
                type="button"
                className="hex-header__pos"
                onClick={openPos}
              >
                <Monitor className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">POS</span>
              </button>

              <div className="hex-header__live hidden md:flex">
                <span className="hex-header__live-dot" />
                <span>Live</span>
              </div>
            </div>
          </div>

          <span className="hex-header__vsep hidden sm:block" aria-hidden />

          <div className="hex-header__toolbar">
            <button
              type="button"
              className="hex-header__icon-btn md:hidden"
              onClick={() => searchRef.current?.focus()}
              aria-label="Search"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>

            <button
              type="button"
              className="hex-header__icon-btn"
              onClick={() => setTheme(isDarkHeader ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              <Sun className="h-[18px] w-[18px] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[18px] w-[18px] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
            </button>

            <button
              type="button"
              className="hex-header__icon-btn hidden sm:inline-flex"
              onClick={() => router.refresh()}
              aria-label="Refresh page"
            >
              <RefreshCw className="h-[17px] w-[17px]" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="hex-header__icon-btn hex-header__icon-btn--badge relative" aria-label="Notifications">
                  <Bell className="h-[18px] w-[18px]" />
                  {notificationCount > 0 && (
                    <span className="hex-header__badge">
                      {isMaintenance ? "!" : notificationCount}
                    </span>
                  )}
                </button>
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
                  <DropdownMenuItem className="flex flex-col items-start gap-1 py-3 cursor-default bg-amber-50/80 focus:bg-amber-50 dark:bg-amber-500/10 dark:focus:bg-amber-500/10">
                    <div className="flex items-center gap-2 w-full">
                      <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">Maintenance Mode ON</span>
                      <span className="text-[10px] text-amber-600 dark:text-amber-400 ml-auto">Now</span>
                    </div>
                    <span className="text-xs text-amber-800 dark:text-amber-300/90 leading-relaxed">{maintenance.message}</span>
                  </DropdownMenuItem>
                )}
                {[
                  { title: "Low stock alert", desc: "Running Sports Shoes (Size 9) — 2 left", time: "2m ago" },
                  { title: "New order received", desc: "INV-0891 — LKR 12,500 via UPI", time: "15m ago" },
                  { title: "Payment overdue", desc: "Supplier: DenimCo — LKR 85,000", time: "1h ago" },
                  { title: "Birthday campaign sent", desc: "32 customers notified via WhatsApp", time: "3h ago" },
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

          <span className="hex-header__vsep hidden lg:block" aria-hidden />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="hex-header__profile">
                <Avatar className="hex-header__avatar">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="hex-header__avatar-fallback">
                    {getInitials(user?.name || "U")}
                  </AvatarFallback>
                </Avatar>
                <span className="hex-header__profile-meta hidden lg:block">
                  <span className="hex-header__profile-name">{user?.name || "Admin"}</span>
                  <span className="hex-header__profile-role">{user?.role?.replace(/_/g, " ") || "User"}</span>
                </span>
              </button>
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
      </div>

      <KeyboardShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <SupportDialog open={supportOpen} onOpenChange={setSupportOpen} />
    </header>
  );
}
