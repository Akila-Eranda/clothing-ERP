"use client";

import * as React from "react";
import type { CartItem, Customer } from "@/types";
import type { ReceiptSettings } from "@/lib/use-receipt-settings";
import { CUSTOMER_DISPLAY_HEARTBEAT_MS, newPaymentSessionId, PAYMENT_LABELS } from "@/lib/customer-display-core";
import {
  buildCustomerDisplayState,
  publishCustomerDisplayState,
  type CustomerDisplayPhase,
  type CustomerDisplayQrPayment,
  type CustomerDisplayBankPayment,
  type CustomerDisplayState,
} from "@/lib/pos-customer-display";

interface ThankYouSale {
  invoiceNumber: string;
  total: number;
  changeDue: number;
  paymentMethod: string;
  items: CartItem[];
  customerName?: string;
  cashTendered?: number;
  /** Snapshot so discount still shows after cart is cleared. */
  manualDiscount?: number;
  manualDiscountType?: "percentage" | "fixed";
  couponDiscount?: number;
  loyaltyPoints?: number;
  customerTier?: string | null;
  /** Saved sale (for the "copy bill message" button). */
  saleId?: string;
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
  activePayment: string;
  cashTenderedInput: string;
  totalAmount: number;
  /** Reload popup open — customer display shows phone keypad. */
  reloadOpen?: boolean;
  reloadPhone?: string;
  /** The QR the cashier currently sees (selected bank account, exact amount); only used on the QR tender. */
  qrPayment?: CustomerDisplayQrPayment | null;
  bankPayment?: CustomerDisplayBankPayment | null;
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
    activePayment,
    cashTenderedInput,
    totalAmount,
    reloadOpen = false,
    reloadPhone = "",
    qrPayment = null,
    bankPayment = null,
  } = input;

  // One id per opened checkout, so the display can tell one payment from the next.
  const sessionRef = React.useRef<string | null>(null);
  if (checkoutOpen && !sessionRef.current) sessionRef.current = newPaymentSessionId();
  if (!checkoutOpen && sessionRef.current) sessionRef.current = null;
  const lastStateRef = React.useRef<CustomerDisplayState | null>(null);
  const publish = React.useCallback((state: CustomerDisplayState) => {
    lastStateRef.current = state;
    publishCustomerDisplayState(state);
  }, []);

  const itemsKey = React.useMemo(
    () => items.map((i) => `${i.variantId}:${i.quantity}:${i.unitPrice}:${i.discountAmount ?? 0}:${i.discountType ?? ""}`).join("|"),
    [items],
  );

  React.useEffect(() => {
    if (!enabled) {
      publish(
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
    else if (reloadOpen) phase = "reload";
    else if (checkoutOpen) phase = "checkout";
    else if (items.length > 0) phase = "shopping";

    let checkoutCashTendered: number | undefined;
    let checkoutChangeDue: number | undefined;
    let checkoutPaymentMethod: string | undefined;

    if (checkoutOpen && !thankYouSale && !reloadOpen) {
      checkoutPaymentMethod = PAYMENT_LABELS[activePayment] ?? activePayment;
      if (activePayment === "CASH" && cashTenderedInput.trim()) {
        const tendered = parseFloat(cashTenderedInput);
        if (!Number.isNaN(tendered) && tendered > 0) {
          checkoutCashTendered = tendered;
          if (tendered >= totalAmount) {
            checkoutChangeDue = Math.max(0, tendered - totalAmount);
          }
        }
      }
    }

    const state = buildCustomerDisplayState({
      phase,
      shopName: receiptSettings.shopName,
      tagline: receiptSettings.tagline,
      logoUrl: receiptSettings.logoUrl,
      currency,
      items: thankYouSale?.items ?? items,
      customer: thankYouSale
        ? (thankYouSale.customerName
          ? ({ name: thankYouSale.customerName, membershipTier: thankYouSale.customerTier ?? undefined } as Customer)
          : null)
        : customer,
      manualDiscount: thankYouSale?.manualDiscount ?? manualDiscount,
      manualDiscountType: thankYouSale?.manualDiscountType ?? manualDiscountType,
      couponDiscount: thankYouSale?.couponDiscount ?? couponDiscount,
      loyaltyPoints: thankYouSale?.loyaltyPoints ?? loyaltyPoints,
      taxRate,
      productImages,
      lastAddedVariantId,
      invoiceNumber: thankYouSale?.invoiceNumber,
      changeDue: thankYouSale?.changeDue ?? checkoutChangeDue,
      cashTendered: thankYouSale?.cashTendered ?? checkoutCashTendered,
      paymentMethod: thankYouSale?.paymentMethod ?? checkoutPaymentMethod,
      saleTotal: thankYouSale?.total,
      reloadPhone: reloadOpen ? reloadPhone : undefined,
      // QR details exist only while paying by QR in an open checkout; never on any other screen
      qrPayment: checkoutOpen && !thankYouSale && !reloadOpen && activePayment === "QR" ? qrPayment : null,
      bankPayment: checkoutOpen && !thankYouSale && !reloadOpen && activePayment === "BANK_TRANSFER" ? bankPayment : null,
      paymentSessionId: checkoutOpen && !thankYouSale ? sessionRef.current : null,
    });

    if (thankYouSale) {
      state.customerName = thankYouSale.customerName ?? state.customerName;
      state.changeDue = thankYouSale.changeDue ?? 0;
      if (thankYouSale.cashTendered != null) state.cashTendered = thankYouSale.cashTendered;
    }

    publish(state);
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
    activePayment,
    cashTenderedInput,
    totalAmount,
    reloadOpen,
    reloadPhone,
    qrPayment,
    bankPayment,
    publish,
  ]);

  // Heartbeat: while the POS page is open (also while it is PIN-locked) the display keeps receiving the current state, so an idle cashier is not
  // mistaken for a lost connection, and a closed / frozen POS is noticed (the display stops trusting a payment screen).
  React.useEffect(() => {
    const t = window.setInterval(() => {
      const last = lastStateRef.current;
      if (last) publish({ ...last, updatedAt: Date.now() });
    }, CUSTOMER_DISPLAY_HEARTBEAT_MS);
    return () => window.clearInterval(t);
  }, [publish]);

  // The cashier window is leaving (POS closed / page closed): clear the payment screen right away.
  React.useEffect(() => {
    const clear = () => {
      const last = lastStateRef.current;
      if (!last) return;
      const { qrPayment: _q, paymentSessionId: _s, ...rest } = last;
      void _q; void _s;
      publishCustomerDisplayState({ ...rest, phase: "waiting", items: [], itemCount: 0, lastAdded: undefined, paymentMethod: undefined, cashTendered: undefined, changeDue: undefined, updatedAt: Date.now() });
      lastStateRef.current = null;
    };
    window.addEventListener("pagehide", clear);
    return () => { window.removeEventListener("pagehide", clear); clear(); };
  }, []);
}

export type { ThankYouSale };
