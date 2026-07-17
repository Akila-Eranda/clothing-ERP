"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, ShoppingCart, History, RotateCcw, Users,
  Package, Layers, Bookmark, Warehouse, Truck, ShoppingBag,
  Wallet, TrendingDown,   BarChart3, Zap, FileBarChart,
  UserCog, Building2, GitBranch, Settings, LogOut, Moon, ChevronLeft, ChevronRight,
  Car, FileText, Wrench, KeyRound, Banknote, ClipboardList, Calendar, Cog, CalendarClock, Landmark, UserCheck, CalendarDays, Bell,
  ChevronDown, Scale, BookOpen, FileCheck, PackageCheck, ScrollText, Skull, Clock3, ArrowLeftRight, AlertTriangle, List, Activity, Clock, Shield,
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
  /** Extra path prefixes excluded when deciding if this item owns the current URL */
  peerHrefs?: string[];
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
  const peerHrefs = [
    ...((item.children ?? []).map((c) => c.href).filter(Boolean) as string[]),
    ...(item.peerHrefs ?? []),
  ];
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
    { label: L["/inventory"] ?? "Stock Levels", href: "/inventory", icon: Warehouse },
    { label: L["/inventory/ledger"] ?? "Inventory Ledger", href: "/inventory/ledger", icon: ScrollText },
    { label: L["/inventory/abc"] ?? "ABC Analysis", href: "/inventory/abc", icon: BarChart3 },
    { label: L["/inventory/dead-stock"] ?? "Dead Stock", href: "/inventory/dead-stock", icon: Skull },
    { label: L["/inventory/aging"] ?? "Stock Aging", href: "/inventory/aging", icon: Clock3 },
    { label: L["/inventory/transfers"] ?? "Stock Transfers", href: "/inventory/transfers", icon: ArrowLeftRight },
  ];

  const expiryChildren: NavItem[] = [
    { label: L["/inventory/expiry"] ?? "Dashboard", href: "/inventory/expiry", icon: CalendarClock },
    { label: L["/inventory/expiry/near"] ?? "Near Expiry", href: "/inventory/expiry/near", icon: AlertTriangle },
    { label: L["/inventory/expiry/expired"] ?? "Expired", href: "/inventory/expiry/expired", icon: Skull },
    { label: L["/inventory/expiry/lots"] ?? "All Active Lots", href: "/inventory/expiry/lots", icon: List },
    { label: L["/inventory/expiry/transactions"] ?? "Batch Transactions", href: "/inventory/expiry/transactions", icon: ScrollText },
    { label: L["/inventory/expiry/reconcile"] ?? "Reconciliation", href: "/inventory/expiry/reconcile", icon: Scale },
  ];

  /** Catalog only — keeps product setup separate from stock ops */
  const catalogItems: NavItem[] = [
    { label: L["/products"], href: "/products", icon: Package },
    { label: L["/categories"], href: "/categories", icon: Layers },
    ...(hasShopModule(profile, "brands") ? [{ label: L["/brands"], href: "/brands", icon: Bookmark }] : []),
    ...(hasShopModule(profile, "vehicles") ? [{ label: L["/vehicles"], href: "/vehicles", icon: Car }] : []),
    ...(hasShopModule(profile, "warranty") ? [{ label: L["/warranty"], href: "/warranty", icon: Wrench }] : []),
    ...(hasShopModule(profile, "workshop") ? [{ label: L["/job-cards"], href: "/job-cards", icon: ClipboardList }] : []),
    ...(hasShopModule(profile, "workshop") ? [{ label: L["/services"], href: "/services", icon: Cog }] : []),
    ...(hasShopModule(profile, "appointments") ? [{ label: L["/appointments"], href: "/appointments", icon: Calendar }] : []),
  ];

  /** Stock, warehouse, expiry — one clear Inventory section */
  const inventoryItems: NavItem[] = [
    {
      label: "Inventory",
      icon: Warehouse,
      href: "/inventory",
      peerHrefs: ["/inventory/expiry"],
      children: inventoryChildren,
    },
    { label: L["/warehouse"] ?? "Warehouse", href: "/warehouse", icon: Building2 },
    ...(hasShopModule(profile, "expiry") || hasShopModule(profile, "batch")
      ? [{
          label: "Expiry",
          icon: CalendarClock,
          href: "/inventory/expiry",
          children: expiryChildren,
        }]
      : []),
    ...(!skipWorkflows ? [{ label: L["/workflows"], href: "/workflows", icon: GitBranch }] : []),
  ];

  const accountingChildren: NavItem[] = [
    { label: L["/accounting"] ?? "Overview", href: "/accounting", icon: BookOpen },
    { label: L["/accounting/accounts"] ?? "Chart of Accounts", href: "/accounting/accounts", icon: List },
    { label: L["/accounting/journals"] ?? "GL Journals", href: "/accounting/journals", icon: ScrollText },
    { label: L["/accounting/reports"] ?? "Financial Reports", href: "/accounting/reports", icon: BarChart3 },
    { label: L["/accounting/ar-ap"] ?? "AR / AP", href: "/accounting/ar-ap", icon: Users },
    { label: L["/accounting/cash-bank"] ?? "Cash & Bank", href: "/accounting/cash-bank", icon: Landmark },
    { label: L["/accounting/finance/cheques"] ?? "Cheques", href: "/accounting/finance/cheques", icon: FileCheck },
    { label: L["/accounting/vat"] ?? "VAT / Tax", href: "/accounting/vat", icon: FileText },
    { label: L["/accounting/petty-cash"] ?? "Petty Cash", href: "/accounting/petty-cash", icon: Wallet },
    { label: L["/accounting/payroll"] ?? "Payroll", href: "/accounting/payroll", icon: UserCheck },
    { label: L["/accounting/periods"] ?? "Periods", href: "/accounting/periods", icon: CalendarDays },
    { label: L["/accounting/audit"] ?? "Audit Trail", href: "/accounting/audit", icon: Shield },
    { label: L["/accounting/settings"] ?? "Settings", href: "/accounting/settings", icon: Settings },
  ];

  const accountingItem: NavItem = {
    label: "Accounting",
    icon: BookOpen,
    href: "/accounting",
    peerHrefs: [
      "/accounting/finance",
      "/accounting/credit",
      "/accounting/journals",
      "/accounting/ar-ap",
      "/accounting/cash-bank",
      "/accounting/finance/cheques",
      "/accounting/vat",
      "/accounting/petty-cash",
      "/accounting/payroll",
      "/accounting/periods",
      "/accounting/audit",
      "/accounting/transactions",
      "/accounting/accounts",
      "/accounting/banking",
    ],
    children: accountingChildren,
  };

  const salesItems: NavItem[] = [
    { label: "Point of Sale", icon: ShoppingCart, badge: "POS", action: openPos },
    { label: L["/sales"], href: "/sales", icon: History },
    ...(hasShopModule(profile, "quotations") ? [{ label: L["/quotations"], href: "/quotations", icon: FileText }] : []),
    ...(hasShopModule(profile, "returns") ? [{ label: L["/returns"], href: "/returns", icon: RotateCcw }] : []),
    { label: L["/customers"], href: "/customers", icon: Users },
  ];

  const reportItems: NavItem[] = [
    {
      label: "Reports & Analytics",
      icon: FileBarChart,
      href: "/reports",
      children: [
        { label: L["/reports"] ?? "Overview", href: "/reports", icon: LayoutDashboard },
        { label: L["/reports/sales"] ?? "Sales", href: "/reports/sales", icon: ShoppingCart },
        { label: L["/reports/purchases"] ?? "Purchases", href: "/reports/purchases", icon: ShoppingBag },
        { label: L["/reports/inventory"] ?? "Inventory", href: "/reports/inventory", icon: Package },
        { label: L["/reports/suppliers"] ?? "Suppliers", href: "/reports/suppliers", icon: Truck },
        { label: L["/reports/customers"] ?? "Customers", href: "/reports/customers", icon: Users },
        { label: L["/reports/cashier"] ?? "Cashier", href: "/reports/cashier", icon: UserCheck },
        { label: L["/reports/branches"] ?? "Branches", href: "/reports/branches", icon: Building2 },
        { label: L["/reports/tax"] ?? "Tax", href: "/reports/tax", icon: Scale },
        { label: L["/reports/expiry"] ?? "Expiry", href: "/reports/expiry", icon: CalendarClock },
        { label: L["/reports/cheques"] ?? "Cheques", href: "/reports/cheques", icon: FileCheck },
        { label: L["/reports/commission"] ?? "Commission", href: "/reports/commission", icon: Banknote },
        { label: L["/reports/financial"] ?? "Financial", href: "/reports/financial", icon: Wallet },
      ],
    },
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
    { title: S.products, items: catalogItems },
    { title: S.inventory, items: inventoryItems },
    {
      title: S.procurement,
      items: [
        { label: L["/suppliers"], href: "/suppliers", icon: Truck },
        { label: L["/purchases"], href: "/purchases", icon: ShoppingBag },
        { label: L["/purchases/grn"] ?? "Goods Receipt", href: "/purchases/grn", icon: PackageCheck },
        { label: L["/purchases/procurement"] ?? "Procurement Hub", href: "/purchases/procurement", icon: ClipboardList },
      ],
    },
    {
      title: S.finance,
      items: [
        accountingItem,
        { label: L["/calendar"] ?? "Business Calendar", href: "/calendar", icon: CalendarDays },
        { label: L["/cash"] ?? "Cash Registers", href: "/cash", icon: Banknote },
        { label: L["/expenses"], href: "/expenses", icon: TrendingDown },
        { label: L["/analytics"], href: "/analytics", icon: BarChart3 },
        { label: L["/advanced"], href: "/advanced", icon: Zap },
      ],
    },
    { title: S.reports, items: reportItems },
    {
      title: S.hr,
      items: [
        {
          label: "HR & Payroll",
          icon: UserCog,
          href: "/hr",
          children: [
            { label: L["/hr"] ?? "Employees", href: "/hr", icon: Users },
            { label: L["/hr/attendance"] ?? "Attendance", href: "/hr/attendance", icon: Clock },
            { label: L["/hr/payroll"] ?? "Payroll", href: "/hr/payroll", icon: Banknote },
            { label: L["/hr/leaves"] ?? "Leaves", href: "/hr/leaves", icon: CalendarDays },
          ],
        },
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
      className="ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none"
      style={isPOS
        ? { color: "#C7D2FE", background: "rgba(99,102,241,0.28)" }
        : { color: "#7DD3FC", background: "rgba(14,165,233,0.18)" }
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

  /* Sidebar stays dark blue in both light & dark app themes */
  const bg       = "#0B1B3A";
  const border   = "#1E3356";
  const textMut  = "rgba(186, 208, 240, 0.72)";
  const textFull = "#FFFFFF";
  const hoverBg  = "rgba(99, 102, 241, 0.12)";
  const sectLbl  = "rgba(148, 173, 210, 0.55)";
  const activeBg = "rgba(99, 102, 241, 0.22)";
  const activeFg = "#A5B4FC";
  const logoBg   = "#071428";

  const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>({});

  /* ── leaf link / action button ── */
  const renderLeaf = (item: NavItem, key: string, nested = false, peerHrefs: string[] = []) => {
    const isActive = pathMatches(pathname, item.href, peerHrefs);
    const Icon = item.icon;

    const className = cn(
      "group relative flex items-center gap-3 rounded-lg transition-all duration-150 select-none",
      sidebarCollapsed ? "h-10 w-10 justify-center mx-auto" : "h-10 w-full",
      !sidebarCollapsed && (nested ? "pl-8 pr-2.5" : "px-2.5"),
      isActive && !sidebarCollapsed && "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-white",
    );

    const style = isActive
      ? { background: activeBg, color: activeFg }
      : { background: "transparent", color: textMut };

    const body = (
      <>
        <Icon
          className={cn(
            "shrink-0",
            nested && !sidebarCollapsed ? "h-3.5 w-3.5" : "h-[18px] w-[18px]",
            isActive && "text-[#A5B4FC]",
          )}
          strokeWidth={isActive ? 2.2 : 1.75}
        />
        {!sidebarCollapsed && (
          <>
            <span
              className={cn(
                "flex-1 truncate leading-none",
                nested ? "text-[12.5px]" : "text-[13.5px]",
                isActive ? "font-semibold text-[#A5B4FC]" : "font-medium",
              )}
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
        onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = textMut; }}}
      >
        {body}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => { item.action?.(); closeMobile(); }}
        className={cn(className, "cursor-pointer")}
        style={{ background: "transparent", color: textMut }}
        onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textFull; }}
        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = textMut; }}
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
  const renderItem = (item: NavItem, groupIdx: number, groupTitle: string, groupPeers: string[] = []) => {
    const key = `${groupIdx}-${item.label}`;
    const menuKey = `${groupTitle}-${item.label}`;
    const hasChildren = !!item.children?.length;

    if (!hasChildren) {
      return renderLeaf(item, key, false, [...groupPeers, ...(item.peerHrefs ?? [])]);
    }

    const peerHrefs = [
      ...item.children!.map((c) => c.href).filter(Boolean) as string[],
      ...(item.peerHrefs ?? []),
      ...groupPeers,
    ];
    const childActive = itemOrChildActive(pathname, { ...item, peerHrefs });
    const open = openMenus[menuKey] ?? childActive;
    const Icon = item.icon;

    const onToggle = () => setOpenMenus((prev) => ({ ...prev, [menuKey]: !open }));

    if (sidebarCollapsed) {
      const collapsedInner = (
        <div
          className="flex h-10 w-10 items-center justify-center mx-auto rounded-lg transition-colors"
          style={childActive
            ? { background: activeBg, color: activeFg }
            : { color: textMut }}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={childActive ? 2.2 : 1.75} />
        </div>
      );
      return (
        <div key={key} className="space-y-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              {item.href ? (
                <Link href={item.href} onClick={closeMobile}>{collapsedInner}</Link>
              ) : (
                <button type="button" onClick={onToggle}>{collapsedInner}</button>
              )}
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
                        pathMatches(pathname, child.href, peerHrefs) && "font-semibold text-[#A5B4FC]",
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
        <div
          className={cn(
            "group relative flex items-center gap-3 rounded-lg transition-all duration-150 select-none h-10 px-2.5 w-full",
            childActive && "before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-[3px] before:rounded-full before:bg-white",
          )}
          style={childActive
            ? { background: activeBg, color: activeFg }
            : { background: "transparent", color: textMut }}
          onMouseEnter={e => { if (!childActive) { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textFull; }}}
          onMouseLeave={e => { if (!childActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = textMut; }}}
        >
          {item.href ? (
            <Link
              href={item.href}
              onClick={() => {
                setOpenMenus((prev) => ({ ...prev, [menuKey]: true }));
                closeMobile();
              }}
              className="flex flex-1 items-center gap-3 min-w-0"
            >
              <Icon
                className={cn("shrink-0 h-[18px] w-[18px]", childActive && "text-[#A5B4FC]")}
                strokeWidth={childActive ? 2.2 : 1.75}
              />
              <span
                className={cn("flex-1 text-[13.5px] leading-none truncate text-left", childActive ? "font-semibold text-[#A5B4FC]" : "font-medium")}
              >
                {item.label}
              </span>
            </Link>
          ) : (
            <button type="button" onClick={onToggle} className="flex flex-1 items-center gap-3 min-w-0 cursor-pointer text-left">
              <Icon
                className={cn("shrink-0 h-[18px] w-[18px]", childActive && "text-[#A5B4FC]")}
                strokeWidth={childActive ? 2.2 : 1.75}
              />
              <span
                className={cn("flex-1 text-[13.5px] leading-none truncate text-left", childActive ? "font-semibold text-[#A5B4FC]" : "font-medium")}
              >
                {item.label}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
            className="p-1 rounded-md hover:bg-white/10"
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
          >
            <ChevronDown
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
              strokeWidth={1.8}
            />
          </button>
        </div>
        {open && (
          <div className="mt-0.5 space-y-0.5 border-l ml-4 pl-0" style={{ borderColor: "rgba(30,51,86,0.9)" }}>
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
          className="flex h-10 w-10 items-center justify-center mx-auto rounded-lg transition-colors"
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
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
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
              ? { background: logoBg, border: `1px solid ${border}` }
              : { background: logoBg, border: `1px solid ${border}` }}
          >
            {logoSrc ? (
              <img
                src={logoSrc}
                alt={shopName}
                className="h-full w-full object-contain p-1"
              />
            ) : (
              <AppLogo variant="sidebar" theme="dark" className="h-full w-full items-center justify-center" alt={APP_NAME} />
            )}
          </div>

          {!sidebarCollapsed && (
            <>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-bold leading-snug" style={{ color: textFull }}>{shopName}</p>
                <p className="text-[11px] font-medium leading-snug mt-0.5" style={{ color: textMut }}>{profile.label}</p>
                <p className="text-xs font-semibold leading-snug mt-0.5" style={{ color: "#A5B4FC" }}>{planLabel}</p>
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
          <nav className={cn("py-2.5", sidebarCollapsed ? "px-1.5" : "px-2")}>
            {navGroups.map((group, gi) => (
              <div key={group.title} className={gi > 0 ? "mt-4" : ""}>
                {!sidebarCollapsed && (
                  <p className="px-2.5 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] leading-none select-none"
                    style={{ color: sectLbl }}>
                    {group.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item, ii) => {
                    const groupPeers = group.items.flatMap((sib) => {
                      const hrefs: string[] = [];
                      if (sib.href) hrefs.push(sib.href);
                      for (const c of sib.children ?? []) {
                        if (c.href) hrefs.push(c.href);
                      }
                      if (sib.peerHrefs) hrefs.push(...sib.peerHrefs);
                      return hrefs;
                    });
                    return renderItem(item, gi * 100 + ii, group.title, groupPeers);
                  })}
                </div>
              </div>
            ))}
          </nav>
        </ScrollArea>

        <div className="mx-3 h-px shrink-0" style={{ background: border }} />

        <div className={cn("shrink-0 py-2 space-y-0.5", sidebarCollapsed ? "px-1.5 flex flex-col items-center" : "px-2")}>
          {sidebarCollapsed ? (
            <>
              {collapsedBtn(<Settings className="h-4 w-4" />, "Settings", () => { closeMobile(); router.push("/settings"); })}
              {collapsedBtn(<Moon className="h-4 w-4" />, isDark ? "Light Mode" : "Dark Mode", () => setTheme(isDark ? "light" : "dark"))}
              {collapsedBtn(<LogOut className="h-4 w-4" />, "Logout", handleLogout, true)}
            </>
          ) : (
            <>
              <Link href="/settings" onClick={closeMobile}
                className="flex h-10 items-center gap-3 rounded-lg px-2.5 font-medium transition-colors"
                style={{ color: textMut }}
                onMouseEnter={e => { e.currentTarget.style.background = hoverBg; e.currentTarget.style.color = textFull; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}
              >
                <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span className="flex-1 text-[13.5px]">Settings</span>
              </Link>

              <div className="flex h-10 items-center gap-3 rounded-lg px-2.5" style={{ color: textMut }}>
                <Moon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span className="text-[13.5px] font-medium flex-1">Dark Mode</span>
                <button
                  type="button"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className="relative h-5 w-9 rounded-full transition-colors duration-200 shrink-0"
                  style={{ background: isDark ? "#6366f1" : "#1E3356" }}
                >
                  <motion.span
                    className="absolute top-[3px] h-[14px] w-[14px] rounded-full bg-white shadow-sm"
                    animate={{ left: isDark ? "calc(100% - 17px)" : "3px" }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                </button>
              </div>

              <button type="button" onClick={handleLogout}
                className="flex h-10 w-full items-center gap-3 rounded-lg px-2.5 font-medium transition-colors"
                style={{ color: textMut }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#f87171"; }}
                onMouseLeave={e => { e.currentTarget.style.background = ""; e.currentTarget.style.color = textMut; }}
              >
                <LogOut className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span className="text-[13.5px]">Logout</span>
              </button>
            </>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
