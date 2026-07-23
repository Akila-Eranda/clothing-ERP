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
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "QR", label: "QR Pay" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CUSTOMER_CREDIT", label: "Credit" },
] as const;

export interface PaymentLine {
  method: string;
  amount: string;
  reference?: string;
  bankAccountId?: string;
}

export type PosBankAccountOption = {
  id: string;
  code: string;
  name: string;
  bankName?: string | null;
  currentBalance?: number;
};

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
  activePayment?: string;
  payNowAmount?: string;
  onPayNowAmountChange?: (v: string) => void;
  onCouponChange: (code: string | null, discount: number) => void;
  onStateChange: (patch: Partial<PosPaymentState>) => void;
  state: PosPaymentState;
  couponInputRef?: React.RefObject<HTMLInputElement | null>;
  partialPayInputRef?: React.RefObject<HTMLInputElement | null>;
  bankAccounts?: PosBankAccountOption[];
}

const TIER_PCT: Record<string, number> = {
  bronze: 0, silver: 3, gold: 5, platinum: 8, diamond: 10,
};

export function PosPaymentPanel({
  totalAmt, subtotal, customerWallet, customerCreditLimit, customerCreditBalance, customerTier,
  activePayment, payNowAmount, onPayNowAmountChange,
  onCouponChange, onStateChange, state,
  couponInputRef, partialPayInputRef, bankAccounts = [],
}: Props) {
  const tierPct = customerTier ? (TIER_PCT[customerTier.toLowerCase()] ?? 0) : state.tierDiscountPct;
  const tierAmt = calcTierDiscount(subtotal, customerTier);
  const creditAvailable = customerCreditLimit !== undefined && customerCreditBalance !== undefined
    ? Math.max(0, customerCreditLimit - customerCreditBalance)
    : undefined;
  const hasCreditCustomer = (customerCreditLimit ?? 0) > 0;

  React.useEffect(() => {
    onStateChange({ tierDiscountPct: tierPct });
  }, [tierPct, onStateChange]);

  const paidTotal = state.splitMode
    ? state.paymentLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
    : (parseFloat(payNowAmount ?? "") || 0);
  const balance = Math.max(0, totalAmt - paidTotal);
  const onCreditAmt = state.allowPartial && hasCreditCustomer ? balance : 0;

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
    <div className="space-y-2 px-3 py-2 border-b" style={{ borderColor: "var(--pos-border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Advanced Payment</span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: "var(--pos-input)", color: "var(--pos-muted)" }}>
          {state.currency}
        </span>
      </div>

      {tierPct > 0 && customerTier && (
        <div className="flex justify-between text-xs px-1" style={{ color: "var(--pos-success-soft)" }}>
          <span>{customerTier} tier discount ({tierPct}%)</span>
          <span>-LKR {formatNumber(tierAmt)}</span>
        </div>
      )}

      <div className="flex gap-1.5">
        <Input
          ref={couponInputRef}
          value={state.couponCode}
          onChange={(e) => onStateChange({ couponCode: e.target.value })}
          onKeyDown={(e) => { if (e.key === "Enter") applyCoupon(); }}
          placeholder="Coupon / gift voucher"
          className="h-8 text-xs text-white flex-1"
          style={{ background: "var(--pos-input)", borderColor: "var(--pos-border)" }}
        />
        <button type="button" onClick={applyCoupon} data-pos-accent=""
          className="pos-cta px-2.5 h-8 rounded-lg text-xs font-bold flex items-center gap-1"
          style={{ background: "#4f6ef7", color: "#ffffff" }}>
          <Tag className="h-3 w-3" /> Apply
        </button>
      </div>
      {state.couponDiscount > 0 && (
        <p className="text-[10px] px-1" style={{ color: "var(--pos-success-soft)" }}>Coupon discount: LKR {formatNumber(state.couponDiscount)}</p>
      )}

      <div className="flex items-center justify-between text-xs">
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--pos-muted)" }}>
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
        <label className="flex items-center gap-2 cursor-pointer" style={{ color: "var(--pos-muted)" }}>
          <Switch checked={state.allowPartial} onCheckedChange={(v) => onStateChange({ allowPartial: v })} />
          Partial pay
        </label>
      </div>

      {state.allowPartial && hasCreditCustomer && !state.splitMode && (
        <div className="rounded-xl border px-3 py-2 space-y-2" style={{ background: "rgba(79,110,247,0.08)", borderColor: "rgba(79,110,247,0.25)" }}>
          <p className="text-[10px] font-semibold" style={{ color: "var(--pos-accent-soft)" }}>
            Pay part now — balance goes on customer credit account
          </p>
          <div className="space-y-1">
            <label className="text-[10px] font-semibold" style={{ color: "var(--pos-muted)" }}>Paying now (LKR)</label>
            <Input
              ref={partialPayInputRef}
              type="number"
              min={0}
              step="0.01"
              value={payNowAmount ?? ""}
              onChange={(e) => onPayNowAmountChange?.(e.target.value)}
              placeholder={`0 — full bill LKR ${formatNumber(totalAmt)}`}
              className="h-9 text-sm text-white"
              style={{ background: "var(--pos-input)", borderColor: "var(--pos-border)" }}
            />
          </div>
          {paidTotal > 0 && paidTotal + 0.01 < totalAmt && (
            <div className="flex justify-between text-xs pt-1 border-t" style={{ borderColor: "var(--pos-border)" }}>
              <span style={{ color: "var(--pos-muted)" }}>Pay now</span>
              <span className="font-bold tabular-nums" style={{ color: "var(--pos-success-soft)" }}>LKR {formatNumber(paidTotal)}</span>
            </div>
          )}
          {onCreditAmt > 0.01 && (
            <div className="flex justify-between text-xs">
              <span style={{ color: "var(--pos-muted)" }}>On credit (later)</span>
              <span className="text-amber-400 font-bold tabular-nums">LKR {formatNumber(onCreditAmt)}</span>
            </div>
          )}
          {onCreditAmt > 0.01 && creditAvailable !== undefined && onCreditAmt > creditAvailable + 0.01 && (
            <p className="text-[10px] text-red-400">Exceeds credit available (LKR {formatNumber(creditAvailable)})</p>
          )}
        </div>
      )}

      {state.splitMode ? (
        <div className="space-y-1.5">
          {state.paymentLines.map((line, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex gap-1.5 items-center">
                <select value={line.method} onChange={(e) => updateLine(idx, { method: e.target.value })}
                  className="h-8 rounded-lg text-xs px-2 text-white outline-none"
                  style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}>
                  {PAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <Input type="number" min="0" value={line.amount}
                  onChange={(e) => updateLine(idx, { amount: e.target.value })}
                  placeholder="Amount"
                  className="h-8 text-xs text-white flex-1"
                  style={{ background: "var(--pos-input)", borderColor: "var(--pos-border)" }} />
                {state.paymentLines.length > 1 && (
                  <button type="button" onClick={() => removeLine(idx)} className="p-1.5 rounded hover:bg-white/10">
                    <Trash2 className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />
                  </button>
                )}
              </div>
              {line.method === "CHEQUE" && (
                <Input
                  value={line.reference ?? ""}
                  onChange={(e) => updateLine(idx, { reference: e.target.value })}
                  placeholder="Cheque number"
                  className="h-8 text-xs text-white"
                  style={{ background: "var(--pos-input)", borderColor: "var(--pos-border)" }}
                />
              )}
              {line.method === "CARD" && (
                <Input
                  value={line.reference ?? ""}
                  onChange={(e) =>
                    updateLine(idx, {
                      reference: e.target.value.replace(/\D/g, "").slice(0, 3),
                    })
                  }
                  inputMode="numeric"
                  maxLength={3}
                  placeholder="Card last 3 digits"
                  className="h-8 text-xs text-white font-mono tracking-widest"
                  style={{ background: "var(--pos-input)", borderColor: "var(--pos-border)" }}
                />
              )}
              {(line.method === "BANK_TRANSFER" || line.method === "QR") && (
                <select
                  value={line.bankAccountId ?? ""}
                  onChange={(e) => updateLine(idx, { bankAccountId: e.target.value })}
                  className="h-8 w-full rounded-lg text-xs px-2 text-white outline-none"
                  style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
                >
                  <option value="">Select bank account…</option>
                  {bankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}{b.bankName ? ` · ${b.bankName}` : ""}{b.code ? ` (${b.code})` : ""}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ))}
          <button type="button" onClick={addLine}
            className="text-[10px] flex items-center gap-1 font-semibold"
            style={{ color: "#4f6ef7" }}>
            <Plus className="h-3 w-3" /> Add payment line
          </button>
          <div className="flex justify-between text-xs pt-1">
            <span style={{ color: "var(--pos-muted)" }}>Paid / Due</span>
            <span style={{ color: balance > 0.01 && !state.allowPartial ? "var(--pos-warn)" : "var(--pos-success-soft)" }}>
              LKR {formatNumber(paidTotal)} / {formatNumber(totalAmt)}
            </span>
          </div>
        </div>
      ) : (
        <div className="space-y-1 px-1">
          {customerWallet !== undefined && customerWallet > 0 && (
            <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--pos-muted)" }}>
              <Wallet className="h-3 w-3" /> Wallet: LKR {formatNumber(customerWallet)}
            </div>
          )}
          {creditAvailable !== undefined && customerCreditLimit !== undefined && customerCreditLimit > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--pos-muted)" }}>
                <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> Credit available</span>
                <span style={{ color: creditAvailable < totalAmt ? "var(--pos-warn)" : "var(--pos-success-soft)" }}>
                  LKR {formatNumber(creditAvailable)}
                </span>
              </div>
              {customerCreditBalance !== undefined && customerCreditBalance > 0 && (
                <div className="flex items-center justify-between text-[10px]" style={{ color: "var(--pos-warn-soft)" }}>
                  <span>Outstanding owed</span>
                  <span className="font-bold tabular-nums">LKR {formatNumber(customerCreditBalance)}</span>
                </div>
              )}
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
  chequeNumber?: string,
  partialPayAmount?: string,
  cardLast3?: string,
  bankAccountId?: string,
): { method: string; amount: number; reference?: string; bankAccountId?: string }[] {
  const cardRef = (cardLast3 ?? "").replace(/\D/g, "").slice(0, 3);
  const bankId = (bankAccountId ?? "").trim() || undefined;
  if (state.splitMode) {
    return state.paymentLines
      .map((l) => {
        const ref =
          l.method === "CHEQUE"
            ? l.reference?.trim()
            : l.method === "CARD"
              ? (l.reference ?? "").replace(/\D/g, "").slice(0, 3)
              : l.reference?.trim();
        const lineBank =
          l.method === "BANK_TRANSFER" || l.method === "QR"
            ? (l.bankAccountId ?? "").trim() || undefined
            : undefined;
        return {
          method: l.method,
          amount: parseFloat(l.amount) || 0,
          ...(ref ? { reference: ref } : {}),
          ...(lineBank ? { bankAccountId: lineBank } : {}),
        };
      })
      .filter((p) => p.amount > 0);
  }
  if (state.allowPartial) {
    const raw = (partialPayAmount?.trim() || (activePayment === "CASH" ? numpad : "")).trim();
    const payNow = parseFloat(raw);
    if (!Number.isNaN(payNow) && payNow > 0 && payNow + 0.01 < totalAmt) {
      const method = activePayment === "CUSTOMER_CREDIT" ? "CASH" : activePayment;
      if (method === "CHEQUE") {
        return [{ method: "CHEQUE", amount: payNow, reference: chequeNumber?.trim() || undefined }];
      }
      if (method === "CARD") {
        return [{ method: "CARD", amount: payNow, reference: cardRef || undefined }];
      }
      if (method === "BANK_TRANSFER" || method === "QR") {
        return [{ method, amount: payNow, bankAccountId: bankId }];
      }
      return [{ method, amount: payNow }];
    }
  }
  const cashAmt = activePayment === "CASH" && numpad ? parseFloat(numpad) : totalAmt;
  const amount = cashAmt || totalAmt;
  if (activePayment === "CHEQUE") {
    return [{ method: "CHEQUE", amount, reference: chequeNumber?.trim() || undefined }];
  }
  if (activePayment === "CARD") {
    return [{ method: "CARD", amount, reference: cardRef || undefined }];
  }
  if (activePayment === "BANK_TRANSFER" || activePayment === "QR") {
    return [{ method: activePayment, amount, bankAccountId: bankId }];
  }
  return [{ method: activePayment, amount }];
}
