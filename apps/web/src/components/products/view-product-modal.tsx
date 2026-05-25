"use client";

import { X, Package, Tag, BarChart3, Calendar, Layers, ExternalLink, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { type Product } from "./add-product-modal";

const STATUS_COLOR: Record<string, string> = {
  ACTIVE:        "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  DRAFT:         "bg-amber-500/10   text-amber-600   border-amber-500/30",
  INACTIVE:      "bg-muted          text-muted-foreground border-border",
  OUT_OF_STOCK:  "bg-red-500/10     text-red-600     border-red-500/30",
};

interface Props {
  product: Product | null;
  onClose: () => void;
  onEdit: (p: Product) => void;
}

export function ViewProductModal({ product, onClose, onEdit }: Props) {
  if (!product) return null;

  const margin = product.sellingPrice > 0
    ? ((product.sellingPrice - product.costPrice) / product.sellingPrice * 100).toFixed(1)
    : "0.0";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold truncate">{product.name}</h2>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_COLOR[product.status] ?? STATUS_COLOR.INACTIVE}`}>
                {product.status.replace("_", " ")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{product.sku}</p>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => { onClose(); onEdit(product); }}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Pricing */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: "Selling Price", value: `LKR ${product.sellingPrice.toFixed(2)}`, highlight: true },
              { label: "Cost Price",    value: `LKR ${product.costPrice.toFixed(2)}` },
              { label: "MRP",           value: `LKR ${product.mrp.toFixed(2)}` },
              { label: "Margin",        value: `${margin}%`, color: "text-emerald-500" },
            ].map((p) => (
              <div key={p.label} className={`rounded-xl border p-3 ${p.highlight ? "bg-primary/5 border-primary/20" : "bg-card"}`}>
                <p className="text-[10px] text-muted-foreground">{p.label}</p>
                <p className={`text-lg font-bold mt-0.5 ${p.color ?? ""}`}>{p.value}</p>
              </div>
            ))}
          </div>

          {/* Details grid */}
          <div className="rounded-xl border bg-card p-4 space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Details</h4>
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
              {[
                { label: "Category",    value: product.category?.name ?? "—" },
                { label: "Brand",       value: product.brand?.name    ?? "—" },
                { label: "Barcode",     value: product.barcode ?? "—" },
                { label: "HSN / SAC",   value: product.hsn     ?? "—" },
                { label: "Tax Rate",    value: `${product.taxRate}%` },
                { label: "Variants",    value: `${product._count.variants} variant${product._count.variants !== 1 ? "s" : ""}` },
                { label: "Has Variants",   value: product.hasVariants   ? "Yes" : "No" },
                { label: "Track Inventory",value: product.trackInventory ? "Yes" : "No" },
              ].map((r) => (
                <div key={r.label} className="flex justify-between gap-2">
                  <span className="text-muted-foreground shrink-0">{r.label}</span>
                  <span className="font-medium text-right">{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Description */}
          {product.description && (
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Description</h4>
              <p className="text-sm text-muted-foreground leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Tags */}
          {product.tags.length > 0 && (
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5" /> Tags
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {product.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* SEO */}
          {(product.seoTitle || product.seoDescription) && (
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <ExternalLink className="h-3.5 w-3.5" /> SEO
              </h4>
              {product.seoTitle && <p className="text-sm font-medium">{product.seoTitle}</p>}
              {product.seoDescription && <p className="text-xs text-muted-foreground">{product.seoDescription}</p>}
            </div>
          )}

          {/* Timestamps */}
          <div className="flex items-center gap-6 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              Created {new Date(product.createdAt).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <span className="flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Updated {new Date(product.updatedAt).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {product._count.variants} variants
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
