"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, ShoppingCart, History, RotateCcw, Users,
  Package, Layers, Bookmark, Warehouse, Truck, ShoppingBag,
  Wallet, TrendingDown, BarChart3, Zap, FileBarChart,
  UserCog, Building2, GitBranch, Settings, LogOut, Moon, ChevronLeft, ChevronRight,
  Car, FileText, Wrench, KeyRound, Banknote, ClipboardList, Calendar, Cog, CalendarClock, Landmark, UserCheck, CalendarDays, Bell,
  ChevronDown, Scale, BookOpen, FileCheck,
} from "lucide-react";
import { cn, planTierFromRole } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getSidebarLabels, getSidebarSectionTitles, hasShopModule } from "@/lib/shop-vertical";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";
import { APP_NAME } from "@/lib/constants";
import { AppLogo } from "@/components/brand/app-logo";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { resolvePublicAssetUrl } from "@/lib/upload";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ── Types ─────────────────────────────────────────────── */
interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  badge?: string;
  action?: () => void;
  children?: NavItem[];
}
interface NavGroup { title: string; items: NavItem[] }

function pathMatches(pathname: string, href?: string, peerHrefs: string[] = []) {
  if (!href) return false;
  if (pathname === href) return true;
  if (!pathname.startsWith(href + "/")) return false;
  // Prefer the most specific peer (e.g. /inventory/expiry over /inventory)
  return !peerHrefs.some(
    (h) => h !== href && (pathname === h || pathname.startsWith(h + "/")) && h.startsWith(href),
  );
}

function itemOrChildActive(pathname: string, item: NavItem): boolean {
  const peerHrefs = (item.children ?? []).map((c) => c.href).filter(Boolean) as string[];
  if (pathMatches(pathname, item.href, peerHrefs)) return true;
  return !!item.children?.some((c) => pathMatches(pathname, c.href, peerHrefs));
}

/* ── Navigation structure ────────────────────────────────── */
function useNavGroups(): NavGroup[] {
  const { openPos } = useUIStore();
  const { user } = useAuthStore();
  const skipWorkflows = bypassesWorkflowApproval(user?.role);
  const { profile, workspace: ws } = useShopWorkspace();
  const L = getSidebarLabels(ws, profile);
  const S = getSidebarSectionTitles(profile);

  const inventoryChildren: NavItem[] = [
    { label: L["/products"], href: "/products", icon: Package },
    { label: L["/categories"], href: "/categories", icon: Layers },
    ...(hasShopModule(profile, "brands") ? [{ label: L["/brands"], href: "/brands", icon: Bookmark }] : []),
    { label: L["/inventory"], href: "/inventory", icon: Warehouse },
    { label: L["/warehouse"] ?? "Warehouse", href: "/warehouse", icon: Building2 },
    ...(hasShopModule(profile, "expiry") || hasShopModule(profile, "batch")
      ? [{ label: L["/inventory/expiry"], href: "/inventory/expiry", icon: CalendarClock }]
      : []),
    ...(hasShopModule(profile, "vehicles") ? [{ label: L["/vehicles"], href: "/vehicles", icon: Car }] : []),
    ...(hasShopModule(profile, "warranty") ? [{ label: L["/warranty"], href: "/warranty", icon: Wrench }] : []),
    ...(hasShopModule(profile, "workshop") ? [{ label: L["/job-cards"], href: "/job-cards", icon: ClipboardList }] : []),
    ...(hasShopModule(profile, "workshop") ? [{ label: L["/services"], href: "/services", icon: Cog }] : []),
    ...(hasShopModule(profile, "appointments") ? [{ label: L["/appointments"], href: "/appointments", icon: Calendar }] : []),
    ...(!skipWorkflows ? [{ label: L["/workflows"], href: "/workflows", icon: GitBranch }] : []),
  ];

  const productItems: NavItem[] = [
    {
      label: L["/inventory"],
      icon: Warehouse,
      href: "/inventory",
      children: inventoryChildren,
    },
  ];

  const financeHubChildren: NavItem[] = [
    { label: L["/accounting/finance/payable"] ?? "Payable", href: "/accounting/finance/payable", icon: Scale },
    { label: L["/accounting/finance/receivable"] ?? "Receivable", href: "/accounting/finance/receivable", icon: Wallet },
    { label: L["/accounting/finance/cash-book"] ?? "Cash Book", href: "/accounting/finance/cash-book", icon: BookOpen },
    { label: L["/accounting/finance/banks"] ?? "Banks", href: "/accounting/finance/banks", icon: Landmark },
    { label: L["/accounting/finance/cheques"] ?? "Cheques", href: "/accounting/finance/cheques", icon: FileCheck },
    { label: L["/accounting/finance/reconciliation"] ?? "Reconciliation", href: "/accounting/finance/reconciliation", icon: Building2 },
  ];

  const financeHubItem: NavItem = {
    label: L["/accounting/finance"] ?? "Finance Hub",
    icon: Landmark,
    href: "/accounting/finance",
    children: financeHubChildren,
  };

  const salesItems: NavItem[] = [
    { label: "Point of Sale", icon: ShoppingCart, badge: "POS", action: openPos },
    { label: L["/sales"], href: "/sales", icon: History },
    ...(hasShopModule(profile, "quotations") ? [{ label: L["/quotations"], href: "/quotations", icon: FileText }] : []),
    ...(hasShopModule(profile, "returns") ? [{ label: L["/returns"], href: "/returns", icon: RotateCcw }] : []),
    { label: L["/customers"], href: "/customers", icon: Users },
  ];

  const reportItems: NavItem[] = [
    { label: L["/reports"], href: "/reports", icon: FileBarChart },
    ...(hasShopModule(profile, "promotions") ? [{ label: L["/promotions"], href: "/promotions", icon: Zap }] : []),
  ];

  return [
    {
      title: S.overview,
      items: [
        { label: L["/dashboard"], href: "/dashboard", icon: LayoutDashboard },
        { label: L["/notifications"] ?? "Notifications", href: "/notifications", icon: Bell },
      ],
    },
    { title: S.sales, items: salesItems },
    { title: S.products, items: productItems },
    {
      title: S.procurement,
      items: [
        { label: L["/suppliers"], href: "/suppliers", icon: Truck },
        { label: L["/purchases"], href: "/purchases", icon: ShoppingBag },
        { label: L["/purchases/procurement"] ?? "Procurement Hub", href: "/purchases/procurement", icon: ClipboardList },
      ],
    },
    {
      title: S.finance,
      items: [
        { label: L["/accounting"], href: "/accounting", icon: Wallet },
        financeHubItem,
        { label: L["/accounting/credit"] ?? "Customer Credit", href: "/accounting/credit", icon: UserCheck },
        { label: L["/calendar"] ?? "Business Calendar", href: "/calendar", icon: CalendarDays },
        { label: L["/cash"], href: "/cash", icon: Banknote, badge: "NEW" },
        { label: L["/expenses"], href: "/expenses", icon: TrendingDown },
        { label: L["/analytics"], href: "/analytics", icon: BarChart3 },
        { label: L["/advanced"], href: "/advanced", icon: Zap },
      ],
    },
    { title: S.reports, items: reportItems },
    {
      title: S.hr,
      items: [
        { label: L["/hr"], href: "/hr", icon: UserCog },
        { label: L["/branches"], href: "/branches", icon: Building2 },
        { label: L["/users"], href: "/users", icon: KeyRound },
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
  const { sidebarCollapsed, toggleSidebar, setMobileSidebarOpen } = useUIStore();
  const { logoutApi, user } = useAuthStore();
  const { theme, setTheme } = useTheme();
  const isDark    = theme === "dark";
  const navGroups = useNavGroups();
  const { profile } = useShopWorkspace();
  const { settings: receiptSettings } = useReceiptSettings();

  const logoSrc = resolvePublicAssetUrl(receiptSettings.logoUrl);
  const shopName = receiptSettings.shopName?.trim() || user?.branch?.name || APP_NAME;
  const planLabel = planTierFromRole(user?.role);

  const closeMobile = () => setMobileSidebarOpen(false);

  const handleLogout = async () => {
    closeMobile();
    await logoutApi();
    router.replace("/login");
  };

  /* ── theme-aware palette ── */
  const bg       = isDark ? "#0f172a" : "#ffffff";
  const border   = isDark ? "#1e293b" : "#e5e7eb";
  const textMut  = isDark ? "rgba(255,255,255,0.72)" : "#374151";
  const textFull = isDark ? "#ffffff" : "#111827";
  const hoverBg  = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)";
  const sectLbl  = isDark ? "rgba(255,255,255,0.5)" : "#6b7280";

  const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>({});

  /* ── leaf link / action button ── */
  const renderLeaf = (item: NavItem, key: string, nested = false, peerHrefs: string[] = []) => {
    const isActive = pathMatches(pathname, item.href, peerHrefs);
    const Icon = item.icon;

    const className = cn(
      "group relative flex items-center gap-3 rounded-xl transition-all duration-150 select-none",
      sidebarCollapsed ? "h-11 w-11 justify-center mx-auto" : "min-h-11 py-2 w-full",
      !sidebarCollapsed && (nested ? "pl-9 pr-3" : "px-3"),
    );

    const style = isActive
      ? { background: "rgba(99,102,241,0.12)", color: "#4f46e5" }
      : { color: textMut };

    const body = (
      <>
        <Icon
          className={cn(
            "shrink-0",
            nested && !sidebarCollapsed ? "h-4 w-4" : "h-5 w-5",
            isActive && "text-indigo-500",
            !isActive && !isDark && "text-black",
          )}
          strokeWidth={isActive ? 2.2 : 1.8}
        />
        {!sidebarCollapsed && (
          <>
            <span
              className={cn(
                "flex-1 leading-snug",
                nested ? "text-[13px]" : "text-[14px]",
                isActive ? "font-semibold text-indigo-600" : "font-medium",
              )}
              style={!isActive && !isDark ? { color: "#000000" } : undefined}
              title={item.label}
            >
              {item.label}
            </span>
            {item.badge && <NavBadge text={item.badge} />}
          </>
        )}
      </>
    );

    const inner = item.href ? (
      <Link
        href={item.href}
        onClick={closeMobile}
        className={className}
        style={style}
        onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textFull; }}}
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}}
      >
        {body}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => { item.action?.(); closeMobile(); }}
        className={cn(className, "cursor-pointer")}
        style={{ color: textMut }}
        onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textFull; }}
        onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}
      >
        {body}
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
    return <div key={key}>{inner}</div>;
  };

  /* ── single nav item renderer (supports dropdown children) ── */
  const renderItem = (item: NavItem, groupIdx: number, groupTitle: string) => {
    const key = `${groupIdx}-${item.label}`;
    const menuKey = `${groupTitle}-${item.label}`;
    const hasChildren = !!item.children?.length;

    if (!hasChildren) {
      return renderLeaf(item, key);
    }

    const peerHrefs = item.children!.map((c) => c.href).filter(Boolean) as string[];
    const childActive = itemOrChildActive(pathname, item);
    const open = openMenus[menuKey] ?? childActive;
    const Icon = item.icon;

    const onToggle = () => setOpenMenus((prev) => ({ ...prev, [menuKey]: !open }));

    if (sidebarCollapsed) {
      return (
        <div key={key} className="space-y-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onToggle}
                className="flex h-11 w-11 items-center justify-center mx-auto rounded-xl transition-colors"
                style={childActive
                  ? { background: "rgba(99,102,241,0.12)", color: "#4f46e5" }
                  : { color: textMut }}
              >
                <Icon className="h-5 w-5" strokeWidth={childActive ? 2.2 : 1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="text-xs p-0 overflow-hidden">
              <div className="py-1 min-w-[160px]">
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">{item.label}</p>
                {item.children!.map((child) => (
                  child.href ? (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={closeMobile}
                      className={cn(
                        "block px-3 py-1.5 text-xs hover:bg-accent",
                        pathMatches(pathname, child.href, peerHrefs) && "font-semibold text-indigo-600",
                      )}
                    >
                      {child.label}
                    </Link>
                  ) : null
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        </div>
      );
    }

    return (
      <div key={key}>
        <button
          type="button"
          onClick={onToggle}
          className="group relative flex items-center gap-3 rounded-xl transition-all duration-150 select-none min-h-11 py-2 px-3 w-full cursor-pointer"
          style={childActive
            ? { background: "rgba(99,102,241,0.08)", color: "#4f46e5" }
            : { color: textMut }}
          onMouseEnter={e => { if (!childActive) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textFull; }}}
          onMouseLeave={e => { if (!childActive) { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}}
        >
          <Icon
            className={cn("shrink-0 h-5 w-5", childActive && "text-indigo-500", !childActive && !isDark && "text-black")}
            strokeWidth={childActive ? 2.2 : 1.8}
          />
          <span
            className={cn("flex-1 text-[14px] leading-snug text-left", childActive ? "font-semibold text-indigo-600" : "font-medium")}
            style={!childActive && !isDark ? { color: "#000000" } : undefined}
          >
            {item.label}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform duration-200", open && "rotate-180")}
            strokeWidth={1.8}
          />
        </button>
        {open && (
          <div className="mt-0.5 space-y-0.5 border-l ml-5 pl-0" style={{ borderColor: border }}>
            {item.children!.map((child, ci) => renderLeaf(child, `${key}-c${ci}`, true, peerHrefs))}
          </div>
        )}
      </div>
    );
  };

  /* ── collapsed icon button helper ── */
  const collapsedBtn = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>
        <button type="button" onClick={onClick}
          className="flex h-11 w-11 items-center justify-center mx-auto rounded-xl transition-colors"
          style={{ color: textMut }}
          onMouseEnter={e => { e.currentTarget.style.background = danger ? "rgba(239,68,68,0.1)" : hoverBg; e.currentTarget.style.color = danger ? "#ef4444" : textFull; }}
          onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}
        >{icon}</button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        initial={false}
        animate={{ width: sidebarCollapsed ? 68 : 260 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
        className="relative flex h-screen flex-col shrink-0 overflow-hidden"
        style={{ background: bg, borderRight: `1px solid ${border}` }}
      >

        {/* ── Header: shop avatar + name + collapse btn ── */}
        <div className={cn("flex items-center shrink-0 gap-3 px-3 py-4", sidebarCollapsed && "justify-center")}>
          <div
            className={cn(
              "h-11 w-11 rounded-xl shrink-0 flex items-center justify-center select-none overflow-hidden",
              !logoSrc && "text-xl",
            )}
            style={logoSrc
              ? { background: isDark ? "#1e293b" : "#f8fafc", border: `1px solid ${border}` }
              : { background: isDark ? "#070d1a" : "#f8fafc", border: `1px solid ${border}` }}
          >
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={shopName}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <AppLogo variant="sidebar" theme="auto" className="h-full w-full items-center justify-center" alt={APP_NAME} />
            )}
          </div>

          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold leading-snug" style={{ color: textFull }}>{shopName}</p>
                <p className="text-[11px] font-medium leading-snug mt-0.5" style={{ color: textMut }}>{profile.label}</p>
                <p className="text-xs font-semibold leading-snug mt-0.5" style={{ color: "#6366f1" }}>{planLabel}</p>
              </div>
              <button
                type="button"
                onClick={toggleSidebar}
                className="h-7 w-7 flex items-center justify-center rounded-lg border transition-colors shrink-0"
                style={{ borderColor: border, color: textMut }}
                onMouseEnter={e => { e.currentTarget.style.color = textFull; e.currentTarget.style.background = hoverBg; }}
                onMouseLeave={e => { e.currentTarget.style.color = textMut; e.currentTarget.style.background = ""; }}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            </>
          )}

          {sidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="absolute right-1 top-4 h-6 w-6 flex items-center justify-center rounded-md border transition-colors"
              style={{ borderColor: border, color: textMut, background: bg }}
              onMouseEnter={e => { e.currentTarget.style.color = textFull; }}
              onMouseLeave={e => { e.currentTarget.style.color = textMut; }}
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="mx-3 h-px shrink-0" style={{ background: border }} />

        <ScrollArea className="flex-1">
          <nav className={cn("py-2", sidebarCollapsed ? "px-1.5" : "px-2.5")}>
            {navGroups.map((group, gi) => (
              <div key={group.title} className={gi > 0 ? "mt-4" : ""}>
                {!sidebarCollapsed && (
                  <p className="px-3 mb-1.5 text-xs font-semibold leading-snug select-none"
                    style={{ color: sectLbl }}>
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item, ii) => renderItem(item, gi * 100 + ii, group.title))}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className="mx-3 h-px shrink-0" style={{ background: border }} />

        <div className={cn("shrink-0 py-2 space-y-0.5", sidebarCollapsed ? "px-1.5 flex flex-col items-center" : "px-2.5")}>
          {sidebarCollapsed ? (
            <>
              {collapsedBtn(<Settings className="h-[17px] w-[17px]" />, "Settings", () => { closeMobile(); router.push("/settings"); })}
              {collapsedBtn(<Moon className="h-[17px] w-[17px]" />, isDark ? "Light Mode" : "Dark Mode", () => setTheme(isDark ? "light" : "dark"))}
              {collapsedBtn(<LogOut className="h-[17px] w-[17px]" />, "Logout", handleLogout, true)}
            </>
          ) : (
            <>
              <Link href="/settings" onClick={closeMobile}
                className="flex h-11 items-center gap-3 rounded-xl px-3 font-medium transition-colors"
                style={{ color: textMut }}
                onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textFull; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}
              >
                <Settings className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span className="flex-1 text-[15px]">Settings</span>
              </Link>

              <div className="flex h-11 items-center gap-3 rounded-xl px-3" style={{ color: textMut }}>
                <Moon className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span className="text-[15px] font-medium flex-1">Dark Mode</span>
                <button
                  type="button"
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

              <button type="button" onClick={handleLogout}
                className="flex h-11 w-full items-center gap-3 rounded-xl px-3 font-medium transition-colors"
                style={{ color: textMut }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.07)"; e.currentTarget.style.color = "#ef4444"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}
              >
                <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.8} />
                <span className="text-[15px]">Logout</span>
              </button>
            </>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
