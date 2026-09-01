"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Minus, Plus, ShoppingCart, X } from "lucide-react";
import type { CartItem } from "@/types";
import type { PosLayoutCartStyle } from "@/lib/pos-layouts";
import { formatNumber } from "@/lib/utils";
import { calcPosLineDiscount, calcPosLineNet } from "@/lib/pos-totals";
import {
  cartQtyToGrams,
  formatPosWeightQty,
  gramsToCartQty,
  isPosWeightedProduct,
  parseGramsInput,
} from "@/lib/pos-weight";

type Props = {
  cartStyle: PosLayoutCartStyle;
  items: CartItem[];
  selectedCartIdx: number;
  editingCartQtyIdx: number | null;
  editingCartQtyRaw: string;
  onSelectLine: (idx: number) => void;
  onUpdateQty: (variantId: string, qty: number) => void;
  onRemove: (variantId: string, idx: number) => void;
  onEditQtyStart: (idx: number, raw: string) => void;
  onEditQtyRawChange: (raw: string) => void;
  onEditQtyEnd: () => void;
};

function QtyControls({
  item,
  idx,
  editing,
  editingCartQtyRaw,
  onUpdateQty,
  onEditQtyStart,
  onEditQtyRawChange,
  onEditQtyEnd,
  compact,
}: {
  item: CartItem;
  idx: number;
  editing: boolean;
  editingCartQtyRaw: string;
  onUpdateQty: (variantId: string, qty: number) => void;
  onEditQtyStart: (idx: number, raw: string) => void;
  onEditQtyRawChange: (raw: string) => void;
  onEditQtyEnd: () => void;
  compact?: boolean;
}) {
  const weighted = isPosWeightedProduct(item);
  const qtyStep = weighted ? gramsToCartQty(10, item) : 1;
  const btn = compact ? "h-5 w-5" : "h-6 w-6";

  if (editing) {
    return (
      <input
        autoFocus
        value={editingCartQtyRaw}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) =>
          onEditQtyRawChange(e.target.value.replace(weighted ? /[^\d]/g : /[^\d.]/g, ""))
        }
        onBlur={() => {
          if (weighted) {
            const g = parseGramsInput(editingCartQtyRaw);
            if (g >= 1) onUpdateQty(item.variantId, gramsToCartQty(g, item));
          } else {
            const n = parseFloat(editingCartQtyRaw);
            if (!Number.isNaN(n) && n > 0) onUpdateQty(item.variantId, n);
          }
          onEditQtyEnd();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            onEditQtyEnd();
          }
        }}
        className="w-10 h-6 rounded text-center text-xs font-bold text-white outline-none"
        style={{ background: "var(--pos-panel)", border: "1px solid var(--pos-accent)" }}
        title={weighted ? "Grams" : "Qty"}
      />
    );
  }

  return (
    <div className="flex items-center gap-0.5 shrink-0 justify-center">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUpdateQty(item.variantId, item.quantity - qtyStep);
        }}
        className={`${btn} rounded flex items-center justify-center`}
        style={{ background: "var(--pos-input)" }}
      >
        <Minus className="h-3 w-3 text-white" />
      </button>
      <span
        title={weighted ? "Double-click to edit grams" : "Double-click to edit"}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onEditQtyStart(
            idx,
            weighted ? String(cartQtyToGrams(item.quantity, item)) : String(item.quantity),
          );
        }}
        className="text-white text-xs font-bold min-w-[2rem] px-0.5 text-center select-none tabular-nums"
      >
        {weighted ? formatPosWeightQty(item.quantity, item) : item.quantity}
      </span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUpdateQty(item.variantId, item.quantity + qtyStep);
        }}
        className={`${btn} rounded flex items-center justify-center`}
        style={{ background: "var(--pos-input)" }}
      >
        <Plus className="h-3 w-3 text-white" />
      </button>
    </div>
  );
}

export function PosCartItemsList({
  cartStyle,
  items,
  selectedCartIdx,
  editingCartQtyIdx,
  editingCartQtyRaw,
  onSelectLine,
  onUpdateQty,
  onRemove,
  onEditQtyStart,
  onEditQtyRawChange,
  onEditQtyEnd,
}: Props) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-40" style={{ color: "var(--pos-muted-2)" }}>
        <ShoppingCart className="h-12 w-12 mb-2 opacity-20" />
        <p className="text-sm">Cart is empty</p>
        <p className="text-xs mt-1 opacity-70">Scan barcode to begin</p>
      </div>
    );
  }

  if (cartStyle === "table") {
    return (
      <div className="px-2 py-1 overflow-x-auto">
        <table className="pos-cart-table w-full text-left border-collapse">
          <thead>
            <tr className="text-[10px] uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>
              <th className="py-1.5 px-1 font-bold">Product</th>
              <th className="py-1.5 px-1 font-bold text-center w-24">QTY</th>
              <th className="py-1.5 px-1 font-bold text-right w-20">Price</th>
              <th className="w-6" aria-hidden />
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {items.map((item, idx) => {
                const lineDisc = calcPosLineDiscount(item);
                const afterDisc = calcPosLineNet(item);
                const lineTax = afterDisc * ((item.taxRate || 0) / 100);
                const lineTotal = afterDisc + lineTax;
                const lineGross = item.unitPrice * item.quantity;
                const selected = selectedCartIdx === idx;
                return (
                  <motion.tr
                    key={item.variantId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => onSelectLine(idx)}
                    className="cursor-pointer border-b transition-colors"
                    style={{
                      background: selected ? "rgba(var(--pos-accent-rgb),0.12)" : "transparent",
                      borderColor: "var(--pos-border)",
                    }}
                  >
                    <td className="py-2 px-1 align-middle">
                      <p className="text-xs font-semibold text-white line-clamp-2 leading-tight">{item.productName}</p>
                      {isPosWeightedProduct(item) && (
                        <p className="text-[10px] truncate" style={{ color: "var(--pos-muted)" }}>
                          Weight · edit grams
                        </p>
                      )}
                      {lineDisc > 0.001 && (
                        <p className="text-[10px] font-semibold" style={{ color: "var(--pos-success-soft)" }}>
                          Disc −LKR {formatNumber(lineDisc)}
                          {item.discountType === "percentage" && item.discountAmount > 0
                            ? ` (${item.discountAmount}%)`
                            : ""}
                        </p>
                      )}
                      {lineDisc > 0.001 && (
                        <p className="text-[10px] line-through tabular-nums" style={{ color: "var(--pos-muted)" }}>
                          LKR {formatNumber(lineGross)}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-1 align-middle">
                      <QtyControls
                        item={item}
                        idx={idx}
                        editing={editingCartQtyIdx === idx}
                        editingCartQtyRaw={editingCartQtyRaw}
                        onUpdateQty={onUpdateQty}
                        onEditQtyStart={onEditQtyStart}
                        onEditQtyRawChange={onEditQtyRawChange}
                        onEditQtyEnd={onEditQtyEnd}
                        compact
                      />
                    </td>
                    <td className="py-2 px-1 align-middle text-right">
                      <p className="text-xs font-bold text-white tabular-nums">LKR {formatNumber(lineTotal)}</p>
                    </td>
                    <td className="py-2 px-0 align-middle">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemove(item.variantId, idx);
                        }}
                        className="h-6 w-6 rounded flex items-center justify-center opacity-70 hover:opacity-100"
                        title="Remove"
                      >
                        <X className="h-3 w-3" style={{ color: "#ef4444" }} />
                      </button>
                    </td>
                  </motion.tr>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="px-2 py-1.5 space-y-1">
      <AnimatePresence>
        {items.map((item, idx) => {
          const lineDisc = calcPosLineDiscount(item);
          const afterDisc = calcPosLineNet(item);
          const lineTax = afterDisc * ((item.taxRate || 0) / 100);
          const lineTotal = afterDisc + lineTax;
          const lineGross = item.unitPrice * item.quantity;
          const weighted = isPosWeightedProduct(item);
          return (
            <motion.div
              key={item.variantId}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              onClick={() => onSelectLine(idx)}
              className="flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all group"
              style={{
                background: selectedCartIdx === idx ? "rgba(var(--pos-accent-rgb),0.15)" : "var(--pos-card)",
                border: `1px solid ${selectedCartIdx === idx ? "var(--pos-accent)" : "var(--pos-border)"}`,
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{item.productName}</p>
                {weighted && (
                  <p className="text-[10px] truncate" style={{ color: "var(--pos-muted)" }}>
                    Weight · edit grams
                  </p>
                )}
                {lineDisc > 0.001 && (
                  <p className="text-[10px] font-semibold truncate" style={{ color: "var(--pos-success-soft)" }}>
                    Disc −LKR {formatNumber(lineDisc)}
                    {item.discountType === "percentage" && item.discountAmount > 0
                      ? ` (${item.discountAmount}%)`
                      : ""}
                  </p>
                )}
              </div>
              <QtyControls
                item={item}
                idx={idx}
                editing={editingCartQtyIdx === idx}
                editingCartQtyRaw={editingCartQtyRaw}
                onUpdateQty={onUpdateQty}
                onEditQtyStart={onEditQtyStart}
                onEditQtyRawChange={onEditQtyRawChange}
                onEditQtyEnd={onEditQtyEnd}
              />
              <div className="shrink-0 min-w-[4.5rem] text-right">
                {lineDisc > 0.001 && (
                  <p
                    className="text-[10px] tabular-nums line-through leading-none mb-0.5"
                    style={{ color: "var(--pos-muted)" }}
                  >
                    LKR {formatNumber(lineGross)}
                  </p>
                )}
                <p className="text-sm font-bold text-white tabular-nums leading-tight">
                  LKR {formatNumber(lineTotal)}
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(item.variantId, idx);
                }}
                className={`h-6 w-6 rounded flex items-center justify-center transition-opacity shrink-0 ${item.isCustom ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
                title="Remove"
              >
                <X className="h-3 w-3" style={{ color: "#ef4444" }} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
