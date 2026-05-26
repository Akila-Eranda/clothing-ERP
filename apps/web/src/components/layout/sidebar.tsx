"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, Users, Truck, BookOpen,
  UserCog, Building2, FileBarChart, Zap, Bell, Settings, Shield, Receipt,
  RotateCcw, Tag, Star, ShoppingBag, TrendingDown, BarChart3,
  PanelLeftOpen, LogOut, Moon, Sun, ShoppingBag as BagIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, BarChart3, ShoppingCart, Receipt, RotateCcw, Package, Tag,
  Star, Warehouse, Users, Truck, ShoppingBag, BookOpen, TrendingDown, UserCog,
  Building2, FileBarChart, Zap, Bell, Settings, Shield,
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: string | number;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",    href: "/dashboard",    icon: "LayoutDashboard" },
  { label: "Analytics",   href: "/analytics",    icon: "BarChart3" },
  { label: "Sales",       href: "/sales",        icon: "Receipt" },
  { label: "Returns",     href: "/returns",      icon: "RotateCcw" },
  { label: "Products",    href: "/products",     icon: "Package" },
  { label: "Categories",  href: "/categories",   icon: "Tag" },
  { label: "Brands",      href: "/brands",       icon: "Star" },
  { label: "Inventory",   href: "/inventory",    icon: "Warehouse" },
  { label: "Customers",   href: "/customers",    icon: "Users" },
  { label: "Suppliers",   href: "/suppliers",    icon: "Truck" },
  { label: "Purchases",   href: "/purchases",    icon: "ShoppingBag" },
  { label: "Accounting",  href: "/accounting",   icon: "BookOpen" },
  { label: "Expenses",    href: "/expenses",     icon: "TrendingDown" },
  { label: "Branches",    href: "/branches",     icon: "Building2" },
  { label: "Reports",     href: "/reports",      icon: "FileBarChart" },
  { label: "Promotions",  href: "/promotions",   icon: "Zap" },
  { label: "Notifications", href: "/notifications", icon: "Bell", badge: 4 },
  { label: "HR & Payroll", href: "/hr",           icon: "UserCog" },
  { label: "Users & Roles", href: "/users",       icon: "Shield" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const router = useRouter();
  const { logoutApi } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const isDark = theme === "dark";

  const handleLogout = async () => { await logoutApi(); router.replace("/login"); };

  /* ── helpers ── */
  const navItem = (item: NavItem) => {
    const Icon = ICON_MAP[item.icon];
    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

    const inner = (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "relative flex items-center gap-3 rounded-xl transition-all duration-150 select-none overflow-hidden",
          sidebarCollapsed ? "h-11 w-11 justify-center mx-auto" : "h-11 px-4",
          isActive
            ? "font-semibold"
            : "font-normal",
        )}
        style={isActive ? {
          background: "hsl(var(--sidebar-accent))",
          color: "hsl(var(--sidebar-primary))",
        } : {
          color: "hsl(var(--sidebar-foreground)/0.7)",
        }}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; } }}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.7)"; } }}
      >
        {/* Right accent bar */}
        {isActive && (
          <motion.span
            layoutId="sb-accent"
            className="absolute right-0 top-[8px] bottom-[8px] w-[3px] rounded-l-full"
            style={{ background: "hsl(var(--sidebar-primary))" }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        )}
        <Icon className="h-[19px] w-[19px] shrink-0" />
        {!sidebarCollapsed && (
          <span className="truncate flex-1 text-[15px] leading-none">{item.label}</span>
        )}
        {!sidebarCollapsed && item.badge && (
          <span
            className="ml-auto flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold"
            style={{ background: "hsl(var(--sidebar-primary))", color: "hsl(var(--sidebar-primary-foreground))" }}
          >
            {item.badge}
          </span>
        )}
      </Link>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip key={item.href}>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{item.label}</TooltipContent>
        </Tooltip>
      );
    }
    return inner;
  };

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-screen flex-col shrink-0 overflow-hidden"
        style={{
          background: "hsl(var(--sidebar-background))",
          borderRight: "1px solid hsl(var(--sidebar-border))",
        }}
      >
        {/* ── Logo ── */}
        <div className={cn(
          "flex h-[64px] items-center shrink-0 px-4 gap-2.5",
          sidebarCollapsed && "justify-center px-0",
        )}>
          <div
            className="flex h-9 w-9 items-center justify-center rounded-xl shrink-0"
            style={{ background: "hsl(var(--sidebar-primary))" }}
          >
            <BagIcon className="h-5 w-5 text-white" />
          </div>
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.span
                key="logo-txt"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: 0.15 }}
                className="text-[18px] font-black tracking-wide uppercase whitespace-nowrap"
                style={{ color: "hsl(var(--sidebar-foreground))" }}
              >
                FashionERP
              </motion.span>
            )}
          </AnimatePresence>

          {/* Collapse toggle (expanded state only) */}
          <AnimatePresence initial={false}>
            {!sidebarCollapsed && (
              <motion.button
                key="collapse-btn"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={toggleSidebar}
                className="ml-auto p-1 rounded-lg transition-colors"
                style={{ color: "hsl(var(--sidebar-foreground)/0.35)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "hsl(var(--sidebar-foreground))")}
                onMouseLeave={e => (e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.35)")}
              >
                <PanelLeftOpen className="h-4 w-4" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* ── Divider ── */}
        <div className="mx-4 mb-2 h-px shrink-0" style={{ background: "hsl(var(--sidebar-border))" }} />

        {/* ── Nav ── */}
        <ScrollArea className="flex-1">
          <nav className={cn("py-1", sidebarCollapsed ? "px-2" : "px-3")}>
            <div className="space-y-0.5">
              {NAV_ITEMS.map(navItem)}
            </div>
          </nav>
        </ScrollArea>

        {/* ── Divider ── */}
        <div className="mx-4 mt-1 h-px shrink-0" style={{ background: "hsl(var(--sidebar-border))" }} />

        {/* ── Bottom fixed items ── */}
        <div className={cn("shrink-0 py-2", sidebarCollapsed ? "px-2" : "px-3")}>
          {/* Settings */}
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link href="/settings" className="flex h-11 w-11 items-center justify-center mx-auto rounded-xl transition-colors"
                  style={{ color: "hsl(var(--sidebar-foreground)/0.7)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.7)"; }}
                >
                  <Settings className="h-[19px] w-[19px]" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          ) : (
            <Link href="/settings" className="flex h-11 items-center gap-3 rounded-xl px-4 transition-colors"
              style={{ color: "hsl(var(--sidebar-foreground)/0.7)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.7)"; }}
            >
              <Settings className="h-[19px] w-[19px] shrink-0" />
              <span className="text-[15px]">Settings</span>
            </Link>
          )}

          {/* Logout */}
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={handleLogout} className="flex h-11 w-11 items-center justify-center mx-auto rounded-xl transition-colors"
                  style={{ color: "hsl(var(--sidebar-foreground)/0.7)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#ef4444"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.7)"; }}
                >
                  <LogOut className="h-[19px] w-[19px]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Logout</TooltipContent>
            </Tooltip>
          ) : (
            <button onClick={handleLogout} className="flex h-11 w-full items-center gap-3 rounded-xl px-4 transition-colors"
              style={{ color: "hsl(var(--sidebar-foreground)/0.7)" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "#ef4444"; }}
              onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.7)"; }}
            >
              <LogOut className="h-[19px] w-[19px] shrink-0" />
              <span className="text-[15px]">Logout</span>
            </button>
          )}

          {/* Dark Mode toggle */}
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className="flex h-11 w-11 items-center justify-center mx-auto rounded-xl transition-colors"
                  style={{ color: "hsl(var(--sidebar-foreground)/0.7)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.7)"; }}
                >
                  {isDark ? <Sun className="h-[19px] w-[19px]" /> : <Moon className="h-[19px] w-[19px]" />}
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Toggle Dark Mode</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex h-11 items-center gap-3 rounded-xl px-4" style={{ color: "hsl(var(--sidebar-foreground)/0.7)" }}>
              <Moon className="h-[19px] w-[19px] shrink-0" />
              <span className="text-[15px] flex-1">Dark Mode</span>
              {/* Toggle switch */}
              <button
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="relative h-6 w-11 rounded-full transition-colors duration-200 shrink-0"
                style={{ background: isDark ? "hsl(var(--sidebar-primary))" : "hsl(var(--sidebar-border))" }}
              >
                <motion.span
                  className="absolute top-[3px] h-[18px] w-[18px] rounded-full bg-white shadow"
                  animate={{ left: isDark ? "calc(100% - 21px)" : "3px" }}
                  transition={{ type: "spring", stiffness: 500, damping: 40 }}
                />
              </button>
            </div>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
