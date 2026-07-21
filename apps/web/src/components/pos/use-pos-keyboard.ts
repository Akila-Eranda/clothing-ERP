"use client";

import * as React from "react";
import { toast } from "sonner";
import type { HeldBillData } from "@/stores/cart-store";
import { POS_PAY_METHODS, PRODUCT_GRID_COLS } from "./pos-shortcuts";

export type PosProductItem = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  unitPrice: number;
  costPrice: number;
  taxRate?: number;
  stock: number;
  category: string;
  color?: string;
  size?: string;
  material?: string;
  style?: string;
  imageUrl?: string;
};

export type PosCustomerRow = {
  id: string;
  name: string;
  phone: string;
  email?: string;
  tier?: string;
  loyaltyPoints: number;
  walletBalance: number;
  creditLimit: number;
  creditBalance: number;
};

export type PosHeldBill = {
  id: string;
  label?: string | null;
  data: HeldBillData;
  createdAt: string;
};

export interface PosKeyboardContext {
  posOpen: boolean;
  pinLocked: boolean;
  checkoutOpen: boolean;
  showShortcuts: boolean;
  showCustomerSearch: boolean;
  showHeldBills: boolean;
  showDayEnd: boolean;
  qtyPopupOpen: boolean;
  selectedProductName: string | null;
  activeNav: string;
  activePayment: string;
  itemsLength: number;
  selectedCartIdx: number;
  focusedProductIdx: number;
  focusedHeldIdx: number;
  focusedCustomerIdx: number;
  filteredProductsLength: number;
  serverHeldBillsLength: number;
  navItems: { id: string }[];
  categories: string[];
  activeCategory: string;
  customersLength: number;
  inlineCustomersLength: number;
  customerModalListLength: number;
  showNewCust: boolean;
  inCheckout: boolean;
  searchRef: React.RefObject<HTMLInputElement | null>;
  cartCustomerSearchRef?: React.RefObject<HTMLInputElement | null>;
  discountInputRef: React.RefObject<HTMLInputElement | null>;
  barcodeBuffer: React.MutableRefObject<string>;
  lastKeyTime: React.MutableRefObject<number>;
  barcodeTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
  setShowShortcuts: React.Dispatch<React.SetStateAction<boolean>>;
  setCheckoutOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedProductName: React.Dispatch<React.SetStateAction<string | null>>;
  setShowCustomerSearch: React.Dispatch<React.SetStateAction<boolean>>;
  setShowHeldBills: React.Dispatch<React.SetStateAction<boolean>>;
  setCustomerSearch: React.Dispatch<React.SetStateAction<string>>;
  setCustomers: React.Dispatch<React.SetStateAction<PosCustomerRow[]>>;
  setActiveNav: React.Dispatch<React.SetStateAction<string>>;
  setActivePayment: React.Dispatch<React.SetStateAction<string>>;
  setSelectedCartIdx: React.Dispatch<React.SetStateAction<number>>;
  setFocusedProductIdx: React.Dispatch<React.SetStateAction<number>>;
  setFocusedHeldIdx: React.Dispatch<React.SetStateAction<number>>;
  setFocusedCustomerIdx: React.Dispatch<React.SetStateAction<number>>;
  setActiveCategory: React.Dispatch<React.SetStateAction<string>>;
  setShowNewCust: React.Dispatch<React.SetStateAction<boolean>>;
  setShowDayEnd: React.Dispatch<React.SetStateAction<boolean>>;
  setPinLocked: React.Dispatch<React.SetStateAction<boolean>>;
  setPinEntry: React.Dispatch<React.SetStateAction<string>>;
  setPinError: React.Dispatch<React.SetStateAction<boolean>>;
  lockCashier: () => void;
  closePos: () => void;
  handlePinEntry: (key: string) => void;
  scanAndAddProduct: (code: string) => Promise<void>;
  handleSearchEnter: () => void;
  handleAddProduct: (p: PosProductItem) => void;
  handleCardClick: (p: PosProductItem) => void;
  handleNumpad: (key: string) => void;
  handleCheckout: (forceMethod?: string) => void | Promise<void>;
  handleHoldBill: () => void;
  handleRestoreHeldBill: (bill: PosHeldBill) => void;
  handleDeleteHeldBill: (id: string) => void;
  handleSplitBill: () => void;
  handleThermalPrint: () => void;
  handleDayEnd: () => void;
  loadProducts: () => void;
  clearCart: () => void;
  setCustomer: (customer: null) => void;
  updateQuantity: (variantId: string, qty: number) => void;
  removeItem: (variantId: string) => void;
  adjustSelectedQty: (delta: number) => void;
  removeSelectedCartItem: () => void;
  openQtyEditForSelected: () => void;
  closeQtyPopup: () => void;
  applyCustomer: (c: PosCustomerRow) => void;
  toggleCheckoutPartial: () => void;
  toggleCheckoutSplit: () => void;
  focusCheckoutCoupon: () => void;
  focusCheckoutPartialPay: () => void;
  setQuickCash: (amt: number) => void;
  payStateAllowPartial: boolean;
  payStateSplitMode: boolean;
  /** Cart customer dropdown (F4) */
  openCartCustomer: () => void;
  /** Close shift cash drawer */
  openCashClose: () => void;
  showCashClose: boolean;
  closeCashClose: () => void;
  /** WhatsApp send-bill modal after sale */
  waBillOfferOpen: boolean;
  closeWaBillOffer: () => void;
  sendWaBill: () => void;
  /** Fill cash tender = bill total */
  setExactCashTender: () => void;
  focusCheckoutGiftOrCheque: () => void;
  getFilteredProduct: (idx: number) => PosProductItem | undefined;
  getHeldBill: (idx: number) => PosHeldBill | undefined;
  getCustomerModalItem: (idx: number) => PosCustomerRow | undefined;
  getInlineCustomer: (idx: number) => PosCustomerRow | undefined;
}

function isInputFocused() {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

function anyModalOpen(ctx: PosKeyboardContext) {
  return (
    ctx.checkoutOpen
    || ctx.showCustomerSearch
    || ctx.showHeldBills
    || ctx.showShortcuts
    || ctx.showDayEnd
    || ctx.showCashClose
    || ctx.waBillOfferOpen
    || ctx.qtyPopupOpen
    || !!ctx.selectedProductName
  );
}

function navigateToNavItem(ctx: PosKeyboardContext, id: string) {
  if (id === "hold-bills") {
    ctx.setShowHeldBills(true);
    ctx.setActiveNav("products");
    return;
  }
  if (id === "customers") {
    ctx.setShowCustomerSearch(false);
  }
  ctx.setActiveNav(id);
}

function cycleNav(ctx: PosKeyboardContext, delta: number) {
  const idx = ctx.navItems.findIndex((n) => n.id === ctx.activeNav);
  const next = (idx + delta + ctx.navItems.length) % ctx.navItems.length;
  navigateToNavItem(ctx, ctx.navItems[next].id);
}

function cyclePayment(ctx: PosKeyboardContext, delta: number) {
  const i = POS_PAY_METHODS.indexOf(ctx.activePayment as (typeof POS_PAY_METHODS)[number]);
  const base = i < 0 ? 0 : i;
  const next = (base + delta + POS_PAY_METHODS.length) % POS_PAY_METHODS.length;
  ctx.setActivePayment(POS_PAY_METHODS[next]);
}

export function usePosKeyboard(ctx: PosKeyboardContext) {
  const ctxRef = React.useRef(ctx);
  ctxRef.current = ctx;

  React.useEffect(() => {
    if (!ctx.posOpen) return;

    const onKey = (e: KeyboardEvent) => {
      const ctx = ctxRef.current;
      const inInput = isInputFocused();
      const isSearch = document.activeElement === ctx.searchRef.current;
      const searchValue = ctx.searchRef.current?.value ?? "";
      const searchEmpty = isSearch && !searchValue.trim();

      if (ctx.pinLocked) {
        if (/^\d$/.test(e.key)) { ctx.handlePinEntry(e.key); return; }
        if (e.key === "Backspace") { ctx.handlePinEntry("DEL"); return; }
        if (e.key === "Escape") { ctx.closePos(); return; }
        return;
      }

      // Cash close owns its own keys; only Esc is handled here as fallback
      if (ctx.showCashClose) {
        if (e.key === "Escape") {
          e.preventDefault();
          ctx.closeCashClose();
        }
        return;
      }

      // WhatsApp bill modal — Esc skip, Enter send; block POS shortcuts so it doesn't stack
      if (ctx.waBillOfferOpen) {
        if (e.key === "Escape") {
          e.preventDefault();
          ctx.closeWaBillOffer();
          return;
        }
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          ctx.sendWaBill();
          return;
        }
        return;
      }

      // Quantity popup owns its own capture-phase handlers
      if (ctx.qtyPopupOpen) {
        return;
      }

      const ms = Date.now();
      const delta = ms - ctx.lastKeyTime.current;
      ctx.lastKeyTime.current = ms;
      if (e.key.length === 1 && delta < 60 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        ctx.barcodeBuffer.current += e.key;
        clearTimeout(ctx.barcodeTimer.current);
        ctx.barcodeTimer.current = setTimeout(() => { ctx.barcodeBuffer.current = ""; }, 120);
      } else if (e.key !== "Enter" && delta > 60) {
        clearTimeout(ctx.barcodeTimer.current);
        ctx.barcodeBuffer.current = "";
      }

      // Search box has the full scanned code — prefer it over the wedge buffer.
      if (e.key === "Enter" && isSearch) {
        e.preventDefault();
        ctx.barcodeBuffer.current = "";
        clearTimeout(ctx.barcodeTimer.current);
        ctx.handleSearchEnter();
        return;
      }

      if (e.key === "Enter" && ctx.barcodeBuffer.current.length >= 3) {
        const code = ctx.barcodeBuffer.current.trim();
        ctx.barcodeBuffer.current = "";
        clearTimeout(ctx.barcodeTimer.current);
        if (code) { void ctx.scanAndAddProduct(code); e.preventDefault(); return; }
      }

      if (e.key === "F1" || (e.key === "?" && !inInput)) {
        e.preventDefault();
        ctx.setShowShortcuts((s) => !s);
        return;
      }

      if (ctx.showDayEnd && e.key === "Escape") {
        e.preventDefault();
        ctx.setShowDayEnd(false);
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        if (ctx.showShortcuts) { ctx.setShowShortcuts(false); return; }
        if (ctx.showCashClose) { ctx.closeCashClose(); return; }
        if (ctx.waBillOfferOpen) { ctx.closeWaBillOffer(); return; }
        if (ctx.checkoutOpen) { ctx.setCheckoutOpen(false); return; }
        if (ctx.showHeldBills) { ctx.setShowHeldBills(false); return; }
        if (ctx.selectedProductName) { ctx.setSelectedProductName(null); return; }
        if (ctx.showCustomerSearch) {
          ctx.setShowCustomerSearch(false);
          ctx.setCustomerSearch("");
          ctx.setCustomers([]);
          ctx.setShowNewCust(false);
          return;
        }
        ctx.closePos();
        return;
      }

      // ── Function keys always work (even while barcode search is focused) ──
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        ctx.setActiveNav("products");
        ctx.searchRef.current?.focus();
        ctx.searchRef.current?.select();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && ctx.itemsLength > 0) {
        e.preventDefault();
        void ctx.handleCheckout("CASH");
        return;
      }
      if (e.key === "F9" && e.shiftKey && ctx.itemsLength > 0) {
        e.preventDefault();
        void ctx.handleCheckout("CASH");
        return;
      }
      if (e.key === "F2") {
        e.preventDefault();
        ctx.searchRef.current?.focus();
        ctx.searchRef.current?.select();
        ctx.setActiveNav("products");
        return;
      }
      if (e.key === "F3") {
        e.preventDefault();
        if (ctx.itemsLength > 0) void ctx.handleHoldBill();
        else toast.info("Cart is empty");
        return;
      }
      if (e.key === "F4") {
        e.preventDefault();
        ctx.openCartCustomer();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        ctx.openCashClose();
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        ctx.discountInputRef.current?.focus();
        return;
      }
      if (e.key === "F6") {
        e.preventDefault();
        if (ctx.selectedCartIdx < 0) { toast.info("Select a cart line first (↑↓)"); return; }
        ctx.openQtyEditForSelected();
        return;
      }
      if (e.key === "F7") {
        e.preventDefault();
        if (ctx.itemsLength === 0) { toast.info("Cart is empty"); return; }
        ctx.setActivePayment("CASH");
        ctx.setCheckoutOpen(true);
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        ctx.setShowHeldBills(true);
        ctx.setFocusedHeldIdx(0);
        ctx.setActiveNav("products");
        return;
      }
      if (e.key === "F9" && !e.shiftKey) {
        e.preventDefault();
        if (ctx.itemsLength === 0) { toast.info("Cart is empty"); return; }
        if (!ctx.checkoutOpen) { ctx.setActivePayment("CASH"); ctx.setCheckoutOpen(true); return; }
        void ctx.handleCheckout();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "c") {
        e.preventDefault();
        if (ctx.itemsLength === 0) { toast.info("Cart is already empty"); return; }
        if (window.confirm("Clear all items from the cart?")) {
          ctx.clearCart();
          ctx.setSelectedCartIdx(-1);
          ctx.setCheckoutOpen(false);
          toast.success("Cart cleared");
        }
        return;
      }
      if (e.key === "F10") { e.preventDefault(); void ctx.handleThermalPrint(); return; }
      // Keep F11 free for OS/browser / future use — block browser fullscreen while POS is open
      if (e.key === "F11") { e.preventDefault(); return; }
      if (e.key === "F12") {
        e.preventDefault();
        // Always lock for cashier switch — clear token so next PIN owns the session
        ctx.lockCashier();
        return;
      }

      // Search results: arrow navigate + keep typing in the barcode box
      if (isSearch && !ctx.checkoutOpen && !ctx.showCustomerSearch && !ctx.showHeldBills) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          ctx.setFocusedProductIdx((i) => Math.min(ctx.filteredProductsLength - 1, Math.max(0, i) + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          ctx.setFocusedProductIdx((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
          return;
        }
      }

      if (ctx.showCustomerSearch) {
        const inCartCustSearch = document.activeElement === ctx.cartCustomerSearchRef?.current;
        const blockForNewForm = ctx.showNewCust && inInput && !inCartCustSearch;
        if (!blockForNewForm) {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            ctx.setFocusedCustomerIdx((i) => Math.min(Math.max(0, ctx.customerModalListLength - 1), i + 1));
            return;
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            ctx.setFocusedCustomerIdx((i) => Math.max(0, i - 1));
            return;
          }
          if (e.key === "Enter" && ctx.focusedCustomerIdx >= 0) {
            e.preventDefault();
            const c = ctx.getCustomerModalItem(ctx.focusedCustomerIdx);
            if (c) ctx.applyCustomer(c);
            return;
          }
        }
      }

      if (ctx.activeNav === "customers" && !inInput && !ctx.showNewCust && !ctx.checkoutOpen && !ctx.showCustomerSearch) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          ctx.setFocusedCustomerIdx((i) => Math.min(ctx.inlineCustomersLength - 1, i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          ctx.setFocusedCustomerIdx((i) => Math.max(0, i - 1));
          return;
        }
      }

      if (ctx.showHeldBills && (!inInput || isSearch) && !ctx.checkoutOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          ctx.setFocusedHeldIdx((i) => Math.min(Math.max(0, ctx.serverHeldBillsLength - 1), i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          ctx.setFocusedHeldIdx((i) => Math.max(0, i - 1));
          return;
        }
        if (e.key === "Enter" && ctx.focusedHeldIdx >= 0) {
          e.preventDefault();
          const bill = ctx.getHeldBill(ctx.focusedHeldIdx);
          if (bill) {
            ctx.handleRestoreHeldBill(bill);
            ctx.setShowHeldBills(false);
          }
          return;
        }
        if (e.key === "Delete" && ctx.focusedHeldIdx >= 0) {
          e.preventDefault();
          const bill = ctx.getHeldBill(ctx.focusedHeldIdx);
          if (bill) void ctx.handleDeleteHeldBill(bill.id);
          return;
        }
      }

      // Typing in a non-search field (coupon, cheque, cart qty edit, etc.)
      if (inInput && e.key === "Enter" && !isSearch) {
        return;
      }
      if (inInput && !isSearch) return;
      // Barcode search focused → letters type/scan; tool letters need Alt+key
      if (isSearch && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        return;
      }

      if (e.altKey && /^[1-9]$/.test(e.key) && !ctx.checkoutOpen) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (ctx.navItems[idx]) navigateToNavItem(ctx, ctx.navItems[idx].id);
        return;
      }

      if (!anyModalOpen(ctx) && !isSearch) {
        if (e.key === "ArrowLeft" && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          cycleNav(ctx, -1);
          return;
        }
        if (e.key === "ArrowRight" && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault();
          cycleNav(ctx, 1);
          return;
        }
      }

      const key = e.key.toLowerCase();
      // Letter tools: work when search not focused, OR with Alt while searching
      const letterToolsOk = !isSearch || e.altKey;

      // Letter shortcuts for full POS tools (checkout remaps some keys)
      if (letterToolsOk && key === "p" && !ctx.checkoutOpen) { e.preventDefault(); ctx.setActiveNav("products"); setTimeout(() => ctx.searchRef.current?.focus(), 50); return; }
      if (letterToolsOk && key === "c" && !ctx.checkoutOpen) { e.preventDefault(); if (ctx.itemsLength > 0) { ctx.setActivePayment("CASH"); ctx.setCheckoutOpen(true); } else toast.info("Cart is empty"); return; }
      if (letterToolsOk && key === "q") { e.preventDefault(); ctx.setActiveNav("quick-product"); return; }
      if (letterToolsOk && key === "y") { e.preventDefault(); ctx.setActiveNav("demo-product"); return; }
      if (letterToolsOk && key === "r" && !e.ctrlKey) { e.preventDefault(); ctx.setActiveNav("returns"); return; }
      if (letterToolsOk && key === "h") { e.preventDefault(); ctx.setShowHeldBills(true); ctx.setActiveNav("products"); return; }
      if (letterToolsOk && key === "u") { e.preventDefault(); ctx.setShowCustomerSearch(false); ctx.setFocusedCustomerIdx(0); ctx.setActiveNav("customers"); return; }
      if (letterToolsOk && key === "o") { e.preventDefault(); ctx.setActiveNav("orders"); return; }
      if (letterToolsOk && key === "v") { e.preventDefault(); ctx.setActiveNav("vouchers"); return; }
      if (letterToolsOk && key === "b" && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ctx.setActiveNav("quick-grn"); return; }
      if (letterToolsOk && key === "e") { e.preventDefault(); ctx.setActiveNav("expenses"); return; }
      if (letterToolsOk && key === "w") { e.preventDefault(); ctx.setActiveNav("warranty"); return; }
      if (letterToolsOk && key === "m") { e.preventDefault(); ctx.setActiveNav("discounts"); return; }
      if (letterToolsOk && key === "t") { e.preventDefault(); ctx.setActiveNav("reports"); return; }
      if (letterToolsOk && key === "g") { e.preventDefault(); ctx.setActiveNav("settings"); return; }
      if (letterToolsOk && key === "n" && (ctx.showCustomerSearch || ctx.activeNav === "customers")) { e.preventDefault(); ctx.setShowNewCust(true); return; }
      if (letterToolsOk && key === "x" && !ctx.checkoutOpen) { e.preventDefault(); ctx.setCustomer(null); toast.info("Customer removed from bill"); return; }
      if (letterToolsOk && key === "d") { e.preventDefault(); ctx.discountInputRef.current?.focus(); return; }
      if (letterToolsOk && key === "s" && !(ctx.checkoutOpen && e.shiftKey)) { e.preventDefault(); if (ctx.checkoutOpen) return; void ctx.handleSplitBill(); return; }
      if (key === "/" && !ctx.checkoutOpen) { e.preventDefault(); ctx.searchRef.current?.focus(); ctx.setActiveNav("products"); return; }
      if ((e.ctrlKey || e.metaKey) && key === "f" && !ctx.checkoutOpen) { e.preventDefault(); ctx.searchRef.current?.focus(); ctx.setActiveNav("products"); return; }

      if (key === "[" && ctx.activeNav === "products" && !anyModalOpen(ctx)) {
        e.preventDefault();
        const idx = ctx.categories.indexOf(ctx.activeCategory);
        ctx.setActiveCategory(ctx.categories[Math.max(0, idx - 1)] ?? "All");
        return;
      }
      if (key === "]" && ctx.activeNav === "products" && !anyModalOpen(ctx)) {
        e.preventDefault();
        const idx = ctx.categories.indexOf(ctx.activeCategory);
        ctx.setActiveCategory(ctx.categories[Math.min(ctx.categories.length - 1, idx + 1)] ?? "All");
        return;
      }

      if (ctx.checkoutOpen) {
        if (key === "/" || key === "c") {
          e.preventDefault();
          ctx.focusCheckoutCoupon();
          return;
        }
        if (key === "l") {
          e.preventDefault();
          if (!ctx.payStateAllowPartial) ctx.toggleCheckoutPartial();
          else ctx.focusCheckoutPartialPay();
          return;
        }
        if (e.key === "=" || ((e.ctrlKey || e.metaKey) && key === "e")) {
          e.preventDefault();
          ctx.setActivePayment("CASH");
          ctx.setExactCashTender();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && key === "g") {
          e.preventDefault();
          ctx.focusCheckoutGiftOrCheque();
          return;
        }
        if (e.shiftKey && key === "s") {
          e.preventDefault();
          ctx.toggleCheckoutSplit();
          return;
        }
        if ((e.ctrlKey || e.metaKey) && /^[1-4]$/.test(e.key)) {
          e.preventDefault();
          const amounts = [500, 1000, 2000, 5000];
          ctx.setActivePayment("CASH");
          ctx.setQuickCash(amounts[parseInt(e.key, 10) - 1]!);
          return;
        }
        if (e.key === "ArrowLeft" && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          cyclePayment(ctx, -1);
          return;
        }
        if (e.key === "ArrowRight" && !e.ctrlKey && !e.shiftKey && !e.altKey) {
          e.preventDefault();
          cyclePayment(ctx, 1);
          return;
        }
        if (e.key === "Tab" && e.shiftKey) {
          e.preventDefault();
          cyclePayment(ctx, -1);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          cyclePayment(ctx, 1);
          return;
        }
        if (ctx.activePayment === "CASH") {
          if (/^\d$/.test(e.key)) {
            e.preventDefault();
            ctx.handleNumpad(e.key);
            return;
          }
          if (e.key === "." || e.key === "Decimal" || e.code === "NumpadDecimal") {
            e.preventDefault();
            ctx.handleNumpad(".");
            return;
          }
          if (e.key === "Backspace" || e.key === "Delete") {
            e.preventDefault();
            ctx.handleNumpad("DEL");
            return;
          }
        }
        if ((e.altKey || ctx.activePayment !== "CASH") && /^[1-9]$/.test(e.key)) {
          const idx = parseInt(e.key, 10) - 1;
          if (idx < POS_PAY_METHODS.length) {
            e.preventDefault();
            ctx.setActivePayment(POS_PAY_METHODS[idx]!);
            return;
          }
        }
      }

      if (ctx.activeNav === "products" && !ctx.checkoutOpen && !ctx.selectedProductName && !ctx.showCustomerSearch && !ctx.showHeldBills && e.ctrlKey) {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          ctx.setFocusedProductIdx((i) => Math.min(ctx.filteredProductsLength - 1, Math.max(0, i) + 1));
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          ctx.setFocusedProductIdx((i) => Math.max(0, (i < 0 ? 0 : i) - 1));
          return;
        }
        if (e.key === "ArrowDown") {
          e.preventDefault();
          ctx.setFocusedProductIdx((i) => {
            const base = i < 0 ? 0 : i;
            return Math.min(ctx.filteredProductsLength - 1, base + PRODUCT_GRID_COLS);
          });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          ctx.setFocusedProductIdx((i) => {
            const base = i < 0 ? 0 : i;
            return Math.max(0, base - PRODUCT_GRID_COLS);
          });
          return;
        }
      }

      if (e.key === "Enter") {
        if (ctx.activeNav === "products" && ctx.focusedProductIdx >= 0 && !ctx.checkoutOpen && !ctx.showCustomerSearch && !ctx.showHeldBills) {
          e.preventDefault();
          const p = ctx.getFilteredProduct(ctx.focusedProductIdx);
          if (p) ctx.handleCardClick(p);
          return;
        }
        if (ctx.activeNav === "customers" && ctx.focusedCustomerIdx >= 0 && !ctx.showCustomerSearch) {
          e.preventDefault();
          const c = ctx.getInlineCustomer(ctx.focusedCustomerIdx);
          if (c) ctx.applyCustomer(c);
          return;
        }
        if (ctx.itemsLength === 0) return;
        if (!ctx.checkoutOpen) { e.preventDefault(); ctx.setActivePayment("CASH"); ctx.setCheckoutOpen(true); return; }
        e.preventDefault();
        void ctx.handleCheckout();
        return;
      }

      if (e.key === "ArrowDown" && e.ctrlKey) {
        e.preventDefault();
        ctx.setSelectedCartIdx((i) => Math.min(ctx.itemsLength - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp" && e.ctrlKey) {
        e.preventDefault();
        ctx.setSelectedCartIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (!e.ctrlKey && !anyModalOpen(ctx) && ctx.itemsLength > 0 && !isSearch) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          ctx.setSelectedCartIdx((i) => Math.min(ctx.itemsLength - 1, i < 0 ? 0 : i + 1));
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          ctx.setSelectedCartIdx((i) => Math.max(0, i < 0 ? 0 : i - 1));
          return;
        }
      }

      if ((e.key === "+" || e.key === "=") && ctx.selectedCartIdx >= 0) {
        ctx.adjustSelectedQty(1);
        return;
      }
      if ((e.key === "-" || e.key === "_") && ctx.selectedCartIdx >= 0) {
        ctx.adjustSelectedQty(-1);
        return;
      }
      if (e.key === "Delete" && ctx.selectedCartIdx >= 0 && !ctx.showHeldBills) {
        ctx.removeSelectedCartItem();
      }
    };

    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ctx.posOpen]);
}
