"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, ShoppingCart, Package, Warehouse, Users, Truck, BookOpen,
  UserCog, Building2, FileBarChart, Zap, Bell, Settings, Shield, Receipt,
  RotateCcw, Tag, Star, ShoppingBag, TrendingDown, BarChart3, ChevronLeft,
  ChevronRight, Sparkles, LogOut, HelpCircle,
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
      { label: "POS Terminal", href: "/pos", icon: "ShoppingCart", highlight: true },
      { label: "Sales", href: "/sales", icon: "Receipt" },
      { label: "Returns", href: "/returns", icon: "RotateCcw" },
    ],
  },
  {
    group: "Products",
    items: [
      { label: "Products", href: "/products", icon: "Package" },
      { label: "Categories", href: "/categories", icon: "Tag" },
      { label: "Brands", href: "/brands", icon: "Star" },
      { label: "Inventory", href: "/inventory", icon: "Warehouse" },
    ],
  },
  {
    group: "People",
    items: [
      { label: "Customers", href: "/customers", icon: "Users" },
      { label: "Suppliers", href: "/suppliers", icon: "Truck" },
      { label: "Purchases", href: "/purchases", icon: "ShoppingBag" },
      { label: "HR & Payroll", href: "/hr", icon: "UserCog" },
    ],
  },
  {
    group: "Finance",
    items: [
      { label: "Accounting", href: "/accounting", icon: "BookOpen" },
      { label: "Expenses", href: "/expenses", icon: "TrendingDown" },
    ],
  },
  {
    group: "Business",
    items: [
      { label: "Branches", href: "/branches", icon: "Building2" },
      { label: "Reports", href: "/reports", icon: "FileBarChart" },
      { label: "Promotions", href: "/promotions", icon: "Zap" },
      { label: "Notifications", href: "/notifications", icon: "Bell", badge: 4 },
    ],
  },
  {
    group: "System",
    items: [
      { label: "Settings", href: "/settings", icon: "Settings" },
      { label: "Users & Roles", href: "/users", icon: "Shield" },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const router = useRouter();
  const { user, logoutApi } = useAuthStore();

  const handleLogout = async () => { await logoutApi(); router.replace('/login'); };

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 72 : 260 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-screen flex-col border-r border-border bg-sidebar overflow-hidden shrink-0"
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-border shrink-0">
          <AnimatePresence mode="wait">
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="flex items-center gap-2.5"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary shrink-0">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="leading-tight">
                  <p className="text-sm font-bold text-foreground">FashionERP</p>
                  <p className="text-[10px] text-muted-foreground">Enterprise Edition</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {sidebarCollapsed && (
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary mx-auto">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
          )}

          <button
            onClick={toggleSidebar}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background hover:bg-accent transition-colors shrink-0",
              sidebarCollapsed && "mx-auto"
            )}
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-3">
          <nav className="px-2 space-y-0.5">
            {NAV_GROUPS.map((group) => (
              <div key={group.group} className="mb-1">
                {!sidebarCollapsed && (
                  <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {group.group}
                  </p>
                )}
                {sidebarCollapsed && <div className="h-3" />}
                {group.items.map((item) => {
                  const Icon = ICON_MAP[item.icon];
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

                  const linkContent = (
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 relative overflow-hidden",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-glow"
                          : item.highlight
                          ? "bg-primary/10 text-primary hover:bg-primary/20 border border-primary/20"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        sidebarCollapsed && "justify-center px-2"
                      )}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="activeNav"
                          className="absolute inset-0 gradient-primary rounded-lg"
                          transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                        />
                      )}
                      <Icon
                        className={cn(
                          "h-4 w-4 shrink-0 relative z-10",
                          isActive ? "text-primary-foreground" : "",
                          item.highlight && !isActive ? "text-primary" : ""
                        )}
                      />
                      {!sidebarCollapsed && (
                        <span className="relative z-10 truncate flex-1">{item.label}</span>
                      )}
                      {!sidebarCollapsed && item.badge && (
                        <Badge
                          variant={isActive ? "secondary" : "default"}
                          className="relative z-10 h-5 min-w-5 px-1.5 text-[10px]"
                        >
                          {item.badge}
                        </Badge>
                      )}
                    </Link>
                  );

                  return sidebarCollapsed ? (
                    <Tooltip key={item.href}>
                      <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                      <TooltipContent side="right" className="flex items-center gap-2">
                        {item.label}
                        {item.badge && (
                          <Badge variant="default" className="h-4 px-1 text-[10px]">
                            {item.badge}
                          </Badge>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <div key={item.href}>{linkContent}</div>
                  );
                })}
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* User Profile Footer */}
        <div className="border-t border-border p-3 shrink-0">
          {sidebarCollapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button className="flex w-full items-center justify-center rounded-lg p-2 hover:bg-accent transition-colors">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user?.avatar} />
                    <AvatarFallback className="text-xs">
                      {getInitials(user?.name || "U")}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p className="font-medium">{user?.name}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-accent transition-colors cursor-pointer">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarImage src={user?.avatar} />
                <AvatarFallback className="text-xs font-semibold">
                  {getInitials(user?.name || "U")}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.name || "Admin"}</p>
                <p className="text-xs text-muted-foreground capitalize truncate">
                  {user?.role?.replace("_", " ")}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button className="p-1 rounded hover:bg-background transition-colors">
                      <HelpCircle className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Help</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={handleLogout}
                      className="p-1 rounded hover:bg-background transition-colors"
                    >
                      <LogOut className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Sign out</TooltipContent>
                </Tooltip>
              </div>
            </div>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
