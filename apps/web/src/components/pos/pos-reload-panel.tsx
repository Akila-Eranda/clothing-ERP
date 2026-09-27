"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Loader2, Smartphone, CreditCard, Phone, ShoppingCart, ExternalLink, X, CheckCircle2, Copy } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { CartItem } from "@/types";

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
  quickPayUrl?: string | null;
  isActive: boolean;
  denominations: ReloadDenom[];
};

const DEFAULT_QUICK_PAY_URLS: Record<string, string> = {
  /** Must be the ?ref= QR landing — /quick-pay/prepaid-reload fails when opened directly. */
  MOBITEL: "https://quick-pay.mobitel.lk/quick-pay?ref=01M3GXMPH5MGPSKVY33CZTFXNV",
};

function resolveQuickPayUrl(op: ReloadOperator): string {
  return op.quickPayUrl?.trim() || DEFAULT_QUICK_PAY_URLS[op.code?.toUpperCase()] || "";
}

/**
 * Operator sites keep their session in cookies, which browsers block inside a
 * cross-site iframe — so Quick Pay must run in a real (first-party) popup window.
 */
function openQuickPayWindow(url: string): Window | null {
  const w = 480;
  const h = 820;
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2));
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2));
  const win = window.open(
    url,
    "hexa-quick-pay",
    `popup=yes,width=${w},height=${h},left=${left},top=${top},resizable=yes,scrollbars=yes`,
  );
  if (!win) return null;
  try {
    win.opener = null;
    win.focus();
  } catch {
    /* cross-origin — ignore */
  }
  return win;
}

type FocusZone = "provider" | "mode" | "phone" | "amount" | "cards" | "submit";

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

const ACCENT = "var(--pos-accent)";
const CARD_ACCENT = "#c026d3";

function chipStyle(opts: {
  selected: boolean;
  focused: boolean;
  empty?: boolean;
  light: boolean;
}): React.CSSProperties {
  const { selected, focused, empty, light } = opts;
  const idleBg = light ? "#475569" : "var(--pos-elevated)";
  const focusGlow = focused
    ? (light
        ? "0 0 0 2px rgba(var(--pos-accent-rgb),0.45)"
        : "0 0 0 2px rgba(56,189,248,0.55)")
    : "none";

  if (empty) {
    return {
      background: idleBg,
      color: "rgba(255,255,255,0.45)",
      opacity: 0.5,
      border: "none",
      boxShadow: focusGlow,
    };
  }
  if (selected) {
    return {
      background: ACCENT,
      color: "#ffffff",
      border: "none",
      boxShadow: focusGlow,
    };
  }
  return {
    background: idleBg,
    color: "#ffffff",
    border: "none",
    boxShadow: focusGlow,
  };
}

export function PosReloadPanel({
  onBack,
  onAddToCart,
  onQuickSale,
  taxRate = 0,
  asModal = false,
  initialPhone = "",
  phone: phoneProp,
  onPhoneChange,
  lightMode = false,
}: {
  onBack: () => void;
  onAddToCart: (item: CartItem) => void;
  /** Quick Pay "Paid" — record reload as its own completed sale. Resolves true on success. */
  onQuickSale?: (item: CartItem) => Promise<boolean>;
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
      return ["provider", "mode", "phone", "amount", "submit"];
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

  React.useEffect(() => {
    if (loading) return;
    setFocusZone("provider");
    const t = setTimeout(() => rootRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [loading]);

  const buildDigitalItem = React.useCallback((): CartItem | null => {
    if (!operator || !(face > 0)) return null;
    const msisdn = digitsOnly(phone);
    if (msisdn.length > 0 && msisdn.length < 9) {
      toast.error("Phone number looks incomplete — clear it or enter a full number");
      setFocusZone("phone");
      return null;
    }
    const calc = commissionFor(operator, "DIGITAL", face);
    return {
      variantId: `custom-reload-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      productName: msisdn ? `Reload · ${operator.name} · ${msisdn}` : `Reload · ${operator.name}`,
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
    };
  }, [operator, face, phone, taxRate]);

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
      const item = buildDigitalItem();
      if (!item) return;
      onAddToCart(item);
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
  }, [operator, face, mode, denoms, denominationId, taxRate, onAddToCart, onBack, setPhone, buildDigitalItem]);

  const quickPayUrl = mode === "DIGITAL" && operator ? resolveQuickPayUrl(operator) : "";
  const [quickPayOpen, setQuickPayOpen] = React.useState(false);
  const quickPayWinRef = React.useRef<Window | null>(null);
  const [quickPayWinClosed, setQuickPayWinClosed] = React.useState(false);

  const [numberCopied, setNumberCopied] = React.useState(false);

  /** Operator page can't be pre-filled (cross-origin, no URL param) — clipboard lets the cashier paste. */
  const copyReloadNumber = React.useCallback(async (silent = false) => {
    const msisdn = digitsOnly(phone);
    if (!msisdn) return false;
    try {
      await navigator.clipboard.writeText(msisdn);
      setNumberCopied(true);
      if (!silent) toast.success(`${msisdn} copied — press Ctrl+V in the Mobitel window`);
      return true;
    } catch {
      setNumberCopied(false);
      if (!silent) toast.error("Could not copy — type the number manually");
      return false;
    }
  }, [phone]);

  const launchQuickPayWindow = React.useCallback(() => {
    if (!quickPayUrl) return;
    void copyReloadNumber(true);
    const existing = quickPayWinRef.current;
    if (existing && !existing.closed) {
      try {
        existing.focus();
        return;
      } catch {
        /* fall through and reopen */
      }
    }
    const win = openQuickPayWindow(quickPayUrl);
    quickPayWinRef.current = win;
    setQuickPayWinClosed(!win);
    if (!win) toast.error("Popup blocked — allow popups for this site, then tap Open again");
  }, [quickPayUrl, copyReloadNumber]);

  const closeQuickPayWindow = React.useCallback(() => {
    try {
      quickPayWinRef.current?.close();
    } catch {
      /* ignore */
    }
    quickPayWinRef.current = null;
  }, []);

  React.useEffect(() => {
    if (!quickPayOpen) return;
    const t = window.setInterval(() => {
      const w = quickPayWinRef.current;
      setQuickPayWinClosed(!w || w.closed);
    }, 800);
    return () => window.clearInterval(t);
  }, [quickPayOpen]);

  React.useEffect(() => () => closeQuickPayWindow(), [closeQuickPayWindow]);

  const cancelQuickPay = React.useCallback(() => {
    closeQuickPayWindow();
    setQuickPayOpen(false);
  }, [closeQuickPayWindow]);

  const openQuickPay = React.useCallback(() => {
    if (!operator || !quickPayUrl) return;
    if (!(face > 0)) {
      toast.error("Enter reload amount");
      setFocusZone("amount");
      return;
    }
    const msisdn = digitsOnly(phone);
    if (msisdn.length > 0 && msisdn.length < 9) {
      toast.error("Phone number looks incomplete — clear it or enter a full number");
      setFocusZone("phone");
      return;
    }
    launchQuickPayWindow();
    setQuickPayOpen(true);
  }, [operator, quickPayUrl, face, phone, launchQuickPayWindow]);

  const [quickSaleBusy, setQuickSaleBusy] = React.useState(false);

  const confirmQuickPay = React.useCallback(async () => {
    if (quickSaleBusy) return;
    if (!onQuickSale) {
      closeQuickPayWindow();
      setQuickPayOpen(false);
      submit();
      return;
    }
    const item = buildDigitalItem();
    if (!item) return;
    setQuickSaleBusy(true);
    try {
      const ok = await onQuickSale(item);
      if (ok) {
        closeQuickPayWindow();
        setQuickPayOpen(false);
        setPhone("");
        setAmount("");
      }
    } finally {
      setQuickSaleBusy(false);
    }
  }, [quickSaleBusy, onQuickSale, submit, buildDigitalItem, setPhone, closeQuickPayWindow]);

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
        if (inPhone) setFocusZone("amount");
        else submit();
        return;
      }
      return;
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
      if (focusZone === "cards" && denoms.length) {
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
      moveZone(dir);
      return;
    }

    if (key === "Enter" || key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (focusZone === "cards" && denoms[cardIdx] && denoms[cardIdx]!.availableCards > 0) {
        setDenominationId(denoms[cardIdx]!.id);
        setFocusZone("submit");
        return;
      }
      if (focusZone === "mode" || focusZone === "provider") {
        moveZone(1);
        return;
      }
      if (focusZone === "submit" || focusZone === "amount") {
        submit();
      }
    }
  }, [
    focusZone, moveZone, operators, operatorIdx, denoms, cardIdx, submit,
  ]);

  const labelColor = lightMode ? "#64748b" : "var(--pos-muted)";
  const hintColor = lightMode ? "#94a3b8" : "var(--pos-muted-2)";
  const textColor = lightMode ? "#0f172a" : "var(--pos-text)";
  const successColor = lightMode ? "#047857" : "var(--pos-success)";
  const inputBg = "var(--pos-input)";

  const fieldStyle = (zone: FocusZone): React.CSSProperties => ({
    background: inputBg,
    border: `1px solid ${focusZone === zone ? ACCENT : "var(--pos-border)"}`,
    color: textColor,
    boxShadow: focusZone === zone ? "0 0 0 3px rgba(var(--pos-accent-rgb),0.18)" : "none",
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 p-12" style={{ color: labelColor }}>
        <Loader2 className="h-5 w-5 animate-spin" /> Loading providers…
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      onKeyDown={onPanelKeyDown}
      className={asModal ? "flex flex-col outline-none min-h-0" : "flex h-full flex-col overflow-hidden outline-none"}
    >
      {!asModal && (
        <div className="flex shrink-0 items-center justify-between px-5 pt-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(var(--pos-accent-rgb),0.12)" }}>
              <Smartphone className="h-4 w-4" style={{ color: ACCENT }} />
            </div>
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

      <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5">
        {/* Provider */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: labelColor }}>
            Provider
          </p>
          <div className="flex flex-wrap gap-2">
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
                  className="h-10 min-w-[4.5rem] flex-1 rounded-xl px-3 text-sm font-bold truncate transition-all hover:opacity-90"
                  style={chipStyle({ selected: active, focused: kb, light: lightMode })}
                >
                  {op.name}
                </button>
              );
            })}
          </div>
          {!operators.length && (
            <p className="text-xs font-medium" style={{ color: CARD_ACCENT }}>
              No providers — add them in Settings → Reload.
            </p>
          )}
        </section>

        {/* Mode */}
        <section className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: labelColor }}>
            Type
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => { setMode("DIGITAL"); setFocusZone("mode"); }}
              className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold transition-all"
              style={{
                background: mode === "DIGITAL" ? ACCENT : (lightMode ? "#475569" : "var(--pos-elevated)"),
                color: "#ffffff",
                boxShadow: focusZone === "mode" && mode === "DIGITAL" ? "0 0 0 2px rgba(var(--pos-accent-rgb),0.45)" : "none",
              }}
            >
              <Smartphone className="h-4 w-4" /> Digital
            </button>
            <button
              type="button"
              onClick={() => { setMode("PHYSICAL"); setFocusZone("mode"); }}
              className="flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-bold transition-all"
              style={{
                background: mode === "PHYSICAL" ? CARD_ACCENT : (lightMode ? "#475569" : "var(--pos-elevated)"),
                color: "#ffffff",
                boxShadow: focusZone === "mode" && mode === "PHYSICAL" ? "0 0 0 2px rgba(217,119,6,0.45)" : "none",
              }}
            >
              <CreditCard className="h-4 w-4" /> Card
            </button>
          </div>
        </section>

        {mode === "DIGITAL" ? (
          <>
            {/* Phone — no boxed frame */}
            <section className="space-y-2">
              <label className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: labelColor }}>
                <Phone className="h-3.5 w-3.5" style={{ color: ACCENT }} />
                Customer phone
                <span className="font-normal normal-case tracking-normal opacity-70">(optional)</span>
              </label>
              <input
                ref={phoneRef}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onFocus={() => setFocusZone("phone")}
                placeholder="077 123 4567"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className="w-full h-12 rounded-xl px-4 text-base font-mono tracking-wider tabular-nums outline-none transition-shadow placeholder:opacity-40"
                style={fieldStyle("phone")}
              />
            </section>

            {/* Amount — type freely; no preset denomination chips */}
            <section className="space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: labelColor }}>
                Amount (LKR)
              </label>
              <input
                ref={amountRef}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                onFocus={() => setFocusZone("amount")}
                placeholder="0.00"
                inputMode="decimal"
                className="w-full h-12 rounded-xl px-4 text-lg font-semibold font-mono tabular-nums outline-none transition-shadow placeholder:opacity-40"
                style={fieldStyle("amount")}
              />
            </section>
          </>
        ) : (
          <section className="space-y-2">
            <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: labelColor }}>
              Card denomination
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                    className="h-11 rounded-xl px-3 text-sm font-bold tabular-nums transition-all disabled:opacity-40 hover:opacity-90"
                    style={chipStyle({ selected: active, focused: kb, empty, light: lightMode })}
                  >
                    LKR {formatMoney(d.faceValue)}
                    {empty ? " · out" : ""}
                  </button>
                );
              })}
            </div>
            {!denoms.some((d) => d.availableCards > 0) && (
              <p className="text-xs font-medium" style={{ color: CARD_ACCENT }}>
                No physical cards — import PINs in Settings → Reload.
              </p>
            )}
          </section>
        )}

        {commission && (
          <div
            className="flex items-center justify-between gap-3 rounded-xl px-4 py-3"
            style={{ background: lightMode ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.12)" }}
          >
            <div>
              <p className="text-[11px] font-medium" style={{ color: labelColor }}>Customer pays</p>
              <p className="text-base font-bold tabular-nums" style={{ color: textColor }}>
                LKR {formatMoney(face)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium" style={{ color: labelColor }}>Commission {commission.pct}%</p>
              <p className="text-base font-bold tabular-nums" style={{ color: successColor }}>
                +LKR {formatMoney(commission.earned)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div
        className="shrink-0 px-5 pb-5 pt-2 space-y-2"
        style={{ borderTop: "1px solid var(--pos-border)", background: "var(--pos-panel)" }}
      >
        {quickPayUrl && operator && (
          <button
            type="button"
            onClick={openQuickPay}
            disabled={!(face > 0)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-all hover:opacity-90"
            style={{ background: "#16a34a", color: "#ffffff", boxShadow: "0 8px 20px rgba(22,163,74,0.25)" }}
          >
            <ExternalLink className="h-4 w-4" />
            Pay with {operator.name} Quick Pay
            {face > 0 && (
              <span className="opacity-90 font-mono tabular-nums">· LKR {formatMoney(face)}</span>
            )}
          </button>
        )}
        <button
          ref={submitRef}
          type="button"
          onClick={submit}
          onFocus={() => setFocusZone("submit")}
          disabled={!operator || !(face > 0)}
          data-pos-on-accent=""
          className="pos-cta flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-all hover:opacity-90"
          style={{
            background: "var(--pos-accent-grad)",
            color: "#ffffff",
            boxShadow: focusZone === "submit" ? "0 0 0 3px rgba(var(--pos-accent-rgb),0.28)" : "0 8px 20px rgba(var(--pos-accent-rgb),0.25)",
          }}
        >
          <ShoppingCart className="h-4 w-4" />
          Add to Cart
          {face > 0 && (
            <span className="opacity-90 font-mono tabular-nums">· LKR {formatMoney(face)}</span>
          )}
        </button>
        <p className="text-center text-[10px]" style={{ color: hintColor }}>
          ← → move · ↑ ↓ sections · Enter add
        </p>
      </div>

      {quickPayOpen && operator && quickPayUrl && typeof document !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Escape") cancelQuickPay();
          }}
        >
          <div className="flex w-full max-w-[440px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{operator.name} Quick Pay</p>
                <p className="truncate text-[11px] text-slate-500">
                  Complete the payment in the {operator.name} window
                </p>
              </div>
              <button
                type="button"
                title="Cancel"
                onClick={cancelQuickPay}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-center">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reload amount</p>
                <p className="text-3xl font-extrabold text-slate-900">LKR {formatMoney(face)}</p>
                {phone ? (
                  <div className="mt-1 flex items-center justify-center gap-2">
                    <span className="text-sm font-semibold text-slate-600">{phone}</span>
                    <button
                      type="button"
                      onClick={() => void copyReloadNumber()}
                      className="flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Copy className="h-3 w-3" />
                      {numberCopied ? "Copied" : "Copy"}
                    </button>
                  </div>
                ) : null}
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-[13px] text-slate-600">
                <li>In the {operator.name} window, tap <b>Prepaid Reload</b>.</li>
                <li>
                  {phone
                    ? <>Click the mobile number box and press <b>Ctrl+V</b> (number is already copied), choose LKR {formatMoney(face)}, then pay.</>
                    : <>Enter the number and choose LKR {formatMoney(face)}, then pay.</>}
                </li>
                <li>When payment succeeds, tap <b>Paid — Complete sale</b> here.</li>
              </ol>
              <div
                className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2 text-[12px]"
                style={{
                  borderColor: quickPayWinClosed ? "#fca5a5" : "#bbf7d0",
                  background: quickPayWinClosed ? "#fef2f2" : "#f0fdf4",
                  color: quickPayWinClosed ? "#b91c1c" : "#15803d",
                }}
              >
                <span className="font-semibold">
                  {quickPayWinClosed ? "Payment window is closed" : "Payment window is open"}
                </span>
                <button
                  type="button"
                  onClick={launchQuickPayWindow}
                  className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {quickPayWinClosed ? "Open again" : "Show window"}
                </button>
              </div>
            </div>
            <div className="flex shrink-0 gap-2 border-t bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={cancelQuickPay}
                className="h-11 flex-1 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmQuickPay()}
                disabled={quickSaleBusy}
                className="flex h-11 flex-[2] items-center justify-center gap-2 rounded-xl text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
                style={{ background: "#16a34a" }}
              >
                {quickSaleBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {onQuickSale ? "Paid — Complete sale" : "Paid — Add to bill"} · LKR {formatMoney(face)}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
