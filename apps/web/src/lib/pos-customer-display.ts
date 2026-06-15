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
  subtotal: number;
  discount: number;
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

function lineTotal(item: CartItem) {
  const gross = item.unitPrice * item.quantity;
  const disc =
    item.discountType === "percentage"
      ? (gross * item.discountAmount) / 100
      : item.discountAmount;
  return gross - disc;
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
  const sub = calcPosSubtotal(posLines);
  const tax = calcPosTaxAmount(posLines, input.taxRate);
  const manualDisc = calculateDiscount(sub, input.manualDiscount, input.manualDiscountType);
  const tierDisc = calcTierDiscount(sub, input.customer?.membershipTier);
  const loyaltyDisc = input.loyaltyPoints * 0.1;
  const totalDiscount = manualDisc + input.couponDiscount + tierDisc + loyaltyDisc;
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

  const displayItems: CustomerDisplayItem[] = input.items.map((item) => ({
    variantId: item.variantId,
    productName: item.productName,
    variantName: item.variantName,
    sku: item.sku,
    imageUrl: input.productImages?.get(item.variantId) ?? item.image,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    lineTotal: lineTotal(item),
  }));

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
    subtotal: sub,
    discount: totalDiscount,
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

export function openCustomerDisplayWindow() {
  if (typeof window === "undefined") return null;
  const features = "noopener,noreferrer,width=1280,height=800,menubar=no,toolbar=no";
  return window.open(
    `${window.location.origin}${CUSTOMER_DISPLAY_PATH}`,
    "hexaone-customer-display",
    features,
  );
}
