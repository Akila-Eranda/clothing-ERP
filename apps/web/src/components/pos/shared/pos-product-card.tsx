"use client";

import { Plus } from "lucide-react";
import type { PosLayoutCardVariant } from "@/lib/pos-layouts";
import { getCardBg, posImageSrc, PosProductThumb } from "@/components/pos/shared/pos-product-thumb";

export type PosProductCardData = {
  productId?: string;
  productName: string;
  variantName?: string;
  variantLabel: string;
  imageUrl?: string;
  color?: string;
  priceLabel: string;
  varStock: number;
  multi: boolean;
  variantCount: number;
  allowNegativeStock: boolean;
  lowStock: boolean;
  kbFocus: boolean;
  selected: boolean;
};

type Props = {
  card: PosProductCardData;
  cardVariant: PosLayoutCardVariant;
  lightUi: boolean;
  onClick: () => void;
  onAdd: (e: React.MouseEvent) => void;
};

export function PosProductCard({ card, cardVariant, lightUi, onClick, onAdd }: Props) {
  const thumbBg = getCardBg(card.color, lightUi);
  const isImageTop = cardVariant === "image-top" || cardVariant === "square";
  const square = cardVariant === "square";
  const borderRadius = square ? "0.375rem" : "0.75rem";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      className="pos-product-card overflow-hidden cursor-pointer group relative border transition-colors"
      style={{
        background: "var(--pos-product-card)",
        borderColor: card.kbFocus || card.selected ? "var(--pos-accent)" : "var(--pos-product-border)",
        boxShadow: card.kbFocus ? "0 0 0 2px rgba(var(--pos-accent-rgb),0.45)" : "none",
        borderRadius,
      }}
    >
      <div
        className="relative"
        style={{
          aspectRatio: "4/3",
          background: posImageSrc(card.imageUrl) ? "var(--pos-product-card)" : thumbBg,
          borderRadius: isImageTop ? `${borderRadius} ${borderRadius} 0 0` : undefined,
        }}
      >
        <PosProductThumb
          url={card.imageUrl}
          name={card.productName}
          light={lightUi}
          className="absolute inset-0 w-full h-full opacity-90"
          fallbackBg={thumbBg}
          iconClassName="h-10 w-10"
        />
        <div
          className="absolute top-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white"
          data-pos-on-accent=""
          style={{
            background: card.varStock === 0 ? "#dc2626" : card.varStock <= 5 ? "var(--pos-warn-pill)" : "#16a34a",
            color: "#fff",
          }}
        >
          {card.varStock}
        </div>
        {card.multi && (
          <div
            className="absolute top-1.5 right-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: "rgba(var(--pos-accent-rgb),0.9)", color: "#fff" }}
          >
            {card.variantCount} variants
          </div>
        )}
        {card.varStock === 0 && (
          <div
            className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold"
            style={{
              background: card.allowNegativeStock ? "var(--pos-warn-pill)" : "rgba(220,38,38,0.85)",
              color: "#fff",
            }}
          >
            {card.allowNegativeStock ? "Stock 0 — sell OK" : "Out of Stock"}
          </div>
        )}
        {card.lowStock && card.varStock > 0 && (
          <div
            className="absolute bottom-1.5 left-1.5 rounded px-1.5 py-0.5 text-[9px] font-bold"
            style={{ background: "var(--pos-warn-pill)", color: "#fff" }}
          >
            Low Stock
          </div>
        )}
        <button
          type="button"
          data-pos-accent=""
          onClick={onAdd}
          className="absolute bottom-1.5 right-1.5 h-6 w-6 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: "var(--pos-accent)", color: "#fff" }}
        >
          <Plus className="h-3.5 w-3.5 text-white" />
        </button>
      </div>
      <div
        style={{ padding: "var(--pos-product-pad,8px)" }}
        className={cardVariant === "square" ? "text-center" : undefined}
      >
        <p
          className="font-semibold leading-tight line-clamp-1"
          style={{ color: "var(--pos-product-title)", fontSize: "var(--pos-product-title-size,14px)" }}
        >
          {card.productName}
        </p>
        <p
          className="mt-0.5 line-clamp-1"
          style={{ color: "var(--pos-product-sub)", fontSize: "var(--pos-product-sub-size,12px)" }}
        >
          {card.multi ? "Tap to choose variant" : card.variantLabel}
        </p>
        <p
          className="font-bold mt-0.5"
          style={{ color: "var(--pos-product-price)", fontSize: "var(--pos-product-price-size,16px)" }}
        >
          {card.priceLabel}
        </p>
      </div>
    </div>
  );
}
