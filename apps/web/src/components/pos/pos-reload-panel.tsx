"use client";

import * as React from "react";
import { Loader2, Smartphone, CreditCard } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CartItem } from "@/types";

const INPUT_CLS =
  "w-full h-10 rounded-xl px-3 text-sm outline-none focus:border-[#10b981] transition-colors placeholder:opacity-40";
const INPUT_STYLE = { background: "var(--pos-input)", border: "1px solid var(--pos-border)", color: "var(--pos-text)" } as const;

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

export function PosReloadPanel({
  onBack,
  onAddToCart,
  taxRate = 0,
}: {
  onBack: () => void;
  onAddToCart: (item: CartItem) => void;
  taxRate?: number;
}) {
  const [loading, setLoading] = React.useState(true);
  const [operators, setOperators] = React.useState<ReloadOperator[]>([]);
  const [operatorId, setOperatorId] = React.useState<string>("");
  const [mode, setMode] = React.useState<"DIGITAL" | "PHYSICAL">("DIGITAL");
  const [phone, setPhone] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [denominationId, setDenominationId] = React.useState("");

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
      const msisdn = phone.replace(/\D/g, "");
      if (msisdn.length < 9) {
        toast.error("Enter a valid phone number");
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
      <div className="flex h-full items-center justify-center gap-2 p-6" style={{ color: "var(--pos-muted)" }}>
        <Loader2 className="h-5 w-5 animate-spin" /> Loading providers…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-3 overflow-hidden p-4">
      <div className="flex shrink-0 items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4" style={{ color: "var(--pos-accent-soft)" }} />
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

      <div className="max-w-2xl space-y-4 overflow-y-auto rounded-xl border p-4" style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}>
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>
            1. Select provider *
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {operators.map((op) => {
              const active = op.id === operatorId;
              return (
                <button
                  key={op.id}
                  type="button"
                  onClick={() => setOperatorId(op.id)}
                  className="rounded-xl border px-3 py-3 text-left transition-all"
                  style={{
                    borderColor: active ? "rgba(79,110,247,0.7)" : "var(--pos-border)",
                    background: active ? "rgba(79,110,247,0.15)" : "var(--pos-input)",
                    color: "var(--pos-text)",
                  }}
                >
                  <p className="text-sm font-bold">{op.name}</p>
                  <p className="mt-1 text-[10px]" style={{ color: "var(--pos-muted)" }}>
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

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>
            2. Sale type
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMode("DIGITAL")}
              className="flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold"
              style={{
                borderColor: mode === "DIGITAL" ? "rgba(16,185,129,0.6)" : "var(--pos-border)",
                background: mode === "DIGITAL" ? "rgba(16,185,129,0.12)" : "var(--pos-input)",
                color: "var(--pos-text)",
              }}
            >
              <Smartphone className="h-4 w-4" /> Digital Reload
            </button>
            <button
              type="button"
              onClick={() => setMode("PHYSICAL")}
              className="flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-bold"
              style={{
                borderColor: mode === "PHYSICAL" ? "rgba(245,158,11,0.6)" : "var(--pos-border)",
                background: mode === "PHYSICAL" ? "rgba(245,158,11,0.12)" : "var(--pos-input)",
                color: "var(--pos-text)",
              }}
            >
              <CreditCard className="h-4 w-4" /> Recharge Card
            </button>
          </div>
          {operator && (
            <p className="mt-2 text-xs" style={{ color: "var(--pos-muted)" }}>
              {mode === "DIGITAL" ? "Digital" : "Card"} commission for {operator.name}:{" "}
              <span className="font-bold" style={{ color: "var(--pos-success-soft)" }}>
                {mode === "DIGITAL" ? operator.digitalCommissionPct : operator.physicalCommissionPct}%
              </span>
              {" "}(from Settings)
            </p>
          )}
        </div>

        {mode === "DIGITAL" ? (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Phone number *</label>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0771234567"
                inputMode="tel"
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Amount (LKR) *</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {denoms.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setAmount(String(d.faceValue))}
                    className="h-8 rounded-lg px-2.5 text-xs font-bold"
                    style={{ background: "var(--pos-input)", color: "var(--pos-text)", border: "1px solid var(--pos-border)" }}
                  >
                    {d.faceValue}
                  </button>
                ))}
              </div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder="0.00"
                inputMode="decimal"
                className={INPUT_CLS}
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
            <label className="text-xs font-semibold" style={{ color: "var(--pos-muted)" }}>Card denomination *</label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {denoms.map((d) => {
                const active = d.id === denominationId;
                const empty = d.availableCards < 1;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={empty}
                    onClick={() => setDenominationId(d.id)}
                    className="rounded-xl border px-3 py-3 text-left disabled:opacity-40"
                    style={{
                      borderColor: active ? "rgba(245,158,11,0.7)" : "var(--pos-border)",
                      background: active ? "rgba(245,158,11,0.12)" : "var(--pos-input)",
                      color: "var(--pos-text)",
                    }}
                  >
                    <p className="text-sm font-bold">LKR {formatMoney(d.faceValue)}</p>
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
          <div className="rounded-xl border px-3 py-2 text-xs" style={{ borderColor: "var(--pos-border)", background: "rgba(16,185,129,0.08)" }}>
            <div className="flex justify-between gap-2">
              <span style={{ color: "var(--pos-muted)" }}>Customer pays</span>
              <span className="font-bold tabular-nums" style={{ color: "var(--pos-text)" }}>LKR {formatMoney(face)}</span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span style={{ color: "var(--pos-muted)" }}>Shop commission ({commission.pct}%)</span>
              <span className="font-bold tabular-nums" style={{ color: "#34d399" }}>LKR {formatMoney(commission.earned)}</span>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!operator || !(face > 0)}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#4f6ef7,#3b5bdb)" }}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}
