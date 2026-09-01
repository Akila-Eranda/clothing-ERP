"use client";

import * as React from "react";
import { Banknote, ChevronRight, Clock, Loader2, Tag } from "lucide-react";
import type { PosLayoutPayButtons } from "@/lib/pos-layouts";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { DISCOUNT_APPROVAL_THRESHOLD_PCT } from "@/lib/workflow-access";
type PendingDiscount = {
  type: "percentage" | "fixed";
  value: number;
  entityId?: string;
};

type Props = {
  retailUi: boolean;
  payButtons: PosLayoutPayButtons;
  lightUi: boolean;
  itemCount: number;
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
  onDiscountEditTypeChange: (type: "percentage" | "fixed") => void;
  onDiscountInputChange: (value: string) => void;
  onApplyDiscount: () => void;
  onPayCash: () => void;
  onOpenCheckout: () => void;
};

export function PosCartTotalsFooter({
  retailUi,
  payButtons,
  lightUi,
  itemCount,
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
  onDiscountEditTypeChange,
  onDiscountInputChange,
  onApplyDiscount,
  onPayCash,
  onOpenCheckout,
}: Props) {
  const inactiveToggleBg = lightUi ? "#334155" : "transparent";
  const payBtnClass =
    payButtons === "stacked"
      ? "pos-cta h-[48px] rounded-lg flex items-center justify-center gap-1.5 text-sm font-bold transition-all hover:opacity-90 disabled:opacity-40 w-full"
      : "pos-cta h-[52px] rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold transition-all hover:opacity-90 disabled:opacity-40";

  return (
    <div className="shrink-0 border-t" style={{ borderColor: "var(--pos-border)" }}>
      <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: "var(--pos-border)" }}>
        <div
          className="flex shrink-0 rounded-lg p-0.5 gap-0.5"
          style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
        >
          <button
            type="button"
            disabled={!!pendingDiscountApproval}
            onClick={() => onDiscountEditTypeChange("percentage")}
            className="h-8 px-2.5 rounded-md text-xs font-bold transition-all"
            style={{
              background: discountEditType === "percentage" ? "var(--pos-accent)" : inactiveToggleBg,
              color: "#ffffff",
            }}
          >
            %
          </button>
          <button
            type="button"
            disabled={!!pendingDiscountApproval}
            onClick={() => onDiscountEditTypeChange("fixed")}
            className="h-8 px-2.5 rounded-md text-xs font-bold transition-all"
            style={{
              background: discountEditType === "fixed" ? "var(--pos-accent)" : inactiveToggleBg,
              color: "#ffffff",
            }}
          >
            LKR
          </button>
        </div>
        <input
          ref={discountInputRef}
          type="number"
          min="0"
          max={discountEditType === "percentage" ? 100 : undefined}
          step="0.01"
          value={discountInput}
          onChange={(e) => onDiscountInputChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onApplyDiscount();
            }
          }}
          placeholder={
            pendingDiscountApproval
              ? pendingDiscountApproval.type === "percentage"
                ? `${pendingDiscountApproval.value}% pending`
                : `LKR ${pendingDiscountApproval.value} pending`
              : discount > 0
                ? discountType === "percentage"
                  ? `${discount}% active`
                  : `LKR ${discount} active`
                : discountEditType === "percentage"
                  ? "0 %"
                  : "0.00"
          }
          disabled={!!pendingDiscountApproval}
          className="flex-1 h-9 rounded-lg px-3 text-sm text-white outline-none disabled:opacity-60 tabular-nums"
          style={{
            background: "var(--pos-input)",
            border: `1px solid ${pendingDiscountApproval ? "var(--pos-warn)" : discount > 0 ? "var(--pos-success)" : "var(--pos-border)"}`,
          }}
        />
        <button
          type="button"
          onClick={onApplyDiscount}
          disabled={!!pendingDiscountApproval}
          className="px-4 h-9 rounded-lg text-sm font-bold text-white transition-all hover:opacity-90 disabled:opacity-50"
          style={{ background: "var(--pos-accent)" }}
        >
          {pendingDiscountApproval ? "Pending" : "Apply"}
        </button>
      </div>
      {discount > 0 && cartDiscountAmt > 0 && !pendingDiscountApproval && (
        <div
          className="mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2"
          style={{
            background: "rgba(16,185,129,0.12)",
            border: "1px solid rgba(16,185,129,0.35)",
            color: "var(--pos-success-soft)",
          }}
        >
          <span className="font-semibold flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />
            {discountType === "percentage" ? `${discount}%` : `LKR ${formatNumber(discount)}`} cart discount
            applied
          </span>
          <span className="font-bold tabular-nums">−LKR {formatNumber(cartDiscountAmt)}</span>
        </div>
      )}
      {pendingDiscountApproval && (
        <div
          className="mx-4 mb-2 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
          style={{
            background: "var(--pos-warn-bg)",
            border: "1px solid var(--pos-warn-border)",
            color: "var(--pos-warn-soft)",
          }}
        >
          <Clock className="h-3.5 w-3.5 shrink-0" />
          {pendingDiscountApproval.type === "percentage"
            ? `${pendingDiscountApproval.value}%`
            : `LKR ${formatNumber(pendingDiscountApproval.value)}`}{" "}
          discount awaiting manager approval (auto-applies when approved)
        </div>
      )}
      {!adminBypass && !pendingDiscountApproval && (
        <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--pos-muted)" }}>
          Discounts over {DISCOUNT_APPROVAL_THRESHOLD_PCT}% of subtotal require manager approval via Workflows
        </p>
      )}
      {retailUi ? (
        <div className="pos-order-total-wrap">
          <table className="pos-order-total-table">
            <tbody>
              <tr>
                <td>Sub Total</td>
                <td>LKR {formatNumber(subtotalWithItems)}</td>
              </tr>
              {itemDiscountTotal > 0.001 && (
                <tr>
                  <td>Item discounts</td>
                  <td style={{ color: "var(--pos-success-soft)" }}>−LKR {formatNumber(itemDiscountTotal)}</td>
                </tr>
              )}
              {cartDiscountAmt > 0 && (
                <tr>
                  <td>Discount</td>
                  <td style={{ color: "var(--pos-success-soft)" }}>−LKR {formatNumber(cartDiscountAmt)}</td>
                </tr>
              )}
              {tierDiscountAmt > 0 && (
                <tr>
                  <td>Tier discount</td>
                  <td style={{ color: "var(--pos-success-soft)" }}>−LKR {formatNumber(tierDiscountAmt)}</td>
                </tr>
              )}
              {couponDiscount > 0 && (
                <tr>
                  <td>Coupon</td>
                  <td style={{ color: "var(--pos-success-soft)" }}>−LKR {formatNumber(couponDiscount)}</td>
                </tr>
              )}
              {loyaltyDiscountAmt > 0 && (
                <tr>
                  <td>Loyalty</td>
                  <td style={{ color: "var(--pos-success-soft)" }}>−LKR {formatNumber(loyaltyDiscountAmt)}</td>
                </tr>
              )}
              <tr>
                <td>{taxRate > 0 ? `Tax (${taxRate}%)` : "Tax"}</td>
                <td>LKR {formatNumber(taxAmount)}</td>
              </tr>
              <tr className="pos-order-grand">
                <td>Grand Total</td>
                <td data-pos-price="">LKR {formatNumber(totalAmt)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
      <div className="px-4 py-3 space-y-1.5 border-b pos-cart-totals" style={{ borderColor: "var(--pos-border)" }}>
        <div className="flex justify-between text-sm" style={{ color: "var(--pos-muted)" }}>
          <span>Sub Total</span>
          <span>LKR {formatNumber(subtotalWithItems)}</span>
        </div>
        {itemDiscountTotal > 0.001 && (
          <div className="flex justify-between text-sm" style={{ color: "var(--pos-success-soft)" }}>
            <span>Item discounts</span>
            <span>−LKR {formatNumber(itemDiscountTotal)}</span>
          </div>
        )}
        {cartDiscountAmt > 0 && (
          <div className="flex justify-between text-sm font-semibold" style={{ color: "var(--pos-success-soft)" }}>
            <span>
              Discount
              {discountType === "percentage" && discount > 0
                ? ` (${discount}%)`
                : discountType === "fixed" && discount > 0
                  ? ` (LKR ${formatNumber(discount)})`
                  : ""}
            </span>
            <span>−LKR {formatNumber(cartDiscountAmt)}</span>
          </div>
        )}
        {tierDiscountAmt > 0 && (
          <div className="flex justify-between text-sm" style={{ color: "var(--pos-success-soft)" }}>
            <span>Tier discount</span>
            <span>−LKR {formatNumber(tierDiscountAmt)}</span>
          </div>
        )}
        {couponDiscount > 0 && (
          <div className="flex justify-between text-sm" style={{ color: "var(--pos-success-soft)" }}>
            <span>Coupon{couponCode ? ` (${couponCode})` : ""}</span>
            <span>−LKR {formatNumber(couponDiscount)}</span>
          </div>
        )}
        {loyaltyDiscountAmt > 0 && (
          <div className="flex justify-between text-sm" style={{ color: "var(--pos-success-soft)" }}>
            <span>Loyalty</span>
            <span>−LKR {formatNumber(loyaltyDiscountAmt)}</span>
          </div>
        )}
        {totalSavings > 0.001 && (
          <div className="flex justify-between text-xs font-bold pt-1" style={{ color: "var(--pos-success)" }}>
            <span>Total saved</span>
            <span>LKR {formatNumber(totalSavings)}</span>
          </div>
        )}
        <div
          className="flex justify-between text-sm"
          style={{ color: taxRate > 0 ? "var(--pos-muted)" : "var(--pos-muted-2)" }}
        >
          <span>{taxRate > 0 ? `Tax (${taxRate}% — POS setting)` : "Tax (off — POS setting)"}</span>
          <span>LKR {formatNumber(taxAmount)}</span>
        </div>
        <div
          className="flex justify-between text-xl font-bold text-white pt-2 border-t pos-cart-grand-total"
          style={{ borderColor: "var(--pos-border)" }}
        >
          <span>Grand Total</span>
          <span style={{ color: "var(--pos-price)" }} data-pos-price="">
            LKR {formatNumber(totalAmt)}
          </span>
        </div>
      </div>
      )}
      <div
        className={cn(
          "p-3",
          payButtons === "stacked" ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2",
        )}
      >
        <button
          type="button"
          onClick={onPayCash}
          disabled={itemCount === 0 || checkoutLoading || !!pendingDiscountApproval}
          data-pos-accent=""
          className={payBtnClass}
          style={{
            background: "linear-gradient(135deg,var(--pos-success),var(--pos-success-2))",
            color: "#ffffff",
          }}
        >
          {checkoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
          Pay Cash
          <span className="text-[10px] font-mono" style={{ opacity: 0.9 }}>
            ⌃↵
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenCheckout}
          disabled={itemCount === 0}
          data-pos-accent=""
          className={payBtnClass}
          style={{ background: "var(--pos-accent-grad)", color: "#ffffff" }}
        >
          <ChevronRight className="h-4 w-4" />
          Pay / Card
          <span className="text-[10px] font-mono" style={{ opacity: 0.9 }}>
            F9
          </span>
        </button>
      </div>
    </div>
  );
}
