"use client";

import * as React from "react";
import { X, Package } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { variantDisplayLabel } from "@/lib/shop-vertical";
import { useShopWorkspace } from "@/lib/use-shop-profile";

export type PosVariantOption = {
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

const LOW_STOCK_AT = 5;

function stockTone(stock: number) {
  if (stock <= 0) return { label: "Out of Stock", bg: "rgba(220,38,38,0.9)", text: "#fff", pill: "#dc2626" };
  if (stock <= LOW_STOCK_AT) return { label: "Low Stock", bg: "rgba(217,119,6,0.9)", text: "#fff", pill: "#d97706" };
  return { label: "Available", bg: "rgba(22,163,74,0.2)", text: "#4ade80", pill: "#16a34a" };
}

export function PosVariantPickerModal({
  productName,
  variants,
  onSelect,
  onClose,
}: {
  productName: string;
  variants: PosVariantOption[];
  onSelect: (v: PosVariantOption) => void;
  onClose: () => void;
}) {
  const { profile } = useShopWorkspace();
  const [focusIdx, setFocusIdx] = React.useState(() => {
    const firstIn = variants.findIndex((v) => v.stock > 0);
    return firstIn >= 0 ? firstIn : 0;
  });

  React.useEffect(() => {
    const firstIn = variants.findIndex((v) => v.stock > 0);
    setFocusIdx(firstIn >= 0 ? firstIn : 0);
  }, [variants]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(variants.length - 1, i + 1));
        return;
      }
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(0, i - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const v = variants[focusIdx];
        if (v && v.stock > 0) onSelect(v);
        return;
      }
      if (/^[1-9]$/.test(e.key)) {
        const idx = parseInt(e.key, 10) - 1;
        const v = variants[idx];
        if (v && v.stock > 0) {
          e.preventDefault();
          onSelect(v);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onSelect, variants, focusIdx]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
        style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--pos-border)" }}>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">{productName}</p>
            <p className="text-[11px]" style={{ color: "var(--pos-muted)" }}>
              Select variant · ↑↓←→ Enter · Esc · {variants.length} options
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="h-4 w-4" style={{ color: "var(--pos-muted)" }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
          {variants.map((v, idx) => {
            const out = v.stock <= 0;
            const tone = stockTone(v.stock);
            const focused = focusIdx === idx;
            return (
              <button
                key={v.variantId}
                type="button"
                disabled={out}
                onMouseEnter={() => setFocusIdx(idx)}
                onClick={() => onSelect(v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: focused ? "rgba(79,110,247,0.18)" : "var(--pos-card)",
                  borderColor: focused ? "#4f6ef7" : "var(--pos-border)",
                  boxShadow: focused ? "0 0 0 1px rgba(79,110,247,0.45)" : "none",
                }}
              >
                <div
                  className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
                  style={{ background: "rgba(79,110,247,0.12)" }}
                >
                  {v.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v.imageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Package className="h-5 w-5" style={{ color: "#4f6ef7" }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-white text-sm font-semibold truncate">
                      {variantDisplayLabel(v, profile) || v.variantName}
                    </p>
                    {(out || v.stock <= LOW_STOCK_AT) && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: tone.bg, color: tone.text }}
                      >
                        {tone.label}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] font-mono truncate" style={{ color: "var(--pos-muted)" }}>
                    {v.barcode || v.sku}
                    {v.barcode && v.sku !== v.barcode ? ` · ${v.sku}` : ""}
                  </p>
                  <p className="text-[10px] mt-0.5 font-semibold" style={{ color: tone.pill }}>
                    Stock: {v.stock}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" style={{ color: "#4f6ef7" }}>
                    LKR {formatNumber(v.unitPrice)}
                  </p>
                  {idx < 9 && (
                    <p className="text-[9px] font-mono mt-0.5" style={{ color: "var(--pos-muted-2)" }}>{idx + 1}</p>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
