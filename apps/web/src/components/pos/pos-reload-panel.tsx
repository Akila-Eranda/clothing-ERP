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

type FocusZone = "provider" | "mode" | "phone" | "chips" | "amount" | "cards" | "submit";

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

const ACCENT = "#4f6ef7";
const ACCENT_SOFT_DARK = "rgba(79,110,247,0.18)";
const ACCENT_SOFT_LIGHT = "rgba(79,110,247,0.12)";
const ACCENT_BORDER = "rgba(79,110,247,0.65)";
const FOCUS_DARK = "#38bdf8";
const FOCUS_LIGHT = "#1d4ed8";
const CARD_AMBER = "#d97706";
const SUCCESS_DARK = "#10b981";
const SUCCESS_LIGHT = "#047857";

function focusRing(active: boolean, light: boolean): React.CSSProperties {
  if (!active) return { outline: "none" };
  return {
    outline: "none",
    boxShadow: light
      ? "0 0 0 2px #1d4ed8, 0 0 0 4px rgba(29,78,216,0.2)"
      : "0 0 0 2px rgba(56,189,248,0.85), 0 0 12px rgba(56,189,248,0.25)",
  };
}

function chipStyle(opts: {
  selected: boolean;
  focused: boolean;
  empty?: boolean;
  light: boolean;
}): React.CSSProperties {
  const { selected, focused, empty, light } = opts;
  const idleBorder = light ? "#1e293b" : "var(--pos-border)";
  const idleBg = light ? "#334155" : "var(--pos-card)";
  const idleText = "#ffffff";
  const mute = light ? "rgba(255,255,255,0.55)" : "var(--pos-muted)";

  if (empty) {
    return {
      borderColor: idleBorder,
      background: idleBg,
      color: mute,
      opacity: 0.45,
      ...focusRing(focused, light),
    };
  }
  if (selected) {
    return {
      borderColor: ACCENT,
      background: ACCENT,
      color: "#ffffff",
      ...focusRing(focused, light),
    };
  }
  return {
    borderColor: focused ? (light ? FOCUS_LIGHT : FOCUS_DARK) : idleBorder,
    background: focused
      ? (light ? "#1e40af" : "rgba(56,189,248,0.12)")
      : idleBg,
    color: idleText,
    ...focusRing(focused, light),
  };
}

export function PosReloadPanel({
  onBack,
  onAddToCart,
  taxRate = 0,
  asModal = false,
  initialPhone = "",
  phone: phoneProp,
  onPhoneChange,
  lightMode = false,
}: {
  onBack: () => void;
  onAddToCart: (item: CartItem) => void;
  taxRate?: number;
  asModal?: boolean;
  initialPhone?: string;
  phone?: string;
  onPhoneChange?: (phone: string) => void;
  /** POS light theme — use darker borders/text for contrast. */
  lightMode?: boolean;
}) {
  const [loading, setLoading] = React.useState(true);
  const [operators, setOperators] = React.useState<ReloadOperator[]>([]);
  const [operatorId, setOperatorId] = React.useState<string>("");
  const [mode, setMode] = React.useState<"DIGITAL" | "PHYSICAL">("DIGITAL");
  const [phoneLocal, setPhoneLocal] = React.useState(() => digitsOnly(initialPhone));
  const [amount, setAmount] = React.useState("");
  const [denominationId, setDenominationId] = React.useState("");
  const [focusZone, setFocusZone] = React.useState<FocusZone>("provider");
  const [chipIdx, setChipIdx] = React.useState(0);
  const [cardIdx, setCardIdx] = React.useState(0);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const phoneRef = React.useRef<HTMLInputElement>(null);
  const amountRef = React.useRef<HTMLInputElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);
  const controlled = phoneProp !== undefined;
  const phone = controlled ? digitsOnly(phoneProp) : phoneLocal;

  const setPhone = React.useCallback((next: string) => {
    const digits = digitsOnly(next);
    if (!controlled) setPhoneLocal(digits);
    onPhoneChange?.(digits);
  }, [controlled, onPhoneChange]);

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
    if (controlled) return;
    const next = digitsOnly(initialPhone);
    if (next) setPhoneLocal(next);
  }, [initialPhone, controlled]);

  const operator = operators.find((o) => o.id === operatorId) ?? null;
  const operatorIdx = Math.max(0, operators.findIndex((o) => o.id === operatorId));
  const denoms = (operator?.denominations ?? []).filter((d) => d.isActive);
  const face = mode === "DIGITAL"
    ? parseFloat(amount) || 0
    : denoms.find((d) => d.id === denominationId)?.faceValue ?? 0;
  const commission = operator && face > 0 ? commissionFor(operator, mode, face) : null;

  const zones = React.useMemo((): FocusZone[] => {
    if (mode === "DIGITAL") {
      return denoms.length > 0
        ? ["provider", "mode", "phone", "chips", "amount", "submit"]
        : ["provider", "mode", "phone", "amount", "submit"];
    }
    return denoms.length > 0
      ? ["provider", "mode", "cards", "submit"]
      : ["provider", "mode", "submit"];
  }, [mode, denoms.length]);

  React.useEffect(() => {
    if (!operator) return;
    if (mode === "PHYSICAL") {
      const firstWithStock = denoms.find((d) => d.availableCards > 0) ?? denoms[0];
      setDenominationId(firstWithStock?.id ?? "");
      const idx = denoms.findIndex((d) => d.id === firstWithStock?.id);
      setCardIdx(Math.max(0, idx));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorId, mode]);

  React.useEffect(() => {
    if (!zones.includes(focusZone)) setFocusZone(zones[0] ?? "provider");
  }, [zones, focusZone]);

  React.useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => {
      if (focusZone === "phone") {
        phoneRef.current?.focus();
        phoneRef.current?.select();
      } else if (focusZone === "amount") {
        amountRef.current?.focus();
        amountRef.current?.select();
      } else if (focusZone === "submit") {
        submitRef.current?.focus();
      } else {
        rootRef.current?.focus();
      }
    }, 30);
    return () => clearTimeout(t);
  }, [focusZone, loading, mode]);

  // Start on provider row when panel opens
  React.useEffect(() => {
    if (loading) return;
    setFocusZone("provider");
    const t = setTimeout(() => rootRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [loading]);

  const submit = React.useCallback(() => {
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
      if (msisdn.length > 0 && msisdn.length < 9) {
        toast.error("Phone number looks incomplete — clear it or enter a full number");
        setFocusZone("phone");
        return;
      }
      const id = `custom-reload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
      onAddToCart({
        variantId: id,
        productName: msisdn
          ? `Reload · ${operator.name} · ${msisdn}`
          : `Reload · ${operator.name}`,
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
        ...(msisdn ? { reloadMsisdn: msisdn } : {}),
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
  }, [operator, face, mode, phone, denoms, denominationId, taxRate, onAddToCart, onBack, setPhone]);

  const moveZone = React.useCallback((delta: number) => {
    const idx = zones.indexOf(focusZone);
    const base = idx < 0 ? 0 : idx;
    const next = Math.max(0, Math.min(zones.length - 1, base + delta));
    setFocusZone(zones[next]!);
  }, [zones, focusZone]);

  const onPanelKeyDown = React.useCallback((e: React.KeyboardEvent) => {
    const key = e.key;
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(key)) return;

    const inPhone = focusZone === "phone" && document.activeElement === phoneRef.current;
    const inAmount = focusZone === "amount" && document.activeElement === amountRef.current;

    // Inside text fields: ←→ move caret; ↑↓ leave field
    if (inPhone || inAmount) {
      const el = (inPhone ? phoneRef.current : amountRef.current)!;
      const start = el.selectionStart ?? 0;
      const end = el.selectionEnd ?? 0;
      const len = el.value.length;
      if (key === "ArrowUp") {
        e.preventDefault();
        e.stopPropagation();
        moveZone(-1);
        return;
      }
      if (key === "ArrowDown") {
        e.preventDefault();
        e.stopPropagation();
        moveZone(1);
        return;
      }
      if (key === "ArrowLeft" && start === 0 && end === 0) {
        e.preventDefault();
        e.stopPropagation();
        moveZone(-1);
        return;
      }
      if (key === "ArrowRight" && start === len && end === len) {
        e.preventDefault();
        e.stopPropagation();
        moveZone(1);
        return;
      }
      if (key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (inPhone) setFocusZone(denoms.length ? "chips" : "amount");
        else submit();
        return;
      }
      return; // let normal typing / caret move
    }

    if (key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      moveZone(-1);
      return;
    }
    if (key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      moveZone(1);
      return;
    }

    if (key === "ArrowLeft" || key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      const dir = key === "ArrowRight" ? 1 : -1;

      if (focusZone === "provider" && operators.length) {
        const next = Math.max(0, Math.min(operators.length - 1, operatorIdx + dir));
        setOperatorId(operators[next]!.id);
        return;
      }
      if (focusZone === "mode") {
        setMode(dir > 0 ? "PHYSICAL" : "DIGITAL");
        return;
      }
      if (focusZone === "chips" && denoms.length) {
        const next = Math.max(0, Math.min(denoms.length - 1, chipIdx + dir));
        setChipIdx(next);
        setAmount(String(denoms[next]!.faceValue));
        return;
      }
      if (focusZone === "cards" && denoms.length) {
        // skip empty stock when possible
        let next = cardIdx + dir;
        while (next >= 0 && next < denoms.length && denoms[next]!.availableCards < 1) {
          next += dir;
        }
        if (next >= 0 && next < denoms.length) {
          setCardIdx(next);
          setDenominationId(denoms[next]!.id);
        }
        return;
      }
      // phone / amount / submit: left/right = zone hop
      moveZone(dir);
      return;
    }

    if (key === "Enter" || key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (focusZone === "chips" && denoms[chipIdx]) {
        setAmount(String(denoms[chipIdx]!.faceValue));
        setFocusZone("amount");
        return;
      }
      if (focusZone === "cards" && denoms[cardIdx] && denoms[cardIdx]!.availableCards > 0) {
        setDenominationId(denoms[cardIdx]!.id);
        setFocusZone("submit");
        return;
      }
      if (focusZone === "mode") {
        // already selected via arrows
        moveZone(1);
        return;
      }
      if (focusZone === "provider") {
        moveZone(1);
        return;
      }
      if (focusZone === "submit" || focusZone === "amount") {
        submit();
      }
    }
  }, [
    focusZone, moveZone, operators, operatorIdx, denoms, chipIdx, cardIdx, submit,
  ]);

  const labelColor = lightMode ? "#334155" : "var(--pos-muted)";
  const hintColor = lightMode ? "#475569" : "var(--pos-muted-2)";
  const textColor = lightMode ? "#0f172a" : "var(--pos-text)";
  const borderIdle = lightMode ? "#334155" : "var(--pos-border)";
  const focusColor = lightMode ? FOCUS_LIGHT : FOCUS_DARK;
  const accentSoft = lightMode ? ACCENT_SOFT_LIGHT : ACCENT_SOFT_DARK;
  const successColor = lightMode ? SUCCESS_LIGHT : SUCCESS_DARK;
  const inputBg = lightMode ? "#f8fafc" : "var(--pos-input)";
  const panelBg = lightMode ? "#ffffff" : "var(--pos-panel)";

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-10" style={{ color: labelColor }}>
        <Loader2 className="h-5 w-5 animate-spin" /> Loading providers…
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className={asModal ? "flex flex-col outline-none" : "flex h-full flex-col gap-3 overflow-hidden p-4 outline-none"}
    >
      {!asModal && (
        <div className="flex shrink-0 items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" style={{ color: ACCENT }} />
            <h2 className="text-base font-bold" style={{ color: textColor }}>Reload / Recharge</h2>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="h-8 rounded-lg px-3 text-xs font-semibold transition-colors hover:bg-black/5"
            style={{ color: labelColor }}
          >
            ← Back
          </button>
        </div>
      )}

      <div className="space-y-3 overflow-y-auto p-4">
        <p className="text-[10px] font-semibold" style={{ color: focusColor }}>
          ← → move · ↑ ↓ sections · Enter select / add
        </p>

        {/* Provider chips */}
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: labelColor }}>
            Provider
          </p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {operators.map((op, idx) => {
              const active = op.id === operatorId;
              const kb = focusZone === "provider" && idx === operatorIdx;
              return (
                <button
                  key={op.id}
                  type="button"
                  title={`${op.name} · Digital ${op.digitalCommissionPct}% · Card ${op.physicalCommissionPct}%`}
                  onClick={() => {
                    setOperatorId(op.id);
                    setFocusZone("provider");
                  }}
                  className="h-9 rounded-lg px-2.5 text-xs font-bold truncate transition-all hover:opacity-90"
                  style={chipStyle({ selected: active, focused: kb, light: lightMode })}
                >
                  {op.name}
                </button>
              );
            })}
          </div>
          {!operators.length && (
            <p className="mt-2 text-xs font-medium" style={{ color: CARD_AMBER }}>
              No providers — add them in Settings → Reload.
            </p>
          )}
        </div>

        {/* Mode toggle */}
        <div
          className="grid grid-cols-2 gap-1.5 p-1 rounded-xl"
          style={{
            background: inputBg,
            border: `1px solid ${focusZone === "mode" ? focusColor : borderIdle}`,
            ...focusRing(focusZone === "mode", lightMode),
          }}
        >
          <button
            type="button"
            onClick={() => { setMode("DIGITAL"); setFocusZone("mode"); }}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all"
            style={{
              background: mode === "DIGITAL" ? ACCENT : (lightMode ? "#334155" : "transparent"),
              color: "#fff",
            }}
          >
            <Smartphone className="h-3.5 w-3.5" /> Digital
          </button>
          <button
            type="button"
            onClick={() => { setMode("PHYSICAL"); setFocusZone("mode"); }}
            className="flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all"
            style={{
              background: mode === "PHYSICAL" ? CARD_AMBER : (lightMode ? "#334155" : "transparent"),
              color: "#fff",
            }}
          >
            <CreditCard className="h-3.5 w-3.5" /> Card
          </button>
        </div>

        {mode === "DIGITAL" ? (
          <div className="space-y-3">
            <div
              className="rounded-xl border p-3 space-y-2"
              style={{
                background: accentSoft,
                borderColor: focusZone === "phone" ? focusColor : (lightMode ? "#1e3a8a" : ACCENT_BORDER),
                ...focusRing(focusZone === "phone", lightMode),
              }}
            >
              <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: labelColor }}>
                <Phone className="h-3 w-3" style={{ color: ACCENT }} />
                Customer phone <span className="font-normal normal-case tracking-normal opacity-70">(optional)</span>
              </label>
              <input
                ref={phoneRef}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => setFocusZone("phone")}
                placeholder="0771234567"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={`${INPUT_CLS} font-mono text-lg tracking-wider tabular-nums`}
                style={{
                  background: panelBg,
                  border: `1px solid ${focusZone === "phone" ? focusColor : (lightMode ? "#1e40af" : ACCENT_BORDER)}`,
                  color: textColor,
                }}
              />
              <p className="text-[10px]" style={{ color: hintColor }}>
                Cashier or customer display · ↑↓ to move
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: labelColor }}>
                Amount (LKR)
              </label>
              {denoms.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {denoms.map((d, idx) => {
                    const active = amount === String(d.faceValue);
                    const kb = focusZone === "chips" && idx === chipIdx;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          setChipIdx(idx);
                          setAmount(String(d.faceValue));
                          setFocusZone("chips");
                        }}
                        className="h-9 min-w-[3.25rem] rounded-lg px-2.5 text-xs font-bold tabular-nums transition-all"
                        style={chipStyle({ selected: active, focused: kb, light: lightMode })}
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
                onFocus={() => setFocusZone("amount")}
                placeholder="0.00"
                inputMode="decimal"
                className={`${INPUT_CLS} font-mono text-base tabular-nums`}
                style={{
                  background: inputBg,
                  border: `1px solid ${focusZone === "amount" ? focusColor : borderIdle}`,
                  color: textColor,
                  ...focusRing(focusZone === "amount", lightMode),
                }}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-wide" style={{ color: labelColor }}>
              Card denomination
            </label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {denoms.map((d, idx) => {
                const active = d.id === denominationId;
                const empty = d.availableCards < 1;
                const kb = focusZone === "cards" && idx === cardIdx;
                return (
                  <button
                    key={d.id}
                    type="button"
                    disabled={empty}
                    title={empty ? "Out of stock" : `${d.availableCards} in stock`}
                    onClick={() => {
                      setCardIdx(idx);
                      setDenominationId(d.id);
                      setFocusZone("cards");
                    }}
                    className="h-10 rounded-lg border px-3 text-sm font-bold tabular-nums text-left disabled:opacity-40 transition-all"
                    style={chipStyle({ selected: active, focused: kb, empty, light: lightMode })}
                  >
                    LKR {formatMoney(d.faceValue)}
                    {empty ? " · out" : ""}
                  </button>
                );
              })}
            </div>
            {!denoms.some((d) => d.availableCards > 0) && (
              <p className="text-xs font-medium" style={{ color: CARD_AMBER }}>
                No physical cards — import PINs in Settings → Reload.
              </p>
            )}
          </div>
        )}

        {commission && (
          <div
            className="rounded-xl border px-3 py-2 text-xs"
            style={{
              borderColor: lightMode ? "#059669" : "rgba(16,185,129,0.45)",
              background: lightMode ? "rgba(16,185,129,0.1)" : "rgba(16,185,129,0.12)",
            }}
          >
            <div className="flex justify-between gap-2">
              <span style={{ color: labelColor }}>Customer pays</span>
              <span className="font-bold tabular-nums" style={{ color: textColor }}>
                LKR {formatMoney(face)}
              </span>
            </div>
            <div className="mt-1 flex justify-between gap-2">
              <span style={{ color: labelColor }}>Commission ({commission.pct}%)</span>
              <span className="font-bold tabular-nums" style={{ color: successColor }}>
                LKR {formatMoney(commission.earned)}
              </span>
            </div>
          </div>
        )}

        <button
          ref={submitRef}
          type="button"
          onClick={submit}
          onFocus={() => setFocusZone("submit")}
          disabled={!operator || !(face > 0)}
          data-pos-on-accent=""
          className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-opacity hover:opacity-90"
          style={{
            background: focusZone === "submit"
              ? (lightMode ? "linear-gradient(135deg,#1d4ed8,#4f6ef7)" : "linear-gradient(135deg,#38bdf8,#4f6ef7)")
              : "linear-gradient(135deg,#4f6ef7,#7c3aed)",
            color: "#ffffff",
            ...focusRing(focusZone === "submit", lightMode),
          }}
        >
          Add to Cart
        </button>
      </div>
    </div>
  );
}
