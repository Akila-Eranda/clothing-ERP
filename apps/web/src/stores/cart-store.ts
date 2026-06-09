"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem, Customer } from "@/types";
import { calculateDiscount, calculateTax } from "@/lib/utils";

export interface HeldBillData {
  items: CartItem[];
  customer: Customer | null;
  discount: number;
  discountType: "percentage" | "fixed";
  taxRate: number;
  notes: string;
  couponCode: string | null;
  loyaltyPointsToRedeem: number;
}

interface CartStore {
  items: CartItem[];
  customer: Customer | null;
  discount: number;
  discountType: "percentage" | "fixed";
  couponCode: string | null;
  loyaltyPointsToRedeem: number;
  notes: string;
  taxRate: number;
  activeHeldBillId: string | null;

  addItem: (item: CartItem) => void;
  removeItem: (variantId: string) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  updateItemDiscount: (variantId: string, discount: number, type: "percentage" | "fixed") => void;
  setCustomer: (customer: Customer | null) => void;
  setDiscount: (discount: number, type: "percentage" | "fixed") => void;
  setCoupon: (code: string | null) => void;
  setLoyaltyPoints: (points: number) => void;
  setNotes: (notes: string) => void;
  setTaxRate: (rate: number) => void;
  setActiveHeldBillId: (id: string | null) => void;
  clearCart: () => void;
  loadFromHeldBill: (data: HeldBillData, heldBillId: string) => void;
  getHoldPayload: () => HeldBillData;

  subtotal: () => number;
  discountAmount: () => number;
  taxAmount: () => number;
  loyaltyDiscount: () => number;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartStore>()(
  persist(
    (set, get) => ({
      items: [],
      customer: null,
      discount: 0,
      discountType: "percentage",
      couponCode: null,
      loyaltyPointsToRedeem: 0,
      notes: "",
      taxRate: 0,
      activeHeldBillId: null,

      addItem: (newItem) =>
        set((state) => {
          const existing = state.items.find((i) => i.variantId === newItem.variantId);
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.variantId === newItem.variantId
                  ? { ...i, quantity: Math.min(i.quantity + 1, i.stock) }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...newItem, quantity: 1 }] };
        }),

      removeItem: (variantId) =>
        set((state) => ({
          items: state.items.filter((i) => i.variantId !== variantId),
        })),

      updateQuantity: (variantId, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.variantId !== variantId)
              : state.items.map((i) =>
                  i.variantId === variantId
                    ? { ...i, quantity: Math.min(quantity, i.stock) }
                    : i
                ),
        })),

      updateItemDiscount: (variantId, discount, type) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.variantId === variantId ? { ...i, discountAmount: discount, discountType: type } : i
          ),
        })),

      setCustomer: (customer) => set({ customer }),
      setDiscount: (discount, discountType) => set({ discount, discountType }),
      setCoupon: (couponCode) => set({ couponCode }),
      setLoyaltyPoints: (loyaltyPointsToRedeem) => set({ loyaltyPointsToRedeem }),
      setNotes: (notes) => set({ notes }),
      setTaxRate: (taxRate) => set({ taxRate }),
      setActiveHeldBillId: (activeHeldBillId) => set({ activeHeldBillId }),

      clearCart: () =>
        set({
          items: [],
          customer: null,
          discount: 0,
          discountType: "percentage",
          couponCode: null,
          loyaltyPointsToRedeem: 0,
          notes: "",
          activeHeldBillId: null,
        }),

      loadFromHeldBill: (data, heldBillId) =>
        set({
          items: data.items,
          customer: data.customer,
          discount: data.discount,
          discountType: data.discountType,
          taxRate: data.taxRate,
          notes: data.notes,
          couponCode: data.couponCode,
          loyaltyPointsToRedeem: data.loyaltyPointsToRedeem,
          activeHeldBillId: heldBillId,
        }),

      getHoldPayload: () => {
        const s = get();
        return {
          items: s.items,
          customer: s.customer,
          discount: s.discount,
          discountType: s.discountType,
          taxRate: s.taxRate,
          notes: s.notes,
          couponCode: s.couponCode,
          loyaltyPointsToRedeem: s.loyaltyPointsToRedeem,
        };
      },

      subtotal: () => {
        const { items } = get();
        return items.reduce((sum, item) => {
          const itemDiscount = calculateDiscount(
            item.unitPrice * item.quantity,
            item.discountAmount,
            item.discountType
          );
          return sum + item.unitPrice * item.quantity - itemDiscount;
        }, 0);
      },

      discountAmount: () => {
        const { discount, discountType } = get();
        const subtotal = get().subtotal();
        return calculateDiscount(subtotal, discount, discountType);
      },

      loyaltyDiscount: () => {
        const { loyaltyPointsToRedeem } = get();
        return loyaltyPointsToRedeem * 0.1;
      },

      taxAmount: () => {
        const { taxRate } = get();
        const base = get().subtotal() - get().discountAmount() - get().loyaltyDiscount();
        return calculateTax(Math.max(0, base), taxRate);
      },

      total: () => {
        const base = get().subtotal() - get().discountAmount() - get().loyaltyDiscount();
        return Math.max(0, base) + get().taxAmount();
      },

      itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
    }),
    {
      name: "fashion-erp-cart",
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        items: state.items,
        customer: state.customer,
        discount: state.discount,
        discountType: state.discountType,
        activeHeldBillId: state.activeHeldBillId,
      }),
    }
  )
);
