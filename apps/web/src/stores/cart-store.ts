"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CartItem, Customer } from "@/types";
import { calculateDiscount } from "@/lib/utils";
import {
  calcPosAmountDue,
  calcPosSubtotal,
  calcPosTaxAmount,
  type PosLineInput,
} from "@/lib/pos-totals";
import { readPosTaxRate, writePosTaxRate, readPosAllowNegativeStock } from "@/lib/pos-settings";

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
  /** When true, cart qty is not capped by on-hand stock (tenant POS setting). */
  allowNegativeStock: boolean;

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
  setAllowNegativeStock: (allow: boolean) => void;
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
      taxRate: readPosTaxRate(),
      activeHeldBillId: null,
      allowNegativeStock: readPosAllowNegativeStock(),

      addItem: (newItem) =>
        set((state) => {
          const decimal = !!newItem.allowDecimalSelling || newItem.productKind === "WEIGHTED";
          const qtyToAdd = decimal
            ? Math.max(0.001, newItem.quantity || 0.001)
            : Math.max(1, newItem.quantity || 1);
          const existing = newItem.isCustom
            ? state.items.find(
                (i) =>
                  i.isCustom &&
                  i.productName === newItem.productName &&
                  i.unitPrice === newItem.unitPrice,
              )
            : state.items.find((i) => i.variantId === newItem.variantId);
          if (existing) {
            const stacked = existing.quantity + qtyToAdd;
            const newQty = state.allowNegativeStock || existing.isCustom
              ? stacked
              : Math.min(stacked, existing.stock);
            const perUnitFromNew =
              newItem.discountType === "fixed" && newItem.discountAmount > 0 && newItem.quantity > 0
                ? newItem.discountAmount / newItem.quantity
                : 0;
            const perUnitFromExisting =
              existing.discountType === "fixed" && existing.discountAmount > 0 && existing.quantity > 0
                ? existing.discountAmount / existing.quantity
                : 0;
            const perUnitDisc = perUnitFromNew || perUnitFromExisting;
            return {
              items: state.items.map((i) =>
                i.variantId === existing.variantId
                  ? {
                      ...i,
                      quantity: newQty,
                      allowDecimalSelling: existing.allowDecimalSelling || decimal,
                      productKind: existing.productKind || newItem.productKind,
                      unit: existing.unit ?? newItem.unit,
                      ...(perUnitDisc > 0
                        ? { discountAmount: perUnitDisc * newQty, discountType: "fixed" as const }
                        : {}),
                    }
                  : i,
              ),
            };
          }
          const initialQty = state.allowNegativeStock || newItem.isCustom
            ? qtyToAdd
            : Math.min(qtyToAdd, Math.max(decimal ? 0.001 : 1, newItem.stock || qtyToAdd));
          return {
            items: [
              ...state.items,
              { ...newItem, quantity: initialQty, allowDecimalSelling: decimal || newItem.allowDecimalSelling },
            ],
          };
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
              : state.items.map((i) => {
                  if (i.variantId !== variantId) return i;
                  const newQty = state.allowNegativeStock || i.isCustom
                    ? quantity
                    : Math.min(quantity, i.stock);
                  const perUnitDisc =
                    i.discountType === "fixed" && i.discountAmount > 0 && i.quantity > 0
                      ? i.discountAmount / i.quantity
                      : 0;
                  return {
                    ...i,
                    quantity: newQty,
                    discountAmount: perUnitDisc > 0 ? perUnitDisc * newQty : i.discountAmount,
                  };
                }),
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
      setTaxRate: (taxRate) => {
        const rate = writePosTaxRate(taxRate);
        set((state) => ({
          taxRate: rate,
          items: state.items.map((i) => ({ ...i, taxRate: rate })),
        }));
      },
      setAllowNegativeStock: (allowNegativeStock) => set({ allowNegativeStock }),
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
        set((state) => ({
          items: data.items.map((i) => ({ ...i, taxRate: state.taxRate })),
          customer: data.customer,
          discount: data.discount,
          discountType: data.discountType,
          notes: data.notes,
          couponCode: data.couponCode,
          loyaltyPointsToRedeem: data.loyaltyPointsToRedeem,
          activeHeldBillId: heldBillId,
        })),

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

      subtotal: () => calcPosSubtotal(get().items as PosLineInput[]),

      discountAmount: () => {
        const { discount, discountType } = get();
        const sub = get().subtotal();
        return calculateDiscount(sub, discount, discountType);
      },

      loyaltyDiscount: () => get().loyaltyPointsToRedeem * 0.1,

      taxAmount: () => {
        const { items, taxRate } = get();
        return calcPosTaxAmount(items as PosLineInput[], taxRate);
      },

      total: () => {
        const { items, discount, discountType, loyaltyPointsToRedeem, taxRate } = get();
        return calcPosAmountDue(items as PosLineInput[], {
          manualDiscount: discount,
          manualDiscountType: discountType,
          loyaltyPoints: loyaltyPointsToRedeem,
          posTaxRate: taxRate,
        });
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
