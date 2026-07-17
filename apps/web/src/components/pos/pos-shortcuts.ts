/** POS keyboard shortcut reference — shown in F1 help panel */

export const POS_SHORTCUT_SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: "Navigation",
    items: [
      ["F1 / ?", "Keyboard help (this panel)"],
      ["F2 / P / /", "Focus barcode / product search"],
      ["Ctrl+B", "Focus barcode search"],
      ["Ctrl+F", "Focus search"],
      ["Alt+1 … 9", "Sidebar tab by number (outside checkout)"],
      ["← →", "Previous / next sidebar tab (when search empty)"],
      ["F3–F12", "Always work — even while search is focused"],
      ["Esc", "Close popup → exit POS"],
    ],
  },
  {
    title: "Add product popup",
    items: [
      ["← →", "Pick same-barcode item / variant"],
      ["↑ ↓", "Quantity up / down"],
      ["Q / P", "Focus quantity / sale price"],
      ["Enter", "Add to cart"],
      ["Esc", "Close popup"],
    ],
  },
  {
    title: "Products & cart",
    items: [
      ["Enter (search)", "Add focused / first match · scan barcode"],
      ["↑ ↓ (search)", "Navigate search results"],
      ["Ctrl+↑↓←→", "Move product grid focus"],
      ["Enter", "Add focused product"],
      ["↑ ↓", "Select cart line (search empty)"],
      ["+ / -", "Qty up / down on selected line"],
      ["F6", "Edit quantity (selected line)"],
      ["Del", "Remove selected cart line"],
      ["[ / ]", "Previous / next category"],
      ["Ctrl+Shift+C", "Clear cart"],
    ],
  },
  {
    title: "Customers & holds",
    items: [
      ["F4 / U", "Customer popup"],
      ["N", "Register new customer (in popup)"],
      ["X", "Remove customer from bill"],
      ["↑↓ Enter", "Pick customer in popup"],
      ["F3", "Hold current bill"],
      ["F8 / H", "Held bills / recent bills"],
      ["↑↓ Enter (holds)", "Navigate · restore held bill"],
      ["Del (holds)", "Delete focused held bill"],
    ],
  },
  {
    title: "Checkout & payment",
    items: [
      ["F7 / C", "Open payment options"],
      ["F9", "Open checkout · confirm payment"],
      ["Enter / F9", "Confirm payment (in checkout)"],
      ["Ctrl+Enter / Shift+F9", "Pay Cash instantly (no popup)"],
      ["Tab / Shift+Tab / ← →", "Cycle payment method"],
      ["1 – 5", "Pick method (when not on Cash)"],
      ["Alt+1 – 5", "Pick payment method anytime"],
      ["/ / C (checkout)", "Focus coupon field"],
      ["L (checkout)", "Toggle partial pay · focus amount"],
      ["Shift+S (checkout)", "Toggle split payment"],
      ["Ctrl+1 – 4 (checkout)", "Quick cash 500 / 1k / 2k / 5k"],
      ["0–9 · .", "Cash received amount (Cash selected)"],
      ["Backspace / Del", "Delete last cash digit"],
      ["F5 / D", "Focus discount %"],
      ["S", "Split selected line → hold"],
      ["F10", "Print pre-bill"],
    ],
  },
  {
    title: "POS tools (sidebar)",
    items: [
      ["Q", "New Product (quick add)"],
      ["O", "Orders (today’s sales)"],
      ["V", "Gift vouchers"],
      ["B", "Quick GRN"],
      ["E", "Quick expense"],
      ["R", "Returns"],
      ["W", "Warranty"],
      ["M", "Discounts & promotions"],
      ["T", "Sales reports"],
      ["G", "POS settings"],
    ],
  },
  {
    title: "Shift & lock",
    items: [
      ["F11", "Day end summary"],
      ["F12", "Lock POS (PIN) / exit if no PIN"],
      ["0–9 (lock)", "Enter PIN digits"],
      ["Esc (lock)", "Exit POS from lock screen"],
    ],
  },
];

export const PRODUCT_GRID_COLS = 4;

/** Payment methods cycle order for Tab / number keys in checkout */
export const POS_PAY_METHODS = [
  "CASH",
  "CARD",
  "CHEQUE",
  "CUSTOMER_CREDIT",
  "GIFT_VOUCHER",
] as const;

export type PosPayMethod = (typeof POS_PAY_METHODS)[number];
