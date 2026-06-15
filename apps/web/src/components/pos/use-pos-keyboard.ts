"use client";

import * as React from "react";
import { toast } from "sonner";
import type { HeldBillData } from "@/stores/cart-store";
import { PRODUCT_GRID_COLS } from "./pos-shortcuts";

const PAY_METHODS = ["CASH", "CARD", "UPI", "WALLET", "CUSTOMER_CREDIT"] as const;

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
  showDayEnd: boolean;
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
  discountInputRef: React.RefObject<HTMLInputElement | null>;
  barcodeBuffer: React.MutableRefObject<string>;
  lastKeyTime: React.MutableRefObject<number>;
  barcodeTimer: React.MutableRefObject<ReturnType<typeof setTimeout> | undefined>;
  setShowShortcuts: React.Dispatch<React.SetStateAction<boolean>>;
  setCheckoutOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedProductName: React.Dispatch<React.SetStateAction<string | null>>;
  setShowCustomerSearch: React.Dispatch<React.SetStateAction<boolean>>;
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
  closePos: () => void;
  handlePinEntry: (key: string) => void;
  scanAndAddProduct: (code: string) => Promise<void>;
  handleAddProduct: (p: PosProductItem) => void;
  handleCardClick: (p: PosProductItem) => void;
  handleNumpad: (key: string) => void;
  handleCheckout: () => void;
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
  applyCustomer: (c: PosCustomerRow) => void;
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

function cycleNav(ctx: PosKeyboardContext, delta: number) {
  const idx = ctx.navItems.findIndex((n) => n.id === ctx.activeNav);
  const next = (idx + delta + ctx.navItems.length) % ctx.navItems.length;
  ctx.setActiveNav(ctx.navItems[next].id);
}

export function usePosKeyboard(ctx: PosKeyboardContext) {
  React.useEffect(() => {
    if (!ctx.posOpen) return;

    const onKey = (e: KeyboardEvent) => {
      const inInput = isInputFocused();

      if (ctx.pinLocked) {
        if (/^\d$/.test(e.key)) { ctx.handlePinEntry(e.key); return; }
        if (e.key === "Backspace") { ctx.handlePinEntry("DEL"); return; }
        if (e.key === "Escape") { ctx.closePos(); return; }
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
        if (ctx.showShortcuts) { ctx.setShowShortcuts(false); return; }
        if (ctx.checkoutOpen) { ctx.setCheckoutOpen(false); return; }
        if (ctx.selectedProductName) { ctx.setSelectedProductName(null); return; }
        if (ctx.showCustomerSearch) {
          ctx.setShowCustomerSearch(false);
          ctx.setCustomerSearch("");
          ctx.setCustomers([]);
          return;
        }
        ctx.closePos();
        return;
      }

      if (ctx.showCustomerSearch && !inInput) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          ctx.setFocusedCustomerIdx((i) => Math.min(ctx.customerModalListLength - 1, i + 1));
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
          if (c) {
            ctx.applyCustomer(c);
            ctx.setShowCustomerSearch(false);
            ctx.setCustomerSearch("");
            ctx.setCustomers([]);
          }
          return;
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

      if (ctx.activeNav === "hold-bills" && !inInput && !ctx.checkoutOpen) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          ctx.setFocusedHeldIdx((i) => Math.min(ctx.serverHeldBillsLength - 1, i + 1));
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
          if (bill) ctx.handleRestoreHeldBill(bill);
          return;
        }
        if (e.key === "Delete" && ctx.focusedHeldIdx >= 0) {
          e.preventDefault();
          const bill = ctx.getHeldBill(ctx.focusedHeldIdx);
          if (bill) void ctx.handleDeleteHeldBill(bill.id);
          return;
        }
      }

      if (inInput && e.key === "Enter" && document.activeElement === ctx.searchRef.current) {
        const first = ctx.getFilteredProduct(0);
        if (first) {
          e.preventDefault();
          ctx.handleAddProduct(first);
        }
        return;
      }

      if (inInput) return;

      if (e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const idx = parseInt(e.key, 10) - 1;
        if (ctx.navItems[idx]) ctx.setActiveNav(ctx.navItems[idx].id);
        return;
      }

      if (e.key === "ArrowLeft" && !e.ctrlKey && !e.shiftKey && !ctx.checkoutOpen) {
        e.preventDefault();
        cycleNav(ctx, -1);
        return;
      }
      if (e.key === "ArrowRight" && !e.ctrlKey && !e.shiftKey && !ctx.checkoutOpen) {
        e.preventDefault();
        cycleNav(ctx, 1);
        return;
      }

      const key = e.key.toLowerCase();
      if (key === "p") { e.preventDefault(); ctx.setActiveNav("products"); setTimeout(() => ctx.searchRef.current?.focus(), 50); return; }
      if (key === "c") { e.preventDefault(); if (ctx.itemsLength > 0) ctx.setCheckoutOpen(true); else toast.info("Cart is empty"); return; }
      if (key === "r" && !e.ctrlKey) { e.preventDefault(); ctx.setActiveNav("returns"); return; }
      if (key === "h") { e.preventDefault(); ctx.setActiveNav("hold-bills"); return; }
      if (key === "u") { e.preventDefault(); ctx.setActiveNav("customers"); return; }
      if (key === "o") { e.preventDefault(); ctx.setActiveNav("orders"); return; }
      if (key === "g") { e.preventDefault(); ctx.setActiveNav("settings"); return; }
      if (key === "n" && ctx.activeNav === "customers") { e.preventDefault(); ctx.setShowNewCust(true); return; }
      if (key === "x" && ctx.itemsLength >= 0) { e.preventDefault(); ctx.setCustomer(null); toast.info("Customer removed from bill"); return; }
      if (key === "d") { e.preventDefault(); ctx.discountInputRef.current?.focus(); return; }
      if (key === "s") { e.preventDefault(); void ctx.handleSplitBill(); return; }
      if (key === "/" || ((e.ctrlKey || e.metaKey) && key === "f")) { e.preventDefault(); ctx.searchRef.current?.focus(); ctx.setActiveNav("products"); return; }

      if (key === "[" && ctx.activeNav === "products") {
        e.preventDefault();
        const idx = ctx.categories.indexOf(ctx.activeCategory);
        ctx.setActiveCategory(ctx.categories[Math.max(0, idx - 1)] ?? "All");
        return;
      }
      if (key === "]" && ctx.activeNav === "products") {
        e.preventDefault();
        const idx = ctx.categories.indexOf(ctx.activeCategory);
        ctx.setActiveCategory(ctx.categories[Math.min(ctx.categories.length - 1, idx + 1)] ?? "All");
        return;
      }

      if (e.key === "F2") { e.preventDefault(); ctx.searchRef.current?.focus(); ctx.setActiveNav("products"); return; }
      if (e.key === "F3") { e.preventDefault(); if (ctx.itemsLength > 0) void ctx.handleHoldBill(); return; }
      if (e.key === "F4") { e.preventDefault(); ctx.setShowCustomerSearch(true); ctx.setFocusedCustomerIdx(0); return; }
      if (e.key === "F5") { e.preventDefault(); void ctx.loadProducts(); return; }
      if (e.key === "F6") { e.preventDefault(); ctx.setActiveNav("returns"); return; }
      if (e.key === "F7") {
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
      if (e.key === "F8") {
        e.preventDefault();
        const bill = ctx.getHeldBill(0);
        if (bill) ctx.handleRestoreHeldBill(bill);
        else toast.info("No held bills");
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        if (ctx.itemsLength === 0) return;
        if (!ctx.checkoutOpen) { ctx.setCheckoutOpen(true); return; }
        void ctx.handleCheckout();
        return;
      }
      if (e.key === "F10") { e.preventDefault(); void ctx.handleThermalPrint(); return; }
      if (e.key === "F11") { e.preventDefault(); void ctx.handleDayEnd(); return; }
      if (e.key === "F12") {
        e.preventDefault();
        const st = localStorage.getItem("pos_pin");
        if (st) { ctx.setPinLocked(true); ctx.setPinEntry(""); ctx.setPinError(false); }
        else ctx.closePos();
        return;
      }

      if (ctx.checkoutOpen) {
        if (e.key === "Tab" && e.shiftKey) {
          e.preventDefault();
          const i = PAY_METHODS.indexOf(ctx.activePayment as typeof PAY_METHODS[number]);
          ctx.setActivePayment(PAY_METHODS[(i - 1 + PAY_METHODS.length) % PAY_METHODS.length]);
          return;
        }
        if (e.key === "Tab") {
          e.preventDefault();
          const i = PAY_METHODS.indexOf(ctx.activePayment as typeof PAY_METHODS[number]);
          ctx.setActivePayment(PAY_METHODS[(i + 1) % PAY_METHODS.length]);
          return;
        }
        if (/^[1-5]$/.test(e.key)) {
          e.preventDefault();
          ctx.setActivePayment(PAY_METHODS[parseInt(e.key, 10) - 1]);
          return;
        }
      }

      if (ctx.activeNav === "products" && !ctx.checkoutOpen && !ctx.selectedProductName && e.ctrlKey) {
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
        if (ctx.activeNav === "products" && ctx.focusedProductIdx >= 0 && !ctx.checkoutOpen) {
          e.preventDefault();
          const p = ctx.getFilteredProduct(ctx.focusedProductIdx);
          if (p) ctx.handleCardClick(p);
          return;
        }
        if (ctx.activeNav === "customers" && ctx.focusedCustomerIdx >= 0) {
          e.preventDefault();
          const c = ctx.getInlineCustomer(ctx.focusedCustomerIdx);
          if (c) ctx.applyCustomer(c);
          return;
        }
        if (ctx.itemsLength === 0) return;
        if (!ctx.checkoutOpen) { e.preventDefault(); ctx.setCheckoutOpen(true); return; }
        e.preventDefault();
        void ctx.handleCheckout();
        return;
      }

      if (ctx.activePayment === "CASH" && ctx.checkoutOpen) {
        if (/^\d$/.test(e.key)) { ctx.handleNumpad(e.key); return; }
        if (e.key === ".") { ctx.handleNumpad("."); return; }
        if (e.key === "Backspace") { ctx.handleNumpad("DEL"); return; }
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
      if (!e.ctrlKey && !ctx.checkoutOpen && ctx.itemsLength > 0 && ctx.activeNav === "products") {
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

      if (!e.ctrlKey && !ctx.checkoutOpen && ctx.itemsLength > 0 && ctx.activeNav !== "products" && ctx.activeNav !== "hold-bills") {
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
      if (e.key === "Delete" && ctx.selectedCartIdx >= 0) {
        ctx.removeSelectedCartItem();
        return;
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ctx]);
}
