"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Edit2, Package, Tag, BarChart2, Layers,
  TrendingUp, AlertTriangle, CheckCircle, Clock,
  Box, Warehouse, ChevronRight, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AddProductModal } from "@/components/products/add-product-modal";

// ── Types ──────────────────────────────────────────────────────────────────
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
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: "bg-emerald-500/10 text-emerald-600 border border-emerald-200",
  DRAFT:  "bg-amber-500/10 text-amber-600 border border-amber-200",
  ARCHIVED: "bg-slate-100 text-slate-500 border border-slate-200",
};

function fmt(n: number) {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ColorDot({ color }: { color: string }) {
  const bg = color.toLowerCase().replace(/\s/g, "");
  const colorMap: Record<string, string> = {
    black: "#111", white: "#fff", red: "#ef4444", blue: "#3b82f6",
    green: "#22c55e", yellow: "#eab308", grey: "#6b7280", gray: "#6b7280",
    navy: "#1e3a5f", pink: "#ec4899", orange: "#f97316", purple: "#a855f7",
    brown: "#92400e", khaki: "#c5a452", olive: "#6b7c41",
  };
  const style = colorMap[bg] ? { backgroundColor: colorMap[bg] } : { backgroundColor: "#e5e7eb" };
  return (
    <span className="inline-block h-4 w-4 rounded-full border border-black/10 shrink-0" style={style} title={color} />
  );
}

// ── Tabs ───────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Variants", "Inventory", "Pricing & Tax"] as const;
type Tab = typeof TABS[number];

// ── Main Page ──────────────────────────────────────────────────────────────
export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [product, setProduct]   = useState<ProductDetail | null>(null);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState<Tab>("Overview");
  const [editOpen, setEditOpen] = useState(false);
  const [imgIdx, setImgIdx]     = useState(0);

  const load = useCallback(async () => {
    try {
      const res = await api.get<ProductDetail>(`/products/${id}`);
      setProduct(res.data);
    } catch { toast.error("Failed to load product"); }
    finally { setLoading(false); }
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
      <Button variant="outline" onClick={() => router.push("/products")}>Back to Products</Button>
    </div>
  );

  // ── Derived stats ──────────────────────────────────────────────────────
  const totalStock    = product.variants.reduce((s, v) => s + v.inventory.reduce((a, i) => a + i.quantity, 0), 0);
  const reservedStock = product.variants.reduce((s, v) => s + v.inventory.reduce((a, i) => a + i.reservedQty, 0), 0);
  const availStock    = totalStock - reservedStock;
  const profit        = product.sellingPrice - product.costPrice;
  const margin        = product.sellingPrice > 0 ? (profit / product.sellingPrice) * 100 : 0;
  const finalPrice    = product.sellingPrice * (1 + product.taxRate / 100);

  // ── Branch stock aggregation ───────────────────────────────────────────
  const branchMap = new Map<string, { name: string; qty: number; reserved: number }>();
  product.variants.forEach((v) => {
    v.inventory.forEach((inv) => {
      const existing = branchMap.get(inv.branch.id);
      if (existing) {
        existing.qty      += inv.quantity;
        existing.reserved += inv.reservedQty;
      } else {
        branchMap.set(inv.branch.id, { name: inv.branch.name, qty: inv.quantity, reserved: inv.reservedQty });
      }
    });
  });
  const branches = Array.from(branchMap.values());

  // ── Variants grouped by size ───────────────────────────────────────────
  const sizeGroups = new Map<string, { variants: Variant[]; stock: number }>();
  product.variants.forEach((v) => {
    const sz = v.size ?? "—";
    const existing = sizeGroups.get(sz);
    const vStock = v.inventory.reduce((a, i) => a + i.quantity, 0);
    if (existing) { existing.variants.push(v); existing.stock += vStock; }
    else { sizeGroups.set(sz, { variants: [v], stock: vStock }); }
  });
  const sizeEntries = Array.from(sizeGroups.entries());

  const images = product.images.length ? product.images : [];

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-5">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push("/products")} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">Product Details</h1>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="hover:underline cursor-pointer" onClick={() => router.push("/products")}>Products</span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium truncate max-w-[200px]">{product.name}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditOpen(true)}>
            <Edit2 className="h-3.5 w-3.5" /> Edit Product
          </Button>
        </div>
      </div>

      {/* ── Hero ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr_auto] gap-5 items-start">

        {/* Images */}
        <div className="flex flex-col gap-2 items-center">
          <div className="h-44 w-44 rounded-xl border bg-muted/20 flex items-center justify-center overflow-hidden shrink-0">
            {images[imgIdx] ? (
              <img src={images[imgIdx]} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-10 w-10 text-muted-foreground/40" />
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-1.5">
              {images.slice(0, 4).map((img, i) => (
                <button key={i} onClick={() => setImgIdx(i)}
                  className={`h-10 w-10 rounded-lg border overflow-hidden ${imgIdx === i ? "ring-2 ring-primary" : "opacity-60 hover:opacity-100"}`}>
                  <img src={img} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
              {images.length > 4 && (
                <div className="h-10 w-10 rounded-lg border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                  +{images.length - 4}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold">{product.name}</h2>
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${STATUS_COLOR[product.status] ?? STATUS_COLOR.DRAFT}`}>
              {product.status}
            </span>
            {product.isFeatured && (
              <span className="text-xs bg-yellow-100 text-yellow-700 border border-yellow-200 px-2.5 py-0.5 rounded-full font-semibold">Featured</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-mono">SKU: {product.sku}</p>

          <div className="flex flex-wrap gap-2">
            {product.category && (
              <div className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-lg px-3 py-1.5">
                <Tag className="h-3.5 w-3.5 text-blue-500" />
                <span className="text-muted-foreground">Category</span>
                <span className="font-semibold">{product.category.name}</span>
              </div>
            )}
            {product.brand && (
              <div className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-lg px-3 py-1.5">
                <BarChart2 className="h-3.5 w-3.5 text-purple-500" />
                <span className="text-muted-foreground">Brand</span>
                <span className="font-semibold">{product.brand.name}</span>
              </div>
            )}
            {product.collections.map((c) => (
              <div key={c.collection.id} className="flex items-center gap-1.5 text-xs bg-muted/60 rounded-lg px-3 py-1.5">
                <Layers className="h-3.5 w-3.5 text-orange-500" />
                <span className="text-muted-foreground">Collection</span>
                <span className="font-semibold">{c.collection.name}</span>
              </div>
            ))}
          </div>

          {product.description && (
            <p className="text-sm text-muted-foreground max-w-xl leading-relaxed">{product.description}</p>
          )}

          <div className="flex flex-wrap gap-4 pt-1 text-xs text-muted-foreground border-t pt-3">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Created: <strong>{new Date(product.createdAt).toLocaleString()}</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              <span>Updated: <strong>{new Date(product.updatedAt).toLocaleString()}</strong></span>
            </div>
            {product.tags.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {product.tags.map((t) => (
                  <span key={t} className="bg-muted px-2 py-0.5 rounded-md text-[10px]">{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 min-w-[320px]">
          {[
            { label: "Selling Price",   value: `₹${fmt(product.sellingPrice)}`, icon: TrendingUp,    color: "text-blue-600",    bg: "bg-blue-50" },
            { label: "Available Stock", value: `${availStock} Pcs`,              icon: CheckCircle,   color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Cost Price",      value: `₹${fmt(product.costPrice)}`,     icon: Tag,           color: "text-orange-600",  bg: "bg-orange-50" },
            { label: "Reserved Stock",  value: `${reservedStock} Pcs`,            icon: Box,           color: "text-violet-600",  bg: "bg-violet-50" },
            { label: "Profit",          value: `₹${fmt(profit)}`,                icon: TrendingUp,    color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Total Stock",     value: `${totalStock} Pcs`,              icon: Package,       color: "text-blue-600",    bg: "bg-blue-50" },
            { label: "Margin",          value: `${margin.toFixed(1)}%`,          icon: BarChart2,     color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Low Stock Alert", value: "5 Pcs",                          icon: AlertTriangle, color: "text-red-500",     bg: "bg-red-50" },
          ].map((s) => (
            <Card key={s.label} className="border">
              <CardContent className="p-3 flex items-center gap-2.5">
                <div className={`p-2 rounded-lg ${s.bg} shrink-0`}>
                  <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                  <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="border-b flex gap-1">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px
              ${tab === t ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
            {t === "Variants" && ` (${product.variants.length})`}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === "Overview" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Basic Info */}
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-sm mb-4">Basic Information</h3>
                <div className="space-y-2.5">
                  {[
                    ["Product Name", product.name],
                    ["SKU",          product.sku],
                    ["Barcode",      product.barcode ?? "—"],
                    ["Category",     product.category?.name ?? "—"],
                    ["Brand",        product.brand?.name ?? "—"],
                    ["Collection",   product.collections[0]?.collection.name ?? "—"],
                    ["HSN/SAC Code", product.hsn ?? "—"],
                    ["Status",       product.status],
                    ["Description",  product.description ?? "—"],
                  ].map(([label, val]) => (
                    <div key={label} className="flex gap-3 text-sm">
                      <span className="text-muted-foreground w-32 shrink-0">{label}</span>
                      <span className="font-medium flex-1">{val}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Variants Summary */}
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-sm mb-4">Variants Summary</h3>
                {sizeEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No variants</p>
                ) : (
                  <>
                    <div className="text-[10px] font-semibold text-muted-foreground grid grid-cols-[60px_1fr_80px_80px] gap-2 pb-2 border-b mb-2">
                      <span>Size</span><span>Colors</span><span>Variants</span><span>Stock</span>
                    </div>
                    <div className="space-y-2">
                      {sizeEntries.map(([size, { variants: svars, stock }]) => (
                        <div key={size} className="grid grid-cols-[60px_1fr_80px_80px] gap-2 items-center text-sm py-1.5 border-b last:border-0">
                          <span className="font-bold text-sm">{size}</span>
                          <div className="flex gap-1 flex-wrap">
                            {svars.filter((v) => v.color).map((v) => (
                              <ColorDot key={v.id} color={v.color!} />
                            ))}
                            {svars.every((v) => !v.color) && <span className="text-xs text-muted-foreground">—</span>}
                          </div>
                          <span className="text-xs">{svars.length}</span>
                          <span className={`text-xs font-semibold ${stock > 0 ? "text-emerald-600" : "text-red-500"}`}>{stock}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between mt-4 pt-3 border-t text-xs font-semibold">
                      <span>Total Variants <span className="text-primary text-sm ml-1">{product.variants.length}</span></span>
                      <span>Total Stock <span className="text-primary text-sm ml-1">{totalStock} Pcs</span></span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Pricing Summary */}
            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold text-sm mb-4">Pricing Summary</h3>
                <div className="space-y-2.5">
                  {[
                    ["Cost Price",        `₹${fmt(product.costPrice)}`],
                    ["Selling Price",     `₹${fmt(product.sellingPrice)}`],
                    ["MRP",              `₹${fmt(product.mrp)}`],
                    ["Tax (VAT " + product.taxRate + "%)", `₹${fmt(product.sellingPrice * product.taxRate / 100)}`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between text-sm border-b pb-2 last:border-0">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-semibold">{val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 text-sm">
                    <span className="font-semibold">Final Price</span>
                    <span className="text-lg font-bold text-primary">₹{fmt(finalPrice)}</span>
                  </div>
                  <div className="mt-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex justify-between">
                    <div>
                      <p className="text-[10px] text-emerald-700">Profit</p>
                      <p className="text-sm font-bold text-emerald-700">₹{fmt(profit)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-emerald-700">Margin</p>
                      <p className="text-sm font-bold text-emerald-700">{margin.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Stock by Branch */}
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                <Warehouse className="h-4 w-4" /> Stock by Branch
              </h3>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-[11px] text-muted-foreground font-semibold">
                    <th className="text-left py-2">Branch</th>
                    <th className="text-right py-2">Total Stock</th>
                    <th className="text-right py-2">Reserved</th>
                    <th className="text-right py-2 text-emerald-600">Available</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted-foreground py-6 text-sm">No inventory records</td></tr>
                  ) : (
                    <>
                      {branches.map((b) => (
                        <tr key={b.name} className="border-b last:border-0">
                          <td className="py-2.5 font-medium">{b.name}</td>
                          <td className="py-2.5 text-right font-semibold">{b.qty}</td>
                          <td className="py-2.5 text-right text-muted-foreground">{b.reserved}</td>
                          <td className="py-2.5 text-right font-bold text-emerald-600">{b.qty - b.reserved}</td>
                        </tr>
                      ))}
                      <tr className="font-bold border-t-2 bg-muted/20">
                        <td className="py-2.5 pl-1">Total</td>
                        <td className="py-2.5 text-right">{totalStock}</td>
                        <td className="py-2.5 text-right">{reservedStock}</td>
                        <td className="py-2.5 text-right text-emerald-600">{availStock}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Variants Tab ── */}
      {tab === "Variants" && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-sm mb-4">All Variants ({product.variants.length})</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {["Variant", "SKU", "Size", "Color", "Cost", "Selling", "MRP", "Stock", "Status"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product.variants.map((v) => {
                    const vStock = v.inventory.reduce((a, i) => a + i.quantity, 0);
                    return (
                      <tr key={v.id} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2.5 font-medium">{v.name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{v.sku}</td>
                        <td className="px-3 py-2.5">{v.size ?? "—"}</td>
                        <td className="px-3 py-2.5">
                          {v.color ? (
                            <div className="flex items-center gap-1.5">
                              <ColorDot color={v.color} />
                              <span>{v.color}</span>
                            </div>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2.5">₹{fmt(v.costPrice)}</td>
                        <td className="px-3 py-2.5 font-semibold text-blue-600">₹{fmt(v.sellingPrice)}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">₹{fmt(v.mrp)}</td>
                        <td className="px-3 py-2.5">
                          <span className={`font-bold ${vStock > 0 ? "text-emerald-600" : "text-red-500"}`}>{vStock}</span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge variant={v.isActive ? "success" : "secondary"} className="text-[10px]">
                            {v.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Inventory Tab ── */}
      {tab === "Inventory" && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-semibold text-sm mb-4">Inventory by Branch & Variant</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {["Variant", "SKU", "Branch", "Available", "Reserved", "Total"].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {product.variants.flatMap((v) =>
                    v.inventory.length ? v.inventory.map((inv) => (
                      <tr key={inv.id} className="border-t hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">{v.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{v.sku}</td>
                        <td className="px-3 py-2">{inv.branch.name}</td>
                        <td className="px-3 py-2 font-bold text-emerald-600">{inv.quantity - inv.reservedQty}</td>
                        <td className="px-3 py-2 text-violet-600">{inv.reservedQty}</td>
                        <td className="px-3 py-2 font-semibold">{inv.quantity}</td>
                      </tr>
                    )) : [(
                      <tr key={v.id} className="border-t">
                        <td className="px-3 py-2 font-medium">{v.name}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{v.sku}</td>
                        <td className="px-3 py-2 text-muted-foreground" colSpan={4}>No inventory record</td>
                      </tr>
                    )]
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Pricing & Tax Tab ── */}
      {tab === "Pricing & Tax" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm mb-4">Product Pricing</h3>
              <div className="space-y-3">
                {[
                  ["Cost Price",     `₹${fmt(product.costPrice)}`],
                  ["Selling Price",  `₹${fmt(product.sellingPrice)}`],
                  ["MRP",           `₹${fmt(product.mrp)}`],
                  ["Tax Rate",       `${product.taxRate}%`],
                  ["Tax Amount",     `₹${fmt(product.sellingPrice * product.taxRate / 100)}`],
                  ["Final Price",    `₹${fmt(finalPrice)}`],
                  ["Profit",         `₹${fmt(profit)}`],
                  ["Profit Margin",  `${margin.toFixed(2)}%`],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b last:border-0 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-semibold">{val}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <h3 className="font-semibold text-sm mb-4">Variant Pricing</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      {["Variant", "Cost", "Selling", "MRP", "Margin"].map((h) => (
                        <th key={h} className="text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((v) => {
                      const vProfit = v.sellingPrice - v.costPrice;
                      const vMargin = v.sellingPrice > 0 ? (vProfit / v.sellingPrice) * 100 : 0;
                      return (
                        <tr key={v.id} className="border-t">
                          <td className="px-2 py-2 font-medium text-xs">{v.name}</td>
                          <td className="px-2 py-2 text-xs">₹{fmt(v.costPrice)}</td>
                          <td className="px-2 py-2 text-xs font-semibold text-blue-600">₹{fmt(v.sellingPrice)}</td>
                          <td className="px-2 py-2 text-xs text-muted-foreground">₹{fmt(v.mrp)}</td>
                          <td className="px-2 py-2 text-xs font-semibold text-emerald-600">{vMargin.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {editOpen && (
        <AddProductModal
          open={editOpen}
          onClose={() => setEditOpen(false)}
          onCreated={() => { setEditOpen(false); load(); }}
          editProduct={product as Parameters<typeof AddProductModal>[0]["editProduct"]}
        />
      )}
    </div>
  );
}
