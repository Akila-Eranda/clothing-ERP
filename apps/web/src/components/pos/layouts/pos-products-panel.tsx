"use client";

import * as React from "react";
import { Loader2, Package, Scan, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { PosLayoutId } from "@/lib/pos-layouts";
import { getPosLayoutUi } from "@/lib/pos-layouts";
import { PosProductCard, type PosProductCardData } from "@/components/pos/shared/pos-product-card";
import { getCardBg, PosProductThumb } from "@/components/pos/shared/pos-product-thumb";

export type PosProductsPanelProduct = {
  variantId: string;
  productId?: string;
  productName: string;
  variantName: string;
  sku: string;
  costPrice: number;
  unitPrice: number;
  stock: number;
  category: string;
  color?: string;
  material?: string;
  imageUrl?: string;
};

export type PosProductsPanelCard = {
  rep: PosProductsPanelProduct;
  variants: PosProductsPanelProduct[];
  totalStock: number;
  minPrice: number;
  maxPrice: number;
};

export type PosProductsPanelRecentScan = {
  id: string;
  variantId: string;
  name: string;
  variant: string;
  price: number;
  qty: number;
  time: Date;
};

type Props = {
  posLayout: PosLayoutId;
  lightUi: boolean;
  loading: boolean;
  categories: string[];
  activeCategory: string;
  onCategoryChange: (cat: string) => void;
  productCards: PosProductsPanelCard[];
  focusedProductIdx: number;
  selectedProductName: string | null;
  addPopupProductName: string | null;
  allowNegativeStock: boolean;
  productPage: number;
  productTotalPages: number;
  productTotal: number;
  onLoadPage: (page: number) => void;
  onProductFocus: (idx: number) => void;
  onProductClick: (p: PosProductsPanelProduct) => void;
  popularItems: PosProductsPanelProduct[];
  recentScans: PosProductsPanelRecentScan[];
  products: PosProductsPanelProduct[];
  variantLabel: (p: PosProductsPanelProduct) => string;
  onPopularAdd: (p: PosProductsPanelProduct) => void;
  onRecentAdd: (p: PosProductsPanelProduct) => void;
  onClearRecent: () => void;
  onViewAll: () => void;
  searchFocusRef?: React.RefObject<HTMLInputElement | null>;
};

function CategoryBar({
  mode,
  categories,
  activeCategory,
  lightUi,
  onChange,
}: {
  mode: "horizontal" | "compact";
  categories: string[];
  activeCategory: string;
  lightUi: boolean;
  onChange: (cat: string) => void;
}) {
  return (
    <div
      className={
        mode === "compact"
          ? "flex items-center gap-1.5 px-3 py-2 border-b overflow-x-auto shrink-0 scrollbar-none flex-wrap"
          : "flex items-center gap-2 px-3 py-2 border-b overflow-x-auto shrink-0 scrollbar-none"
      }
      style={{ borderColor: "var(--pos-border)" }}
    >
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onChange(cat)}
          className={
            mode === "compact"
              ? "px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all"
              : "px-3 py-1.5 rounded-full text-sm font-semibold whitespace-nowrap shrink-0 transition-all"
          }
          style={{
            background: activeCategory === cat ? "var(--pos-accent-grad)" : lightUi ? "#334155" : "var(--pos-input)",
            color: "#ffffff",
          }}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

function CategoryRail({
  categories,
  activeCategory,
  lightUi,
  onChange,
}: {
  categories: string[];
  activeCategory: string;
  lightUi: boolean;
  onChange: (cat: string) => void;
}) {
  return (
    <div
      className="pos-category-rail shrink-0 overflow-y-auto border-r py-2 px-1.5 flex flex-col gap-1"
      style={{ width: 112, borderColor: "var(--pos-border)", background: "var(--pos-panel)" }}
    >
      {categories.map((cat) => {
        const active = activeCategory === cat;
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onChange(cat)}
            className="w-full rounded-xl px-2 py-2.5 text-left transition-all"
            style={{
              background: active ? "var(--pos-accent-grad)" : lightUi ? "#334155" : "var(--pos-input)",
              color: "#fff",
              boxShadow: active ? "0 0 0 1px rgba(var(--pos-accent-rgb),0.35)" : "none",
            }}
          >
            <span className="block text-[11px] font-bold leading-tight line-clamp-2">{cat}</span>
          </button>
        );
      })}
    </div>
  );
}

export function PosProductsPanel(props: Props) {
  const {
    posLayout,
    lightUi,
    loading,
    categories,
    activeCategory,
    onCategoryChange,
    productCards,
    focusedProductIdx,
    selectedProductName,
    addPopupProductName,
    allowNegativeStock,
    productPage,
    productTotalPages,
    productTotal,
    onLoadPage,
    onProductFocus,
    onProductClick,
    popularItems,
    recentScans,
    products,
    variantLabel,
    onPopularAdd,
    onRecentAdd,
    onClearRecent,
    onViewAll,
  } = props;

  const { categoryMode, cardVariant, retailUi } = getPosLayoutUi(posLayout);

  const grid = (
    <>
      <div
        className="grid"
        style={{
          gridTemplateColumns: "repeat(auto-fill,minmax(var(--pos-product-min,165px),1fr))",
          gap: "var(--pos-product-gap,8px)",
        }}
      >
        {productCards.map((card, pIdx) => {
          const p = card.rep;
          const data: PosProductCardData = {
            productId: p.productId,
            productName: p.productName,
            variantLabel: card.variants.length > 1 ? "Tap to choose variant" : variantLabel(p),
            imageUrl: p.imageUrl,
            color: p.color,
            priceLabel:
              card.variants.length > 1 && card.minPrice !== card.maxPrice
                ? `LKR ${formatNumber(card.minPrice)}–${formatNumber(card.maxPrice)}`
                : `LKR ${formatNumber(card.minPrice)}`,
            varStock: card.totalStock,
            multi: card.variants.length > 1,
            variantCount: card.variants.length,
            allowNegativeStock,
            lowStock: card.totalStock > 0 && card.totalStock <= 5,
            kbFocus: focusedProductIdx === pIdx,
            selected: selectedProductName === p.productName || addPopupProductName === p.productName,
          };
          return (
            <PosProductCard
              key={p.productId || p.productName}
              card={data}
              cardVariant={cardVariant}
              lightUi={lightUi}
              onClick={() => {
                onProductFocus(pIdx);
                onProductClick(p);
              }}
              onAdd={(e) => {
                e.stopPropagation();
                onProductClick(p);
              }}
            />
          );
        })}
      </div>
      {productTotalPages > 1 && (
        <div
          className="flex items-center justify-between gap-2 mt-3 pt-2 border-t"
          style={{ borderColor: "var(--pos-border)" }}
        >
          <button
            type="button"
            disabled={loading || productPage <= 1}
            onClick={() => onLoadPage(productPage - 1)}
            className="h-9 px-3 rounded-lg text-xs font-bold disabled:opacity-40"
            style={{ background: "var(--pos-input)", color: "var(--pos-text)" }}
          >
            ← Prev
          </button>
          <p className="text-[11px] tabular-nums" style={{ color: "var(--pos-muted)" }}>
            Page {productPage} / {productTotalPages}
            {productTotal > 0 ? ` · ${productTotal.toLocaleString()} items` : ""}
          </p>
          <button
            type="button"
            disabled={loading || productPage >= productTotalPages}
            onClick={() => onLoadPage(productPage + 1)}
            className="h-9 px-3 rounded-lg text-xs font-bold disabled:opacity-40"
            style={{ background: "var(--pos-input)", color: "var(--pos-text)" }}
          >
            Next →
          </button>
        </div>
      )}
    </>
  );

  const productArea = (
    <div className={cn("flex-1 overflow-y-auto p-3 min-w-0", retailUi && "pos-retail-product-grid")}>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--pos-accent)" }} />
        </div>
      ) : productCards.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48" style={{ color: "var(--pos-muted-2)" }}>
          <Package className="h-12 w-12 mb-2 opacity-30" />
          <p className="text-sm">No products found</p>
          <p className="text-xs mt-1 opacity-70">Scan barcode or search</p>
        </div>
      ) : (
        grid
      )}
    </div>
  );

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", retailUi && "pos-categories tabs_wrapper")}>
      {categoryMode === "vertical" ? (
        <div className={cn("flex flex-1 min-h-0 overflow-hidden", retailUi && "content-wrap")}>
          <CategoryRail
            categories={categories}
            activeCategory={activeCategory}
            lightUi={lightUi}
            onChange={onCategoryChange}
          />
          {productArea}
        </div>
      ) : (
        <>
          <CategoryBar
            mode={categoryMode === "compact" ? "compact" : "horizontal"}
            categories={categories}
            activeCategory={activeCategory}
            lightUi={lightUi}
            onChange={onCategoryChange}
          />
          {productArea}
        </>
      )}

      <div className="flex border-t shrink-0 pos-popular-strip" style={{ height: "180px", borderColor: "var(--pos-border)" }}>
        <div className="flex-1 flex flex-col min-w-0">
          <div
            className="flex items-center justify-between px-4 py-2 border-b shrink-0"
            style={{ borderColor: "var(--pos-border)" }}
          >
            <span className="text-base font-bold text-white">Popular Items</span>
            <button
              type="button"
              onClick={onViewAll}
              className="text-sm font-semibold"
              style={{ color: "var(--pos-accent)" }}
            >
              View All
            </button>
          </div>
          <div className="overflow-y-auto flex-1">
            {popularItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: "var(--pos-muted-2)" }}>
                <Package className="h-8 w-8 mb-2 opacity-30" />
                <p className="text-sm font-semibold">No popular items yet</p>
              </div>
            ) : (
              popularItems.map((p) => (
                <button
                  key={p.variantId}
                  type="button"
                  onClick={() => onPopularAdd(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 transition-colors text-left"
                >
                  <PosProductThumb
                    url={p.imageUrl}
                    name={p.productName}
                    light={lightUi}
                    className="h-10 w-10 rounded-lg shrink-0 overflow-hidden"
                    fallbackBg={getCardBg(p.color ?? p.material, lightUi)}
                    iconClassName="h-5 w-5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate" style={{ color: "var(--pos-product-title)" }}>
                      {p.productName}
                    </p>
                    <p className="text-xs truncate" style={{ color: "var(--pos-product-sub)" }}>
                      {variantLabel(p)}
                    </p>
                  </div>
                  <span className="text-sm font-bold shrink-0" style={{ color: "var(--pos-product-price)" }}>
                    LKR {formatNumber(p.unitPrice)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
        <div className="w-px shrink-0 self-stretch" style={{ background: "var(--pos-border)" }} aria-hidden />
        <div className="flex-1 flex flex-col min-w-0">
          <div
            className="flex items-center justify-between px-4 py-2 border-b shrink-0"
            style={{ borderColor: "var(--pos-border)" }}
          >
            <span className="text-base font-bold text-white">Recent Scan</span>
            {recentScans.length > 0 && (
              <button type="button" onClick={onClearRecent} className="p-1 rounded hover:bg-white/10">
                <Trash2 className="h-4 w-4" style={{ color: "var(--pos-muted)" }} />
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {recentScans.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full" style={{ color: "var(--pos-muted-2)" }}>
                <Scan className="h-10 w-10 mb-2 opacity-30" />
                <p className="text-sm font-semibold">No recent scans</p>
              </div>
            ) : (
              recentScans.map((s) => {
                const product = products.find((p) => p.variantId === s.variantId);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      if (product) onRecentAdd(product);
                      else toast.info("Not on this page — scan barcode again");
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 border-b hover:bg-white/5 transition-colors text-left"
                    style={{ borderColor: "var(--pos-border)" }}
                  >
                    <Scan className="h-4 w-4 shrink-0" style={{ color: "var(--pos-accent)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-bold truncate">{s.name}</p>
                      <p className="text-xs truncate" style={{ color: "var(--pos-muted)" }}>
                        {s.variant} · ×{s.qty}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold block" style={{ color: "var(--pos-price)" }}>
                        LKR {formatNumber(s.price)}
                      </span>
                      <span className="text-[10px]" style={{ color: "var(--pos-muted-2)" }}>
                        {s.time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
