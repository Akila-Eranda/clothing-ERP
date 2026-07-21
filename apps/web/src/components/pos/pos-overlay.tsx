"use client";
import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ShoppingCart, Plus, Minus, Trash2, User, Tag, Receipt, Banknote, CreditCard, PauseCircle, PlayCircle, Package, X, Check, Loader2, Star, CheckCircle2, Printer, Clock, Delete, Keyboard, Scan, BarChart2, RotateCcw, Settings, Lock, Users, FileText, ShoppingBag, Heart, RefreshCw, TrendingUp, TrendingDown, Menu, Wifi, ChevronRight, ChevronDown, ChevronLeft, AlertCircle, AlertTriangle, ExternalLink, UserCheck, Wrench, Monitor, Gift, Volume2, Hand, PackagePlus, FileCheck, Maximize2, Minimize2, Sparkles, Moon, Sun, MessageCircle, PanelLeftClose, PanelLeft } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCartStore, type HeldBillData } from "@/stores/cart-store";
import { useUIStore } from "@/stores/ui-store";
import { useAuthStore } from "@/stores/auth-store";
import { formatNumber, formatUserRole } from "@/lib/utils";
import { api } from "@/lib/api";
import { posCashierStorage, type PosActiveCashier } from "@/lib/pos-cashier";
import { cn } from "@/lib/utils";
import { useReceiptSettings, notifyReceiptSettingsUpdated, setLocalPosTheme, type ReceiptSettings } from "@/lib/use-receipt-settings";
import { receiptSoftwareCreditHtml, receiptThemeStyleBlock } from "@/lib/receipt-theme";
import { posUiCssVars, resolvePosUiMode } from "@/lib/pos-ui-theme";
import { formatScannerDetail, isScannerActive, usePosPrinterStatus } from "@/lib/use-pos-device-status";
import { openCustomerDisplayFromClick, getCustomerDisplayUrl, CUSTOMER_DISPLAY_WINDOW_NAME } from "@/lib/pos-customer-display";
import { usePosCustomerDisplayPublisher, type ThankYouSale } from "@/lib/use-pos-customer-display-publisher";
import { barcodeLookupCandidates, findAllProductsByBarcodeCode, findProductByBarcodeCode, isLikelyBarcodeScan, matchesCachedBarcode } from "@/lib/pos-barcode";
import { executeReceiptPrint } from "@/lib/receipt-print";
import { resolvePublicAssetUrl } from "@/lib/upload";
import { receiptInvoiceBarcodeHtml } from "@/lib/print-tag-document";
import { useShopWorkspace, hasShopModule } from "@/lib/use-shop-profile";
import { getReturnReasons, variantDisplayLabel } from "@/lib/shop-vertical";
import { APP_NAME } from "@/lib/constants";
import { PosPaymentPanel, buildCheckoutPayments, type PosPaymentState } from "@/components/pos/pos-payment-panel";
import { PosWarrantyPanel } from "@/components/pos/pos-warranty-panel";
import { PosQuantityPopup } from "@/components/pos/pos-quantity-popup";
import { bypassesWorkflowApproval, canViewAllPosSales, DISCOUNT_APPROVAL_THRESHOLD_PCT } from "@/lib/workflow-access";
import { calcPosAmountDue, calcPosLineDiscount, calcPosLineNet, calcTierDiscount, posListPrice } from "@/lib/pos-totals";
import { POS_SHORTCUT_SECTIONS } from "@/components/pos/pos-shortcuts";
import { usePosKeyboard } from "@/components/pos/use-pos-keyboard";
import { PosShiftGate } from "@/components/pos/pos-shift-gate";
import { PosCashClose } from "@/components/pos/pos-cash-close";
import { PosQuickGrnPanel } from "@/components/pos/pos-quick-grn-panel";
import { PosQuickProductPanel } from "@/components/pos/pos-quick-product-panel";
import { PosDemoProductPanel } from "@/components/pos/pos-demo-product-panel";
import { PosQuickExpensePanel } from "@/components/pos/pos-quick-expense-panel";
import { PosPromotionsPanel } from "@/components/pos/pos-promotions-panel";
import { PosSalesReportPanel } from "@/components/pos/pos-sales-report-panel";
import {
  readPosSoundAlerts, writePosSoundAlerts,
  readPosTouchMode, writePosTouchMode,
  readPosAllowNegativeStock, writePosAllowNegativeStock,
  readPosWaBillOffer, writePosWaBillOffer,
  readPosSavedTaxRate, writePosSavedTaxRate,
  readPosCartWidth, writePosCartWidth,
  POS_CART_WIDTH_PRESETS, POS_CART_WIDTH_MIN, POS_CART_WIDTH_MAX,
  type PosTenantSettings,
} from "@/lib/pos-settings";
import { playPosSound } from "@/lib/pos-sound";
import {
  cartQtyToGrams,
  formatPosWeightQty,
  gramsToCartQty,
  isPosWeightedProduct,
  parseGramsInput,
} from "@/lib/pos-weight";
import type { Customer } from "@/types";

interface POSOverlayProps {
  /** Cashier mode — no ERP shell; exit returns to POS landing only. */
  posOnly?: boolean;
}

interface ProductItem { variantId: string; productId?: string; productName: string; variantName: string; sku: string; barcode?: string; unitPrice: number; costPrice: number; mrp?: number; taxRate?: number; stock: number; category: string; color?: string; size?: string; material?: string; style?: string; imageUrl?: string; productKind?: string; unit?: string | null; allowDecimalSelling?: boolean; weightScaleReady?: boolean; }
type AddPopupState = { productName: string; selected: ProductItem; variants: ProductItem[] };
interface CustomerItem { id: string; name: string; phone: string; email?: string; tier?: string; loyaltyPoints: number; walletBalance: number; creditLimit: number; creditBalance: number; }

interface ApiCustomerRow {
  id: string; firstName: string; lastName?: string | null; phone: string; email?: string | null;
  tier?: string; loyaltyPoints?: number; walletBalance?: number; creditLimit?: number; creditBalance?: number;
}

function extractCustomerRows<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)) {
    return (payload as { data: T[] }).data;
  }
  return [];
}

function mapApiCustomer(c: ApiCustomerRow): CustomerItem {
  const name = `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || c.phone || "Customer";
  return {
    id: c.id,
    name,
    phone: c.phone,
    email: c.email ?? undefined,
    tier: c.tier?.toLowerCase(),
    loyaltyPoints: c.loyaltyPoints ?? 0,
    walletBalance: c.walletBalance ?? 0,
    creditLimit: c.creditLimit ?? 0,
    creditBalance: c.creditBalance ?? 0,
  };
}

type SaleCustomer = { name?: string; firstName?: string; lastName?: string | null; phone?: string };

function formatSaleCustomerName(customer?: SaleCustomer | null): string {
  if (!customer) return "Walk-in";
  if (customer.name?.trim()) return customer.name.trim();
  const full = `${customer.firstName ?? ""} ${customer.lastName ?? ""}`.trim();
  return full || customer.phone || "Walk-in";
}
interface SaleReceipt {
  invoiceNumber: string;
  total: number;
  changeDue: number;
  paymentMethod: string;
  customerName?: string;
  items: { name: string; qty: number; price: number; listUnit?: number; discount?: number }[];
  subtotal: number;
  discount: number;
  tax: number;
  savings?: number;
  cashTendered?: number;
}

function receiptItemName(productName: string, variantName?: string) {
  const variant = variantName?.trim();
  const hide = !variant || ["default", "demo", "custom"].includes(variant.toLowerCase());
  return hide ? productName : `${productName} · ${variant}`;
}

function cartLineToReceiptItem(i: {
  productName: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  discountType: "percentage" | "fixed";
}) {
  const lineDisc = calcPosLineDiscount(i);
  return {
    name: receiptItemName(i.productName, i.variantName),
    qty: i.quantity,
    price: calcPosLineNet(i),
    listUnit: i.unitPrice,
    discount: lineDisc,
  };
}
interface RecentScan { id: string; variantId: string; name: string; variant: string; price: number; qty: number; time: Date; }
interface SaleRow { id: string; invoiceNumber: string; total: number; invoiceDate: string; status: string; paymentMethod?: string; customer?: SaleCustomer | null; _count?: { items: number }; payments?: { method: string }[]; }
interface CustomerBillRow { id: string; invoiceNumber: string; invoiceDate: string; total: number; amountPaid?: number; paymentStatus?: string; status: string; balanceDue?: number; _count?: { items: number } }
interface CustomerTopProduct { productName: string; qty: number; spent: number; variantId: string }
interface CustomerInsight {
  sales: CustomerBillRow[];
  topProducts: CustomerTopProduct[];
  outstandingSales?: CustomerBillRow[];
  totalOrders?: number;
  totalSpent?: number;
  creditBalance?: number;
  creditLimit?: number;
  creditAvailable?: number;
}
interface SaleItemDetail { id: string; variantId: string; productName: string; variantName: string; sku: string; quantity: number; unitPrice: number; total: number; }
interface SaleDetail { id: string; invoiceNumber: string; total: number; invoiceDate: string; status: string; customer?: SaleCustomer | null; items: SaleItemDetail[]; }
interface ReturnItemSel { qty: number; unitPrice: number; name: string; maxQty: number; }
interface ServerHeldBill { id: string; label?: string | null; data: HeldBillData; createdAt: string; }

const PAY_METHODS = [{ value:"CASH", label:"Cash", icon: Banknote }, { value:"CARD", label:"Card", icon: CreditCard }, { value:"CHEQUE", label:"Cheque", icon: FileCheck }, { value:"CUSTOMER_CREDIT", label:"Credit", icon: UserCheck }, { value:"GIFT_VOUCHER", label:"Voucher", icon: Gift }];

const BASE_NAV_ITEMS = [
  { id:"products", label:"Products", icon: ShoppingBag },
  { id:"quick-product", label:"New Product", icon: PackagePlus },
  { id:"demo-product", label:"Demo Product", icon: Sparkles },
  { id:"customers", label:"Customers", icon: Users },
  { id:"hold-bills", label:"Hold Bills", icon: PauseCircle },
  { id:"orders", label:"Orders", icon: FileText },
  { id:"vouchers", label:"Vouchers", icon: Gift },
  { id:"quick-grn", label:"Quick GRN", icon: Package },
  { id:"expenses", label:"Expenses", icon: TrendingDown },
  { id:"returns", label:"Returns", icon: RotateCcw, module: "returns" as const },
  { id:"warranty", label:"Warranty", icon: Wrench, module: "warranty" as const },
  { id:"discounts", label:"Discounts", icon: Tag, module: "promotions" as const },
  { id:"reports", label:"Reports", icon: BarChart2 },
  { id:"settings", label:"Settings", icon: Settings },
];
function getCardBg(c = "", light = false) {
  if (light) {
    // Solid soft tints (no "linear-gradient" in style — avoids light-mode white-text override)
    const m: Record<string, string> = {
      black: "#E2E8F0",
      white: "#F1F5F9",
      navy: "#DBEAFE",
      maroon: "#FCE7F3",
      red: "#FEE2E2",
      blue: "#DBEAFE",
      "sky blue": "#E0F2FE",
      beige: "#F5F5F4",
      green: "#DCFCE7",
      gray: "#F1F5F9",
      pink: "#FCE7F3",
      yellow: "#EDE9FE",
    };
    return m[c.toLowerCase()] ?? "var(--pos-thumb)";
  }
  const m: Record<string, string> = {
    black: "linear-gradient(135deg,#1a1a2e,#16213e)",
    white: "linear-gradient(135deg,#e8eaf6,#c5cae9)",
    navy: "linear-gradient(135deg,#1a237e,#283593)",
    maroon: "linear-gradient(135deg,#4a0010,#880e4f)",
    red: "linear-gradient(135deg,#b71c1c,#c62828)",
    blue: "linear-gradient(135deg,#0d47a1,#1565c0)",
    "sky blue": "linear-gradient(135deg,#0277bd,#0288d1)",
    beige: "linear-gradient(135deg,#8d6e63,#a1887f)",
    green: "linear-gradient(135deg,#1b5e20,#2e7d32)",
    gray: "linear-gradient(135deg,#37474f,#455a64)",
    pink: "linear-gradient(135deg,#880e4f,#ad1457)",
    yellow: "linear-gradient(135deg,#f57f17,#f9a825)",
  };
  return m[c.toLowerCase()] ?? "linear-gradient(135deg,#1a237e,#283593)";
}
const STATUS_STYLE: Record<string,{bg:string;color:string}> = { COMPLETED:{bg:"rgba(16,185,129,0.15)",color:"#10b981"}, PENDING:{bg:"var(--pos-warn-bg)",color:"var(--pos-warn)"}, CANCELLED:{bg:"rgba(239,68,68,0.15)",color:"#ef4444"}, REFUNDED:{bg:"rgba(139,92,246,0.15)",color:"#8b5cf6"} };
const TIER_COLOR: Record<string,string> = { bronze:"#cd7f32", silver:"#9ca3af", gold:"var(--pos-warn)", platinum:"#8b5cf6", diamond:"#a78bfa" };

function posImageSrc(url?: string | null) {
  return url ? resolvePublicAssetUrl(url) : null;
}

function PosProductThumb({
  url,
  name,
  className,
  fallbackBg,
  iconClassName = "h-5 w-5",
  light = false,
}: {
  url?: string | null;
  name: string;
  className?: string;
  fallbackBg?: string;
  iconClassName?: string;
  light?: boolean;
}) {
  const src = posImageSrc(url);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name} className={cn("object-cover", className)} />
    );
  }
  return (
    <div
      className={cn("flex items-center justify-center", className)}
      style={{ background: fallbackBg || (light ? "var(--pos-thumb)" : undefined) }}
    >
      <Package
        className={cn(iconClassName)}
        style={{ color: light ? "var(--pos-thumb-icon)" : "rgba(255,255,255,0.25)" }}
      />
    </div>
  );
}

export function POSOverlay({ posOnly = false }: POSOverlayProps) {
  const { posOpen, closePos } = useUIStore();
  const { user } = useAuthStore();
  const { profile, workspace } = useShopWorkspace();
  const showLoyalty = hasShopModule(profile, 'loyalty');
  const navItems = React.useMemo(() => BASE_NAV_ITEMS.filter((item) => {
    // Cashier POS: hide ERP reports; keep Settings so cashiers can set PIN / touch / sound / tax
    if (posOnly && item.id === "reports") return false;
    if (!item.module) return true;
    return hasShopModule(profile, item.module);
  }).map((item) => item.id === 'customers'
    ? { ...item, label: workspace.customerLabel }
    : item), [profile, workspace.customerLabel, posOnly]);
  const returnReasons = React.useMemo(() => getReturnReasons(profile.type), [profile.type]);
  const [products, setProducts] = React.useState<ProductItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [categories, setCategories] = React.useState<string[]>(["All"]);
  const [activeCategory, setActiveCategory] = React.useState("All");
  const [search, setSearch] = React.useState("");
  const [activeNav, setActiveNav] = React.useState("products");
  const [sidebarHidden, setSidebarHidden] = React.useState(() => {
    if (typeof window === "undefined") return false;
    try { return localStorage.getItem("pos_sidebar_hidden") === "1"; } catch { return false; }
  });
  const toggleSidebar = React.useCallback(() => {
    setSidebarHidden((prev) => {
      const next = !prev;
      try { localStorage.setItem("pos_sidebar_hidden", next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }, []);
  const [activePayment, setActivePayment] = React.useState("CASH");
  const [numpad, setNumpad] = React.useState("");
  const [checkoutLoading, setCheckoutLoading] = React.useState(false);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [cartCustomerOpen, setCartCustomerOpen] = React.useState(false);
  const [showHeldBills, setShowHeldBills] = React.useState(false);
  const [customerSearch, setCustomerSearch] = React.useState("");
  const [customers, setCustomers] = React.useState<CustomerItem[]>([]);
  const [customerLoading, setCustomerLoading] = React.useState(false);
  const [selectedCartIdx, setSelectedCartIdx] = React.useState(-1);
  const [focusedProductIdx, setFocusedProductIdx] = React.useState(-1);
  const [focusedHeldIdx, setFocusedHeldIdx] = React.useState(0);
  const [focusedCustomerIdx, setFocusedCustomerIdx] = React.useState(0);
  const [scanFlash, setScanFlash] = React.useState(false);
  const [lastScanAt, setLastScanAt] = React.useState<Date | null>(null);
  const [lastAddedVariantId, setLastAddedVariantId] = React.useState<string | undefined>();
  const [thankYouSale, setThankYouSale] = React.useState<ThankYouSale | null>(null);
  const [waBillOffer, setWaBillOffer] = React.useState<{
    invoiceNumber: string;
    total: string;
    paymentMethod: string;
    customerName?: string;
    phone: string;
    itemsSummary: string;
  } | null>(null);
  const [waPhoneEdit, setWaPhoneEdit] = React.useState("");
  const [waSending, setWaSending] = React.useState(false);
  const [waBillEnabled, setWaBillEnabled] = React.useState(() => readPosWaBillOffer());
  const [recentScans, setRecentScans] = React.useState<RecentScan[]>([]);
  const [selectedProductName, setSelectedProductName] = React.useState<string | null>(null);
  const [now, setNow] = React.useState(new Date());
  const [todayStats, setTodayStats] = React.useState({ sales: 0, orders: 0, items: 0 });
  const [drawerCash, setDrawerCash] = React.useState<number | null>(null);
  const [liked, setLiked] = React.useState<Set<string>>(new Set());
  const [orders, setOrders] = React.useState<SaleRow[]>([]);
  const [ordersLoading, setOrdersLoading] = React.useState(false);
  const [reprintingId, setReprintingId] = React.useState<string | null>(null);
  const [touchMode, setTouchMode] = React.useState(false);
  const [cartWidth, setCartWidth] = React.useState(() => readPosCartWidth());
  const cartResizeRef = React.useRef<{ startX: number; startW: number } | null>(null);
  const [soundAlerts, setSoundAlerts] = React.useState(true);
  const [addPopup, setAddPopup] = React.useState<AddPopupState | null>(null);
  const [editingCartQtyIdx, setEditingCartQtyIdx] = React.useState<number | null>(null);
  const [editingCartQtyRaw, setEditingCartQtyRaw] = React.useState("");
  const cashPanelRef = React.useRef<HTMLDivElement>(null);
  const cartCustomerSearchRef = React.useRef<HTMLInputElement>(null);
  const cartCustomerDropdownRef = React.useRef<HTMLDivElement>(null);
  const [helpers, setHelpers] = React.useState<{ id: string; firstName: string; lastName: string; commissionRate: number }[]>([]);
  const [helperEmployeeId, setHelperEmployeeId] = React.useState("");
  const [giftVoucherCode, setGiftVoucherCode] = React.useState("");
  const [chequeNumber, setChequeNumber] = React.useState("");
  const [voucherIssueAmt, setVoucherIssueAmt] = React.useState("");
  const [voucherIssueName, setVoucherIssueName] = React.useState("");
  const [voucherBusy, setVoucherBusy] = React.useState(false);
  const [vouchers, setVouchers] = React.useState<{ id: string; code: string; balance: number; initialAmount: number; status: string }[]>([]);
  const [inlineCustomerSearch, setInlineCustomerSearch] = React.useState("");
  const [inlineCustomers, setInlineCustomers] = React.useState<CustomerItem[]>([]);
  const [inlineCustLoading, setInlineCustLoading] = React.useState(false);
  const [customerInsight, setCustomerInsight] = React.useState<CustomerInsight | null>(null);
  const [customerInsightLoading, setCustomerInsightLoading] = React.useState(false);
  const [previewCustomerId, setPreviewCustomerId] = React.useState<string | null>(null);
  const [partialPayAmount, setPartialPayAmount] = React.useState("");
  const [creditPayAmount, setCreditPayAmount] = React.useState("");
  const [creditPayMethod, setCreditPayMethod] = React.useState("CASH");
  const [creditPayBusy, setCreditPayBusy] = React.useState(false);
  const [cartNotes, setCartNotes] = React.useState("");
  const [discountInput, setDiscountInput] = React.useState("");
  const [pendingDiscountApproval, setPendingDiscountApproval] = React.useState<{ entityId: string; percent: number } | null>(null);
  const adminBypass = bypassesWorkflowApproval(user?.role);
  const viewAllSales = canViewAllPosSales(user?.role);
  const [showNewCust, setShowNewCust] = React.useState(false);
  const [cartShowNewCust, setCartShowNewCust] = React.useState(false);
  const [newCustFirst, setNewCustFirst] = React.useState("");
  const [newCustLast, setNewCustLast] = React.useState("");
  const [newCustPhone, setNewCustPhone] = React.useState("");
  const [newCustEmail, setNewCustEmail] = React.useState("");
  const [newCustSaving, setNewCustSaving] = React.useState(false);
  const [returnStep, setReturnStep] = React.useState<"search"|"items"|"confirm"|"done">("search");
  const [returnQuery, setReturnQuery] = React.useState("");
  const [returnSearchRes, setReturnSearchRes] = React.useState<SaleRow[]>([]);
  const [returnSearchLoading, setReturnSearchLoading] = React.useState(false);
  const [returnSale, setReturnSale] = React.useState<SaleDetail | null>(null);
  const [returnSaleLoading, setReturnSaleLoading] = React.useState(false);
  const [returnItems, setReturnItems] = React.useState<Map<string, ReturnItemSel>>(new Map());
  const [returnReason, setReturnReason] = React.useState("");
  const [returnNotes, setReturnNotes] = React.useState("");
  const [returnRestock, setReturnRestock] = React.useState(true);
  const [returnSubmitting, setReturnSubmitting] = React.useState(false);
  const [returnResult, setReturnResult] = React.useState<{returnNumber:string;refundAmount:number}|null>(null);
  const [returnType, setReturnType] = React.useState<"RETURN"|"EXCHANGE">("RETURN");
  const [exchangeItems, setExchangeItems] = React.useState<Map<string, ReturnItemSel>>(new Map());
  const [exchangeSearch, setExchangeSearch] = React.useState("");
  const [warrantySaleId, setWarrantySaleId] = React.useState<string | null>(null);
  const [shiftReady, setShiftReady] = React.useState(false);
  const [showCashClose, setShowCashClose] = React.useState(false);
  const [pinLocked, setPinLocked] = React.useState(false);
  const [pinEntry, setPinEntry] = React.useState("");
  const [pinError, setPinError] = React.useState(false);
  const [pinBusy, setPinBusy] = React.useState(false);
  const [hasServerPin, setHasServerPin] = React.useState(false);
  const [activeCashier, setActiveCashier] = React.useState<PosActiveCashier | null>(null);
  const [settingNewPin, setSettingNewPin] = React.useState("");
  const [settingConfirmPin, setSettingConfirmPin] = React.useState("");
  const [dayEndLoading, setDayEndLoading] = React.useState(false);
  const [showDayEnd, setShowDayEnd] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);
  const [dayEndSummary, setDayEndSummary] = React.useState<{
    date: string;
    totalSales: number;
    totalRevenue: number;
    totalTax: number;
    totalDiscount: number;
    byPaymentMethod: Record<string, number>;
    openingBalance?: number;
    income?: number;
    expenses?: number;
    netIncome?: number;
    supplierPayments?: number;
    cashSupplierPayments?: number;
    cash?: {
      shiftOpen: boolean;
      openingFloat: number | null;
      cashSalesNet: number;
      cashTendered: number;
      changeGiven: number;
      cashIn: number;
      cashOut: number;
      cashExpenses?: number;
      cashSupplierPayments?: number;
      refunds: number;
      expectedInDrawer: number | null;
    };
  } | null>(null);
  const [serverHeldBills, setServerHeldBills] = React.useState<ServerHeldBill[]>([]);
  const [holdsLoading, setHoldsLoading] = React.useState(false);
  const [payState, setPayState] = React.useState<PosPaymentState>({
    splitMode: false,
    paymentLines: [{ method: "CASH", amount: "" }],
    allowPartial: false,
    couponCode: "",
    couponDiscount: 0,
    tierDiscountPct: 0,
    currency: "LKR",
  });
  const { settings: receiptSettings } = useReceiptSettings();
  const { display: printerStatus, refresh: refreshPrinterStatus } = usePosPrinterStatus(posOpen, receiptSettings);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const discountInputRef = React.useRef<HTMLInputElement>(null);
  const couponInputRef = React.useRef<HTMLInputElement>(null);
  const partialPayInputRef = React.useRef<HTMLInputElement>(null);
  const giftVoucherInputRef = React.useRef<HTMLInputElement>(null);
  const chequeInputRef = React.useRef<HTMLInputElement>(null);
  const checkoutConfirmRef = React.useRef<HTMLButtonElement>(null);
  const barcodeBuffer = React.useRef(""); const lastKeyTime = React.useRef(0); const barcodeTimer = React.useRef<ReturnType<typeof setTimeout>|undefined>(undefined);
  const { items, customer, discount, discountType, taxRate, couponCode, loyaltyPointsToRedeem, addItem, updateQuantity, removeItem, setCustomer, setDiscount, setCoupon, setTaxRate, setLoyaltyPoints, clearCart, loadFromHeldBill, getHoldPayload, activeHeldBillId, subtotal, discountAmount, taxAmount, total, itemCount, allowNegativeStock, setAllowNegativeStock } = useCartStore();
  const taxEnabled = taxRate > 0;

  React.useEffect(() => { if (!posOpen) setShiftReady(false); }, [posOpen]);
  const markShiftReady = React.useCallback(() => setShiftReady(true), []);

  React.useEffect(() => {
    if (!posOpen) return;
    api.get<{ currency?: string }>("/tenants/me")
      .then((r) => setPayState((s) => ({ ...s, currency: r.data?.currency ?? "LKR" })))
      .catch(() => {});
  }, [posOpen]);

  React.useEffect(() => {
    if (activeNav === "quick-grn") setCheckoutOpen(false);
  }, [activeNav]);

  const patchPayState = React.useCallback((patch: Partial<PosPaymentState>) => {
    setPayState((s) => ({ ...s, ...patch }));
  }, []);

  const onCouponChange = React.useCallback((code: string | null, discountAmt: number) => {
    setCoupon(code);
    patchPayState({ couponDiscount: discountAmt, couponCode: code ?? "" });
  }, [setCoupon, patchPayState]);

  const toggleCheckoutPartial = React.useCallback(() => {
    patchPayState({ allowPartial: !payState.allowPartial });
  }, [payState.allowPartial, patchPayState]);

  const toggleCheckoutSplit = React.useCallback(() => {
    setPayState((s) => ({
      ...s,
      splitMode: !s.splitMode,
      paymentLines: !s.splitMode
        ? [{ method: "CASH", amount: "" }, { method: "CARD", amount: "" }]
        : [{ method: "CASH", amount: "" }],
    }));
  }, []);

  const focusCheckoutCoupon = React.useCallback(() => {
    couponInputRef.current?.focus();
    couponInputRef.current?.select();
  }, []);

  const focusCheckoutPartialPay = React.useCallback(() => {
    partialPayInputRef.current?.focus();
    partialPayInputRef.current?.select();
  }, []);

  const setQuickCash = React.useCallback((amt: number) => {
    const s = String(amt);
    setNumpad(s);
    setPartialPayAmount(s);
  }, []);

  const focusCheckoutGiftOrCheque = React.useCallback(() => {
    if (activePayment === "GIFT_VOUCHER") {
      giftVoucherInputRef.current?.focus();
      giftVoucherInputRef.current?.select();
      return;
    }
    if (activePayment === "CHEQUE") {
      chequeInputRef.current?.focus();
      chequeInputRef.current?.select();
      return;
    }
    setActivePayment("GIFT_VOUCHER");
    requestAnimationFrame(() => {
      giftVoucherInputRef.current?.focus();
      giftVoucherInputRef.current?.select();
    });
  }, [activePayment]);

  const setExactCashTender = React.useCallback(() => {
    const s = String(Math.round(total() * 100) / 100);
    setNumpad(s);
    setPartialPayAmount(s);
  }, [total]);

  const openCashClose = React.useCallback(() => setShowCashClose(true), []);
  const closeCashClose = React.useCallback(() => setShowCashClose(false), []);
  const waPhoneRef = React.useRef<HTMLInputElement>(null);
  const closeWaBillOffer = React.useCallback(() => {
    setWaBillOffer(null);
    setWaSending(false);
    setTimeout(() => searchRef.current?.focus(), 80);
  }, []);
  const sendWaBill = React.useCallback(() => {
    if (!waBillOffer || waSending) return;
    const phone = waPhoneEdit.trim();
    if (!phone) {
      toast.error("Enter customer WhatsApp number");
      waPhoneRef.current?.focus();
      return;
    }
    void (async () => {
      setWaSending(true);
      try {
        await api.post("/whatsapp/send-bill", {
          phone,
          invoiceNumber: waBillOffer.invoiceNumber,
          customerName: waBillOffer.customerName,
          total: waBillOffer.total,
          paymentMethod: waBillOffer.paymentMethod,
          itemsSummary: waBillOffer.itemsSummary,
          shopName: receiptSettings.shopName || APP_NAME,
        });
        toast.success("Bill sent on WhatsApp");
        setWaBillOffer(null);
        setTimeout(() => searchRef.current?.focus(), 80);
      } catch (e) {
        toast.error((e as Error).message ?? "WhatsApp send failed");
      } finally {
        setWaSending(false);
      }
    })();
  }, [waBillOffer, waSending, waPhoneEdit, receiptSettings.shopName]);

  const applyCartDiscount = React.useCallback(async () => {
    const v = parseFloat(discountInput) || 0;
    if (v <= 0) {
      setDiscount(0, "percentage");
      setDiscountInput("");
      setPendingDiscountApproval(null);
      toast.info("Discount cleared");
      return;
    }
    if (v > 100) {
      toast.error("Discount cannot exceed 100%");
      return;
    }

    const needsApproval = !adminBypass && v > DISCOUNT_APPROVAL_THRESHOLD_PCT;
    if (needsApproval) {
      const reason = window.prompt(
        `Discount ${v}% requires manager approval (over ${DISCOUNT_APPROVAL_THRESHOLD_PCT}%). Enter reason:`,
      );
      if (!reason?.trim()) {
        toast.error("Reason is required for manager approval");
        return;
      }
      const discAmt = subtotal() * (v / 100);
      try {
        const res = await api.post<{ entityId: string; status: string }>("/workflows/discount-request", {
          amount: discAmt,
          discountPercent: v,
          reason: reason.trim(),
          cartTotal: subtotal(),
        });
        const inst = res.data;
        setPendingDiscountApproval({ entityId: inst.entityId, percent: v });
        setDiscount(0, "percentage");
        toast.info("Discount sent for manager approval — waiting…");
      } catch (e: unknown) {
        toast.error((e as Error).message ?? "Failed to submit discount for approval");
      }
      return;
    }

    setPendingDiscountApproval(null);
    setDiscount(v, "percentage");
    setDiscountInput(String(v));
    toast.success(`${v}% discount applied — LKR ${formatNumber(subtotal() * (v / 100))} off`);
  }, [discountInput, adminBypass, subtotal, setDiscount]);

  React.useEffect(() => {
    if (!pendingDiscountApproval?.entityId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.get<{ status: string }>(
          `/workflows/instances/DiscountRequest/${pendingDiscountApproval.entityId}`,
        );
        if (cancelled) return;
        const status = res.data?.status;
        if (status === "APPROVED") {
          setDiscount(pendingDiscountApproval.percent, "percentage");
          setPendingDiscountApproval(null);
          setDiscountInput(String(pendingDiscountApproval.percent));
          toast.success(`${pendingDiscountApproval.percent}% discount approved and applied`);
        } else if (status === "REJECTED" || status === "CANCELLED") {
          setPendingDiscountApproval(null);
          toast.error("Discount request was rejected");
        }
      } catch {
        /* ignore transient poll errors */
      }
    };
    poll();
    const timer = setInterval(poll, 4000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pendingDiscountApproval, setDiscount]);

  const loadTodayStats = React.useCallback(async () => {
    try {
      const [sumR, activeR] = await Promise.all([
        api.get<{ totalSales: number; totalRevenue: number; totalItems?: number; cash?: { expectedInDrawer?: number } }>("/pos/summary"),
        shiftReady ? api.get<{ status?: string; summary?: { expectedCash: number } } | null>("/cash/active").catch(() => ({ data: null })) : Promise.resolve({ data: null }),
      ]);
      const d = sumR.data;
      setTodayStats({
        sales: d.totalRevenue ?? 0,
        orders: d.totalSales ?? 0,
        items: d.totalItems ?? 0,
      });
      const active = activeR.data;
      if (active?.status === "OPEN" && active.summary?.expectedCash != null) {
        setDrawerCash(active.summary.expectedCash);
      } else if (d.cash?.expectedInDrawer != null) {
        setDrawerCash(d.cash.expectedInDrawer);
      } else {
        setDrawerCash(null);
      }
    } catch {
      /* keep last known stats */
    }
  }, [shiftReady]);

  const loadHeldBills = React.useCallback(async () => {
    setHoldsLoading(true);
    try {
      const r = await api.get<ServerHeldBill[]>("/pos/hold");
      setServerHeldBills(Array.isArray(r.data) ? r.data : []);
    } catch {
      toast.error("Failed to load held bills");
    } finally {
      setHoldsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (activePayment === "CASH" && payState.allowPartial) {
      setPartialPayAmount(numpad);
    }
  }, [numpad, activePayment, payState.allowPartial]);

  React.useEffect(() => { if (!posOpen) return; const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, [posOpen]);
  React.useEffect(() => { if (items.length === 0) setCheckoutOpen(false); }, [items.length]);
  React.useEffect(() => {
    if (!checkoutOpen) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
      el.blur();
    }
    if ((customer?.creditLimit ?? 0) > 0) {
      patchPayState({ allowPartial: true });
    }
    requestAnimationFrame(() => cashPanelRef.current?.focus());
  }, [checkoutOpen, customer?.creditLimit, patchPayState]);

  const loadProducts = React.useCallback(async () => {
    setLoading(true);
    try { const r = await api.get<ProductItem[]>("/pos/products"); const raw = Array.isArray(r.data) ? r.data : []; setProducts(raw); setCategories(["All",...Array.from(new Set(raw.map(p=>p.category).filter(Boolean)))]); }
    catch { toast.error("Failed to load products"); } finally { setLoading(false); }
  }, []);

  const handleHoldBill = React.useCallback(async () => {
    if (!items.length) { toast.info("Cart is empty"); return; }
    try {
      if (activeHeldBillId) {
        await api.delete(`/pos/hold/${activeHeldBillId}`);
      }
      const payload = getHoldPayload();
      await api.post("/pos/hold", {
        label: `Hold ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
        data: payload,
      });
      clearCart();
      setCartNotes("");
      setDiscountInput("");
      await loadHeldBills();
      await loadProducts();
      toast.success("Bill held — stock reserved");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to hold bill");
    }
  }, [items.length, activeHeldBillId, getHoldPayload, clearCart, loadHeldBills, loadProducts]);

  const handleRestoreHeldBill = React.useCallback(async (bill: ServerHeldBill) => {
    if (items.length > 0 && activeHeldBillId !== bill.id) {
      toast.error("Clear or checkout the current cart before restoring another hold");
      return;
    }
    loadFromHeldBill(bill.data, bill.id);
    setCartNotes(bill.data.notes ?? "");
    setDiscountInput(bill.data.discount > 0 ? String(bill.data.discount) : "");
    setActiveNav("products");
    if (bill.data.couponCode) {
      try {
        const sub = bill.data.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
        const r = await api.get<{ valid: boolean; discountAmount?: number; reason?: string }>(
          `/pos/coupons/validate/${encodeURIComponent(bill.data.couponCode)}?amount=${sub}`,
        );
        if (r.data.valid) {
          onCouponChange(bill.data.couponCode.toUpperCase(), r.data.discountAmount ?? 0);
        } else {
          setCoupon(null);
          patchPayState({ couponCode: "", couponDiscount: 0 });
          toast.error(r.data.reason ?? "Saved coupon no longer valid");
        }
      } catch {
        setCoupon(null);
        patchPayState({ couponCode: "", couponDiscount: 0 });
      }
    } else {
      patchPayState({ couponCode: "", couponDiscount: 0 });
    }
    toast.success("Bill restored");
  }, [items.length, activeHeldBillId, loadFromHeldBill, onCouponChange, setCoupon, patchPayState]);

  const handleDeleteHeldBill = React.useCallback(async (id: string) => {
    try {
      await api.delete(`/pos/hold/${id}`);
      if (activeHeldBillId === id) clearCart();
      await loadHeldBills();
      await loadProducts();
      toast.info("Held bill removed — stock released");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to delete held bill");
    }
  }, [activeHeldBillId, clearCart, loadHeldBills, loadProducts]);

  const loadOrders = React.useCallback(async () => {
    setOrdersLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const r = await api.get<{ data?: SaleRow[] }>(`/pos/sales?limit=50&date=${today}`);
      setOrders(r.data?.data ?? []);
    } catch { toast.error("Failed to load sales"); } finally { setOrdersLoading(false); }
  }, []);

  React.useEffect(() => {
    setTouchMode(readPosTouchMode());
    setSoundAlerts(readPosSoundAlerts());
    setWaBillEnabled(readPosWaBillOffer());
    setCartWidth(readPosCartWidth());
  }, []);

  const applyCartWidth = React.useCallback((px: number) => {
    setCartWidth(writePosCartWidth(px));
  }, []);

  const onCartResizeStart = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    cartResizeRef.current = { startX: e.clientX, startW: cartWidth };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [cartWidth]);

  const onCartResizeMove = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const drag = cartResizeRef.current;
    if (!drag) return;
    // Dragging left edge: move left → wider cart
    const next = drag.startW + (drag.startX - e.clientX);
    setCartWidth(Math.min(POS_CART_WIDTH_MAX, Math.max(POS_CART_WIDTH_MIN, next)));
  }, []);

  const onCartResizeEnd = React.useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!cartResizeRef.current) return;
    cartResizeRef.current = null;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* noop */ }
    setCartWidth((w) => writePosCartWidth(w));
  }, []);

  const setCheckoutTaxEnabled = React.useCallback((on: boolean) => {
    if (on) {
      const restored = readPosSavedTaxRate() || 10;
      writePosSavedTaxRate(restored);
      setTaxRate(restored);
      return;
    }
    if (taxRate > 0) writePosSavedTaxRate(taxRate);
    setTaxRate(0);
  }, [setTaxRate, taxRate]);

  const setCheckoutWaBillEnabled = React.useCallback((on: boolean) => {
    setWaBillEnabled(on);
    writePosWaBillOffer(on);
  }, []);

  React.useEffect(() => {
    if (!posOpen) return;
    api.get<PosTenantSettings>("/tenants/pos-settings")
      .then((r) => {
        const allow = Boolean(r.data?.allowNegativeStock);
        writePosAllowNegativeStock(allow);
        setAllowNegativeStock(allow);
      })
      .catch(() => {
        /* keep cached local setting */
        setAllowNegativeStock(readPosAllowNegativeStock());
      });
  }, [posOpen, setAllowNegativeStock]);

  React.useEffect(() => {
    if (!posOpen) return;
    api.get<{ id: string; firstName: string; lastName: string; commissionRate: number }[]>("/pos/helpers")
      .then((r) => setHelpers(Array.isArray(r.data) ? r.data : []))
      .catch(() => setHelpers([]));
  }, [posOpen]);

  const loadVouchers = React.useCallback(async () => {
    try {
      const r = await api.get<{ data: { id: string; code: string; balance: number; initialAmount: number; status: string }[] }>("/pos/gift-vouchers?limit=30");
      setVouchers(r.data?.data ?? []);
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => { if (activeNav === "vouchers" && posOpen) loadVouchers(); }, [activeNav, posOpen, loadVouchers]);

  React.useEffect(() => { if (posOpen && shiftReady) { loadProducts(); loadHeldBills(); loadTodayStats(); } }, [posOpen, shiftReady, loadProducts, loadHeldBills, loadTodayStats]);
  React.useEffect(() => {
    if (!posOpen || !shiftReady) return;
    const t = setInterval(loadTodayStats, 30_000);
    return () => clearInterval(t);
  }, [posOpen, shiftReady, loadTodayStats]);
  React.useEffect(() => { if (activeNav === "orders" && posOpen) loadOrders(); }, [activeNav, posOpen, loadOrders]);
  React.useEffect(() => {
    if (!posOpen) return;
    let cancelled = false;
    (async () => {
      const cached = posCashierStorage.getCashier();
      if (cached) setActiveCashier(cached);
      try {
        const r = await api.get<{ hasPin: boolean }>("/pos/pin/status");
        if (cancelled) return;
        setHasServerPin(!!r.data?.hasPin);
        // Lock when opening POS if anyone might switch via PIN (current user has PIN)
        // or legacy localStorage PIN exists
        const legacy = typeof window !== "undefined" && !!localStorage.getItem("pos_pin");
        if (r.data?.hasPin || legacy) {
          posCashierStorage.clear();
          setActiveCashier(null);
          setPinLocked(true);
          setPinEntry("");
          setPinError(false);
        } else {
          setPinLocked(false);
        }
      } catch {
        const legacy = typeof window !== "undefined" && !!localStorage.getItem("pos_pin");
        if (legacy) {
          posCashierStorage.clear();
          setActiveCashier(null);
          setPinLocked(true);
          setPinEntry("");
          setPinError(false);
        } else setPinLocked(false);
      }
    })();
    return () => { cancelled = true; };
  }, [posOpen]);

  React.useEffect(() => { if (activeNav !== "returns") { setReturnStep("search"); setReturnQuery(""); setReturnSearchRes([]); setReturnSale(null); setReturnItems(new Map()); setReturnReason(""); setReturnNotes(""); setReturnRestock(true); setReturnResult(null); setReturnType("RETURN"); setExchangeItems(new Map()); setExchangeSearch(""); } }, [activeNav]);
  React.useEffect(() => { if (activeNav !== "warranty") setWarrantySaleId(null); }, [activeNav]);

  const fetchPosCustomers = React.useCallback(async (search: string, limit: number) => {
    const q = search.trim();
    const url = `/pos/customers?limit=${limit}${q ? `&search=${encodeURIComponent(q)}` : ""}`;
    const r = await api.get<ApiCustomerRow[] | { data: ApiCustomerRow[] }>(url);
    return extractCustomerRows<ApiCustomerRow>(r.data).map(mapApiCustomer);
  }, []);

  React.useEffect(() => {
    if (!cartCustomerOpen) return;
    const onDoc = (e: MouseEvent) => {
      const el = cartCustomerDropdownRef.current;
      if (el && !el.contains(e.target as Node)) {
        setCartCustomerOpen(false);
        setCustomerSearch("");
        setCartShowNewCust(false);
        setCustomers([]);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [cartCustomerOpen]);

  React.useEffect(() => {
    if (!posOpen || !cartCustomerOpen) return;
    const t = setTimeout(async () => {
      setCustomerLoading(true);
      try {
        setCustomers(await fetchPosCustomers(customerSearch, 12));
      } catch (e: unknown) {
        toast.error((e as Error).message ?? "Customer search failed");
      } finally {
        setCustomerLoading(false);
      }
    }, customerSearch.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [customerSearch, cartCustomerOpen, posOpen, fetchPosCustomers]);

  React.useEffect(() => {
    if (activeNav === "customers") {
      setCartCustomerOpen(false);
      setCustomerSearch("");
      setCustomers([]);
    }
  }, [activeNav]);

  React.useEffect(() => {
    if (!posOpen || activeNav !== "customers") return;
    const t = setTimeout(async () => {
      setInlineCustLoading(true);
      try {
        setInlineCustomers(await fetchPosCustomers(inlineCustomerSearch, 20));
      } catch (e: unknown) {
        toast.error((e as Error).message ?? "Customer search failed");
      } finally {
        setInlineCustLoading(false);
      }
    }, inlineCustomerSearch.trim() ? 300 : 0);
    return () => clearTimeout(t);
  }, [inlineCustomerSearch, activeNav, posOpen, fetchPosCustomers]);

  const productGroups = React.useMemo(() => { const m = new Map<string,ProductItem[]>(); for (const p of products) m.set(p.productName,[...(m.get(p.productName)||[]),p]); return m; }, [products]);
  const getVariants = React.useCallback((n:string)=>productGroups.get(n)||[], [productGroups]);
  const totalAmt = React.useMemo(
    () => calcPosAmountDue(
      items.map((i) => ({
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        discountAmount: i.discountAmount,
        discountType: i.discountType,
        taxRate: i.taxRate,
      })),
      {
        manualDiscount: discount,
        manualDiscountType: discountType,
        couponDiscount: payState.couponDiscount,
        tierDiscount: calcTierDiscount(subtotal(), customer?.membershipTier),
        loyaltyPoints: loyaltyPointsToRedeem,
        posTaxRate: taxRate,
      },
    ),
    [items, discount, discountType, payState.couponDiscount, customer?.membershipTier, loyaltyPointsToRedeem, subtotal, taxRate],
  );
  const productImages = React.useMemo(
    () => new Map(products.map((p) => [p.variantId, p.imageUrl])),
    [products],
  );

  usePosCustomerDisplayPublisher({
    enabled: posOpen && !pinLocked && shiftReady,
    checkoutOpen,
    thankYouSale,
    items,
    customer,
    manualDiscount: discount,
    manualDiscountType: discountType,
    couponDiscount: payState.couponDiscount,
    loyaltyPoints: loyaltyPointsToRedeem,
    taxRate,
    currency: payState.currency,
    receiptSettings,
    productImages,
    lastAddedVariantId,
    activePayment,
    cashTenderedInput: numpad,
    totalAmount: totalAmt,
  });

  const handleOpenCustomerDisplay = React.useCallback((event: React.MouseEvent) => {
    const result = openCustomerDisplayFromClick(event);
    if (result === "focused") {
      toast.success("Customer display focused");
    } else if (result === "opened") {
      toast.success("Customer display opened — drag to second monitor");
    } else {
      toast.success("Customer display opened in new tab — drag to second monitor");
    }
  }, []);
  const tierDiscountAmt = calcTierDiscount(subtotal(), customer?.membershipTier);
  const loyaltyDiscountAmt = loyaltyPointsToRedeem * 0.1;
  const cartDiscountAmt = discountAmount();
  const itemDiscountTotal = React.useMemo(
    () => items.reduce((sum, i) => sum + calcPosLineDiscount(i), 0),
    [items],
  );
  const totalSavings = itemDiscountTotal + cartDiscountAmt + tierDiscountAmt + payState.couponDiscount + loyaltyDiscountAmt;
  const amountBeforeLoyalty = React.useMemo(
    () => calcPosAmountDue(
      items.map((i) => ({
        unitPrice: i.unitPrice,
        quantity: i.quantity,
        discountAmount: i.discountAmount,
        discountType: i.discountType,
        taxRate: i.taxRate,
      })),
      {
        manualDiscount: discount,
        manualDiscountType: discountType,
        couponDiscount: payState.couponDiscount,
        tierDiscount: tierDiscountAmt,
        loyaltyPoints: 0,
        posTaxRate: taxRate,
      },
    ),
    [items, discount, discountType, payState.couponDiscount, tierDiscountAmt, taxRate],
  );
  const changeAmt = numpad ? Math.max(0, parseFloat(numpad) - totalAmt) : 0;
  const popularItems = React.useMemo(() => {
    const freq = new Map<string, number>();
    for (const s of recentScans) freq.set(s.variantId, (freq.get(s.variantId) ?? 0) + 2);
    for (const id of liked) freq.set(id, (freq.get(id) ?? 0) + 3);
    const scored = [...products].map((p) => ({ p, score: freq.get(p.variantId) ?? 0 }));
    scored.sort((a, b) => b.score - a.score || a.p.productName.localeCompare(b.p.productName));
    const top = scored.filter((s) => s.score > 0).slice(0, 5).map((s) => s.p);
    if (top.length >= 5) return top;
    const seen = new Set(top.map((p) => p.variantId));
    for (const p of products) {
      if (seen.has(p.variantId)) continue;
      top.push(p);
      if (top.length >= 5) break;
    }
    return top;
  }, [products, recentScans, liked]);
  const filteredProducts = React.useMemo(() => products.filter((p) => {
    const q = search.toLowerCase().trim();
    const qBase = q.replace(/\d{3}$/, "");
    const matchesQ = !q
      || p.productName.toLowerCase().includes(q)
      || p.sku.toLowerCase().includes(q)
      || (p.barcode && p.barcode.toLowerCase().includes(q))
      || (p.barcode && qBase && qBase !== q && p.barcode.toLowerCase().includes(qBase))
      || (qBase && qBase !== q && p.sku.toLowerCase().includes(qBase))
      || p.variantName.toLowerCase().includes(q)
      || p.category?.toLowerCase().includes(q)
      || p.color?.toLowerCase().includes(q)
      || p.size?.toLowerCase().includes(q)
      || p.material?.toLowerCase().includes(q)
      || p.style?.toLowerCase().includes(q);
    return matchesQ && (activeCategory === "All" || p.category === activeCategory);
  }), [products, search, activeCategory]);

  const productCards = React.useMemo(() => {
    const map = new Map<string, { rep: ProductItem; variants: ProductItem[]; totalStock: number; minPrice: number; maxPrice: number }>();
    for (const p of filteredProducts) {
      const key = p.productId || p.productName;
      const existing = map.get(key);
      if (!existing) {
        const variants = getVariants(p.productName).filter((v) =>
          activeCategory === "All" || v.category === activeCategory,
        );
        const list = variants.length ? variants : [p];
        map.set(key, {
          rep: p,
          variants: list,
          totalStock: list.reduce((s, v) => s + v.stock, 0),
          minPrice: Math.min(...list.map((v) => v.unitPrice)),
          maxPrice: Math.max(...list.map((v) => v.unitPrice)),
        });
      }
    }
    return Array.from(map.values());
  }, [filteredProducts, getVariants, activeCategory]);

  const openAddPopup = React.useCallback((p: ProductItem, matchList?: ProductItem[]) => {
    const variants = matchList && matchList.length > 0
      ? matchList
      : (() => {
          const siblings = getVariants(p.productName);
          return siblings.length > 0 ? siblings : [p];
        })();
    const list = variants.length > 0 ? variants : [p];
    const selected = list.find((v) => v.variantId === p.variantId) ?? list.find((v) => v.stock > 0) ?? list[0];
    if (!selected) {
      toast.error(`${p.productName} — Not found`);
      playPosSound("scan_fail", soundAlerts);
      return;
    }
    if (!allowNegativeStock && list.every((v) => v.stock <= 0)) {
      toast.error(`${p.productName} — Out of stock`);
      playPosSound("scan_fail", soundAlerts);
      return;
    }
    const title = list.length > 1 && new Set(list.map((v) => v.productName)).size > 1
      ? `Select item (${list.length})`
      : selected.productName;
    setAddPopup({ productName: title, selected, variants: list });
  }, [getVariants, soundAlerts, allowNegativeStock]);

  const commitAddProduct = React.useCallback((p: ProductItem, qty = 1, opts?: { keepSearchFocus?: boolean; unitPrice?: number }) => {
    if (!allowNegativeStock && p.stock <= 0) {
      toast.error(`${p.productName} (${p.variantName}) — Out of stock`);
      playPosSound("scan_fail", soundAlerts);
      return;
    }
    const weighted = isPosWeightedProduct(p);
    const listPrice = posListPrice(p);
    const finalPrice = opts?.unitPrice ?? p.unitPrice;
    const minQty = weighted ? 0.001 : 1;
    const qtyClamped = allowNegativeStock
      ? Math.max(minQty, qty)
      : Math.min(Math.max(minQty, qty), Math.max(minQty, p.stock));
    const priceCut = listPrice - finalPrice;
    const hasPriceDiscount = priceCut > 0.001;
    const lineTax = taxRate;
    addItem({
      variantId: p.variantId, productName: p.productName, variantName: p.variantName, sku: p.sku,
      unitPrice: hasPriceDiscount ? listPrice : finalPrice,
      mrp: p.mrp && p.mrp > 0 ? Math.max(p.mrp, listPrice) : listPrice,
      quantity: qtyClamped, stock: Math.max(p.stock, allowNegativeStock ? qtyClamped : p.stock),
      discountAmount: hasPriceDiscount ? priceCut * qtyClamped : 0,
      discountType: hasPriceDiscount ? "fixed" : "percentage",
      taxRate: lineTax,
      image: p.imageUrl,
      productKind: p.productKind,
      unit: p.unit,
      allowDecimalSelling: weighted || !!p.allowDecimalSelling,
    });
    setLastAddedVariantId(p.variantId);
    setRecentScans((prev) => [{
      id: Date.now().toString(),
      variantId: p.variantId,
      name: p.productName,
      variant: variantDisplayLabel(p, profile),
      price: finalPrice,
      qty: qtyClamped,
      time: new Date(),
    }, ...prev].slice(0, 8));
    playPosSound("scan_ok", soundAlerts);
    const qtyLabel = weighted ? formatPosWeightQty(qtyClamped, p) : `×${qtyClamped}`;
    if (hasPriceDiscount) {
      toast.success(`Price discount LKR ${formatNumber(priceCut * qtyClamped)} applied`, { duration: 900 });
    } else {
      toast.success(`${p.productName} · ${variantDisplayLabel(p, profile)} ${qtyLabel}`, { duration: 700 });
    }
    if (opts?.keepSearchFocus !== false) {
      requestAnimationFrame(() => {
        searchRef.current?.focus();
      });
    }
  }, [addItem, profile, taxRate, soundAlerts, allowNegativeStock]);

  const handleAddProduct = React.useCallback((p: ProductItem) => {
    openAddPopup(p);
  }, [openAddPopup]);

  const scanAndAddProduct = React.useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    type BarcodeLookup = ProductItem & {
      requiresVariantPick?: boolean;
      variants?: ProductItem[];
    };

    const finishScanOpen = (pick: ProductItem, matches?: ProductItem[]) => {
      setSelectedProductName(null);
      openAddPopup(pick, matches);
      setSearch("");
      setLastScanAt(new Date());
      setScanFlash(true);
      setTimeout(() => setScanFlash(false), 500);
      playPosSound("scan_ok", soundAlerts);
    };

    let found: BarcodeLookup | undefined;
    for (const key of barcodeLookupCandidates(trimmed)) {
      try {
        const r = await api.get<BarcodeLookup>(`/pos/barcode/${encodeURIComponent(key)}`);
        const fromApi = r.data;
        const apiVariants = Array.isArray(fromApi.variants) ? (fromApi.variants as ProductItem[]) : [];
        if (fromApi.requiresVariantPick || apiVariants.length > 1) {
          const matches = apiVariants.length > 0 ? apiVariants : [fromApi as ProductItem];
          const pick = matches.find((v) => v.stock > 0) ?? matches[0];
          finishScanOpen(pick, matches);
          return;
        }
        const cached = products.find((p) => p.variantId === fromApi.variantId);
        found = cached ? { ...cached, ...fromApi, stock: fromApi.stock } : fromApi;
        setProducts((prev) =>
          prev.map((p) => (p.variantId === fromApi.variantId ? { ...p, stock: fromApi.stock } : p)),
        );
        break;
      } catch {
        /* try next candidate key */
      }
    }

    if (!found) {
      const localMatches = findAllProductsByBarcodeCode(trimmed, products);
      if (localMatches.length > 1) {
        const pick = localMatches.find((p) => p.stock > 0) ?? localMatches[0];
        finishScanOpen(pick, localMatches);
        return;
      }
      found = localMatches[0] ?? findProductByBarcodeCode(trimmed, products);
      if (found) {
        const siblings = getVariants(found.productName);
        if (siblings.length > 1) {
          const codeLower = trimmed.toLowerCase();
          const exactSku = siblings.find((p) => p.sku.toLowerCase() === codeLower);
          const exactBarcode = siblings.find((p) => p.barcode?.toLowerCase() === codeLower);
          // Shared product barcode (no unique variant match) → picker
          if (!exactSku && !exactBarcode) {
            finishScanOpen(found, siblings);
            return;
          }
          found = exactSku ?? exactBarcode ?? found;
        }
      }
    }

    if (!found) {
      playPosSound("scan_fail", soundAlerts);
      toast.error(`Barcode/SKU not found: ${trimmed}`);
      setSearch("");
      requestAnimationFrame(() => searchRef.current?.focus());
      return;
    }
    finishScanOpen(found);
  }, [products, openAddPopup, soundAlerts, getVariants]);

  const handleCardClick = React.useCallback((p: ProductItem) => {
    openAddPopup(p);
  }, [openAddPopup]);

  const handleSearchEnter = React.useCallback(() => {
    const q = search.trim();
    if (!q) return;
    const barcodeLike =
      isLikelyBarcodeScan(q) ||
      matchesCachedBarcode(q, products) ||
      !!findProductByBarcodeCode(q, products);
    if (barcodeLike) {
      setSearch("");
      requestAnimationFrame(() => searchRef.current?.focus());
      void scanAndAddProduct(q);
      return;
    }
    if (productCards.length === 0) {
      setSearch("");
      requestAnimationFrame(() => searchRef.current?.focus());
      void scanAndAddProduct(q);
      return;
    }
    const idx = focusedProductIdx >= 0 && focusedProductIdx < productCards.length
      ? focusedProductIdx
      : 0;
    handleCardClick(productCards[idx].rep);
    setSearch("");
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [search, products, productCards, focusedProductIdx, scanAndAddProduct, handleCardClick]);

  const handleNumpad = React.useCallback((k:string)=>{ if(k==="DEL"){setNumpad(p=>p.slice(0,-1));return;} if(k==="."&&numpad.includes("."))return; setNumpad(p=>p+k); },[numpad]);

  const handlePinEntry = React.useCallback(async (digit: string) => {
    if (pinBusy) return;
    if (digit === "DEL") { setPinEntry(p => p.slice(0, -1)); setPinError(false); return; }
    const next = pinEntry + digit;
    if (next.length > 4) return;
    setPinEntry(next);
    if (next.length !== 4) return;

    setPinBusy(true);
    try {
      const res = await api.post<{
        unlockToken: string;
        cashier: PosActiveCashier;
        shiftReady?: boolean;
      }>("/pos/pin/unlock", { pin: next });
      const data = res.data;
      posCashierStorage.set(data.unlockToken, data.cashier);
      setActiveCashier(data.cashier);
      setPinLocked(false);
      setPinEntry("");
      setPinError(false);
      if (data.shiftReady) setShiftReady(true);
      toast.success(`Cashier: ${data.cashier.name}`);
      void loadTodayStats();
    } catch (e: unknown) {
      setPinError(true);
      setPinEntry("");
      toast.error((e as Error).message || "Incorrect PIN");
    } finally {
      setPinBusy(false);
    }
  }, [pinEntry, pinBusy, loadTodayStats]);

  /** Lock POS for cashier switch — clear unlock token so API stops attributing to previous cashier. */
  const lockCashier = React.useCallback(() => {
    posCashierStorage.clear();
    setActiveCashier(null);
    setPinLocked(true);
    setPinEntry("");
    setPinError(false);
  }, []);



  const handleCashClosed = React.useCallback((result: { needsApproval?: boolean; variance?: number }) => {
    setShowCashClose(false);
    setShiftReady(false);
    if (result.needsApproval) {
      toast.info("Manager must approve variance before you can start a new shift");
    }
  }, []);

  const handleDayEnd = React.useCallback(async()=>{
    if(dayEndLoading)return;
    setDayEndLoading(true);
    try{
      const r = await api.post<NonNullable<typeof dayEndSummary>>("/pos/day-end", {});
      setDayEndSummary(r.data);
      setShowDayEnd(true);
      toast.success("Day closed successfully");
    }catch(e:unknown){toast.error((e as Error).message??"Day end failed");}
    finally{setDayEndLoading(false);}
  },[dayEndLoading]);

  const toggleFullscreen = React.useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      toast.error("Fullscreen not available on this device");
    }
  }, []);

  React.useEffect(() => {
    const sync = () => setIsFullscreen(!!document.fullscreenElement);
    sync();
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  React.useEffect(() => {
    if (!posOpen && document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    }
  }, [posOpen]);

  const buildReceiptHtml = React.useCallback((r: SaleReceipt): string => {
    const s: ReceiptSettings = receiptSettings;
    const pw = s.paperWidth==="58mm"?"58mm":"80mm";
    const rows=r.items.map(i=>{
      const listUnit=i.listUnit??(i.qty>0?i.price/i.qty:0);
      const disc=i.discount??0;
      const discRow=disc>0?`<div class="row"><span>&nbsp;&nbsp;Discount</span><span>-LKR ${disc.toFixed(2)}</span></div>`:"";
      return `<div class="iname">${i.name}</div><div class="row"><span>${i.qty} x LKR ${listUnit.toFixed(2)}</span><span>LKR ${i.price.toFixed(2)}</span></div>${discRow}`;
    }).join("");
    const logoHtml=s.logoUrl?`<img src="${resolvePublicAssetUrl(s.logoUrl)}" style="max-width:80px;display:block;margin:0 auto 4px"/>`:"";
    const addr=[s.address1,s.address2].filter(Boolean).map(a=>`<sub>${a}</sub>`).join("");
    const contactHtml=[s.phone&&`<sub>${s.phone}</sub>`,s.email&&`<sub>${s.email}</sub>`,s.website&&`<sub>${s.website}</sub>`].filter(Boolean).join("");
    const headerMsg=s.headerText?`<sub style="font-style:italic">${s.headerText}</sub>`:"";
    const cashierHtml=s.showCashier?`<div class="row"><span>Cashier:</span><span>${activeCashier?.name ?? user?.name??"Admin"}</span></div>`:"";
    const customerHtml=(s.showCustomer&&r.customerName)?`<div class="row"><span>Customer:</span><span>${r.customerName}</span></div>`:"";
    const discountHtml=r.discount>0?`<div class="row"><span>Discount</span><span>-LKR ${r.discount.toFixed(2)}</span></div>`:"";
    const taxHtml=(s.showTax&&r.tax>0)?`<div class="row"><span>Tax</span><span>LKR ${r.tax.toFixed(2)}</span></div>`:"";
    const savingsAmt = r.savings ?? 0;
    const savingsHtml=savingsAmt>0?`<div class="save"><span>You saved</span><span>LKR ${savingsAmt.toFixed(2)}</span></div>`:"";
    // Always print scannable invoice barcode (Code128) on sale receipts
    const barcodeHtml=receiptInvoiceBarcodeHtml(r.invoiceNumber, pw==="58mm"?"58mm":"80mm");
    const css = receiptThemeStyleBlock({
      paperWidth: pw,
      fontSize: s.fontSize,
      // Thermal receipts must always stay printer-friendly (black on white).
      theme: "light",
    });
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Receipt</title><style>${css}</style></head><body>${logoHtml}<h1>${s.shopName||APP_NAME}</h1>${s.tagline?`<sub>${s.tagline}</sub>`:""}${addr}${contactHtml}${headerMsg}<hr class="d"/><div class="row"><span>Invoice:</span><span><b>${r.invoiceNumber}</b></span></div><div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div>${cashierHtml}${customerHtml}<hr class="d"/><div style="font-size:0.8em;font-weight:bold;margin-bottom:2px">ITEMS</div>${rows}<hr class="d"/><div class="row"><span>Subtotal</span><span>LKR ${r.subtotal.toFixed(2)}</span></div>${discountHtml}${taxHtml}<div class="tot"><span>TOTAL</span><span>LKR ${r.total.toFixed(2)}</span></div>${savingsHtml}<hr class="d"/><div class="row"><span>Payment</span><span><b>${r.paymentMethod}</b></span></div>${r.cashTendered?`<div class="row"><span>Cash Tendered</span><span>LKR ${r.cashTendered.toFixed(2)}</span></div><div class="row"><span>Change</span><span>LKR ${r.changeDue.toFixed(2)}</span></div>`:""}<hr class="d"/>${barcodeHtml}<div class="foot">${s.footerText||"Thank you for shopping!"}</div>${receiptSoftwareCreditHtml()}</body></html>`;
  },[user, activeCashier, receiptSettings]);

  const reprintSale = React.useCallback(async (saleId: string) => {
    setReprintingId(saleId);
    try {
      const r = await api.get<{
        invoiceNumber: string; total: number; changeDue: number; paymentMethod: string;
        subtotal: number; discountAmount: number; taxAmount: number; loyaltyDiscount?: number;
        customer?: SaleCustomer | null;
        items: { productName: string; variantName: string; quantity: number; unitPrice: number; total: number }[];
        payments?: { method: string }[];
      }>(`/pos/sales/${saleId}`);
      const s = r.data;
      const receipt: SaleReceipt = {
        invoiceNumber: s.invoiceNumber,
        total: s.total,
        changeDue: s.changeDue ?? 0,
        paymentMethod: s.payments?.map((p) => p.method).join(" + ") || s.paymentMethod,
        customerName: formatSaleCustomerName(s.customer),
        items: s.items.map((i) => ({
          name: receiptItemName(i.productName, i.variantName),
          qty: i.quantity,
          price: i.total,
        })),
        subtotal: s.subtotal,
        discount: (s.discountAmount ?? 0) + (s.loyaltyDiscount ?? 0),
        tax: s.taxAmount ?? 0,
        savings: (s.discountAmount ?? 0) + (s.loyaltyDiscount ?? 0),
      };
      await executeReceiptPrint({
        html: buildReceiptHtml(receipt),
        printType: "SALE",
        invoiceNumber: s.invoiceNumber,
        settings: receiptSettings,
        title: `Reprint ${s.invoiceNumber}`,
      });
      toast.success(`Reprinted ${s.invoiceNumber}`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Reprint failed");
    } finally {
      setReprintingId(null);
    }
  }, [receiptSettings, buildReceiptHtml]);

  const openCustomerPopup = React.useCallback(() => {
    setShowHeldBills(false);
    setCartCustomerOpen(false);
    setCustomerSearch("");
    setCustomers([]);
    setShowNewCust(false);
    setFocusedCustomerIdx(0);
    setActiveNav("customers");
  }, []);

  const openCartCustomerDropdown = React.useCallback(() => {
    setShowHeldBills(false);
    setCartShowNewCust(false);
    setFocusedCustomerIdx(0);
    setCartCustomerOpen(true);
    setTimeout(() => cartCustomerSearchRef.current?.focus(), 50);
  }, []);

  const openHeldBillsPopup = React.useCallback(() => {
    setActiveNav("products");
    setCartCustomerOpen(false);
    setShowHeldBills(true);
    void loadHeldBills();
  }, [loadHeldBills]);

  const handleCheckout = React.useCallback(async (forceMethod?: string) => {
    if(!items.length||checkoutLoading)return;
    if (pendingDiscountApproval) {
      toast.error("Waiting for manager discount approval — cannot checkout yet");
      return;
    }
    const payMethod = forceMethod ?? activePayment;
    if (forceMethod) setActivePayment(forceMethod);
    const tenderPad = forceMethod === "CASH" ? "" : numpad;
    const payments = buildCheckoutPayments(payState, payMethod, tenderPad, totalAmt, chequeNumber, partialPayAmount);
    if (payMethod === "WALLET" && !payState.splitMode) {
      if (!customer) { toast.error("Select a customer for wallet payment"); return; }
      payments.length = 0;
      payments.push({ method: "WALLET", amount: totalAmt });
    }
    if (payMethod === "CUSTOMER_CREDIT" && !payState.splitMode) {
      if (!customer) { toast.error("Select a customer for credit payment"); return; }
      const available = Math.max(0, (customer.creditLimit ?? 0) - (customer.outstandingBalance ?? 0));
      const paidNow = payments.reduce((s, p) => s + p.amount, 0);
      const isPartialNow = payState.allowPartial && paidNow > 0 && paidNow + 0.01 < totalAmt;
      if (isPartialNow) {
        const onCredit = totalAmt - paidNow;
        if (onCredit > available + 0.01) {
          toast.error(`Credit limit exceeded. Available: LKR ${available.toLocaleString()}`);
          return;
        }
      } else {
        if (available <= 0) { toast.error("No credit available — set credit limit on customer profile"); return; }
        if (totalAmt > available + 0.01) { toast.error(`Credit limit exceeded. Available: LKR ${available.toLocaleString()}`); return; }
        payments.length = 0;
        payments.push({ method: "CUSTOMER_CREDIT", amount: totalAmt });
      }
    }
    if (payMethod === "CHEQUE" && !payState.splitMode) {
      if (!chequeNumber.trim()) { toast.error("Enter cheque number"); return; }
      payments.length = 0;
      payments.push({ method: "CHEQUE", amount: totalAmt, reference: chequeNumber.trim() });
    }
    if (payState.splitMode) {
      const missingCheque = payments.some((p) => p.method === "CHEQUE" && !(p as { reference?: string }).reference);
      if (missingCheque) { toast.error("Enter cheque number on CHEQUE payment lines"); return; }
    }
    if (payMethod === "GIFT_VOUCHER" && !payState.splitMode) {
      if (!giftVoucherCode.trim()) { toast.error("Enter gift voucher code"); return; }
      try {
        const vr = await api.get<{ valid: boolean; reason?: string; maxApplicable?: number; balance?: number }>(
          `/pos/gift-vouchers/validate/${encodeURIComponent(giftVoucherCode.trim())}?amount=${totalAmt}`,
        );
        if (!vr.data?.valid) { toast.error(vr.data?.reason ?? "Invalid voucher"); return; }
        const applyAmt = Math.min(totalAmt, vr.data.maxApplicable ?? vr.data.balance ?? 0);
        payments.length = 0;
        payments.push({ method: "GIFT_VOUCHER", amount: applyAmt, reference: giftVoucherCode.trim().toUpperCase() });
        if (applyAmt + 0.01 < totalAmt) {
          toast.error(`Voucher covers LKR ${applyAmt.toFixed(2)} — use split pay for the remainder`);
          return;
        }
      } catch (e: unknown) {
        toast.error((e as Error).message ?? "Voucher validation failed");
        return;
      }
    }
    if (!payState.splitMode && !payState.allowPartial) {
      if (payMethod === "CASH" && tenderPad && parseFloat(tenderPad) < totalAmt) {
        toast.error("Cash tendered less than total — enable Partial pay for credit customers");
        return;
      }
      const paid = payments.reduce((s, p) => s + p.amount, 0);
      if (paid + 0.01 < totalAmt && payMethod !== "CASH") {
        toast.error("Payment amount is less than total");
        return;
      }
    }
    if (payState.allowPartial && !payState.splitMode && payMethod !== "CUSTOMER_CREDIT") {
      const paid = payments.reduce((s, p) => s + p.amount, 0);
      if (paid + 0.01 < totalAmt && paid > 0 && !customer?.id) {
        toast.error("Select a customer — unpaid balance goes on credit account");
        return;
      }
    }
    if (payments.length === 0 || payments.every((p) => p.amount <= 0)) {
      toast.error("Enter payment amount");
      return;
    }
    const paidCheck = payments.reduce((s, p) => s + p.amount, 0);
    const isPartialBill = paidCheck + 0.01 < totalAmt;
    if ((payState.allowPartial || isPartialBill) && isPartialBill) {
      if (!customer?.id) {
        toast.error("Select a customer — unpaid balance goes on credit account");
        return;
      }
      if ((customer.creditLimit ?? 0) <= 0) {
        toast.error("Customer has no credit limit — set a limit or collect full payment");
        return;
      }
    }
    setCheckoutLoading(true);
    try {
      const pm=new Map(products.map(p=>[p.variantId,p]));
      const payload={
        customerId:customer?.id,
        items:items.map(i=>({
          variantId: i.isCustom ? undefined : i.variantId,
          isCustom: !!i.isCustom,
          productName:i.productName,
          variantName: i.isCustom ? "" : i.variantName,
          sku: i.isCustom ? (i.sku || "CUSTOM") : i.sku,
          quantity:i.quantity,
          unitPrice:i.unitPrice,
          costPrice:i.isCustom ? (i.costPrice ?? 0) : (pm.get(i.variantId)?.costPrice??0),
          discount:i.discountAmount??0,
          discountType:i.discountType==="percentage"?"PERCENTAGE":"FIXED",
          taxRate:taxRate,
        })),
        payments,
        discountAmount:discountAmount(),
        couponCode:couponCode??undefined,
        loyaltyPointsToRedeem:loyaltyPointsToRedeem>0?loyaltyPointsToRedeem:undefined,
        allowPartialPayment: payState.allowPartial || paidCheck + 0.01 < totalAmt,
        applyTierDiscount:true,
        notes:cartNotes,
        ...(helperEmployeeId ? { helperEmployeeId } : {}),
        ...(activeHeldBillId?{heldBillId:activeHeldBillId}:{}),
      };
      const res=await api.post<{invoiceNumber:string;total:number;changeDue:number;paymentStatus?:string}>("/pos/sale",payload);
      const s=res.data;
      const saleSnapshot = {
        items: [...items],
        subtotal: subtotal(),
        discount: discountAmount() + payState.couponDiscount + tierDiscountAmt + loyaltyDiscountAmt,
        tax: taxAmount(),
        customerName: customer?.name,
        paymentMethod: payments.map((p) => p.method).join(" + "),
        cashTendered: payMethod === "CASH" && tenderPad ? parseFloat(tenderPad) : undefined,
        savings: items.reduce((sum, i) => {
          const lineDisc = calcPosLineDiscount(i);
          const mrpExtra = i.mrp && i.mrp > i.unitPrice ? (i.mrp - i.unitPrice) * i.quantity : 0;
          return sum + lineDisc + mrpExtra;
        }, 0) + discountAmount() + payState.couponDiscount + tierDiscountAmt + loyaltyDiscountAmt,
      };
      setTodayStats(prev=>({sales:prev.sales+s.total,orders:prev.orders+1,items:prev.items+items.reduce((a,i)=>a+i.quantity,0)}));
      setThankYouSale({
        invoiceNumber: s.invoiceNumber,
        total: s.total,
        changeDue: s.changeDue ?? 0,
        paymentMethod: saleSnapshot.paymentMethod,
        items: saleSnapshot.items,
        customerName: saleSnapshot.customerName,
        manualDiscount: discount,
        manualDiscountType: discountType,
        couponDiscount: payState.couponDiscount,
        loyaltyPoints: loyaltyPointsToRedeem,
        customerTier: customer?.membershipTier ?? null,
      });
      if (waBillEnabled) {
        const phone = (customer?.phone ?? "").trim();
        const itemsSummary = saleSnapshot.items
          .slice(0, 12)
          .map((i) => `• ${i.productName}${i.variantName ? ` (${i.variantName})` : ""} ×${i.quantity}`)
          .join("\n");
        setWaBillOffer({
          invoiceNumber: s.invoiceNumber,
          total: formatNumber(s.total),
          paymentMethod: saleSnapshot.paymentMethod,
          customerName: saleSnapshot.customerName,
          phone,
          itemsSummary,
        });
        setWaPhoneEdit(phone);
      } else {
        setWaBillOffer(null);
      }
      setTimeout(() => setThankYouSale(null), 12_000);
      clearCart();setNumpad("");setSelectedCartIdx(-1);setCartNotes("");setDiscountInput("");setPendingDiscountApproval(null);setCheckoutOpen(false);
      setHelperEmployeeId(""); setGiftVoucherCode(""); setChequeNumber("");
      setEditingCartQtyIdx(null);
      setPayState({ splitMode:false, paymentLines:[{method:"CASH",amount:""}], allowPartial:false, couponCode:"", couponDiscount:0, tierDiscountPct:0, currency:payState.currency });
      setPartialPayAmount("");
      setActiveNav("products");
      playPosSound("sale_ok", soundAlerts);
      // Always print receipt after sale (cashier workflow). Print server / thermal often kicks cash drawer on cash.
      {
        const receipt: SaleReceipt = {
          invoiceNumber: s.invoiceNumber,
          total: s.total,
          changeDue: s.changeDue ?? 0,
          paymentMethod: saleSnapshot.paymentMethod,
          customerName: saleSnapshot.customerName,
          items: saleSnapshot.items.map((i) => cartLineToReceiptItem(i)),
          subtotal: saleSnapshot.subtotal,
          discount: saleSnapshot.discount,
          tax: saleSnapshot.tax,
          savings: saleSnapshot.savings,
          cashTendered: saleSnapshot.cashTendered,
        };
        void executeReceiptPrint({
          html: buildReceiptHtml(receipt),
          printType: "SALE",
          invoiceNumber: s.invoiceNumber,
          settings: { ...receiptSettings, autoPrintAfterSale: true },
          title: `Receipt ${s.invoiceNumber}`,
        }).catch((e) => toast.error((e as Error).message ?? "Receipt print failed"));
      }
      // Reset for next sale immediately — do not block scanner on product reload
      setTimeout(() => searchRef.current?.focus(), 80);
      void loadHeldBills();
      void loadProducts();
      void loadTodayStats();
      void refreshPrinterStatus();
      const partialNote = s.paymentStatus === "PENDING" ? " (partial — balance on account)" : "";
      toast.success(`Sale complete · ${s.invoiceNumber} — ${payState.currency} ${s.total.toLocaleString()}${partialNote}`,{duration:3500});
    } catch(e:unknown){toast.error((e as Error).message??"Checkout failed");} finally{setCheckoutLoading(false);}
  },[items,checkoutLoading,activePayment,numpad,totalAmt,products,customer,discountAmount,couponCode,loyaltyPointsToRedeem,payState,clearCart,cartNotes,activeHeldBillId,helperEmployeeId,giftVoucherCode,chequeNumber,soundAlerts,loadHeldBills,loadProducts,loadTodayStats,refreshPrinterStatus,pendingDiscountApproval,receiptSettings,buildReceiptHtml,waBillEnabled]);

  const handleThermalPrint = React.useCallback(async () => {
    if (!items.length) { toast.error("Cart is empty"); return; }
    const s = receiptSettings;
    const pw = s.paperWidth === "58mm" ? "58mm" : "80mm";
    const rows = items.map(i => `<div class="iname">${receiptItemName(i.productName, i.variantName)}</div><div class="row"><span>${i.quantity} x LKR ${i.unitPrice.toFixed(2)}</span><span>LKR ${(i.quantity*i.unitPrice).toFixed(2)}</span></div>`).join("");
    const css = receiptThemeStyleBlock({
      paperWidth: pw,
      fontSize: s.fontSize,
      // Thermal receipts must always stay printer-friendly (black on white).
      theme: "light",
    });
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Pre-Bill</title><style>${css}</style></head><body><h1>${s.shopName||APP_NAME}</h1><sub>PRE-BILL</sub><hr class="d"/><div class="row"><span>Date:</span><span>${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}</span></div><div class="row"><span>Cashier:</span><span>${activeCashier?.name ?? user?.name??"Admin"}</span></div><hr class="d"/>${rows}<hr class="d"/><div class="tot"><span>TOTAL</span><span>LKR ${totalAmt.toFixed(2)}</span></div><hr class="d"/><div class="foot">** NOT A RECEIPT — PENDING PAYMENT **</div></body></html>`;
    try {
      await executeReceiptPrint({ html, printType: "PRE_BILL", settings: s, title: "Pre-Bill" });
      void refreshPrinterStatus();
    } catch (e) {
      toast.error((e as Error).message ?? "Print failed");
    }
  }, [items, totalAmt, receiptSettings, user, activeCashier, refreshPrinterStatus]);

  const setReceiptTheme = React.useCallback(async (theme: "light" | "dark") => {
    const next = { ...receiptSettings, receiptTheme: theme };
    try {
      localStorage.setItem("receipt_settings_cache", JSON.stringify(next));
    } catch { /* noop */ }
    setLocalPosTheme(theme);
    notifyReceiptSettingsUpdated();
    try {
      await api.put("/tenants/receipt-settings", next);
      toast.success(theme === "dark" ? "POS: Dark" : "POS: Light");
    } catch {
      // Keep terminal preference even if cashier can't save tenant settings
      toast.success(theme === "dark" ? "POS: Dark (this terminal)" : "POS: Light (this terminal)");
    }
  }, [receiptSettings]);

  const loadCustomerInsight = React.useCallback(async (customerId: string) => {
    if (!customerId) { setCustomerInsight(null); setPreviewCustomerId(null); return; }
    setPreviewCustomerId(customerId);
    setCustomerInsightLoading(true);
    try {
      const res = await api.get<{
        sales?: CustomerBillRow[];
        topProducts?: CustomerTopProduct[];
        outstandingSales?: CustomerBillRow[];
        totalOrders?: number;
        totalSpent?: number;
        creditBalance?: number;
        creditLimit?: number;
        creditAvailable?: number;
      }>(`/customers/${customerId}`);
      const data = res.data;
      setCustomerInsight({
        sales: Array.isArray(data.sales) ? data.sales : [],
        topProducts: Array.isArray(data.topProducts) ? data.topProducts : [],
        outstandingSales: Array.isArray(data.outstandingSales) ? data.outstandingSales : [],
        totalOrders: data.totalOrders,
        totalSpent: data.totalSpent,
        creditBalance: data.creditBalance,
        creditLimit: data.creditLimit,
        creditAvailable: data.creditAvailable,
      });
    } catch {
      setCustomerInsight({ sales: [], topProducts: [] });
    } finally {
      setCustomerInsightLoading(false);
    }
  }, []);

  const applyCustomer = React.useCallback((c: CustomerItem) => {
    if (!c?.id) { toast.error("Invalid customer — try again"); return; }
    setCustomer({
      id: c.id, name: c.name, phone: c.phone, email: c.email,
      membershipTier: (c.tier?.toLowerCase() ?? "bronze") as Customer["membershipTier"],
      loyaltyPoints: c.loyaltyPoints, walletBalance: c.walletBalance,
      totalPurchases: 0, totalSpent: 0,
      creditLimit: c.creditLimit, outstandingBalance: c.creditBalance,
      isActive: true, createdAt: new Date(),
    });
    setCartCustomerOpen(false);
    setCartShowNewCust(false);
    setCustomerSearch("");
    setCustomers([]);
    setShowNewCust(false);
    void loadCustomerInsight(c.id);
    toast.success(`${c.name} added to bill`);
  }, [setCustomer, loadCustomerInsight]);

  const payCustomerOutstanding = React.useCallback(async (customerId: string, customerName: string) => {
    const amt = parseFloat(creditPayAmount);
    if (!(amt > 0)) { toast.error("Enter payment amount"); return; }
    const owed = customerInsight?.creditBalance ?? 0;
    if (owed <= 0) { toast.error("No outstanding balance"); return; }
    if (amt > owed + 0.01) {
      toast.error(`Amount exceeds outstanding (LKR ${formatNumber(owed)})`);
      return;
    }
    setCreditPayBusy(true);
    try {
      await api.post(`/customers/${customerId}/credit/payment`, {
        amount: amt,
        paymentMethod: creditPayMethod,
        description: `POS credit settlement — ${customerName}`,
      });
      toast.success(`Received LKR ${formatNumber(amt)} from ${customerName}`);
      setCreditPayAmount("");
      void loadCustomerInsight(customerId);
      if (customer?.id === customerId) {
        setCustomer({
          ...customer,
          outstandingBalance: Math.max(0, (customer.outstandingBalance ?? 0) - amt),
        });
      }
      setInlineCustomers((prev) =>
        prev.map((c) => (c.id === customerId ? { ...c, creditBalance: Math.max(0, (c.creditBalance ?? 0) - amt) } : c)),
      );
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Payment failed");
    } finally {
      setCreditPayBusy(false);
    }
  }, [creditPayAmount, creditPayMethod, customerInsight?.creditBalance, customer, loadCustomerInsight, setCustomer]);

  const saveNewCustomer = React.useCallback(async () => {
    if (!newCustFirst.trim() || !newCustPhone.trim()) { toast.error("First name and phone are required"); return; }
    setNewCustSaving(true);
    try {
      const res = await api.post<any>("/customers", { firstName: newCustFirst.trim(), lastName: newCustLast.trim()||undefined, phone: newCustPhone.trim(), email: newCustEmail.trim()||undefined });
      const c = res.data;
      const item: CustomerItem = mapApiCustomer(c);
      applyCustomer(item);
      setNewCustFirst(""); setNewCustLast(""); setNewCustPhone(""); setNewCustEmail("");
      setInlineCustomerSearch(""); setInlineCustomers([]);
    } catch(e:unknown){ toast.error((e as Error).message??"Failed to register customer"); }
    finally { setNewCustSaving(false); }
  }, [newCustFirst, newCustLast, newCustPhone, newCustEmail, applyCustomer]);

  const handleSplitBill = React.useCallback(async () => {
    if (selectedCartIdx < 0 || !items[selectedCartIdx]) {
      toast.error("Select a cart line (↑↓) then split");
      return;
    }
    const splitItem = items[selectedCartIdx];
    if (items.length <= 1) {
      toast.error("Add more items or use Hold Bill for the full cart");
      return;
    }
    try {
      const payload = getHoldPayload();
      await api.post("/pos/hold", {
        label: `Split · ${splitItem.productName}`,
        data: { ...payload, items: [splitItem], notes: `Split from active bill` },
      });
      removeItem(splitItem.variantId);
      setSelectedCartIdx(-1);
      await loadHeldBills();
      await loadProducts();
      toast.success(`${splitItem.productName} moved to held bills — checkout the rest`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Split bill failed");
    }
  }, [selectedCartIdx, items, getHoldPayload, removeItem, loadHeldBills, loadProducts]);

  React.useEffect(() => { setFocusedProductIdx(-1); }, [search, activeCategory, productCards.length]);
  React.useEffect(() => { setFocusedHeldIdx(0); }, [serverHeldBills.length]);
  React.useEffect(() => { setFocusedCustomerIdx(0); }, [customers.length, inlineCustomers.length, cartCustomerOpen]);

  const adjustSelectedQty = React.useCallback((delta: number) => {
    if (selectedCartIdx < 0) return;
    const it = items[selectedCartIdx];
    if (it) updateQuantity(it.variantId, it.quantity + delta);
  }, [selectedCartIdx, items, updateQuantity]);

  const removeSelectedCartItem = React.useCallback(() => {
    if (selectedCartIdx < 0) return;
    const it = items[selectedCartIdx];
    if (it) {
      removeItem(it.variantId);
      setSelectedCartIdx((i) => Math.max(-1, i - 1));
    }
  }, [selectedCartIdx, items, removeItem]);

  const openQtyEditForSelected = React.useCallback(() => {
    if (selectedCartIdx < 0) return;
    const it = items[selectedCartIdx];
    if (!it) return;
    setEditingCartQtyIdx(selectedCartIdx);
    setEditingCartQtyRaw(
      isPosWeightedProduct(it) ? String(cartQtyToGrams(it.quantity, it)) : String(it.quantity),
    );
  }, [selectedCartIdx, items]);

  const closeQtyPopup = React.useCallback(() => setAddPopup(null), []);

  const keyboardCtx = React.useMemo(() => ({
    posOpen,
    pinLocked,
    checkoutOpen,
    showShortcuts,
    showCustomerSearch: cartCustomerOpen,
    showHeldBills,
    showDayEnd,
    qtyPopupOpen: !!addPopup,
    selectedProductName: selectedProductName ?? addPopup?.productName ?? null,
    activeNav,
    activePayment,
    itemsLength: items.length,
    selectedCartIdx,
    focusedProductIdx,
    focusedHeldIdx,
    focusedCustomerIdx,
    filteredProductsLength: productCards.length,
    serverHeldBillsLength: serverHeldBills.length,
    navItems,
    categories,
    activeCategory,
    customersLength: customers.length,
    inlineCustomersLength: inlineCustomers.length,
    customerModalListLength: customers.length,
    showNewCust: cartCustomerOpen ? cartShowNewCust : showNewCust,
    inCheckout: checkoutOpen,
    searchRef,
    cartCustomerSearchRef,
    discountInputRef,
    barcodeBuffer,
    lastKeyTime,
    barcodeTimer,
    setShowShortcuts,
    setCheckoutOpen,
    setSelectedProductName: (v: string | null) => {
      setSelectedProductName(v);
      if (!v) setAddPopup(null);
    },
    setShowCustomerSearch: setCartCustomerOpen,
    setShowHeldBills,
    setCustomerSearch,
    setCustomers,
    setActiveNav,
    setActivePayment,
    setSelectedCartIdx,
    setFocusedProductIdx,
    setFocusedHeldIdx,
    setFocusedCustomerIdx,
    setActiveCategory,
    setShowNewCust: ((v: React.SetStateAction<boolean>) => {
      if (cartCustomerOpen) setCartShowNewCust(v);
      else setShowNewCust(v);
    }) as React.Dispatch<React.SetStateAction<boolean>>,
    setShowDayEnd,
    setPinLocked,
    setPinEntry,
    setPinError,
    lockCashier,
    closePos,
    handlePinEntry,
    scanAndAddProduct,
    handleSearchEnter,
    handleAddProduct,
    handleCardClick,
    handleNumpad,
    handleCheckout,
    handleHoldBill,
    handleRestoreHeldBill,
    handleDeleteHeldBill,
    handleSplitBill,
    handleThermalPrint,
    handleDayEnd,
    loadProducts,
    clearCart,
    setCustomer,
    updateQuantity,
    removeItem,
    adjustSelectedQty,
    removeSelectedCartItem,
    openQtyEditForSelected,
    closeQtyPopup,
    applyCustomer,
    toggleCheckoutPartial,
    toggleCheckoutSplit,
    focusCheckoutCoupon,
    focusCheckoutPartialPay,
    setQuickCash,
    payStateAllowPartial: payState.allowPartial,
    payStateSplitMode: payState.splitMode,
    openCartCustomer: openCartCustomerDropdown,
    openCashClose,
    showCashClose,
    closeCashClose,
    waBillOfferOpen: !!waBillOffer,
    closeWaBillOffer,
    sendWaBill,
    setExactCashTender,
    focusCheckoutGiftOrCheque,
    getFilteredProduct: (idx: number) => productCards[idx]?.rep,
    getHeldBill: (idx: number) => serverHeldBills[idx],
    getCustomerModalItem: (idx: number) => customers[idx],
    getInlineCustomer: (idx: number) => inlineCustomers[idx],
  }), [
    posOpen, pinLocked, checkoutOpen, showShortcuts, cartCustomerOpen, showHeldBills, showDayEnd, showCashClose,
    waBillOffer, addPopup, selectedProductName, activeNav, activePayment, items.length, selectedCartIdx,
    focusedProductIdx, focusedHeldIdx, focusedCustomerIdx, productCards, serverHeldBills,
    navItems, categories, activeCategory, customers, inlineCustomers, showNewCust, cartShowNewCust, cartCustomerOpen,
    closePos, handlePinEntry, lockCashier, scanAndAddProduct, handleSearchEnter, handleAddProduct, handleCardClick,
    handleNumpad, handleCheckout, handleHoldBill, handleRestoreHeldBill, handleDeleteHeldBill,
    handleSplitBill, handleThermalPrint, handleDayEnd, loadProducts, clearCart, setCustomer,
    updateQuantity, removeItem, adjustSelectedQty, removeSelectedCartItem, openQtyEditForSelected, closeQtyPopup, applyCustomer,
    toggleCheckoutPartial, toggleCheckoutSplit, focusCheckoutCoupon, focusCheckoutPartialPay, setQuickCash,
    openCartCustomerDropdown, openCashClose, closeCashClose, closeWaBillOffer, sendWaBill, setExactCashTender, focusCheckoutGiftOrCheque,
    payState.allowPartial, payState.splitMode,
  ]);

  React.useEffect(() => {
    if (activeNav === "hold-bills") openHeldBillsPopup();
  }, [activeNav, openHeldBillsPopup]);

  usePosKeyboard(keyboardCtx as Parameters<typeof usePosKeyboard>[0]);

  React.useEffect(() => {
    if (posOpen && !pinLocked && !waBillOffer) {
      const t = setTimeout(() => searchRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [posOpen, pinLocked, waBillOffer]);

  React.useEffect(() => {
    if (!waBillOffer) return;
    const t = setTimeout(() => {
      waPhoneRef.current?.focus();
      waPhoneRef.current?.select();
    }, 80);
    return () => clearTimeout(t);
  }, [waBillOffer]);

  React.useEffect(() => {
    if (activeNav !== "customers") return;
    if (customer?.id) void loadCustomerInsight(customer.id);
  }, [activeNav, customer?.id, loadCustomerInsight]);

  //  Center content per nav 
  const renderCenter = () => {
    const lightUi = resolvePosUiMode(receiptSettings.receiptTheme) === "light";
    // PRODUCTS
    if (activeNav === "products") return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b overflow-x-auto shrink-0 scrollbar-none" style={{borderColor:"var(--pos-border)"}}>
          {categories.map(cat=>(
            <button key={cat} onClick={()=>setActiveCategory(cat)} className="px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-all" style={{background:activeCategory===cat?"linear-gradient(135deg,#4f6ef7,#7c3aed)":"var(--pos-input)",color:activeCategory===cat?"#fff":"var(--pos-muted)"}}>
              {cat}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading?(<div className="flex items-center justify-center h-48"><Loader2 className="h-8 w-8 animate-spin" style={{color:"#4f6ef7"}}/></div>):productCards.length===0?(<div className="flex flex-col items-center justify-center h-48" style={{color:"var(--pos-muted-2)"}}><Package className="h-12 w-12 mb-2 opacity-30"/><p className="text-sm">No products found</p></div>):(
            <div className="grid gap-2" style={{gridTemplateColumns:"repeat(auto-fill,minmax(165px,1fr))"}}>
              {productCards.map((card, pIdx)=>{
                const p = card.rep;
                const varStock = card.totalStock;
                const lowStock = varStock > 0 && varStock <= 5;
                const multi = card.variants.length > 1;
                const kbFocus = focusedProductIdx === pIdx;
                const priceLabel = multi && card.minPrice !== card.maxPrice
                  ? `LKR ${formatNumber(card.minPrice)}–${formatNumber(card.maxPrice)}`
                  : `LKR ${formatNumber(card.minPrice)}`;
                const thumbBg = getCardBg(p.color, lightUi);
                return (
                  <motion.div key={p.productId || p.productName} whileTap={{scale:0.96}} onClick={()=>{setFocusedProductIdx(pIdx);handleCardClick(p);}} className="rounded-xl overflow-hidden cursor-pointer group relative border transition-all hover:border-blue-500/50" style={{background:"var(--pos-card)",borderColor:kbFocus||selectedProductName===p.productName||addPopup?.productName===p.productName?"#4f6ef7":"var(--pos-border)",boxShadow:kbFocus?"0 0 0 2px rgba(79,110,247,0.45)":"none"}}>
                    <div className="relative" style={{aspectRatio:"4/3",background:posImageSrc(p.imageUrl)?"var(--pos-card)":thumbBg}}>
                      <PosProductThumb url={p.imageUrl} name={p.productName} light={lightUi} className="absolute inset-0 w-full h-full opacity-90" fallbackBg={thumbBg} iconClassName="h-10 w-10" />
                      <div className="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white" style={{background:varStock===0?"#dc2626":varStock<=5?"var(--pos-warn-pill)":"#16a34a"}}>{varStock}</div>
                      {multi && <div className="absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{background:"rgba(79,110,247,0.9)",color:"#fff"}}>{card.variants.length} variants</div>}
                      {varStock===0&&<div className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{background:allowNegativeStock?"var(--pos-warn-pill)":"rgba(220,38,38,0.85)",color:"#fff"}}>{allowNegativeStock?"Stock 0 — sell OK":"Out of Stock"}</div>}{lowStock&&varStock>0&&<div className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold" style={{background:"var(--pos-warn-pill)",color:"#fff"}}>Low Stock</div>}
                      <button onClick={e=>{e.stopPropagation();handleCardClick(p);}} className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all" style={{background:"#4f6ef7"}}><Plus className="h-3.5 w-3.5 text-white"/></button>
                    </div>
                    <div className="p-2"><p className="text-white text-sm font-semibold leading-tight line-clamp-1">{p.productName}</p><p className="text-xs mt-0.5 line-clamp-1" style={{color:"var(--pos-muted)"}}>{multi ? "Tap to choose variant" : (variantDisplayLabel(p, profile) || p.variantName)}</p><p className="text-base font-bold mt-0.5" style={{color:"#4f6ef7"}}>{priceLabel}</p></div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex border-t shrink-0" style={{height:"180px",borderColor:"var(--pos-border)"}}>
          <div className="flex-1 border-r flex flex-col min-w-0" style={{borderColor:"var(--pos-border)"}}>
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{borderColor:"var(--pos-border)"}}><span className="text-base font-bold text-white">Popular Items</span><button type="button" onClick={() => { setActiveCategory("All"); setSearch(""); searchRef.current?.focus(); }} className="text-sm font-semibold" style={{color:"#4f6ef7"}}>View All</button></div>
            <div className="overflow-y-auto flex-1">{popularItems.length===0?<div className="flex flex-col items-center justify-center h-full" style={{color:"var(--pos-muted-2)"}}><Package className="h-8 w-8 mb-2 opacity-30"/><p className="text-sm font-semibold">No popular items yet</p></div>:popularItems.map(p=>(<button key={p.variantId} onClick={()=>commitAddProduct(p, 1, { keepSearchFocus: true })} className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"><PosProductThumb url={p.imageUrl} name={p.productName} light={lightUi} className="h-10 w-10 rounded-lg shrink-0 overflow-hidden" fallbackBg={getCardBg(p.color??p.material, lightUi)} iconClassName="h-5 w-5" /><div className="flex-1 min-w-0"><p className="text-white text-sm font-bold truncate">{p.productName}</p><p className="text-xs truncate" style={{color:"var(--pos-muted)"}}>{variantDisplayLabel(p, profile)}</p></div><span className="text-sm font-bold shrink-0" style={{color:"#4f6ef7"}}>LKR {formatNumber(p.unitPrice)}</span></button>))}</div>
          </div>
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center justify-between px-4 py-2 border-b shrink-0" style={{borderColor:"var(--pos-border)"}}><span className="text-base font-bold text-white">Recent Scan</span>{recentScans.length>0&&<button onClick={()=>setRecentScans([])} className="p-1 rounded hover:bg-white/10"><Trash2 className="h-4 w-4" style={{color:"var(--pos-muted)"}}/></button>}</div>
            <div className="overflow-y-auto flex-1">{recentScans.length===0?<div className="flex flex-col items-center justify-center h-full" style={{color:"var(--pos-muted-2)"}}><Scan className="h-10 w-10 mb-2 opacity-30"/><p className="text-sm font-semibold">No recent scans</p></div>:recentScans.map(s=>{
              const product = products.find((p) => p.variantId === s.variantId);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { if (product) handleAddProduct(product); else toast.info("Product not in catalog cache — scan again"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 border-b hover:bg-white/5 transition-colors text-left"
                  style={{borderColor:"var(--pos-border)"}}
                >
                  <Scan className="h-4 w-4 shrink-0" style={{color:"#4f6ef7"}}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-bold truncate">{s.name}</p>
                    <p className="text-xs truncate" style={{color:"var(--pos-muted)"}}>{s.variant} · ×{s.qty}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold block" style={{color:"#4f6ef7"}}>LKR {formatNumber(s.price)}</span>
                    <span className="text-[10px]" style={{color:"var(--pos-muted-2)"}}>{s.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
                  </div>
                </button>
              );
            })}</div>
          </div>
        </div>
      </div>
    );

    // QUICK PRODUCT (catalog)
    if (activeNav === "quick-product") {
      return (
        <PosQuickProductPanel
          onBack={() => setActiveNav("products")}
          onCreated={() => {
            void loadProducts();
            setActiveNav("products");
          }}
        />
      );
    }

    // DEMO PRODUCT (bill-only, not in products table)
    if (activeNav === "demo-product") {
      return (
        <PosDemoProductPanel
          onBack={() => setActiveNav("products")}
          taxRate={taxRate}
          onAddToCart={(item) => {
            addItem(item);
            setActiveNav("products");
          }}
        />
      );
    }

    // QUICK EXPENSE
    if (activeNav === "expenses") {
      return (
        <PosQuickExpensePanel
          onBack={() => setActiveNav("products")}
          onSaved={() => void loadTodayStats()}
        />
      );
    }

    // QUICK GRN
    if (activeNav === "quick-grn") {
      return (
        <PosQuickGrnPanel
          onBack={() => {
            setActiveNav("products");
          }}
          onPosted={() => {
            setCheckoutOpen(false);
            setActiveNav("products");
            void loadProducts();
          }}
        />
      );
    }

    // CUSTOMERS
    if (activeNav === "customers") {
      const insightCustomer = customer ?? inlineCustomers.find((c) => c.id === previewCustomerId) ?? null;
      return (
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        {/* Search bar + Register button */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{color:"var(--pos-muted)"}}/>
            <input value={inlineCustomerSearch} onChange={e=>{setInlineCustomerSearch(e.target.value);setShowNewCust(false);}} placeholder="Search customer by name or phone..." className="w-full pl-9 pr-9 h-10 rounded-xl text-sm text-white outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/>
            {inlineCustLoading&&<Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" style={{color:"#4f6ef7"}}/>}
          </div>
          <button onClick={()=>{setShowNewCust(s=>!s);setInlineCustomerSearch("");setInlineCustomers([]);}} className="flex items-center gap-1.5 px-4 h-10 rounded-xl text-sm font-bold text-white shrink-0 transition-all hover:opacity-90" style={{background:showNewCust?"var(--pos-card)":"#4f6ef7",border:showNewCust?"1px solid #4f6ef7":"none"}}>
            {showNewCust?<X className="h-4 w-4"/>:<Plus className="h-4 w-4"/>}{showNewCust?"Cancel":"Register New"}
          </button>
        </div>
        {/* Register form */}
        {showNewCust&&(
          <div className="shrink-0 rounded-2xl border p-4 space-y-3" style={{background:"var(--pos-card)",borderColor:"#4f6ef7"}}>
            <p className="text-white font-bold text-sm flex items-center gap-2"><User className="h-4 w-4" style={{color:"#4f6ef7"}}/>Register New Customer</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"var(--pos-muted)"}}>First Name *</label><input value={newCustFirst} onChange={e=>setNewCustFirst(e.target.value)} placeholder="John" autoFocus className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/></div>
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"var(--pos-muted)"}}>Last Name</label><input value={newCustLast} onChange={e=>setNewCustLast(e.target.value)} placeholder="Doe" className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/></div>
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"var(--pos-muted)"}}>Phone *</label><input value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="077 123 4567" className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/></div>
              <div><label className="text-[11px] font-semibold block mb-1" style={{color:"var(--pos-muted)"}}>Email</label><input type="email" value={newCustEmail} onChange={e=>setNewCustEmail(e.target.value)} placeholder="john@email.com" className="w-full h-9 px-3 rounded-xl text-sm text-white outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/></div>
            </div>
            <button onClick={saveNewCustomer} disabled={newCustSaving||!newCustFirst.trim()||!newCustPhone.trim()} className="w-full h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 flex items-center justify-center gap-2 disabled:opacity-40" style={{background:"#4f6ef7"}}>
              {newCustSaving?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}{newCustSaving?"Saving...":"Save & Add to Bill"}
            </button>
          </div>
        )}
        {/* Active bill customer */}
        {customer ? (
          <div className="shrink-0 flex items-center gap-3 p-3 rounded-xl" style={{background:"rgba(79,110,247,0.1)",border:"1px solid rgba(79,110,247,0.3)"}}>
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{customer.name?.[0]}</div>
            <div className="flex-1 min-w-0"><p className="text-white text-sm font-bold">{customer.name}</p><p className="text-xs" style={{color:"var(--pos-muted)"}}>{customer.phone}{showLoyalty ? <> · <span className="capitalize">{customer.membershipTier}</span> · {customer.loyaltyPoints} pts</> : null}</p></div>
            <span className="text-xs font-semibold px-2 py-1 rounded-lg shrink-0" style={{background:"rgba(16,185,129,0.15)",color:"#10b981"}}>On bill</span>
            <button onClick={()=>{setCustomer(null);setCustomerInsight(null);setPreviewCustomerId(null);toast.info("Customer removed from bill");}} className="p-1.5 rounded-lg hover:bg-white/10"><X className="h-4 w-4" style={{color:"var(--pos-muted)"}}/></button>
          </div>
        ) : (
          <div className="shrink-0 flex items-center gap-3 p-3 rounded-xl border border-dashed" style={{borderColor:"var(--pos-border)",background:"var(--pos-card)"}}>
            <User className="h-5 w-5 shrink-0" style={{color:"var(--pos-muted)"}}/>
            <p className="text-sm flex-1" style={{color:"var(--pos-muted)"}}>No {workspace.customerLabel.toLowerCase()} on bill — tap <span className="font-bold text-white">Select</span> below</p>
          </div>
        )}
        {/* List + insight */}
        <div className="flex-1 min-h-0 grid gap-3" style={{gridTemplateColumns:"minmax(260px,1fr) minmax(280px,1.1fr)"}}>
          <div className="min-h-0 overflow-y-auto rounded-xl border p-2" style={{borderColor:"var(--pos-border)",background:"var(--pos-panel)"}}>
            {inlineCustomers.length===0&&!inlineCustomerSearch&&!inlineCustLoading&&!showNewCust&&<div className="flex flex-col items-center justify-center h-48" style={{color:"var(--pos-muted-2)"}}><Users className="h-12 w-12 mb-2 opacity-20"/><p className="text-sm">No customers yet — register a new customer</p></div>}
            {inlineCustomers.length===0&&inlineCustomerSearch&&!inlineCustLoading&&(
              <div className="flex flex-col items-center justify-center h-40 gap-3" style={{color:"var(--pos-muted-2)"}}>
                <AlertCircle className="h-8 w-8 opacity-30"/>
                <p className="text-sm">No customers found</p>
                <button onClick={()=>{setShowNewCust(true);if(/^\d+$/.test(inlineCustomerSearch.trim()))setNewCustPhone(inlineCustomerSearch.trim());setInlineCustomerSearch("");setInlineCustomers([]);}} className="flex items-center gap-1.5 px-4 h-9 rounded-xl text-sm font-bold text-white" style={{background:"#4f6ef7"}}><Plus className="h-4 w-4"/>Register New Customer</button>
              </div>
            )}
            <div className="space-y-2">
              {inlineCustomers.map((c, cIdx)=>(
                <div key={c.id} role="button" tabIndex={0}
                  onClick={() => { setFocusedCustomerIdx(cIdx); void loadCustomerInsight(c.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyCustomer(c); } }}
                  className="flex items-center gap-3 p-3 rounded-xl border transition-all hover:border-blue-500/40 cursor-pointer"
                  style={{background:focusedCustomerIdx===cIdx||previewCustomerId===c.id?"rgba(79,110,247,0.12)":"var(--pos-card)",borderColor:customer?.id===c.id?"#10b981":focusedCustomerIdx===cIdx||previewCustomerId===c.id?"#4f6ef7":"var(--pos-border)",boxShadow:focusedCustomerIdx===cIdx?"0 0 0 2px rgba(79,110,247,0.35)":"none"}}>
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-white font-bold shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{c.name?.[0]}</div>
                  <div className="flex-1 min-w-0"><p className="text-white text-sm font-semibold truncate">{c.name}</p><p className="text-xs truncate" style={{color:"var(--pos-muted)"}}>{c.phone}</p><div className="flex items-center gap-2 mt-0.5"><span className="text-[10px] font-bold capitalize" style={{color:TIER_COLOR[c.tier?.toLowerCase()??"bronze"]}}>{c.tier??"—"}</span>{showLoyalty && <span className="text-[10px]" style={{color:"var(--pos-muted-2)"}}>{c.loyaltyPoints} pts</span>}</div></div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); applyCustomer(c); }} className="px-3 py-1.5 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90 shrink-0 flex items-center gap-1" style={{background:customer?.id===c.id?"#10b981":"#4f6ef7"}}>{customer?.id===c.id?<><Check className="h-3 w-3"/> Selected</>:"Select"}</button>
                </div>
              ))}
            </div>
          </div>
          <div className="min-h-0 overflow-y-auto rounded-xl border p-3 flex flex-col gap-3" style={{borderColor:"var(--pos-border)",background:"var(--pos-panel)"}}>
            {!previewCustomerId && !customer ? (
              <div className="flex flex-col items-center justify-center flex-1" style={{color:"var(--pos-muted-2)"}}>
                <FileText className="h-12 w-12 mb-2 opacity-20"/>
                <p className="text-sm font-medium">Customer history</p>
                <p className="text-xs mt-1 text-center opacity-70">Tap a customer to preview bills & top products, then Select to add to bill</p>
              </div>
            ) : customerInsightLoading ? (
              <div className="flex items-center justify-center flex-1"><Loader2 className="h-7 w-7 animate-spin" style={{color:"#4f6ef7"}}/></div>
            ) : (
              <>
                <div className="shrink-0">
                  <p className="text-white text-sm font-bold truncate">{insightCustomer?.name ?? "Customer"}</p>
                  <p className="text-xs" style={{color:"var(--pos-muted)"}}>
                    {typeof customerInsight?.totalOrders === "number" ? `${customerInsight.totalOrders} orders` : `${customerInsight?.sales.length ?? 0} recent bills`}
                    {typeof customerInsight?.totalSpent === "number" ? ` · LKR ${formatNumber(customerInsight.totalSpent)} spent` : ""}
                  </p>
                  {(customerInsight?.creditBalance ?? 0) > 0 && (
                    <div className="mt-2 flex items-center justify-between px-2.5 py-2 rounded-lg" style={{background:"var(--pos-warn-bg)",border:"1px solid var(--pos-warn-border)"}}>
                      <span className="text-[10px] font-bold uppercase" style={{color:"var(--pos-warn-soft)"}}>Outstanding</span>
                      <span className="text-sm font-bold tabular-nums" style={{color:"var(--pos-warn-soft)"}}>LKR {formatNumber(customerInsight!.creditBalance!)}</span>
                    </div>
                  )}
                  {(customerInsight?.creditLimit ?? 0) > 0 && (
                    <p className="text-[10px] mt-1" style={{color:"var(--pos-muted)"}}>
                      Credit limit LKR {formatNumber(customerInsight!.creditLimit!)} · Available LKR {formatNumber(customerInsight!.creditAvailable ?? 0)}
                    </p>
                  )}
                </div>
                {(customerInsight?.creditBalance ?? 0) > 0 && previewCustomerId && (
                  <div className="shrink-0 rounded-xl border p-3 space-y-2" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{color:"var(--pos-muted)"}}>Settle outstanding</p>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={0.01}
                        step="0.01"
                        value={creditPayAmount}
                        onChange={(e) => setCreditPayAmount(e.target.value)}
                        placeholder={`Max ${formatNumber(customerInsight!.creditBalance!)}`}
                        className="flex-1 h-9 rounded-xl px-3 text-sm text-white outline-none"
                        style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}
                      />
                      <select
                        value={creditPayMethod}
                        onChange={(e) => setCreditPayMethod(e.target.value)}
                        className="h-9 rounded-xl px-2 text-xs text-white outline-none"
                        style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}
                      >
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="UPI">UPI</option>
                        <option value="BANK_TRANSFER">Bank</option>
                      </select>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCreditPayAmount(String(customerInsight!.creditBalance!))}
                        className="flex-1 h-8 rounded-lg text-[10px] font-bold"
                        style={{background:"var(--pos-input)",color:"var(--pos-accent-soft)",border:"1px solid var(--pos-border)"}}
                      >
                        Pay full
                      </button>
                      <button
                        type="button"
                        disabled={creditPayBusy}
                        onClick={() => void payCustomerOutstanding(previewCustomerId, insightCustomer?.name ?? "Customer")}
                        className="flex-1 h-8 rounded-lg text-[10px] font-bold text-white disabled:opacity-40"
                        style={{background:"linear-gradient(135deg,#10b981,#059669)"}}
                      >
                        {creditPayBusy ? "Paying…" : "Receive payment"}
                      </button>
                    </div>
                  </div>
                )}
                {(customerInsight?.outstandingSales?.length ?? 0) > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-3.5 w-3.5" style={{color:"var(--pos-warn-soft)"}}/>
                      <p className="text-xs font-bold uppercase tracking-wide" style={{color:"var(--pos-muted)"}}>Unpaid bills</p>
                    </div>
                    <div className="space-y-1.5">
                      {customerInsight!.outstandingSales!.map((sale) => (
                        <div key={sale.id} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg" style={{background:"var(--pos-warn-bg)",border:"1px solid var(--pos-warn-border)"}}>
                          <div className="min-w-0">
                            <p className="text-xs font-mono font-bold truncate" style={{color:"var(--pos-warn-soft)"}}>{sale.invoiceNumber}</p>
                            <p className="text-[10px]" style={{color:"var(--pos-muted)"}}>
                              {new Date(sale.invoiceDate).toLocaleDateString("en-LK", { day: "2-digit", month: "short" })}
                              {" · "}Due LKR {formatNumber(sale.balanceDue ?? sale.total - (sale.amountPaid ?? 0))}
                            </p>
                          </div>
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{background:"var(--pos-warn-bg)",color:"var(--pos-warn-soft)"}}>PENDING</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-3.5 w-3.5" style={{color:"#4f6ef7"}}/>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{color:"var(--pos-muted)"}}>Previous bills</p>
                  </div>
                  {(customerInsight?.sales.length ?? 0) === 0 ? (
                    <p className="text-xs py-3 text-center" style={{color:"var(--pos-muted-2)"}}>No previous bills</p>
                  ) : (
                    <div className="space-y-1.5">
                      {customerInsight!.sales.slice(0, 10).map((sale) => {
                        const isPending = sale.paymentStatus === "PENDING";
                        const due = sale.balanceDue ?? (isPending ? sale.total - (sale.amountPaid ?? 0) : 0);
                        return (
                        <div key={sale.id} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg" style={{background:isPending?"var(--pos-warn-bg)":"var(--pos-card)",border:`1px solid ${isPending?"var(--pos-warn-border)":"var(--pos-border)"}`}}>
                          <div className="min-w-0">
                            <p className="text-xs font-mono font-bold truncate" style={{color:isPending?"var(--pos-warn-soft)":"#4f6ef7"}}>{sale.invoiceNumber}</p>
                            <p className="text-[10px]" style={{color:"var(--pos-muted)"}}>{new Date(sale.invoiceDate).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})} · {sale._count?.items ?? 0} items{isPending && due > 0 ? ` · Due LKR ${formatNumber(due)}` : ""}</p>
                          </div>
                          <p className="text-xs font-bold font-mono text-white shrink-0">LKR {formatNumber(sale.total)}</p>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5" style={{color:"#10b981"}}/>
                    <p className="text-xs font-bold uppercase tracking-wide" style={{color:"var(--pos-muted)"}}>Top products</p>
                  </div>
                  {(customerInsight?.topProducts.length ?? 0) === 0 ? (
                    <p className="text-xs py-3 text-center" style={{color:"var(--pos-muted-2)"}}>No purchase history yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {customerInsight!.topProducts.map((p, idx) => (
                        <div key={`${p.variantId}-${idx}`} className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg" style={{background:"var(--pos-card)",border:"1px solid var(--pos-border)"}}>
                          <span className="h-6 w-6 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0" style={{background:"rgba(16,185,129,0.15)",color:"#10b981"}}>{idx + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-white font-semibold truncate">{p.productName}</p>
                            <p className="text-[10px]" style={{color:"var(--pos-muted)"}}>{p.qty} sold · LKR {formatNumber(p.spent)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      );
    }

    // HOLD BILLS
    if (activeNav === "hold-bills") return (
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        <div className="flex items-center justify-between shrink-0"><h2 className="text-white font-bold text-base">Held Bills <span className="text-sm font-normal" style={{color:"var(--pos-muted)"}}>({serverHeldBills.length})</span></h2><div className="flex gap-2"><button onClick={loadHeldBills} className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold border transition-all hover:bg-white/10" style={{borderColor:"var(--pos-border)",color:"var(--pos-muted)"}}><RefreshCw className={cn("h-3.5 w-3.5",holdsLoading&&"animate-spin")}/>Refresh</button><button onClick={()=>{if(items.length>0){handleHoldBill();}else toast.info("Cart is empty");}} className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold text-white" style={{background:"#4f6ef7"}}><PauseCircle className="h-3.5 w-3.5"/>Hold Current Bill</button></div></div>
        {holdsLoading?(<div className="flex items-center justify-center flex-1"><Loader2 className="h-8 w-8 animate-spin" style={{color:"#4f6ef7"}}/></div>):serverHeldBills.length===0?(<div className="flex flex-col items-center justify-center flex-1" style={{color:"var(--pos-muted-2)"}}><PauseCircle className="h-16 w-16 mb-3 opacity-20"/><p className="text-sm font-medium">No bills on hold</p><p className="text-xs mt-1">Hold the current cart with F3 — stock is reserved on the server</p></div>):(
          <div className="flex-1 overflow-y-auto grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",alignContent:"start"}}>
            {serverHeldBills.map((bill,idx)=>{
              const billItems = bill.data?.items ?? [];
              const billTotal = billItems.reduce((a,i)=>a+i.unitPrice*i.quantity,0);
              const kbFocus = focusedHeldIdx === idx;
              return (
                <div key={bill.id} className="rounded-xl border p-3 flex flex-col gap-2 transition-all" style={{background:"var(--pos-card)",borderColor:kbFocus?"#4f6ef7":"var(--pos-border)",boxShadow:kbFocus?"0 0 0 2px rgba(79,110,247,0.35)":"none"}}>
                  <div className="flex items-start justify-between"><div><p className="text-white text-xs font-bold">{bill.label ?? `Bill #${serverHeldBills.length-idx}`}</p><p className="text-[10px]" style={{color:"var(--pos-muted)"}}>{new Date(bill.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}  {billItems.length} item(s)</p></div><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:"var(--pos-warn-bg)",color:"var(--pos-warn)"}}>Reserved</span></div>
                  {bill.data?.customer&&<div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{background:"rgba(79,110,247,0.1)"}}><User className="h-3 w-3" style={{color:"#4f6ef7"}}/><span className="text-xs text-white">{bill.data.customer.name}</span></div>}
                  <div className="space-y-0.5">{billItems.slice(0,3).map(i=><div key={i.variantId} className="flex justify-between text-[10px]"><span className="truncate flex-1 mr-2" style={{color:"var(--pos-text-secondary)"}}>{i.productName} {i.variantName} ×{i.quantity}</span><span className="font-mono" style={{color:"var(--pos-muted)"}}>LKR {formatNumber(i.unitPrice*i.quantity)}</span></div>)}{billItems.length>3&&<p className="text-[10px]" style={{color:"var(--pos-muted-2)"}}>+{billItems.length-3} more items</p>}</div>
                  <div className="flex items-center justify-between pt-1 border-t" style={{borderColor:"var(--pos-border)"}}><span className="text-white text-sm font-bold">LKR {formatNumber(billTotal)}</span><div className="flex gap-2"><button onClick={()=>handleDeleteHeldBill(bill.id)} className="px-2.5 h-7 rounded-lg text-[11px] font-semibold transition-all hover:opacity-80" style={{background:"rgba(239,68,68,0.15)",color:"#ef4444"}}>Delete</button><button onClick={()=>handleRestoreHeldBill(bill)} className="px-2.5 h-7 rounded-lg text-[11px] font-bold text-white transition-all hover:opacity-90" style={{background:"#10b981"}}>Restore</button></div></div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );

    // ORDERS — today's sales + reprint
    if (activeNav === "orders") return (
      <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-white font-bold text-base">
            {viewAllSales ? "Current Sales (Today)" : "My Sales (Today)"}
          </h2>
          <button onClick={loadOrders} className="flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-semibold border transition-all hover:bg-white/10" style={{borderColor:"var(--pos-border)",color:"var(--pos-muted)"}}>
            <RefreshCw className={cn("h-3.5 w-3.5",ordersLoading&&"animate-spin")}/>Refresh
          </button>
        </div>
        {ordersLoading?(<div className="flex items-center justify-center flex-1"><Loader2 className="h-8 w-8 animate-spin" style={{color:"#4f6ef7"}}/></div>):orders.length===0?(<div className="flex flex-col items-center justify-center flex-1" style={{color:"var(--pos-muted-2)"}}><FileText className="h-16 w-16 mb-3 opacity-20"/><p className="text-sm">{viewAllSales ? "No sales today" : "No bills by you today"}</p><p className="text-xs mt-1 opacity-70">{viewAllSales ? "Branch sales appear here" : "Only your own sales are shown"}</p></div>):(
          <div className="flex-1 overflow-y-auto rounded-xl border" style={{borderColor:"var(--pos-border)"}}>
            <table className="w-full text-sm">
              <thead style={{position:"sticky",top:0,background:"var(--pos-panel)"}}><tr>{["Invoice","Customer","Items","Total","Method","Time","Status","Actions"].map(h=><th key={h} className="text-left px-3 py-2.5 text-[11px] font-semibold" style={{color:"var(--pos-muted)",borderBottom:"1px solid var(--pos-border)"}}>{h}</th>)}</tr></thead>
              <tbody>{orders.map((o,i)=>{const st=STATUS_STYLE[o.status]??{bg:"rgba(100,100,100,0.15)",color:"#9ca3af"};return(<tr key={o.id} style={{borderBottom:"1px solid var(--pos-border)",background:i%2===0?"transparent":"var(--pos-hover)"}}>
                <td className="px-3 py-2 font-mono text-xs font-bold" style={{color:"#4f6ef7"}}>{o.invoiceNumber}</td>
                <td className="px-3 py-2 text-xs text-white">{formatSaleCustomerName(o.customer)}</td>
                <td className="px-3 py-2 text-xs" style={{color:"var(--pos-muted)"}}>{o._count?.items??0}</td>
                <td className="px-3 py-2 text-xs font-bold font-mono text-white">LKR {formatNumber(o.total)}</td>
                <td className="px-3 py-2 text-xs" style={{color:"var(--pos-muted)"}}>{o.payments?.[0]?.method ?? o.paymentMethod ?? "-"}</td>
                <td className="px-3 py-2 text-xs" style={{color:"var(--pos-muted)"}}>{new Date(o.invoiceDate).toLocaleString([],{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}</td>
                <td className="px-3 py-2"><span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:st.bg,color:st.color}}>{o.status}</span></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <button type="button" onClick={() => reprintSale(o.id)} disabled={reprintingId===o.id} className="text-[10px] font-bold px-2 py-1 rounded-lg text-white whitespace-nowrap disabled:opacity-50" style={{background:"rgba(79,110,247,0.85)"}}>
                      {reprintingId===o.id ? <Loader2 className="inline h-3 w-3 animate-spin"/> : <Printer className="inline h-3 w-3 mr-0.5 -mt-0.5"/>}
                      Reprint
                    </button>
                    {hasShopModule(profile,"warranty") && o.status==="COMPLETED" && (
                      <button type="button" onClick={()=>{setWarrantySaleId(o.id);setActiveNav("warranty");}} className="text-[10px] font-bold px-2 py-1 rounded-lg text-white whitespace-nowrap" style={{background:"rgba(16,185,129,0.7)"}}>
                        <Wrench className="inline h-3 w-3 mr-0.5 -mt-0.5"/>Claim
                      </button>
                    )}
                  </div>
                </td>
              </tr>);})}</tbody>
            </table>
          </div>
        )}
      </div>
    );

    // GIFT VOUCHERS
    if (activeNav === "vouchers") {
      const issueVoucher = async () => {
        const amt = parseFloat(voucherIssueAmt);
        if (!amt || amt <= 0) { toast.error("Enter voucher amount"); return; }
        setVoucherBusy(true);
        try {
          const r = await api.post<{ code: string; balance: number }>("/pos/gift-vouchers", {
            amount: amt,
            issuedToName: voucherIssueName || undefined,
          });
          toast.success(`Issued ${r.data.code} · LKR ${formatNumber(r.data.balance)}`);
          setVoucherIssueAmt(""); setVoucherIssueName("");
          loadVouchers();
        } catch (e: unknown) {
          toast.error((e as Error).message ?? "Issue failed");
        } finally {
          setVoucherBusy(false);
        }
      };
      return (
        <div className="flex flex-col h-full overflow-hidden p-4 gap-4">
          <h2 className="text-white font-bold text-base">Gift Vouchers</h2>
          <div className="rounded-xl border p-4 space-y-3" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
            <p className="text-xs" style={{color:"var(--pos-muted)"}}>Issue a new gift voucher (redeem at checkout via Voucher payment)</p>
            <div className="grid grid-cols-2 gap-2">
              <Input type="number" placeholder="Amount (LKR)" value={voucherIssueAmt} onChange={(e)=>setVoucherIssueAmt(e.target.value)} className="bg-[var(--pos-input)] border-[var(--pos-border)] text-white" />
              <Input placeholder="Recipient name (optional)" value={voucherIssueName} onChange={(e)=>setVoucherIssueName(e.target.value)} className="bg-[var(--pos-input)] border-[var(--pos-border)] text-white" />
            </div>
            <button type="button" onClick={issueVoucher} disabled={voucherBusy} className="px-4 h-10 rounded-xl text-sm font-bold text-white disabled:opacity-50" style={{background:"#4f6ef7"}}>
              {voucherBusy ? <Loader2 className="h-4 w-4 animate-spin inline mr-2"/> : <Gift className="h-4 w-4 inline mr-2"/>}
              Issue Voucher
            </button>
          </div>
          <div className="flex-1 overflow-y-auto rounded-xl border" style={{borderColor:"var(--pos-border)"}}>
            <table className="w-full text-sm">
              <thead style={{position:"sticky",top:0,background:"var(--pos-panel)"}}>
                <tr>{["Code","Balance","Initial","Status"].map(h=><th key={h} className="text-left px-3 py-2 text-[11px]" style={{color:"var(--pos-muted)"}}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {vouchers.map((v)=>(
                  <tr key={v.id} className="border-t" style={{borderColor:"var(--pos-border)"}}>
                    <td className="px-3 py-2 font-mono text-xs text-white">{v.code}</td>
                    <td className="px-3 py-2 text-xs text-emerald-400">LKR {formatNumber(v.balance)}</td>
                    <td className="px-3 py-2 text-xs" style={{color:"var(--pos-muted)"}}>LKR {formatNumber(v.initialAmount)}</td>
                    <td className="px-3 py-2 text-xs" style={{color:"var(--pos-text-secondary)"}}>{v.status}</td>
                  </tr>
                ))}
                {!vouchers.length && <tr><td colSpan={4} className="px-3 py-8 text-center text-sm" style={{color:"var(--pos-muted-2)"}}>No vouchers yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      );
    }

    // WARRANTY (Spare Parts)
    if (activeNav === "warranty") {
      return (
        <PosWarrantyPanel
          initialSaleId={warrantySaleId}
          onInitialSaleConsumed={() => setWarrantySaleId(null)}
        />
      );
    }

    // RETURNS FLOW
    if (activeNav === "returns") {
      const REASONS = returnReasons;
      const selectedItems = Array.from(returnItems.entries()).filter(([,s])=>s.qty>0);
      const refundTotal = selectedItems.reduce((a,[,s])=>a+s.unitPrice*s.qty,0);
      const selectedExchangeItems = Array.from(exchangeItems.entries()).filter(([,s])=>s.qty>0);
      const exchangeTotal = selectedExchangeItems.reduce((a,[,s])=>a+s.unitPrice*s.qty,0);
      const netRefund = returnType === "EXCHANGE" ? Math.max(0, refundTotal - exchangeTotal) : refundTotal;
      const exchangeDue = returnType === "EXCHANGE" ? Math.max(0, exchangeTotal - refundTotal) : 0;
      const exchangeProducts = products.filter(p=>{const q=exchangeSearch.toLowerCase();return !q||p.productName.toLowerCase().includes(q)||p.variantName.toLowerCase().includes(q)||p.sku.toLowerCase().includes(q)||p.color?.toLowerCase().includes(q)||p.size?.toLowerCase().includes(q);}).slice(0,30);

      const searchSale = async () => {
        if (!returnQuery.trim()) return;
        setReturnSearchLoading(true);
        try { const r = await api.get<{data?:SaleRow[]}>(`/sales?search=${encodeURIComponent(returnQuery)}&limit=5`); setReturnSearchRes(r.data?.data??[]); if((r.data?.data??[]).length===0) toast.error("No sales found"); }
        catch { toast.error("Search failed"); } finally { setReturnSearchLoading(false); }
      };

      const selectSale = async (row: SaleRow) => {
        setReturnSaleLoading(true);
        try {
          const r = await api.get<SaleDetail>(`/sales/${row.id}`);
          setReturnSale(r.data);
          const m = new Map<string,ReturnItemSel>();
          for (const it of r.data.items) m.set(it.variantId, { qty: it.quantity, unitPrice: it.unitPrice, name: `${it.productName} ${it.variantName}`.trim(), maxQty: it.quantity });
          setReturnItems(m); setReturnStep("items");
        } catch { toast.error("Failed to load sale"); } finally { setReturnSaleLoading(false); }
      };

      const submitReturn = async () => {
        if (!returnSale || !returnReason || !selectedItems.length) return;
        if (returnType === "EXCHANGE" && !selectedExchangeItems.length) { toast.error("Select exchange item"); return; }
        setReturnSubmitting(true);
        try {
          const r = await api.post<{returnNumber:string;refundAmount:number}>("/returns", { originalSaleId:returnSale.id, reason:returnReason, returnType, notes:returnNotes, restockItems:returnRestock, items:selectedItems.map(([variantId,s])=>({variantId,quantity:s.qty,unitPrice:s.unitPrice})), exchangeItems:returnType==="EXCHANGE"?selectedExchangeItems.map(([variantId,s])=>({variantId,quantity:s.qty,unitPrice:s.unitPrice,productName:s.name,variantName:s.name,sku:products.find(p=>p.variantId===variantId)?.sku})):undefined });
          setReturnResult({returnNumber:r.data.returnNumber,refundAmount:r.data.refundAmount});
          setReturnStep("done"); toast.success(`Return ${r.data.returnNumber} created`);
          await loadProducts();
        } catch(e:unknown){ toast.error((e as Error).message??"Return failed"); } finally { setReturnSubmitting(false); }
      };

      return (
        <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
          {/* HEADER + STEPS */}
          <div className="flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <h2 className="text-white font-bold text-base">Process Return</h2>
              <div className="flex items-center gap-1">
                {["search","items","confirm","done"].map((s,i)=>(
                  <React.Fragment key={s}>
                    <div className="flex items-center gap-1">
                      <div className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold" style={{background:["search","items","confirm","done"].indexOf(returnStep)>=i?"#4f6ef7":"var(--pos-input)",color:["search","items","confirm","done"].indexOf(returnStep)>=i?"#fff":"var(--pos-muted-2)"}}>{i+1}</div>
                      <span className="text-[10px] capitalize" style={{color:["search","items","confirm","done"].indexOf(returnStep)>=i?"var(--pos-text-secondary)":"var(--pos-muted-2)"}}>{s=="search"?"Find Sale":s=="items"?"Select Items":s=="confirm"?"Confirm":"Done"}</span>
                    </div>
                    {i<3&&<div className="w-6 h-px mx-1" style={{background:"var(--pos-border)"}}/>}
                  </React.Fragment>
                ))}
              </div>
            </div>
            {returnStep !== "search" && returnStep !== "done" && (
              <button onClick={()=>{setReturnStep("search");setReturnSale(null);setReturnSearchRes([]);}} className="flex items-center gap-1.5 px-3 h-7 rounded-lg text-xs" style={{color:"var(--pos-muted)",border:"1px solid var(--pos-border)"}}>? Back to Search</button>
            )}
          </div>

          {/* STEP 1: SEARCH */}
          {returnStep==="search"&&(
            <div className="flex-1 flex flex-col gap-3">
              <div className="flex gap-2">
                <input value={returnQuery} onChange={e=>setReturnQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&searchSale()} placeholder="Enter invoice number or customer phone..." className="flex-1 h-10 px-4 rounded-xl text-sm text-white outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/>
                <button onClick={searchSale} disabled={returnSearchLoading||!returnQuery.trim()} className="px-5 h-10 rounded-xl text-sm font-bold text-white flex items-center gap-2 disabled:opacity-50 transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>{returnSearchLoading?<Loader2 className="h-4 w-4 animate-spin"/>:<Search className="h-4 w-4"/>}Search</button>
              </div>
              {returnSearchRes.length > 0 && (
                <div className="flex-1 overflow-y-auto rounded-xl border" style={{borderColor:"var(--pos-border)"}}>
                  <div className="px-3 py-2 border-b" style={{borderColor:"var(--pos-border)"}}><p className="text-xs font-semibold" style={{color:"var(--pos-muted)"}}>{returnSearchRes.length} sale(s) found — click to select</p></div>
                  {returnSearchRes.map(row=>(
                    <button key={row.id} onClick={()=>selectSale(row)} disabled={returnSaleLoading} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b" style={{borderColor:"var(--pos-border)"}}>
                      {returnSaleLoading?<Loader2 className="h-4 w-4 animate-spin shrink-0" style={{color:"#4f6ef7"}}/>:<RotateCcw className="h-4 w-4 shrink-0" style={{color:"#4f6ef7"}}/>}
                      <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm font-mono">{row.invoiceNumber}</p>
                        <p className="text-xs" style={{color:"var(--pos-muted)"}}>{formatSaleCustomerName(row.customer)} · {new Date(row.invoiceDate).toLocaleDateString()}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-white font-bold text-sm">LKR {formatNumber(row.total)}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:STATUS_STYLE[row.status]?.bg??"rgba(100,100,100,0.15)",color:STATUS_STYLE[row.status]?.color??"#9ca3af"}}>{row.status}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0" style={{color:"var(--pos-muted-2)"}}/>
                    </button>
                  ))}
                </div>
              )}
              {returnSearchRes.length===0&&!returnSearchLoading&&(
                <div className="flex flex-col items-center justify-center flex-1" style={{color:"var(--pos-muted-2)"}}><RotateCcw className="h-16 w-16 mb-3 opacity-20"/><p className="text-sm font-medium">Search a sale to start a return</p><p className="text-xs mt-1">Enter invoice number like INV-001 or customer phone</p></div>
              )}
            </div>
          )}

          {/* STEP 2: SELECT ITEMS + REASON */}
          {returnStep==="items"&&returnSale&&(
            <div className="flex-1 flex gap-3 min-h-0 overflow-hidden">
              <div className="flex-1 flex flex-col gap-2 overflow-hidden">
                <div className="shrink-0 flex items-center gap-3 p-3 rounded-xl border" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
                  <div><p className="text-white font-bold text-sm font-mono">{returnSale.invoiceNumber}</p><p className="text-xs" style={{color:"var(--pos-muted)"}}>{formatSaleCustomerName(returnSale.customer)} · {new Date(returnSale.invoiceDate).toLocaleDateString()}</p></div>
                  <div className="ml-auto text-right"><p className="text-white font-bold">LKR {formatNumber(returnSale.total)}</p><span className="text-[10px]" style={{color:STATUS_STYLE[returnSale.status]?.color??"#9ca3af"}}>{returnSale.status}</span></div>
                </div>
                <p className="text-xs font-semibold shrink-0" style={{color:"var(--pos-muted)"}}>SELECT ITEMS TO RETURN</p>
                <div className="flex-1 overflow-y-auto space-y-1">
                  {returnSale.items.map(it=>{
                    const sel=returnItems.get(it.variantId);
                    const isSelected=(sel?.qty??0)>0;
                    return(
                      <div key={it.variantId} className="flex items-center gap-3 p-2.5 rounded-xl border transition-all" style={{background:isSelected?"rgba(79,110,247,0.1)":"var(--pos-card)",borderColor:isSelected?"#4f6ef7":"var(--pos-border)"}}>
                        <button onClick={()=>setReturnItems(m=>{const n=new Map(m);const cur=n.get(it.variantId);if(cur){n.set(it.variantId,{...cur,qty:cur.qty>0?0:cur.maxQty});}return n;})} className="h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-all" style={{background:isSelected?"#4f6ef7":"transparent",borderColor:isSelected?"#4f6ef7":"var(--pos-border-strong)"}}>{isSelected&&<Check className="h-3 w-3 text-white"/>}</button>
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-semibold truncate">{it.productName}</p>
                          <p className="text-[10px] truncate" style={{color:"var(--pos-muted)"}}>{it.variantName} · SKU: {it.sku}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={()=>setReturnItems(m=>{const n=new Map(m);const cur=n.get(it.variantId);if(cur&&cur.qty>0)n.set(it.variantId,{...cur,qty:cur.qty-1});return n;})} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"var(--pos-input)"}}><Minus className="h-3 w-3 text-white"/></button>
                          <span className="text-white text-xs font-bold w-6 text-center">{sel?.qty??0}</span>
                          <button onClick={()=>setReturnItems(m=>{const n=new Map(m);const cur=n.get(it.variantId);if(cur&&cur.qty<cur.maxQty)n.set(it.variantId,{...cur,qty:cur.qty+1});return n;})} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"var(--pos-input)"}}><Plus className="h-3 w-3 text-white"/></button>
                        </div>
                        <div className="text-right shrink-0 w-24">
                          <p className="text-white text-xs font-bold">LKR {formatNumber(it.unitPrice * (sel?.qty??0))}</p>
                          <p className="text-[10px]" style={{color:"var(--pos-muted)"}}>of {it.quantity} · LKR {formatNumber(it.unitPrice)} ea</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {returnType==="EXCHANGE"&&(
                  <div className="shrink-0 rounded-xl border p-2 space-y-2" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)",maxHeight:"230px"}}>
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold shrink-0" style={{color:"var(--pos-muted)"}}>EXCHANGE ITEM</p>
                      <input value={exchangeSearch} onChange={e=>setExchangeSearch(e.target.value)} placeholder="Search product / SKU..." className="flex-1 h-7 px-2 rounded-lg text-xs text-white outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/>
                    </div>
                    <div className="grid gap-1 overflow-y-auto" style={{gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))",maxHeight:"170px"}}>
                      {exchangeProducts.map(p=>{
                        const ex=exchangeItems.get(p.variantId);
                        return(
                          <div key={p.variantId} className="flex items-center gap-2 p-2 rounded-lg border" style={{background:(ex?.qty??0)>0?"rgba(79,110,247,0.12)":"var(--pos-card)",borderColor:(ex?.qty??0)>0?"#4f6ef7":"var(--pos-border)"}}>
                            <PosProductThumb url={p.imageUrl} name={p.productName} light={lightUi} className="h-8 w-8 rounded-lg shrink-0 overflow-hidden" fallbackBg={getCardBg(p.color, lightUi)} iconClassName="h-4 w-4" />
                            <div className="flex-1 min-w-0"><p className="text-white text-[11px] font-semibold truncate">{p.productName}</p><p className="text-[10px] truncate" style={{color:"var(--pos-muted)"}}>{p.variantName} · {p.sku}</p></div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button onClick={()=>setExchangeItems(m=>{const n=new Map(m);const cur=n.get(p.variantId);if(cur&&cur.qty>0)n.set(p.variantId,{...cur,qty:cur.qty-1});return n;})} className="h-5 w-5 rounded flex items-center justify-center" style={{background:"var(--pos-input)"}}><Minus className="h-2.5 w-2.5 text-white"/></button>
                              <span className="text-white text-xs font-bold w-4 text-center">{ex?.qty??0}</span>
                              <button onClick={()=>setExchangeItems(m=>{const n=new Map(m);const cur=n.get(p.variantId);n.set(p.variantId,{qty:(cur?.qty??0)+1,unitPrice:p.unitPrice,name:`${p.productName} ${p.variantName}`.trim(),maxQty:p.stock});return n;})} className="h-5 w-5 rounded flex items-center justify-center" style={{background:"var(--pos-input)"}}><Plus className="h-2.5 w-2.5 text-white"/></button>
                            </div>
                            <p className="text-[10px] font-bold shrink-0" style={{color:"#4f6ef7"}}>LKR {formatNumber(p.unitPrice)}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              <div className="w-56 flex flex-col gap-2 shrink-0">
                <p className="text-xs font-semibold" style={{color:"var(--pos-muted)"}}>RETURN TYPE</p>
                <div className="grid grid-cols-2 gap-1">
                  {[{v:"RETURN",l:"Refund"},{v:"EXCHANGE",l:"Exchange"}].map(t=>(
                    <button key={t.v} onClick={()=>setReturnType(t.v as "RETURN"|"EXCHANGE")} className="h-8 rounded-xl text-xs font-bold transition-all border" style={{background:returnType===t.v?"#4f6ef7":"var(--pos-card)",borderColor:returnType===t.v?"#4f6ef7":"var(--pos-border)",color:returnType===t.v?"#fff":"var(--pos-muted)"}}>{t.l}</button>
                  ))}
                </div>
                <p className="text-xs font-semibold" style={{color:"var(--pos-muted)"}}>RETURN REASON <span className="text-red-400">*</span></p>
                <div className="space-y-1">
                  {REASONS.map(r=>(
                    <button key={r.v} onClick={()=>setReturnReason(r.v)} className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-left transition-all border" style={{background:returnReason===r.v?"rgba(79,110,247,0.2)":"var(--pos-card)",borderColor:returnReason===r.v?"#4f6ef7":"var(--pos-border)",color:returnReason===r.v?"#4f6ef7":"var(--pos-muted)"}}>
                      {returnReason===r.v&&<Check className="h-3.5 w-3.5 shrink-0" style={{color:"#4f6ef7"}}/>}
                      {r.l}
                    </button>
                  ))}
                </div>
                <p className="text-xs font-semibold mt-1" style={{color:"var(--pos-muted)"}}>NOTES (optional)</p>
                <textarea value={returnNotes} onChange={e=>setReturnNotes(e.target.value)} rows={3} placeholder="Additional notes..." className="rounded-xl px-3 py-2 text-xs text-white outline-none resize-none" style={{background:"var(--pos-card)",border:"1px solid var(--pos-border)"}}/>
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer border" style={{background:returnRestock?"rgba(16,185,129,0.1)":"var(--pos-card)",borderColor:returnRestock?"rgba(16,185,129,0.4)":"var(--pos-border)"}}>
                  <input type="checkbox" checked={returnRestock} onChange={e=>setReturnRestock(e.target.checked)} className="w-4 h-4 rounded accent-green-500"/>
                  <span className="text-xs font-semibold" style={{color:returnRestock?"#10b981":"var(--pos-muted)"}}>Restock returned items</span>
                </label>
                <div className="mt-auto p-3 rounded-xl border" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
                  <p className="text-xs" style={{color:"var(--pos-muted)"}}>Items selected: {selectedItems.length}</p>
                  <p className="text-white font-bold text-lg mt-1">LKR {formatNumber(refundTotal)}</p>
                  <p className="text-[10px]" style={{color:"var(--pos-muted)"}}>{returnType==="EXCHANGE"?"Return item value":"Refund amount"}</p>
                  {returnType==="EXCHANGE"&&(
                    <div className="mt-2 pt-2 border-t space-y-1" style={{borderColor:"var(--pos-border)"}}>
                      <div className="flex justify-between text-[10px]" style={{color:"var(--pos-muted)"}}><span>Exchange</span><span>LKR {formatNumber(exchangeTotal)}</span></div>
                      <div className="flex justify-between text-[10px]" style={{color:exchangeDue>0?"var(--pos-warn)":"#10b981"}}><span>{exchangeDue>0?"Customer Pays":"Refund"}</span><span>LKR {formatNumber(exchangeDue>0?exchangeDue:netRefund)}</span></div>
                    </div>
                  )}
                </div>
                <button onClick={()=>{if(!returnReason){toast.error("Select a reason");return;}if(!selectedItems.length){toast.error("Select at least one item");return;}setReturnStep("confirm");}} className="w-full h-9 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}>Review Return ?</button>
              </div>
            </div>
          )}

          {/* STEP 3: CONFIRM */}
          {returnStep==="confirm"&&returnSale&&(
            <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
              <div className="rounded-xl border p-4" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
                <p className="text-xs font-semibold mb-3" style={{color:"var(--pos-muted)"}}>RETURN SUMMARY</p>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  {[{l:"Original Invoice",v:returnSale.invoiceNumber},{l:"Customer",v:formatSaleCustomerName(returnSale.customer)},{l:"Type",v:returnType==="EXCHANGE"?"Exchange":"Refund"},{l:"Reason",v:REASONS.find(r=>r.v===returnReason)?.l??returnReason},{l:"Restock Items",v:returnRestock?"Yes":"No"},...(returnType==="EXCHANGE"?[{l:exchangeDue>0?"Customer Pays":"Refund",v:`LKR ${formatNumber(exchangeDue>0?exchangeDue:netRefund)}`}]:[])].map(f=>(
                    <div key={f.l}><p className="text-[10px]" style={{color:"var(--pos-muted)"}}>{f.l}</p><p className="text-white text-xs font-semibold mt-0.5" style={f.l==="Customer Pays"?{color:"var(--pos-warn)"}:f.l==="Refund"?{color:"#10b981"}:{}}>{f.v}</p></div>
                  ))}
                </div>
                {returnNotes&&<div className="mt-2"><p className="text-[10px]" style={{color:"var(--pos-muted)"}}>Notes</p><p className="text-white text-xs mt-0.5">{returnNotes}</p></div>}
              </div>
              <p className="text-xs font-semibold" style={{color:"var(--pos-muted)"}}>ITEMS BEING RETURNED</p>
              <div className="space-y-1">
                {selectedItems.map(([variantId,sel])=>(
                  <div key={variantId} className="flex items-center justify-between p-2.5 rounded-xl border" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
                    <p className="text-white text-xs font-semibold">{sel.name}</p>
                    <p className="text-xs font-mono" style={{color:"var(--pos-muted)"}}>×{sel.qty} · <span className="text-white font-bold">LKR {formatNumber(sel.unitPrice*sel.qty)}</span></p>
                  </div>
                ))}
              </div>
              {returnType==="EXCHANGE"&&(
                <>
                  <p className="text-xs font-semibold" style={{color:"var(--pos-muted)"}}>EXCHANGE ITEMS</p>
                  <div className="space-y-1">
                    {selectedExchangeItems.map(([variantId,sel])=>(
                      <div key={variantId} className="flex items-center justify-between p-2.5 rounded-xl border" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
                        <p className="text-white text-xs font-semibold">{sel.name}</p>
                        <p className="text-xs font-mono" style={{color:"var(--pos-muted)"}}>×{sel.qty} · <span className="text-white font-bold">LKR {formatNumber(sel.unitPrice*sel.qty)}</span></p>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="flex justify-between items-center p-4 rounded-xl border mt-1" style={{background:exchangeDue>0?"var(--pos-warn-bg)":"rgba(16,185,129,0.08)",borderColor:exchangeDue>0?"var(--pos-warn-border)":"rgba(16,185,129,0.3)"}}>
                <div>
                  <p className="text-xs" style={{color:exchangeDue>0?"var(--pos-warn)":"#10b981"}}>{exchangeDue>0?"Customer Pays Balance":"Total Refund Amount"}</p>
                  <p className="text-2xl font-bold text-white mt-0.5">LKR {formatNumber(exchangeDue>0?exchangeDue:netRefund)}</p>
                  {returnType==="EXCHANGE"&&<p className="text-[10px] mt-1" style={{color:"var(--pos-muted)"}}>Returned LKR {formatNumber(refundTotal)} - Exchange LKR {formatNumber(exchangeTotal)}</p>}
                </div>
                <button onClick={submitReturn} disabled={returnSubmitting} className="flex items-center gap-2 px-5 h-11 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50" style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>{returnSubmitting?<Loader2 className="h-4 w-4 animate-spin"/>:<Check className="h-4 w-4"/>}Confirm {returnType==="EXCHANGE"?"Exchange":"Return"}</button>
              </div>
            </div>
          )}

          {/* STEP 4: DONE */}
          {returnStep==="done"&&returnResult&&(
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="h-20 w-20 rounded-full flex items-center justify-center" style={{background:exchangeDue>0?"var(--pos-warn-bg)":"rgba(16,185,129,0.15)"}}>
                <CheckCircle2 className="h-10 w-10" style={{color:exchangeDue>0?"var(--pos-warn)":"#10b981"}}/>
              </div>
              <div className="text-center">
                <h3 className="text-white font-bold text-xl">{returnType==="EXCHANGE"?"Exchange":"Return"} Processed!</h3>
                <p className="text-xs mt-1 font-mono" style={{color:"var(--pos-muted)"}}>{returnResult.returnNumber}</p>
              </div>
              <div className="rounded-2xl border w-full max-w-sm overflow-hidden" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
                {returnType==="EXCHANGE"&&(
                  <div className="px-5 pt-4 pb-3 space-y-2 border-b" style={{borderColor:"var(--pos-border)"}}>
                    <div className="flex justify-between text-sm"><span style={{color:"var(--pos-muted)"}}>Returned value</span><span className="text-white font-semibold">LKR {formatNumber(refundTotal)}</span></div>
                    <div className="flex justify-between text-sm"><span style={{color:"var(--pos-muted)"}}>Exchange value</span><span className="text-white font-semibold">LKR {formatNumber(exchangeTotal)}</span></div>
                  </div>
                )}
                <div className="px-5 py-4 text-center">
                  {returnType==="EXCHANGE"&&exchangeDue>0&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"var(--pos-warn)"}}>Customer Pays Balance</p>
                    <p className="text-4xl font-bold" style={{color:"var(--pos-warn)"}}>LKR {formatNumber(exchangeDue)}</p>
                    <p className="text-xs mt-2" style={{color:"var(--pos-muted)"}}>Collect from customer before completing exchange</p>
                  </>)}
                  {returnType==="EXCHANGE"&&exchangeDue===0&&netRefund>0&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"#10b981"}}>Refund to Customer</p>
                    <p className="text-4xl font-bold" style={{color:"#10b981"}}>LKR {formatNumber(netRefund)}</p>
                    <p className="text-xs mt-2" style={{color:"var(--pos-muted)"}}>Return the difference to customer</p>
                  </>)}
                  {returnType==="EXCHANGE"&&exchangeDue===0&&netRefund===0&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"#4f6ef7"}}>Even Exchange</p>
                    <p className="text-4xl font-bold" style={{color:"#4f6ef7"}}>LKR 0.00</p>
                    <p className="text-xs mt-2" style={{color:"var(--pos-muted)"}}>Equal value — no money changes hands</p>
                  </>)}
                  {returnType!=="EXCHANGE"&&(<>
                    <p className="text-sm font-semibold mb-1" style={{color:"#10b981"}}>Refund Amount</p>
                    <p className="text-4xl font-bold" style={{color:"#10b981"}}>LKR {formatNumber(returnResult.refundAmount)}</p>
                  </>)}
                  <p className="text-xs mt-3 font-semibold px-3 py-1 rounded-full inline-block" style={{background:"rgba(79,110,247,0.15)",color:"#4f6ef7"}}>INITIATED · Awaiting Approval</p>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={()=>{
                  const w=window.open("","_blank","width=380,height=600");if(!w)return;
                  const isExc=returnType==="EXCHANGE";
                  const balanceLine=isExc
                    ?(exchangeDue>0
                      ?`<div class="row tot amb"><span>CUSTOMER PAYS</span><span>LKR ${exchangeDue.toFixed(2)}</span></div>`
                      :(netRefund>0
                        ?`<div class="row tot grn"><span>REFUND</span><span>LKR ${netRefund.toFixed(2)}</span></div>`
                        :`<div class="row tot blu"><span>EVEN EXCHANGE</span><span>LKR 0.00</span></div>`))
                    :`<div class="row tot grn"><span>REFUND</span><span>LKR ${returnResult.refundAmount.toFixed(2)}</span></div>`;
                  const exchRows=isExc&&selectedExchangeItems.length>0?`<hr class="d"/><div class="label">EXCHANGE ITEMS</div>${selectedExchangeItems.map(([,s])=>`<div class="row"><span>${s.name} ×${s.qty}</span><span>LKR ${(s.unitPrice*s.qty).toFixed(2)}</span></div>`).join("")}<div class="row sub"><span>Exchange Total</span><span>LKR ${exchangeTotal.toFixed(2)}</span></div>`:"";
                  w.document.write(`<!DOCTYPE html><html><head><title>${isExc?"Exchange":"Return"} Receipt</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',monospace;font-size:12px;padding:6mm;max-width:80mm;margin:0 auto}h1{font-size:16px;font-weight:900;text-align:center}.sub{color:#666}.label{font-size:10px;font-weight:bold;margin:4px 0 2px}.d{border-top:1px dashed #000;margin:5px 0}.row{display:flex;justify-content:space-between;margin:2px 0}.tot{font-size:14px;font-weight:900;border-top:2px solid #000;padding-top:4px;margin-top:4px}.grn span:last-child{color:#059669}.amb span:last-child{color:#b45309}.blu span:last-child{color:#2563eb}.foot{text-align:center;margin-top:8px;font-size:10px}@media print{@page{size:80mm auto}}</style></head><body><h1>${isExc?"EXCHANGE":"RETURN"} RECEIPT</h1><hr class="d"/><div class="row"><span>Ref:</span><span><b>${returnResult.returnNumber}</b></span></div><div class="row"><span>Date:</span><span>${new Date().toLocaleString()}</span></div><div class="row"><span>Invoice:</span><span>${returnSale?.invoiceNumber??""}</span></div><div class="row"><span>Customer:</span><span>${returnSale?.customer?.name??"Walk-in"}</span></div><div class="row"><span>Reason:</span><span>${REASONS.find(r=>r.v===returnReason)?.l??""}</span></div><hr class="d"/><div class="label">RETURNED ITEMS</div>${selectedItems.map(([,s])=>`<div class="row"><span>${s.name} ×${s.qty}</span><span>LKR ${(s.unitPrice*s.qty).toFixed(2)}</span></div>`).join("")}<div class="row sub"><span>Return Total</span><span>LKR ${refundTotal.toFixed(2)}</span></div>${exchRows}<hr class="d"/>${balanceLine}<div class="foot">*** ${isExc?"Exchange":"Return"} Processed · Awaiting Approval ***</div></body></html>`);
                  w.document.close();setTimeout(()=>{w.focus();w.print();setTimeout(()=>w.close(),500);},200);
                }} className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-semibold border transition-all hover:bg-white/10" style={{borderColor:"var(--pos-border)",color:"var(--pos-text-secondary)"}}><Printer className="h-4 w-4"/>Print Receipt</button>
                <button onClick={()=>{setReturnStep("search");setReturnQuery("");setReturnSearchRes([]);setReturnSale(null);setReturnItems(new Map());setReturnReason("");setReturnNotes("");setReturnRestock(true);setReturnResult(null);setReturnType("RETURN");setExchangeItems(new Map());setExchangeSearch("");}} className="flex items-center gap-2 px-4 h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90" style={{background:"#4f6ef7"}}><RotateCcw className="h-4 w-4"/>New Return</button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // SETTINGS PANEL
    if (activeNav === "settings") {
      const pinIsSet = hasServerPin;
      const applyPosTax = (raw: number) => {
        const v = Math.min(100, Math.max(0, raw));
        if (v > 0) writePosSavedTaxRate(v);
        setTaxRate(v);
        toast.success(v === 0 ? "Tax disabled — no tax on POS sales" : `Tax ${v}% — applied from POS settings`);
      };
      return (
        <div className="h-full min-h-0 overflow-y-auto p-6 space-y-5">
          <h2 className="text-white font-bold text-xl">POS Settings</h2>
          {/* Phase 6 UX toggles */}
          <div className="rounded-2xl border p-5 space-y-3" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
            <h3 className="text-white font-bold text-base mb-1">Checkout Experience</h3>
            {([
              { key: "touch", label: "Touch Mode", desc: "Larger buttons & product tiles", icon: Hand, on: touchMode, set: (v: boolean) => { setTouchMode(writePosTouchMode(v)); } },
              { key: "sound", label: "Sound Alerts", desc: "Beep on scan / sale complete", icon: Volume2, on: soundAlerts, set: (v: boolean) => { setSoundAlerts(writePosSoundAlerts(v)); } },
              { key: "qty", label: "Add popup", desc: "Always confirms qty, selling price, and variant", icon: Package, on: true, set: () => toast.info("Add popup is always enabled") },
            ] as const).map((row) => (
              <div key={row.key} className="flex items-center gap-3 py-2 border-b last:border-0" style={{borderColor:"var(--pos-border)"}}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{background:"rgba(79,110,247,0.15)"}}><row.icon className="h-4 w-4" style={{color:"#4f6ef7"}}/></div>
                <div className="flex-1">
                  <p className="text-white text-sm font-semibold">{row.label}</p>
                  <p className="text-[11px]" style={{color:"var(--pos-muted)"}}>{row.desc}</p>
                </div>
                <button type="button" onClick={() => row.set(!row.on)} className="px-3 h-8 rounded-lg text-xs font-bold" style={{background: row.on ? "#10b981" : "var(--pos-input)", color: row.on ? "#fff" : "var(--pos-muted)"}}>
                  {row.on ? "ON" : "OFF"}
                </button>
              </div>
            ))}
          </div>
          <div className="rounded-2xl border p-5 space-y-3" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
            <h3 className="text-white font-bold text-base mb-1">Cart panel size</h3>
            <p className="text-[11px]" style={{color:"var(--pos-muted)"}}>
              Make the right cart wider or narrower. You can also drag the cart&apos;s left edge.
            </p>
            <div className="flex flex-wrap gap-2">
              {POS_CART_WIDTH_PRESETS.map((p) => {
                const active = Math.abs(cartWidth - p.px) < 8;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyCartWidth(p.px)}
                    className="h-10 min-w-[64px] px-3 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: active ? "#4f6ef7" : "var(--pos-input)",
                      color: active ? "#fff" : "var(--pos-muted)",
                      border: `1px solid ${active ? "#4f6ef7" : "var(--pos-border)"}`,
                    }}
                  >
                    {p.label}
                    <span className="block text-[10px] font-mono opacity-70">{p.px}px</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 pt-1">
              <input
                type="range"
                min={POS_CART_WIDTH_MIN}
                max={POS_CART_WIDTH_MAX}
                step={10}
                value={cartWidth}
                onChange={(e) => applyCartWidth(parseInt(e.target.value, 10))}
                className="flex-1 accent-blue-500"
              />
              <span className="text-xs font-mono font-bold tabular-nums w-14 text-right" style={{ color: "var(--pos-text)" }}>{cartWidth}px</span>
            </div>
          </div>
          <div className="rounded-2xl border p-5 space-y-3" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
            <h3 className="text-white font-bold text-base mb-1">Thermal receipt theme</h3>
            <p className="text-[11px]" style={{color:"var(--pos-muted)"}}>
              Light = black on white (real thermal printers). Dark = white on navy (digital / browser print).
            </p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { value: "light" as const, label: "Light" },
                { value: "dark" as const, label: "Dark" },
              ]).map((opt) => {
                const active = (receiptSettings.receiptTheme ?? "light") === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => void setReceiptTheme(opt.value)}
                    className="h-10 rounded-xl text-sm font-bold transition-all"
                    style={{
                      background: active ? (opt.value === "dark" ? "#0f172a" : "#fff") : "var(--pos-input)",
                      color: active ? (opt.value === "dark" ? "#f8fafc" : "#0f172a") : "var(--pos-muted)",
                      border: active ? "2px solid #4f6ef7" : "1px solid var(--pos-border)",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Inventory admin */}
          <div className="rounded-2xl border p-5 space-y-3" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
            <h3 className="text-white font-bold text-base mb-1">Inventory (Admin)</h3>
            <div className="flex items-center gap-3 py-2">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center" style={{background: allowNegativeStock ? "var(--pos-warn-bg)" : "rgba(79,110,247,0.15)"}}>
                <AlertTriangle className="h-4 w-4" style={{color: allowNegativeStock ? "var(--pos-warn-soft)" : "#4f6ef7"}}/>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-semibold">Allow negative stock</p>
                <p className="text-[11px]" style={{color:"var(--pos-muted)"}}>
                  Sell when stock is 0 — inventory can go minus. Admin setting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !allowNegativeStock;
                  const prev = allowNegativeStock;
                  writePosAllowNegativeStock(next);
                  setAllowNegativeStock(next);
                  void api.put("/tenants/pos-settings", { allowNegativeStock: next })
                    .then(() => toast.success(next ? "Negative stock ON — out-of-stock sales allowed" : "Negative stock OFF — out-of-stock blocked"))
                    .catch((e: unknown) => {
                      writePosAllowNegativeStock(prev);
                      setAllowNegativeStock(prev);
                      toast.error((e as Error).message ?? "Admin permission required to change this setting");
                    });
                }}
                className="px-3 h-8 rounded-lg text-xs font-bold shrink-0"
                style={{background: allowNegativeStock ? "var(--pos-warn)" : "var(--pos-input)", color: allowNegativeStock ? "#fff" : "var(--pos-muted)"}}
              >
                {allowNegativeStock ? "ON" : "OFF"}
              </button>
            </div>
          </div>
          {/* Tax Rate */}
          <div className="rounded-2xl border p-5" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:"rgba(79,110,247,0.15)"}}><Receipt className="h-5 w-5" style={{color:"#4f6ef7"}}/></div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-base">Tax Rate</h3>
                <p className="text-xs mt-0.5" style={{color:"var(--pos-muted)"}}>
                  {taxRate > 0
                    ? `Tax is ON — ${taxRate}% added to every sale from this POS setting`
                    : "Tax is OFF — no tax added to sales (set a rate below to enable)"}
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 rounded-full shrink-0" style={{
                background: taxRate > 0 ? "rgba(16,185,129,0.15)" : "rgba(107,114,128,0.2)",
                color: taxRate > 0 ? "#10b981" : "#9ca3af",
              }}>
                {taxRate > 0 ? `${taxRate}% Active` : "Tax Off"}
              </span>
            </div>
            <p className="text-[11px] mb-3 leading-relaxed" style={{color:"var(--pos-muted-2)"}}>
              Product tax rates are ignored at POS checkout. Only this setting controls tax on bills.
            </p>
            <div className="flex items-center gap-3">
              <input key={`pos-tax-${taxRate}`} type="number" min="0" max="100" step="0.01" defaultValue={taxRate} onBlur={e=>applyPosTax(parseFloat(e.target.value)||0)} className="w-28 h-10 px-3 rounded-xl text-white text-center text-sm font-bold outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/>
              <span className="text-white font-bold text-lg">%</span>
              <div className="flex gap-2 ml-2">{[0,5,10,15].map(v=>(<button key={v} onClick={()=>applyPosTax(v)} className="px-3 h-8 rounded-lg text-xs font-bold transition-all" style={{background:taxRate===v?"#4f6ef7":"var(--pos-input)",color:taxRate===v?"#fff":"var(--pos-muted)"}}>{v===0?"Off":`${v}%`}</button>))}</div>
            </div>
          </div>
          {/* PIN Security — per-user, switch cashiers without re-login */}
          <div className="rounded-2xl border p-5 space-y-4" style={{background:"var(--pos-card)",borderColor:"var(--pos-border)"}}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{background:"rgba(79,110,247,0.15)"}}><Lock className="h-5 w-5" style={{color:"#4f6ef7"}}/></div>
              <div>
                <h3 className="text-white font-bold text-base">Your cashier PIN</h3>
                <p className="text-xs mt-0.5" style={{color:"var(--pos-muted)"}}>
                  {pinIsSet
                    ? "Each cashier sets their own 4-digit PIN. Lock (F12) → next cashier enters their PIN → bills go to them."
                    : "Set a 4-digit PIN so you can unlock POS and take over sales without logging in again."}
                </p>
              </div>
              {pinIsSet&&<span className="ml-auto text-xs font-bold px-3 py-1 rounded-full" style={{background:"rgba(16,185,129,0.15)",color:"#10b981"}}>Active</span>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{color:"var(--pos-muted)"}}>{pinIsSet?"New PIN":"Create PIN"} (4 digits)</label>
                <input type="password" maxLength={4} inputMode="numeric" value={settingNewPin} onChange={e=>setSettingNewPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" className="w-full h-10 px-4 rounded-xl text-white text-center text-lg tracking-widest outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/>
              </div>
              <div>
                <label className="text-xs font-semibold block mb-1.5" style={{color:"var(--pos-muted)"}}>Confirm PIN</label>
                <input type="password" maxLength={4} inputMode="numeric" value={settingConfirmPin} onChange={e=>setSettingConfirmPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="••••" className="w-full h-10 px-4 rounded-xl text-white text-center text-lg tracking-widest outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}/>
              </div>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={async () => {
                  if (settingNewPin.length !== 4) { toast.error("PIN must be 4 digits"); return; }
                  if (settingNewPin !== settingConfirmPin) { toast.error("PINs do not match"); return; }
                  try {
                    await api.post("/pos/pin/set", { pin: settingNewPin });
                    localStorage.removeItem("pos_pin");
                    setHasServerPin(true);
                    setSettingNewPin("");
                    setSettingConfirmPin("");
                    toast.success("PIN saved — lock with F12; other cashiers unlock with their own PIN");
                  } catch (e: unknown) {
                    toast.error((e as Error).message || "Failed to save PIN");
                  }
                }}
                className="px-5 h-10 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90"
                style={{background:"#4f6ef7"}}
              >
                {pinIsSet ? "Update PIN" : "Save PIN"}
              </button>
              {pinIsSet && (
                <button
                  onClick={async () => {
                    try {
                      await api.delete("/pos/pin");
                      setHasServerPin(false);
                      setSettingNewPin("");
                      setSettingConfirmPin("");
                      toast.success("PIN removed");
                    } catch (e: unknown) {
                      toast.error((e as Error).message || "Failed to remove PIN");
                    }
                  }}
                  className="px-5 h-10 rounded-xl text-sm font-semibold border transition-all hover:bg-white/10"
                  style={{borderColor:"#ef4444",color:"#ef4444"}}
                >
                  Remove PIN
                </button>
              )}
              <button
                onClick={lockCashier}
                className="px-5 h-10 rounded-xl text-sm font-semibold border transition-all hover:bg-white/10 ml-auto"
                style={{borderColor:"var(--pos-border)",color:"var(--pos-muted)"}}
              >
                <Lock className="h-3.5 w-3.5 inline mr-1.5"/>Lock / Switch
              </button>
            </div>
          </div>
          {/* Quick links */}
          <div className="grid grid-cols-2 gap-3">
            {([
              { icon: Monitor, title: "Customer Display", displayLink: true, path: "" },
              ...(!posOnly ? [
                { icon: Tag, title: "Discounts & Promotions", path: "/promotions" },
                { icon: BarChart2, title: "Sales Reports", path: "/reports/sales" },
                { icon: Settings, title: "System Settings", path: "/settings" },
              ] as const : []),
              { icon: RefreshCw, title: "Reload Products", onClick: loadProducts, path: "" },
            ] as { icon: React.ElementType; title: string; path: string; displayLink?: boolean; onClick?: () => void }[]).map((item, i) => (
              item.displayLink
                ? <a key={i} href={getCustomerDisplayUrl()} target={CUSTOMER_DISPLAY_WINDOW_NAME} rel="noopener noreferrer" onClick={handleOpenCustomerDisplay} className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:bg-white/5" style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}><item.icon className="h-5 w-5 shrink-0" style={{ color: "#4f6ef7" }} /><span className="text-white text-sm font-semibold">{item.title}</span><ExternalLink className="h-3.5 w-3.5 ml-auto" style={{ color: "var(--pos-muted-2)" }} /></a>
                : item.path
                  ? <a key={i} href={item.path} target="_blank" rel="noreferrer" className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:bg-white/5" style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}><item.icon className="h-5 w-5 shrink-0" style={{ color: "#4f6ef7" }} /><span className="text-white text-sm font-semibold">{item.title}</span><ExternalLink className="h-3.5 w-3.5 ml-auto" style={{ color: "var(--pos-muted-2)" }} /></a>
                  : <button key={i} onClick={item.onClick} className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:bg-white/5 text-left" style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}><item.icon className="h-5 w-5 shrink-0" style={{ color: "#4f6ef7" }} /><span className="text-white text-sm font-semibold">{item.title}</span></button>
            ))}
          </div>
        </div>
      );
    }

    // DISCOUNTS & PROMOTIONS
    if (activeNav === "discounts") {
      return (
        <PosPromotionsPanel
          cartSubtotal={subtotal()}
          canManage={adminBypass}
          onBack={() => setActiveNav("products")}
          onApplyCoupon={(code, discountAmt) => {
            onCouponChange(code, discountAmt);
            setCheckoutOpen(true);
            setActiveNav("products");
          }}
        />
      );
    }

    // SALES REPORT
    if (activeNav === "reports") {
      return (
        <PosSalesReportPanel
          viewAll={viewAllSales}
          onBack={() => setActiveNav("products")}
          onOpenSale={(id) => void reprintSale(id)}
        />
      );
    }

    return null;
  };

  if (!posOpen) return null;

  const posUiMode = resolvePosUiMode(receiptSettings.receiptTheme);
  const isPosLight = posUiMode === "light";

  return (
    <AnimatePresence>
      <motion.div key="pos" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:0.15}}
        className={cn(
          "pos-shell fixed inset-0 z-[100] flex flex-col overflow-hidden",
          isPosLight ? "pos-light" : "pos-dark",
          scanFlash && "ring-4 ring-inset ring-green-500/70",
          touchMode && "pos-touch-mode",
        )}
        style={{
          ...posUiCssVars(posUiMode),
          background: "var(--pos-bg)",
          color: "var(--pos-text)",
          fontSize: touchMode ? "15px" : undefined,
        }}>

        {addPopup && (
          <PosQuantityPopup
            productName={addPopup.productName}
            variantName={variantDisplayLabel(addPopup.selected, profile)}
            maxQty={allowNegativeStock
              ? Math.max(9999, addPopup.selected.stock)
              : Math.max(isPosWeightedProduct(addPopup.selected) ? 0.001 : 1, addPopup.selected.stock)}
            unitPrice={addPopup.selected.unitPrice}
            mrp={addPopup.selected.mrp}
            variants={addPopup.variants.length > 1 ? addPopup.variants : undefined}
            allowNegativeStock={allowNegativeStock}
            productKind={addPopup.selected.productKind}
            unit={addPopup.selected.unit}
            allowDecimalSelling={addPopup.selected.allowDecimalSelling}
            touchMode={touchMode}
            onCancel={() => setAddPopup(null)}
            onConfirm={({ qty, unitPrice, variant }) => {
              const base = variant ?? addPopup.selected;
              setAddPopup(null);
              commitAddProduct(base, qty, {
                unitPrice: unitPrice > 0 ? unitPrice : base.unitPrice,
                keepSearchFocus: true,
              });
            }}
          />
        )}

        {/* SHIFT GATE — opening cash required */}
        {posOpen && !pinLocked && !shiftReady && !showCashClose && (
          <PosShiftGate onShiftReady={markShiftReady} onClose={closePos} />
        )}

        {showCashClose && (
          <PosCashClose
            onClosed={handleCashClosed}
            onCancel={() => setShowCashClose(false)}
          />
        )}

        {/* PIN LOCK SCREEN */}
        {pinLocked&&(
          <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center gap-8" style={{background:"var(--pos-pin-bg)"}}>
            <div className="flex flex-col items-center gap-2">
              <div className="h-16 w-16 rounded-2xl flex items-center justify-center mb-1" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}><Lock className="h-8 w-8 text-white"/></div>
              <h2 className="font-bold text-2xl" style={{color:"var(--pos-text)"}}>Switch cashier</h2>
              <p className="text-sm text-center max-w-xs" style={{color:"var(--pos-muted)"}}>
                Enter your 4-digit PIN — bills will be assigned to you (no re-login)
              </p>
            </div>
            <div className="flex gap-4 mb-2">
              {[0,1,2,3].map(i=>(
                <div key={i} className="h-4 w-4 rounded-full transition-all duration-150" style={{background:pinEntry.length>i?(pinError?"#ef4444":"#4f6ef7"):"var(--pos-border)",transform:pinError&&pinEntry.length===0?"translateX(0)":"none"}}/>
              ))}
            </div>
            {pinError&&<p className="text-sm font-semibold -mt-4" style={{color:"#ef4444"}}>Incorrect PIN. Try again.</p>}
            {pinBusy&&<Loader2 className="h-5 w-5 animate-spin -mt-2" style={{color:"#4f6ef7"}}/>}
            <div className="grid gap-3" style={{gridTemplateColumns:"repeat(3,80px)"}}>
              {[1,2,3,4,5,6,7,8,9].map(n=>(
                <button key={n} disabled={pinBusy} onClick={()=>void handlePinEntry(String(n))} className="h-20 rounded-2xl text-white text-2xl font-bold transition-all active:scale-95 hover:bg-white/10 disabled:opacity-50" style={{background:"var(--pos-card)",border:"1px solid var(--pos-border)"}}>{n}</button>
              ))}
              <button disabled={pinBusy} onClick={()=>void handlePinEntry("DEL")} className="h-20 rounded-2xl text-sm font-bold transition-all active:scale-95 hover:bg-white/10 flex items-center justify-center disabled:opacity-50" style={{background:"var(--pos-card)",border:"1px solid var(--pos-border)",color:"#ef4444"}}><Delete className="h-6 w-6"/></button>
              <button disabled={pinBusy} onClick={()=>void handlePinEntry("0")} className="h-20 rounded-2xl text-white text-2xl font-bold transition-all active:scale-95 hover:bg-white/10 disabled:opacity-50" style={{background:"var(--pos-card)",border:"1px solid var(--pos-border)"}}>0</button>
              <button onClick={closePos} className="h-20 rounded-2xl text-xs font-semibold transition-all active:scale-95 hover:bg-red-500/10" style={{background:"var(--pos-card)",border:"1px solid var(--pos-border)",color:"var(--pos-muted)"}}>Exit</button>
            </div>
            <p className="text-xs" style={{color:"var(--pos-border-strong)"}}>Terminal login: {user?.name??"Admin"}</p>
          </div>
        )}

        {/* TOP BAR */}
        <div className="flex h-12 items-center gap-3 px-4 shrink-0 border-b" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)"}}>
          <div className="flex items-center gap-2.5 shrink-0">
            <button onClick={closePos} title="Exit POS" className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"><Menu className="h-4 w-4 text-white/60"/></button>
            <button
              type="button"
              onClick={toggleSidebar}
              title={sidebarHidden ? "Show sidebar" : "Hide sidebar"}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: "var(--pos-muted)" }}
            >
              {sidebarHidden ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <p className="text-[10px] leading-none font-semibold tracking-wide" style={{color:"var(--pos-muted)"}}>POS Terminal</p>
          </div>
          <div className="flex-1 relative mx-4 max-w-xl">
            <Scan className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{color:"var(--pos-muted)"}}/>
            <input ref={searchRef} value={search} onChange={e=>setSearch(e.target.value)} onFocus={()=>setActiveNav("products")} placeholder="Scan barcode · search name / SKU / category..." className="pos-input w-full pl-9 pr-16 h-9 text-sm rounded-xl outline-none" style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)",color:"var(--pos-text)"}}/>
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono rounded px-1.5 py-0.5" style={{background:"var(--pos-kbd)",color:"var(--pos-muted)"}}>F2</kbd>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {[{label:"Hold Bill",key:"F3",icon:PauseCircle,onClick:()=>{if(items.length>0){handleHoldBill();}else toast.info("Cart is empty");}},{label:"Held Bills",key:"F8",icon:PauseCircle,onClick:()=>openHeldBillsPopup()},{label: customer ? customer.name : "Walk-In Customer", key:"F4",icon:Users,onClick:()=>openCustomerPopup()}].map((btn,i)=>(
              <button
                key={i}
                onClick={btn.onClick}
                className={cn("flex items-center gap-1.5 px-3 h-8 rounded-xl text-xs font-medium transition-all hover:opacity-90", i===2&&"max-w-[180px]")}
                style={{
                  background: i === 2 && customer
                    ? (isPosLight ? "#4f6ef7" : "rgba(79,110,247,0.15)")
                    : (isPosLight ? "#334155" : "var(--pos-input)"),
                  color: i === 2 && customer
                    ? "#ffffff"
                    : (isPosLight ? "#ffffff" : "var(--pos-text-secondary)"),
                  border: i === 2 && customer
                    ? (isPosLight ? "1px solid #4338ca" : "1px solid rgba(79,110,247,0.35)")
                    : (isPosLight ? "1px solid #1E293B" : "none"),
                }}
                title={i===2?(customer?`${workspace.customerLabel}: ${customer.name}`:"Walk-In Customer") : undefined}
              >
                <btn.icon className="h-3.5 w-3.5 shrink-0"/>{i===2 ? <span className="truncate">{btn.label}</span> : btn.label}{btn.key&&<span className="text-[10px] font-mono opacity-70 ml-0.5 shrink-0">{btn.key}</span>}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-auto shrink-0">
            {(() => {
              const isDarkUi = !isPosLight;
              return (
                <button
                  type="button"
                  onClick={() => void setReceiptTheme(isDarkUi ? "light" : "dark")}
                  title={isDarkUi ? "Switch POS to Light mode" : "Switch POS to Dark mode"}
                  className="flex items-center gap-1.5 px-2.5 h-7 rounded-xl text-xs font-semibold transition-all hover:opacity-90"
                  style={{
                    background: isDarkUi ? "rgba(15,23,42,0.9)" : "#334155",
                    color: "#ffffff",
                    border: isDarkUi ? "1px solid #475569" : "1px solid #1E293B",
                    boxShadow: isPosLight ? "var(--pos-shadow)" : undefined,
                  }}
                >
                  {isDarkUi ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
                  {isDarkUi ? "Dark" : "Light"}
                </button>
              );
            })()}
            <div
              className="flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-semibold"
              style={{
                background: isPosLight ? "#059669" : "rgba(16,185,129,0.15)",
                color: isPosLight ? "#ffffff" : "#10b981",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: isPosLight ? "#ffffff" : "#4ade80" }} />
              Online
            </div>
            <button
              type="button"
              onClick={() => setActiveNav("settings")}
              title={taxRate > 0 ? `Tax ${taxRate}% from POS settings` : "Tax disabled in POS settings"}
              className="flex items-center gap-1 px-2.5 h-7 rounded-xl text-xs font-semibold hover:opacity-90"
              style={{
                background: taxRate > 0
                  ? (isPosLight ? "#4f6ef7" : "rgba(79,110,247,0.15)")
                  : (isPosLight ? "#475569" : "rgba(107,114,128,0.15)"),
                color: isPosLight ? "#ffffff" : (taxRate > 0 ? "var(--pos-accent-soft)" : "var(--pos-muted)"),
              }}
            >
              <Receipt className="h-3.5 w-3.5"/>
              {taxRate > 0 ? `Tax ${taxRate}%` : "No Tax"}
            </button>
            {serverHeldBills.length>0&&(
              <button
                onClick={openHeldBillsPopup}
                className="flex items-center gap-1 px-2.5 h-7 rounded-xl text-xs font-semibold"
                style={{
                  background: isPosLight ? "var(--pos-warn)" : "var(--pos-warn-bg)",
                  color: isPosLight ? "#ffffff" : "var(--pos-warn)",
                }}
              >
                <PauseCircle className="h-3.5 w-3.5"/>{serverHeldBills.length} Held
              </button>
            )}
            <a
              href={getCustomerDisplayUrl()}
              target={CUSTOMER_DISPLAY_WINDOW_NAME}
              rel="noopener noreferrer"
              onClick={handleOpenCustomerDisplay}
              title="Open customer-facing display on second screen"
              className="flex items-center gap-1 px-2.5 h-7 rounded-xl text-xs font-semibold transition-all hover:opacity-90 no-underline"
              style={{
                background: isPosLight ? "#6D28D9" : "rgba(124,58,237,0.15)",
                color: isPosLight ? "#ffffff" : "var(--pos-violet-soft)",
              }}
            >
              <Monitor className="h-3.5 w-3.5"/>Customer Screen
            </a>
            <div className="flex items-center gap-2 pl-2 border-l" style={{borderColor:"var(--pos-border)"}}>
              <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>{(activeCashier?.name ?? user?.name)?.[0]??"A"}</div>
              <div>
                <p className="text-xs font-semibold leading-tight" style={{ color: "var(--pos-text)" }}>{activeCashier?.name ?? user?.name ?? "Admin"}</p>
                <p className="text-[10px] leading-none" style={{color:"var(--pos-muted)"}}>
                  {activeCashier ? "Active cashier" : formatUserRole(user?.role)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* MAIN */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* SIDEBAR */}
          {!sidebarHidden ? (
          <div className="w-44 flex flex-col shrink-0 border-r" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)"}}>
            <div className="flex items-center justify-between px-2 pt-2 pb-1 shrink-0">
              <span className="text-[10px] font-semibold uppercase tracking-wide px-1" style={{ color: "var(--pos-muted-2)" }}>Menu</span>
              <button
                type="button"
                onClick={toggleSidebar}
                title="Hide sidebar"
                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: "var(--pos-muted)" }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
            <nav className="flex-1 py-1 overflow-y-auto">
              {navItems.map((item, navIdx)=>{
                if (item.id === "demo-product") return null;
                if (item.id === "quick-product") {
                  const demoItem = navItems.find((n) => n.id === "demo-product");
                  const newActive = activeNav === "quick-product";
                  const demoActive = activeNav === "demo-product";
                  return (
                    <div key="product-create-row" className="flex items-stretch gap-1 px-1.5 py-1">
                      <button
                        type="button"
                        onClick={() => setActiveNav("quick-product")}
                        title="New Product (Q)"
                        className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-lg text-[10px] font-semibold leading-tight transition-all"
                        style={{
                          color: newActive ? "#4f6ef7" : "var(--pos-muted)",
                          background: newActive ? "rgba(79,110,247,0.15)" : "var(--pos-elevated)",
                          border: `1px solid ${newActive ? "#4f6ef7" : "var(--pos-border)"}`,
                        }}
                      >
                        <PackagePlus className="h-3.5 w-3.5 shrink-0" style={{ color: newActive ? "#4f6ef7" : "var(--pos-muted)" }} />
                        <span className="truncate w-full text-center">New</span>
                      </button>
                      {demoItem && (
                        <button
                          type="button"
                          onClick={() => setActiveNav("demo-product")}
                          title="Demo Product (Y)"
                          className="flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 py-2 rounded-lg text-[10px] font-semibold leading-tight transition-all"
                          style={{
                            color: demoActive ? "#059669" : "var(--pos-muted)",
                            background: demoActive ? "rgba(16,185,129,0.15)" : "var(--pos-elevated)",
                            border: `1px solid ${demoActive ? "#10b981" : "var(--pos-border)"}`,
                          }}
                        >
                          <Sparkles className="h-3.5 w-3.5 shrink-0" style={{ color: demoActive ? "#10b981" : "var(--pos-muted)" }} />
                          <span className="truncate w-full text-center">Demo</span>
                        </button>
                      )}
                    </div>
                  );
                }
                const active=activeNav===item.id;
                const shortcutIdx = navItems.filter((n) => n.id !== "demo-product").findIndex((n) => n.id === item.id);
                return (
                  <button key={item.id} onClick={()=>{
                    if (item.id === "hold-bills") { openHeldBillsPopup(); return; }
                    setActiveNav(item.id);
                  }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-base font-medium transition-all relative" style={{color:active?"#4f6ef7":"var(--pos-muted)",background:active?"rgba(79,110,247,0.15)":"transparent"}}>
                    {active&&<div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r-full" style={{background:"#4f6ef7"}}/>}
                    <item.icon className="h-4 w-4 shrink-0" style={{color:active?"#4f6ef7":"var(--pos-muted)"}}/>
                    {item.label}
                    {item.id==="products"&&itemCount()>0&&<span className="ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none" style={{background:"#4f6ef7",color:"#fff"}}>{itemCount()}</span>}
                    {item.id==="hold-bills"&&serverHeldBills.length>0&&<span className="ml-auto text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none" style={{background:"var(--pos-warn)",color:"#fff"}}>{serverHeldBills.length}</span>}
                    {shortcutIdx>=0&&shortcutIdx<9&&!(item.id==="products"&&itemCount()>0)&&!(item.id==="hold-bills"&&serverHeldBills.length>0)&&<span className="ml-auto text-[9px] opacity-40 font-mono">Alt+{shortcutIdx+1}</span>}
                  </button>
                );
              })}
            </nav>
            <div className="mx-2 mb-2 p-3 rounded-xl overflow-hidden shrink-0 border" style={{background:"var(--pos-sales-bg)",borderColor:isPosLight?"var(--pos-border)":"transparent"}}>
              <p className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{color:"var(--pos-sales-muted)"}}>Today Sales</p>
              <p className="font-bold text-lg leading-tight" style={{color:"var(--pos-sales-fg)"}}>LKR {formatNumber(todayStats.sales)}</p>
              <svg viewBox="0 0 80 24" className="w-full mt-1.5 opacity-60" fill="none"><polyline points="0,20 15,14 30,16 45,8 60,10 80,2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{color:"var(--pos-sales-fg)"}}/></svg>
              <p className="text-[10px] mt-1" style={{color:"var(--pos-sales-muted)"}}> {todayStats.orders} Orders  {todayStats.items} Items</p>
            </div>
            <button onClick={lockCashier} className="flex items-center gap-2 mx-2 mb-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:bg-white/10" style={{background:isPosLight?"var(--pos-input)":"rgba(255,255,255,0.05)",color:"var(--pos-muted)"}}>
              <Lock className="h-3.5 w-3.5"/>Lock Screen<span className="ml-auto text-[10px] opacity-50 font-mono">F12</span>
            </button>
          </div>
          ) : (
          <div className="w-9 flex flex-col items-center shrink-0 border-r py-2 gap-2" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)"}}>
            <button
              type="button"
              onClick={toggleSidebar}
              title="Show sidebar"
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: "var(--pos-muted)" }}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={lockCashier}
              title="Lock Screen (F12)"
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              style={{ color: "var(--pos-muted)" }}
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          </div>
          )}

          {/* CENTER  dynamic content */}
          <div className="flex-1 min-w-0 overflow-hidden">{renderCenter()}</div>

          {/* CART PANEL */}
          <div
            className="relative flex flex-col shrink-0 border-l min-w-0"
            style={{
              width: cartWidth,
              maxWidth: "48vw",
              background: "var(--pos-panel)",
              borderColor: "var(--pos-border)",
            }}
          >
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize cart"
              title="Drag to resize cart"
              onPointerDown={onCartResizeStart}
              onPointerMove={onCartResizeMove}
              onPointerUp={onCartResizeEnd}
              onPointerCancel={onCartResizeEnd}
              className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 z-20 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60"
            />
            <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 gap-2" style={{borderColor:"var(--pos-border)"}}>
              <span className="font-bold text-lg truncate" style={{ color: "var(--pos-text)" }}>Cart ({itemCount()} Items)</span>
              <button onClick={()=>{clearCart();setSelectedCartIdx(-1);setCheckoutOpen(false);setLastAddedVariantId(undefined);setThankYouSale(null);}} className="flex items-center gap-1.5 text-sm font-semibold hover:text-red-400 transition-colors shrink-0" style={{color:"#ef4444"}}><Trash2 className="h-4 w-4"/>Clear</button>
            </div>
            {/* Customer on bill — dropdown select / register */}
            <div className="px-4 py-2 border-b shrink-0 relative" style={{borderColor:"var(--pos-border)"}} ref={cartCustomerDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  if (cartCustomerOpen) {
                    setCartCustomerOpen(false);
                    setCustomerSearch("");
                    setCartShowNewCust(false);
                    setCustomers([]);
                  } else {
                    openCartCustomerDropdown();
                  }
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all hover:bg-white/5 text-left"
                style={{
                  background: customer ? "rgba(79,110,247,0.1)" : "var(--pos-card)",
                  border: `1px solid ${cartCustomerOpen ? "#4f6ef7" : customer ? "rgba(79,110,247,0.35)" : "var(--pos-border)"}`,
                }}
              >
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: customer ? "linear-gradient(135deg,#4f6ef7,#7c3aed)" : "var(--pos-input)" }}
                >
                  {customer
                    ? <span className="text-white text-xs font-bold">{customer.name?.[0] ?? "?"}</span>
                    : <User className="h-4 w-4" style={{ color: "var(--pos-muted)" }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wide leading-none mb-0.5" style={{ color: "var(--pos-muted)" }}>{workspace.customerLabel}</p>
                  <p className="text-sm font-bold truncate leading-tight" style={{ color: customer ? "var(--pos-text)" : "var(--pos-muted)" }}>
                    {customer ? customer.name : "Walk-In Customer"}
                  </p>
                  {customer?.phone && (
                    <p className="text-[10px] truncate mt-0.5" style={{ color: "var(--pos-muted)" }}>{customer.phone}</p>
                  )}
                </div>
                {customer && !cartCustomerOpen ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCustomer(null); setCustomerInsight(null); setPreviewCustomerId(null); toast.info("Customer removed from bill"); }}
                    className="p-1.5 rounded-lg hover:bg-white/10 shrink-0"
                    title="Remove customer"
                  >
                    <X className="h-3.5 w-3.5" style={{ color: "var(--pos-muted)" }} />
                  </button>
                ) : (
                  <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", cartCustomerOpen && "rotate-180")} style={{ color: "#4f6ef7" }} />
                )}
              </button>
              {cartCustomerOpen && (
                <div
                  className="absolute left-4 right-4 top-full mt-1 z-50 rounded-xl border shadow-2xl overflow-hidden"
                  style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
                >
                  <div className="flex items-center gap-2 p-2 border-b" style={{ borderColor: "var(--pos-border)" }}>
                    <Search className="h-3.5 w-3.5 shrink-0" style={{ color: "#4f6ef7" }} />
                    <input
                      ref={cartCustomerSearchRef}
                      value={customerSearch}
                      onChange={(e) => { setCustomerSearch(e.target.value); setCartShowNewCust(false); setFocusedCustomerIdx(0); }}
                      placeholder="Search name or phone..."
                      className="flex-1 h-8 px-1.5 text-xs text-white outline-none bg-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCartShowNewCust((s) => !s);
                        if (!cartShowNewCust && /^\d+$/.test(customerSearch.trim())) setNewCustPhone(customerSearch.trim());
                      }}
                      className="h-7 px-2 rounded-lg text-[10px] font-bold text-white shrink-0 flex items-center gap-1"
                      style={{ background: cartShowNewCust ? "var(--pos-card)" : "#4f6ef7", border: cartShowNewCust ? "1px solid #4f6ef7" : "none" }}
                    >
                      {cartShowNewCust ? <X className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                      {cartShowNewCust ? "Cancel" : "Register"}
                    </button>
                  </div>
                  {cartShowNewCust && (
                    <div className="p-2 border-b space-y-1.5" style={{ borderColor: "var(--pos-border)", background: "var(--pos-card)" }}>
                      <div className="grid grid-cols-2 gap-1.5">
                        <input value={newCustFirst} onChange={(e) => setNewCustFirst(e.target.value)} placeholder="First name *" className="h-8 px-2 rounded-lg text-xs text-white outline-none" style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }} />
                        <input value={newCustLast} onChange={(e) => setNewCustLast(e.target.value)} placeholder="Last name" className="h-8 px-2 rounded-lg text-xs text-white outline-none" style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }} />
                        <input value={newCustPhone} onChange={(e) => setNewCustPhone(e.target.value)} placeholder="Phone *" className="h-8 px-2 rounded-lg text-xs text-white outline-none" style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }} />
                        <input value={newCustEmail} onChange={(e) => setNewCustEmail(e.target.value)} placeholder="Email" className="h-8 px-2 rounded-lg text-xs text-white outline-none" style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }} />
                      </div>
                      <button type="button" onClick={() => void saveNewCustomer()} disabled={newCustSaving || !newCustFirst.trim() || !newCustPhone.trim()} className="w-full h-8 rounded-lg text-xs font-bold text-white disabled:opacity-40" style={{ background: "#4f6ef7" }}>
                        {newCustSaving ? "Saving…" : "Save & add to bill"}
                      </button>
                    </div>
                  )}
                  <div className="max-h-52 overflow-y-auto p-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCustomer(null);
                        setCustomerInsight(null);
                        setPreviewCustomerId(null);
                        setCartCustomerOpen(false);
                        setCartShowNewCust(false);
                        setCustomerSearch("");
                        setCustomers([]);
                        toast.info("Walk-in customer");
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 text-left"
                      style={{ background: !customer ? "rgba(79,110,247,0.1)" : "transparent" }}
                    >
                      <div className="h-7 w-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--pos-input)" }}>
                        <User className="h-3.5 w-3.5" style={{ color: "var(--pos-muted)" }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-white">Walk-In Customer</p>
                        <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>No account on bill</p>
                      </div>
                      {!customer && <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#10b981" }} />}
                    </button>
                    {customerLoading && (
                      <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" style={{ color: "#4f6ef7" }} /></div>
                    )}
                    {!customerLoading && customers.length === 0 && customerSearch && !cartShowNewCust && (
                      <div className="text-center py-4 space-y-2">
                        <p className="text-xs" style={{ color: "var(--pos-muted-2)" }}>No customers found</p>
                        <button
                          type="button"
                          onClick={() => {
                            setCartShowNewCust(true);
                            if (/^\d+$/.test(customerSearch.trim())) setNewCustPhone(customerSearch.trim());
                          }}
                          className="text-[10px] font-bold px-3 h-7 rounded-lg text-white"
                          style={{ background: "#4f6ef7" }}
                        >
                          Register new
                        </button>
                      </div>
                    )}
                    {!customerLoading && customers.map((c, cIdx) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => applyCustomer(c)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/5 text-left"
                        style={{
                          background: focusedCustomerIdx === cIdx || customer?.id === c.id ? "rgba(79,110,247,0.12)" : "transparent",
                          outline: focusedCustomerIdx === cIdx ? "1px solid #4f6ef7" : "none",
                        }}
                      >
                        <div className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0" style={{ background: "linear-gradient(135deg,#4f6ef7,#7c3aed)" }}>
                          {c.name?.[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-white truncate">{c.name}</p>
                          <p className="text-[10px] truncate" style={{ color: "var(--pos-muted)" }}>{c.phone}</p>
                        </div>
                        {customer?.id === c.id ? (
                          <Check className="h-3.5 w-3.5 shrink-0" style={{ color: "#10b981" }} />
                        ) : (
                          <span className="text-[9px] capitalize shrink-0" style={{ color: "var(--pos-warn)" }}>{c.tier}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
                  {items.length===0?(
                    <div className="flex flex-col items-center justify-center h-40" style={{color:"var(--pos-muted-2)"}}><ShoppingCart className="h-12 w-12 mb-2 opacity-20"/><p className="text-sm">Cart is empty</p><p className="text-xs mt-1 opacity-70">Scan barcode to begin</p></div>
                  ):(
                    <div className="px-2 py-1.5 space-y-1">
                      <AnimatePresence>{items.map((item,idx)=>{
                        const lineDisc = calcPosLineDiscount(item);
                        const afterDisc = calcPosLineNet(item);
                        const lineTax = afterDisc * ((item.taxRate || 0) / 100);
                        const lineTotal = afterDisc + lineTax;
                        const lineGross = item.unitPrice * item.quantity;
                        const editing = editingCartQtyIdx === idx;
                        const weighted = isPosWeightedProduct(item);
                        const qtyStep = weighted ? gramsToCartQty(10, item) : 1;
                        return (
                        <motion.div key={item.variantId} initial={{opacity:0,height:0}} animate={{opacity:1,height:"auto"}} exit={{opacity:0,height:0}}
                          onClick={()=>setSelectedCartIdx(idx)} className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all group"
                          style={{background:selectedCartIdx===idx?"rgba(79,110,247,0.15)":"var(--pos-card)",border:`1px solid ${selectedCartIdx===idx?"#4f6ef7":"var(--pos-border)"}`}}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">
                              {item.productName}
                            </p>
                            {weighted && (
                              <p className="text-[10px] truncate" style={{color:"var(--pos-muted)"}}>
                                Weight · edit grams
                              </p>
                            )}
                            {lineDisc > 0.001 && (
                              <p className="text-[10px] font-semibold truncate" style={{color:"#34d399"}}>
                                Disc −LKR {formatNumber(lineDisc)}
                                {item.discountType === "percentage" && item.discountAmount > 0
                                  ? ` (${item.discountAmount}%)`
                                  : ""}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <button type="button" onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity-qtyStep);}} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"var(--pos-input)"}}><Minus className="h-3 w-3 text-white"/></button>
                            {editing ? (
                              <input
                                autoFocus
                                value={editingCartQtyRaw}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => setEditingCartQtyRaw(e.target.value.replace(weighted ? /[^\d]/g : /[^\d.]/g, ""))}
                                onBlur={() => {
                                  if (weighted) {
                                    const g = parseGramsInput(editingCartQtyRaw);
                                    if (g >= 1) updateQuantity(item.variantId, gramsToCartQty(g, item));
                                  } else {
                                    const n = parseFloat(editingCartQtyRaw);
                                    if (!Number.isNaN(n) && n > 0) updateQuantity(item.variantId, n);
                                  }
                                  setEditingCartQtyIdx(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).blur();
                                  }
                                  if (e.key === "Escape") {
                                    e.preventDefault();
                                    setEditingCartQtyIdx(null);
                                  }
                                }}
                                className="w-10 h-6 rounded text-center text-xs font-bold text-white outline-none"
                                style={{ background: "var(--pos-panel)", border: "1px solid #4f6ef7" }}
                                title={weighted ? "Grams" : "Qty"}
                              />
                            ) : (
                              <span
                                title={weighted ? "Double-click to edit grams" : "Double-click to edit"}
                                onDoubleClick={(e) => {
                                  e.stopPropagation();
                                  setEditingCartQtyIdx(idx);
                                  setEditingCartQtyRaw(
                                    weighted ? String(cartQtyToGrams(item.quantity, item)) : String(item.quantity),
                                  );
                                }}
                                className="text-white text-xs font-bold min-w-[2rem] px-0.5 text-center select-none tabular-nums"
                              >
                                {weighted ? formatPosWeightQty(item.quantity, item) : item.quantity}
                              </span>
                            )}
                            <button type="button" onClick={e=>{e.stopPropagation();updateQuantity(item.variantId,item.quantity+qtyStep);}} className="h-6 w-6 rounded flex items-center justify-center" style={{background:"var(--pos-input)"}}><Plus className="h-3 w-3 text-white"/></button>
                          </div>
                          <div className="shrink-0 min-w-[4.5rem] text-right">
                            {lineDisc > 0.001 && (
                              <p className="text-[10px] tabular-nums line-through leading-none mb-0.5" style={{color:"var(--pos-muted)"}}>
                                LKR {formatNumber(lineGross)}
                              </p>
                            )}
                            <p className="text-sm font-bold text-white tabular-nums leading-tight">LKR {formatNumber(lineTotal)}</p>
                          </div>
                          <button type="button" onClick={e=>{e.stopPropagation();removeItem(item.variantId);if(selectedCartIdx===idx)setSelectedCartIdx(-1);}} className={`h-6 w-6 rounded flex items-center justify-center transition-opacity shrink-0 ${item.isCustom ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} title="Remove"><X className="h-3 w-3" style={{color:"#ef4444"}}/></button>
                        </motion.div>
                        );
                      })}</AnimatePresence>
                    </div>
                  )}
                </div>
                <div className="shrink-0 border-t" style={{borderColor:"var(--pos-border)"}}>
                  <div className="flex items-center gap-2 px-4 py-3 border-b" style={{borderColor:"var(--pos-border)"}}>
                    <span className="text-sm font-medium shrink-0" style={{color:"var(--pos-muted)"}}>Discount %</span>
                    <input ref={discountInputRef} type="number" min="0" max="100" value={discountInput} onChange={e=>setDiscountInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();applyCartDiscount();}}} placeholder={pendingDiscountApproval?`${pendingDiscountApproval.percent}% pending`:discount>0?`${discount}% active`:"0"} disabled={!!pendingDiscountApproval} className="flex-1 h-9 rounded-lg px-3 text-sm text-white outline-none disabled:opacity-60" style={{background:"var(--pos-input)",border:`1px solid ${pendingDiscountApproval?"var(--pos-warn)":discount>0?"#10b981":"var(--pos-border)"}`}}/>
                    <button onClick={applyCartDiscount} disabled={!!pendingDiscountApproval} className="px-4 h-9 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50" style={{background:"#4f6ef7"}}>{pendingDiscountApproval?"Pending":"Apply"}</button>
                  </div>
                  {discount > 0 && cartDiscountAmt > 0 && !pendingDiscountApproval && (
                    <div className="mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2" style={{background:"rgba(16,185,129,0.12)",border:"1px solid rgba(16,185,129,0.35)",color:"#34d399"}}>
                      <span className="font-semibold flex items-center gap-1.5"><Tag className="h-3.5 w-3.5"/>{discount}% cart discount applied</span>
                      <span className="font-bold tabular-nums">−LKR {formatNumber(cartDiscountAmt)}</span>
                    </div>
                  )}
                  {pendingDiscountApproval && (
                    <div className="mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2" style={{background:"var(--pos-warn-bg)",border:"1px solid var(--pos-warn-border)",color:"var(--pos-warn-soft)"}}>
                      <Clock className="h-3.5 w-3.5 shrink-0"/>
                      {pendingDiscountApproval.percent}% discount awaiting manager approval (auto-applies when approved)
                    </div>
                  )}
                  {!adminBypass && !pendingDiscountApproval && (
                    <p className="px-4 pb-2 text-[10px]" style={{color:"var(--pos-muted)"}}>
                      Discounts over {DISCOUNT_APPROVAL_THRESHOLD_PCT}% require manager approval via Workflows
                    </p>
                  )}
                  <div className="px-4 py-3 space-y-1.5 border-b" style={{borderColor:"var(--pos-border)"}}>
                    <div className="flex justify-between text-sm" style={{color:"var(--pos-muted)"}}>
                      <span>Sub Total</span>
                      <span>LKR {formatNumber(subtotal() + itemDiscountTotal)}</span>
                    </div>
                    {itemDiscountTotal>0.001&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Item discounts</span><span>−LKR {formatNumber(itemDiscountTotal)}</span></div>}
                    {cartDiscountAmt>0&&<div className="flex justify-between text-sm font-semibold" style={{color:"#34d399"}}><span>Discount{discountType==="percentage"&&discount>0?` (${discount}%)`:""}</span><span>−LKR {formatNumber(cartDiscountAmt)}</span></div>}
                    {tierDiscountAmt>0&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Tier discount</span><span>−LKR {formatNumber(tierDiscountAmt)}</span></div>}
                    {payState.couponDiscount>0&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Coupon{payState.couponCode?` (${payState.couponCode})`:""}</span><span>−LKR {formatNumber(payState.couponDiscount)}</span></div>}
                    {loyaltyDiscountAmt>0&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Loyalty</span><span>−LKR {formatNumber(loyaltyDiscountAmt)}</span></div>}
                    {totalSavings>0.001&&<div className="flex justify-between text-xs font-bold pt-1" style={{color:"#10b981"}}><span>Total saved</span><span>LKR {formatNumber(totalSavings)}</span></div>}
                    <div className="flex justify-between text-sm" style={{color: taxRate > 0 ? "var(--pos-muted)" : "var(--pos-muted-2)"}}>
                      <span>{taxRate > 0 ? `Tax (${taxRate}% — POS setting)` : "Tax (off — POS setting)"}</span>
                      <span>LKR {formatNumber(taxAmount())}</span>
                    </div>
                    <div className="flex justify-between text-xl font-bold text-white pt-2 border-t" style={{borderColor:"var(--pos-border)"}}><span>Grand Total</span><span style={{color:"#4f6ef7"}}>LKR {formatNumber(totalAmt)}</span></div>
                  </div>
                  <div className="p-3 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => void handleCheckout("CASH")}
                      disabled={items.length === 0 || checkoutLoading || !!pendingDiscountApproval}
                      className="h-[52px] rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                      style={{background:"linear-gradient(135deg,#10b981,#059669)"}}
                    >
                      {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
                      Pay Cash
                      <span className="text-[10px] opacity-70 font-mono">⌃↵</span>
                    </button>
                    <button
                      onClick={() => { setActivePayment("CASH"); setCheckoutOpen(true); }}
                      disabled={items.length === 0}
                      className="h-[52px] rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-40"
                      style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}
                    >
                      <ChevronRight className="h-4 w-4"/>
                      Pay / Card
                      <span className="text-[10px] opacity-70 font-mono">F9</span>
                    </button>
                  </div>
                </div>
            {checkoutOpen && (
              <div className="fixed inset-0 z-[115] flex items-center justify-center p-2 sm:p-4" style={{background:"rgba(0,0,0,0.72)"}} onClick={() => !checkoutLoading && setCheckoutOpen(false)}>
              <div className="w-full max-w-5xl max-h-[96vh] overflow-hidden rounded-2xl border shadow-2xl flex flex-col" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)"}} onClick={e=>e.stopPropagation()}>
                <div className="flex items-center justify-between px-4 py-2.5 border-b shrink-0" style={{borderColor:"var(--pos-border)"}}>
                  <div className="min-w-0">
                    <h2 className="text-white font-bold text-base">Checkout</h2>
                    <p className="text-xs" style={{color:"var(--pos-muted)"}}>{itemCount()} items · Tax {taxEnabled ? `${taxRate}%` : "off"}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <p className="text-[10px] uppercase tracking-wide" style={{color:"var(--pos-muted)"}}>Pay</p>
                      <p className="text-lg font-bold tabular-nums leading-none" style={{color:"#4f6ef7"}}>LKR {formatNumber(totalAmt)}</p>
                    </div>
                    <button type="button" disabled={checkoutLoading} onClick={() => setCheckoutOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                      <X className="h-4 w-4" style={{color:"var(--pos-muted)"}}/>
                    </button>
                  </div>
                </div>
              <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-y-auto lg:overflow-hidden">
                {/* Left: bill + options */}
                <div className="lg:w-[42%] lg:max-w-md lg:border-r lg:overflow-y-auto shrink-0 flex flex-col" style={{borderColor:"var(--pos-border)"}}>
                <div className="px-4 py-2.5 border-b space-y-1" style={{borderColor:"var(--pos-border)"}}>
                  <div className="flex justify-between text-sm" style={{color:"var(--pos-muted)"}}><span>Items</span><span>LKR {formatNumber(subtotal() + itemDiscountTotal)}</span></div>
                  {itemDiscountTotal>0.001&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Item discounts</span><span>−LKR {formatNumber(itemDiscountTotal)}</span></div>}
                  {cartDiscountAmt>0&&<div className="flex justify-between text-sm font-semibold" style={{color:"#34d399"}}><span>Discount{discountType==="percentage"&&discount>0?` (${discount}%)`:""}</span><span>−LKR {formatNumber(cartDiscountAmt)}</span></div>}
                  {tierDiscountAmt>0&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Tier discount</span><span>−LKR {formatNumber(tierDiscountAmt)}</span></div>}
                  {payState.couponDiscount>0&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Coupon{payState.couponCode?` (${payState.couponCode})`:""}</span><span>−LKR {formatNumber(payState.couponDiscount)}</span></div>}
                  {loyaltyDiscountAmt>0&&<div className="flex justify-between text-sm" style={{color:"#34d399"}}><span>Loyalty</span><span>−LKR {formatNumber(loyaltyDiscountAmt)}</span></div>}
                  {totalSavings>0.001&&<div className="flex justify-between text-xs font-bold" style={{color:"#10b981"}}><span>Total saved</span><span>LKR {formatNumber(totalSavings)}</span></div>}
                  <div className="flex justify-between text-sm" style={{color: taxEnabled ? "var(--pos-muted)" : "var(--pos-muted-2)"}}>
                    <span>{taxEnabled ? `Tax (${taxRate}%)` : "Tax (off)"}</span>
                    <span>LKR {formatNumber(taxAmount())}</span>
                  </div>
                  <div className="flex justify-between text-xl font-bold text-white pt-1 border-t sm:hidden" style={{borderColor:"var(--pos-border)"}}><span>Pay</span><span style={{color:"#4f6ef7"}}>LKR {formatNumber(totalAmt)}</span></div>
                  <div className="pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="rounded-xl border px-3 py-2 space-y-2" style={{ borderColor: "var(--pos-border)", background: "var(--pos-input)" }}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white">Tax</p>
                          <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>
                            {taxEnabled ? `${taxRate}% on bill` : "Off"}
                          </p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={taxEnabled}
                          onClick={() => setCheckoutTaxEnabled(!taxEnabled)}
                          className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
                          style={{ background: taxEnabled ? "#4f6ef7" : "var(--pos-panel)" }}
                        >
                          <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${taxEnabled ? "translate-x-5" : ""}`} />
                        </button>
                      </div>
                      {taxEnabled && (
                        <div className="flex flex-wrap gap-1">
                          {[5, 8, 10, 12, 15, 18].map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => { writePosSavedTaxRate(r); setTaxRate(r); }}
                              className="rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors"
                              style={{
                                background: taxRate === r ? "#4f6ef7" : "var(--pos-panel)",
                                color: taxRate === r ? "#fff" : "var(--pos-muted)",
                                border: `1px solid ${taxRate === r ? "#4f6ef7" : "var(--pos-border)"}`,
                              }}
                            >
                              {r}%
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="rounded-xl border px-3 py-2 flex items-center justify-between gap-2" style={{ borderColor: "var(--pos-border)", background: "var(--pos-input)" }}>
                      <div className="min-w-0 flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 shrink-0" style={{ color: waBillEnabled ? "#10b981" : "var(--pos-muted)" }} />
                        <div>
                          <p className="text-sm font-semibold text-white">WhatsApp</p>
                          <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>
                            {waBillEnabled ? "Ask after sale" : "Skip"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={waBillEnabled}
                        onClick={() => setCheckoutWaBillEnabled(!waBillEnabled)}
                        className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
                        style={{ background: waBillEnabled ? "#10b981" : "var(--pos-panel)" }}
                      >
                        <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${waBillEnabled ? "translate-x-5" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>
                <PosPaymentPanel
                  totalAmt={totalAmt}
                  subtotal={subtotal()}
                  customerWallet={customer?.walletBalance}
                  customerCreditLimit={customer?.creditLimit}
                  customerCreditBalance={customer?.outstandingBalance}
                  customerTier={customer?.membershipTier}
                  activePayment={activePayment}
                  payNowAmount={partialPayAmount || (activePayment === "CASH" ? numpad : "")}
                  onPayNowAmountChange={(v) => {
                    setPartialPayAmount(v);
                    if (activePayment === "CASH") setNumpad(v);
                  }}
                  state={payState}
                  onStateChange={patchPayState}
                  onCouponChange={onCouponChange}
                  couponInputRef={couponInputRef}
                  partialPayInputRef={partialPayInputRef}
                />
                {showLoyalty && customer && (
                  <div className="px-3 py-2 border-b shrink-0" style={{ borderColor: "var(--pos-border)" }}>
                    <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1.5" style={{ color: "var(--pos-muted)" }}>
                      Redeem loyalty points ({customer.loyaltyPoints} available · LKR 0.10/pt)
                    </label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min={0}
                        max={customer.loyaltyPoints}
                        value={loyaltyPointsToRedeem || ""}
                        onChange={(e) => {
                          const pts = Math.min(customer.loyaltyPoints, Math.max(0, parseInt(e.target.value, 10) || 0));
                          setLoyaltyPoints(pts);
                        }}
                        placeholder="0"
                        className="h-8 text-xs text-white flex-1"
                        style={{ background: "var(--pos-input)", borderColor: "var(--pos-border)" }}
                      />
                      <button
                        type="button"
                        onClick={() => setLoyaltyPoints(Math.min(customer.loyaltyPoints, Math.floor(amountBeforeLoyalty / 0.1)))}
                        className="px-2.5 h-8 rounded-lg text-[10px] font-bold text-white whitespace-nowrap"
                        style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
                      >
                        Max
                      </button>
                    </div>
                  </div>
                )}
                </div>

                {/* Right: methods + keypad + confirm */}
                <div className="flex-1 flex flex-col min-w-0 lg:overflow-y-auto">
                <div className="flex gap-1.5 px-3 py-2 border-b shrink-0 flex-wrap" style={{borderColor:"var(--pos-border)"}}>
                  {PAY_METHODS.map(({value,label,icon:Icon}, idx)=>(
                    <button key={value} type="button" title={`${label} (${idx + 1})`} onClick={()=>setActivePayment(value)} className={cn("flex-1 min-w-[64px] flex flex-col items-center gap-0.5 rounded-xl text-xs font-bold transition-all", touchMode ? "py-2.5" : "py-1.5")} style={{background:activePayment===value?"linear-gradient(135deg,#4f6ef7,#7c3aed)":"var(--pos-input)",color:activePayment===value?"#fff":"var(--pos-muted)"}}>
                      <Icon className={touchMode ? "h-5 w-5" : "h-4 w-4"}/>
                      <span>{label}</span>
                      <span className="text-[9px] font-mono opacity-70">{idx + 1}</span>
                    </button>
                  ))}
                </div>
                {activePayment==="GIFT_VOUCHER"&&(
                  <input
                    ref={giftVoucherInputRef}
                    value={giftVoucherCode}
                    onChange={(e)=>setGiftVoucherCode(e.target.value.toUpperCase())}
                    placeholder="Gift voucher code"
                    className="mx-3 mt-2 w-[calc(100%-1.5rem)] h-9 px-3 rounded-xl text-sm text-white outline-none font-mono"
                    style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}
                  />
                )}
                {activePayment==="CHEQUE"&&(
                  <input
                    ref={chequeInputRef}
                    value={chequeNumber}
                    onChange={(e)=>setChequeNumber(e.target.value)}
                    placeholder="Cheque number"
                    className="mx-3 mt-2 w-[calc(100%-1.5rem)] h-9 px-3 rounded-xl text-sm text-white outline-none font-mono"
                    style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}
                  />
                )}
                {helpers.length > 0 && (
                  <div className="flex items-center gap-2 px-3 pt-2">
                    <UserCheck className="h-4 w-4 shrink-0" style={{color:"var(--pos-muted)"}}/>
                    <select
                      value={helperEmployeeId || ""}
                      onChange={(e)=>setHelperEmployeeId(e.target.value)}
                      className="flex-1 h-8 px-2 rounded-lg text-xs text-white outline-none"
                      style={{background:"var(--pos-input)",border:"1px solid var(--pos-border)"}}
                    >
                      <option value="">No helper / floor staff</option>
                      {helpers.map((h)=>(
                        <option key={h.id} value={h.id}>{h.firstName} {h.lastName}{h.commissionRate ? ` (${h.commissionRate}%)` : ""}</option>
                      ))}
                    </select>
                  </div>
                )}
                {activePayment==="CASH"&&(
                  <div ref={cashPanelRef} className="px-3 py-2 flex-1 flex flex-col min-h-0" style={{borderColor:"var(--pos-border)"}}>
                    <div className="flex items-center justify-between mb-1.5 gap-2"><span className="text-sm font-semibold" style={{color:"var(--pos-muted)"}}>{payState.allowPartial && (customer?.creditLimit ?? 0) > 0 ? "Paying now (LKR)" : "Cash Received (LKR)"}</span><span className="text-[10px] font-mono shrink-0" style={{color:"var(--pos-muted-2)"}}>F9 confirm</span><button type="button" onClick={()=>{setNumpad("");setPartialPayAmount("");}} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"var(--pos-muted)"}}/></button></div>
                    <div className="h-12 rounded-xl flex items-center px-3 mb-2 text-green-400 font-bold text-2xl font-mono" style={{background:"rgba(16,185,129,0.1)",border:"1px solid rgba(16,185,129,0.3)"}}>{numpad?formatNumber(parseFloat(numpad)):"0.00"}</div>
                    {payState.allowPartial && numpad && parseFloat(numpad) > 0 && parseFloat(numpad) + 0.01 < totalAmt && (customer?.creditLimit ?? 0) > 0 && (
                      <div className="flex justify-between text-xs mb-2 px-1">
                        <span style={{color:"var(--pos-muted)"}}>Balance on credit</span>
                        <span className="text-amber-400 font-bold tabular-nums">LKR {formatNumber(totalAmt - parseFloat(numpad))}</span>
                      </div>
                    )}
                    <div className="grid gap-1.5 flex-1 content-start" style={{gridTemplateColumns:"1fr 1fr 1fr 1fr"}}>
                      {[["7","8","9","500"],["4","5","6","1000"],["1","2","3","2000"],["0",".","DEL","5000"]].map((row,ri)=>row.map((k,ki)=>{
                        const isQuick=ki===3;const isDel=k==="DEL";
                        return(<button key={`${ri}-${ki}`} type="button" onClick={()=>isQuick?setQuickCash(parseInt(k,10)):handleNumpad(k)} className="h-11 rounded-lg text-sm font-bold transition-all active:scale-95" style={{background:isQuick?"var(--pos-border)":isDel?"rgba(239,68,68,0.15)":"var(--pos-input)",color:isQuick?"var(--pos-muted)":isDel?"#ef4444":"var(--pos-text)"}}>
                          {isDel?<Delete className="h-4 w-4 mx-auto"/>:k}
                        </button>);
                      }))}
                    </div>
                  </div>
                )}
                {activePayment!=="CASH"&&(
                  <div className="flex-1 px-4 py-6 flex items-center justify-center">
                    <p className="text-sm text-center" style={{color:"var(--pos-muted)"}}>
                      Pay <span className="font-bold text-white">LKR {formatNumber(totalAmt)}</span> via {activePayment.replace(/_/g, " ").toLowerCase()}
                    </p>
                  </div>
                )}
                {numpad&&parseFloat(numpad)>=totalAmt&&activePayment==="CASH"&&(
                  <div className="flex justify-between items-center px-4 py-2 border-t shrink-0" style={{borderColor:"var(--pos-border)"}}>
                    <span className="text-sm font-semibold text-green-400">Change</span>
                    <span className="text-green-400 font-bold font-mono text-base">LKR {formatNumber(changeAmt)}</span>
                  </div>
                )}
                <div className="p-3 flex gap-2 flex-wrap mt-auto shrink-0 border-t" style={{borderColor:"var(--pos-border)"}}>
                  <button onClick={handleSplitBill} disabled={items.length < 2} className="h-10 px-3 rounded-xl text-xs font-bold border transition-all hover:bg-white/10 disabled:opacity-40" style={{borderColor:"var(--pos-border)",color:"var(--pos-muted)"}}>
                    Split Bill
                  </button>
                  <button ref={checkoutConfirmRef} type="button" onClick={() => void handleCheckout()} disabled={checkoutLoading||items.length===0} className="flex-1 min-w-[140px] h-[48px] rounded-xl flex items-center justify-center gap-2 text-base font-bold text-white transition-all hover:opacity-90 disabled:opacity-40" style={{background:"linear-gradient(135deg,#10b981,#059669)"}}>
                    {checkoutLoading?<Loader2 className="h-5 w-5 animate-spin"/>:<Check className="h-5 w-5"/>}
                    Confirm Payment<span className="text-xs opacity-70 font-mono">(F9)</span>
                  </button>
                  <button type="button" onClick={handleThermalPrint} className="h-[48px] w-[48px] rounded-xl flex items-center justify-center border transition-all hover:bg-white/10" style={{borderColor:"var(--pos-border)"}} title="Print (F10)"><Printer className="h-5 w-5" style={{color:"var(--pos-muted)"}}/></button>
                </div>
                <p className="px-3 py-1.5 text-[10px] text-center border-t shrink-0" style={{ color: "var(--pos-muted)", borderColor: "var(--pos-border)" }}>
                  ← → / Tab method · 1–5 pick · / coupon · L partial · Shift+S split · Ctrl+1–4 quick cash · F9 confirm · Esc close
                </p>
                </div>
              </div>
              </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM BAR */}
        <div
          className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 sm:px-4 py-2 min-h-14 border-t shrink-0 overflow-x-auto"
          style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 min-w-0">
            {[{ label: "Shift Sales", value: `LKR ${formatNumber(todayStats.sales)}`, color: "#4f6ef7", short: "Sales" }, { label: "Orders", value: String(todayStats.orders), short: "Ord" }, { label: "Items Sold", value: String(todayStats.items), short: "Items" }, { label: "Avg. Bill", value: todayStats.orders > 0 ? `LKR ${formatNumber(todayStats.sales / todayStats.orders)}` : "LKR 0.00", short: "Avg" }].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] sm:text-xs font-medium whitespace-nowrap" style={{ color: "var(--pos-muted-2)" }}>
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.label}</span>
                </span>
                <span className="text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap" style={{ color: s.color || "var(--pos-text)" }}>{s.value}</span>
              </div>
            ))}
            {drawerCash != null && (
              <div className="flex items-center gap-1.5 shrink-0 px-2 py-1 rounded-lg" style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.3)" }}>
                <Banknote className="h-3.5 w-3.5 shrink-0" style={{ color: "#10b981" }} />
                <span className="text-[10px] sm:text-xs font-medium hidden md:inline" style={{ color: "var(--pos-success-soft)" }}>
                  <span className="lg:hidden">Drawer</span>
                  <span className="hidden lg:inline">In drawer</span>
                </span>
                <span className="text-xs sm:text-sm font-bold tabular-nums whitespace-nowrap" style={{ color: "#10b981" }}>LKR {formatNumber(drawerCash)}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 ml-auto min-w-0">
            {(() => {
              const scannerActive = isScannerActive(lastScanAt, scanFlash, now);
              const scannerDetail = formatScannerDetail(lastScanAt, now);
              const scannerColor = scannerActive ? "#10b981" : "var(--pos-muted)";
              return (
                <div className="flex items-center gap-1.5 shrink-0 max-w-[200px] lg:max-w-none" style={{ color: scannerColor }} title={`Barcode Scanner · ${scannerDetail}`}>
                  <div className={cn("h-2 w-2 rounded-full shrink-0", scannerActive && "animate-pulse")} style={{ background: scannerActive ? "#4ade80" : "var(--pos-muted-2)" }} />
                  <Scan className="h-3.5 w-3.5 shrink-0" />
                  <span className="text-xs font-semibold hidden xl:inline whitespace-nowrap">Barcode Scanner</span>
                  <span className="text-[10px] sm:text-xs truncate" style={{ color: "var(--pos-muted)" }}>{scannerDetail}</span>
                </div>
              );
            })()}
            <div className="h-4 w-px shrink-0 hidden md:block" style={{ background: "var(--pos-border)" }} />
            <div className="flex items-center gap-1.5 shrink-0 max-w-[160px] lg:max-w-none" style={{ color: printerStatus.color }} title={`${printerStatus.label} · ${printerStatus.detail}`}>
              <Printer className="h-3.5 w-3.5 shrink-0" />
              <span className="text-xs font-semibold hidden lg:inline whitespace-nowrap">{printerStatus.label}</span>
              <span className="text-[10px] sm:text-xs truncate hidden sm:inline" style={{ color: "var(--pos-muted)" }}>{printerStatus.detail}</span>
            </div>
            <div className="h-4 w-px shrink-0 hidden md:block" style={{ background: "var(--pos-border)" }} />
            <div className="text-xs sm:text-sm font-mono font-bold text-white shrink-0 whitespace-nowrap">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true })}
            </div>
            <div className="text-[10px] sm:text-xs shrink-0 whitespace-nowrap hidden md:block" style={{ color: "var(--pos-muted)" }}>
              {now.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
            </div>
            <div className="h-4 w-px shrink-0 hidden sm:block" style={{ background: "var(--pos-border)" }} />
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => void toggleFullscreen()}
                title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
                className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90"
                style={{
                  background: isFullscreen
                    ? (isPosLight ? "#4f6ef7" : "rgba(79,110,247,0.15)")
                    : (isPosLight ? "#334155" : "var(--pos-input)"),
                  color: isPosLight ? "#ffffff" : (isFullscreen ? "#4f6ef7" : "var(--pos-text-secondary)"),
                  border: `1px solid ${isFullscreen
                    ? (isPosLight ? "#4338ca" : "rgba(79,110,247,0.35)")
                    : (isPosLight ? "#1E293B" : "var(--pos-border)")}`,
                }}
              >
                {isFullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{isFullscreen ? "Exit Full" : "Fullscreen"}</span>
              </button>
              <button
                onClick={handleDayEnd}
                disabled={dayEndLoading}
                title="Day End"
                className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                style={{
                  background: isPosLight ? "#DC2626" : "rgba(239,68,68,0.15)",
                  color: isPosLight ? "#ffffff" : "#ef4444",
                  border: `1px solid ${isPosLight ? "#B91C1C" : "rgba(239,68,68,0.3)"}`,
                }}
              >
                {dayEndLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TrendingUp className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">Day End</span>
              </button>
              <button
                onClick={() => setShowCashClose(true)}
                title="Close Shift"
                className="flex items-center gap-1.5 text-xs px-2 sm:px-3 py-1.5 rounded-lg font-semibold transition-all hover:opacity-90"
                style={{
                  background: isPosLight ? "#059669" : "rgba(16,185,129,0.12)",
                  color: isPosLight ? "#ffffff" : "#10b981",
                  border: `1px solid ${isPosLight ? "#047857" : "rgba(16,185,129,0.3)"}`,
                }}
              >
                <Banknote className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Close Shift</span>
              </button>
              <button
                onClick={() => setShowShortcuts((s) => !s)}
                title="Shortcuts (F1)"
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors"
                style={{ color: isPosLight ? "#ffffff" : "var(--pos-muted-2)", background: isPosLight ? "#475569" : "transparent" }}
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">F1</span>
              </button>
            </div>
          </div>
        </div>


        {/* WHATSAPP SEND BILL (after sale) */}
        <AnimatePresence>
          {waBillOffer && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
              style={{ background: "var(--pos-overlay)" }}
              onClick={closeWaBillOffer}
            >
              <motion.div
                initial={{ y: 24, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 16, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
                style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
              >
                <div className="px-4 py-3 flex items-center gap-2 border-b" style={{ borderColor: "var(--pos-border)", background: "rgba(16,185,129,0.12)" }}>
                  <MessageCircle className="h-4 w-4" style={{ color: "#10b981" }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold" style={{ color: "var(--pos-text)" }}>Send bill on WhatsApp</p>
                    <p className="text-[11px]" style={{ color: "var(--pos-muted)" }}>{waBillOffer.invoiceNumber} · LKR {waBillOffer.total}</p>
                  </div>
                  <button type="button" onClick={closeWaBillOffer} className="p-1.5 rounded-lg hover:bg-white/10">
                    <X className="h-4 w-4" style={{ color: "var(--pos-muted)" }} />
                  </button>
                </div>
                <form
                  className="p-4 space-y-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendWaBill();
                  }}
                >
                  <div>
                    <label className="text-[11px] font-semibold block mb-1" style={{ color: "var(--pos-muted)" }}>Customer WhatsApp number</label>
                    <input
                      ref={waPhoneRef}
                      value={waPhoneEdit}
                      onChange={(e) => setWaPhoneEdit(e.target.value)}
                      placeholder="077 123 4567"
                      inputMode="tel"
                      autoComplete="tel"
                      className="w-full h-10 px-3 rounded-xl text-sm outline-none"
                      style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)", color: "var(--pos-text)" }}
                    />
                  </div>
                  <p className="text-[11px]" style={{ color: "var(--pos-muted-2)" }}>
                    Connect shop WhatsApp in Settings → WhatsApp (scan QR) before sending. Press Enter to send, Esc to skip.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={closeWaBillOffer}
                      className="flex-1 h-10 rounded-xl text-sm font-semibold"
                      style={{ background: "var(--pos-input)", color: "var(--pos-muted)" }}
                    >
                      Skip
                    </button>
                    <button
                      type="submit"
                      disabled={waSending || !waPhoneEdit.trim()}
                      className="flex-[1.4] h-10 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                      style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                    >
                      {waSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
                      Send bill
                    </button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* DAY END MODAL */}
        <AnimatePresence>{showDayEnd&&dayEndSummary&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.75)"}}>
            <motion.div initial={{scale:0.9,y:16}} animate={{scale:1,y:0}} exit={{scale:0.9,y:16}} className="rounded-2xl overflow-hidden border shadow-2xl w-full max-w-md" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)"}}>
              <div className="p-5 text-white text-center" style={{background:"linear-gradient(135deg,#7c3aed,#4f6ef7)"}}>
                <div className="h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-2" style={{background:"rgba(255,255,255,0.2)"}}><TrendingUp className="h-6 w-6"/></div>
                <h2 className="text-base font-bold">Day End Summary</h2>
                <p className="text-white/70 text-xs">{dayEndSummary.date}</p>
              </div>
              <div className="p-4 space-y-2.5 max-h-[70vh] overflow-y-auto">
                {dayEndSummary.cash && (
                  <div className="rounded-xl p-3 mb-1" style={{background:"rgba(16,185,129,0.08)",border:"1px solid rgba(16,185,129,0.25)"}}>
                    <div className="flex items-center gap-2 mb-2">
                      <Banknote className="h-4 w-4" style={{color:"#10b981"}}/>
                      <p className="text-xs font-bold" style={{color:"#10b981"}}>Cash Drawer</p>
                      {dayEndSummary.cash.shiftOpen && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full" style={{background:"rgba(16,185,129,0.2)",color:"var(--pos-success-soft)"}}>Shift open</span>
                      )}
                    </div>
                    {[
                      dayEndSummary.cash.openingFloat != null && ["Opening balance", dayEndSummary.cash.openingFloat],
                      ["Cash sales (net in drawer)", dayEndSummary.cash.cashSalesNet],
                      dayEndSummary.cash.cashTendered > 0 && ["Cash received (gross)", dayEndSummary.cash.cashTendered],
                      dayEndSummary.cash.changeGiven > 0 && ["Change given", dayEndSummary.cash.changeGiven],
                      dayEndSummary.cash.cashIn > 0 && ["Cash in", dayEndSummary.cash.cashIn],
                      (dayEndSummary.cash.cashExpenses ?? 0) > 0 && ["Cash expenses", dayEndSummary.cash.cashExpenses!],
                      (dayEndSummary.cash.cashSupplierPayments ?? dayEndSummary.cashSupplierPayments ?? 0) > 0 && ["Supplier payments (cash)", dayEndSummary.cash.cashSupplierPayments ?? dayEndSummary.cashSupplierPayments ?? 0],
                      dayEndSummary.cash.cashOut > 0 && ["Total cash out", dayEndSummary.cash.cashOut],
                      dayEndSummary.cash.refunds > 0 && ["Refunds", dayEndSummary.cash.refunds],
                    ].filter(Boolean).map((row) => {
                      const [label, amt] = row as [string, number];
                      return (
                        <div key={label} className="flex justify-between text-xs py-0.5">
                          <span style={{color:"var(--pos-muted)"}}>{label}</span>
                          <span className="font-bold text-white tabular-nums">LKR {formatNumber(amt)}</span>
                        </div>
                      );
                    })}
                    {dayEndSummary.cash.expectedInDrawer != null && (
                      <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t" style={{borderColor:"rgba(16,185,129,0.2)"}}>
                        <span style={{color:"#10b981"}}>Expected cash total</span>
                        <span style={{color:"#10b981"}} className="tabular-nums">LKR {formatNumber(dayEndSummary.cash.expectedInDrawer)}</span>
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Day income", val: dayEndSummary.income ?? dayEndSummary.totalRevenue, color: "#4f6ef7" },
                    { label: "Day expenses", val: dayEndSummary.expenses ?? 0, color: "var(--pos-warn)" },
                    { label: "Supplier paid", val: dayEndSummary.supplierPayments ?? 0, color: "#ef4444" },
                  ].map((r) => (
                    <div key={r.label} className="rounded-lg p-2.5 text-center" style={{ background: "var(--pos-card)", border: "1px solid var(--pos-border)" }}>
                      <p className="text-[9px] uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>{r.label}</p>
                      <p className="text-xs font-bold tabular-nums mt-1" style={{ color: r.color }}>LKR {formatNumber(r.val)}</p>
                    </div>
                  ))}
                </div>

                {[{label:"Total Sales",val:String(dayEndSummary.totalSales),color:"var(--pos-text)"},{label:"Gross Revenue",val:`LKR ${formatNumber(dayEndSummary.totalRevenue)}`,color:"#4f6ef7"},{label:"Net (income − expenses)",val:`LKR ${formatNumber(dayEndSummary.netIncome ?? (dayEndSummary.totalRevenue - (dayEndSummary.expenses ?? 0)))}`,color:"#10b981"},{label:"Tax Collected",val:`LKR ${formatNumber(dayEndSummary.totalTax)}`,color:"var(--pos-warn)"},{label:"Total Discount",val:`LKR ${formatNumber(dayEndSummary.totalDiscount)}`,color:"#10b981"}].map(r=>(
                  <div key={r.label} className="flex justify-between py-1.5 border-b" style={{borderColor:"var(--pos-border)"}}>
                    <span className="text-xs" style={{color:"var(--pos-muted)"}}>{r.label}</span>
                    <span className="text-sm font-bold" style={{color:r.color}}>{r.val}</span>
                  </div>
                ))}
                {Object.entries(dayEndSummary.byPaymentMethod).length>0&&(
                  <div className="pt-1">
                    <p className="text-xs font-semibold mb-2" style={{color:"var(--pos-muted)"}}>By Payment Method</p>
                    {Object.entries(dayEndSummary.byPaymentMethod).map(([method,amt])=>(
                      <div key={method} className="flex justify-between text-xs py-1">
                        <span className="text-white">{method.replace(/_/g, " ")}</span>
                        <span className="font-bold tabular-nums" style={{color: method === "CASH" ? "#10b981" : "#4f6ef7"}}>LKR {formatNumber(amt)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-3 pt-0 space-y-2">
                {dayEndSummary.cash?.shiftOpen && (
                  <button
                    type="button"
                    onClick={() => { setShowDayEnd(false); setShowCashClose(true); }}
                    className="w-full h-10 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2"
                    style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
                  >
                    <Banknote className="h-4 w-4" /> Count & Close Shift
                  </button>
                )}
                <button onClick={()=>setShowDayEnd(false)} className="w-full h-10 rounded-xl text-sm font-bold text-white" style={{background:"linear-gradient(135deg,#4f6ef7,#7c3aed)"}}>Done</button>
                <button
                  type="button"
                  onClick={() => {
                    const html = `<!DOCTYPE html><html><body style="font-family:monospace;padding:16px"><h2>Cashier Shift Summary</h2><p>${dayEndSummary.date}</p><p>Sales: ${dayEndSummary.totalSales}</p><p>Revenue: LKR ${Number(dayEndSummary.totalRevenue).toFixed(2)}</p><p>Tax: LKR ${Number(dayEndSummary.totalTax).toFixed(2)}</p><p>Discount: LKR ${Number(dayEndSummary.totalDiscount).toFixed(2)}</p>${dayEndSummary.cash?.expectedInDrawer!=null?`<p>Expected drawer: LKR ${Number(dayEndSummary.cash.expectedInDrawer).toFixed(2)}</p>`:""}<script>window.print()</script></body></html>`;
                    const w = window.open("", "_blank", "width=420,height=600");
                    if (w) { w.document.write(html); w.document.close(); }
                  }}
                  className="w-full h-10 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 border"
                  style={{ borderColor: "var(--pos-border)", color: "var(--pos-text-secondary)" }}
                >
                  <Printer className="h-4 w-4" /> Print Shift Summary
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>

        {/* CUSTOMER SEARCH — now inline dropdown in cart panel */}

        {/* HELD BILLS MODAL */}
        <AnimatePresence>{showHeldBills&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)"}} onClick={()=>setShowHeldBills(false)}>
            <motion.div initial={{scale:0.95,y:12}} animate={{scale:1,y:0}} exit={{scale:0.95,y:12}} onClick={e=>e.stopPropagation()} className="rounded-2xl border shadow-2xl w-full max-w-3xl overflow-hidden max-h-[85vh] flex flex-col" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)"}}>
              <div className="flex items-center justify-between p-4 border-b shrink-0" style={{borderColor:"var(--pos-border)"}}>
                <div className="flex items-center gap-2">
                  <PauseCircle className="h-4 w-4" style={{color:"var(--pos-warn)"}}/>
                  <h2 className="text-white font-bold text-sm">Held Bills ({serverHeldBills.length})</h2>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={()=>void loadHeldBills()} className="h-8 px-3 rounded-lg text-xs font-semibold border" style={{borderColor:"var(--pos-border)",color:"var(--pos-muted)"}}>
                    <RefreshCw className={cn("h-3.5 w-3.5 inline mr-1",holdsLoading&&"animate-spin")}/>Refresh
                  </button>
                  <button onClick={()=>{if(items.length>0){void handleHoldBill();setShowHeldBills(false);}else toast.info("Cart is empty");}} className="h-8 px-3 rounded-lg text-xs font-bold text-white" style={{background:"#4f6ef7"}}>
                    Hold current
                  </button>
                  <button onClick={()=>setShowHeldBills(false)} className="p-1.5 rounded-lg hover:bg-white/10"><X className="h-4 w-4" style={{color:"var(--pos-muted)"}}/></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {holdsLoading?(<div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" style={{color:"#4f6ef7"}}/></div>):serverHeldBills.length===0?(
                  <div className="flex flex-col items-center justify-center py-12" style={{color:"var(--pos-muted-2)"}}>
                    <PauseCircle className="h-12 w-12 mb-2 opacity-20"/>
                    <p className="text-sm">No bills on hold</p>
                    <p className="text-xs mt-1">Press F3 to hold the current cart</p>
                  </div>
                ):(
                  <div className="grid gap-3" style={{gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))"}}>
                    {serverHeldBills.map((bill,idx)=>{
                      const billItems = bill.data?.items ?? [];
                      const billTotal = billItems.reduce((a,i)=>a+i.unitPrice*i.quantity,0);
                      const kbFocus = focusedHeldIdx === idx;
                      return (
                        <div key={bill.id} className="rounded-xl border p-3 flex flex-col gap-2" style={{background:"var(--pos-card)",borderColor:kbFocus?"#4f6ef7":"var(--pos-border)",boxShadow:kbFocus?"0 0 0 2px rgba(79,110,247,0.35)":"none"}}>
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-white text-xs font-bold">{bill.label ?? `Bill #${serverHeldBills.length-idx}`}</p>
                              <p className="text-[10px]" style={{color:"var(--pos-muted)"}}>{new Date(bill.createdAt).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})} · {billItems.length} item(s)</p>
                            </div>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{background:"var(--pos-warn-bg)",color:"var(--pos-warn)"}}>Reserved</span>
                          </div>
                          {bill.data?.customer&&<div className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{background:"rgba(79,110,247,0.1)"}}><User className="h-3 w-3" style={{color:"#4f6ef7"}}/><span className="text-xs text-white">{bill.data.customer.name}</span></div>}
                          <div className="space-y-0.5">{billItems.slice(0,3).map(i=><div key={i.variantId} className="flex justify-between text-[10px]"><span className="truncate flex-1 mr-2" style={{color:"var(--pos-text-secondary)"}}>{i.productName} ×{i.quantity}</span><span className="font-mono" style={{color:"var(--pos-muted)"}}>LKR {formatNumber(i.unitPrice*i.quantity)}</span></div>)}{billItems.length>3&&<p className="text-[10px]" style={{color:"var(--pos-muted-2)"}}>+{billItems.length-3} more</p>}</div>
                          <div className="flex items-center justify-between pt-1 border-t" style={{borderColor:"var(--pos-border)"}}>
                            <span className="text-white text-sm font-bold">LKR {formatNumber(billTotal)}</span>
                            <div className="flex gap-2">
                              <button onClick={()=>void handleDeleteHeldBill(bill.id)} className="px-2.5 h-7 rounded-lg text-[11px] font-semibold" style={{background:"rgba(239,68,68,0.15)",color:"#ef4444"}}>Delete</button>
                              <button onClick={()=>{void handleRestoreHeldBill(bill);setShowHeldBills(false);}} className="px-2.5 h-7 rounded-lg text-[11px] font-bold text-white" style={{background:"#10b981"}}>Restore</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>

        {/* SHORTCUTS */}
        <AnimatePresence>{showShortcuts&&(
          <motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{background:"rgba(0,0,0,0.7)"}} onClick={()=>setShowShortcuts(false)}>
            <motion.div initial={{scale:0.95}} animate={{scale:1}} exit={{scale:0.95}} onClick={e=>e.stopPropagation()} className="rounded-2xl border shadow-2xl w-full max-w-3xl p-5 max-h-[88vh] overflow-y-auto" style={{background:"var(--pos-panel)",borderColor:"var(--pos-border)"}}>
              <div className="flex items-center justify-between mb-4 sticky top-0 z-10 pb-2" style={{background:"var(--pos-panel)"}}>
                <div className="flex items-center gap-2">
                  <Keyboard className="h-4 w-4" style={{color:"#4f6ef7"}}/>
                  <span className="text-white font-bold text-sm">Keyboard — full POS</span>
                </div>
                <button onClick={()=>setShowShortcuts(false)} className="p-1 rounded hover:bg-white/10"><X className="h-4 w-4" style={{color:"var(--pos-muted)"}}/></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-5">
                {POS_SHORTCUT_SECTIONS.map((section) => (
                  <div key={section.title}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{color:"var(--pos-muted)"}}>{section.title}</p>
                    <div className="space-y-1">
                      {section.items.map(([k, d]) => (
                        <div key={`${section.title}-${k}`} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-white/5 gap-3">
                          <kbd className="text-[10px] font-mono font-bold rounded px-2 py-0.5 shrink-0" style={{background:"var(--pos-input)",color:"var(--pos-text-secondary)",border:"1px solid var(--pos-border)"}}>{k}</kbd>
                          <span className="text-xs text-right flex-1" style={{color:"#94a3b8"}}>{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] mt-4 text-center" style={{color:"var(--pos-muted-2)"}}>Tip: Ctrl+Enter = Pay Cash instantly · F9 = checkout popup</p>
            </motion.div>
          </motion.div>
        )}</AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
