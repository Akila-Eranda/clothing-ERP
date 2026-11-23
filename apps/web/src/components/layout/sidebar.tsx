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
  ChevronDown, Scale, BookOpen, FileCheck, PackageCheck, ScrollText, Skull, Clock3, ArrowLeftRight, AlertTriangle, List, Clock, Shield, Briefcase, Tag, Undo2, Shirt,
  MapPin, Palette, DoorOpen, Ruler, Search, X, Sun,
} from "lucide-react";
import { ShopType } from "@/lib/shop-profiles";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { getSidebarLabels, getSidebarSectionTitles, hasShopModule } from "@/lib/shop-vertical";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";
import { isDefaultLightSidebar, SIDEBAR_SKIN_SWATCHES } from "@/lib/theme-layout";
import { resolveSidebarSkin } from "@/lib/sidebar-skin-palette";
import { useThemeLayoutStore } from "@/stores/theme-layout-store";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AppLogo } from "@/components/brand/app-logo";
import { useSidebarLogoOnDark } from "@/hooks/use-sidebar-logo-theme";
import { useUnreadNotifications } from "@/hooks/use-unread-notifications";
import { filterNavByClaims, readNavClaims } from "@/lib/nav-access";
import { accentForWhiteText } from "@/lib/color-contrast";
import { resolveAccentHsl } from "@/lib/theme-colors";
import { useThemeColorsStore } from "@/stores/theme-colors-store";
import { tokenStorage } from "@/lib/api";

/* ── Types ─────────────────────────────────────────────── */
interface NavItem {
  label: string;
  href?: string;
  icon: React.ElementType;
  badge?: string;
  /** Numeric count shown as a red pill (e.g. unread notifications). */
  count?: number;
  action?: () => void;
  children?: NavItem[];
  /** Non-clickable label used to divide long dropdown menus. */
  sectionLabel?: boolean;
  /** Extra path prefixes excluded when deciding if this item owns the current URL */
  peerHrefs?: string[];
}
interface NavGroup { title: string; icon: React.ElementType; items: NavItem[] }

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
    ...(hasShopModule(profile, "collections") ? [{ label: L["/collections"] ?? "Collections", href: "/collections", icon: Shirt }] : []),
    ...(hasShopModule(profile, "vehicles") ? [{ label: L["/vehicles"], href: "/vehicles", icon: Car }] : []),
    ...(hasShopModule(profile, "warranty") ? [{ label: L["/warranty"], href: "/warranty", icon: Wrench }] : []),
    ...(hasShopModule(profile, "workshop") ? [{ label: L["/job-cards"], href: "/job-cards", icon: ClipboardList }] : []),
    ...(hasShopModule(profile, "workshop") ? [{ label: L["/services"], href: "/services", icon: Cog }] : []),
    ...(hasShopModule(profile, "appointments") ? [{ label: L["/appointments"], href: "/appointments", icon: Calendar }] : []),
  ];

  /** Clothing fashion ops — module-gated; never shown for other verticals */
  const fashionItems: NavItem[] = [
    ...(hasShopModule(profile, "storeLocations")
      ? [{ label: L["/store-locations"] ?? "Store Locations", href: "/store-locations", icon: MapPin }]
      : []),
    ...(hasShopModule(profile, "colorMaster")
      ? [{ label: L["/fashion-colors"] ?? "Colors", href: "/fashion-colors", icon: Palette }]
      : []),
    ...(hasShopModule(profile, "outfits")
      ? [{ label: L["/outfits"] ?? "Outfits", href: "/outfits", icon: Shirt }]
      : []),
    ...(hasShopModule(profile, "fittingRoom")
      ? [{ label: L["/fitting-rooms"] ?? "Fitting Rooms", href: "/fitting-rooms", icon: DoorOpen }]
      : []),
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
    { label: "Advanced Accounting", icon: Zap, sectionLabel: true },
    { label: "Command Center", href: "/accounting/advanced", icon: Zap },
    { label: L["/accounting/vat"] ?? "VAT / Tax", href: "/accounting/vat", icon: FileText },
    { label: L["/accounting/petty-cash"] ?? "Petty Cash", href: "/accounting/petty-cash", icon: Wallet },
    { label: L["/accounting/payroll"] ?? "Payroll", href: "/accounting/payroll", icon: UserCheck },
    { label: L["/accounting/fixed-assets"] ?? "Fixed Assets", href: "/accounting/fixed-assets", icon: Building2 },
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
      "/accounting/advanced",
      "/accounting/vat",
      "/accounting/petty-cash",
      "/accounting/payroll",
      "/accounting/fixed-assets",
      "/accounting/periods",
      "/accounting/audit",
      "/accounting/transactions",
      "/accounting/accounts",
      "/accounting/banking",
    ],
    children: accountingChildren,
  };

  const salesItems: NavItem[] = [
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
        ...(profile.type === "CLOTHING" || hasShopModule(profile, "collections")
          ? [{ label: L["/reports/fashion"] ?? "Fashion Analytics", href: "/reports/fashion", icon: Shirt }]
          : []),
        ...(profile.type === ShopType.CLOTHING
          ? [{ label: L["/reports/fashion-reorder"] ?? "Fashion Reorder", href: "/reports/fashion-reorder", icon: Ruler }]
          : []),
      ],
    },
    ...(hasShopModule(profile, "promotions") ? [{ label: L["/promotions"], href: "/promotions", icon: Zap }] : []),
  ];

  return [
    {
      title: S.overview,
      icon: LayoutDashboard,
      items: [
        { label: L["/dashboard"], href: "/dashboard", icon: LayoutDashboard },
        { label: L["/calendar"] ?? "Business Calendar", href: "/calendar", icon: CalendarDays },
        { label: L["/notifications"] ?? "Notifications", href: "/notifications", icon: Bell },
      ],
    },
    { title: S.sales, icon: ShoppingCart, items: salesItems },
    { title: S.products, icon: Layers, items: catalogItems },
    ...(fashionItems.length > 0 ? [{ title: S.fashion ?? "Fashion", icon: Shirt, items: fashionItems }] : []),
    { title: S.inventory, icon: Warehouse, items: inventoryItems },
    {
      title: S.procurement,
      icon: Truck,
      items: [
        { label: L["/suppliers"], href: "/suppliers", icon: Truck },
        { label: L["/purchases"], href: "/purchases", icon: ShoppingBag },
        { label: L["/purchases/grn"] ?? "Goods Receipt", href: "/purchases/grn", icon: PackageCheck },
        { label: L["/purchases/purchase-returns"] ?? "Purchase Returns", href: "/purchases/purchase-returns", icon: Undo2 },
        { label: L["/purchases/procurement"] ?? "Procurement Hub", href: "/purchases/procurement", icon: ClipboardList },
        { label: L["/purchases/supplier-payments"] ?? "Supplier Payments", href: "/purchases/supplier-payments", icon: Wallet },
      ],
    },
    {
      title: S.finance,
      icon: Landmark,
      items: [
        accountingItem,
        { label: L["/cash"] ?? "Cash Registers", href: "/cash", icon: Banknote },
        { label: L["/expenses"], href: "/expenses", icon: TrendingDown },
        { label: L["/analytics"], href: "/analytics", icon: BarChart3 },
        { label: L["/advanced"], href: "/advanced", icon: Zap },
      ],
    },
    { title: S.reports, icon: FileBarChart, items: reportItems },
    {
      title: S.hr,
      icon: UserCog,
      items: [
        {
          label: "HR & Payroll",
          icon: UserCog,
          href: "/hr",
          children: [
            { label: L["/hr"] ?? "Employees", href: "/hr", icon: Users },
            { label: "Departments", href: "/hr/departments", icon: Building2 },
            { label: "Designations", href: "/hr/designations", icon: Briefcase },
            { label: "Shifts", href: "/hr/shifts", icon: Clock },
            { label: L["/hr/attendance"] ?? "Attendance", href: "/hr/attendance", icon: Clock },
            { label: L["/hr/leaves"] ?? "Leaves", href: "/hr/leaves", icon: CalendarDays },
            { label: "Leave Types", href: "/hr/leave-types", icon: Tag },
            { label: "Holidays", href: "/hr/holidays", icon: CalendarDays },
            { label: L["/hr/payroll"] ?? "Payroll", href: "/hr/payroll", icon: Banknote },
          ],
        },
        { label: L["/branches"], href: "/branches", icon: Building2 },
        { label: L["/users"], href: "/users", icon: KeyRound },
      ],
    },
  ];
}

/* ── Constants & helpers ─────────────────────────────────── */
const SIDEBAR_WIDTH = 250;
const SIDEBAR_COLLAPSED_WIDTH = 68;

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary)/0.5)]";

function isEditable(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/** Hrefs of every sibling — used so the most specific route wins when highlighting. */
function groupPeersOf(items: NavItem[]): string[] {
  return items.flatMap((sib) => {
    const hrefs: string[] = [];
    if (sib.href) hrefs.push(sib.href);
    for (const c of sib.children ?? []) if (c.href) hrefs.push(c.href);
    if (sib.peerHrefs) hrefs.push(...sib.peerHrefs);
    return hrefs;
  });
}

function menuKeyOf(groupTitle: string, item: NavItem) {
  return `${groupTitle}-${item.label}`;
}

/** Which groups / submenus own the current route (used to auto-expand them). */
function computeActive(groups: NavGroup[], pathname: string) {
  const groupsOpen: Record<string, boolean> = {};
  const menusOpen: Record<string, boolean> = {};
  for (const group of groups) {
    const groupPeers = groupPeersOf(group.items);
    for (const item of group.items) {
      const peers = [...(item.children ?? []).map((c) => c.href).filter(Boolean) as string[], ...(item.peerHrefs ?? []), ...groupPeers];
      if (item.children?.length) {
        if (itemOrChildActive(pathname, { ...item, peerHrefs: peers })) {
          groupsOpen[group.title] = true;
          menusOpen[menuKeyOf(group.title, item)] = true;
        }
      } else if (pathMatches(pathname, item.href, [...groupPeers, ...(item.peerHrefs ?? [])])) {
        groupsOpen[group.title] = true;
      }
    }
  }
  return { groupsOpen, menusOpen };
}

/** Smooth height animation without measuring (grid-rows trick). */
function Collapse({ open, id, children }: { open: boolean; id?: string; children: React.ReactNode }) {
  return (
    <div
      id={id}
      className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden" inert={!open}>
        {children}
      </div>
    </div>
  );
}

/* ── Badge components ────────────────────────────────────── */
function NavBadge({ text, onSkin }: { text: string; onSkin?: boolean }) {
  const isPOS = text === "POS";
  return (
    <span
      className={cn(
        "ml-auto shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide leading-none",
        onSkin
          ? "bg-[var(--sb-active-bg)] text-[var(--sb-fg)]"
          : isPOS ? "bg-primary/15 text-primary-text" : "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400",
      )}
    >
      {text}
    </span>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      className="ml-auto flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
      aria-label={`${count} unread`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/* ── Main Sidebar ────────────────────────────────────────── */
interface SidebarProps {
  /** Rendered inside the off-canvas drawer: always expanded, shows a close button. */
  mobile?: boolean;
  /** Tablet rail: always collapsed, no expand control. */
  forceCollapsed?: boolean;
}

interface SearchEntry {
  label: string;
  href: string;
  icon: React.ElementType;
  trail: string;
}

export function Sidebar({ mobile = false, forceCollapsed = false }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { sidebarCollapsed: storedCollapsed, toggleSidebar, setSidebarCollapsed, setMobileSidebarOpen } = useUIStore();
  const collapsed = !mobile && (forceCollapsed || storedCollapsed);
  const uid = React.useId().replace(/:/g, "");
  const sidebarId = mobile ? "hex-sidebar-mobile" : forceCollapsed ? "hex-sidebar-tablet" : "hex-sidebar-desktop";
  const { logoutApi } = useAuthStore();
  const { setTheme, resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const sidebarSkin = useThemeLayoutStore((s) => s.sidebarSkin);
  const dreamsDarkChrome = isDark && isDefaultLightSidebar(sidebarSkin);
  const logoOnDark = useSidebarLogoOnDark();
  const baseGroups = useNavGroups();
  const unread = useUnreadNotifications(pathname);
  const accessToken = useAuthStore((st) => st.accessToken);
  const themeColors = useThemeColorsStore();

  /* Role-based navigation: hide what the user's token permissions cannot open (server still enforces). */
  const claims = React.useMemo(
    () => readNavClaims(tokenStorage.getAccess() ?? accessToken),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accessToken, pathname],
  );

  /* Attach the live unread count to the Notifications entry (no route changes). */
  const navGroups = React.useMemo<NavGroup[]>(
    () =>
      filterNavByClaims(
        baseGroups.map((g) => ({
          ...g,
          items: g.items.map((it) => (it.href === "/notifications" ? { ...it, count: unread } : it)),
        })),
        claims,
      ),
    [baseGroups, unread, claims],
  );

  const closeMobile = React.useCallback(() => setMobileSidebarOpen(false), [setMobileSidebarOpen]);

  const handleLogout = async () => {
    closeMobile();
    await logoutApi();
    router.replace("/login");
  };

  /* ── Colors (skin-aware; exposed as CSS variables so hover/focus use classes) ── */
  // Coloured skins: foreground/muted/hover/active are derived from the skin's actual gradient (WCAG AA), never forced white.
  const skinPalette = React.useMemo(() => {
    if (isDefaultLightSidebar(sidebarSkin)) return undefined;
    const css = SIDEBAR_SKIN_SWATCHES.find((s) => s.id === sidebarSkin)?.css;
    return css ? resolveSidebarSkin(css) : undefined;
  }, [sidebarSkin]);
  const coloredSkinCss = skinPalette?.css;
  // Logo follows the resolved foreground on coloured skins (white logo only where text is light).
  const brandOnDark = skinPalette ? skinPalette.tone === "light-text" : logoOnDark;
  const chrome = {
    bg: "var(--chrome-bg, #0F172A)",
    border: "var(--chrome-border, #334155)",
    muted: "var(--chrome-muted, #94A3B8)",
    fg: "var(--chrome-fg, #F8FAFC)",
    hover: "var(--chrome-hover, rgba(255,255,255,0.06))",
    activeBg: "var(--chrome-active-bg, rgba(37,99,235,0.18))",
    activeFg: "var(--chrome-active-fg, #93C5FD)",
  };
  const accentHsl = resolveAccentHsl(themeColors, isDark);
  const theme = {
    bg: dreamsDarkChrome
      ? chrome.bg
      : (coloredSkinCss ?? `var(--retail-sidebar-bg, ${isDark ? "#0F172A" : "#ffffff"})`),
    border: dreamsDarkChrome
      ? chrome.border
      : (skinPalette ? skinPalette.border : `var(--retail-sidebar-border, ${isDark ? "#334155" : "#E2E8F0"})`),
    // Dark chrome muted (#6B7280 by default) is ~4.0:1 on #0D0D0D; lift it toward slate-300 for AA text contrast.
    muted: dreamsDarkChrome
      ? `color-mix(in srgb, ${chrome.muted} 50%, #CBD5E1)`
      : (skinPalette ? skinPalette.muted : `var(--retail-sidebar-muted, ${isDark ? "#94A3B8" : "#64748B"})`),
    fg: dreamsDarkChrome
      ? chrome.fg
      : (skinPalette ? skinPalette.fg : `var(--retail-sidebar-fg, ${isDark ? "#F8FAFC" : "#0F172A"})`),
    hover: dreamsDarkChrome
      ? chrome.hover
      : (skinPalette ? skinPalette.hover : `var(--retail-sidebar-hover, ${isDark ? "rgba(255,255,255,0.05)" : "#F1F5F9"})`),
    activeBg: dreamsDarkChrome
      ? chrome.activeBg
      : (skinPalette ? skinPalette.activeBg : "var(--retail-sidebar-active-bg, #EFF6FF)"),
    activeFg: dreamsDarkChrome
      ? chrome.activeFg
      : (skinPalette
          ? skinPalette.activeFg
          : isDark
            ? "var(--retail-sidebar-active-fg, #93C5FD)"
            // Accent text on its pale tint: unchanged-looking brand blue, darkened only if an accent needs it.
            : accentForWhiteText(accentHsl, 5.3)),
    // White text on the solid pill: the brand blue (#2563EB) already passes and is left untouched.
    solidBg: skinPalette ? skinPalette.activeBg : accentForWhiteText(accentHsl, 4.6),
    // Label colour on the solid active pill: skin foreground on coloured skins, white on the accent pill otherwise.
    solidFg: skinPalette ? skinPalette.activeFg : "#ffffff",
    surface: skinPalette ? skinPalette.hover : isDark ? "rgba(30,41,59,0.55)" : "rgba(241,245,249,0.5)",
  };
  const cssVars = {
    "--sb-bg": theme.bg,
    "--sb-border": theme.border,
    "--sb-muted": theme.muted,
    "--sb-fg": theme.fg,
    "--sb-hover": theme.hover,
    "--sb-active-bg": theme.activeBg,
    "--sb-active-fg": theme.activeFg,
    "--sb-solid-bg": theme.solidBg,
    "--sb-solid-fg": theme.solidFg,
    "--sb-surface": theme.surface,
    background: theme.bg,
    borderRight: `1px solid ${theme.border}`,
  } as React.CSSProperties;

  /* ── Expand state ── */
  const initial = React.useMemo(() => computeActive(navGroups, pathname), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [openMenus, setOpenMenus] = React.useState<Record<string, boolean>>(initial.menusOpen);

  /* Auto-expand the owner of the current route on navigation / refresh. */
  // `navGroups` is a fresh array each render, so key the effect on a stable signature instead.
  const navSig = navGroups.map((g) => g.title + ":" + g.items.map((i) => i.href ?? i.label).join(",")).join("|");
  const navGroupsRef = React.useRef(navGroups);
  navGroupsRef.current = navGroups;
  React.useEffect(() => {
    const a = computeActive(navGroupsRef.current, pathname);
    const merge = (p: Record<string, boolean>, add: Record<string, boolean>) =>
      Object.keys(add).every((k) => p[k]) ? p : { ...p, ...add };
    setOpenMenus((p) => merge(p, a.menusOpen));
  }, [pathname, navSig]);

  /* ── Search ── */
  const [query, setQuery] = React.useState("");
  const [searchIdx, setSearchIdx] = React.useState(0);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const q = query.trim().toLowerCase();

  const searchEntries = React.useMemo<SearchEntry[]>(() => {
    const out: SearchEntry[] = [];
    for (const g of navGroups) {
      for (const it of g.items) {
        if (it.href && !it.sectionLabel) out.push({ label: it.label, href: it.href, icon: it.icon, trail: g.title });
        for (const c of it.children ?? []) {
          if (c.href && !c.sectionLabel) out.push({ label: c.label, href: c.href, icon: c.icon, trail: g.title.trim().toLowerCase() === it.label.trim().toLowerCase() ? it.label : `${g.title} › ${it.label}` });
        }
      }
    }
    return out;
  }, [navGroups]);

  const results = React.useMemo(
    () => (q ? searchEntries.filter((e) => e.label.toLowerCase().includes(q) || e.trail.toLowerCase().includes(q)) : []),
    [q, searchEntries],
  );

  React.useEffect(() => setSearchIdx(0), [q]);

  const go = (href: string) => {
    setQuery("");
    closeMobile();
    router.push(href);
  };

  /* Alt+M focuses the menu search. Ctrl/Cmd+K stays with the header's global search. */
  React.useEffect(() => {
    if (forceCollapsed) return;
    const onKey = (e: KeyboardEvent) => {
      // e.code so the shortcut works on layouts where Alt+M types a symbol (macOS "µ").
      if (!(e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyM")) return;
      const input = searchRef.current;
      if (isEditable(e.target) && e.target !== input) return;
      // Only the instance that is actually on screen reacts.
      const visible = collapsed ? true : !!input && input.offsetParent !== null;
      const host = document.getElementById(sidebarId);
      if (!visible || !host || host.offsetParent === null) return;
      e.preventDefault();
      if (collapsed) {
        setSidebarCollapsed(false);
        setTimeout(() => searchRef.current?.focus(), 250);
      } else {
        input?.focus();
        input?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, sidebarId, forceCollapsed, setSidebarCollapsed]);

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (query) setQuery("");
      else e.currentTarget.blur();
    } else if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setSearchIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setSearchIdx((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[searchIdx]) {
      e.preventDefault();
      go(results[searchIdx].href);
    }
  };

  /* ── Row renderers ── */
  const iconSize = "h-[18px] w-[18px]";

  const renderLeaf = (item: NavItem, key: string, nested: boolean, peerHrefs: string[]) => {
    if (item.sectionLabel) {
      if (collapsed) return <div key={key} className="mx-auto my-2 h-px w-6" style={{ background: theme.border }} />;
      const SectionIcon = item.icon;
      return (
        <div key={key} className="px-3 pb-1 pt-2.5">
          <div className="mb-1.5 h-px w-full" style={{ background: theme.border }} />
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--sb-muted)]">
            <SectionIcon className="h-3 w-3" strokeWidth={2} />
            <span>{item.label}</span>
          </div>
        </div>
      );
    }

    const active = pathMatches(pathname, item.href, peerHrefs);
    const Icon = item.icon;
    const count = item.count ?? 0;

    const cls = cn(
      "group relative flex items-center rounded-[10px] transition-colors duration-150 select-none",
      FOCUS_RING,
      collapsed ? "mx-auto h-10 w-10 justify-center" : "h-9 w-full gap-3",
      !collapsed && (nested ? "pl-3 pr-2.5" : "px-3"),
      active
        ? nested
          ? "bg-[var(--sb-active-bg)] font-semibold text-[var(--sb-active-fg)]"
          : "bg-[var(--sb-solid-bg)] font-semibold text-[var(--sb-solid-fg)] shadow-sm"
        : "font-medium text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-fg)]",
    );

    const body = (
      <>
        {nested && active && !collapsed ? (
          <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--sb-active-fg)]" />
          </span>
        ) : (
          <span className="relative flex shrink-0">
            <Icon className={iconSize} strokeWidth={active ? 2 : 1.75} />
            {collapsed && count > 0 && (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-[var(--sb-bg)]" />
            )}
          </span>
        )}
        {!collapsed && (
          <>
            <span className="flex-1 truncate text-left text-[13.5px] leading-none">
              {item.label}
            </span>
            {count > 0 && <CountBadge count={count} />}
            {item.badge && <NavBadge text={item.badge} onSkin={Boolean(skinPalette)} />}
          </>
        )}
      </>
    );

    const inner = item.href ? (
      <Link href={item.href} onClick={closeMobile} className={cls} aria-current={active ? "page" : undefined} aria-label={collapsed ? item.label : undefined}>
        {body}
      </Link>
    ) : (
      <button
        type="button"
        onClick={() => {
          item.action?.();
          closeMobile();
        }}
        className={cn(cls, "cursor-pointer")}
        aria-label={collapsed ? item.label : undefined}
      >
        {body}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip key={key}>
          <TooltipTrigger asChild>{inner}</TooltipTrigger>
          <TooltipContent side="right" className="text-xs">
            {item.label}
            {item.badge ? ` · ${item.badge}` : ""}
          </TooltipContent>
        </Tooltip>
      );
    }
    return <div key={key}>{inner}</div>;
  };

  const renderItem = (item: NavItem, groupTitle: string, groupPeers: string[]) => {
    const key = menuKeyOf(groupTitle, item);
    const hasChildren = !!item.children?.length;
    if (!hasChildren) return renderLeaf(item, key, false, [...groupPeers, ...(item.peerHrefs ?? [])]);

    const peerHrefs = [
      ...(item.children!.map((c) => c.href).filter(Boolean) as string[]),
      ...(item.peerHrefs ?? []),
      ...groupPeers,
    ];
    const childActive = itemOrChildActive(pathname, { ...item, peerHrefs });
    const open = openMenus[key] ?? childActive;
    const Icon = item.icon;
    const onToggle = () => setOpenMenus((prev) => ({ ...prev, [key]: !open }));
    const panelId = `${uid}-sub-${key.replace(/[^a-zA-Z0-9]/g, "-")}`;

    if (collapsed) {
      const trigger = (
        <div
          className={cn(
            "mx-auto flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors",
            childActive
              ? "bg-[var(--sb-solid-bg)] text-[var(--sb-solid-fg)] shadow-sm"
              : "text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-fg)]",
          )}
        >
          <Icon className={iconSize} strokeWidth={childActive ? 2 : 1.75} />
        </div>
      );
      return (
        <Tooltip key={key}>
          <TooltipTrigger asChild>
            {item.href ? (
              <Link href={item.href} onClick={closeMobile} aria-label={item.label} className={cn("block rounded-[10px]", FOCUS_RING)}>
                {trigger}
              </Link>
            ) : (
              <button type="button" onClick={onToggle} aria-label={item.label} className={cn("block w-full rounded-[10px]", FOCUS_RING)}>
                {trigger}
              </button>
            )}
          </TooltipTrigger>
          <TooltipContent side="right" className="overflow-hidden p-0 text-xs">
            <div className="min-w-[170px] py-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-60">{item.label}</p>
              {item.children!.map((child) =>
                child.href ? (
                  <Link
                    key={child.href + child.label}
                    href={child.href}
                    onClick={closeMobile}
                    className={cn("block px-3 py-1.5 hover:bg-accent", pathMatches(pathname, child.href, peerHrefs) && "font-semibold text-primary")}
                  >
                    {child.label}
                  </Link>
                ) : null,
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      );
    }

    const labelCls = "flex min-w-0 flex-1 items-center gap-3 text-left";
    const labelInner = (
      <>
        <Icon className={cn(iconSize, "shrink-0")} strokeWidth={childActive ? 2 : 1.75} />
        <span className="flex-1 truncate text-[13.5px] leading-none">{item.label}</span>
      </>
    );

    return (
      <div key={key}>
        <div
          className={cn(
            "flex h-9 w-full items-center rounded-[10px] pl-3 pr-1 transition-colors duration-150",
            childActive
              ? "bg-[var(--sb-active-bg)] font-semibold text-[var(--sb-active-fg)]"
              : "font-medium text-[var(--sb-muted)] hover:bg-[var(--sb-hover)] hover:text-[var(--sb-fg)]",
          )}
        >
          {item.href ? (
            <Link
              href={item.href}
              onClick={() => {
                setOpenMenus((p) => ({ ...p, [key]: true }));
                closeMobile();
              }}
              className={cn(labelCls, "rounded-md", FOCUS_RING)}
            >
              {labelInner}
            </Link>
          ) : (
            <button type="button" onClick={onToggle} className={cn(labelCls, "cursor-pointer rounded-md", FOCUS_RING)}>
              {labelInner}
            </button>
          )}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-controls={panelId}
            aria-label={open ? `Collapse ${item.label}` : `Expand ${item.label}`}
            className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md hover:bg-[var(--sb-hover)]", FOCUS_RING)}
          >
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} strokeWidth={2} />
          </button>
        </div>
        <Collapse open={open} id={panelId}>
          <div className="ml-[21px] mt-0.5 space-y-0.5 border-l pl-1.5" style={{ borderColor: theme.border }}>
            {item.children!.map((child, ci) => renderLeaf(child, `${key}-c${ci}`, true, peerHrefs))}
          </div>
        </Collapse>
      </div>
    );
  };

  const renderGroup = (group: NavGroup, gi: number) => {
    const peers = groupPeersOf(group.items);
    const items = group.items.map((item) => renderItem(item, group.title, peers));

    if (collapsed) {
      return (
        <div key={group.title} className={cn("space-y-0.5", gi > 0 && "mt-2 border-t pt-2")} style={{ borderColor: theme.border }}>
          {items}
        </div>
      );
    }

    const GroupIcon = group.icon;
    const hasActive = !!computeActive([group], pathname).groupsOpen[group.title];
    // Flat sidebar: every group is always expanded (no dropdown).
    const open = true;
    const panelId = `${uid}-grp-${gi}`;

    return (
      <div key={group.title}>
        <div
          role="presentation"
          className={cn(
            "flex items-center gap-2 px-3 pb-1.5 pt-3 text-[10.5px] font-bold uppercase tracking-[0.12em]",
            hasActive ? "text-[var(--sb-active-fg)]" : "text-[var(--sb-muted)]",
          )}
        >
          <GroupIcon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={2} />
          <span className="truncate">{group.title}</span>
        </div>
        <Collapse open={open} id={panelId}>
          <div className="space-y-0.5 pb-0.5">{items}</div>
        </Collapse>
      </div>
    );
  };

  /* ── Footer helpers ── */
  const footerRow =
    "flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-[13.5px] font-medium text-[var(--sb-muted)] transition-colors hover:bg-[var(--sb-hover)] hover:text-[var(--sb-fg)]";

  const collapsedBtn = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "mx-auto flex h-10 w-10 items-center justify-center rounded-[10px] text-[var(--sb-muted)] transition-colors",
            FOCUS_RING,
            danger ? "hover:bg-destructive/10 hover:text-destructive-text" : "hover:bg-[var(--sb-hover)] hover:text-[var(--sb-fg)]",
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="text-xs">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        id={sidebarId}
        aria-label="Main navigation"
        initial={false}
        animate={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_WIDTH }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className="hex-retail-sidebar relative flex h-screen shrink-0 flex-col overflow-hidden"
        style={{ ...cssVars, maxWidth: mobile ? "85vw" : undefined }}
      >
        {/* ── Header: logo + collapse ── */}
        <div
          className={cn(
            "hex-sidebar-brand relative flex shrink-0 items-center",
            collapsed ? "flex-col gap-2 px-2 py-3" : "gap-2 px-4 py-3.5",
          )}
        >
          {!collapsed ? (
            <Link href="/dashboard" onClick={closeMobile} className="flex min-w-0 flex-1 items-center" aria-label="HEXALYTE dashboard">
              <AppLogo variant="sidebar" theme={brandOnDark ? "dark" : "light"} className="!w-auto !items-start" />
            </Link>
          ) : (
            <Link href="/dashboard" onClick={closeMobile} className="flex items-center justify-center" aria-label="Dashboard">
              <img
                src={brandOnDark ? "/brand/hexalyte-white.png?v=20260903" : "/brand/hexalyte-innovation.png?v=20260903"}
                alt="HEXALYTE"
                // The brand file is the wide wordmark; crop to its left-hand globe mark (no new artwork).
                className="h-8 w-8 object-cover object-left"
              />
            </Link>
          )}

          {mobile ? (
            <button
              type="button"
              onClick={closeMobile}
              aria-label="Close menu"
              className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border text-[var(--sb-muted)] hover:bg-[var(--sb-hover)]", FOCUS_RING)}
              style={{ borderColor: theme.border }}
            >
              <X className="h-4 w-4" />
            </button>
          ) : !forceCollapsed ? (
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              className={cn(
                "flex shrink-0 items-center justify-center rounded-[10px] border text-[var(--sb-muted)] shadow-sm transition-colors hover:bg-[var(--sb-hover)] hover:text-[var(--sb-fg)]",
                FOCUS_RING,
                collapsed ? "h-7 w-7" : "h-8 w-8",
              )}
              style={{ borderColor: theme.border }}
            >
              {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-4 w-4" />}
            </button>
          ) : null}
        </div>

        {/* ── Search ── */}
        <div className={cn("shrink-0 pb-2", collapsed ? "px-2" : "px-3.5")}>
          {collapsed ? (
            !forceCollapsed &&
            collapsedBtn(<Search className="h-[18px] w-[18px]" />, "Search menu (Alt+M)", () => {
              setSidebarCollapsed(false);
              setTimeout(() => searchRef.current?.focus(), 250);
            })
          ) : (
            <div
              className="relative flex h-10 items-center rounded-xl border transition-shadow focus-within:ring-2 focus-within:ring-[hsl(var(--primary)/0.35)]"
              style={{ borderColor: theme.border, background: theme.surface }}
            >
              <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[var(--sb-muted)]" strokeWidth={1.9} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder="Search menu…"
                aria-label="Search menu"
                role="combobox"
                aria-expanded={!!q}
                aria-controls={q ? `${uid}-results` : undefined}
                aria-activedescendant={results[searchIdx] ? `${uid}-result-${searchIdx}` : undefined}
                autoComplete="off"
                spellCheck={false}
                className="h-full w-full bg-transparent pl-9 pr-14 text-[13.5px] text-[var(--sb-fg)] outline-none placeholder:text-[var(--sb-muted)]"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className={cn("absolute right-2 flex h-6 w-6 items-center justify-center rounded-md text-[var(--sb-muted)] hover:bg-[var(--sb-hover)]", FOCUS_RING)}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <kbd
                  className="pointer-events-none absolute right-2.5 hidden rounded-md border px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-[var(--sb-fg)] md:block"
                  style={{ borderColor: theme.border }}
                >
                  Alt M
                </kbd>
              )}
            </div>
          )}
        </div>

        <div className="mx-3.5 h-px shrink-0" style={{ background: theme.border }} />

        {/* ── Scrolling menu ── */}
        <ScrollArea className="min-h-0 flex-1">
          <nav className={cn("py-2.5", collapsed ? "px-2" : "px-3")} aria-label="Primary">
            {q && !collapsed ? (
              <div id={`${uid}-results`} role="listbox" aria-label="Menu search results">
                {results.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                    <Search className="h-6 w-6 text-[var(--sb-muted)] opacity-60" strokeWidth={1.5} />
                    <p className="text-[13px] font-medium text-[var(--sb-fg)]">No menu items found</p>
                    <p className="text-xs text-[var(--sb-muted)]">Nothing matches “{query.trim()}”. Try a different word.</p>
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className={cn("mt-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--sb-active-fg)] hover:bg-[var(--sb-active-bg)]", FOCUS_RING)}
                    >
                      Clear search
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="px-3 pb-1.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-[var(--sb-muted)]">
                      {results.length} result{results.length === 1 ? "" : "s"}
                    </p>
                    <ul className="space-y-0.5">
                      {results.map((r, i) => {
                        const RIcon = r.icon;
                        const selected = i === searchIdx;
                        return (
                          <li key={`${r.href}-${r.label}-${i}`} role="option" aria-selected={selected} id={`${uid}-result-${i}`}>
                            <button
                              type="button"
                              onClick={() => go(r.href)}
                              onMouseEnter={() => setSearchIdx(i)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition-colors",
                                FOCUS_RING,
                                selected ? "bg-[var(--sb-active-bg)] text-[var(--sb-active-fg)]" : "text-[var(--sb-fg)]",
                              )}
                            >
                              <RIcon className={cn(iconSize, "shrink-0")} strokeWidth={1.75} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13.5px] font-medium leading-tight">{r.label}</span>
                                <span className="block truncate text-[11px] leading-tight text-[var(--sb-muted)]">{r.trail}</span>
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            ) : (
              navGroups.map((group, gi) => renderGroup(group, gi))
            )}
          </nav>
        </ScrollArea>

        {/* ── Fixed footer ── */}
        <div className={cn("shrink-0 border-t", collapsed ? "px-2 py-2" : "px-3 py-2.5")} style={{ borderColor: theme.border }}>
          {collapsed ? (
            <div className="flex flex-col items-center gap-0.5">
              {collapsedBtn(<Settings className="h-[18px] w-[18px]" strokeWidth={1.75} />, "Settings", () => {
                closeMobile();
                router.push("/settings");
              })}
              {collapsedBtn(
                isDark ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.75} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.75} />,
                isDark ? "Light Mode" : "Dark Mode",
                () => setTheme(isDark ? "light" : "dark"),
              )}
              {collapsedBtn(<LogOut className="h-[18px] w-[18px]" strokeWidth={1.75} />, "Logout", handleLogout, true)}
            </div>
          ) : (
            <div className="space-y-0.5 rounded-xl p-1" style={{ background: theme.surface }}>
              <Link href="/settings" onClick={closeMobile} className={cn(footerRow, FOCUS_RING)}>
                <Settings className={cn(iconSize, "shrink-0")} strokeWidth={1.75} />
                <span className="flex-1">Settings</span>
              </Link>

              <div className={footerRow.replace(/hover:\S+/g, "")}>
                {isDark ? <Sun className={cn(iconSize, "shrink-0")} strokeWidth={1.75} /> : <Moon className={cn(iconSize, "shrink-0")} strokeWidth={1.75} />}
                <span className="flex-1">Dark Mode</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isDark}
                  aria-label="Dark mode"
                  onClick={() => setTheme(isDark ? "light" : "dark")}
                  className={cn("relative h-[22px] w-10 shrink-0 rounded-full transition-colors duration-200", FOCUS_RING)}
                  style={{
                    // Track and thumb keep >=3:1 against each other and the panel (WCAG 1.4.11) on every skin.
                    background: skinPalette
                      ? isDark ? "var(--sb-fg)" : "color-mix(in srgb, var(--sb-fg) 55%, transparent)"
                      : isDark ? "hsl(var(--primary-text))" : "var(--sb-muted)",
                  }}
                >
                  <motion.span
                    className="absolute top-[3px] h-4 w-4 rounded-full shadow-sm"
                    style={{ background: skinPalette ? "var(--sb-bg)" : isDark ? "#0d0d0d" : "#ffffff" }}
                    animate={{ left: isDark ? "calc(100% - 19px)" : "3px" }}
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                </button>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className={cn(footerRow, FOCUS_RING, "hover:!bg-destructive/10 hover:!text-destructive-text")}
              >
                <LogOut className={cn(iconSize, "shrink-0", skinPalette ? "text-[var(--sb-fg)]" : "text-destructive-text")} strokeWidth={1.75} />
                <span>Logout</span>
              </button>
            </div>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}
