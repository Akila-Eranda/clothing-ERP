"use client";

import React, { useState, useEffect } from "react";
import {
  Info, Layers, DollarSign, ImageIcon, Tag, Settings2,
  CheckCircle2, Plus, Trash2, X, Loader2, Sparkles, Package,
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
import { getStoredShopType, variantAttrsFromProfile, ShopType, getShopProfile, defaultHasVariants } from "@/lib/shop-profiles";
import { useShopProfile, hasMultiUnit, hasExpiryTracking, hasBatchTracking, useShopWorkspace } from "@/lib/use-shop-profile";
import {
  variantVariantHint, applyVariantCombo, getProductFormCopy,
} from "@/lib/shop-vertical";
import { getWorkspace } from "@/lib/shop-workspace";
import { ProductBranchScopeSelect, type ProductBranchScope } from "@/components/products/product-branch-scope";
import { useBranchStore } from "@/stores/branch-store";
import { buildProductTags, splitProductTags } from "@/lib/product-tags";
import { ProductImageUpload } from "@/components/products/product-image-upload";
import { genSku, uniqueSku, ensureUniqueVariantSkus } from "@/lib/product-sku";

// ── Types ─────────────────────────────────────────────────────────────────
interface Category { id: string; name: string; slug: string; }
interface Brand    { id: string; name: string; slug: string; }
interface SupplierOpt { id: string; name: string; }

export interface Product {
  id: string; name: string; slug: string; sku: string;
  barcode?: string | null; description?: string | null; shortDesc?: string | null;
  categoryId?: string | null; brandId?: string | null; hsn?: string | null;
  taxRate: number; costPrice: number; sellingPrice: number; mrp: number;
  status: string; images: string[]; tags: string[];
  hasVariants: boolean; trackInventory: boolean; isFeatured: boolean;
  seoTitle?: string | null; seoDescription?: string | null;
  createdAt: string; updatedAt: string;
  category?: { id: string; name: string; slug: string } | null;
  brand?:    { id: string; name: string; slug: string } | null;
  _count: { variants: number };
  variants?: {
    id: string;
    sku: string;
    name: string;
    barcode?: string | null;
    sellingPrice: number;
    costPrice: number;
    mrp: number;
    size?: string | null;
    color?: string | null;
    material?: string | null;
    style?: string | null;
    isActive: boolean;
  }[];
}

interface VariantAttr { name: string; values: string[]; input: string; }
interface VariantRow {
  key: string;
  sku: string;
  name: string;
  size?: string;
  color?: string;
  material?: string;
  style?: string;
  sellingPrice: string;
  costPrice: string;
  mrp: string;
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
  seoTitle: string; seoDescription: string;
  images: string[];
  branchScope: ProductBranchScope;
  branchId: string;
  supplierIds: string[];
}

const buildInitialForm = (): Form => {
  const profile = getShopProfile(getStoredShopType());
  const copy = getProductFormCopy(profile, getWorkspace(profile.type));
  return {
    name: "", barcode: "", description: "", shortDesc: "",
    categoryId: "", brandId: "", hsn: "", status: "ACTIVE",
    tags: [], tagInput: "",
    sellingPrice: "", costPrice: "", mrp: "", taxRate: copy.defaultTaxRate,
    hasVariants: defaultHasVariants(profile.type),
    attributes: variantAttrsFromProfile(profile.type),
    unit: profile.defaultUnit,
    expiryDate: "",
    batchNumber: "",
    trackInventory: true, seoTitle: "", seoDescription: "",
    images: [],
    branchScope: "ALL",
    branchId: "",
    supplierIds: [],
  };
};

const INITIAL: Form = buildInitialForm();

const TABS = [
  { id: "basic",      label: "Basic Information", icon: Info },
  { id: "variants",   label: "Variants",           icon: Layers },
  { id: "pricing",    label: "Pricing",            icon: DollarSign },
  { id: "images",     label: "Images",             icon: ImageIcon },
  { id: "seo",        label: "SEO & Tags",         icon: Tag },
  { id: "additional", label: "Additional",         icon: Settings2 },
] as const;
type TabId = typeof TABS[number]["id"];

// ── Component ─────────────────────────────────────────────────────────────
interface Props { open: boolean; onClose: () => void; onCreated?: () => void; editProduct?: Product; }

export function AddProductModal({ open, onClose, onCreated, editProduct }: Props) {
  const shopProfile = useShopProfile();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const { workspace } = useShopWorkspace();
  const formCopy = getProductFormCopy(shopProfile, workspace);
  const variantHint = variantVariantHint(shopProfile);
  const showUnit = hasMultiUnit(shopProfile);
  const showExpiry = hasExpiryTracking(shopProfile);
  const showBatch = hasBatchTracking(shopProfile);
  const [tab, setTab]               = useState<TabId>("basic");
  const [form, setForm]             = useState<Form>(INITIAL);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [suppliers, setSuppliers]   = useState<SupplierOpt[]>([]);
  const [loading, setLoading]       = useState(false);
  const [again, setAgain]           = useState(false);
  const [done, setDone]             = useState<Set<TabId>>(new Set());
  const [editSystemTags, setEditSystemTags] = useState<string[]>([]);
  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [supplierPick, setSupplierPick] = useState("");

  useEffect(() => {
    if (!open) return;
    api.get<Category[]>("/categories").then((r) => setCategories(r.data ?? [])).catch(() => toast.error("Failed to load categories"));
    api.get<{ data: SupplierOpt[] } | SupplierOpt[]>("/suppliers?limit=200")
      .then((r) => {
        const payload = r.data as { data?: SupplierOpt[] } | SupplierOpt[];
        setSuppliers(Array.isArray(payload) ? payload : (payload.data ?? []));
      })
      .catch(() => toast.error("Failed to load suppliers"));
    if (formCopy.showBrand) {
      api.get<Brand[]>("/brands").then((r) => setBrands(r.data ?? [])).catch(() => toast.error("Failed to load brands"));
    }
  }, [open, formCopy.showBrand]);

  useEffect(() => {
    if (editProduct) {
      const { userTags, systemTags } = splitProductTags(editProduct.tags ?? []);
      setEditSystemTags(systemTags);
      setForm({
        name: editProduct.name, barcode: editProduct.barcode ?? "",
        description: editProduct.description ?? "", shortDesc: editProduct.shortDesc ?? "",
        categoryId: editProduct.categoryId ?? "", brandId: editProduct.brandId ?? "",
        hsn: editProduct.hsn ?? "",
        status: editProduct.status === "ACTIVE" ? "ACTIVE" : "DRAFT",
        tags: userTags,
        tagInput: "",
        sellingPrice: editProduct.sellingPrice.toString(),
        costPrice: editProduct.costPrice.toString(),
        mrp: editProduct.mrp.toString(),
        taxRate: editProduct.taxRate.toString(),
        hasVariants: editProduct.hasVariants,
        attributes: variantAttrsFromProfile(shopProfile.type),
        unit: (editProduct.tags ?? []).find((t) => t.startsWith("unit:"))?.slice(5) ?? shopProfile.defaultUnit,
        expiryDate: (editProduct.tags ?? []).find((t) => t.startsWith("exp:"))?.slice(4) ?? "",
        batchNumber: (editProduct.tags ?? []).find((t) => t.startsWith("batch:"))?.slice(6) ?? "",
        trackInventory: editProduct.trackInventory,
        seoTitle: editProduct.seoTitle ?? "", seoDescription: editProduct.seoDescription ?? "",
        images: editProduct.images ?? [],
        branchScope: "ALL",
        branchId: "",
        supplierIds: [],
      });
    } else {
      setEditSystemTags([]);
      setForm(buildInitialForm());
    }
    setTab("basic"); setDone(new Set());
    setVariantRows([]);
    setSupplierPick("");
  }, [editProduct, open]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const setBranchScope = (scope: ProductBranchScope) => {
    setForm((p) => ({
      ...p,
      branchScope: scope,
      branchId: scope === "SINGLE" && !p.branchId ? (activeBranchId ?? "") : p.branchId,
    }));
  };
  const mark = (t: TabId) => setDone((p) => new Set([...p, t]));

  const addVariantRow = () => {
    const label = `Variant ${variantRows.length + 1}`;
    const primary = shopProfile.variantAttributes[0];
    const comboFields = applyVariantCombo(
      shopProfile,
      form.attributes.length ? form.attributes : [{ name: primary?.label ?? "Variant", values: [label], input: "" }],
      [label],
    );
    setVariantRows((r) => [...r, {
      key: `${label}|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`,
      sku: uniqueSku(genSku(form.name || "PRD", [label]), r.map((x) => x.sku)),
      name: label,
      ...comboFields,
      sellingPrice: form.sellingPrice,
      costPrice: form.costPrice,
      mrp: form.mrp,
      active: true,
    }]);
  };

  const updateRow = (key: string, field: keyof VariantRow, value: string | boolean) =>
    setVariantRows((rows) => rows.map((r) => r.key === key ? { ...r, [field]: value } : r));

  const handleClose = () => {
    setForm(buildInitialForm()); setTab("basic"); setDone(new Set()); onClose();
  };

  const submit = async (status: "ACTIVE" | "DRAFT") => {
    if (!form.name.trim()) { toast.error("Product name is required"); setTab("basic"); return; }

    const activeRows = form.hasVariants ? variantRows.filter((r) => r.active) : [];
    const pricesFromVariants = !editProduct && form.hasVariants && activeRows.length > 0;

    if (pricesFromVariants) {
      const missing = activeRows.find((r) => !r.sellingPrice?.trim());
      if (missing) {
        toast.error(`Set selling price on variant "${missing.name || missing.sku || "row"}"`);
        setTab("variants");
        return;
      }
    } else if (!editProduct && (!form.sellingPrice || !form.costPrice || !form.mrp)) {
      toast.error("Selling price, cost price, and MRP are required");
      setTab("pricing");
      return;
    }

    if (!editProduct && form.trackInventory && form.branchScope === "SINGLE" && !form.branchId) {
      toast.error("Select a branch or choose All Branches");
      setTab("additional");
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
    const variants = form.hasVariants
      ? ensureUniqueVariantSkus(
          variantRows
            .filter((r) => r.active)
            .map((r) => ({
              sku: r.sku,
              name: r.name,
              size: r.size,
              color: r.color,
              material: r.material,
              style: r.style,
              sellingPrice: parseFloat(r.sellingPrice) || derivedSelling || 0,
              costPrice: parseFloat(r.costPrice) || derivedCost || 0,
              mrp: parseFloat(r.mrp) || derivedMrp || 0,
              taxRate: parseFloat(form.taxRate) || 18,
            })),
        )
      : [];
    const extraTags = buildProductTags({
      tags: form.tags,
      tagInput: form.tagInput,
      unit: form.unit,
      expiryDate: form.expiryDate,
      batchNumber: form.batchNumber,
      showUnit,
      showExpiry,
      showBatch,
      preserveSystemTags: editProduct ? editSystemTags : undefined,
    });
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      shortDesc: form.shortDesc || undefined,
      categoryId: form.categoryId || undefined,
      brandId: formCopy.showBrand && form.brandId ? form.brandId : undefined,
      hsn: form.hsn || undefined,
      barcode: form.barcode || undefined,
      sellingPrice: form.sellingPrice ? parseFloat(form.sellingPrice) : (pricesFromVariants ? derivedSelling : undefined),
      costPrice: form.costPrice ? parseFloat(form.costPrice) : (pricesFromVariants ? derivedCost : undefined),
      mrp: form.mrp ? parseFloat(form.mrp) : (pricesFromVariants ? derivedMrp : undefined),
      taxRate: parseFloat(form.taxRate) || 18,
      status,
      tags: extraTags,
      hasVariants: form.hasVariants,
      trackInventory: form.trackInventory,
      branchScope: !editProduct && form.trackInventory ? form.branchScope : undefined,
      branchId: !editProduct && form.trackInventory && form.branchScope === "SINGLE" ? form.branchId : undefined,
      seoTitle: form.seoTitle || undefined,
      seoDescription: form.seoDescription || undefined,
      images: form.images.length > 0 ? form.images : undefined,
      variants: variants.length > 0 ? variants : undefined,
      supplierIds: form.supplierIds,
    };
    try {
      if (editProduct) {
        await api.put(`/products/${editProduct.id}`, payload);
        toast.success(`"${form.name}" updated successfully!`);
      } else {
        await api.post("/products", payload);
        toast.success(`"${form.name}" ${status === "DRAFT" ? "saved as draft" : "created"} successfully!`);
      }
      onCreated?.();
      if (!editProduct && again) { setForm(INITIAL); setTab("basic"); setDone(new Set()); }
      else handleClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? (editProduct ? "Failed to update" : "Failed to create product"));
    } finally { setLoading(false); }
  };

  if (!open) return null;

  // ── Tab renders ───────────────────────────────────────────────────────────
  const renderBasic = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Basic Information</h3>
        <p className="text-sm text-muted-foreground">Enter the basic details about your product</p>
      </div>
      {/* Row 1 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5 col-span-1">
          <Label className="text-xs font-semibold">{formCopy.nameLabel} <span className="text-destructive">*</span></Label>
          <Input placeholder={formCopy.namePlaceholder} value={form.name} maxLength={120}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => form.name && mark("basic")} />
          <p className="text-[10px] text-muted-foreground text-right">{form.name.length}/120</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">SKU <span className="text-muted-foreground font-normal">(auto-generated)</span></Label>
          <Input value={editProduct?.sku ?? ""} placeholder="Auto-generated on save" disabled className="bg-muted/50 cursor-not-allowed" readOnly />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Barcode</Label>
          <Input placeholder="Enter barcode" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} />
        </div>
      </div>
      {/* Row 2 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Category <span className="text-destructive">*</span></Label>
          <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categories.length === 0
                ? <SelectItem value="_none" disabled>No categories found</SelectItem>
                : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {formCopy.showBrand && !form.hasVariants && (
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Brand</Label>
          <Select
            value={form.brandId || undefined}
            onValueChange={(v) => set("brandId", v === "_none" ? "" : v)}
          >
            <SelectTrigger><SelectValue placeholder="Select brand" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none">No brand</SelectItem>
              {brands.length === 0
                ? <SelectItem value="_empty" disabled>No brands yet — add under Brands</SelectItem>
                : brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        )}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">HSN / SAC Code</Label>
          <Input placeholder="Enter HSN/SAC code" value={form.hsn} onChange={(e) => set("hsn", e.target.value)} />
        </div>
      </div>
      <div className="rounded-xl border p-4 bg-card space-y-3">
        <div>
          <h4 className="font-semibold text-sm">Assign Suppliers</h4>
          <p className="text-xs text-muted-foreground mt-0.5">Assign this product to one or more suppliers.</p>
        </div>
        <div className="flex gap-2">
          <Select value={supplierPick} onValueChange={setSupplierPick}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select supplier" />
            </SelectTrigger>
            <SelectContent>
              {suppliers.length === 0
                ? <SelectItem value="_none" disabled>No suppliers found</SelectItem>
                : suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (!supplierPick || form.supplierIds.includes(supplierPick)) return;
              set("supplierIds", [...form.supplierIds, supplierPick]);
              setSupplierPick("");
            }}
          >
            Add
          </Button>
        </div>
        {form.supplierIds.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {form.supplierIds.map((sid) => (
              <Badge key={sid} variant="secondary" className="gap-1 pl-2 pr-1 h-6">
                {suppliers.find((s) => s.id === sid)?.name ?? sid}
                <button type="button" onClick={() => set("supplierIds", form.supplierIds.filter((x) => x !== sid))}>
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}
      </div>
      {showUnit && (
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Unit of Measure</Label>
            <Select value={form.unit} onValueChange={(v) => set("unit", v)}>
              <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
              <SelectContent>
                {shopProfile.units.map((u) => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
        </div>
      )}
      {!showUnit && (showExpiry || showBatch) && (
        <div className="grid grid-cols-2 gap-4">
          {showExpiry && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={(e) => set("expiryDate", e.target.value)} />
            </div>
          )}
          {showBatch && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Batch Number</Label>
              <Input placeholder="e.g. BATCH-2026-001" value={form.batchNumber} onChange={(e) => set("batchNumber", e.target.value)} />
            </div>
          )}
        </div>
      )}
      {/* Status */}
      <div className="flex items-center gap-3">
        <Label className="text-xs font-semibold">Status</Label>
        <div className="flex items-center gap-2">
          <Switch checked={form.status === "ACTIVE"} onCheckedChange={(v) => set("status", v ? "ACTIVE" : "DRAFT")} />
          <span className="text-sm font-medium">{form.status === "ACTIVE" ? "Active" : "Draft"}</span>
        </div>
      </div>
      {/* Description */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Description</Label>
        <Textarea placeholder="Enter product description..." rows={5} maxLength={2000}
          value={form.description} onChange={(e) => set("description", e.target.value)} />
        <p className="text-[10px] text-muted-foreground text-right">{form.description.length}/2000</p>
      </div>
      {/* Short description */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Short Description</Label>
        <Input placeholder="Brief product summary" value={form.shortDesc} onChange={(e) => set("shortDesc", e.target.value)} />
      </div>
    </div>
  );

  // ── Color swatch map (tags UI) ──────────────────────────────────────────
  const renderVariants = () => {
    const activeCount = variantRows.filter((r) => r.active).length;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-bold">Variants</h3>
            <p className="text-sm text-muted-foreground">Add rows and set selling price for each variant</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Manage Variants</span>
            <Switch
              checked={form.hasVariants}
              onCheckedChange={(v) => {
                set("hasVariants", v);
                if (!v) setVariantRows([]);
              }}
            />
          </div>
        </div>

        {form.hasVariants ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" className="h-8 text-xs gap-1.5" onClick={addVariantRow}>
                  <Plus className="h-3.5 w-3.5" /> Add variant
                </Button>
              </div>
              <Badge variant="secondary" className="text-[10px]">
                {activeCount} / {variantRows.length} active
              </Badge>
            </div>

            {variantRows.length === 0 ? (
              <div className="rounded-xl border border-dashed py-10 text-center space-y-3">
                <p className="text-sm text-muted-foreground">No variants yet — add a row and enter prices</p>
                <Button type="button" size="sm" className="gap-1.5" onClick={addVariantRow}>
                  <Plus className="h-3.5 w-3.5" /> Add first variant
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 border-b text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2.5 text-left w-8">#</th>
                        <th className="px-3 py-2.5 text-left">SKU</th>
                        <th className="px-3 py-2.5 text-left">Variant</th>
                        <th className="px-3 py-2.5 text-right">Selling (LKR)</th>
                        <th className="px-3 py-2.5 text-right">Cost (LKR)</th>
                        <th className="px-3 py-2.5 text-right">MRP (LKR)</th>
                        <th className="px-3 py-2.5 text-center">Active</th>
                        <th className="px-2 py-2.5 w-6" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {variantRows.map((row, idx) => (
                        <tr key={row.key} className={`hover:bg-muted/10 ${!row.active ? "opacity-40" : ""}`}>
                          <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <Input value={row.sku} onChange={(e) => updateRow(row.key, "sku", e.target.value)} className="h-8 text-xs font-mono w-28" />
                          </td>
                          <td className="px-3 py-2">
                            <Input value={row.name} onChange={(e) => updateRow(row.key, "name", e.target.value)} className="h-8 text-xs font-medium min-w-[120px]" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={row.sellingPrice}
                              onChange={(e) => {
                                const v = e.target.value;
                                const n = Number(v);
                                updateRow(row.key, "sellingPrice", v !== "" && !Number.isNaN(n) && n < 0 ? "0" : v);
                              }}
                              className="h-8 text-xs text-right w-24 font-semibold" placeholder="0.00" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={row.costPrice}
                              onChange={(e) => {
                                const v = e.target.value;
                                const n = Number(v);
                                updateRow(row.key, "costPrice", v !== "" && !Number.isNaN(n) && n < 0 ? "0" : v);
                              }}
                              className="h-8 text-xs text-right w-24" placeholder="0.00" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min="0" step="0.01" value={row.mrp}
                              onChange={(e) => {
                                const v = e.target.value;
                                const n = Number(v);
                                updateRow(row.key, "mrp", v !== "" && !Number.isNaN(n) && n < 0 ? "0" : v);
                              }}
                              className="h-8 text-xs text-right w-24" placeholder="0.00" />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Switch checked={row.active} onCheckedChange={(v) => updateRow(row.key, "active", v)} />
                          </td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => setVariantRows((r) => r.filter((x) => x.key !== row.key))}
                              className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Layers className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">Variants disabled</p>
            <p className="text-sm mt-1">Toggle &quot;Manage Variants&quot; above to add {variantHint}</p>
          </div>
        )}
      </div>
    );
  };

  const renderPricing = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Pricing</h3>
        <p className="text-sm text-muted-foreground">
          {form.hasVariants
            ? "Main price is hidden — set Selling / Cost / MRP on each variant row."
            : "Set selling price, cost price, and tax rates"}
        </p>
      </div>
      {form.hasVariants ? (
        <div className="rounded-xl border p-5 space-y-4 bg-card max-w-sm">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Tax Rate (%)</Label>
            <Select value={form.taxRate} onValueChange={(v) => set("taxRate", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["0", "5", "12", "18", "28"].map((t) => <SelectItem key={t} value={t}>{t}%</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Open the Variants tab to enter prices per row.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          <div className="rounded-xl border p-5 space-y-4 bg-card">
            <h4 className="font-semibold text-sm">Price Details</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Selling Price (LKR) <span className="text-destructive">*</span>
              </Label>
              <Input type="number" min="0" placeholder="0.00" value={form.sellingPrice}
                onChange={(e) => set("sellingPrice", e.target.value)} onBlur={() => form.sellingPrice && mark("pricing")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                Cost Price (LKR) <span className="text-destructive">*</span>
              </Label>
              <Input type="number" min="0" placeholder="0.00" value={form.costPrice}
                onChange={(e) => set("costPrice", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">
                MRP (LKR) <span className="text-destructive">*</span>
              </Label>
              <Input type="number" min="0" placeholder="0.00" value={form.mrp}
                onChange={(e) => set("mrp", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tax Rate (%)</Label>
              <Select value={form.taxRate} onValueChange={(v) => set("taxRate", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["0", "5", "12", "18", "28"].map((t) => <SelectItem key={t} value={t}>{t}%</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-xl border p-5 bg-card space-y-4">
            <h4 className="font-semibold text-sm">Margin Preview</h4>
            {form.sellingPrice && form.costPrice ? (
              <div className="space-y-3">
                {[
                  { label: "Selling Price", val: `LKR ${parseFloat(form.sellingPrice || "0").toFixed(2)}`, bold: true },
                  { label: "Cost Price",    val: `LKR ${parseFloat(form.costPrice    || "0").toFixed(2)}`, bold: false },
                  { label: "Gross Margin",  val: `LKR ${(parseFloat(form.sellingPrice || "0") - parseFloat(form.costPrice || "0")).toFixed(2)}`, bold: true, color: "text-emerald-500" },
                  { label: "Margin %",      val: `${((parseFloat(form.sellingPrice || "0") - parseFloat(form.costPrice || "0")) / Math.max(parseFloat(form.sellingPrice || "1"), 0.01) * 100).toFixed(1)}%`, bold: true, color: "text-emerald-500" },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={`${r.bold ? "font-bold" : ""} ${r.color ?? ""}`}>{r.val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Enter selling & cost price to see margin</p>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderImages = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Images</h3>
        <p className="text-sm text-muted-foreground">Upload product photos. The first image is used as the cover.</p>
      </div>
      <ProductImageUpload
        images={form.images}
        onChange={(images) => set("images", images)}
        disabled={loading}
      />
    </div>
  );

  const renderSeo = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">SEO & Tags</h3>
        <p className="text-sm text-muted-foreground">Optimize product for search engines and add tags</p>
      </div>
      <div className="rounded-xl border p-5 bg-card space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">SEO Title</Label>
          <Input placeholder="SEO title (defaults to product name)" value={form.seoTitle} onChange={(e) => set("seoTitle", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">SEO Description</Label>
          <Textarea placeholder="SEO meta description..." rows={3} value={form.seoDescription} onChange={(e) => set("seoDescription", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Tags</Label>
          <div className="flex flex-wrap gap-1.5 items-center border rounded-lg p-2 min-h-[44px] bg-background cursor-text"
            onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
            {form.tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 h-6">
                {tag}
                <button type="button" onClick={() => set("tags", form.tags.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
              </Badge>
            ))}
            <input className="flex-1 min-w-[140px] outline-none text-sm bg-transparent placeholder:text-muted-foreground"
              placeholder="Add tag, press Enter..."
              value={form.tagInput}
              onChange={(e) => set("tagInput", e.target.value)}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === ",") && form.tagInput.trim()) {
                  e.preventDefault();
                  const t = form.tagInput.trim().replace(/,$/, "");
                  if (t && !form.tags.includes(t)) set("tags", [...form.tags, t]);
                  set("tagInput", "");
                }
              }}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">Press Enter or comma to add — unsaved text in the box is included when you Save</p>
        </div>
      </div>
    </div>
  );

  const renderAdditional = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Additional Settings</h3>
        <p className="text-sm text-muted-foreground">Extra product configuration options</p>
      </div>
      <div className="rounded-xl border p-5 bg-card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Has Variants</p>
            <p className="text-xs text-muted-foreground">Product has multiple variants ({variantHint})</p>
          </div>
          <Switch checked={form.hasVariants} onCheckedChange={(v) => set("hasVariants", v)} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Track Inventory</p>
            <p className="text-xs text-muted-foreground">Create stock records when saving</p>
          </div>
          <Switch checked={form.trackInventory} onCheckedChange={(v) => set("trackInventory", v)} />
        </div>
        {!editProduct && form.trackInventory && (
          <ProductBranchScopeSelect
            branchScope={form.branchScope}
            branchId={form.branchId}
            onScopeChange={setBranchScope}
            onBranchChange={(id) => set("branchId", id)}
          />
        )}
      </div>
    </div>
  );

  const content: Record<TabId, () => React.ReactNode> = {
    basic: renderBasic, variants: renderVariants, pricing: renderPricing,
    images: renderImages, seo: renderSeo, additional: renderAdditional,
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col overflow-hidden border">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold">{editProduct ? `Edit ${formCopy.nameLabel.replace(/ Name$/, "")}` : formCopy.pageTitle}</h2>
            <p className="text-xs text-muted-foreground">{editProduct ? `Editing: ${editProduct.name}` : formCopy.productTip}</p>
          </div>
          <button onClick={handleClose} className="ml-auto p-2 rounded-lg hover:bg-muted transition-colors"><X className="h-4 w-4" /></button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-56 border-r bg-muted/20 p-3 flex flex-col gap-0.5 shrink-0">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              const isDone = done.has(t.id);
              return (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}>
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left">{t.label}</span>
                  {isDone && !active && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                </button>
              );
            })}
            {/* AI Panel */}
            <div className="mt-auto pt-3">
              <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-xs font-semibold text-primary">AI Product Assistant</p>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">Get AI suggestions for product title, description, tags and more.</p>
                <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1">
                  <Sparkles className="h-3 w-3" /> Generate with AI
                </Button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">{content[tab]()}</div>
        </div>

        {/* Footer */}
        <div className="flex items-center px-6 py-4 border-t bg-background/80 shrink-0 gap-3">
          {!editProduct && (
            <>
              <Switch checked={again} onCheckedChange={setAgain} id="again" />
              <Label htmlFor="again" className="text-sm cursor-pointer select-none">Create another product</Label>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
            <Button variant="outline" onClick={() => submit("DRAFT")} disabled={loading} className="gap-1.5">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save as Draft
            </Button>
            <Button onClick={() => submit("ACTIVE")} disabled={loading} className="gap-1.5 bg-primary hover:bg-primary/90">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
              Save Product
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
