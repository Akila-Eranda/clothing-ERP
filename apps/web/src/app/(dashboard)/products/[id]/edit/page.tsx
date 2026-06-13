"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Plus, Trash2, X, Loader2, Save,
  Zap, List, ChevronDown, ArrowLeft, Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopProfile, hasShopModule } from "@/lib/use-shop-profile";
import { buildProductFormDefaults, nextVariantAttributeName, variantTableColumns, variantVariantHint } from "@/lib/shop-vertical";
import { variantAttrsFromProfile } from "@/lib/shop-profiles";

// ── Types ──────────────────────────────────────────────────────────────────
interface Category { id: string; name: string; }
interface Brand    { id: string; name: string; }
interface VariantAttr { name: string; values: string[]; input: string; }
interface VariantRow {
  id?: string;
  key: string; sku: string; name: string;
  size?: string; color?: string; material?: string; style?: string;
  sellingPrice: string; costPrice: string; mrp: string;
  active: boolean;
}
interface Form {
  name: string; description: string; shortDesc: string;
  categoryId: string; brandId: string; hsn: string;
  status: "ACTIVE" | "DRAFT";
  tags: string[]; tagInput: string;
  sellingPrice: string; costPrice: string; mrp: string; taxRate: string;
  hasVariants: boolean; attributes: VariantAttr[];
  trackInventory: boolean;
  warrantyMonths: string;
}
interface ExistingVariant {
  id: string; name: string; sku: string;
  size?: string | null; color?: string | null; material?: string | null; style?: string | null;
  costPrice: number; sellingPrice: number; mrp: number;
  isActive: boolean;
}
interface ProductData {
  id: string; name: string; sku: string; hsn?: string | null;
  status: string; description?: string | null; shortDesc?: string | null;
  costPrice: number; sellingPrice: number; mrp: number; taxRate: number;
  warrantyMonths?: number | null;
  tags: string[]; hasVariants: boolean; trackInventory: boolean;
  category?: { id: string; name: string } | null;
  brand?: { id: string; name: string } | null;
  variants: ExistingVariant[];
}

// ── Helpers ────────────────────────────────────────────────────────────────
function cartesian(attrs: VariantAttr[]): string[][] {
  const valid = attrs.filter((a) => a.values.length > 0);
  if (!valid.length) return [];
  return valid.reduce<string[][]>(
    (acc, a) => acc.flatMap((prev) => a.values.map((v) => [...prev, v])),
    [[]]
  );
}
function genSku(name: string, combo: string[]): string {
  const b = name ? name.replace(/\s+/g, "").slice(0, 3).toUpperCase() : "PRD";
  return [b, ...combo.map((v) => v.replace(/\s+/g, "").slice(0, 3).toUpperCase())].join("-");
}
const COLOR_HEX: Record<string, string> = {
  black: "#1a1a1a", white: "#f5f5f5", red: "#ef4444", blue: "#3b82f6",
  green: "#22c55e", yellow: "#eab308", purple: "#8b5cf6", pink: "#ec4899",
  orange: "#f97316", navy: "#1e3a8a", grey: "#9ca3af", gray: "#9ca3af",
  olive: "#6b7c3a", brown: "#92400e", cream: "#fef3c7", beige: "#d4a574",
  maroon: "#7f1d1d", teal: "#0d9488", cyan: "#06b6d4", indigo: "#6366f1",
};

// ── Page ──────────────────────────────────────────────────────────────────
export default function EditProductPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();
  const shopProfile = useShopProfile();
  const showWarranty = hasShopModule(shopProfile, "warranty");
  const variantCols = variantTableColumns(shopProfile);
  const variantHint = variantVariantHint(shopProfile);

  const [form, setForm]             = useState<Form>({
    name: "", description: "", shortDesc: "",
    categoryId: "", brandId: "", hsn: "", status: "ACTIVE",
    tags: [], tagInput: "",
    sellingPrice: "", costPrice: "", mrp: "", taxRate: "0",
    hasVariants: false, attributes: variantAttrsFromProfile(shopProfile.type),
    trackInventory: true,
    warrantyMonths: "",
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [loading, setLoading]       = useState(false);
  const [listView, setListView]     = useState(false);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [productName, setProductName] = useState("");

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const getColorHex = (val: string) => COLOR_HEX[val.toLowerCase()] ?? null;

  // ── Load product ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [prodRes, catRes, brandRes] = await Promise.all([
        api.get<ProductData>(`/products/${id}`),
        api.get<Category[]>("/categories"),
        api.get<Brand[]>("/brands"),
      ]);
      const p = prodRes.data;
      setProductName(p.name);
      setCategories(catRes.data ?? []);
      setBrands(brandRes.data ?? []);
      setForm({
        name:          p.name,
        description:   p.description   ?? "",
        shortDesc:     p.shortDesc     ?? "",
        categoryId:    p.category?.id  ?? "",
        brandId:       p.brand?.id     ?? "",
        hsn:           p.hsn           ?? "",
        status:        (p.status as "ACTIVE" | "DRAFT"),
        tags:          p.tags,
        tagInput:      "",
        sellingPrice:  String(p.sellingPrice),
        costPrice:     String(p.costPrice),
        mrp:           String(p.mrp),
        taxRate:       String(p.taxRate),
        hasVariants:   p.hasVariants,
        attributes:    variantAttrsFromProfile(shopProfile.type),
        trackInventory: p.trackInventory,
        warrantyMonths: p.warrantyMonths != null && p.warrantyMonths > 0 ? String(p.warrantyMonths) : "",
      });
      if (p.variants.length > 0) {
        setVariantRows(p.variants.map((v) => ({
          id:           v.id,
          key:          v.id,
          sku:          v.sku,
          name:         v.name,
          size:         v.size  ?? undefined,
          color:        v.color ?? undefined,
          material:     v.material ?? undefined,
          style:        v.style ?? undefined,
          sellingPrice: String(v.sellingPrice),
          costPrice:    String(v.costPrice),
          mrp:          String(v.mrp),
          active:       v.isActive,
        })));
        setListView(true);
      }
    } catch {
      toast.error("Failed to load product");
      router.push("/products");
    } finally { setFetchLoading(false); }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // ── Variant helpers ───────────────────────────────────────────────────
  const addAttrValue = (i: number) => {
    const a = form.attributes.map((x, j) => {
      if (j !== i) return x;
      const val = x.input.trim().replace(/,$/, "");
      if (!val || x.values.includes(val)) return { ...x, input: "" };
      return { ...x, values: [...x.values, val], input: "" };
    });
    set("attributes", a);
  };

  const buildRows = (combos: string[][], attrs: VariantAttr[]): VariantRow[] => {
    const validAttrs = attrs.filter((a) => a.values.length > 0);
    return combos.map((combo) => {
      const row: VariantRow = {
        key: combo.join("|"), sku: genSku(form.name, combo), name: combo.join(" / "),
        sellingPrice: form.sellingPrice, costPrice: form.costPrice, mrp: form.mrp, active: true,
      };
      validAttrs.forEach((attr, idx) => {
        const k = attr.name.toLowerCase();
        if (k === "size") row.size = combo[idx];
        else if (k === "color") row.color = combo[idx];
        else if (k === "material") row.material = combo[idx];
        else if (k === "style") row.style = combo[idx];
      });
      return row;
    });
  };

  const openListView = () => {
    const combos = cartesian(form.attributes);
    if (!combos.length) { toast.error("Add attribute values first"); return; }
    setVariantRows((prev) => [...prev, ...buildRows(combos, form.attributes)]);
    setListView(true);
  };

  const updateRow = (key: string, field: keyof VariantRow, value: string | boolean) =>
    setVariantRows((rows) => rows.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const autoGenerate = () => {
    set("attributes", form.attributes.map((a) => {
      const n = a.name.toLowerCase();
      if (n === "size")  return { ...a, values: ["S", "M", "L", "XL"] };
      if (n === "color") return { ...a, values: ["Black", "White", "Navy", "Olive"] };
      return a;
    }));
  };

  // ── Submit ────────────────────────────────────────────────────────────
  const submit = async (status: "ACTIVE" | "DRAFT") => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    if (!form.sellingPrice || !form.costPrice || !form.mrp) {
      toast.error("Selling price, cost price and MRP are required"); return;
    }
    setLoading(true);

    let variants: Record<string, unknown>[] | undefined = undefined;
    if (form.hasVariants && variantRows.length > 0) {
      variants = variantRows.map((r) => ({
        id:           r.id,
        sku:          r.sku,
        name:         r.name,
        size:         r.size,
        color:        r.color,
        material:     r.material,
        style:        r.style,
        sellingPrice: parseFloat(r.sellingPrice) || parseFloat(form.sellingPrice) || 0,
        costPrice:    parseFloat(r.costPrice)    || parseFloat(form.costPrice)    || 0,
        mrp:          parseFloat(r.mrp)          || parseFloat(form.mrp)          || 0,
        isActive:     r.active,
      }));
    }

    try {
      await api.put(`/products/${id}`, {
        name:           form.name.trim(),
        description:    form.description  || undefined,
        shortDesc:      form.shortDesc    || undefined,
        categoryId:     form.categoryId   || undefined,
        brandId:        form.brandId      || undefined,
        hsn:            form.hsn          || undefined,
        sellingPrice:   parseFloat(form.sellingPrice),
        costPrice:      parseFloat(form.costPrice),
        mrp:            parseFloat(form.mrp),
        taxRate:        parseFloat(form.taxRate) || 0,
        status,
        tags:           form.tags,
        hasVariants:    form.hasVariants,
        trackInventory: form.trackInventory,
        ...(showWarranty
          ? { warrantyMonths: form.warrantyMonths.trim() ? parseInt(form.warrantyMonths, 10) || 0 : 0 }
          : {}),
        variants,
      });
      toast.success(`"${form.name}" updated successfully!`);
      router.push(`/products/${id}`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to update product");
    } finally { setLoading(false); }
  };

  // ── Computed ──────────────────────────────────────────────────────────
  const allVariants = cartesian(form.attributes);
  const validAttrs  = form.attributes.filter((a) => a.values.length > 0);
  const sp = parseFloat(form.sellingPrice || "0");
  const cp = parseFloat(form.costPrice    || "0");
  const margin = sp > 0 ? ((sp - cp) / sp * 100).toFixed(1) : "0.0";

  // ── Loading state ─────────────────────────────────────────────────────
  if (fetchLoading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  // ── Return ────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-muted/30">

      {/* ── Top bar ── */}
      <div className="bg-background border-b px-6 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => router.push(`/products/${id}`)}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
          <ArrowLeft className="h-4 w-4" /> Back to Product
        </button>
        <div className="flex flex-col items-center">
          <h1 className="text-base font-semibold">Edit Product</h1>
          <p className="text-xs text-muted-foreground truncate max-w-[240px]">{productName}</p>
        </div>
        <div className="w-36" />
      </div>

      {/* ── 2-column layout ── */}
      <div className="flex-1 overflow-y-auto">
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* ══ LEFT COLUMN ══ */}
        <div className="space-y-5">

          {/* Basic Info */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-base border-b pb-2">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Product Name <span className="text-destructive">*</span></Label>
                <Input placeholder="e.g. Premium Cotton T-Shirt" value={form.name} maxLength={120}
                  onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Category</Label>
                <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.length === 0
                      ? <SelectItem value="_none" disabled>No categories found</SelectItem>
                      : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Brand</Label>
                <Select value={form.brandId} onValueChange={(v) => set("brandId", v)}>
                  <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
                  <SelectContent>
                    {brands.length === 0
                      ? <SelectItem value="_none" disabled>No brands found</SelectItem>
                      : brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">HSN / SAC Code</Label>
                <Input placeholder="e.g. 6109" value={form.hsn} onChange={(e) => set("hsn", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tags</Label>
                <div className="flex flex-wrap gap-1.5 items-center border rounded-lg p-2 min-h-[38px] bg-background cursor-text"
                  onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
                  {form.tags.map((tag, i) => (
                    <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 h-5 text-xs">
                      {tag}
                      <button onClick={() => set("tags", form.tags.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                  <input className="flex-1 min-w-[80px] outline-none text-xs bg-transparent placeholder:text-muted-foreground"
                    placeholder="Add tag, press Enter…" value={form.tagInput}
                    onChange={(e) => set("tagInput", e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && form.tagInput.trim()) {
                        e.preventDefault();
                        const t = form.tagInput.trim().replace(/,$/, "");
                        if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
                        set("tagInput", "");
                      }
                    }} />
                </div>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">Description</Label>
                <Textarea placeholder="Product description…" rows={3} value={form.description}
                  onChange={(e) => set("description", e.target.value)} />
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-base border-b pb-2">Pricing <span className="text-xs font-normal text-muted-foreground">(LKR)</span></h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Selling Price <span className="text-destructive">*</span></Label>
                <Input type="number" min="0" placeholder="0.00" value={form.sellingPrice}
                  onChange={(e) => set("sellingPrice", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Cost Price <span className="text-destructive">*</span></Label>
                <Input type="number" min="0" placeholder="0.00" value={form.costPrice}
                  onChange={(e) => set("costPrice", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">MRP <span className="text-destructive">*</span></Label>
                <Input type="number" min="0" placeholder="0.00" value={form.mrp}
                  onChange={(e) => set("mrp", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Tax Rate (%)</Label>
                <Select value={form.taxRate} onValueChange={(v) => set("taxRate", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["0","5","12","18","28"].map((t) => <SelectItem key={t} value={t}>{t}%</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {form.sellingPrice && form.costPrice && (
              <div className="flex gap-6 pt-1 text-sm border-t mt-2">
                <span className="text-muted-foreground">Gross Margin: <strong className="text-emerald-500">LKR {(sp - cp).toFixed(2)}</strong></span>
                <span className="text-muted-foreground">Margin %: <strong className="text-emerald-500">{margin}%</strong></span>
              </div>
            )}
            {showWarranty && (
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-xs font-semibold">Warranty (months)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="0 = no warranty"
                  value={form.warrantyMonths}
                  onChange={(e) => set("warrantyMonths", e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave empty or 0 if this part has no warranty. Only products with months set can receive warranty claims.
                </p>
              </div>
            )}
          </div>

          {/* Variants */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h2 className="font-semibold text-base">Variants</h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Has variants</span>
                <Switch checked={form.hasVariants} onCheckedChange={(v) => { set("hasVariants", v); if (!v) setListView(false); }} />
              </div>
            </div>

            {!form.hasVariants ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Enable variants to manage {variantHint}</p>
            ) : listView ? (
              /* ── List view (existing + new variants) ── */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{variantRows.length} variants
                    <span className="ml-2 text-xs text-muted-foreground">({variantRows.filter((r) => r.active).length} active)</span>
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setListView(false)}>
                      Add More
                    </Button>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() =>
                      setVariantRows(buildRows(cartesian(form.attributes), form.attributes))}>
                      <Zap className="h-3 w-3" /> Regenerate
                    </Button>
                  </div>
                </div>
                <div className="rounded-xl border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30 border-b text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2.5 text-left w-8">#</th>
                          <th className="px-3 py-2.5 text-left">SKU</th>
                          <th className="px-3 py-2.5 text-left">Variant</th>
                          {variantCols.map((col) => (
                            variantRows.some((r) => r[col.field] !== undefined) && (
                              <th key={col.field} className="px-3 py-2.5 text-left">{col.label}</th>
                            )
                          ))}
                          <th className="px-3 py-2.5 text-right">Selling</th>
                          <th className="px-3 py-2.5 text-right">Cost</th>
                          <th className="px-3 py-2.5 text-right">MRP</th>
                          <th className="px-3 py-2.5 text-center">Active</th>
                          <th className="px-2 py-2.5 w-6"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {variantRows.map((row, idx) => {
                          const hex = row.color ? getColorHex(row.color) : null;
                          return (
                            <tr key={row.key} className={`hover:bg-muted/10 ${!row.active ? "opacity-40" : ""}`}>
                              <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                              <td className="px-3 py-2">
                                <Input value={row.sku} onChange={(e) => updateRow(row.key, "sku", e.target.value)}
                                  className="h-7 text-xs font-mono w-28" />
                              </td>
                              <td className="px-3 py-2 font-medium">
                                {row.name}
                                {row.id && <span className="ml-1 text-[9px] text-muted-foreground/60">existing</span>}
                              </td>
                              {variantCols.map((col) => (
                                variantRows.some((r) => r[col.field] !== undefined) && (
                                  <td key={col.field} className="px-3 py-2">
                                    {row[col.field] ? (
                                      col.isColor ? (
                                        <div className="flex items-center gap-1.5">
                                          {getColorHex(String(row[col.field])) && (
                                            <span className="h-3.5 w-3.5 rounded-full border shrink-0" style={{ backgroundColor: getColorHex(String(row[col.field]))! }} />
                                          )}
                                          {row[col.field]}
                                        </div>
                                      ) : (
                                        <Badge variant="secondary" className="text-[10px]">{row[col.field]}</Badge>
                                      )
                                    ) : "—"}
                                  </td>
                                )
                              ))}
                              <td className="px-3 py-2"><Input type="number" value={row.sellingPrice} onChange={(e) => updateRow(row.key, "sellingPrice", e.target.value)} className="h-7 text-xs text-right w-20" /></td>
                              <td className="px-3 py-2"><Input type="number" value={row.costPrice}    onChange={(e) => updateRow(row.key, "costPrice",    e.target.value)} className="h-7 text-xs text-right w-20" /></td>
                              <td className="px-3 py-2"><Input type="number" value={row.mrp}          onChange={(e) => updateRow(row.key, "mrp",          e.target.value)} className="h-7 text-xs text-right w-20" /></td>
                              <td className="px-3 py-2 text-center"><Switch checked={row.active} onCheckedChange={(v) => updateRow(row.key, "active", v)} /></td>
                              <td className="px-2 py-2">
                                <button onClick={() => setVariantRows((r) => r.filter((x) => x.key !== row.key))}
                                  className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="px-4 py-2.5 border-t bg-muted/10 flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{variantRows.filter((r) => r.active).length} / {variantRows.length} active</span>
                    <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive hover:text-destructive gap-1"
                      onClick={() => setVariantRows([])}>
                      <Trash2 className="h-3 w-3" /> Clear All
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Attribute builder for adding new combos ── */
              <div className="space-y-4">
                {variantRows.length > 0 && (
                  <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3 flex items-center justify-between text-sm">
                    <span className="text-blue-700">{variantRows.length} existing variants loaded</span>
                    <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={() => setListView(true)}>
                      <List className="h-3 w-3" /> View/Edit Existing
                    </Button>
                  </div>
                )}
                {form.attributes.map((attr, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Input value={attr.name} className="w-24 h-7 text-xs font-semibold border-0 bg-transparent px-0 focus-visible:ring-0"
                        onChange={(e) => { const a = [...form.attributes]; a[i] = { ...a[i], name: e.target.value }; set("attributes", a); }}
                        placeholder="Attribute" />
                      <button className="p-1 rounded hover:bg-muted text-muted-foreground transition-colors"
                        onClick={() => set("attributes", form.attributes.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center border rounded-lg p-2 min-h-[40px] bg-background cursor-text"
                      onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
                      {attr.values.map((v, vi) => {
                        const hex = attr.name.toLowerCase() === "color" ? getColorHex(v) : null;
                        return (
                          <Badge key={vi} variant="secondary" className="gap-1 pl-1.5 pr-1 h-6 items-center">
                            {hex && <span className="h-3.5 w-3.5 rounded-full border shrink-0" style={{ backgroundColor: hex }} />}
                            {v}
                            <button className="hover:text-destructive ml-0.5"
                              onClick={(e) => { e.stopPropagation(); set("attributes", form.attributes.map((x, j) => j !== i ? x : { ...x, values: x.values.filter((_, k) => k !== vi) })); }}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                      <input className="flex-1 min-w-[80px] outline-none text-sm bg-transparent placeholder:text-muted-foreground"
                        placeholder={`Add ${attr.name}…`} value={attr.input}
                        onChange={(e) => { const a = form.attributes.map((x, j) => j !== i ? x : { ...x, input: e.target.value }); set("attributes", a); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addAttrValue(i); } }} />
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {form.attributes.length < shopProfile.variantAttributes.length && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => {
                      const next = nextVariantAttributeName(shopProfile, form.attributes);
                      if (next) set("attributes", [...form.attributes, { name: next, values: [], input: "" }]);
                    }}>
                      <Plus className="h-3 w-3" /> Add Attribute
                    </Button>
                    )}
                    {shopProfile.variantAttributes[0]?.presets?.includes('S') && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5" onClick={autoGenerate}>
                      <Zap className="h-3 w-3" /> Auto {shopProfile.variantAttributes[0]?.presets.slice(0, 4).join('/')}
                    </Button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">{allVariants.length} variants</span>
                </div>
                {allVariants.length > 0 && (
                  <div className="rounded-lg border bg-muted/10 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New variants preview ({allVariants.length})</p>
                      <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={openListView}>
                        <List className="h-3 w-3" /> Add to List
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-auto">
                      {allVariants.slice(0, 30).map((combo, idx) => {
                        const colorAttr = validAttrs.find((a) => a.name.toLowerCase() === "color");
                        const colorVal  = colorAttr ? combo[validAttrs.indexOf(colorAttr)] : null;
                        const hex = colorVal ? getColorHex(colorVal) : null;
                        return (
                          <div key={idx} className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-background border text-xs">
                            {hex && <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: hex }} />}
                            <span className="font-mono text-primary text-[10px]">{genSku(form.name, combo)}</span>
                            <span className="text-muted-foreground">{combo.join(" / ")}</span>
                          </div>
                        );
                      })}
                      {allVariants.length > 30 && <p className="text-xs text-muted-foreground">+{allVariants.length - 30} more</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
        {/* ══ END LEFT COLUMN ══ */}

        {/* ══ RIGHT SIDEBAR ══ */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Status */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-sm border-b pb-2">Status & Settings</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-xs text-muted-foreground">{form.status === "ACTIVE" ? "Visible in POS & inventory" : "Hidden — saved as draft"}</p>
              </div>
              <Switch checked={form.status === "ACTIVE"} onCheckedChange={(v) => set("status", v ? "ACTIVE" : "DRAFT")} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Track Inventory</p>
                <p className="text-xs text-muted-foreground">Monitor stock levels</p>
              </div>
              <Switch checked={form.trackInventory} onCheckedChange={(v) => set("trackInventory", v)} />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-2 text-sm">
            <h3 className="font-semibold text-sm border-b pb-2">Summary</h3>
            {[
              ["Name",     form.name     || <span className="text-muted-foreground italic">Not set</span>],
              ["Category", categories.find((c) => c.id === form.categoryId)?.name || <span className="text-muted-foreground italic">None</span>],
              ["Selling",  form.sellingPrice ? `LKR ${parseFloat(form.sellingPrice).toLocaleString("en-LK")}` : <span className="text-muted-foreground italic">—</span>],
              ["Cost",     form.costPrice    ? `LKR ${parseFloat(form.costPrice).toLocaleString("en-LK")}`    : <span className="text-muted-foreground italic">—</span>],
              ["Variants", form.hasVariants  ? `${variantRows.length} variants` : "No variants"],
              ["Status",   form.status],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between gap-2">
                <span className="text-muted-foreground shrink-0">{label}</span>
                <span className="font-medium text-right truncate">{val as React.ReactNode}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-3">
            <Button className="w-full gap-2" disabled={loading} onClick={() => submit("ACTIVE")}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Update Product
            </Button>
            <Button variant="outline" className="w-full" disabled={loading} onClick={() => submit("DRAFT")}>
              <Package className="h-4 w-4 mr-2" /> Save as Draft
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => router.push(`/products/${id}`)}>
              Cancel
            </Button>
          </div>

        </div>
        {/* ══ END SIDEBAR ══ */}

      </div>
      </div>
    </div>
  );
}
