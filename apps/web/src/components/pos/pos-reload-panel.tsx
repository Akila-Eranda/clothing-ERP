"use client";

import * as React from "react";
import { Loader2, Smartphone, CreditCard, Phone } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CartItem } from "@/types";

const INPUT_CLS =
  "w-full h-11 rounded-xl px-3 text-sm outline-none transition-colors placeholder:opacity-40 focus:outline-none";
const INPUT_STYLE = {
  background: "var(--pos-input)",
  border: "1px solid var(--pos-border)",
  color: "var(--pos-text)",
} as const;

type ReloadDenom = {
  id: string;
  faceValue: number;
  isActive: boolean;
  availableCards: number;
};

export type ReloadOperator = {
  id: string;
  code: string;
  name: string;
  digitalCommissionPct: number;
  physicalCommissionPct: number;
  isActive: boolean;
  denominations: ReloadDenom[];
};

function formatMoney(n: number) {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function commissionFor(op: ReloadOperator, mode: "DIGITAL" | "PHYSICAL", face: number) {
  const pct = mode === "DIGITAL" ? op.digitalCommissionPct : op.physicalCommissionPct;
  const earned = Math.round(((face * Math.max(0, pct)) / 100 + Number.EPSILON) * 100) / 100;
  const cost = Math.round((Math.max(0, face - earned) + Number.EPSILON) * 100) / 100;
  return { pct, earned, cost };
}

function digitsOnly(v: string) {
  return v.replace(/\D/g, "");
}

export function PosReloadPanel({
  onBack,
  onAddToCart,
  taxRate = 0,
  asModal = false,
  initialPhone = "",
}: {
  onBack: () => void;
  onAddToCart: (item: CartItem) => void;
  taxRate?: number;
  /** Compact layout for overlay popup (no page chrome). */
  asModal?: boolean;
  /** Prefill from bill customer (cashier can edit). */
  initialPhone?: string;
}) {
  const [loading, setLoading] = React.useState(true);
  const [operators, setOperators] = React.useState<ReloadOperator[]>([]);
  const [operatorId, setOperatorId] = React.useState<string>("");
  const [mode, setMode] = React.useState<"DIGITAL" | "PHYSICAL">("DIGITAL");
  const [phone, setPhone] = React.useState(() => digitsOnly(initialPhone));
  const [amount, setAmount] = React.useState("");
  const [denominationId, setDenominationId] = React.useState("");
  const phoneRef = React.useRef<HTMLInputElement>(null);
  const amountRef = React.useRef<HTMLInputElement>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.get<ReloadOperator[]>("/pos/reload/operators");
      const list = (Array.isArray(r.data) ? r.data : []).filter((o) => o.isActive);
      setOperators(list);
      if (!operatorId && list[0]) setOperatorId(list[0].id);
    } catch (e) {
      toast.error((e as Error).message ?? "Failed to load providers");
    } finally {
      setLoading(false);
    }
  }, [operatorId]);

  React.useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const next = digitsOnly(initialPhone);
    if (next) setPhone(next);
  }, [initialPhone]);

  React.useEffect(() => {
    if (loading || mode !== "DIGITAL") return;
    const t = setTimeout(() => {
      phoneRef.current?.focus();
      phoneRef.current?.select();
    }, 80);
    return () => clearTimeout(t);
  }, [loading, mode]);

  const operator = operators.find((o) => o.id === operatorId) ?? null;
  const denoms = (operator?.denominations ?? []).filter((d) => d.isActive);
  const face = mode === "DIGITAL"
    ? parseFloat(amount) || 0
    : denoms.find((d) => d.id === denominationId)?.faceValue ?? 0;
  const commission = operator && face > 0 ? commissionFor(operator, mode, face) : null;

  React.useEffect(() => {
    if (!operator) return;
    if (mode === "PHYSICAL") {
      const firstWithStock = denoms.find((d) => d.availableCards > 0) ?? denoms[0];
      setDenominationId(firstWithStock?.id ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorId, mode]);

  const submit = () => {
    if (!operator) {
      toast.error("Select a provider first");
      return;
    }
    if (!(face > 0)) {
      toast.error(mode === "DIGITAL" ? "Enter reload amount" : "Select a card denomination");
      return;
    }
    const calc = commissionFor(operator, mode, face);
    if (mode === "DIGITAL") {
      const msisdn = digitsOnly(phone);
      if (msisdn.length < 9) {
        toast.error("Enter a valid phone number");
        phoneRef.current?.focus();
        return;
      }
      const id = `custom-reload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      onAddToCart({
        variantId: id,
        productName: `Reload · ${operator.name} · ${msisdn}`,
        variantName: "",
        sku: "RELOAD",
        unitPrice: face,
        mrp: face,
        quantity: 1,
        discountAmount: 0,
        discountType: "fixed",
        taxRate,
        stock: 999999,
        isCustom: true,
        costPrice: calc.cost,
        reloadType: "DIGITAL",
        reloadOperatorId: operator.id,
        reloadMsisdn: msisdn,
        reloadFaceValue: face,
      });
      toast.success(`Reload added · ${operator.name} · LKR ${formatMoney(face)}`);
      setPhone("");
      setAmount("");
      onBack();
      return;
    }

    const denom = denoms.find((d) => d.id === denominationId);
    if (!denom) {
      toast.error("Select a denomination");
      return;
    }
    if (denom.availableCards < 1) {
      toast.error("No cards in stock for this denomination");
      return;
    }
    const id = `custom-recharge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    onAddToCart({
      variantId: id,
      productName: `Recharge Card · ${operator.name} · LKR ${formatMoney(denom.faceValue)}`,
      variantName: "",
      sku: "RECHARGE",
      unitPrice: denom.faceValue,
      mrp: denom.faceValue,
      quantity: 1,
      discountAmount: 0,
      discountType: "fixed",
      taxRate,
      stock: denom.availableCards,
      isCustom: true,
      costPrice: calc.cost,
      reloadType: "PHYSICAL",
      reloadOperatorId: operator.id,
      reloadDenominationId: denom.id,
      reloadFaceValue: denom.faceValue,
    });
    toast.success(`Recharge card added · ${operator.name} · LKR ${formatMoney(denom.faceValue)}`);
    onBack();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10" style={{ color: "var(--pos-muted)" }}>
        <Loader2 className="h-5 w-5 animate-spin" /> Loading providers…
      </div>
    );
  }

  return (
    <div className={asModal ? "flex flex-col" : "flex h-full flex-col gap-3 overflow-hidden p-4"}>
      {!asModal && (
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" style={{ color: "#4f6ef7" }} />
            <h2 className="text-base font-bold" style={{ color: "var(--pos-text)" }}>Reload / Recharge</h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="h-8 rounded-lg px-3 text-xs font-semibold transition-colors hover:bg-white/10"
            style={{ color: "var(--pos-muted)" }}
          >
            ← Back
          </button>
        </div>
      )}

      <div className="space-y-3 overflow-y-auto p-4">
        {/* Provider chips */}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>
            Provider
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {operators.map((op) => {
              const active = op.id === operatorId;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setOperatorId(op.id)}
                  className="rounded-xl border px-2.5 py-2.5 text-left transition-all hover:opacity-90"
                  style={{
                    borderColor: active ? "#4f6ef7" : "var(--pos-border)",
                    background: active ? "rgba(79,110,247,0.15)" : "var(--pos-card)",
                    color: "var(--pos-text)",
                    boxShadow: active ? "0 0 0 1px rgba(79,110,247,0.35)" : "none",
                  }}
                >
                  <p className="text-xs font-bold truncate">{op.name}</p>
                  <p className="mt-0.5 text-[10px]" style={{ color: "var(--pos-muted)" }}>
                    D {op.digitalCommissionPct}% · C {op.physicalCommissionPct}%
                  </p>
                </button>
              );
            })}
          </div>
          {!operators.length && (
            <p className="mt-2 text-xs" style={{ color: "#fbbf24" }}>
              No providers — add them in Settings → Reload.
            </p>
          )}
        </div>

        {/* Mode toggle */}
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl" style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}>
          <button
            type="button"
            onClick={() => setMode("DIGITAL")}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all"
            style={{
              background: mode === "DIGITAL" ? "#4f6ef7" : "transparent",
              color: mode === "DIGITAL" ? "#fff" : "var(--pos-muted)",
            }}
          >
            <Smartphone className="h-3.5 w-3.5" /> Digital
          </button>
          <button
            type="button"
            onClick={() => setMode("PHYSICAL")}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all"
            style={{
              background: mode === "PHYSICAL" ? "#4f6ef7" : "transparent",
              color: mode === "PHYSICAL" ? "#fff" : "var(--pos-muted)",
            }}
          >
            <CreditCard className="h-3.5 w-3.5" /> Card
          </button>
        </div>

        {mode === "DIGITAL" ? (
          <div className="space-y-3">
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{ background: "var(--pos-card)", borderColor: "rgba(79,110,247,0.35)" }}
            >
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>
                <Phone className="h-3 w-3" style={{ color: "#4f6ef7" }} />
                Customer phone (cashier types here)
              </label>
              <input
                ref={phoneRef}
                value={phone}
                onChange={(e) => setPhone(digitsOnly(e.target.value))}
                placeholder="0771234567"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={`${INPUT_CLS} font-mono text-lg tracking-wider tabular-nums`}
                style={{
                  ...INPUT_STYLE,
                  borderColor: "rgba(79,110,247,0.5)",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    amountRef.current?.focus();
                    amountRef.current?.select();
                  }
                }}
              />
              <p className="text-[10px]" style={{ color: "var(--pos-muted-2)" }}>
                Type phone with cashier keyboard · Enter to amount
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>
                Amount (LKR)
              </label>
              {denoms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {denoms.map((d) => {
                    const active = amount === String(d.faceValue);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setAmount(String(d.faceValue));
                          amountRef.current?.focus();
                        }}
                        className="h-9 min-w-[3.25rem] rounded-lg px-2.5 text-xs font-bold tabular-nums transition-all"
                        style={{
                          background: active ? "rgba(79,110,247,0.2)" : "var(--pos-card)",
                          color: "var(--pos-text)",
                          border: `1px solid ${active ? "#4f6ef7" : "var(--pos-border)"}`,
                        }}
                      >
                        {d.faceValue}
                      </button>
                    );
                  })}
                </div>
              )}
              <input
                ref={amountRef}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
                inputMode="decimal"
                className={`${INPUT_CLS} font-mono text-base tabular-nums`}
                style={INPUT_STYLE}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>
              Card denomination
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {denoms.map((d) => {
                const active = d.id === denominationId;
                const empty = d.availableCards < 1;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={empty}
                    onClick={() => setDenominationId(d.id)}
                    className="rounded-xl border px-3 py-3 text-left disabled:opacity-40 transition-all"
                    style={{
                      borderColor: active ? "#4f6ef7" : "var(--pos-border)",
                      background: active ? "rgba(79,110,247,0.15)" : "var(--pos-card)",
                      color: "var(--pos-text)",
                    }}
                  >
                    <p className="text-sm font-bold tabular-nums">LKR {formatMoney(d.faceValue)}</p>
                    <p className="mt-1 text-[10px]" style={{ color: empty ? "#f87171" : "var(--pos-muted)" }}>
                      {d.availableCards} in stock
                    </p>
                  </button>
                );
              })}
            </div>
            {!denoms.some((d) => d.availableCards > 0) && (
              <p className="text-xs" style={{ color: "#fbbf24" }}>
                No physical cards — import PINs in Settings → Reload.
              </p>
            )}
          </div>
        )}

        {commission && (
          <div
            className="rounded-xl border px-3 py-2 text-xs"
            style={{ borderColor: "rgba(16,185,129,0.35)", background: "rgba(16,185,129,0.08)" }}
          >
            <div className="flex justify-between gap-2">
              <span style={{ color: "var(--pos-muted)" }}>Customer pays</span>
              <span className="font-bold tabular-nums" style={{ color: "var(--pos-text)" }}>
                LKR {formatMoney(face)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span style={{ color: "var(--pos-muted)" }}>Commission ({commission.pct}%)</span>
              <span className="font-bold tabular-nums" style={{ color: "#34d399" }}>
                LKR {formatMoney(commission.earned)}
              </span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!operator || !(face > 0) || (mode === "DIGITAL" && digitsOnly(phone).length < 9)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#4f6ef7,#7c3aed)" }}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}
