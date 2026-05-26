"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, Users, Truck, BookOpen,
  UserCog, Building2, FileBarChart, Zap, Bell, Settings, Shield, Receipt,
  RotateCcw, Tag, Star, ShoppingBag, TrendingDown, BarChart3,
  PanelLeftClose, PanelLeftOpen, Sparkles, LogOut,
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
      { label: "Dashboard",  href: "/dashboard", icon: "LayoutDashboard" },
      { label: "Analytics",  href: "/analytics",  icon: "BarChart3"       },
    ],
  },
  {
    group: "Operations",
    items: [
      { label: "POS Terminal", href: "/pos",     icon: "ShoppingCart", highlight: true },
      { label: "Sales",        href: "/sales",   icon: "Receipt"  },
      { label: "Returns",      href: "/returns", icon: "RotateCcw" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { label: "Products",   href: "/products",   icon: "Package"   },
      { label: "Categories", href: "/categories", icon: "Tag"       },
      { label: "Brands",     href: "/brands",     icon: "Star"      },
      { label: "Inventory",  href: "/inventory",  icon: "Warehouse" },
    ],
  },
  {
    group: "People",
    items: [
      { label: "Customers", href: "/customers", icon: "Users"      },
      { label: "Suppliers", href: "/suppliers", icon: "Truck"      },
      { label: "Purchases", href: "/purchases", icon: "ShoppingBag"},
      { label: "HR & Payroll", href: "/hr",     icon: "UserCog"    },
    ],
  },
  {
    group: "Finance",
    items: [
      { label: "Accounting", href: "/accounting", icon: "BookOpen"     },
      { label: "Expenses",   href: "/expenses",   icon: "TrendingDown" },
    ],
  },
  {
    group: "Business",
    items: [
      { label: "Branches",      href: "/branches",      icon: "Building2"  },
      { label: "Reports",       href: "/reports",       icon: "FileBarChart"},
      { label: "Promotions",    href: "/promotions",    icon: "Zap"        },
      { label: "Notifications", href: "/notifications", icon: "Bell", badge: 4 },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Settings",    href: "/settings", icon: "Settings" },
      { label: "Users & Roles", href: "/users",  icon: "Shield"   },
    ],
  },
];

const NAV_GROUPS_WITHOUT_POS = NAV_GROUPS.map(g => ({
  ...g,
  items: g.items.filter(i => i.href !== "/pos"),
})).filter(g => g.items.length > 0);

export function Sidebar() {
  const pathname  = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const router    = useRouter();
  const { user, logoutApi } = useAuthStore();

  const handleLogout = async () => { await logoutApi(); router.replace("/login"); };

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 64 : 272 }}
        transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-screen flex-col border-r border-border bg-sidebar overflow-hidden shrink-0"
      >
        {/* ── Logo ── */}
        <div className={cn(
          "flex h-14 items-center border-b border-border/60 shrink-0 px-3 gap-2",
          sidebarCollapsed ? "justify-center" : "justify-between",
        )}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl gradient-primary shrink-0 shadow-sm">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <AnimatePresence initial={false}>
              {!sidebarCollapsed && (
                <motion.div
                  key="logo-text"
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.18 }}
                  className="leading-tight overflow-hidden"
                >
                  <p className="text-base font-bold text-foreground whitespace-nowrap tracking-tight">FashionERP</p>
                  <p className="text-xs text-muted-foreground whitespace-nowrap">Enterprise</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          {!sidebarCollapsed && (
            <button onClick={toggleSidebar} className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* ── Expand (collapsed) ── */}
        {sidebarCollapsed && (
          <button onClick={toggleSidebar} className="mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors">
            <PanelLeftOpen className="h-3.5 w-3.5" />
          </button>
        )}

        {/* ── Navigation ── */}
        <ScrollArea className="flex-1 py-2">
          <nav className={cn(sidebarCollapsed ? "px-1.5" : "px-2")}>
            {NAV_GROUPS_WITHOUT_POS.map((group, gi) => (
              <div key={group.group} className={cn("mb-0.5", gi > 0 ? "mt-3" : "mt-2")}>
                {!sidebarCollapsed ? (
                  <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/40 select-none">
                    {group.group}
                  </p>
                ) : (
                  gi > 0 && <div className="mx-auto my-2 h-px w-8 bg-border/60" />
                )}

                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = ICON_MAP[item.icon];
                    const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

                    const link = (
                      <Link
                        href={item.href}
                        className={cn(
                          "group relative flex items-center gap-2.5 rounded-lg text-[15px] font-medium transition-all duration-150 select-none overflow-hidden",
                          sidebarCollapsed ? "h-11 w-full justify-center px-0" : "h-10 px-2.5",
                          isActive
                            ? "text-primary bg-primary/10"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {isActive && (
                          <>
                            <motion.span
                              layoutId="nav-indicator"
                              className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full bg-primary"
                              transition={{ type: "spring", stiffness: 400, damping: 38 }}
                            />
                            <motion.span
                              layoutId="nav-bg"
                              className="absolute inset-0 bg-primary/10 rounded-lg"
                              transition={{ type: "spring", stiffness: 400, damping: 38 }}
                            />
                          </>
                        )}
                        <Icon className="h-4 w-4 shrink-0 relative z-10" />
                        {!sidebarCollapsed && (
                          <>
                            <span className="relative z-10 truncate flex-1">{item.label}</span>
                            {item.badge && (
                              <Badge
                                variant={isActive ? "default" : "secondary"}
                                className="relative z-10 h-4 min-w-4 px-1 text-[10px] leading-none"
                              >
                                {item.badge}
                              </Badge>
                            )}
                          </>
                        )}
                      </Link>
                    );

                    return sidebarCollapsed ? (
                      <Tooltip key={item.href}>
                        <TooltipTrigger asChild>{link}</TooltipTrigger>
                        <TooltipContent side="right" className="flex items-center gap-2">
                          {item.label}
                          {item.badge && <Badge variant="default" className="h-4 px-1 text-[10px]">{item.badge}</Badge>}
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

        {/* ── User footer ── */}
        <div className="border-t border-border/60 shrink-0">
          {sidebarCollapsed ? (
            <div className="p-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href="/settings" className="flex w-full items-center justify-center rounded-lg p-1.5 hover:bg-accent transition-colors mb-1">
                    <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">Settings</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="flex w-full items-center justify-center rounded-lg p-1.5 hover:bg-accent transition-colors">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback className="text-[9px] font-bold gradient-primary text-white">
                        {getInitials(user?.name || "U")}
                      </AvatarFallback>
                    </Avatar>
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{user?.name || "User"}</p>
                  <p className="text-xs text-muted-foreground capitalize">{user?.role?.replace(/_/g, " ")}</p>
                </TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              <div className="flex items-center gap-2.5 rounded-xl bg-muted/50 px-3 py-2.5">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarImage src={user?.avatar} />
                  <AvatarFallback className="text-[11px] font-bold gradient-primary text-white">
                    {getInitials(user?.name || "U")}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold truncate text-foreground leading-tight">
                    {user?.name || "Admin"}
                  </p>
                  <p className="text-[12px] text-muted-foreground capitalize truncate leading-tight">
                    {user?.email || user?.role?.replace(/_/g, " ") || "administrator"}
                  </p>
                </div>
              </div>
              <div className="flex gap-1.5">
                <Link
                  href="/settings"
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border border-border/60"
                >
                  <Settings className="h-3.5 w-3.5" />Settings
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-[13px] font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors border border-border/60"
                >
                  <LogOut className="h-3.5 w-3.5" />Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
