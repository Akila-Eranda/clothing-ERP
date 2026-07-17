"use client";

import * as React from "react";
import { Package, X } from "lucide-react";
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

  const selectedVariant = React.useMemo(
    () => variants.find((v) => v.variantId === selectedVariantId) ?? variants[0] ?? null,
    [variants, selectedVariantId],
  );

  React.useEffect(() => {
    const next = variants[0];
    if (!next) return;
    setSelectedVariantId(next.variantId);
    setQtyRaw("1");
    setPriceRaw(String(next.unitPrice));
  }, [variants]);

  const stockLimit = Math.max(1, selectedVariant?.stock ?? maxQty);
  const qty = Math.min(stockLimit, Math.max(1, parseInt(qtyRaw, 10) || 1));
  const unitPriceValue = Math.max(0, parseFloat(priceRaw) || 0);
  const btn = touchMode ? "h-14 text-xl" : "h-11 text-base";
  const inputCls = "w-full h-10 rounded-xl px-3 text-sm text-white outline-none focus:border-[#4f6ef7] transition-colors";
  const inputStyle = { background: "#1a2b4a", border: "1px solid #1e3356" } as const;

  const pressQty = (d: string) => {
    setQtyRaw((prev) => {
      if (d === "C") return "1";
      if (d === "⌫") return prev.length <= 1 ? "1" : prev.slice(0, -1);
      const next = prev === "0" || (prev === "1" && d !== "0" && prev.length === 1) ? d : prev + d;
      const n = parseInt(next, 10);
      if (Number.isNaN(n)) return prev;
      return String(Math.min(stockLimit, n));
    });
  };

  const pickVariant = (variant: PosAddPopupVariant) => {
    setSelectedVariantId(variant.variantId);
    setQtyRaw("1");
    setPriceRaw(String(variant.unitPrice));
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key === "Enter" && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, submit]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="w-full max-w-md rounded-2xl border overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
        style={{ background: "#0f1f3a", borderColor: "#1e3356" }}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#1e3356" }}>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">{productName}</p>
            {!hasVariants && variantName ? (
              <p className="text-xs mt-0.5 truncate" style={{ color: "#6a8ab8" }}>{variantName}</p>
            ) : null}
            <p className="text-xs mt-1" style={{ color: "#4a6a8a" }}>
              Max {stockLimit}
              {selectedVariant ? ` · Stock ${selectedVariant.stock}` : ""}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {hasVariants && (
            <div className="space-y-2">
              <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "#6a8ab8" }}>Select variant</p>
              <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                {variants.map((v) => {
                  const active = selectedVariantId === v.variantId;
                  const out = v.stock <= 0;
                  return (
                    <button
                      key={v.variantId}
                      type="button"
                      disabled={out}
                      onClick={() => pickVariant(v)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-40"
                      style={{
                        background: active ? "rgba(79,110,247,0.18)" : "#162338",
                        borderColor: active ? "#4f6ef7" : "#1e3356",
                      }}
                    >
                      <div className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 overflow-hidden" style={{ background: "rgba(79,110,247,0.12)" }}>
                        {v.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={v.imageUrl} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <Package className="h-4 w-4" style={{ color: "#4f6ef7" }} />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">
                          {variantDisplayLabel(v, profile) || v.variantName}
                        </p>
                        <p className="text-[10px] font-mono truncate" style={{ color: "#6a8ab8" }}>
                          {v.barcode || v.sku}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-bold" style={{ color: "#4f6ef7" }}>LKR {formatNumber(v.unitPrice)}</p>
                        <p className="text-[10px]" style={{ color: v.stock > 0 ? "#10b981" : "#ef4444" }}>Stock {v.stock}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[11px] font-semibold" style={{ color: "#6a8ab8" }}>Quantity</label>
              <input
                type="number"
                min={1}
                max={stockLimit}
                value={qtyRaw}
                onChange={(e) => setQtyRaw(e.target.value.replace(/[^\d]/g, ""))}
                className={inputCls}
                style={inputStyle}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-semibold" style={{ color: "#6a8ab8" }}>Selling price (LKR)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={priceRaw}
                onChange={(e) => setPriceRaw(e.target.value)}
                className={inputCls}
                style={inputStyle}
              />
            </div>
          </div>

          <div className="text-center py-1">
            <div className="text-3xl font-bold text-white tabular-nums">{qty}</div>
            <p className="text-xs mt-1" style={{ color: "#6a8ab8" }}>
              Line total LKR {formatNumber(qty * unitPriceValue)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => pressQty(d)}
                className={`${btn} rounded-xl font-bold text-white transition-all hover:opacity-90`}
                style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}
              >
                {d}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 px-4 pb-4 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            className={`flex-1 ${btn} rounded-xl font-semibold`}
            style={{ border: "1px solid #1e3356", color: "#6a8ab8" }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={unitPriceValue <= 0 || (selectedVariant?.stock ?? maxQty) <= 0}
            className={`flex-1 ${btn} rounded-xl font-bold text-white disabled:opacity-40`}
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            Add ×{qty}
          </button>
        </div>
      </div>
    </div>
  );
}
