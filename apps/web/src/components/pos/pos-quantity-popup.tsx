"use client";

import React from "react";
import { X } from "lucide-react";

type Props = {
  productName: string;
  variantName?: string;
  maxQty: number;
  unitPrice: number;
  onConfirm: (qty: number) => void;
  onCancel: () => void;
  touchMode?: boolean;
};

/** Numpad quantity popup for scan/add flows. */
export function PosQuantityPopup({
  productName,
  variantName,
  maxQty,
  unitPrice,
  onConfirm,
  onCancel,
  touchMode,
}: Props) {
  const [raw, setRaw] = React.useState("1");
  const qty = Math.min(maxQty, Math.max(1, parseInt(raw, 10) || 1));
  const btn = touchMode ? "h-14 text-xl" : "h-11 text-base";

  const press = (d: string) => {
    setRaw((prev) => {
      if (d === "C") return "1";
      if (d === "⌫") return prev.length <= 1 ? "1" : prev.slice(0, -1);
      const next = prev === "0" || prev === "1" && d !== "0" && prev.length === 1 ? d : prev + d;
      const n = parseInt(next, 10);
      if (Number.isNaN(n)) return prev;
      return String(Math.min(maxQty, n));
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.7)" }} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="w-full max-w-sm rounded-2xl border overflow-hidden shadow-2xl" style={{ background: "#0f1f3a", borderColor: "#1e3356" }}>
        <div className="flex items-start justify-between px-4 py-3 border-b" style={{ borderColor: "#1e3356" }}>
          <div>
            <p className="text-white font-bold text-sm">{productName}</p>
            {variantName ? <p className="text-xs mt-0.5" style={{ color: "#6a8ab8" }}>{variantName}</p> : null}
            <p className="text-xs mt-1" style={{ color: "#4a6a8a" }}>Max {maxQty} · LKR {unitPrice.toFixed(2)} each</p>
          </div>
          <button type="button" onClick={onCancel} className="p-1.5 rounded-lg hover:bg-white/10"><X className="h-4 w-4 text-white" /></button>
        </div>
        <div className="px-4 py-4 text-center">
          <div className="text-4xl font-bold text-white tabular-nums">{qty}</div>
          <p className="text-xs mt-1" style={{ color: "#6a8ab8" }}>Line total LKR {(qty * unitPrice).toFixed(2)}</p>
        </div>
        <div className="grid grid-cols-3 gap-2 px-4 pb-4">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => press(d)}
              className={`${btn} rounded-xl font-bold text-white transition-all hover:opacity-90`}
              style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}
            >
              {d}
            </button>
          ))}
        </div>
        <div className="flex gap-2 px-4 pb-4">
          <button type="button" onClick={onCancel} className={`flex-1 ${btn} rounded-xl font-semibold`} style={{ border: "1px solid #1e3356", color: "#6a8ab8" }}>Cancel</button>
          <button
            type="button"
            onClick={() => onConfirm(qty)}
            className={`flex-1 ${btn} rounded-xl font-bold text-white`}
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            Add ×{qty}
          </button>
        </div>
      </div>
    </div>
  );
}
