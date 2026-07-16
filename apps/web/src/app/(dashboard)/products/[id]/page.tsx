"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Edit2, Package, Tag, BarChart2, Layers,
  TrendingUp, Clock, Box, Warehouse, ChevronRight,
  Image as ImageIcon, CheckCircle2, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { variantTableColumns } from "@/lib/shop-vertical";
interface InventoryRecord {
  id: string; quantity: number; reservedQty: number;
  branch: { id: string; name: string };
}
interface Variant {
  id: string; name: string; sku: string; barcode?: string | null;
  size?: string | null; color?: string | null; material?: string | null; style?: string | null;
  costPrice: number; sellingPrice: number; mrp: number;
  isActive: boolean; images: string[];
  inventory: InventoryRecord[];
}
interface ProductDetail {
  id: string; name: string; sku: string; barcode?: string | null; hsn?: string | null;
  status: string; description?: string | null; shortDesc?: string | null;
  costPrice: number; sellingPrice: number; mrp: number; taxRate: number;
  images: string[]; tags: string[]; hasVariants: boolean; trackInventory: boolean;
  isFeatured: boolean;
  createdAt: string; updatedAt: string;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  collections: { collection: { id: string; name: string } }[];
  variants: Variant[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
const COLOR_MAP: Record<string, string> = {
  black: "#111", white: "#fff", red: "#ef4444", blue: "#3b82f6",
  green: "#22c55e", yellow: "#eab308", grey: "#6b7280", gray: "#6b7280",
  navy: "#1e3a5f", pink: "#ec4899", orange: "#f97316", purple: "#a855f7",
  brown: "#92400e", khaki: "#c5a452", olive: "#6b7c41", cream: "#fef3c7",
};

function fmt(n: number) {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ColorDot({ color }: { color: string }) {
  const key = color.toLowerCase().replace(/\s/g, "");
  return (
    <span className="inline-block h-4 w-4 rounded-full border border-black/10 shrink-0"
      style={{ backgroundColor: COLOR_MAP[key] ?? "#e5e7eb" }} title={color} />
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b last:border-0 text-sm">
      <span className="text-muted-foreground shrink-0 w-32">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { profile, workspace } = useShopWorkspace();
  const variantCols = variantTableColumns(profile);

  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx,  setImgIdx]  = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ProductDetail>(`/products/${id}`);
      const data = res.data;
      // Normalize optional arrays so UI never crashes on partial payloads
      setProduct(
        data
          ? {
              ...data,
              images: data.images ?? [],
              tags: data.tags ?? [],
              collections: data.collections ?? [],
              variants: (data.variants ?? []).map((v) => ({
                ...v,
                inventory: v.inventory ?? [],
              })),
            }
          : null,
      );
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load product");
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  if (!product) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Package className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-muted-foreground">Product not found</p>
      <Button variant="outline" onClick={() => router.push("/products")}>Back to {workspace.productLabel}</Button>
    </div>
  );

  // ── Derived ────────────────────────────────────────────────────────────
  const totalStock    = product.variants.reduce((s, v) => s + (v.inventory ?? []).reduce((a, i) => a + i.quantity, 0), 0);
  const reservedStock = product.variants.reduce((s, v) => s + (v.inventory ?? []).reduce((a, i) => a + i.reservedQty, 0), 0);
  const availStock    = totalStock - reservedStock;
  const profit        = product.sellingPrice - product.costPrice;
  const margin        = product.sellingPrice > 0 ? (profit / product.sellingPrice) * 100 : 0;
  const finalPrice    = product.sellingPrice * (1 + product.taxRate / 100);

  // branch aggregation — skip rows missing branch (legacy / corrupt inventory)
  const branchMap = new Map<string, { name: string; qty: number; reserved: number }>();
  product.variants.forEach((v) =>
    (v.inventory ?? []).forEach((inv) => {
      if (!inv?.branch?.id) return;
      const e = branchMap.get(inv.branch.id);
      if (e) { e.qty += inv.quantity; e.reserved += inv.reservedQty; }
      else    branchMap.set(inv.branch.id, { name: inv.branch.name, qty: inv.quantity, reserved: inv.reservedQty });
    })
  );
  const branches = Array.from(branchMap.values());

  const images = product.images;

  return (
    <div className="h-full flex flex-col bg-muted/30">

      {/* ── Top bar ── */}
      <div className="bg-background border-b px-6 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => router.push("/products")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
          <ArrowLeft className="h-4 w-4" /> Back to {workspace.productLabel}
        </button>
        <div className="flex items-center gap-1.5 text-sm">
          <span className="text-muted-foreground cursor-pointer hover:text-foreground" onClick={() => router.push("/products")}>{workspace.productLabel}</span>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-semibold text-foreground truncate max-w-[220px]">{product.name}</span>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => router.push(`/products/${product.id}/edit`)}>
          <Edit2 className="h-3.5 w-3.5" /> Edit Product
        </Button>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ══ LEFT COLUMN ══ */}
        <div className="space-y-5">

          {/* Hero card */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm">
            <div className="flex gap-6 items-start flex-wrap">

              {/* Image */}
              <div className="flex flex-col gap-2 items-center shrink-0">
                <div className="h-36 w-36 rounded-xl border bg-muted/20 flex items-center justify-center overflow-hidden">
                  {images[imgIdx]
                    ? <img src={images[imgIdx]} alt={product.name} className="h-full w-full object-cover" />
                    : <ImageIcon className="h-10 w-10 text-muted-foreground/30" />}
                </div>
                {images.length > 1 && (
                  <div className="flex gap-1">
                    {images.slice(0, 4).map((img, i) => (
                      <button key={i} onClick={() => setImgIdx(i)}
                        className={`h-9 w-9 rounded-lg border overflow-hidden transition-all ${imgIdx === i ? "ring-2 ring-primary" : "opacity-50 hover:opacity-100"}`}>
                        <img src={img} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Meta */}
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{product.name}</h1>
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                    product.status === "ACTIVE"   ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" :
                    product.status === "DRAFT"    ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20" :
                                                    "bg-muted text-muted-foreground border border-border"
                  }`}>{product.status}</span>
                  {product.isFeatured && (
                    <span className="text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border border-yellow-500/20 px-2.5 py-0.5 rounded-full font-semibold">
                      ★ Featured
                    </span>
                  )}
                </div>

                <p className="text-sm font-mono text-muted-foreground">SKU: <strong className="text-foreground">{product.sku}</strong>
                  {product.barcode && <span className="ml-4">Barcode: <strong className="text-foreground">{product.barcode}</strong></span>}
                </p>

                <div className="flex flex-wrap gap-2">
                  {product.category && (
                    <span className="flex items-center gap-1.5 text-xs bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-lg px-2.5 py-1">
                      <Tag className="h-3 w-3" /> {product.category.name}
                    </span>
                  )}
                  {product.brand && (
                    <span className="flex items-center gap-1.5 text-xs bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 rounded-lg px-2.5 py-1">
                      <BarChart2 className="h-3 w-3" /> {product.brand.name}
                    </span>
                  )}
                  {profile.modules.collections && product.collections.map((c) => (
                    <span key={c.collection.id} className="flex items-center gap-1.5 text-xs bg-orange-500/10 border border-orange-500/20 text-orange-700 dark:text-orange-400 rounded-lg px-2.5 py-1">
                      <Layers className="h-3 w-3" /> {c.collection.name}
                    </span>
                  ))}
                </div>

                {product.description && (
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">{product.description}</p>
                )}

                {product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {product.tags.map((t) => (
                      <span key={t} className="bg-muted text-muted-foreground px-2 py-0.5 rounded-md text-[11px]">{t}</span>
                    ))}
                  </div>
                )}

                <div className="flex gap-5 pt-2 border-t text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Created: {new Date(product.createdAt).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Updated: {new Date(product.updatedAt).toLocaleDateString()}</span>
                  {product.hsn && <span>HSN: <strong className="text-foreground">{product.hsn}</strong></span>}
                </div>
              </div>
            </div>
          </div>

          {/* Quick stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Total Stock",    value: `${totalStock} pcs`,     icon: Package,      color: "text-blue-600 dark:text-blue-400",       iconBg: "bg-blue-500/10" },
              { label: "Available",      value: `${availStock} pcs`,     icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10" },
              { label: "Reserved",       value: `${reservedStock} pcs`,  icon: Box,          color: "text-violet-600 dark:text-violet-400",   iconBg: "bg-violet-500/10" },
              { label: "Gross Margin",   value: `${margin.toFixed(1)}%`, icon: TrendingUp,   color: "text-emerald-600 dark:text-emerald-400", iconBg: "bg-emerald-500/10" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-background p-4 flex items-center gap-3 shadow-sm">
                <div className={`p-2 rounded-lg ${s.iconBg}`}>
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">{s.label}</p>
                  <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Variants table */}
          <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-base">Variants
                <span className="ml-2 text-xs font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{product.variants.length}</span>
              </h2>
            </div>
            {product.variants.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No variants — product has single SKU</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 border-b">
                    <tr>
                      {["Variant", "SKU", "Barcode", ...variantCols.map((c) => c.label), "Cost (LKR)", "Selling (LKR)", "MRP (LKR)", "Margin", "Stock", "Status"].map((h) => (
                        <th key={h} className="text-left px-3 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {product.variants.map((v) => {
                      const vStock  = (v.inventory ?? []).reduce((a, i) => a + i.quantity, 0);
                      const vProfit = v.sellingPrice - v.costPrice;
                      const vMargin = v.sellingPrice > 0 ? (vProfit / v.sellingPrice * 100).toFixed(1) : "0.0";
                      return (
                        <tr key={v.id} className={`hover:bg-muted/10 transition-colors ${!v.isActive ? "opacity-50" : ""}`}>
                          <td className="px-3 py-3 font-medium whitespace-nowrap">{v.name}</td>
                          <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{v.sku}</td>
                          <td className="px-3 py-3 font-mono text-xs text-muted-foreground">{v.barcode ?? "—"}</td>
                          {variantCols.map((col) => {
                            const val = v[col.field as keyof Variant] as string | null | undefined;
                            return (
                              <td key={col.field} className="px-3 py-3">
                                {val ? (
                                  col.isColor
                                    ? <div className="flex items-center gap-1.5"><ColorDot color={val} /><span className="text-xs">{val}</span></div>
                                    : <span className="bg-muted px-2 py-0.5 rounded text-xs font-semibold">{val}</span>
                                ) : "—"}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-xs">{fmt(v.costPrice)}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-blue-600 dark:text-blue-400">{fmt(v.sellingPrice)}</td>
                          <td className="px-3 py-3 text-xs text-muted-foreground">{fmt(v.mrp)}</td>
                          <td className="px-3 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">{vMargin}%</td>
                          <td className="px-3 py-3">
                            <span className={`font-bold text-sm ${vStock > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"}`}>{vStock}</span>
                          </td>
                          <td className="px-3 py-3">
                            {v.isActive
                              ? <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium"><CheckCircle2 className="h-3.5 w-3.5" />Active</span>
                              : <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3.5 w-3.5" />Inactive</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Inventory by branch */}
          <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <Warehouse className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold text-base">Inventory by Branch</h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b">
                <tr>
                  {["Branch", "Total Stock", "Reserved", "Available"].map((h) => (
                    <th key={h} className={`px-6 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide ${h !== "Branch" ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {branches.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-sm text-muted-foreground">No inventory records</td></tr>
                ) : (
                  <>
                    {branches.map((b) => (
                      <tr key={b.name} className="hover:bg-muted/10">
                        <td className="px-6 py-3 font-medium">{b.name}</td>
                        <td className="px-6 py-3 text-right font-semibold">{b.qty}</td>
                        <td className="px-6 py-3 text-right text-violet-600 dark:text-violet-400">{b.reserved}</td>
                        <td className="px-6 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{b.qty - b.reserved}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 bg-muted/20 font-bold text-sm">
                      <td className="px-6 py-3">Total</td>
                      <td className="px-6 py-3 text-right">{totalStock}</td>
                      <td className="px-6 py-3 text-right text-violet-600 dark:text-violet-400">{reservedStock}</td>
                      <td className="px-6 py-3 text-right text-emerald-600 dark:text-emerald-400">{availStock}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

        </div>
        {/* ══ END LEFT ══ */}

        {/* ══ RIGHT SIDEBAR ══ */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Pricing */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-0">
            <h3 className="font-semibold text-sm border-b pb-3 mb-1">Pricing <span className="text-xs font-normal text-muted-foreground">(LKR)</span></h3>
            <InfoRow label="Cost Price"    value={`LKR ${fmt(product.costPrice)}`} />
            <InfoRow label="Selling Price" value={<span className="text-blue-600 dark:text-blue-400 font-bold">LKR {fmt(product.sellingPrice)}</span>} />
            <InfoRow label="MRP"           value={`LKR ${fmt(product.mrp)}`} />
            {product.taxRate > 0 && (
              <InfoRow label={`Tax (${product.taxRate}%)`} value={`LKR ${fmt(product.sellingPrice * product.taxRate / 100)}`} />
            )}
            <div className="flex justify-between items-center pt-2 text-sm">
              <span className="font-semibold">Final Price</span>
              <span className="text-lg font-bold text-primary">LKR {fmt(finalPrice)}</span>
            </div>
            <div className="mt-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 p-3 flex justify-between">
              <div>
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Profit</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">LKR {fmt(profit)}</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-emerald-700 dark:text-emerald-400">Margin</p>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{margin.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-0">
            <h3 className="font-semibold text-sm border-b pb-3 mb-1">Product Details</h3>
            <InfoRow label="SKU"       value={<span className="font-mono">{product.sku}</span>} />
            {product.barcode && <InfoRow label="Barcode" value={<span className="font-mono">{product.barcode}</span>} />}
            {product.hsn    && <InfoRow label="HSN/SAC" value={product.hsn} />}
            <InfoRow label="Category"  value={product.category?.name ?? "—"} />
            <InfoRow label="Brand"     value={product.brand?.name ?? "—"} />
            <InfoRow label="Variants"  value={`${product.variants.length} variants`} />
          </div>

          {/* Status */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-sm border-b pb-2">Status & Flags</h3>
            {[
              { label: "Status",          value: product.status,       ok: product.status === "ACTIVE" },
              { label: "Track Inventory", value: product.trackInventory ? "Enabled" : "Disabled", ok: product.trackInventory },
              { label: "Has Variants",    value: product.hasVariants   ? "Yes" : "No",            ok: product.hasVariants },
              { label: "Featured",        value: product.isFeatured    ? "Yes" : "No",            ok: product.isFeatured },
            ].map(({ label, value, ok }) => (
              <div key={label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className={`font-semibold ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-2">
            <Button className="w-full gap-2" onClick={() => router.push(`/products/${product.id}/edit`)}>
              <Edit2 className="h-4 w-4" /> Edit Product
            </Button>
            <Button variant="outline" className="w-full" onClick={() => router.push("/products")}>
              Back to {workspace.productLabel}
            </Button>
          </div>

        </div>
        {/* ══ END SIDEBAR ══ */}

      </div>
      </div>
    </div>
  );
}
