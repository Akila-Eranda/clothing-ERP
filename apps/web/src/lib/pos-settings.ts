import type { PosLayoutId } from "@/lib/pos-layouts";

/** POS terminal UX settings (per device localStorage). */

export const POS_TAX_RATE_KEY = "pos_tax_rate";
export const POS_TOUCH_MODE_KEY = "pos_touch_mode";
export const POS_SOUND_ALERTS_KEY = "pos_sound_alerts";
export const POS_QTY_POPUP_KEY = "pos_qty_popup";
export const POS_ALLOW_NEGATIVE_STOCK_KEY = "pos_allow_negative_stock";
export const POS_WA_BILL_OFFER_KEY = "pos_wa_bill_offer";
export const POS_TAX_SAVED_KEY = "pos_tax_rate_saved";
export const POS_CART_WIDTH_KEY = "pos_cart_width";
export const POS_PRODUCT_CARD_SIZE_KEY = "pos_product_card_size";

export const POS_CART_WIDTH_PRESETS = [
  { id: "compact", label: "S", px: 360 },
  { id: "normal", label: "M", px: 420 },
  { id: "wide", label: "L", px: 520 },
  { id: "xl", label: "XL", px: 620 },
] as const;

export const POS_CART_WIDTH_MIN = 320;
export const POS_CART_WIDTH_MAX = 720;
export const POS_CART_WIDTH_DEFAULT = 420;

export type PosProductCardSizeId = "xs" | "s" | "m" | "l" | "xl";

export type PosProductCardSizeConfig = {
  id: PosProductCardSizeId;
  label: string;
  /** Grid minmax min width (px) */
  min: number;
  gap: number;
  titlePx: number;
  subPx: number;
  pricePx: number;
  padPx: number;
  iconPx: number;
};

export const POS_PRODUCT_CARD_SIZE_PRESETS: readonly PosProductCardSizeConfig[] = [
  { id: "xs", label: "XS", min: 118, gap: 6, titlePx: 11, subPx: 10, pricePx: 13, padPx: 6, iconPx: 28 },
  { id: "s", label: "S", min: 140, gap: 8, titlePx: 12, subPx: 10, pricePx: 14, padPx: 8, iconPx: 32 },
  { id: "m", label: "M", min: 165, gap: 8, titlePx: 14, subPx: 12, pricePx: 16, padPx: 8, iconPx: 40 },
  { id: "l", label: "L", min: 200, gap: 10, titlePx: 15, subPx: 12, pricePx: 18, padPx: 10, iconPx: 44 },
  { id: "xl", label: "XL", min: 240, gap: 12, titlePx: 16, subPx: 13, pricePx: 20, padPx: 12, iconPx: 48 },
] as const;

export const POS_PRODUCT_CARD_SIZE_DEFAULT: PosProductCardSizeId = "m";

export function resolvePosProductCardSize(id?: string | null): PosProductCardSizeConfig {
  const found = POS_PRODUCT_CARD_SIZE_PRESETS.find((p) => p.id === id);
  return found ?? POS_PRODUCT_CARD_SIZE_PRESETS.find((p) => p.id === POS_PRODUCT_CARD_SIZE_DEFAULT)!;
}

export function readPosProductCardSize(): PosProductCardSizeId {
  if (typeof window === "undefined") return POS_PRODUCT_CARD_SIZE_DEFAULT;
  const raw = localStorage.getItem(POS_PRODUCT_CARD_SIZE_KEY);
  if (raw === "xs" || raw === "s" || raw === "m" || raw === "l" || raw === "xl") return raw;
  return POS_PRODUCT_CARD_SIZE_DEFAULT;
}

export function writePosProductCardSize(id: PosProductCardSizeId): PosProductCardSizeId {
  const next = resolvePosProductCardSize(id).id;
  if (typeof window !== "undefined") {
    localStorage.setItem(POS_PRODUCT_CARD_SIZE_KEY, next);
  }
  return next;
}

/** CSS vars for product card sizing — apply on POS shell. */
export function posProductCardSizeVars(id?: string | null): Record<string, string> {
  const s = resolvePosProductCardSize(id);
  return {
    "--pos-product-min": `${s.min}px`,
    "--pos-product-gap": `${s.gap}px`,
    "--pos-product-title-size": `${s.titlePx}px`,
    "--pos-product-sub-size": `${s.subPx}px`,
    "--pos-product-price-size": `${s.pricePx}px`,
    "--pos-product-pad": `${s.padPx}px`,
    "--pos-product-icon": `${s.iconPx}px`,
  };
}

export function readPosCartWidth(): number {
  if (typeof window === "undefined") return POS_CART_WIDTH_DEFAULT;
  const raw = localStorage.getItem(POS_CART_WIDTH_KEY);
  if (raw === null) return POS_CART_WIDTH_DEFAULT;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return POS_CART_WIDTH_DEFAULT;
  return Math.min(POS_CART_WIDTH_MAX, Math.max(POS_CART_WIDTH_MIN, n));
}

export function writePosCartWidth(px: number): number {
  const v = Math.min(POS_CART_WIDTH_MAX, Math.max(POS_CART_WIDTH_MIN, Math.round(px)));
  if (typeof window !== "undefined") {
    localStorage.setItem(POS_CART_WIDTH_KEY, String(v));
  }
  return v;
}

function readBool(key: string, fallback = false): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "1" || raw === "true";
}

function writeBool(key: string, value: boolean): boolean {
  if (typeof window !== "undefined") {
    localStorage.setItem(key, value ? "1" : "0");
  }
  return value;
}

export function readPosTaxRate(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(POS_TAX_RATE_KEY);
  if (raw === null) return 0;
  const n = parseFloat(raw);
  if (Number.isNaN(n)) return 0;
  return Math.min(100, Math.max(0, n));
}

export function writePosTaxRate(rate: number): number {
  const v = Math.min(100, Math.max(0, rate));
  if (typeof window !== "undefined") {
    localStorage.setItem(POS_TAX_RATE_KEY, String(v));
  }
  return v;
}

export function readPosTouchMode(): boolean {
  return readBool(POS_TOUCH_MODE_KEY, false);
}

export function writePosTouchMode(on: boolean): boolean {
  return writeBool(POS_TOUCH_MODE_KEY, on);
}

export function readPosSoundAlerts(): boolean {
  return readBool(POS_SOUND_ALERTS_KEY, true);
}

export function writePosSoundAlerts(on: boolean): boolean {
  return writeBool(POS_SOUND_ALERTS_KEY, on);
}

export function readPosQtyPopup(): boolean {
  return readBool(POS_QTY_POPUP_KEY, false);
}

export function writePosQtyPopup(on: boolean): boolean {
  return writeBool(POS_QTY_POPUP_KEY, on);
}

export function readPosAllowNegativeStock(): boolean {
  return readBool(POS_ALLOW_NEGATIVE_STOCK_KEY, true);
}

export function writePosAllowNegativeStock(on: boolean): boolean {
  return writeBool(POS_ALLOW_NEGATIVE_STOCK_KEY, on);
}

/** After-sale WhatsApp bill popup (per terminal). Default ON. */
export function readPosWaBillOffer(): boolean {
  return readBool(POS_WA_BILL_OFFER_KEY, true);
}

export function writePosWaBillOffer(on: boolean): boolean {
  return writeBool(POS_WA_BILL_OFFER_KEY, on);
}

/** Remember last non-zero tax % so checkout can toggle tax back on. */
export function readPosSavedTaxRate(): number {
  if (typeof window === "undefined") return 0;
  const raw = localStorage.getItem(POS_TAX_SAVED_KEY);
  if (raw === null) return 0;
  const n = parseFloat(raw);
  if (Number.isNaN(n) || n <= 0) return 0;
  return Math.min(100, n);
}

export function writePosSavedTaxRate(rate: number): number {
  const v = Math.min(100, Math.max(0, rate));
  if (typeof window !== "undefined" && v > 0) {
    localStorage.setItem(POS_TAX_SAVED_KEY, String(v));
  }
  return v;
}

export type PosTenantSettings = {
  allowNegativeStock: boolean;
  autoPrint: boolean;
  roundOff: boolean;
  loyalty: boolean;
  reloadEnabled?: boolean;
  /** Tenant default POS screen layout — admin selects in Settings → POS */
  posLayout?: PosLayoutId;
};
