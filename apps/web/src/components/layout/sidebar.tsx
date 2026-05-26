"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, Users, Truck, BookOpen,
  UserCog, Building2, FileBarChart, Zap, Bell, Settings, Shield, Receipt,
  RotateCcw, Tag, Star, ShoppingBag, TrendingDown, BarChart3,
  PanelLeftClose, PanelLeftOpen, Sparkles, LogOut, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getInitials } from "@/lib/utils";

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, BarChart3, ShoppingCart, Receipt, RotateCcw, Package, Tag,
  Star, Warehouse, Users, Truck, ShoppingBag, BookOpen, TrendingDown, UserCog,
  Building2, FileBarChart, Zap, Bell, Settings, Shield,
};

interface NavItem {
  label: string;
  href: string;
  icon: string;
  highlight?: boolean;
  badge?: string | number;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Analytics", href: "/analytics", icon: "BarChart3" },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "POS Terminal", href: "/pos",     icon: "ShoppingCart", highlight: true },
      { label: "Sales",        href: "/sales",   icon: "Receipt" },
      { label: "Returns",      href: "/returns", icon: "RotateCcw" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { label: "Products",   href: "/products",   icon: "Package" },
      { label: "Categories", href: "/categories", icon: "Tag" },
      { label: "Brands",     href: "/brands",     icon: "Star" },
      { label: "Inventory",  href: "/inventory",  icon: "Warehouse" },
    ],
  },
  {
    group: "People",
    items: [
      { label: "Customers",    href: "/customers", icon: "Users" },
      { label: "Suppliers",    href: "/suppliers", icon: "Truck" },
      { label: "Purchases",    href: "/purchases", icon: "ShoppingBag" },
      { label: "HR & Payroll", href: "/hr",        icon: "UserCog" },
    ],
  },
  {
    group: "Finance",
    items: [
      { label: "Accounting", href: "/accounting", icon: "BookOpen" },
      { label: "Expenses",   href: "/expenses",   icon: "TrendingDown" },
    ],
  },
  {
    group: "Business",
    items: [
      { label: "Branches",      href: "/branches",      icon: "Building2" },
      { label: "Reports",       href: "/reports",       icon: "FileBarChart" },
      { label: "Promotions",    href: "/promotions",    icon: "Zap" },
      { label: "Notifications", href: "/notifications", icon: "Bell", badge: 4 },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Settings",      href: "/settings", icon: "Settings" },
      { label: "Users & Roles", href: "/users",    icon: "Shield" },
    ],
  },
];

const NAV_GROUPS_WITHOUT_POS = NAV_GROUPS.map(g => ({
  ...g,
  items: g.items.filter(i => i.href !== "/pos"),
})).filter(g => g.items.length > 0);

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const router = useRouter();
  const { user, logoutApi } = useAuthStore();

  const handleLogout = async () => { await logoutApi(); router.replace("/login"); };

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 58 : 232 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-screen flex-col overflow-hidden shrink-0"
        style={{
          background: "var(--sidebar)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* ── Logo ── */}
        <div className={cn(
          "flex h-[50px] items-center shrink-0 px-3",
          "border-b",
          sidebarCollapsed ? "justify-center" : "justify-between",
        )} style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0 shadow-lg"
              style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
            >
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <AnimatePresence initial={false}>
              {!sidebarCollapsed && (
                <motion.div
                  key="logo-text"
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -6 }}
                  transition={{ duration: 0.14 }}
                  className="overflow-hidden"
                >
                  <p className="text-[12.5px] font-extrabold text-foreground whitespace-nowrap tracking-tight leading-none">FashionERP</p>
                  <p className="text-[9.5px] whitespace-nowrap font-semibold tracking-widest uppercase leading-none mt-0.5" style={{ color: "rgba(255,255,255,0.25)" }}>Enterprise</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {!sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="flex h-5 w-5 items-center justify-center rounded transition-colors"
              style={{ color: "rgba(255,255,255,0.25)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
              onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
            >
              <PanelLeftClose className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* ── Expand (collapsed state) ── */}
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="mx-auto mt-2 flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{ color: "rgba(255,255,255,0.25)" }}
            onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,0.7)")}
            onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,0.25)")}
          >
            <PanelLeftOpen className="h-3 w-3" />
          </button>
        )}

        {/* ── Nav ── */}
        <ScrollArea className="flex-1 py-2">
          <nav className={cn(sidebarCollapsed ? "px-1.5" : "px-2")}>
            {NAV_GROUPS_WITHOUT_POS.map((group, gi) => (
              <div key={group.group} className={cn(gi > 0 ? "mt-3.5" : "mt-1")}>
                {!sidebarCollapsed ? (
                  <p
                    className="mb-1 px-1.5 text-[9.5px] font-bold uppercase tracking-[0.12em] select-none"
                    style={{ color: "rgba(255,255,255,0.2)" }}
                  >
                    {group.group}
                  </p>
                ) : (
                  gi > 0 && <div className="mx-auto my-2 h-px w-5" style={{ background: "rgba(255,255,255,0.07)" }} />
                )}

                <div className="space-y-[2px]">
                  {group.items.map((item) => {
                    const Icon = ICON_MAP[item.icon];
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

                    const link = (
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-2 rounded-[7px] transition-all duration-150 select-none overflow-hidden",
                          sidebarCollapsed ? "h-8 w-full justify-center px-0" : "h-[30px] px-2",
                        )}
                        style={isActive ? {
                          background: "linear-gradient(90deg,rgba(99,102,241,0.18),rgba(99,102,241,0.08))",
                          color: "#a5b4fc",
                        } : {
                          color: "rgba(255,255,255,0.42)",
                        }}
                        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; e.currentTarget.style.color = "rgba(255,255,255,0.82)"; }}}
                        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = ""; e.currentTarget.style.color = "rgba(255,255,255,0.42)"; }}}
                      >
                        {/* Glow left border */}
                        {isActive && (
                          <motion.span
                            layoutId="sb-bar"
                            className="absolute left-0 top-[4px] bottom-[4px] w-[2px] rounded-full"
                            style={{ background: "linear-gradient(180deg,#818cf8,#6366f1)" }}
                            transition={{ type: "spring", stiffness: 500, damping: 38 }}
                          />
                        )}

                        {/* Icon */}
                        <div className={cn(
                          "relative z-10 flex items-center justify-center rounded-[5px] shrink-0 transition-all",
                          sidebarCollapsed ? "h-6 w-6" : "h-5 w-5",
                          isActive
                            ? "bg-indigo-500/20 text-indigo-400"
                            : "text-inherit",
                        )}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>

                        {!sidebarCollapsed && (
                          <>
                            <span className="relative z-10 truncate flex-1 text-[11.5px] font-medium leading-none">
                              {item.label}
                            </span>
                            {item.badge ? (
                              <span
                                className="relative z-10 ml-auto flex h-[16px] min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none"
                                style={isActive
                                  ? { background: "#6366f1", color: "#fff" }
                                  : { background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }
                                }
                              >
                                {item.badge}
                              </span>
                            ) : isActive && (
                              <ChevronRight className="relative z-10 h-3 w-3 shrink-0 ml-auto opacity-40" />
                            )}
                          </>
                        )}
                      </Link>
                    );

                    return sidebarCollapsed ? (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" className="flex items-center gap-2 text-xs">
                          {item.label}
                          {item.badge && (
                            <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                              {item.badge}
                            </span>
                          )}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div key={item.href}>{link}</div>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* ── Footer ── */}
        <div className="shrink-0" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          {sidebarCollapsed ? (
            <div className="flex flex-col items-center gap-1 py-2 px-1.5">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/settings" className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors" style={{ color: "rgba(255,255,255,0.3)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }} onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
                    <Settings className="h-3.5 w-3.5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors" onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }} onMouseLeave={e => { e.currentTarget.style.background = ""; }}>
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback className="text-[8px] font-bold text-white" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                        {getInitials(user?.name || "U")}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="text-[11px] font-semibold">{user?.name || "User"}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">{user?.role?.replace(/_/g, " ")}</p>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button onClick={handleLogout} className="flex h-7 w-7 items-center justify-center rounded-[6px] transition-colors" style={{ color: "rgba(255,255,255,0.3)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.1)"; e.currentTarget.style.color = "#f87171"; }} onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "rgba(255,255,255,0.3)"; }}>
                    <LogOut className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Sign out</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="p-2.5">
              {/* User card */}
              <div
                className="flex items-center gap-2 rounded-[8px] px-2.5 py-2 mb-1.5"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <div className="relative shrink-0">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="text-[9px] font-bold text-white" style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}>
                      {getInitials(user?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                  <span className="absolute -bottom-px -right-px h-2 w-2 rounded-full border border-sidebar bg-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11.5px] font-semibold truncate text-foreground leading-tight">
                    {user?.name || "Admin"}
                  </p>
                  <p className="text-[9.5px] capitalize truncate leading-tight mt-px" style={{ color: "rgba(255,255,255,0.28)" }}>
                    {user?.role?.replace(/_/g, " ") || "Administrator"}
                  </p>
                </div>
              </div>
              {/* Action buttons */}
              <div className="grid grid-cols-2 gap-1">
                <Link
                  href="/settings"
                  className="flex items-center justify-center gap-1 h-6 rounded-[6px] text-[10.5px] font-medium transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
                >
                  <Settings className="h-3 w-3" />Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center gap-1 h-6 rounded-[6px] text-[10.5px] font-medium transition-colors"
                  style={{ color: "rgba(255,255,255,0.35)", border: "1px solid rgba(255,255,255,0.07)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.08)"; e.currentTarget.style.color = "#f87171"; e.currentTarget.style.borderColor = "rgba(239,68,68,0.2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)"; }}
                >
                  <LogOut className="h-3 w-3" />Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
