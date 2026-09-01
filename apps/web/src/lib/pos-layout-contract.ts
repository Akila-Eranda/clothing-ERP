/**
 * POS layout contract — every layout id shares ONE feature surface: pos-overlay.tsx
 *
 * Layout components (pos-products-panel, pos-cart-panel, pos-layouts.css) may ONLY change:
 * - Category bar geometry (horizontal / vertical / compact)
 * - Product card shape (classic / image-top / square)
 * - Cart line presentation (rows / table)
 * - Cart header label, pay button stack, checkout bill width
 *
 * These features MUST stay in pos-overlay.tsx for ALL layouts (never fork per layout):
 */
export const POS_OVERLAY_SHARED_FEATURES = [
  "Barcode scan & product search (F2)",
  "Shift gate & opening cash",
  "PIN lock / cashier switch (F12)",
  "Sidebar nav (products, customers, hold, reload, GRN, expenses, returns, warranty, vouchers, orders, reports, settings)",
  "Top bar — hold bill (F3), held bills (F8), reload (L), customer (F4)",
  "Keyboard shortcuts (use-pos-keyboard)",
  "Add-to-cart qty popup",
  "Cart — customer picker, line qty edit, cart discount, totals, pay cash, checkout (F9)",
  "Checkout modal — all payment methods, split/partial, coupon, loyalty, gift voucher, cheque, bank QR",
  "Hold / restore / split bill",
  "Reload panel",
  "Quick product & demo product modals",
  "Cash close & transfer funds",
  "Day end, sales report",
  "Customer display screen",
  "Receipt print & WhatsApp bill",
  "Thank-you / change screen",
  "In-POS settings (touch, sound, colors, card size, tax)",
  "Customer register modal",
  "Retail feature bar — all sidebar modules as quick pills (Retail 1–5)",
] as const;

export type PosOverlaySharedFeature = (typeof POS_OVERLAY_SHARED_FEATURES)[number];

/** Layout shells must not reimplement checkout/hold logic — overlay only. */
export const POS_LAYOUT_BRAIN = "pos-overlay.tsx" as const;
