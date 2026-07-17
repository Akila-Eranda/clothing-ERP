"use client";

import * as React from "react";
import { ChevronRight, Minus, Plus, ShoppingCart, X } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { variantDisplayLabel } from "@/lib/shop-vertical";
import { useShopWorkspace } from "@/lib/use-shop-profile";

export type PosAddPopupVariant = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  unitPrice: number;
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
  variants?: PosAddPopupVariant[];
  onConfirm: (payload: { qty: number; unitPrice: number; variant?: PosAddPopupVariant }) => void;
  onCancel: () => void;
  touchMode?: boolean;
};

function money(n: number) {
  return `Rs. ${formatNumber(n)}`;
}

export function PosQuantityPopup({
  productName,
  variantName,
  maxQty,
  unitPrice,
  variants = [],
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
  const catalogPrice = selectedVariant?.unitPrice ?? unitPrice;
  const unitPriceValue = Math.max(0, parseFloat(priceRaw) || 0);
  const priceCut = Math.max(0, catalogPrice - unitPriceValue);
  const hasPriceCut = priceCut > 0.001;
  const lineTotal = qty * unitPriceValue;
  const lineDiscount = hasPriceCut ? priceCut * qty : 0;
  const btnH = touchMode ? "h-14" : "h-12";
  const fieldStyle = { background: "#1a1f2a", borderColor: "#2a3140" } as const;

  React.useEffect(() => {
    const next = variants[0];
    if (!next) {
      setPriceRaw(String(unitPrice));
      return;
    }
    setSelectedVariantId(next.variantId);
    setQtyRaw("1");
    setPriceRaw(String(next.unitPrice));
  }, [variants, unitPrice]);

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
      if (variants[next].stock > 0) {
        pickVariant(variants[next]);
        scrollRef.current?.children[next]?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "nearest",
        });
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
      const inInput = e.target instanceof HTMLInputElement;

      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
        return;
      }
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault();
        moveVariant(-1);
        return;
      }
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault();
        moveVariant(1);
        return;
      }
      if (!inInput && e.key.toLowerCase() === "q") {
        e.preventDefault();
        qtyInputRef.current?.focus();
        qtyInputRef.current?.select();
        return;
      }
      if (!inInput && e.key.toLowerCase() === "p") {
        e.preventDefault();
        priceInputRef.current?.focus();
        priceInputRef.current?.select();
        return;
      }
      if (!inInput && (e.key === "+" || e.key === "=" || e.key === "ArrowUp")) {
        e.preventDefault();
        bump(1);
        return;
      }
      if (!inInput && (e.key === "-" || e.key === "ArrowDown")) {
        e.preventDefault();
        bump(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveVariant, onCancel, qty, stockLimit, submit]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.72)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        style={{ background: "#12151c", borderColor: "#2a3140" }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3.5 border-b shrink-0" style={{ borderColor: "#2a3140" }}>
          <p className="text-white font-bold text-base truncate min-w-0">{productName}</p>
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{ background: "rgba(79,110,247,0.22)", color: "#8ba3ff" }}
          >
            Max {stockLimit}
          </span>
          <span
            className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{ background: "rgba(16,185,129,0.18)", color: "#34d399" }}
          >
            Stock {selectedVariant?.stock ?? maxQty}
          </span>
          {!hasVariants && variantName ? (
            <span className="text-xs truncate hidden sm:inline" style={{ color: "#6b7280" }}>{variantName}</span>
          ) : null}
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto p-1.5 rounded-lg hover:bg-white/10 shrink-0"
          >
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {/* Variants — horizontal cards */}
          {hasVariants && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
                Select variant
              </p>
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
                        className="shrink-0 w-[132px] rounded-xl border px-3 py-3 text-left transition-all disabled:opacity-40"
                        style={{
                          background: active ? "rgba(59,130,246,0.12)" : "#1a1f2a",
                          borderColor: active ? "#3b82f6" : "#2a3140",
                        }}
                      >
                        <div className="flex items-start justify-between gap-1 mb-2">
                          <p className="text-sm font-bold text-white leading-tight line-clamp-2">
                            {variantDisplayLabel(v, profile) || v.variantName}
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
                        <p
                          className="text-sm font-bold tabular-nums"
                          style={{ color: active ? "#60a5fa" : "#e5e7eb" }}
                        >
                          {money(v.unitPrice)}
                        </p>
                        <p
                          className="text-[11px] mt-0.5 font-medium"
                          style={{ color: v.stock > 0 ? "#34d399" : "#f87171" }}
                        >
                          {v.stock} in stock
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
            </div>
          )}

          {/* Quantity + Unit price (both typable) */}
          <div className="grid grid-cols-2 gap-4 items-start">
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
                Quantity
              </p>
              <div
                className="flex items-center rounded-xl overflow-hidden border"
                style={fieldStyle}
              >
                <button
                  type="button"
                  onClick={() => bump(-1)}
                  disabled={qty <= 1}
                  className="h-12 w-11 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/5 shrink-0"
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
                  className="flex-1 min-w-0 h-12 bg-transparent text-center text-xl font-bold text-white tabular-nums outline-none"
                />
                <button
                  type="button"
                  onClick={() => bump(1)}
                  disabled={qty >= stockLimit}
                  className="h-12 w-11 flex items-center justify-center text-white disabled:opacity-30 hover:bg-white/5 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
                Selling price (Rs.)
              </p>
              <input
                ref={priceInputRef}
                type="text"
                inputMode="decimal"
                value={priceRaw}
                onChange={(e) => onPriceInput(e.target.value)}
                onBlur={() => {
                  if (!priceRaw || Number.isNaN(parseFloat(priceRaw))) setPriceRaw("0");
                }}
                className="w-full h-12 rounded-xl px-3 text-lg font-bold text-white tabular-nums outline-none border focus:border-[#3b82f6]"
                style={fieldStyle}
              />
            </div>
          </div>

          {/* Total */}
          <div
            className="flex items-end justify-between gap-3 pt-1 border-t"
            style={{ borderColor: "#2a3140" }}
          >
            <div className="pt-3">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
                Unit × Qty
              </p>
              <p className="text-sm text-white/70 tabular-nums mt-1">
                {hasPriceCut ? (
                  <>
                    <span style={{ textDecoration: "line-through" }}>{money(catalogPrice)}</span>
                    {" → "}
                    {money(unitPriceValue)} × {qty}
                  </>
                ) : (
                  <>{money(unitPriceValue)} × {qty}</>
                )}
              </p>
              {hasPriceCut ? (
                <p className="text-xs mt-1 tabular-nums" style={{ color: "#fbbf24" }}>
                  Discount -{money(lineDiscount)}
                </p>
              ) : null}
            </div>
            <div className="pt-3 text-right">
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#6b7280" }}>
                Total
              </p>
              <p className="text-3xl font-bold tabular-nums mt-1" style={{ color: "#22c55e" }}>
                {money(lineTotal)}
              </p>
            </div>
          </div>

          <p className="text-[10px] text-center" style={{ color: "#6b7280" }}>
            Alt + ←/→ variant · Q quantity · P price · ↑/↓ quantity · Enter add · Esc close
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2.5 px-4 pb-4 pt-1 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 ${btnH} rounded-xl font-semibold text-white`}
            style={{ background: "#1a1f2a", border: "1px solid #2a3140" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={unitPriceValue <= 0 || (selectedVariant?.stock ?? maxQty) <= 0}
            className={`flex-[1.4] ${btnH} rounded-xl font-bold text-white disabled:opacity-40 flex items-center justify-between gap-2 px-3`}
            style={{ background: "#16a34a" }}
          >
            <span className="flex items-center gap-2 pl-1">
              <ShoppingCart className="h-4 w-4" />
              Add to Cart
            </span>
            <span
              className="text-xs font-bold tabular-nums px-2.5 py-1 rounded-lg shrink-0"
              style={{ background: "rgba(0,0,0,0.28)" }}
            >
              {money(lineTotal)}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
