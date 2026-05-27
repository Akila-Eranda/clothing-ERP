"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, ShoppingCart, History, RotateCcw, Users,
  Package, Smartphone, Truck, Wrench, Shield, ArrowLeftRight,
  Wallet, TrendingDown, BarChart3, FileBarChart, FileText,
  UserCog, Settings, LogOut, Moon, Sun, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ── Types ─────────────────────────────────────────────── */
interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  badge?: string;
  action?: () => void;
}
interface NavGroup { title: string; items: NavItem[] }

/* ── Navigation structure ────────────────────────────────── */
function useNavGroups(): NavGroup[] {
  const { openPos } = useUIStore();
  return [
    {
      title: "OVERVIEW",
      items: [
        { label: "Dashboard",      href: "/dashboard",  icon: LayoutDashboard },
      ],
    },
    {
      title: "SALES",
      items: [
        { label: "Point of Sale",  icon: ShoppingCart,  badge: "POS", action: openPos },
        { label: "Sales History",  href: "/sales",      icon: History },
        { label: "Returns",        href: "/returns",    icon: RotateCcw },
        { label: "Customers",      href: "/customers",  icon: Users },
      ],
    },
    {
      title: "INVENTORY",
      items: [
        { label: "Inventory",      href: "/inventory",  icon: Package },
        { label: "IMEI Tracker",   href: "/imei",       icon: Smartphone, badge: "NEW" },
        { label: "Suppliers & PO", href: "/suppliers",  icon: Truck },
      ],
    },
    {
      title: "SERVICE",
      items: [
        { label: "Repair Jobs",    href: "/repairs",    icon: Wrench },
        { label: "Warranty",       href: "/warranty",   icon: Shield },
        { label: "Device Exchange",href: "/exchanges",  icon: ArrowLeftRight, badge: "NEW" },
      ],
    },
    {
      title: "FINANCE",
      items: [
        { label: "Finance",        href: "/accounting", icon: Wallet },
        { label: "Expenses",       href: "/expenses",   icon: TrendingDown, badge: "NEW" },
        { label: "Analytics",      href: "/analytics",  icon: BarChart3 },
      ],
    },
    {
      title: "REPORTS",
      items: [
        { label: "Reports",        href: "/reports",    icon: FileBarChart, badge: "NEW" },
        { label: "Invoice",        href: "/invoices",   icon: FileText, badge: "NEW" },
      ],
    },
    {
      title: "HR & STAFF",
      items: [
        { label: "Platform Admin", href: "/users",      icon: UserCog },
      ],
    },
  ];
}

/* ── Badge component ─────────────────────────────────────── */
function NavBadge({ text }: { text: string }) {
  const isPOS = text === "POS";
  return (
    <span
      className="ml-auto shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold leading-none border"
      style={isPOS
        ? { borderColor: "#6366f1", color: "#6366f1", background: "rgba(99,102,241,0.07)" }
        : { borderColor: "#0ea5e9", color: "#0ea5e9", background: "rgba(14,165,233,0.07)" }
      }
    >
      {text}
    </span>
  );
}

/* ── Main Sidebar ────────────────────────────────────────── */
export function Sidebar() {
  const pathname  = usePathname();
  const router    = useRouter();
  const { sidebarCollapsed, toggleSidebar } = useUIStore();
  const { logoutApi, user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const isDark    = theme === "dark";
  const navGroups = useNavGroups();

  const shopName  = user?.branch?.name ?? "FashionERP";
  const initials  = shopName.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const planLabel = user?.role === "super_admin" ? "Enterprise" : user?.role === "admin" ? "Pro" : "Starter";

  const handleLogout = async () => { await logoutApi(); router.replace("/login"); };

  /* ── single nav item renderer ── */
  const renderItem = (item: NavItem, groupIdx: number) => {
    const isActive = !!item.href && (pathname === item.href || pathname.startsWith(item.href + "/"));
    const Icon = item.icon;
    const key = `${groupIdx}-${item.label}`;

    const inner = item.href ? (
      <Link
        key={key}
        href={item.href}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-xl text-sm transition-all duration-150 select-none",
          sidebarCollapsed ? "h-11 w-11 justify-center mx-auto" : "h-9 px-3 w-full",
        )}
        style={isActive
          ? { background: "rgba(99,102,241,0.1)", color: "#4f46e5" }
          : { color: "hsl(var(--sidebar-foreground)/0.65)" }
        }
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.65)"; }}}
      >
        <Icon className={cn("shrink-0 h-[18px] w-[18px]", isActive && "text-indigo-500")} strokeWidth={isActive ? 2.2 : 1.8} />
        {!sidebarCollapsed && (
          <>
            <span className={cn("truncate flex-1 leading-none", isActive ? "font-semibold text-indigo-600" : "font-medium")}>{item.label}</span>
            {item.badge && <NavBadge text={item.badge} />}
          </>
        )}
      </Link>
    ) : (
      <button
        key={key}
        onClick={item.action}
        className={cn(
          "group relative flex items-center gap-2.5 rounded-xl text-sm transition-all duration-150 select-none cursor-pointer",
          sidebarCollapsed ? "h-11 w-11 justify-center mx-auto" : "h-9 px-3 w-full",
        )}
        style={{ color: "hsl(var(--sidebar-foreground)/0.65)" }}
        onMouseEnter={e => { e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
        onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.65)"; }}
      >
        <Icon className="shrink-0 h-[18px] w-[18px]" strokeWidth={1.8} />
        {!sidebarCollapsed && (
          <>
            <span className="truncate flex-1 leading-none font-medium">{item.label}</span>
            {item.badge && <NavBadge text={item.badge} />}
          </>
        )}
      </button>
    );

    if (sidebarCollapsed) {
      return (
        <Tooltip key={key}>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">{item.label}{item.badge ? ` · ${item.badge}` : ""}</TooltipContent>
        </Tooltip>
      );
    }
    return <React.Fragment key={key}>{inner}</React.Fragment>;
  };

  /* ── collapsed icon button helper ── */
  const collapsedBtn = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>
        <button onClick={onClick}
          className="flex h-10 w-10 items-center justify-center mx-auto rounded-xl transition-colors"
          style={{ color: "hsl(var(--sidebar-foreground)/0.6)" }}
          onMouseEnter={e => { e.currentTarget.style.background = danger ? "rgba(239,68,68,0.1)" : "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = danger ? "#ef4444" : "hsl(var(--sidebar-foreground))"; }}
          onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.6)"; }}
        >{icon}</button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 68 : 248 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-screen flex-col shrink-0 overflow-hidden"
        style={{ background: "hsl(var(--sidebar-background))", borderRight: "1px solid hsl(var(--sidebar-border))" }}
      >

        {/* ── Header: shop avatar + name + collapse btn ── */}
        <div className={cn("flex items-center shrink-0 gap-3 px-3 py-4", sidebarCollapsed && "justify-center")}>
          {/* Avatar */}
          <div
            className="h-10 w-10 rounded-xl shrink-0 flex items-center justify-center text-white font-bold text-sm select-none"
            style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
          >
            {initials}
          </div>

          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold leading-tight truncate" style={{ color: "hsl(var(--sidebar-foreground))" }}>{shopName}</p>
                <p className="text-xs font-semibold mt-0.5" style={{ color: "#6366f1" }}>{planLabel}</p>
              </div>
              {/* Collapse button */}
              <button
                onClick={toggleSidebar}
                className="h-7 w-7 flex items-center justify-center rounded-lg border transition-colors shrink-0"
                style={{ borderColor: "hsl(var(--sidebar-border))", color: "hsl(var(--sidebar-foreground)/0.4)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.4)"; e.currentTarget.style.background = ""; }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {sidebarCollapsed && (
            <button
              onClick={toggleSidebar}
              className="absolute right-1 top-4 h-6 w-6 flex items-center justify-center rounded-md border transition-colors"
              style={{ borderColor: "hsl(var(--sidebar-border))", color: "hsl(var(--sidebar-foreground)/0.4)", background: "hsl(var(--sidebar-background))" }}
              onMouseEnter={e => { e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.4)"; }}
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* ── Divider ── */}
        <div className="mx-3 h-px shrink-0" style={{ background: "hsl(var(--sidebar-border))" }} />

        {/* ── Nav groups ── */}
        <ScrollArea className="flex-1">
          <nav className={cn("py-2", sidebarCollapsed ? "px-1.5" : "px-2.5")}>
            {navGroups.map((group, gi) => (
              <div key={group.title} className={gi > 0 ? "mt-4" : ""}>
                {/* Section label */}
                {!sidebarCollapsed && (
                  <p className="px-3 mb-1 text-[10px] font-semibold tracking-wider uppercase select-none"
                    style={{ color: "hsl(var(--sidebar-foreground)/0.35)" }}>
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item, ii) => renderItem(item, gi * 100 + ii))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        {/* ── Divider ── */}
        <div className="mx-3 h-px shrink-0" style={{ background: "hsl(var(--sidebar-border))" }} />

        {/* ── Bottom actions ── */}
        <div className={cn("shrink-0 py-2 space-y-0.5", sidebarCollapsed ? "px-1.5 flex flex-col items-center" : "px-2.5")}>
          {sidebarCollapsed ? (
            <>
              {collapsedBtn(<Settings className="h-[17px] w-[17px]" />, "Settings", () => router.push("/settings"))}
              {collapsedBtn(<Moon className="h-[17px] w-[17px]" />, isDark ? "Light Mode" : "Dark Mode", () => setTheme(isDark ? "light" : "dark"))}
              {collapsedBtn(<LogOut className="h-[17px] w-[17px]" />, "Logout", handleLogout, true)}
            </>
          ) : (
            <>
              <Link href="/settings"
                className="flex h-9 items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors"
                style={{ color: "hsl(var(--sidebar-foreground)/0.65)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "hsl(var(--sidebar-accent))"; e.currentTarget.style.color = "hsl(var(--sidebar-foreground))"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.65)"; }}
              >
                <Settings className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />
                <span className="flex-1">Settings</span>
              </Link>

              {/* Dark mode row */}
              <div className="flex h-9 items-center gap-2.5 rounded-xl px-3" style={{ color: "hsl(var(--sidebar-foreground)/0.65)" }}>
                <Moon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />
                <span className="text-sm font-medium flex-1">Dark Mode</span>
                <button
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className="relative h-5 w-9 rounded-full transition-colors duration-200 shrink-0"
                  style={{ background: isDark ? "#6366f1" : "hsl(var(--sidebar-border))" }}
                >
                  <motion.span
                    className="absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white shadow-sm"
                    animate={{ left: isDark ? "calc(100% - 17px)" : "3px" }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                </button>
              </div>

              <button onClick={handleLogout}
                className="flex h-9 w-full items-center gap-2.5 rounded-xl px-3 text-sm font-medium transition-colors"
                style={{ color: "hsl(var(--sidebar-foreground)/0.65)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.07)"; e.currentTarget.style.color = "#ef4444"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = "hsl(var(--sidebar-foreground)/0.65)"; }}
              >
                <LogOut className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} />
                <span>Logout</span>
              </button>
            </>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
