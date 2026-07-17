"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Loader2, Package, ArrowLeft, Search, Check,
  Scale, Boxes, Package2, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopProfile } from "@/lib/use-shop-profile";
import { ProductBranchScopeSelect, type ProductBranchScope } from "@/components/products/product-branch-scope";
import { ProductImageUpload } from "@/components/products/product-image-upload";
import { useBranchStore } from "@/stores/branch-store";
import {
  buildProductTags,
} from "@/lib/product-tags";
import { genSku, uniqueSku, ensureUniqueVariantSkus } from "@/lib/product-sku";
import { cn } from "@/lib/utils";

interface Category {
  id: string;
  name: string;
  children?: { id: string; name: string }[];
}
interface Brand { id: string; name: string; }
interface SupplierOpt { id: string; name: string; }
interface WarehouseOpt { id: string; name: string; }

interface VariantRow {
  key: string;
  name: string;
  size: string;
  sku: string;
  barcode: string;
  sellingPrice: string;
  costPrice: string;
  mrp: string;
  active: boolean;
}

interface SupplierRow {
  supplierId: string;
  buyingPrice: string;
  leadTime: string;
  moq: string;
  active: boolean;
  isDefault: boolean;
}

type GroceryProductType = "STANDARD" | "VARIANT" | "WEIGHTED";
type BarcodeMode = "SHARED" | "UNIQUE";
type SaveMode = "ACTIVE" | "DRAFT" | "ADD_ANOTHER";

const PRODUCT_TYPES: {
  id: GroceryProductType;
  title: string;
  hint: string;
  icon: React.ElementType;
}[] = [
  {
    id: "STANDARD",
    title: "Standard Product",
    hint: "Coca Cola, Soap, Chocolate — one barcode, no variants",
    icon: Package2,
  },
  {
    id: "VARIANT",
    title: "Variant Product",
    hint: "Rice, Sugar, Tea — pack sizes like 1kg / 5kg / 10kg",
    icon: Boxes,
  },
  {
    id: "WEIGHTED",
    title: "Weighted Product",
    hint: "Loose rice, dhal — sold by weight, price per kg",
    icon: Scale,
  },
];

function sanitizePrice(value: string) {
  if (value === "" || value === ".") return value;
  const n = Number(value);
  if (Number.isNaN(n)) return "";
  return n < 0 ? "0" : value;
}

function Section({
  step,
  title,
  subtitle,
  children,
  action,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-xl ring-1 ring-slate-900/[0.05]  overflow-hidden">
      <div className="px-5 py-3.5 border-b flex items-center justify-between gap-3 bg-background">
        <div className="flex items-start gap-3 min-w-0">
          {step ? (
            <span className="mt-0.5 h-6 min-w-6 px-1.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold tabular-nums flex items-center justify-center shrink-0">
              {step}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground tracking-tight">{title}</h2>
            {subtitle ? <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-destructive ml-0.5">*</span> : null}
      </Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground/80 leading-snug">{hint}</p> : null}
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  icon: Icon,
  title,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  icon?: React.ElementType;
  title: string;
  hint: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border p-3.5 text-left transition-all h-full",
        selected
          ? "border-primary bg-primary/10  "
          : "border-border bg-card hover:border-primary/40 hover:bg-background",
      )}
    >
      <div className="flex items-start gap-3">
        {Icon ? (
          <span
            className={cn(
              "h-9 w-9 rounded-lg flex items-center justify-center shrink-0 border",
              selected
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-muted/50 text-muted-foreground border-transparent",
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <span
              className={cn(
                "h-4 w-4 rounded-full border-2 shrink-0",
                selected ? "border-primary bg-primary" : "border-muted-foreground/40",
              )}
            />
          </div>
          <p className="text-[11px] mt-1 leading-snug text-muted-foreground">{hint}</p>
        </div>
      </div>
    </button>
  );
}

function SidebarCard({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card rounded-xl ring-1 ring-slate-900/[0.05]   overflow-hidden", className)}>
      {title ? (
        <div className="px-4 py-3 border-b bg-background">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
      ) : null}
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}

function SearchableBrandSelect({
  brands,
  value,
  onChange,
  onCreated,
}: {
  brands: Brand[];
  value: string;
  onChange: (id: string) => void;
  onCreated: (b: Brand) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const selected = brands.find((b) => b.id === value);
  const filtered = brands.filter((b) => b.name.toLowerCase().includes(q.trim().toLowerCase()));
  const exact = brands.some((b) => b.name.toLowerCase() === q.trim().toLowerCase());

  const createBrand = async () => {
    const name = q.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await api.post<Brand>("/brands", { name });
      const created = res.data;
      onCreated(created);
      onChange(created.id);
      setQ("");
      setOpen(false);
      toast.success(`Brand "${name}" created`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create brand");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full h-10 px-3 rounded-lg border bg-background text-sm text-left flex items-center justify-between gap-2 hover:border-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <span className={selected ? "text-foreground truncate" : "text-muted-foreground"}>
          {selected?.name ?? "Search or create brand…"}
        </span>
        <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full rounded-xl border bg-background shadow-lg overflow-hidden">
            <div className="p-2 border-b">
              <Input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Type brand name…"
                className="h-9"
              />
            </div>
            <div className="max-h-48 overflow-y-auto py-1">
              {filtered.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className="w-full px-3 py-2 text-sm text-left hover:bg-muted/50 flex items-center justify-between gap-2"
                  onClick={() => {
                    onChange(b.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span>{b.name}</span>
                  {b.id === value ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : null}
                </button>
              ))}
              {filtered.length === 0 && !q.trim() ? (
                <p className="px-3 py-3 text-xs text-muted-foreground">No brands yet</p>
              ) : null}
            </div>
            {q.trim() && !exact ? (
              <button
                type="button"
                disabled={creating}
                onClick={createBrand}
                className="w-full border-t px-3 py-2.5 text-sm text-left text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center gap-2 font-medium"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create brand “{q.trim()}”
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

export function GroceryProductForm() {
  const router = useRouter();
  const shopProfile = useShopProfile();
  const activeBranchId = useBranchStore((s) => s.activeBranchId);

  const [name, setName] = useState("");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subCategoryId, setSubCategoryId] = useState("");
  const [productType, setProductType] = useState<GroceryProductType>("STANDARD");
  const [unit, setUnit] = useState(shopProfile.defaultUnit || "pcs");
  const [barcode, setBarcode] = useState("");
  const [skuHint, setSkuHint] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>("UNIQUE");

  const [sellingPrice, setSellingPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [mrp, setMrp] = useState("");
  const [taxRate, setTaxRate] = useState("0");

  const [openingStock, setOpeningStock] = useState("");
  const [reorderLevel, setReorderLevel] = useState("");
  const [minStock, setMinStock] = useState("");
  const [maxStock, setMaxStock] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [trackInventory, setTrackInventory] = useState(true);
  const [allowNegative, setAllowNegative] = useState(false);
  const [allowDecimalSelling, setAllowDecimalSelling] = useState(true);
  const [weightScaleReady, setWeightScaleReady] = useState(true);
  const [batchNumber, setBatchNumber] = useState("");
  const [branchScope, setBranchScope] = useState<ProductBranchScope>("ALL");
  const [branchId, setBranchId] = useState("");
  const [statusActive, setStatusActive] = useState(true);

  const [variantRows, setVariantRows] = useState<VariantRow[]>([]);
  const [supplierRows, setSupplierRows] = useState<SupplierRow[]>([]);
  const [supplierPick, setSupplierPick] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOpt[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseOpt[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.get<Category[]>("/categories").then((r) => setCategories(r.data ?? [])).catch(() => toast.error("Failed to load categories"));
    api.get<Brand[]>("/brands").then((r) => setBrands(r.data ?? [])).catch(() => toast.error("Failed to load brands"));
    api.get<{ data: SupplierOpt[] }>("/suppliers?limit=200")
      .then((r) => setSuppliers(r.data?.data ?? (r.data as unknown as SupplierOpt[]) ?? []))
      .catch(() => {});
    api.get<WarehouseOpt[]>("/warehouses")
      .then((r) => setWarehouses((r.data ?? []).map((w) => ({ id: w.id, name: w.name }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setUnit(shopProfile.defaultUnit || "pcs");
  }, [shopProfile.defaultUnit]);

  const parentCategory = categories.find((c) => c.id === categoryId);
  const subCategories = parentCategory?.children ?? [];

  const resolvedCategoryId = subCategoryId || categoryId;

  const hasVariants = productType === "VARIANT";
  const isWeighted = productType === "WEIGHTED";

  useEffect(() => {
    if (productType === "WEIGHTED") {
      setUnit("kg");
      setAllowDecimalSelling(true);
      setWeightScaleReady(true);
      setVariantRows([]);
    }
    if (productType === "STANDARD") {
      setVariantRows([]);
    }
    if (productType === "VARIANT" && variantRows.length === 0) {
      const presets = ["1kg", "5kg", "10kg"];
      const used: string[] = [];
      setVariantRows(
        presets.map((p, i) => {
          const sku = uniqueSku(genSku(name || "PRD", [p]), used);
          used.push(sku);
          return {
            key: `${p}|${Date.now()}|${i}`,
            name: p,
            size: p,
            sku,
            barcode: "",
            sellingPrice,
            costPrice,
            mrp,
            active: true,
          };
        }),
      );
    }
    // intentionally only when product type changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productType]);

  // Shared barcode: mirror product barcode onto all variants
  useEffect(() => {
    if (!hasVariants || barcodeMode !== "SHARED") return;
    setVariantRows((rows) => rows.map((r) => ({ ...r, barcode })));
  }, [barcode, barcodeMode, hasVariants]);

  const profitMargin = useMemo(() => {
    const sp = parseFloat(sellingPrice || "0");
    const cp = parseFloat(costPrice || "0");
    if (!(sp > 0)) return { amount: 0, pct: "0.0" };
    return { amount: sp - cp, pct: (((sp - cp) / sp) * 100).toFixed(1) };
  }, [sellingPrice, costPrice]);

  const activeVariants = variantRows.filter((r) => r.active);
  const brandName = brands.find((b) => b.id === brandId)?.name;
  const categoryName = categories.find((c) => c.id === categoryId)?.name;
  const subCategoryName = subCategories.find((c) => c.id === subCategoryId)?.name;

  const updateVariant = (key: string, field: keyof VariantRow, value: string | boolean) => {
    const next =
      (field === "sellingPrice" || field === "costPrice" || field === "mrp") && typeof value === "string"
        ? sanitizePrice(value)
        : value;
    setVariantRows((rows) =>
      rows.map((r) => {
        if (r.key !== key) return r;
        const updated = { ...r, [field]: next } as VariantRow;
        // Keep weight/size in sync when editing size; name stays independent unless empty
        if (field === "size" && typeof next === "string") {
          updated.size = next;
          if (!r.name.trim() || r.name === r.size) updated.name = next;
        }
        return updated;
      }),
    );
  };

  const addVariantRow = (preset?: string) => {
    const label = (preset ?? "").trim() || `Variant ${variantRows.length + 1}`;
    const used = variantRows.map((r) => r.sku);
    const row: VariantRow = {
      key: `${label}|${Date.now()}|${Math.random().toString(36).slice(2, 7)}`,
      name: label,
      size: label,
      sku: uniqueSku(genSku(name || "PRD", [label]), used),
      barcode: barcodeMode === "SHARED" ? barcode : "",
      sellingPrice,
      costPrice,
      mrp,
      active: true,
    };
    setVariantRows((r) => [...r, row]);
  };

  const addSupplier = () => {
    if (!supplierPick || supplierRows.some((s) => s.supplierId === supplierPick)) return;
    setSupplierRows((rows) => [
      ...rows,
      {
        supplierId: supplierPick,
        buyingPrice: costPrice,
        leadTime: "",
        moq: "",
        active: true,
        isDefault: rows.length === 0,
      },
    ]);
    setSupplierPick("");
    setSupplierSearch("");
  };

  const resetForm = useCallback(() => {
    setName("");
    setBrandId("");
    setCategoryId("");
    setSubCategoryId("");
    setProductType("STANDARD");
    setUnit(shopProfile.defaultUnit || "pcs");
    setBarcode("");
    setSkuHint("");
    setDescription("");
    setImages([]);
    setBarcodeMode("UNIQUE");
    setSellingPrice("");
    setCostPrice("");
    setWholesalePrice("");
    setMrp("");
    setTaxRate("0");
    setOpeningStock("");
    setReorderLevel("");
    setMinStock("");
    setMaxStock("");
    setWarehouseId("");
    setTrackInventory(true);
    setAllowNegative(false);
    setAllowDecimalSelling(true);
    setWeightScaleReady(true);
    setBatchNumber("");
    setBranchScope("ALL");
    setBranchId("");
    setStatusActive(true);
    setVariantRows([]);
    setSupplierRows([]);
  }, [shopProfile.defaultUnit]);

  const validate = (): boolean => {
    if (!name.trim()) {
      toast.error("Product name is required");
      return false;
    }
    if (!brandId) {
      toast.error("Brand is required");
      return false;
    }
    if (!resolvedCategoryId) {
      toast.error("Category is required");
      return false;
    }
    if (!unit) {
      toast.error("Unit is required");
      return false;
    }
    if (trackInventory && branchScope === "SINGLE" && !branchId) {
      toast.error("Select a branch or choose All Branches");
      return false;
    }

    if (hasVariants) {
      if (activeVariants.length === 0) {
        toast.error("Add at least one active variant");
        return false;
      }
      const missingPrice = activeVariants.find((r) => !r.sellingPrice?.trim());
      if (missingPrice) {
        toast.error(`Set selling price on variant "${missingPrice.name || missingPrice.sku}"`);
        return false;
      }
      if (barcodeMode === "UNIQUE") {
        const codes = activeVariants.map((r) => r.barcode.trim()).filter(Boolean);
        const set = new Set(codes);
        if (codes.length !== set.size) {
          toast.error("Each variant barcode must be unique in Unique Barcode mode");
          return false;
        }
      }
      if (barcodeMode === "SHARED" && !barcode.trim()) {
        toast.error("Enter a shared barcode for all variants");
        return false;
      }
    } else if (!isWeighted) {
      if (!sellingPrice || !costPrice || !mrp) {
        toast.error("Buying price, selling price and MRP are required");
        return false;
      }
    } else {
      if (!sellingPrice) {
        toast.error("Price per kg (selling) is required");
        return false;
      }
      if (!costPrice) {
        toast.error("Buying price is required");
        return false;
      }
    }
    return true;
  };

  const submit = async (mode: SaveMode) => {
    if (!validate()) return;
    setLoading(true);

    const status = mode === "DRAFT" || !statusActive ? "DRAFT" : "ACTIVE";
    const pricesFromVariants = hasVariants && activeVariants.length > 0;

    const derivedSelling = pricesFromVariants
      ? Math.min(...activeVariants.map((r) => parseFloat(r.sellingPrice) || 0))
      : parseFloat(sellingPrice) || 0;
    const derivedCost = pricesFromVariants
      ? parseFloat(costPrice) ||
        Math.min(...activeVariants.map((r) => parseFloat(r.costPrice) || 0).filter((n) => n > 0).concat([0]))
      : parseFloat(costPrice) || 0;
    const derivedMrp = pricesFromVariants
      ? parseFloat(mrp) ||
        Math.max(...activeVariants.map((r) => parseFloat(r.mrp) || parseFloat(r.sellingPrice) || 0), 0)
      : parseFloat(mrp) || derivedSelling;

    let variants: Record<string, unknown>[] = [];
    if (hasVariants) {
      const shared = barcodeMode === "SHARED" ? barcode.trim() : undefined;
      variants = ensureUniqueVariantSkus(
        activeVariants.map((r) => ({
          sku: r.sku,
          name: r.name || r.size || "Variant",
          size: r.size || undefined,
          sellingPrice: parseFloat(r.sellingPrice) || derivedSelling || 0,
          costPrice: parseFloat(r.costPrice) || derivedCost || 0,
          mrp: parseFloat(r.mrp) || derivedMrp || 0,
          barcode:
            barcodeMode === "SHARED"
              ? shared
              : r.barcode.trim() || undefined,
        })),
      );
    }

    const tags = buildProductTags({
      tags: [],
      unit,
      batchNumber,
      showUnit: false, // unit saved on product.unit column
      showExpiry: false,
      showBatch: !!batchNumber,
    });

    const numOrUndef = (raw: string) => {
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : undefined;
    };
    const intOrUndef = (raw: string) => {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) ? n : undefined;
    };

    const activeSupplierRows = supplierRows.filter((s) => s.active);
    if (status === "ACTIVE" && activeSupplierRows.length === 0) {
      toast.error("Assign at least one active supplier before saving");
      setLoading(false);
      return;
    }

    const suppliersPayload = activeSupplierRows.map((s) => ({
      supplierId: s.supplierId,
      buyingPrice: numOrUndef(s.buyingPrice),
      leadTimeDays: intOrUndef(s.leadTime),
      minOrderQty: numOrUndef(s.moq),
      isPreferred: s.isDefault,
      isActive: true,
    }));
    const supplierIdsPayload = suppliersPayload.map((s) => s.supplierId);

    try {
      const created = await api.post<{
        id: string;
        variants?: { supplierAssignments?: { supplierId: string }[] }[];
      }>("/products", {
        name: name.trim(),
        description: description || undefined,
        categoryId: resolvedCategoryId,
        brandId,
        sku: skuHint.trim() || undefined,
        barcode: isWeighted ? undefined : barcode || undefined,
        sellingPrice: parseFloat(sellingPrice) || derivedSelling,
        costPrice: parseFloat(costPrice) || derivedCost,
        mrp: parseFloat(mrp) || derivedMrp || derivedSelling,
        wholesalePrice: wholesalePrice ? parseFloat(wholesalePrice) : 0,
        taxRate: parseFloat(taxRate) || 0,
        status,
        tags,
        productKind: productType,
        barcodeMode,
        unit,
        hasVariants,
        trackInventory,
        allowNegativeStock: allowNegative,
        allowDecimalSelling: isWeighted ? allowDecimalSelling : false,
        weightScaleReady: isWeighted ? weightScaleReady : false,
        openingStock: openingStock ? parseFloat(openingStock) : 0,
        reorderLevel: reorderLevel ? parseInt(reorderLevel, 10) || 0 : undefined,
        minStock: minStock ? parseInt(minStock, 10) || 0 : undefined,
        maxStock: maxStock ? parseInt(maxStock, 10) || 0 : undefined,
        warehouseId: warehouseId || undefined,
        branchScope: trackInventory ? branchScope : undefined,
        branchId: trackInventory && branchScope === "SINGLE" ? branchId : undefined,
        images: images.length > 0 ? images : undefined,
        variants: variants.length > 0 ? variants : undefined,
        // Send both shapes so assignment always persists (backend merges them)
        suppliers: suppliersPayload.length > 0 ? suppliersPayload : undefined,
        supplierIds: supplierIdsPayload.length > 0 ? supplierIdsPayload : undefined,
      });

      const assignedIds = new Set(
        (created.data?.variants ?? []).flatMap((v) =>
          (v.supplierAssignments ?? []).map((a) => a.supplierId),
        ),
      );
      const missing = supplierIdsPayload.filter((id) => !assignedIds.has(id));
      if (missing.length) {
        toast.error("Product saved but supplier assignment failed — edit the product and re-assign");
      } else {
        const label =
          mode === "DRAFT" ? "saved as draft" : mode === "ADD_ANOTHER" ? "created — add another" : "created";
        toast.success(
          suppliersPayload.length
            ? `"${name}" ${label} (linked to ${suppliersPayload.length} supplier${suppliersPayload.length > 1 ? "s" : ""})`
            : `"${name}" ${label}`,
        );
      }

      if (mode === "ADD_ANOTHER") {
        resetForm();
      } else {
        router.push("/products");
      }
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create product");
    } finally {
      setLoading(false);
    }
  };

  const availableSuppliers = suppliers.filter(
    (s) =>
      !supplierRows.some((r) => r.supplierId === s.id) &&
      (!supplierSearch.trim() || s.name.toLowerCase().includes(supplierSearch.trim().toLowerCase())),
  );

return (
    <div className="h-full flex flex-col bg-background">
      <div className="bg-background border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to Products</span>
          <span className="sm:hidden">Back</span>
        </button>
        <div className="text-center min-w-0">
          <h1 className="text-base font-semibold text-foreground">New Product</h1>
          <p className="text-[11px] text-muted-foreground truncate">Grocery product master</p>
        </div>
        <Button size="sm" className="gap-1.5 h-9 shrink-0" disabled={loading} onClick={() => submit("ACTIVE")}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Save</span>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px] gap-5 lg:gap-6 items-start w-full">
          <div className="space-y-5 min-w-0">
            <Section step="1" title="Product Type" subtitle="Choose how this product is sold in POS">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {PRODUCT_TYPES.map((t) => (
                  <ChoiceCard
                    key={t.id}
                    selected={productType === t.id}
                    onClick={() => setProductType(t.id)}
                    icon={t.icon}
                    title={t.title}
                    hint={t.hint}
                  />
                ))}
              </div>
            </Section>

            <Section step="2" title="General Information" subtitle="Name, brand, category and identity">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Product Name" required className="sm:col-span-2">
                  <Input placeholder="e.g. Samba Rice" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} className="h-10" />
                </Field>
                <Field label="Brand" required>
                  <SearchableBrandSelect
                    brands={brands}
                    value={brandId}
                    onChange={setBrandId}
                    onCreated={(b) => setBrands((prev) => [...prev, b].sort((a, c) => a.name.localeCompare(c.name)))}
                  />
                </Field>
                <Field label="Unit" required>
                  <Select value={unit} onValueChange={setUnit} disabled={isWeighted}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {shopProfile.units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Category" required>
                  <Select value={categoryId || undefined} onValueChange={(v) => { setCategoryId(v); setSubCategoryId(""); }}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.length === 0
                        ? <SelectItem value="_none" disabled>No categories found</SelectItem>
                        : categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Sub Category">
                  <Select value={subCategoryId || "_none"} onValueChange={(v) => setSubCategoryId(v === "_none" ? "" : v)} disabled={!categoryId}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Optional" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {subCategories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                {!isWeighted ? (
                  <Field label="Barcode" hint={hasVariants && barcodeMode === "SHARED" ? "Shared across all variants" : undefined}>
                    <Input placeholder="Scan or enter barcode" value={barcode} onChange={(e) => setBarcode(e.target.value)} className="h-10 font-mono text-sm" />
                  </Field>
                ) : (
                  <Field label="Barcode" hint="Not required for weighted products">
                    <Input disabled placeholder="Not required" className="h-10 bg-muted/40" />
                  </Field>
                )}
                <Field label="SKU" hint="Optional — leave blank to auto-generate">
                  <Input placeholder="e.g. RICE-SAMBA" value={skuHint} onChange={(e) => setSkuHint(e.target.value)} className="h-10 font-mono text-sm" />
                </Field>
                <Field label="Batch Number" className="sm:col-span-2 sm:max-w-sm">
                  <Input placeholder="Optional batch / lot" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} className="h-10" />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                  <Textarea rows={3} placeholder="Short description for staff…" value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <Field label="Product Image" className="sm:col-span-2" hint="First image is the cover">
                  <ProductImageUpload images={images} onChange={setImages} disabled={loading} />
                </Field>
              </div>
            </Section>

            {hasVariants ? (
              <Section step="3" title="Barcode Mode" subtitle="Default is Unique Barcode per variant">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ChoiceCard selected={barcodeMode === "UNIQUE"} onClick={() => setBarcodeMode("UNIQUE")} title="Unique Barcode" hint="Separate barcode for every variant (recommended)" />
                  <ChoiceCard selected={barcodeMode === "SHARED"} onClick={() => setBarcodeMode("SHARED")} title="Shared Barcode" hint="One barcode for all variants of this product" />
                </div>
              </Section>
            ) : null}

            <Section
              step={hasVariants ? "4" : "3"}
              title="Pricing"
              subtitle={isWeighted ? "Price per kg · LKR" : hasVariants ? "Base buying cost — selling prices on each variant" : "Buying, selling and margin · LKR"}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field label="Buying Price" required={!hasVariants}>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" value={costPrice} onChange={(e) => setCostPrice(sanitizePrice(e.target.value))} className="h-10" />
                </Field>
                <Field label={isWeighted ? "Selling Price / Kg" : "Selling Price"} required={!hasVariants}>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" value={sellingPrice} onChange={(e) => setSellingPrice(sanitizePrice(e.target.value))} className="h-10" disabled={hasVariants} />
                </Field>
                <Field label="Wholesale Price">
                  <Input type="number" min={0} step="0.01" placeholder="0.00" value={wholesalePrice} onChange={(e) => setWholesalePrice(sanitizePrice(e.target.value))} className="h-10" />
                </Field>
                <Field label="MRP" required={!hasVariants && !isWeighted}>
                  <Input type="number" min={0} step="0.01" placeholder="0.00" value={mrp} onChange={(e) => setMrp(sanitizePrice(e.target.value))} className="h-10" disabled={hasVariants} />
                </Field>
                <Field label="Tax Rate">
                  <Select value={taxRate} onValueChange={setTaxRate}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["0", "5", "12", "18", "28"].map((t) => <SelectItem key={t} value={t}>{t}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Profit Margin" hint="Auto from buying & selling">
                  <div className="h-10 rounded-lg border bg-muted/40 px-3 flex items-center justify-between text-sm">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">{profitMargin.pct}%</span>
                    <span className="text-muted-foreground tabular-nums text-xs">LKR {profitMargin.amount.toLocaleString("en-LK", { maximumFractionDigits: 2 })}</span>
                  </div>
                </Field>
              </div>
              {hasVariants ? (
                <p className="text-xs text-muted-foreground rounded-lg bg-muted/40 border border-dashed px-3 py-2">
                  Selling price and MRP are set on each variant row below.
                </p>
              ) : null}
            </Section>

            {isWeighted ? (
              <Section step="4" title="Weight Sale Settings" subtitle="Loose / scale-sold items">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-card">
                    <div>
                      <p className="text-sm font-medium">Allow Decimal Selling</p>
                      <p className="text-[11px] text-muted-foreground">e.g. 0.350 kg</p>
                    </div>
                    <Switch checked={allowDecimalSelling} onCheckedChange={setAllowDecimalSelling} />
                  </div>
                  <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-card">
                    <div>
                      <p className="text-sm font-medium">Weight Scale Ready</p>
                      <p className="text-[11px] text-muted-foreground">POS scale workflows</p>
                    </div>
                    <Switch checked={weightScaleReady} onCheckedChange={setWeightScaleReady} />
                  </div>
                </div>
              </Section>
            ) : null}

            {hasVariants ? (
              <Section
                step="5"
                title="Variants"
                subtitle="Pack sizes — e.g. 1kg · 5kg · 10kg"
                action={
                  <Button type="button" size="sm" className="h-8 text-xs gap-1.5" onClick={() => addVariantRow()}>
                    <Plus className="h-3.5 w-3.5" /> Add
                  </Button>
                }
              >
                <div className="flex flex-wrap gap-1.5">
                  {["250g", "500g", "1kg", "2kg", "5kg", "10kg"].map((p) => (
                    <button key={p} type="button" onClick={() => addVariantRow(p)} className="text-[11px] px-2.5 py-1 rounded-full border bg-card hover:bg-muted/50 text-muted-foreground hover:text-foreground">
                      + {p}
                    </button>
                  ))}
                </div>
                <div className="rounded-xl border overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/40 border-b">
                        <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          <th className="px-3 py-2.5 text-left font-medium">Variant</th>
                          <th className="px-3 py-2.5 text-left font-medium">Weight</th>
                          <th className="px-3 py-2.5 text-left font-medium">SKU</th>
                          <th className="px-3 py-2.5 text-left font-medium">Barcode</th>
                          <th className="px-3 py-2.5 text-right font-medium">Buying</th>
                          <th className="px-3 py-2.5 text-right font-medium">Selling</th>
                          <th className="px-3 py-2.5 text-right font-medium">MRP</th>
                          <th className="px-3 py-2.5 text-center font-medium">On</th>
                          <th className="px-2 py-2.5 w-10" />
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {variantRows.map((row) => (
                          <tr key={row.key} className={!row.active ? "opacity-45 bg-muted/20" : "hover:bg-muted/20"}>
                            <td className="px-3 py-2"><Input value={row.name} onChange={(e) => updateVariant(row.key, "name", e.target.value)} className="h-9 text-sm" placeholder="Name" /></td>
                            <td className="px-3 py-2"><Input value={row.size} onChange={(e) => updateVariant(row.key, "size", e.target.value)} className="h-9 text-xs" placeholder="5kg" /></td>
                            <td className="px-3 py-2"><Input value={row.sku} onChange={(e) => updateVariant(row.key, "sku", e.target.value)} className="h-9 text-xs font-mono" /></td>
                            <td className="px-3 py-2">
                              <Input value={row.barcode} onChange={(e) => updateVariant(row.key, "barcode", e.target.value)} disabled={barcodeMode === "SHARED"} className="h-9 text-xs font-mono" placeholder={barcodeMode === "SHARED" ? "Shared" : "Unique"} />
                            </td>
                            <td className="px-3 py-2"><Input type="number" min={0} step="0.01" value={row.costPrice} onChange={(e) => updateVariant(row.key, "costPrice", e.target.value)} className="h-9 text-sm text-right tabular-nums" /></td>
                            <td className="px-3 py-2"><Input type="number" min={0} step="0.01" value={row.sellingPrice} onChange={(e) => updateVariant(row.key, "sellingPrice", e.target.value)} className="h-9 text-sm text-right font-semibold tabular-nums" /></td>
                            <td className="px-3 py-2"><Input type="number" min={0} step="0.01" value={row.mrp} onChange={(e) => updateVariant(row.key, "mrp", e.target.value)} className="h-9 text-sm text-right tabular-nums" /></td>
                            <td className="px-3 py-2 text-center"><Switch checked={row.active} onCheckedChange={(v) => updateVariant(row.key, "active", v)} /></td>
                            <td className="px-2 py-2">
                              <button type="button" onClick={() => setVariantRows((r) => r.filter((x) => x.key !== row.key))} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {variantRows.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">No variants — add pack sizes above</div> : null}
                </div>
              </Section>
            ) : null}

            <Section step={hasVariants ? "6" : isWeighted ? "5" : "4"} title="Inventory" subtitle="Opening stock and reorder controls">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Field label="Opening Stock" hint="Saved to inventory on create">
                  <Input type="number" min={0} step="0.001" placeholder="0" value={openingStock} onChange={(e) => setOpeningStock(e.target.value)} className="h-10" />
                </Field>
                <Field label="Reorder Level">
                  <Input type="number" min={0} placeholder="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} className="h-10" />
                </Field>
                <Field label="Minimum Stock">
                  <Input type="number" min={0} placeholder="0" value={minStock} onChange={(e) => setMinStock(e.target.value)} className="h-10" />
                </Field>
                <Field label="Maximum Stock">
                  <Input type="number" min={0} placeholder="0" value={maxStock} onChange={(e) => setMaxStock(e.target.value)} className="h-10" />
                </Field>
                <Field label="Warehouse">
                  <Select value={warehouseId || "_none"} onValueChange={(v) => setWarehouseId(v === "_none" ? "" : v)}>
                    <SelectTrigger className="h-10"><SelectValue placeholder="Default warehouse" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Default / auto</SelectItem>
                      {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-card">
                  <div>
                    <p className="text-sm font-medium">Track Inventory</p>
                    <p className="text-[11px] text-muted-foreground">Monitor stock by branch</p>
                  </div>
                  <Switch checked={trackInventory} onCheckedChange={setTrackInventory} />
                </div>
                <div className="flex items-center justify-between rounded-xl border px-4 py-3 bg-card">
                  <div>
                    <p className="text-sm font-medium">Allow Negative Stock</p>
                    <p className="text-[11px] text-muted-foreground">POS preference</p>
                  </div>
                  <Switch checked={allowNegative} onCheckedChange={setAllowNegative} />
                </div>
              </div>
              {trackInventory ? (
                <ProductBranchScopeSelect
                  branchScope={branchScope}
                  branchId={branchId}
                  onScopeChange={(scope) => {
                    setBranchScope(scope);
                    if (scope === "SINGLE" && !branchId) setBranchId(activeBranchId ?? "");
                  }}
                  onBranchChange={setBranchId}
                />
              ) : null}
            </Section>

            <Section step={hasVariants ? "7" : isWeighted ? "6" : "5"} title="Suppliers" subtitle="Required for Purchase Orders — linked suppliers see this product in Create PO">
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input className="h-10 pl-9" placeholder="Search suppliers…" value={supplierSearch} onChange={(e) => setSupplierSearch(e.target.value)} />
                </div>
                <Select value={supplierPick || undefined} onValueChange={setSupplierPick}>
                  <SelectTrigger className="h-10 sm:w-56"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {availableSuppliers.length === 0
                      ? <SelectItem value="_none" disabled>No suppliers available</SelectItem>
                      : availableSuppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="h-10 gap-1.5" disabled={!supplierPick} onClick={addSupplier}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </div>
              <div className="rounded-xl border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2.5 text-left font-medium">Supplier</th>
                        <th className="px-3 py-2.5 text-center font-medium">Default</th>
                        <th className="px-3 py-2.5 text-right font-medium">Buying</th>
                        <th className="px-3 py-2.5 text-right font-medium">Lead (days)</th>
                        <th className="px-3 py-2.5 text-right font-medium">MOQ</th>
                        <th className="px-3 py-2.5 text-center font-medium">On</th>
                        <th className="px-2 py-2.5 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {supplierRows.map((row) => (
                        <tr key={row.supplierId} className={!row.active ? "opacity-50" : "hover:bg-muted/20"}>
                          <td className="px-3 py-2 font-medium text-foreground">{suppliers.find((s) => s.id === row.supplierId)?.name ?? row.supplierId}</td>
                          <td className="px-3 py-2 text-center">
                            <input type="radio" name="defaultSupplier" checked={row.isDefault} onChange={() => setSupplierRows((rows) => rows.map((r) => ({ ...r, isDefault: r.supplierId === row.supplierId })))} className="accent-primary" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min={0} step="0.01" value={row.buyingPrice} onChange={(e) => setSupplierRows((rows) => rows.map((r) => r.supplierId === row.supplierId ? { ...r, buyingPrice: sanitizePrice(e.target.value) } : r))} className="h-9 text-right tabular-nums" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min={0} value={row.leadTime} onChange={(e) => setSupplierRows((rows) => rows.map((r) => r.supplierId === row.supplierId ? { ...r, leadTime: e.target.value } : r))} className="h-9 text-right" />
                          </td>
                          <td className="px-3 py-2">
                            <Input type="number" min={0} value={row.moq} onChange={(e) => setSupplierRows((rows) => rows.map((r) => r.supplierId === row.supplierId ? { ...r, moq: e.target.value } : r))} className="h-9 text-right" />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <Switch checked={row.active} onCheckedChange={(v) => setSupplierRows((rows) => rows.map((r) => r.supplierId === row.supplierId ? { ...r, active: v } : r))} />
                          </td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => setSupplierRows((rows) => rows.filter((r) => r.supplierId !== row.supplierId))} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {supplierRows.length === 0 ? <div className="py-8 text-center text-sm text-muted-foreground">No suppliers assigned yet</div> : null}
              </div>
            </Section>
          </div>

          <aside className="space-y-4 lg:sticky lg:top-4">
            <SidebarCard title="Product Summary">
              <div className="space-y-2.5">
                {([
                  ["Name", name || "—"],
                  ["Brand", brandName || "—"],
                  ["Category", categoryName || "—"],
                  ["Sub Category", subCategoryName || "—"],
                  ["Type", PRODUCT_TYPES.find((t) => t.id === productType)?.title ?? productType],
                  ["Barcode", isWeighted ? "N/A" : barcode || "—"],
                  ["SKU", skuHint || "Auto"],
                  ["Unit", unit],
                  ["Variants", hasVariants ? String(activeVariants.length) : "—"],
                  ["Suppliers", String(supplierRows.filter((s) => s.active).length)],
                  ["Status", statusActive ? "Active" : "Draft"],
                ] as const).map(([label, val]) => (
                  <div key={label} className="flex justify-between gap-3 text-xs">
                    <span className="text-muted-foreground shrink-0">{label}</span>
                    <span className="font-medium text-right text-foreground truncate max-w-[150px]">{val}</span>
                  </div>
                ))}
              </div>
            </SidebarCard>

            <SidebarCard title="Status & Availability">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Active</p>
                  <p className="text-[11px] text-muted-foreground">Visible in POS</p>
                </div>
                <Switch checked={statusActive} onCheckedChange={setStatusActive} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Track Inventory</p>
                  <p className="text-[11px] text-muted-foreground">Stock monitoring</p>
                </div>
                <Switch checked={trackInventory} onCheckedChange={setTrackInventory} />
              </div>
              {trackInventory ? (
                <div className="rounded-lg bg-muted/40 border px-3 py-2 text-[11px] text-muted-foreground">
                  Branches: <span className="font-semibold text-foreground">{branchScope === "ALL" ? "All Branches" : "Single Branch"}</span>
                </div>
              ) : null}
            </SidebarCard>

            <SidebarCard>
              <Button className="w-full gap-2 h-10" disabled={loading} onClick={() => submit("ACTIVE")}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Product
              </Button>
              <Button variant="outline" className="w-full gap-2 h-10" disabled={loading} onClick={() => submit("ADD_ANOTHER")}>
                <Plus className="h-4 w-4" />
                Save & Add Another
              </Button>
              <Button variant="secondary" className="w-full h-10" disabled={loading} onClick={() => submit("DRAFT")}>
                Save Draft
              </Button>
              <Button variant="ghost" className="w-full h-9 text-muted-foreground" onClick={() => router.push("/products")}>
                Cancel
              </Button>
            </SidebarCard>

            <p className="text-[11px] text-muted-foreground leading-relaxed px-1">
              <Package className="h-3.5 w-3.5 inline mr-1 opacity-70" />
              Assigned suppliers only see this product when creating a PO.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
