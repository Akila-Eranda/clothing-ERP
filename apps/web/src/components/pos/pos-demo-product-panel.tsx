"use client";

import * as React from "react";
import { ShoppingCart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { CartItem } from "@/types";

const INPUT_CLS =
  "w-full h-10 rounded-xl px-3 text-sm text-white outline-none focus:border-[#10b981] transition-colors placeholder:text-white/30";
const INPUT_STYLE = { background: "#1a2b4a", border: "1px solid #1e3356" } as const;

export function PosDemoProductPanel({
  onBack,
  onAddToCart,
  taxRate = 0,
}: {
  onBack: () => void;
  onAddToCart: (item: CartItem) => void;
  taxRate?: number;
}) {
  const [name, setName] = React.useState("");
  const [sellingPrice, setSellingPrice] = React.useState("");
  const [costPrice, setCostPrice] = React.useState("");
  const [qty, setQty] = React.useState("1");

  const submit = () => {
    if (!name.trim()) {
      toast.error("Name required");
      return;
    }
    const sell = parseFloat(sellingPrice);
    if (!(sell >= 0)) {
      toast.error("Enter a valid selling price");
      return;
    }
    const cost = parseFloat(costPrice || "0");
    const quantity = Math.max(1, parseInt(qty, 10) || 1);
    const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    onAddToCart({
      variantId: id,
      productName: name.trim(),
      variantName: "",
      sku: "",
      unitPrice: sell,
      mrp: sell,
      quantity,
      discountAmount: 0,
      discountType: "fixed",
      taxRate,
      stock: 999999,
      isCustom: true,
      costPrice: Number.isFinite(cost) ? cost : 0,
    });
    toast.success(`Demo item added: ${name.trim()}`);
    setName("");
    setSellingPrice("");
    setCostPrice("");
    setQty("1");
    onBack();
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" style={{ color: "#34d399" }} />
          <h2 className="text-white font-bold text-base">Demo Product</h2>
          <span
            className="text-[10px] font-bold px-2 py-0.5 rounded-md"
            style={{ background: "rgba(16,185,129,0.15)", color: "#6ee7b7" }}
          >
            Bill only
          </span>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 h-8 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: "#6a8ab8" }}
        >
          ← Back
        </button>
      </div>

      <div
        className="rounded-xl border p-4 space-y-3 overflow-y-auto max-w-xl"
        style={{ background: "#162338", borderColor: "#1e3356" }}
      >
        <p className="text-[11px]" style={{ color: "#6a8ab8" }}>
          Add a one-off demo line to the bill. Not saved in Products. Remove anytime from the cart (✕).
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Demo item name"
            className={INPUT_CLS}
            style={INPUT_STYLE}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Selling *</label>
            <input
              type="number"
              min={0}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(e.target.value)}
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
          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Cost</label>
            <input
              type="number"
              min={0}
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="Optional"
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Qty</label>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={INPUT_CLS}
            style={INPUT_STYLE}
          />
        </div>

        <button
          type="button"
          onClick={submit}
          className="w-full h-11 rounded-xl flex items-center justify-center gap-1.5 text-sm font-bold text-white transition-all hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
        >
          <ShoppingCart className="h-4 w-4" />
          Add to bill
        </button>
      </div>
    </div>
  );
}
