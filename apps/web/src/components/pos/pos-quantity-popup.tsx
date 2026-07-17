"use client";

import * as React from "react";
import { ChevronRight, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { posListPrice } from "@/lib/pos-totals";
import { variantDisplayLabel } from "@/lib/shop-vertical";
import { useShopWorkspace } from "@/lib/use-shop-profile";

export type PosAddPopupVariant = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  unitPrice: number;
  mrp?: number;
  stock: number;
  color?: string;
  size?: string;
  material?: string;
  style?: string;
  imageUrl?: string;
};

type Props = {
  productName: string;
  variantName?: string;
  maxQty: number;
  unitPrice: number;
  mrp?: number;
  variants?: PosAddPopupVariant[];
  onConfirm: (payload: { qty: number; unitPrice: number; variant?: PosAddPopupVariant }) => void;
  onCancel: () => void;
  touchMode?: boolean;
};

const EMPTY_VARIANTS: PosAddPopupVariant[] = [];

function money(n: number) {
  return `Rs. ${formatNumber(n)}`;
}

export function PosQuantityPopup({
  productName,
  variantName,
  maxQty,
  unitPrice,
  mrp,
  variants = EMPTY_VARIANTS,
  onConfirm,
  onCancel,
  touchMode,
}: Props) {
  const { profile } = useShopWorkspace();
  const hasVariants = variants.length > 1;
  const [selectedVariantId, setSelectedVariantId] = React.useState(() => variants[0]?.variantId ?? "");
  const [qtyRaw, setQtyRaw] = React.useState("1");
  const [priceRaw, setPriceRaw] = React.useState(String(unitPrice));
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const qtyInputRef = React.useRef<HTMLInputElement>(null);
  const priceInputRef = React.useRef<HTMLInputElement>(null);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const selectedVariant = React.useMemo(
    () => variants.find((v) => v.variantId === selectedVariantId) ?? variants[0] ?? null,
    [variants, selectedVariantId],
  );

  const stockLimit = Math.max(1, selectedVariant?.stock ?? maxQty);
  const qty = Math.min(stockLimit, Math.max(1, parseInt(qtyRaw, 10) || 1));
  const listPrice = posListPrice(selectedVariant ?? { unitPrice, mrp });
  const unitPriceValue = Math.max(0, parseFloat(priceRaw) || 0);
  const priceCut = Math.max(0, listPrice - unitPriceValue);
  const hasPriceCut = priceCut > 0.001;
  const lineTotal = qty * unitPriceValue;
  const lineDiscount = hasPriceCut ? priceCut * qty : 0;
  const btnH = touchMode ? "h-14" : "h-12";
  const fieldStyle = { background: "#1a1f2a", borderColor: "#2a3140" } as const;
  const crossProductPick = React.useMemo(
    () => hasVariants && new Set(variants.map((v) => v.productName)).size > 1,
    [hasVariants, variants],
  );
  const headerTitle = crossProductPick
    ? (selectedVariant?.productName ?? productName)
    : productName;

  const productKey = React.useMemo(
    () => (hasVariants ? variants.map((v) => v.variantId).join("|") : `${productName}:${unitPrice}`),
    [hasVariants, variants, productName, unitPrice],
  );

  React.useEffect(() => {
    const next = variants[0];
    if (!next) {
      setPriceRaw(String(unitPrice));
      setQtyRaw("1");
      return;
    }
    setSelectedVariantId(next.variantId);
    setQtyRaw("1");
    setPriceRaw(String(next.unitPrice));
  }, [productKey, variants, unitPrice]);

  const refreshScrollHint = React.useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setCanScrollRight(false);
      return;
    }
    setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 8);
  }, []);

  React.useEffect(() => {
    refreshScrollHint();
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", refreshScrollHint, { passive: true });
    window.addEventListener("resize", refreshScrollHint);
    return () => {
      el.removeEventListener("scroll", refreshScrollHint);
      window.removeEventListener("resize", refreshScrollHint);
    };
  }, [refreshScrollHint, variants.length]);

  const clampQty = (n: number) => Math.min(stockLimit, Math.max(1, n));

  const pickVariant = (variant: PosAddPopupVariant) => {
    setSelectedVariantId(variant.variantId);
    setQtyRaw("1");
    setPriceRaw(String(variant.unitPrice));
  };

  const bump = (delta: number) => setQtyRaw(String(clampQty(qty + delta)));

  const moveVariant = React.useCallback((direction: -1 | 1) => {
    if (!variants.length) return;
    const current = Math.max(0, variants.findIndex((v) => v.variantId === selectedVariantId));
    let next = current;
    for (let checked = 0; checked < variants.length; checked += 1) {
      next = (next + direction + variants.length) % variants.length;
      // Prefer in-stock; if all are out, still allow cycling to any card
      const candidate = variants[next];
      const hasAnyStock = variants.some((v) => v.stock > 0);
      if (!hasAnyStock || candidate.stock > 0) {
        pickVariant(candidate);
        const el = scrollRef.current?.children?.[next] as HTMLElement | undefined;
        el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
        break;
      }
    }
  }, [selectedVariantId, variants]);

  const onQtyInput = (value: string) => {
    const cleaned = value.replace(/[^\d]/g, "");
    if (!cleaned) {
      setQtyRaw("");
      return;
    }
    const n = parseInt(cleaned, 10);
    if (Number.isNaN(n)) return;
    setQtyRaw(String(Math.min(stockLimit, n)));
  };

  const onPriceInput = (value: string) => {
    if (value === "" || /^\d*\.?\d*$/.test(value)) setPriceRaw(value);
  };

  const submit = React.useCallback(() => {
    if (unitPriceValue <= 0) return;
    onConfirm({
      qty,
      unitPrice: unitPriceValue,
      variant: selectedVariant ?? undefined,
    });
  }, [unitPriceValue, qty, selectedVariant, onConfirm]);

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      qtyInputRef.current?.focus();
      qtyInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inQty = target === qtyInputRef.current;
      const inPrice = target === priceInputRef.current;
      const inPopupInput = inQty || inPrice;
      const key = e.key.toLowerCase();

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      // Enter confirms selected product + qty/price
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        submit();
        return;
      }

      // ← / → select product/variant (no Alt required); works even in qty/price fields
      if (hasVariants && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        e.stopPropagation();
        moveVariant(e.key === "ArrowLeft" ? -1 : 1);
        return;
      }

      // Q / P switch fields even when already in an input
      if (!e.ctrlKey && !e.metaKey && !e.altKey && key === "q") {
        e.preventDefault();
        e.stopPropagation();
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && key === "p") {
        e.preventDefault();
        e.stopPropagation();
        priceInputRef.current?.focus();
        priceInputRef.current?.select();
        return;
      }

      // Qty bump — ↑/↓ (and +/- when not typing)
      if (e.key === "ArrowUp" || (!inPopupInput && (e.key === "+" || e.key === "="))) {
        e.preventDefault();
        e.stopPropagation();
        bump(1);
        return;
      }
      if (e.key === "ArrowDown" || (!inPopupInput && e.key === "-")) {
        e.preventDefault();
        e.stopPropagation();
        bump(-1);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [hasVariants, moveVariant, onCancel, qty, stockLimit, submit]);

  const variantLayout = variants.length <= 3 ? "grid" : "scroll";
  const variantGridClass =
    variants.length === 1 ? "grid-cols-1" : variants.length === 2 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        style={{ background: "#12151c", borderColor: "#2a3140" }}
      >
        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b shrink-0 space-y-2" style={{ borderColor: "#2a3140" }}>
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-white font-bold text-lg leading-tight truncate">{headerTitle}</p>
              {!hasVariants && variantName ? (
                <p className="text-xs mt-1 truncate" style={{ color: "#9ca3af" }}>{variantName}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onCancel}
              className="p-2 rounded-lg hover:bg-white/10 shrink-0 -mt-0.5"
            >
              <X className="h-4 w-4 text-white/80" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(79,110,247,0.18)", color: "#93b4ff" }}
            >
              Max qty {stockLimit}
            </span>
            <span
              className="text-[10px] font-semibold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(16,185,129,0.15)", color: "#4ade80" }}
            >
              {selectedVariant?.stock ?? maxQty} in stock
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
          {/* Variants */}
          {hasVariants && (
            <div className="space-y-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                {crossProductPick ? "Same barcode — pick item" : "Pick variant"}
              </p>
              {variantLayout === "grid" ? (
                <div ref={scrollRef} className={`grid ${variantGridClass} gap-2.5`}>
                  {variants.map((v) => {
                    const active = selectedVariantId === v.variantId;
                    const out = v.stock <= 0;
                    return (
                      <button
                        key={v.variantId}
                        type="button"
                        disabled={out}
                        onClick={() => pickVariant(v)}
                        className="rounded-xl border px-3 py-3 text-left transition-all disabled:opacity-40"
                        style={{
                          background: active ? "rgba(59,130,246,0.14)" : "#1a1f2a",
                          borderColor: active ? "#3b82f6" : "#2a3140",
                          boxShadow: active ? "0 0 0 1px rgba(59,130,246,0.35)" : undefined,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            {crossProductPick ? (
                              <>
                                <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{v.productName}</p>
                                <p className="text-[11px] mt-0.5 truncate" style={{ color: "#9ca3af" }}>
                                  {variantDisplayLabel(v, profile) || v.variantName}
                                </p>
                              </>
                            ) : (
                              <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                                {variantDisplayLabel(v, profile) || v.variantName}
                              </p>
                            )}
                          </div>
                          <span
                            className="mt-0.5 h-4 w-4 rounded-full border-2 shrink-0"
                            style={{
                              borderColor: active ? "#3b82f6" : "#4b5563",
                              background: active ? "#3b82f6" : "transparent",
                              boxShadow: active ? "inset 0 0 0 2px #12151c" : undefined,
                            }}
                          />
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <p className="text-sm font-bold tabular-nums" style={{ color: active ? "#60a5fa" : "#f3f4f6" }}>
                            {money(v.unitPrice)}
                          </p>
                          <p className="text-[11px] font-medium tabular-nums" style={{ color: v.stock > 0 ? "#4ade80" : "#f87171" }}>
                            {v.stock} left
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="relative">
                  <div
                    ref={scrollRef}
                    className="flex gap-2.5 overflow-x-auto pb-1 pr-6 scrollbar-thin"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {variants.map((v) => {
                      const active = selectedVariantId === v.variantId;
                      const out = v.stock <= 0;
                      return (
                        <button
                          key={v.variantId}
                          type="button"
                          disabled={out}
                          onClick={() => pickVariant(v)}
                          className="shrink-0 w-[140px] rounded-xl border px-3 py-3 text-left transition-all disabled:opacity-40"
                          style={{
                            background: active ? "rgba(59,130,246,0.14)" : "#1a1f2a",
                            borderColor: active ? "#3b82f6" : "#2a3140",
                          }}
                        >
                          <div className="flex items-start justify-between gap-1 mb-2">
                            <p className="text-sm font-semibold text-white leading-snug line-clamp-2">
                              {crossProductPick ? v.productName : (variantDisplayLabel(v, profile) || v.variantName)}
                            </p>
                            <span
                              className="mt-0.5 h-3.5 w-3.5 rounded-full border-2 shrink-0"
                              style={{
                                borderColor: active ? "#3b82f6" : "#4b5563",
                                background: active ? "#3b82f6" : "transparent",
                                boxShadow: active ? "inset 0 0 0 2px #12151c" : undefined,
                              }}
                            />
                          </div>
                          <p className="text-sm font-bold tabular-nums" style={{ color: active ? "#60a5fa" : "#e5e7eb" }}>
                            {money(v.unitPrice)}
                          </p>
                          <p className="text-[11px] mt-0.5 font-medium" style={{ color: v.stock > 0 ? "#4ade80" : "#f87171" }}>
                            {v.stock} left
                          </p>
                        </button>
                      );
                    })}
                  </div>
                  {canScrollRight && (
                    <div
                      className="pointer-events-none absolute right-0 top-0 bottom-1 w-10 flex items-center justify-end"
                      style={{ background: "linear-gradient(90deg, transparent, #12151c 70%)" }}
                    >
                      <div
                        className="pointer-events-auto h-8 w-8 rounded-full flex items-center justify-center mr-0.5"
                        style={{ background: "#1a1f2a", border: "1px solid #2a3140" }}
                        onClick={() => scrollRef.current?.scrollBy({ left: 140, behavior: "smooth" })}
                      >
                        <ChevronRight className="h-4 w-4" style={{ color: "#9ca3af" }} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Quantity + price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                Quantity
              </p>
              <div className="flex items-center rounded-xl overflow-hidden border h-12" style={fieldStyle}>
                <button
                  type="button"
                  onClick={() => bump(-1)}
                  disabled={qty <= 1}
                  className="h-full w-10 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/5 shrink-0"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  ref={qtyInputRef}
                  type="text"
                  inputMode="numeric"
                  value={qtyRaw}
                  onChange={(e) => onQtyInput(e.target.value)}
                  onBlur={() => setQtyRaw(String(qty))}
                  className="flex-1 min-w-0 h-full bg-transparent text-center text-lg font-bold text-white tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => bump(1)}
                  disabled={qty >= stockLimit}
                  className="h-full w-10 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/5 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 min-h-[16px]">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                  Sale price
                </p>
                {hasPriceCut ? (
                  <p className="text-[10px] tabular-nums truncate" style={{ color: "#9ca3af" }}>
                    List {money(listPrice)}
                  </p>
                ) : null}
              </div>
              <input
                ref={priceInputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={priceRaw}
                onChange={(e) => onPriceInput(e.target.value)}
                onKeyDown={(e) => e.stopPropagation()}
                onBlur={() => {
                  if (!priceRaw.trim() || Number.isNaN(parseFloat(priceRaw))) {
                    setPriceRaw(String(selectedVariant?.unitPrice ?? unitPrice));
                  }
                }}
                className="w-full h-12 rounded-xl px-3 text-lg font-bold text-white tabular-nums outline-none border focus:border-[#3b82f6]"
                style={fieldStyle}
              />
            </div>
          </div>

          {/* Summary card */}
          <div
            className="rounded-xl border px-4 py-3.5 flex items-center justify-between gap-4"
            style={{ background: "#1a1f2a", borderColor: "#2a3140" }}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#9ca3af" }}>
                Line total
              </p>
              <p className="text-sm text-white/80 tabular-nums mt-1">
                {hasPriceCut ? (
                  <>
                    <span className="line-through text-white/45">{money(listPrice)}</span>
                    <span className="mx-1.5 text-white/35">→</span>
                    {money(unitPriceValue)} × {qty}
                  </>
                ) : (
                  <>{money(unitPriceValue)} × {qty}</>
                )}
              </p>
              {hasPriceCut ? (
                <p className="text-xs mt-1 tabular-nums font-medium" style={{ color: "#fbbf24" }}>
                  Discount −{money(lineDiscount)}
                </p>
              ) : null}
            </div>
            <div className="text-right shrink-0">
              <p className="text-2xl font-bold tabular-nums leading-none" style={{ color: "#22c55e" }}>
                {money(lineTotal)}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 pb-4 pt-2 shrink-0 space-y-2.5 border-t" style={{ borderColor: "#2a3140" }}>
          <p className="text-[10px] text-center pt-2" style={{ color: "#6b7280" }}>
            {hasVariants ? "← → pick item · " : ""}↑/↓ qty · Q qty · P price · Enter add · Esc close
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={onCancel}
              className={`flex-1 ${btnH} rounded-xl font-semibold text-white/90 hover:bg-white/5 transition-colors`}
              style={{ background: "#1a1f2a", border: "1px solid #2a3140" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={unitPriceValue <= 0 || (selectedVariant?.stock ?? maxQty) <= 0}
              className={`flex-[1.35] ${btnH} rounded-xl font-bold text-white disabled:opacity-40 flex items-center justify-center gap-2.5 transition-opacity`}
              style={{ background: "linear-gradient(180deg, #22c55e 0%, #16a34a 100%)" }}
            >
              <ShoppingCart className="h-4 w-4 shrink-0" />
              <span>Add to Cart</span>
              <span
                className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-md"
                style={{ background: "rgba(0,0,0,0.22)" }}
              >
                {money(lineTotal)}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
