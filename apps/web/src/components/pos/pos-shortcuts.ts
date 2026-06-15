/** POS keyboard shortcut reference — shown in F1 help panel */

export const POS_SHORTCUT_SECTIONS: { title: string; items: [string, string][] }[] = [
  {
    title: "Navigation",
    items: [
      ["F2 / P", "Focus product search"],
      ["/  Ctrl+F", "Focus search"],
      ["Alt+1 … 9", "Switch sidebar tab"],
      ["O", "Orders tab"],
      ["G", "Settings tab"],
      ["← →", "Previous / next tab"],
      ["Esc", "Back · close modal · exit POS"],
    ],
  },
  {
    title: "Products & cart",
    items: [
      ["Enter (search)", "Add first search result"],
      ["Ctrl+↑↓←→", "Move product grid focus"],
      ["Enter", "Add focused product / open checkout"],
      ["↑ ↓", "Select cart line"],
      ["+ / -", "Increase / decrease qty"],
      ["Del", "Remove cart line"],
      ["F5", "Refresh products"],
      ["[ / ]", "Previous / next category"],
    ],
  },
  {
    title: "Customers & holds",
    items: [
      ["F4 / U", "Customer search"],
      ["N", "Register new customer (Customers tab)"],
      ["X", "Remove customer from bill"],
      ["F3", "Hold current bill"],
      ["F8", "Restore latest held bill"],
      ["↑↓ Enter (Holds tab)", "Navigate · restore held bill"],
    ],
  },
  {
    title: "Checkout & payment",
    items: [
      ["C / F9", "Open checkout · confirm payment"],
      ["Tab", "Next payment method"],
      ["Shift+Tab", "Previous payment method"],
      ["1 – 5", "Cash · Card · UPI · Wallet · Credit"],
      ["0–9 · .", "Cash numpad (Cash selected)"],
      ["Backspace", "Delete numpad digit"],
      ["D", "Focus discount field"],
      ["S", "Split selected line to hold"],
    ],
  },
  {
    title: "Other",
    items: [
      ["F6", "Returns tab"],
      ["F7", "Clear cart"],
      ["F10", "Print pre-bill"],
      ["F11", "Day end report"],
      ["F12", "Lock screen"],
      ["F1 / ?", "Keyboard help"],
    ],
  },
];

export const PRODUCT_GRID_COLS = 4;
