import type { CartItem, Customer } from "@/types";
import {
  calcPosAmountDue,
  calcPosSubtotal,
  calcPosTaxAmount,
  calcTierDiscount,
  type PosLineInput,
} from "@/lib/pos-totals";
import { calculateDiscount } from "@/lib/utils";

export type CustomerDisplayPhase = "idle" | "shopping" | "checkout" | "thankyou" | "waiting";

export interface CustomerDisplayItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  imageUrl?: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  /** Gross before line discount (unitPrice × qty). */
  lineGross?: number;
  /** Line-level discount amount. */
  lineDiscount?: number;
}

export interface CustomerDisplayState {
  updatedAt: number;
  phase: CustomerDisplayPhase;
  shopName: string;
  tagline: string;
  logoUrl: string;
  currency: string;
  items: CustomerDisplayItem[];
  customerName?: string;
  itemCount: number;
  /** Gross merchandise total before any discounts. */
  subtotal: number;
  /** All discounts combined (item + cart % + coupon + tier + loyalty). */
  discount: number;
  /** Cart-level % when applied (e.g. 10). */
  discountPercent?: number;
  /** Breakdown for richer UI. */
  itemDiscount?: number;
  cartDiscount?: number;
  tax: number;
  taxRate: number;
  total: number;
  lastAdded?: CustomerDisplayItem;
  invoiceNumber?: string;
  changeDue?: number;
  cashTendered?: number;
  paymentMethod?: string;
}

const CHANNEL = "hexaone-pos-customer-display";
const LS_KEY = "hexaone-pos-customer-display-state";

function lineDiscountAmt(item: CartItem) {
  const gross = item.unitPrice * item.quantity;
  const disc =
    item.discountType === "percentage"
      ? (gross * (item.discountAmount ?? 0)) / 100
      : (item.discountAmount ?? 0);
  return Math.max(0, disc);
}

function lineTotal(item: CartItem) {
  return item.unitPrice * item.quantity - lineDiscountAmt(item);
}

export function buildCustomerDisplayState(input: {
  phase: CustomerDisplayPhase;
  shopName: string;
  tagline: string;
  logoUrl: string;
  currency: string;
  items: CartItem[];
  customer: Customer | null;
  manualDiscount: number;
  manualDiscountType: "percentage" | "fixed";
  couponDiscount: number;
  loyaltyPoints: number;
  taxRate: number;
  productImages?: Map<string, string | undefined>;
  lastAddedVariantId?: string;
  invoiceNumber?: string;
  changeDue?: number;
  cashTendered?: number;
  paymentMethod?: string;
  saleTotal?: number;
}): CustomerDisplayState {
  const posLines = input.items as PosLineInput[];
  const netSub = calcPosSubtotal(posLines);
  const tax = calcPosTaxAmount(posLines, input.taxRate);
  const itemDisc = input.items.reduce((sum, i) => sum + lineDiscountAmt(i), 0);
  const grossSub = netSub + itemDisc;
  const cartDisc = calculateDiscount(netSub, input.manualDiscount, input.manualDiscountType);
  const tierDisc = calcTierDiscount(netSub, input.customer?.membershipTier);
  const loyaltyDisc = input.loyaltyPoints * 0.1;
  const cartLevelDisc = cartDisc + input.couponDiscount + tierDisc + loyaltyDisc;
  const totalDiscount = itemDisc + cartLevelDisc;
  const total =
    input.saleTotal ??
    calcPosAmountDue(posLines, {
      manualDiscount: input.manualDiscount,
      manualDiscountType: input.manualDiscountType,
      couponDiscount: input.couponDiscount,
      tierDiscount: tierDisc,
      loyaltyPoints: input.loyaltyPoints,
      posTaxRate: input.taxRate,
    });

  const displayItems: CustomerDisplayItem[] = input.items.map((item) => {
    const gross = item.unitPrice * item.quantity;
    const disc = lineDiscountAmt(item);
    return {
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      imageUrl: input.productImages?.get(item.variantId) ?? item.image,
      unitPrice: item.unitPrice,
      quantity: item.quantity,
      lineTotal: gross - disc,
      lineGross: gross,
      lineDiscount: disc,
    };
  });

  const lastAdded = input.lastAddedVariantId
    ? displayItems.find((i) => i.variantId === input.lastAddedVariantId) ??
      displayItems[displayItems.length - 1]
    : displayItems[displayItems.length - 1];

  return {
    updatedAt: Date.now(),
    phase: input.phase,
    shopName: input.shopName,
    tagline: input.tagline,
    logoUrl: input.logoUrl,
    currency: input.currency,
    items: displayItems,
    customerName: input.customer?.name,
    itemCount: input.items.reduce((n, i) => n + i.quantity, 0),
    subtotal: grossSub,
    discount: totalDiscount,
    discountPercent:
      input.manualDiscountType === "percentage" && input.manualDiscount > 0
        ? input.manualDiscount
        : undefined,
    itemDiscount: itemDisc,
    cartDiscount: cartLevelDisc,
    tax,
    taxRate: input.taxRate,
    total,
    lastAdded: lastAdded && input.items.length > 0 ? lastAdded : undefined,
    invoiceNumber: input.invoiceNumber,
    changeDue: input.changeDue,
    cashTendered: input.cashTendered,
    paymentMethod: input.paymentMethod,
  };
}

export function publishCustomerDisplayState(state: CustomerDisplayState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    /* quota */
  }
  if (typeof BroadcastChannel !== "undefined") {
    const ch = new BroadcastChannel(CHANNEL);
    ch.postMessage(state);
    ch.close();
  }
}

export function readCustomerDisplayState(): CustomerDisplayState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? (JSON.parse(raw) as CustomerDisplayState) : null;
  } catch {
    return null;
  }
}

export function subscribeCustomerDisplayState(
  onState: (state: CustomerDisplayState) => void,
): () => void {
  if (typeof window === "undefined") return () => {};

  const cached = readCustomerDisplayState();
  if (cached) onState(cached);

  const ch =
    typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(CHANNEL) : null;

  const onMessage = (event: MessageEvent<CustomerDisplayState>) => {
    if (event.data?.updatedAt) onState(event.data);
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key !== LS_KEY || !event.newValue) return;
    try {
      onState(JSON.parse(event.newValue) as CustomerDisplayState);
    } catch {
      /* ignore */
    }
  };

  ch?.addEventListener("message", onMessage);
  window.addEventListener("storage", onStorage);

  return () => {
    ch?.removeEventListener("message", onMessage);
    ch?.close();
    window.removeEventListener("storage", onStorage);
  };
}

export const CUSTOMER_DISPLAY_PATH = "/pos/customer-display";
export const CUSTOMER_DISPLAY_WINDOW_NAME = "hexaone-customer-display";

let customerDisplayWindow: Window | null = null;

export function getCustomerDisplayUrl(): string {
  if (typeof window === "undefined") return CUSTOMER_DISPLAY_PATH;
  return `${window.location.origin}${CUSTOMER_DISPLAY_PATH}`;
}

/** Open/focus customer display. Call synchronously from a user click handler. */
export function openCustomerDisplayFromClick(
  event?: { preventDefault?: () => void },
): "opened" | "focused" | "fallback" {
  if (typeof window === "undefined") return "fallback";

  const url = getCustomerDisplayUrl();

  if (customerDisplayWindow && !customerDisplayWindow.closed) {
    event?.preventDefault?.();
    customerDisplayWindow.focus();
    return "focused";
  }

  const features =
    "popup=yes,width=1280,height=800,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes";
  const win = window.open(url, CUSTOMER_DISPLAY_WINDOW_NAME, features);
  if (win) {
    event?.preventDefault?.();
    customerDisplayWindow = win;
    try {
      win.focus();
    } catch {
      /* noop */
    }
    return "opened";
  }

  // Allow native <a target="_blank"> navigation — not treated as a blocked popup.
  return "fallback";
}

/** @deprecated Prefer openCustomerDisplayFromClick from a link click handler. */
export function openCustomerDisplayWindow() {
  const result = openCustomerDisplayFromClick();
  if (result === "fallback") return null;
  return customerDisplayWindow;
}
