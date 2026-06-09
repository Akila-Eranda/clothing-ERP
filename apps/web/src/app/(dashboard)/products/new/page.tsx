"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, X, Loader2, Package,
  Zap, List, ChevronDown, ArrowLeft,
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
import { useShopProfile, hasMultiUnit, hasExpiryTracking, hasBatchTracking, useShopWorkspace } from "@/lib/use-shop-profile";
import { getShopProfile } from "@/lib/shop-profiles";
import { getWorkspace } from "@/lib/shop-workspace";
import {
  buildProductFormDefaults, nextVariantAttributeName, variantTableColumns, variantVariantHint,
  applyVariantCombo, autoFillVariantAttributes, findVariantAttrDef, getProductFormCopy, isColorVariantAttr,
} from "@/lib/shop-vertical";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Category { id: string; name: string; }
interface Brand    { id: string; name: string; }
interface VariantAttr { name: string; values: string[]; input: string; }
interface VariantRow {
  key: string; sku: string; name: string;
  size?: string; color?: string; material?: string; style?: string;
  sellingPrice: string; costPrice: string; mrp: string;
  active: boolean;
}
interface Form {
  name: string; barcode: string; description: string; shortDesc: string;
  categoryId: string; brandId: string; hsn: string;
  status: "ACTIVE" | "DRAFT";
  tags: string[]; tagInput: string;
  sellingPrice: string; costPrice: string; mrp: string; taxRate: string;
  hasVariants: boolean; attributes: VariantAttr[];
  unit: string; expiryDate: string; batchNumber: string;
  trackInventory: boolean;
}
function buildInitial(type?: string): Form {
  const d = buildProductFormDefaults(type);
  const profile = getShopProfile(type);
  const copy = getProductFormCopy(profile, getWorkspace(profile.type));
  return {
    name: "", barcode: "", description: "", shortDesc: "",
    categoryId: "", brandId: "", hsn: "", status: "ACTIVE",
    tags: [], tagInput: "",
    sellingPrice: "", costPrice: "", mrp: "", taxRate: copy.defaultTaxRate,
    hasVariants: d.hasVariants, attributes: d.attributes,
    unit: d.unit, expiryDate: "", batchNumber: "",
    trackInventory: true,
  };
}
const INITIAL: Form = buildInitial();

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

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AddProductPage() {
  const router = useRouter();
  const shopProfile = useShopProfile();
  const { workspace } = useShopWorkspace();
  const formCopy = getProductFormCopy(shopProfile, workspace);
  const variantCols = variantTableColumns(shopProfile);
  const variantHint = variantVariantHint(shopProfile);
  const showUnit = hasMultiUnit(shopProfile);
  const showExpiry = hasExpiryTracking(shopProfile);
  const showBatch = hasBatchTracking(shopProfile);
  const [form, setForm]             = useState<Form>(() => buildInitial(shopProfile.type));
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [loading, setLoading]       = useState(false);
  const [listView, setListView]     = useState(false);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);

  useEffect(() => {
    setForm(buildInitial(shopProfile.type));
    setListView(false);
    setVariantRows([]);
  }, [shopProfile.type]);

  useEffect(() => {
    api.get<Category[]>("/categories").then((r) => setCategories(r.data ?? [])).catch(() => toast.error("Failed to load categories"));
    if (formCopy.showBrand) {
      api.get<Brand[]>("/brands").then((r) => setBrands(r.data ?? [])).catch(() => toast.error("Failed to load brands"));
    }
  }, [formCopy.showBrand]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const getColorHex = (val: string) => COLOR_HEX[val.toLowerCase()] ?? null;

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
    return combos.map((combo) => ({
      key: combo.join("|"), sku: genSku(form.name, combo), name: combo.join(" / "),
      ...applyVariantCombo(shopProfile, validAttrs, combo),
      sellingPrice: form.sellingPrice, costPrice: form.costPrice, mrp: form.mrp, active: true,
    }));
  };

  const openListView = () => {
    const combos = cartesian(form.attributes);
    if (!combos.length) { toast.error("Add attribute values first"); return; }
    setVariantRows(buildRows(combos, form.attributes));
    setListView(true);
  };

  const updateRow = (key: string, field: keyof VariantRow, value: string | boolean) =>
    setVariantRows((rows) => rows.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const autoGenerate = () => set("attributes", autoFillVariantAttributes(shopProfile, form.attributes));

  const togglePreset = (attrIdx: number, preset: string) => {
    set("attributes", form.attributes.map((x, j) => {
      if (j !== attrIdx) return x;
      const has = x.values.includes(preset);
      return { ...x, values: has ? x.values.filter((v) => v !== preset) : [...x.values, preset] };
    }));
  };

  const submit = async (status: "ACTIVE" | "DRAFT") => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }
    if (!form.sellingPrice || !form.costPrice || !form.mrp) {
      toast.error("Selling price, cost price and MRP are required"); return;
    }
    setLoading(true);
    let variants: Record<string, unknown>[] = [];
    if (form.hasVariants) {
      if (listView && variantRows.length > 0) {
        variants = variantRows.filter((r) => r.active).map((r) => ({
          sku: r.sku, name: r.name,
          size: r.size, color: r.color, material: r.material, style: r.style,
          sellingPrice: parseFloat(r.sellingPrice) || parseFloat(form.sellingPrice) || 0,
          costPrice:    parseFloat(r.costPrice)    || parseFloat(form.costPrice)    || 0,
          mrp:          parseFloat(r.mrp)          || parseFloat(form.mrp)          || 0,
        }));
      } else {
        const validAttrs = form.attributes.filter((a) => a.values.length > 0);
        variants = (validAttrs.length > 0 ? cartesian(form.attributes) : []).map((combo) => ({
          sku: genSku(form.name, combo), name: combo.join(" / "),
          ...applyVariantCombo(shopProfile, validAttrs, combo),
          sellingPrice: parseFloat(form.sellingPrice) || 0,
          costPrice:    parseFloat(form.costPrice)    || 0,
          mrp:          parseFloat(form.mrp)          || 0,
        }));
      }
    }
    const extraTags = [
      ...form.tags,
      ...(showUnit && form.unit ? [`unit:${form.unit}`] : []),
      ...(showExpiry && form.expiryDate ? [`exp:${form.expiryDate}`] : []),
      ...(showBatch && form.batchNumber ? [`batch:${form.batchNumber}`] : []),
    ];
    try {
      await api.post("/products", {
        name: form.name.trim(),
        description: form.description || undefined,
        shortDesc: form.shortDesc || undefined,
        categoryId: form.categoryId || undefined,
        brandId: formCopy.showBrand && form.brandId ? form.brandId : undefined,
        hsn: form.hsn || undefined,
        barcode: form.barcode || undefined,
        sellingPrice: parseFloat(form.sellingPrice),
        costPrice: parseFloat(form.costPrice),
        mrp: parseFloat(form.mrp),
        taxRate: parseFloat(form.taxRate) || 0,
        status, tags: extraTags,
        hasVariants: form.hasVariants,
        trackInventory: form.trackInventory,
        variants: variants.length > 0 ? variants : undefined,
      });
      toast.success(`"${form.name}" ${status === "DRAFT" ? "saved as draft" : "created"}!`);
      router.push("/products");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create product");
    } finally { setLoading(false); }
  };

  // â”€â”€ Computed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allVariants = cartesian(form.attributes);
  const validAttrs  = form.attributes.filter((a) => a.values.length > 0);
  const sp = parseFloat(form.sellingPrice || "0");
  const cp = parseFloat(form.costPrice    || "0");
  const margin = sp > 0 ? ((sp - cp) / sp * 100).toFixed(1) : "0.0";

  // â”€â”€ Return â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="h-full flex flex-col bg-muted/30">

      {/* â”€â”€ Top bar â”€â”€ */}
      <div className="bg-background border-b px-6 py-3 flex items-center justify-between shrink-0">
        <button onClick={() => router.push("/products")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium">
          <ArrowLeft className="h-4 w-4" /> Back to Products
        </button>
        <h1 className="text-base font-semibold">{formCopy.pageTitle}</h1>
        <div className="w-36" /> {/* spacer */}
      </div>

      {/* â”€â”€ 2-column layout â”€â”€ */}
      <div className="flex-1 overflow-y-auto">
      <div className="p-6 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6 items-start">

        {/* â•â• LEFT COLUMN â•â• */}
        <div className="space-y-5">

          <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{shopProfile.emoji} {shopProfile.label}:</span>{" "}
            {formCopy.productTip}
          </div>

          {/* Basic Info */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-base border-b pb-2">Basic Information</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs font-semibold">{formCopy.nameLabel} <span className="text-destructive">*</span></Label>
                <Input placeholder={formCopy.namePlaceholder} value={form.name} maxLength={120}
                  onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Barcode</Label>
                <Input placeholder="Scan or enter barcode" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} />
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
              {formCopy.showBrand && (
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
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">HSN / SAC Code</Label>
                <Input placeholder="e.g. 6109" value={form.hsn} onChange={(e) => set("hsn", e.target.value)} />
              </div>
              {showUnit && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Unit of Measure</Label>
                  <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
                    <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                    <SelectContent>
                      {shopProfile.units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {showExpiry && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Expiry Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
                </div>
              )}
              {showBatch && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Batch Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Input placeholder="e.g. BATCH-2026-001" value={form.batchNumber} onChange={(e) => set("batchNumber", e.target.value)} />
                </div>
              )}
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
                <Textarea placeholder={formCopy.descriptionPlaceholder} rows={3} value={form.description}
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
          </div>

          {/* Variants */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <div>
                <h2 className="font-semibold text-base">Variants</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{formCopy.variantSectionHint}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Enable variants</span>
                <Switch checked={form.hasVariants} onCheckedChange={(v) => { set("hasVariants", v); setListView(false); }} />
              </div>
            </div>

            {!form.hasVariants ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Enable variants to add {variantHint}</p>
            ) : listView ? (
              /* â”€â”€ List view â”€â”€ */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{variantRows.length} variants</p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setListView(false)}>
                      Back to Grid
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
                            variantRows[0]?.[col.field] !== undefined && (
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
                              <td className="px-3 py-2 font-medium">{row.name}</td>
                              {variantCols.map((col) => (
                                row[col.field] !== undefined && (
                                  <td key={col.field} className="px-3 py-2">
                                    {col.isColor ? (
                                      <div className="flex items-center gap-1.5">
                                        {getColorHex(String(row[col.field])) && (
                                          <span className="h-3.5 w-3.5 rounded-full border shrink-0" style={{ backgroundColor: getColorHex(String(row[col.field]))! }} />
                                        )}
                                        {row[col.field]}
                                      </div>
                                    ) : (
                                      <Badge variant="secondary" className="text-[10px]">{row[col.field]}</Badge>
                                    )}
                                  </td>
                                )
                              ))}
                              <td className="px-3 py-2"><Input type="number" value={row.sellingPrice} onChange={(e) => updateRow(row.key, "sellingPrice", e.target.value)} className="h-7 text-xs text-right w-20" /></td>
                              <td className="px-3 py-2"><Input type="number" value={row.costPrice} onChange={(e) => updateRow(row.key, "costPrice", e.target.value)} className="h-7 text-xs text-right w-20" /></td>
                              <td className="px-3 py-2"><Input type="number" value={row.mrp} onChange={(e) => updateRow(row.key, "mrp", e.target.value)} className="h-7 text-xs text-right w-20" /></td>
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
              /* â”€â”€ Attribute builder â”€â”€ */
              <div className="space-y-4">
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
                        const hex = isColorVariantAttr(shopProfile, attr.name) ? getColorHex(v) : null;
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
                    {(findVariantAttrDef(shopProfile, attr.name)?.presets ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(findVariantAttrDef(shopProfile, attr.name)?.presets ?? []).map((preset) => (
                          <button key={preset} type="button" onClick={() => togglePreset(i, preset)}
                            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                              attr.values.includes(preset) ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                            }`}>
                            {preset}
                          </button>
                        ))}
                      </div>
                    )}
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
                    {shopProfile.variantAttributes.some((a) => a.presets.length > 0) && (
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5" onClick={autoGenerate}>
                      <Zap className="h-3 w-3" /> Fill {variantHint} presets
                    </Button>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    {allVariants.length} variants
                  </span>
                </div>
                {allVariants.length > 0 && (
                  <div className="rounded-lg border bg-muted/10 p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Preview ({allVariants.length})</p>
                      <Button variant="outline" size="sm" className="h-6 text-xs gap-1" onClick={openListView}>
                        <List className="h-3 w-3" /> Edit in List View
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-28 overflow-auto">
                      {allVariants.slice(0, 30).map((combo, idx) => {
                        const colorAttr = validAttrs.find((a) => isColorVariantAttr(shopProfile, a.name));
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
        {/* â•â• END LEFT COLUMN â•â• */}

        {/* â•â• RIGHT SIDEBAR â•â• */}
        <div className="space-y-4 lg:sticky lg:top-6">

          {/* Status */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="font-semibold text-sm border-b pb-2">Status & Settings</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Status</p>
                <p className="text-xs text-muted-foreground">{form.status === "ACTIVE" ? "Visible in POS & inventory" : "Hidden â€” save as draft"}</p>
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
              ["Selling",  form.sellingPrice ? `LKR ${parseFloat(form.sellingPrice).toLocaleString("en-LK")}` : <span className="text-muted-foreground italic">â€”</span>],
              ["Cost",     form.costPrice    ? `LKR ${parseFloat(form.costPrice).toLocaleString("en-LK")}`    : <span className="text-muted-foreground italic">â€”</span>],
              ["Variants", form.hasVariants  ? `${allVariants.length} (${variantHint})` : "Single SKU"],
              ...(showUnit ? [["Unit", form.unit || shopProfile.defaultUnit] as const] : []),
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
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />}
              Save Product
            </Button>
            <Button variant="outline" className="w-full" disabled={loading} onClick={() => submit("DRAFT")}>
              Save as Draft
            </Button>
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => router.push("/products")}>
              Cancel
            </Button>
          </div>

        </div>
        {/* â•â• END SIDEBAR â•â• */}

      </div>
      </div>
    </div>
  );
}

