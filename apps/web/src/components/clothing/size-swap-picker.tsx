"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ShopType } from "@/lib/shop-profiles";
import { useShopProfile } from "@/lib/use-shop-profile";

export type SizeSwapOption = {
  id: string;
  size?: string | null;
  color?: string | null;
  sku?: string;
  sellingPrice: number;
  productName?: string;
  stock?: number;
  variantName?: string;
};

type ProductPayload = {
  id: string;
  name: string;
  variants?: {
    id: string;
    name?: string;
    sku?: string;
    size?: string | null;
    color?: string | null;
    sellingPrice?: number;
    price?: number;
    inventory?: { quantity?: number; reservedQty?: number }[];
  }[];
};

type Props = {
  /** Product that owns the returned variant */
  productId?: string | null;
  /** Variant being returned — excluded from the chip grid */
  sourceVariantId: string;
  /** Prefer same color siblings; falls back to source variant color after load */
  color?: string | null;
  /** Optional preloaded siblings (e.g. POS catalog) — skips fetch when provided */
  options?: SizeSwapOption[];
  onSelect: (option: SizeSwapOption) => void;
  selectedVariantId?: string | null;
  className?: string;
  /** POS dark surface styling */
  appearance?: "default" | "pos";
};

function stockOf(v: NonNullable<ProductPayload["variants"]>[number]) {
  const rows = v.inventory ?? [];
  if (!rows.length) return undefined;
  return rows.reduce((s, r) => s + Math.max(0, (r.quantity ?? 0) - (r.reservedQty ?? 0)), 0);
}

/**
 * Clothing-only size exchange chips: same product + same color, different sizes.
 * Renders nothing for non-clothing shops.
 */
export function SizeSwapPicker({
  productId,
  sourceVariantId,
  color,
  options: preloaded,
  onSelect,
  selectedVariantId,
  className,
  appearance = "default",
}: Props) {
  const profile = useShopProfile();
  const isClothing = profile.type === ShopType.CLOTHING;
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState<SizeSwapOption[]>([]);
  const [resolvedColor, setResolvedColor] = useState(color ?? null);

  const load = useCallback(async () => {
    if (!isClothing || !productId || preloaded) return;
    setLoading(true);
    try {
      const res = await api.get<ProductPayload>(`/products/${productId}`);
      const product = res.data;
      const source = (product.variants ?? []).find((v) => v.id === sourceVariantId);
      const matchColor = (color ?? source?.color ?? "").trim().toLowerCase();
      setResolvedColor(color ?? source?.color ?? null);
      const mapped: SizeSwapOption[] = (product.variants ?? [])
        .filter((v) => v.id !== sourceVariantId)
        .filter((v) => {
          if (!matchColor) return !!v.size;
          return (v.color ?? "").trim().toLowerCase() === matchColor && !!v.size;
        })
        .map((v) => ({
          id: v.id,
          size: v.size,
          color: v.color,
          sku: v.sku,
          sellingPrice: v.sellingPrice ?? v.price ?? 0,
          productName: product.name,
          stock: stockOf(v),
          variantName: v.name ?? [v.size, v.color].filter(Boolean).join(" / "),
        }));
      setFetched(mapped);
    } catch {
      toast.error("Failed to load size options");
      setFetched([]);
    } finally {
      setLoading(false);
    }
  }, [isClothing, productId, sourceVariantId, color, preloaded]);

  useEffect(() => {
    void load();
  }, [load]);

  const options = useMemo(() => {
    if (preloaded) {
      const matchColor = (color ?? "").trim().toLowerCase();
      return preloaded
        .filter((o) => o.id !== sourceVariantId)
        .filter((o) => {
          if (!matchColor) return !!o.size;
          return (o.color ?? "").trim().toLowerCase() === matchColor && !!o.size;
        });
    }
    return fetched;
  }, [preloaded, fetched, sourceVariantId, color]);

  if (!isClothing) return null;
  if (!productId && !preloaded) return null;

  const pos = appearance === "pos";

  return (
    <div className={cn("space-y-1.5", className)}>
      <p
        className={cn(
          "text-[10px] font-bold uppercase tracking-wide",
          pos ? undefined : "text-muted-foreground",
        )}
        style={pos ? { color: "var(--pos-muted)" } : undefined}
      >
        Exchange Size{resolvedColor ? ` · ${resolvedColor}` : ""}
      </p>
      {loading ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground py-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sizes…
        </div>
      ) : options.length === 0 ? (
        <p
          className={cn("text-[11px]", pos ? undefined : "text-muted-foreground")}
          style={pos ? { color: "var(--pos-muted-2)" } : undefined}
        >
          No sibling sizes found for this color.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {options.map((o) => {
            const active = selectedVariantId === o.id;
            const out = typeof o.stock === "number" && o.stock <= 0;
            return (
              <button
                key={o.id}
                type="button"
                disabled={out}
                onClick={() => onSelect(o)}
                title={o.sku ? `${o.sku}${typeof o.stock === "number" ? ` · ${o.stock} left` : ""}` : undefined}
                className={cn(
                  "min-w-[2.5rem] rounded-lg border px-2.5 py-1.5 text-center transition-colors disabled:opacity-40",
                  !pos && (active
                    ? "border-violet-500 bg-violet-500/15 text-violet-800"
                    : "border-border bg-card hover:border-violet-400"),
                )}
                style={
                  pos
                    ? {
                        background: active ? "rgba(139,92,246,0.2)" : "var(--pos-input)",
                        borderColor: active ? "#8b5cf6" : "var(--pos-border)",
                        color: "var(--pos-text)",
                      }
                    : undefined
                }
              >
                <span className={cn("text-xs font-bold block", pos && "text-white")}>{o.size}</span>
                {typeof o.stock === "number" ? (
                  <span
                    className={cn("text-[9px] tabular-nums", !pos && (o.stock > 0 ? "text-emerald-600" : "text-red-500"))}
                    style={pos ? { color: o.stock > 0 ? "var(--pos-success-soft)" : "#f87171" } : undefined}
                  >
                    {o.stock}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
