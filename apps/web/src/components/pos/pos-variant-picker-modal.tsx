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

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border overflow-hidden shadow-2xl flex flex-col max-h-[80vh]"
        style={{ background: "#0f1f3a", borderColor: "#1e3356" }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "#1e3356" }}>
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">{productName}</p>
            <p className="text-[11px]" style={{ color: "#6a8ab8" }}>
              Select a variant · {variants.length} options · prices may differ
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
            <X className="h-4 w-4" style={{ color: "#6a8ab8" }} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-2 space-y-1.5">
          {variants.map((v) => {
            const out = v.stock <= 0;
            return (
              <button
                key={v.variantId}
                type="button"
                disabled={out}
                onClick={() => onSelect(v)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:border-blue-500/50"
                style={{ background: "#162338", borderColor: "#1e3356" }}
              >
                <div
                  className="h-11 w-11 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(79,110,247,0.12)" }}
                >
                  <Package className="h-5 w-5" style={{ color: "#4f6ef7" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-semibold truncate">
                    {variantDisplayLabel(v, profile) || v.variantName}
                  </p>
                  <p className="text-[10px] font-mono truncate" style={{ color: "#6a8ab8" }}>
                    {v.sku}
                    {v.barcode ? ` · ${v.barcode}` : ""}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: out ? "#ef4444" : "#6a8ab8" }}>
                    Stock: {v.stock}{out ? " · Out of stock" : ""}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold" style={{ color: "#4f6ef7" }}>
                    LKR {formatNumber(v.unitPrice)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
