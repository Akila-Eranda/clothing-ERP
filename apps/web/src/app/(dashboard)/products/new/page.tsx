"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, X, Loader2, Package,
  ArrowLeft,
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
import { useShopProfile, hasMultiUnit, hasExpiryTracking, hasBatchTracking, hasShopModule, useShopWorkspace, isTireShop } from "@/lib/use-shop-profile";
import { getShopProfile } from "@/lib/shop-profiles";
import { getWorkspace } from "@/lib/shop-workspace";
import {
  buildProductFormDefaults, variantTableColumns, variantVariantHint,
  applyVariantCombo, getProductFormCopy,
} from "@/lib/shop-vertical";
import { ProductBranchScopeSelect, type ProductBranchScope } from "@/components/products/product-branch-scope";
import { ProductImageUpload } from "@/components/products/product-image-upload";
import { useBranchStore } from "@/stores/branch-store";
import { buildProductTags } from "@/lib/product-tags";

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
interface Category { id: string; name: string; }
interface Brand    { id: string; name: string; }
interface SupplierOpt { id: string; name: string; }
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
  warrantyMonths: string;
  loadIndex: string;
  speedRating: string;
  tubeType: string;
  pattern: string;
  images: string[];
  branchScope: ProductBranchScope;
  branchId: string;
  supplierIds: string[];
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
    warrantyMonths: "",
    loadIndex: "",
    speedRating: "",
    tubeType: "",
    pattern: "",
    images: [],
    branchScope: "ALL",
    branchId: "",
    supplierIds: [],
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

// â”€â”€ Page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function AddProductPage() {
  const router = useRouter();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const shopProfile = useShopProfile();
  const { workspace } = useShopWorkspace();
  const formCopy = getProductFormCopy(shopProfile, workspace);
  const variantCols = variantTableColumns(shopProfile);
  const variantHint = variantVariantHint(shopProfile);
  const showUnit = hasMultiUnit(shopProfile);
  const showExpiry = hasExpiryTracking(shopProfile);
  const showBatch = hasBatchTracking(shopProfile);
  const showWarranty = hasShopModule(shopProfile, "warranty");
  const showTireMeta = isTireShop(shopProfile);
  const [form, setForm]             = useState<Form>(() => buildInitial(shopProfile.type));
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [suppliers, setSuppliers]   = useState<SupplierOpt[]>([]);
  const [supplierPick, setSupplierPick] = useState("");
  const [loading, setLoading]       = useState(false);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);

  useEffect(() => {
    setForm(buildInitial(shopProfile.type));
    setVariantRows([]);
  }, [shopProfile.type]);

  useEffect(() => {
    api.get<Category[]>("/categories").then((r) => setCategories(r.data ?? [])).catch(() => toast.error("Failed to load categories"));
    if (formCopy.showBrand) {
      api.get<Brand[]>("/brands").then((r) => setBrands(r.data ?? [])).catch(() => toast.error("Failed to load brands"));
    }
    api.get<{ data: SupplierOpt[] }>("/suppliers?limit=200")
      .then((r) => setSuppliers(r.data?.data ?? (r.data as unknown as SupplierOpt[]) ?? []))
      .catch(() => {});
  }, [formCopy.showBrand]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const setBranchScope = (scope: ProductBranchScope) => {
    setForm((p) => ({
      ...p,
      branchScope: scope,
      branchId: scope === "SINGLE" && !p.branchId ? (activeBranchId ?? "") : p.branchId,
    }));
  };

  const buildRows = (combos: string[][], attrs: VariantAttr[], prev: VariantRow[] = []): VariantRow[] => {
    const validAttrs = attrs.filter((a) => a.values.length > 0);
    return combos.map((combo) => {
      const key = combo.join("|");
      const old = prev.find((p) => p.key === key);
      return {
        key,
        sku: old?.sku ?? genSku(form.name, combo),
        name: combo.join(" / "),
        ...applyVariantCombo(shopProfile, validAttrs, combo),
        sellingPrice: old?.sellingPrice ?? form.sellingPrice,
        costPrice: old?.costPrice ?? form.costPrice,
        mrp: old?.mrp ?? form.mrp,
        active: old?.active ?? true,
      };
    });
  };

  const syncVariantRows = React.useCallback((attrs: VariantAttr[] = form.attributes) => {
    const combos = cartesian(attrs);
    if (!form.hasVariants || combos.length === 0) {
      setVariantRows([]);
      return;
    }
    setVariantRows((prev) => buildRows(combos, attrs, prev));
  }, [form.hasVariants, form.attributes, form.name, form.sellingPrice, form.costPrice, form.mrp, shopProfile]);

  // Keep rows when toggling on; don't wipe user edits while typing attributes elsewhere
  useEffect(() => {
    if (!form.hasVariants) setVariantRows([]);
  }, [form.hasVariants]);

  const sanitizePrice = (value: string) => {
    if (value === "" || value === ".") return value;
    const n = Number(value);
    if (Number.isNaN(n)) return "";
    return n < 0 ? "0" : value;
  };

  const updateRow = (key: string, field: keyof VariantRow, value: string | boolean) => {
    const next = (field === "sellingPrice" || field === "costPrice" || field === "mrp") && typeof value === "string"
      ? sanitizePrice(value)
      : value;
    setVariantRows((rows) => rows.map((r) => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: next } as VariantRow;
      // Keep variant name + primary attr field in sync when editing either
      if (field === "name" && typeof next === "string" && variantCols.length === 1) {
        updated[variantCols[0].field] = next;
      }
      if (
        typeof next === "string"
        && (field === "size" || field === "color" || field === "material" || field === "style")
        && variantCols.length === 1
        && variantCols[0].field === field
      ) {
        updated.name = next;
        updated.sku = genSku(form.name || "PRD", [next]);
      }
      return updated;
    }));
  };

  const addVariantRow = (preset?: string) => {
    const primary = variantCols[0];
    const label = (preset ?? "").trim() || `Variant ${variantRows.length + 1}`;
    const comboFields = applyVariantCombo(
      shopProfile,
      form.attributes.length ? form.attributes : [{ name: primary?.label ?? "Variant", values: [label], input: "" }],
      [label],
    );
    const row: VariantRow = {
      key: `${label}|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`,
      sku: genSku(form.name || "PRD", [label]),
      name: label,
      ...comboFields,
      sellingPrice: form.sellingPrice,
      costPrice: form.costPrice,
      mrp: form.mrp,
      active: true,
    };
    if (primary && !row[primary.field]) {
      row[primary.field] = label;
    }
    setVariantRows((r) => [...r, row]);
  };

  const submit = async (status: "ACTIVE" | "DRAFT") => {
    if (!form.name.trim()) { toast.error("Product name is required"); return; }

    const activeRows = form.hasVariants ? variantRows.filter((r) => r.active) : [];
    const pricesFromVariants = form.hasVariants && activeRows.length > 0;

    if (pricesFromVariants) {
      const missing = activeRows.find((r) => !r.sellingPrice?.trim());
      if (missing) {
        toast.error(`Set selling price on variant "${missing.name || missing.sku || "row"}"`);
        return;
      }
    } else if (!form.sellingPrice || !form.costPrice || !form.mrp) {
      toast.error("Selling price, cost price and MRP are required");
      return;
    }

    const derivedSelling = pricesFromVariants
      ? Math.min(...activeRows.map((r) => parseFloat(r.sellingPrice) || 0))
      : parseFloat(form.sellingPrice) || 0;
    const derivedCost = pricesFromVariants
      ? (parseFloat(form.costPrice)
        || Math.min(...activeRows.map((r) => parseFloat(r.costPrice) || 0).filter((n) => n > 0).concat([0])))
      : parseFloat(form.costPrice) || 0;
    const derivedMrp = pricesFromVariants
      ? (parseFloat(form.mrp)
        || Math.max(...activeRows.map((r) => parseFloat(r.mrp) || parseFloat(r.sellingPrice) || 0), 0))
      : parseFloat(form.mrp) || 0;

    setLoading(true);
    let variants: Record<string, unknown>[] = [];
    if (form.hasVariants) {
      if (variantRows.length > 0) {
        variants = activeRows.map((r) => ({
          sku: r.sku, name: r.name,
          size: r.size, color: r.color, material: r.material, style: r.style,
          sellingPrice: parseFloat(r.sellingPrice) || derivedSelling || 0,
          costPrice:    parseFloat(r.costPrice)    || derivedCost    || 0,
          mrp:          parseFloat(r.mrp)          || derivedMrp    || 0,
        }));
      } else {
        const validAttrs = form.attributes.filter((a) => a.values.length > 0);
        variants = (validAttrs.length > 0 ? cartesian(form.attributes) : []).map((combo) => ({
          sku: genSku(form.name, combo), name: combo.join(" / "),
          ...applyVariantCombo(shopProfile, validAttrs, combo),
          sellingPrice: derivedSelling,
          costPrice:    derivedCost,
          mrp:          derivedMrp,
        }));
      }
    }
    const extraTags = buildProductTags({
      tags: form.tags,
      tagInput: form.tagInput,
      unit: form.unit,
      expiryDate: form.expiryDate,
      batchNumber: form.batchNumber,
      showUnit,
      showExpiry,
      showBatch,
    });
    if (form.branchScope === "SINGLE" && !form.branchId) {
      toast.error("Select a branch or choose All Branches");
      return;
    }
    try {
      await api.post("/products", {
        name: form.name.trim(),
        description: form.description || undefined,
        shortDesc: form.shortDesc || undefined,
        categoryId: form.categoryId || undefined,
        brandId: formCopy.showBrand && form.brandId ? form.brandId : undefined,
        hsn: form.hsn || undefined,
        barcode: form.barcode || undefined,
        sellingPrice: parseFloat(form.sellingPrice) || derivedSelling,
        costPrice: parseFloat(form.costPrice) || derivedCost,
        mrp: parseFloat(form.mrp) || derivedMrp,
        taxRate: parseFloat(form.taxRate) || 0,
        status, tags: extraTags,
        hasVariants: form.hasVariants,
        trackInventory: form.trackInventory,
        ...(showWarranty && form.warrantyMonths.trim()
          ? { warrantyMonths: parseInt(form.warrantyMonths, 10) || 0 }
          : showWarranty ? { warrantyMonths: 0 } : {}),
        ...(showTireMeta && form.loadIndex.trim() ? { loadIndex: form.loadIndex.trim() } : {}),
        ...(showTireMeta && form.speedRating.trim() ? { speedRating: form.speedRating.trim() } : {}),
        ...(showTireMeta && form.tubeType ? { tubeType: form.tubeType } : {}),
        ...(showTireMeta && form.pattern.trim() ? { pattern: form.pattern.trim() } : {}),
        branchScope: form.trackInventory ? form.branchScope : undefined,
        branchId: form.trackInventory && form.branchScope === "SINGLE" ? form.branchId : undefined,
        images: form.images.length > 0 ? form.images : undefined,
        variants: variants.length > 0 ? variants : undefined,
        supplierIds: form.supplierIds.length > 0 ? form.supplierIds : undefined,
      });
      toast.success(`"${form.name}" ${status === "DRAFT" ? "saved as draft" : "created"}!`);
      router.push("/products");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create product");
    } finally { setLoading(false); }
  };

  // â”€â”€ Computed â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const allVariants = cartesian(form.attributes);
  const activeVariantCount = variantRows.filter((r) => r.active).length;
  // Always show profile attribute columns so Weight/etc. are editable in the table
  const editableAttrCols = variantCols;
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
                      <button type="button" onClick={() => set("tags", form.tags.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
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

          {/* Images */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="font-semibold text-base border-b pb-2">Product Images</h2>
            <p className="text-xs text-muted-foreground">The first image is shown as the cover in listings.</p>
            <ProductImageUpload
              images={form.images}
              onChange={(images) => set("images", images)}
              disabled={loading}
            />
          </div>

          {/* Pricing */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b pb-2 space-y-1">
              <h2 className="font-semibold text-base">Pricing <span className="text-xs font-normal text-muted-foreground">(LKR)</span></h2>
              {form.hasVariants && (
                <p className="text-xs text-muted-foreground">
                  Main price is hidden — set Selling / Cost / MRP on each variant row.
                </p>
              )}
            </div>
            {form.hasVariants ? (
              <div className="grid grid-cols-2 gap-4">
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
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Selling Price <span className="text-destructive">*</span>
                    </Label>
                    <Input type="number" min="0" placeholder="0.00" value={form.sellingPrice}
                      onChange={(e) => set("sellingPrice", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Cost Price <span className="text-destructive">*</span>
                    </Label>
                    <Input type="number" min="0" placeholder="0.00" value={form.costPrice}
                      onChange={(e) => set("costPrice", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      MRP <span className="text-destructive">*</span>
                    </Label>
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
              </>
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
                  Leave empty or 0 if this {showTireMeta ? "tyre" : "part"} has no warranty. Only products with months set can receive warranty claims.
                </p>
              </div>
            )}
            {showTireMeta && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Load Index</Label>
                  <Input placeholder="e.g. 91" value={form.loadIndex} onChange={(e) => set("loadIndex", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Speed Rating</Label>
                  <Input placeholder="e.g. H, V, W" value={form.speedRating} onChange={(e) => set("speedRating", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Tube / Tubeless</Label>
                  <Select value={form.tubeType} onValueChange={(v) => set("tubeType", v)}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="TUBELESS">Tubeless</SelectItem>
                      <SelectItem value="TUBE">Tube</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Pattern / Model</Label>
                  <Input placeholder="e.g. Primacy 4" value={form.pattern} onChange={(e) => set("pattern", e.target.value)} />
                </div>
              </div>
            )}
          </div>

          {/* Variants — editable list (type / select / edit everything here) */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between gap-3 border-b pb-3">
              <div className="min-w-0">
                <h2 className="font-semibold text-base">Variants</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formCopy.variantSectionHint} · edit SKU, name, {variantHint} & prices in the table
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">Enable</span>
                <Switch
                  checked={form.hasVariants}
                  onCheckedChange={(v) => {
                    set("hasVariants", v);
                    if (!v) {
                      setVariantRows([]);
                      return;
                    }
                    setVariantRows((rows) => {
                      if (rows.length > 0) return rows;
                      const label = "Variant 1";
                      const primary = variantCols[0];
                      return [{
                        key: `${label}|${Date.now()}`,
                        sku: genSku(form.name || "PRD", [label]),
                        name: label,
                        ...(primary ? { [primary.field]: label } : {}),
                        sellingPrice: form.sellingPrice,
                        costPrice: form.costPrice,
                        mrp: form.mrp,
                        active: true,
                      }];
                    });
                  }}
                />
              </div>
            </div>

            {!form.hasVariants ? (
              <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">
                Enable variants to add rows and set separate selling prices
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" className="h-8 text-xs gap-1.5" onClick={() => addVariantRow()}>
                      <Plus className="h-3.5 w-3.5" /> Add variant
                    </Button>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {activeVariantCount} / {variantRows.length} active
                  </Badge>
                </div>

                {variantRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed py-8 text-center space-y-3">
                    <p className="text-sm text-muted-foreground">No variants yet — add a row and enter prices</p>
                    <Button type="button" size="sm" className="gap-1.5" onClick={() => addVariantRow()}>
                      <Plus className="h-3.5 w-3.5" /> Add first variant
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/40 border-b">
                          <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2.5 text-left w-10">#</th>
                            <th className="px-3 py-2.5 text-left min-w-[130px]">SKU</th>
                            <th className="px-3 py-2.5 text-left min-w-[120px]">Variant</th>
                            {editableAttrCols.map((col) => (
                              <th key={col.field} className="px-3 py-2.5 text-left min-w-[110px]">{col.label}</th>
                            ))}
                            <th className="px-3 py-2.5 text-right min-w-[110px]">Selling</th>
                            <th className="px-3 py-2.5 text-right min-w-[110px]">Cost</th>
                            <th className="px-3 py-2.5 text-right min-w-[110px]">MRP</th>
                            <th className="px-3 py-2.5 text-center w-16">Active</th>
                            <th className="px-2 py-2.5 w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {variantRows.map((row, idx) => (
                            <tr key={row.key} className={!row.active ? "opacity-45 bg-muted/10" : "hover:bg-muted/5"}>
                              <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums">{idx + 1}</td>
                              <td className="px-3 py-2">
                                <Input
                                  value={row.sku}
                                  onChange={(e) => updateRow(row.key, "sku", e.target.value)}
                                  className="h-9 text-xs font-mono"
                                  placeholder="SKU"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  value={row.name}
                                  onChange={(e) => updateRow(row.key, "name", e.target.value)}
                                  className="h-9 text-sm font-medium"
                                  placeholder="e.g. 5kg"
                                />
                              </td>
                              {editableAttrCols.map((col) => (
                                <td key={col.field} className="px-3 py-2">
                                  <Input
                                    value={String(row[col.field] ?? "")}
                                    onChange={(e) => updateRow(row.key, col.field, e.target.value)}
                                    className="h-9 text-xs"
                                    placeholder={col.label}
                                  />
                                </td>
                              ))}
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={row.sellingPrice}
                                  onChange={(e) => updateRow(row.key, "sellingPrice", e.target.value)}
                                  className="h-9 text-sm text-right font-semibold tabular-nums"
                                  placeholder="0.00"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={row.costPrice}
                                  onChange={(e) => updateRow(row.key, "costPrice", e.target.value)}
                                  className="h-9 text-sm text-right tabular-nums"
                                  placeholder="0.00"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={row.mrp}
                                  onChange={(e) => updateRow(row.key, "mrp", e.target.value)}
                                  className="h-9 text-sm text-right tabular-nums"
                                  placeholder="0.00"
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <Switch checked={row.active} onCheckedChange={(v) => updateRow(row.key, "active", v)} />
                              </td>
                              <td className="px-2 py-2">
                                <button
                                  type="button"
                                  onClick={() => setVariantRows((r) => r.filter((x) => x.key !== row.key))}
                                  className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-2.5 border-t bg-muted/15 flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        Type or select values in any cell · same product barcode · different prices
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive gap-1"
                        onClick={() => setVariantRows([])}
                      >
                        <Trash2 className="h-3 w-3" /> Clear All
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Assign Suppliers */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm space-y-4">
            <div className="border-b pb-2 space-y-1">
              <h2 className="font-semibold text-base">Assign Suppliers</h2>
              <p className="text-xs text-muted-foreground">
                Link this product to one or more suppliers (used in PO / Quick GRN).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={supplierPick || undefined} onValueChange={setSupplierPick}>
                <SelectTrigger className="h-10 sm:flex-1">
                  <SelectValue placeholder="Select supplier…" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.length === 0
                    ? <SelectItem value="_none" disabled>No suppliers found</SelectItem>
                    : suppliers
                      .filter((s) => !form.supplierIds.includes(s.id))
                      .map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-1.5"
                disabled={!supplierPick}
                onClick={() => {
                  if (!supplierPick || form.supplierIds.includes(supplierPick)) return;
                  set("supplierIds", [...form.supplierIds, supplierPick]);
                  setSupplierPick("");
                }}
              >
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
            {form.supplierIds.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {form.supplierIds.map((sid) => (
                  <Badge key={sid} variant="secondary" className="gap-1 pl-2.5 pr-1 h-7">
                    {suppliers.find((s) => s.id === sid)?.name ?? sid}
                    <button
                      type="button"
                      className="p-0.5 rounded hover:bg-muted"
                      onClick={() => set("supplierIds", form.supplierIds.filter((x) => x !== sid))}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
                No suppliers assigned yet
              </p>
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
            {form.trackInventory && (
              <ProductBranchScopeSelect
                branchScope={form.branchScope}
                branchId={form.branchId}
                onScopeChange={setBranchScope}
                onBranchChange={(id) => set("branchId", id)}
              />
            )}
          </div>

          {/* Summary */}
          <div className="bg-background border rounded-2xl p-5 shadow-sm space-y-2 text-sm">
            <h3 className="font-semibold text-sm border-b pb-2">Summary</h3>
            {[
              ["Name",     form.name     || <span className="text-muted-foreground italic">Not set</span>],
              ["Category", categories.find((c) => c.id === form.categoryId)?.name || <span className="text-muted-foreground italic">None</span>],
              ["Selling",  form.hasVariants
                ? <span className="text-muted-foreground italic">Per variant</span>
                : form.sellingPrice ? `LKR ${parseFloat(form.sellingPrice).toLocaleString("en-LK")}` : <span className="text-muted-foreground italic">—</span>],
              ["Cost",     form.hasVariants
                ? <span className="text-muted-foreground italic">Per variant</span>
                : form.costPrice ? `LKR ${parseFloat(form.costPrice).toLocaleString("en-LK")}` : <span className="text-muted-foreground italic">—</span>],
              ["Variants", form.hasVariants  ? `${activeVariantCount || allVariants.length} (${variantHint})` : "Single SKU"],
              ...(form.trackInventory
                ? [["Branches", form.branchScope === "ALL" ? "All Branches" : "Single Branch"] as const]
                : []),
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

