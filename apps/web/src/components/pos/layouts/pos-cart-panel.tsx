"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import type { CartItem, Customer } from "@/types";
import type { PosLayoutId } from "@/lib/pos-layouts";
import { getPosLayoutUi } from "@/lib/pos-layouts";
import { cn } from "@/lib/utils";
import { PosCartCustomerPicker, type PosCartCustomerListItem } from "@/components/pos/layouts/pos-cart-customer-picker";
import { PosCartItemsList } from "@/components/pos/layouts/pos-cart-items-list";
import { PosCartTotalsFooter } from "@/components/pos/layouts/pos-cart-totals-footer";

type PendingDiscount = {
  type: "percentage" | "fixed";
  value: number;
  entityId?: string;
};

type ResizeHandlers = {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => void;
};

type Props = {
  posLayout: PosLayoutId;
  cartWidth: number;
  lightUi: boolean;
  itemCount: number;
  items: CartItem[];
  selectedCartIdx: number;
  editingCartQtyIdx: number | null;
  editingCartQtyRaw: string;
  customerLabel: string;
  customer: Customer | null;
  cartCustomerOpen: boolean;
  customerSearch: string;
  customerLoading: boolean;
  customers: PosCartCustomerListItem[];
  focusedCustomerIdx: number;
  cartShowNewCust: boolean;
  cartCustomerDropdownRef: React.RefObject<HTMLDivElement | null>;
  cartCustomerSearchRef: React.RefObject<HTMLInputElement | null>;
  checkoutLoading: boolean;
  pendingDiscountApproval: PendingDiscount | null;
  adminBypass: boolean;
  discountEditType: "percentage" | "fixed";
  discountInput: string;
  discount: number;
  discountType: "percentage" | "fixed";
  cartDiscountAmt: number;
  itemDiscountTotal: number;
  tierDiscountAmt: number;
  couponDiscount: number;
  couponCode: string;
  loyaltyDiscountAmt: number;
  totalSavings: number;
  taxRate: number;
  totalAmt: number;
  subtotalWithItems: number;
  taxAmount: number;
  discountInputRef: React.RefObject<HTMLInputElement | null>;
  resize: ResizeHandlers;
  onClearCart: () => void;
  onSelectLine: (idx: number) => void;
  onUpdateQty: (variantId: string, qty: number) => void;
  onRemoveLine: (variantId: string, idx: number) => void;
  onEditQtyStart: (idx: number, raw: string) => void;
  onEditQtyRawChange: (raw: string) => void;
  onEditQtyEnd: () => void;
  onToggleCustomerDropdown: () => void;
  onCustomerSearchChange: (value: string) => void;
  onFocusedCustomerIdxChange: (idx: number) => void;
  onSelectWalkIn: () => void;
  onSelectCustomer: (c: PosCartCustomerListItem) => void;
  onRemoveCustomer: () => void;
  onRegisterCustomer: (phoneHint?: string) => void;
  onRegisterFromEmpty: () => void;
  onDiscountEditTypeChange: (type: "percentage" | "fixed") => void;
  onDiscountInputChange: (value: string) => void;
  onApplyDiscount: () => void;
  onPayCash: () => void;
  onOpenCheckout: () => void;
  onHoldBill: () => void;
  onOpenHeldBills: () => void;
  onOpenOrders: () => void;
  onOpenReload: () => void;
  children?: React.ReactNode;
};

export function PosCartPanel(props: Props) {
  const {
    posLayout,
    cartWidth,
    lightUi,
    itemCount,
    items,
    selectedCartIdx,
    editingCartQtyIdx,
    editingCartQtyRaw,
    customerLabel,
    customer,
    cartCustomerOpen,
    customerSearch,
    customerLoading,
    customers,
    focusedCustomerIdx,
    cartShowNewCust,
    cartCustomerDropdownRef,
    cartCustomerSearchRef,
    checkoutLoading,
    pendingDiscountApproval,
    adminBypass,
    discountEditType,
    discountInput,
    discount,
    discountType,
    cartDiscountAmt,
    itemDiscountTotal,
    tierDiscountAmt,
    couponDiscount,
    couponCode,
    loyaltyDiscountAmt,
    totalSavings,
    taxRate,
    totalAmt,
    subtotalWithItems,
    taxAmount,
    discountInputRef,
    resize,
    onClearCart,
    onSelectLine,
    onUpdateQty,
    onRemoveLine,
    onEditQtyStart,
    onEditQtyRawChange,
    onEditQtyEnd,
    onToggleCustomerDropdown,
    onCustomerSearchChange,
    onFocusedCustomerIdxChange,
    onSelectWalkIn,
    onSelectCustomer,
    onRemoveCustomer,
    onRegisterCustomer,
    onRegisterFromEmpty,
    onDiscountEditTypeChange,
    onDiscountInputChange,
    onApplyDiscount,
    onPayCash,
    onOpenCheckout,
    onHoldBill,
    onOpenHeldBills,
    onOpenOrders,
    onOpenReload,
    children,
  } = props;

  const layoutUi = getPosLayoutUi(posLayout);
  const retailUi = layoutUi.retailUi;
  const orderListHeader = layoutUi.cartHeader === "order-list";
  const cartMaxWidth = layoutUi.checkoutWide ? "50vw" : "48vw";

  return (
    <div
      className={cn(
        "pos-cart-panel relative flex flex-col shrink-0 border-l min-w-0",
        retailUi && "product-order-list",
      )}
      style={{
        width: cartWidth,
        maxWidth: cartMaxWidth,
        minWidth: 320,
        background: "var(--pos-panel)",
        borderColor: "var(--pos-border)",
      }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize cart"
        title="Drag to resize cart"
        onPointerDown={resize.onPointerDown}
        onPointerMove={resize.onPointerMove}
        onPointerUp={resize.onPointerUp}
        onPointerCancel={resize.onPointerCancel}
        className="absolute left-0 top-0 bottom-0 w-1.5 -translate-x-1/2 z-20 cursor-col-resize hover:bg-blue-500/40 active:bg-blue-500/60"
      />
      <div
        className={cn(
          "pos-cart-header flex items-center justify-between shrink-0 gap-2",
          retailUi ? "pos-order-head border-0" : "px-4 py-3 border-b",
        )}
        style={{ borderColor: "var(--pos-border)" }}
      >
        <div className="min-w-0">
          <span className="font-bold text-lg truncate block" style={{ color: "var(--pos-text)" }}>
            {orderListHeader || retailUi ? "Order List" : `Cart (${itemCount} Items)`}
          </span>
          {(orderListHeader || retailUi) && (
            <span className="text-[11px] font-semibold" style={{ color: "var(--pos-muted)" }}>
              {itemCount} item{itemCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClearCart}
          className="flex items-center gap-1.5 text-sm font-semibold hover:text-red-400 transition-colors shrink-0"
          style={{ color: "#ef4444" }}
        >
          <Trash2 className="h-4 w-4" />
          {retailUi ? "Clear all" : "Clear"}
        </button>
      </div>
      <PosCartCustomerPicker
        retailUi={retailUi}
        customerLabel={customerLabel}
        customer={customer}
        open={cartCustomerOpen}
        search={customerSearch}
        loading={customerLoading}
        customers={customers}
        focusedIdx={focusedCustomerIdx}
        showNewForm={cartShowNewCust}
        containerRef={cartCustomerDropdownRef}
        searchRef={cartCustomerSearchRef}
        onToggle={onToggleCustomerDropdown}
        onSearchChange={onCustomerSearchChange}
        onFocusIdxChange={onFocusedCustomerIdxChange}
        onSelectWalkIn={onSelectWalkIn}
        onSelectCustomer={onSelectCustomer}
        onRemoveCustomer={onRemoveCustomer}
        onRegister={onRegisterCustomer}
        onRegisterFromEmpty={onRegisterFromEmpty}
      />
      <div className={cn("flex-1 overflow-y-auto min-h-0", retailUi && "pos-block-section product-added")}>
        {retailUi && (
          <div className="pos-order-details-head px-1 pb-2">
            <h5 className="text-sm font-bold text-white m-0">Order Details</h5>
            <div className="pos-items-badge">
              Items : <span>{itemCount}</span>
            </div>
          </div>
        )}
        <PosCartItemsList
          cartStyle={layoutUi.cartStyle}
          items={items}
          selectedCartIdx={selectedCartIdx}
          editingCartQtyIdx={editingCartQtyIdx}
          editingCartQtyRaw={editingCartQtyRaw}
          onSelectLine={onSelectLine}
          onUpdateQty={onUpdateQty}
          onRemove={onRemoveLine}
          onEditQtyStart={onEditQtyStart}
          onEditQtyRawChange={onEditQtyRawChange}
          onEditQtyEnd={onEditQtyEnd}
        />
      </div>
      <PosCartTotalsFooter
        retailUi={retailUi}
        payButtons={layoutUi.payButtons}
        lightUi={lightUi}
        itemCount={itemCount}
        checkoutLoading={checkoutLoading}
        pendingDiscountApproval={pendingDiscountApproval}
        adminBypass={adminBypass}
        discountEditType={discountEditType}
        discountInput={discountInput}
        discount={discount}
        discountType={discountType}
        cartDiscountAmt={cartDiscountAmt}
        itemDiscountTotal={itemDiscountTotal}
        tierDiscountAmt={tierDiscountAmt}
        couponDiscount={couponDiscount}
        couponCode={couponCode}
        loyaltyDiscountAmt={loyaltyDiscountAmt}
        totalSavings={totalSavings}
        taxRate={taxRate}
        totalAmt={totalAmt}
        subtotalWithItems={subtotalWithItems}
        taxAmount={taxAmount}
        discountInputRef={discountInputRef}
        onDiscountEditTypeChange={onDiscountEditTypeChange}
        onDiscountInputChange={onDiscountInputChange}
        onApplyDiscount={onApplyDiscount}
        onPayCash={onPayCash}
        onOpenCheckout={onOpenCheckout}
        onHoldBill={onHoldBill}
        onOpenHeldBills={onOpenHeldBills}
        onOpenOrders={onOpenOrders}
        onClearCart={onClearCart}
        onOpenReload={onOpenReload}
      />
      {children}
    </div>
  );
}
