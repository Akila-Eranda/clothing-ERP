"use client";

import * as React from "react";
import { Plus, Trash2, Tag, Wallet, Split, UserCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { calcTierDiscount } from "@/lib/pos-totals";

const PAY_OPTIONS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "UPI", label: "UPI" },
  { value: "WALLET", label: "Wallet" },
  { value: "CUSTOMER_CREDIT", label: "Credit" },
] as const;

export interface PaymentLine {
  method: string;
  amount: string;
}

export interface PosPaymentState {
  splitMode: boolean;
  paymentLines: PaymentLine[];
  allowPartial: boolean;
  couponCode: string;
  couponDiscount: number;
  tierDiscountPct: number;
  currency: string;
}

interface Props {
  totalAmt: number;
  subtotal: number;
  customerWallet?: number;
  customerCreditLimit?: number;
  customerCreditBalance?: number;
  customerTier?: string;
  onCouponChange: (code: string | null, discount: number) => void;
  onStateChange: (patch: Partial<PosPaymentState>) => void;
  state: PosPaymentState;
}

const TIER_PCT: Record<string, number> = {
  bronze: 0, silver: 3, gold: 5, platinum: 8, diamond: 10,
};

export function PosPaymentPanel({
  totalAmt, subtotal, customerWallet, customerCreditLimit, customerCreditBalance, customerTier, onCouponChange, onStateChange, state,
}: Props) {
  const tierPct = customerTier ? (TIER_PCT[customerTier.toLowerCase()] ?? 0) : state.tierDiscountPct;
  const tierAmt = calcTierDiscount(subtotal, customerTier);
  const creditAvailable = customerCreditLimit !== undefined && customerCreditBalance !== undefined
    ? Math.max(0, customerCreditLimit - customerCreditBalance)
    : undefined;

  React.useEffect(() => {
    onStateChange({ tierDiscountPct: tierPct });
  }, [tierPct, onStateChange]);

  const paidTotal = state.paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const balance = Math.max(0, totalAmt - paidTotal);

  const applyCoupon = async () => {
    const code = state.couponCode.trim();
    if (!code) { onCouponChange(null, 0); return; }
    try {
      const r = await api.get<{ valid: boolean; reason?: string; discountAmount?: number; name?: string }>(
        `/pos/coupons/validate/${encodeURIComponent(code)}?amount=${subtotal}`,
      );
      const d = r.data;
      if (!d.valid) { toast.error(d.reason ?? "Invalid code"); onCouponChange(null, 0); return; }
      onCouponChange(code.toUpperCase(), d.discountAmount ?? 0);
      toast.success(`${d.name ?? "Coupon"} applied — LKR ${formatNumber(d.discountAmount ?? 0)} off`);
    } catch {
      toast.error("Failed to validate coupon");
    }
  };

  const addLine = () => {
    onStateChange({
      paymentLines: [...state.paymentLines, { method: "CARD", amount: balance > 0 ? String(balance) : "" }],
    });
  };

  const updateLine = (idx: number, patch: Partial<PaymentLine>) => {
    onStateChange({
      paymentLines: state.paymentLines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    });
  };

  const removeLine = (idx: number) => {
    if (state.paymentLines.length <= 1) return;
    onStateChange({ paymentLines: state.paymentLines.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-2 px-3 py-2 border-b" style={{ borderColor: "#1e3356" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Advanced Payment</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "#1a2b4a", color: "#6a8ab8" }}>
          {state.currency}
        </span>
      </div>

      {tierPct > 0 && customerTier && (
        <div className="flex justify-between text-xs text-emerald-400 px-1">
          <span>{customerTier} tier discount ({tierPct}%)</span>
          <span>-LKR {formatNumber(tierAmt)}</span>
        </div>
      )}

      <div className="flex gap-1.5">
        <Input
          value={state.couponCode}
          onChange={(e) => onStateChange({ couponCode: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
          placeholder="Coupon / gift voucher"
          className="h-8 text-xs text-white flex-1"
          style={{ background: "#1a2b4a", borderColor: "#1e3356" }}
        />
        <button type="button" onClick={applyCoupon}
          className="px-2.5 h-8 rounded-lg text-xs font-bold text-white flex items-center gap-1"
          style={{ background: "#4f6ef7" }}>
          <Tag className="h-3 w-3" /> Apply
        </button>
      </div>
      {state.couponDiscount > 0 && (
        <p className="text-[10px] text-emerald-400 px-1">Coupon discount: LKR {formatNumber(state.couponDiscount)}</p>
      )}

      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#6a8ab8" }}>
          <Switch checked={state.splitMode} onCheckedChange={(v) => {
            onStateChange({
              splitMode: v,
              paymentLines: v
                ? [{ method: "CASH", amount: "" }, { method: "CARD", amount: "" }]
                : [{ method: "CASH", amount: "" }],
            });
          }} />
          <Split className="h-3 w-3" /> Split payment
        </label>
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#6a8ab8" }}>
          <Switch checked={state.allowPartial} onCheckedChange={(v) => onStateChange({ allowPartial: v })} />
          Partial pay
        </label>
      </div>

      {state.splitMode ? (
        <div className="space-y-1.5">
          {state.paymentLines.map((line, idx) => (
            <div key={idx} className="flex gap-1.5 items-center">
              <select value={line.method} onChange={(e) => updateLine(idx, { method: e.target.value })}
                className="h-8 rounded-lg text-xs px-2 text-white outline-none"
                style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}>
                {PAY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <Input type="number" min="0" value={line.amount}
                onChange={(e) => updateLine(idx, { amount: e.target.value })}
                placeholder="Amount"
                className="h-8 text-xs text-white flex-1"
                style={{ background: "#1a2b4a", borderColor: "#1e3356" }} />
              {state.paymentLines.length > 1 && (
                <button type="button" onClick={() => removeLine(idx)} className="p-1.5 rounded hover:bg-white/10">
                  <Trash2 className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addLine}
            className="text-[10px] flex items-center gap-1 font-semibold"
            style={{ color: "#4f6ef7" }}>
            <Plus className="h-3 w-3" /> Add payment line
          </button>
          <div className="flex justify-between text-xs pt-1">
            <span style={{ color: "#6a8ab8" }}>Paid / Due</span>
            <span className={balance > 0.01 && !state.allowPartial ? "text-amber-400" : "text-emerald-400"}>
              LKR {formatNumber(paidTotal)} / {formatNumber(totalAmt)}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-1 px-1">
          {customerWallet !== undefined && customerWallet > 0 && (
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "#6a8ab8" }}>
              <Wallet className="h-3 w-3" /> Wallet: LKR {formatNumber(customerWallet)}
            </div>
          )}
          {creditAvailable !== undefined && customerCreditLimit !== undefined && customerCreditLimit > 0 && (
            <div className="flex items-center justify-between text-[10px]" style={{ color: "#6a8ab8" }}>
              <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> Credit available</span>
              <span className={creditAvailable < totalAmt ? "text-amber-400" : "text-emerald-400"}>
                LKR {formatNumber(creditAvailable)}
                {customerCreditBalance !== undefined && customerCreditBalance > 0 && (
                  <span className="text-[9px] ml-1 opacity-80">(owed {formatNumber(customerCreditBalance)})</span>
                )}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function buildCheckoutPayments(
  state: PosPaymentState,
  activePayment: string,
  numpad: string,
  totalAmt: number,
): { method: string; amount: number }[] {
  if (state.splitMode) {
    return state.paymentLines
      .map((l) => ({ method: l.method, amount: parseFloat(l.amount) || 0 }))
      .filter((p) => p.amount > 0);
  }
  const cashAmt = activePayment === "CASH" && numpad ? parseFloat(numpad) : totalAmt;
  return [{ method: activePayment, amount: cashAmt || totalAmt }];
}
