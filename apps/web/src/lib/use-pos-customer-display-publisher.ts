"use client";

import * as React from "react";
import type { CartItem, Customer } from "@/types";
import type { ReceiptSettings } from "@/lib/use-receipt-settings";
import {
  buildCustomerDisplayState,
  publishCustomerDisplayState,
  type CustomerDisplayPhase,
} from "@/lib/pos-customer-display";

interface ThankYouSale {
  invoiceNumber: string;
  total: number;
  changeDue: number;
  paymentMethod: string;
  items: CartItem[];
  customerName?: string;
}

interface PublisherInput {
  enabled: boolean;
  checkoutOpen: boolean;
  thankYouSale: ThankYouSale | null;
  items: CartItem[];
  customer: Customer | null;
  manualDiscount: number;
  manualDiscountType: "percentage" | "fixed";
  couponDiscount: number;
  loyaltyPoints: number;
  taxRate: number;
  currency: string;
  receiptSettings: ReceiptSettings;
  productImages: Map<string, string | undefined>;
  lastAddedVariantId?: string;
}

export function usePosCustomerDisplayPublisher(input: PublisherInput) {
  const {
    enabled,
    checkoutOpen,
    thankYouSale,
    items,
    customer,
    manualDiscount,
    manualDiscountType,
    couponDiscount,
    loyaltyPoints,
    taxRate,
    currency,
    receiptSettings,
    productImages,
    lastAddedVariantId,
  } = input;

  const itemsKey = React.useMemo(
    () => items.map((i) => `${i.variantId}:${i.quantity}:${i.unitPrice}`).join("|"),
    [items],
  );

  React.useEffect(() => {
    if (!enabled) {
      publishCustomerDisplayState(
        buildCustomerDisplayState({
          phase: "waiting",
          shopName: receiptSettings.shopName,
          tagline: receiptSettings.tagline,
          logoUrl: receiptSettings.logoUrl,
          currency,
          items: [],
          customer: null,
          manualDiscount: 0,
          manualDiscountType: "percentage",
          couponDiscount: 0,
          loyaltyPoints: 0,
          taxRate,
        }),
      );
      return;
    }

    let phase: CustomerDisplayPhase = "idle";
    if (thankYouSale) phase = "thankyou";
    else if (checkoutOpen) phase = "checkout";
    else if (items.length > 0) phase = "shopping";

    const state = buildCustomerDisplayState({
      phase,
      shopName: receiptSettings.shopName,
      tagline: receiptSettings.tagline,
      logoUrl: receiptSettings.logoUrl,
      currency,
      items: thankYouSale?.items ?? items,
      customer,
      manualDiscount,
      manualDiscountType,
      couponDiscount,
      loyaltyPoints,
      taxRate,
      productImages,
      lastAddedVariantId,
      invoiceNumber: thankYouSale?.invoiceNumber,
      changeDue: thankYouSale?.changeDue,
      paymentMethod: thankYouSale?.paymentMethod,
      saleTotal: thankYouSale?.total,
    });

    if (thankYouSale) {
      state.customerName = thankYouSale.customerName ?? state.customerName;
    }

    publishCustomerDisplayState(state);
  }, [
    enabled,
    checkoutOpen,
    thankYouSale,
    itemsKey,
    customer,
    manualDiscount,
    manualDiscountType,
    couponDiscount,
    loyaltyPoints,
    taxRate,
    currency,
    receiptSettings.shopName,
    receiptSettings.tagline,
    receiptSettings.logoUrl,
    productImages,
    lastAddedVariantId,
  ]);
}

export type { ThankYouSale };
