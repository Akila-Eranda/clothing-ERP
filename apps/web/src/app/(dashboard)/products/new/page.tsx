"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Info, Layers, DollarSign, ImageIcon, Tag, Settings2,
  CheckCircle2, Plus, Trash2, X, Loader2, Sparkles, Package,
  Zap, List, ChevronDown, ChevronRight, ArrowLeft,
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

// ── Types ──────────────────────────────────────────────────────────────────
interface Category { id: string; name: string; }
interface Brand    { id: string; name: string; }
interface VariantAttr { name: string; values: string[]; input: string; }

interface Form {
  name: string; barcode: string; description: string; shortDesc: string;
  categoryId: string; brandId: string; hsn: string;
  status: "ACTIVE" | "DRAFT";
  tags: string[]; tagInput: string;
  sellingPrice: string; costPrice: string; mrp: string; taxRate: string;
  hasVariants: boolean; attributes: VariantAttr[];
  trackInventory: boolean;
  seoTitle: string; seoDescription: string;
}

const INITIAL: Form = {
  name: "", barcode: "", description: "", shortDesc: "",
  categoryId: "", brandId: "", hsn: "", status: "ACTIVE",
  tags: [], tagInput: "",
  sellingPrice: "", costPrice: "", mrp: "", taxRate: "18",
  hasVariants: false, attributes: [{ name: "Size", values: [], input: "" }],
  trackInventory: true, seoTitle: "", seoDescription: "",
};

const TABS = [
  { id: "basic",      label: "Basic Information", icon: Info },
  { id: "variants",   label: "Variants",           icon: Layers },
  { id: "pricing",    label: "Pricing",            icon: DollarSign },
  { id: "images",     label: "Images",             icon: ImageIcon },
  { id: "seo",        label: "SEO & Tags",         icon: Tag },
  { id: "additional", label: "Additional",         icon: Settings2 },
] as const;
type TabId = typeof TABS[number]["id"];

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
export default function AddProductPage() {
  const router = useRouter();
  const [tab, setTab]               = useState<TabId>("basic");
  const [form, setForm]             = useState<Form>(INITIAL);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands]         = useState<Brand[]>([]);
  const [loading, setLoading]       = useState(false);
  const [done, setDone]             = useState<Set<TabId>>(new Set());

  useEffect(() => {
    api.get<Category[]>("/categories").then((r) => setCategories(r.data ?? [])).catch(() => {});
    api.get<Brand[]>("/brands").then((r) => setBrands(r.data ?? [])).catch(() => {});
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((p) => ({ ...p, [k]: v }));
  const mark = (t: TabId) => setDone((p) => new Set([...p, t]));

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

  const autoGenerate = () => {
    const updated = form.attributes.map((a) => {
      const n = a.name.toLowerCase();
      if (n === "size")  return { ...a, values: ["S", "M", "L", "XL"] };
      if (n === "color") return { ...a, values: ["Black", "White", "Navy", "Olive"] };
      return a;
    });
    set("attributes", updated);
  };

  const submit = async (status: "ACTIVE" | "DRAFT") => {
    if (!form.name.trim()) { toast.error("Product name is required"); setTab("basic"); return; }
    if (!form.sellingPrice || !form.costPrice || !form.mrp) {
      toast.error("Selling price, cost price and MRP are required"); setTab("pricing"); return;
    }
    setLoading(true);
    const validAttrs  = form.attributes.filter((a) => a.values.length > 0);
    const variantCombos = form.hasVariants && validAttrs.length > 0 ? cartesian(form.attributes) : [];
    const variants = variantCombos.map((combo) => {
      const sku = genSku(form.name, combo);
      const v: Record<string, unknown> = {
        sku, name: combo.join(" / "),
        sellingPrice: parseFloat(form.sellingPrice) || 0,
        costPrice: parseFloat(form.costPrice) || 0,
        mrp: parseFloat(form.mrp) || 0,
        taxRate: parseFloat(form.taxRate) || 18,
      };
      validAttrs.forEach((attr, idx) => {
        const k = attr.name.toLowerCase();
        if (["size", "color", "material", "style"].includes(k)) v[k] = combo[idx];
      });
      return v;
    });
    try {
      await api.post("/products", {
        name: form.name.trim(),
        description: form.description || undefined,
        shortDesc: form.shortDesc || undefined,
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        hsn: form.hsn || undefined,
        barcode: form.barcode || undefined,
        sellingPrice: parseFloat(form.sellingPrice),
        costPrice: parseFloat(form.costPrice),
        mrp: parseFloat(form.mrp),
        taxRate: parseFloat(form.taxRate) || 18,
        status,
        tags: form.tags,
        hasVariants: form.hasVariants,
        trackInventory: form.trackInventory,
        seoTitle: form.seoTitle || undefined,
        seoDescription: form.seoDescription || undefined,
        variants: variants.length > 0 ? variants : undefined,
      });
      toast.success(`"${form.name}" ${status === "DRAFT" ? "saved as draft" : "created"} successfully!`);
      router.push("/products");
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create product");
    } finally { setLoading(false); }
  };

  // ── Tab content renderers ─────────────────────────────────────────────
  const renderBasic = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Basic Information</h3>
        <p className="text-sm text-muted-foreground">Enter the basic details about your product</p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5 col-span-2 xl:col-span-1">
          <Label className="text-xs font-semibold">Product Name <span className="text-destructive">*</span></Label>
          <Input placeholder="Enter product name" value={form.name} maxLength={120}
            onChange={(e) => set("name", e.target.value)} onBlur={() => form.name && mark("basic")} />
          <p className="text-[10px] text-muted-foreground text-right">{form.name.length}/120</p>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Barcode</Label>
          <Input placeholder="Enter barcode" value={form.barcode} onChange={(e) => set("barcode", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">HSN / SAC Code</Label>
          <Input placeholder="Enter HSN/SAC" value={form.hsn} onChange={(e) => set("hsn", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Category</Label>
          <Select value={form.categoryId} onValueChange={(v) => set("categoryId", v)}>
            <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
            <SelectContent>
              {categories.length === 0
                ? <SelectItem value="_none" disabled>No categories</SelectItem>
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
                ? <SelectItem value="_none" disabled>No brands</SelectItem>
                : brands.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Label className="text-xs font-semibold">Status</Label>
          <Switch checked={form.status === "ACTIVE"} onCheckedChange={(v) => set("status", v ? "ACTIVE" : "DRAFT")} />
          <span className="text-sm font-medium">{form.status === "ACTIVE" ? "Active" : "Draft"}</span>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Description</Label>
        <Textarea placeholder="Enter product description..." rows={5} maxLength={2000}
          value={form.description} onChange={(e) => set("description", e.target.value)} />
        <p className="text-[10px] text-muted-foreground text-right">{form.description.length}/2000</p>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">Short Description</Label>
        <Input placeholder="Brief product summary" value={form.shortDesc} onChange={(e) => set("shortDesc", e.target.value)} />
      </div>
    </div>
  );

  const renderVariants = () => {
    const allVariants = cartesian(form.attributes);
    const validAttrs  = form.attributes.filter((a) => a.values.length > 0);
    const a0 = validAttrs[0];
    const a1 = validAttrs[1];
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold">Variants</h3>
            <p className="text-sm text-muted-foreground">Add product variants like Size, Color etc. and generate SKUs</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">Manage Variants</span>
            <Switch checked={form.hasVariants} onCheckedChange={(v) => set("hasVariants", v)} />
          </div>
        </div>

        {form.hasVariants ? (
          <div className="grid grid-cols-3 gap-5">
            <div className="col-span-2 space-y-4">
              {/* 1. Attributes */}
              <div className="rounded-xl border p-4 space-y-4 bg-card">
                <div>
                  <h4 className="font-semibold text-sm">1. Select Variant Attributes</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">Choose attributes that best describe your product</p>
                </div>
                {form.attributes.map((attr, i) => (
                  <div key={i} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Input value={attr.name} className="w-24 h-7 text-xs font-semibold border-0 bg-transparent px-0 focus-visible:ring-0"
                        onChange={(e) => { const a = [...form.attributes]; a[i] = { ...a[i], name: e.target.value }; set("attributes", a); }}
                        placeholder="Attribute" />
                      <button className="p-1.5 rounded hover:bg-muted text-muted-foreground transition-colors"
                        onClick={() => set("attributes", form.attributes.filter((_, j) => j !== i))}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center border rounded-lg p-2 min-h-[42px] bg-background cursor-text"
                      onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
                      {attr.values.map((v, vi) => {
                        const hex = attr.name.toLowerCase() === "color" ? getColorHex(v) : null;
                        return (
                          <Badge key={vi} variant="secondary" className="gap-1 pl-1.5 pr-1 h-6 items-center">
                            {hex && <span className="h-3.5 w-3.5 rounded-full border border-border/60 shrink-0" style={{ backgroundColor: hex }} />}
                            {v}
                            <button className="hover:text-destructive ml-0.5" onClick={(e) => {
                              e.stopPropagation();
                              const a = form.attributes.map((x, j) => j !== i ? x : { ...x, values: x.values.filter((_, k) => k !== vi) });
                              set("attributes", a);
                            }}><X className="h-3 w-3" /></button>
                          </Badge>
                        );
                      })}
                      <input className="flex-1 min-w-[80px] outline-none text-sm bg-transparent placeholder:text-muted-foreground"
                        placeholder={`Add ${attr.name}…`} value={attr.input}
                        onChange={(e) => { const a = form.attributes.map((x, j) => j !== i ? x : { ...x, input: e.target.value }); set("attributes", a); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addAttrValue(i); } }}
                      />
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() =>
                      set("attributes", [...form.attributes, { name: "Color", values: [], input: "" }])}>
                      <Plus className="h-3.5 w-3.5" /> Add Attribute
                    </Button>
                    <Button variant="outline" size="sm" className="gap-1.5 h-8 border-primary/40 text-primary hover:bg-primary/5" onClick={autoGenerate}>
                      <Zap className="h-3.5 w-3.5" /> Auto Generate
                    </Button>
                  </div>
                  <span className="text-xs text-muted-foreground font-medium">
                    Total Variants: <span className="font-bold text-primary">{allVariants.length}</span>
                  </span>
                </div>
              </div>

              {/* 2. Preview */}
              {allVariants.length > 0 && (
                <div className="rounded-xl border p-4 space-y-3 bg-card">
                  <div>
                    <h4 className="font-semibold text-sm">2. Variant Preview</h4>
                    <p className="text-xs text-muted-foreground mt-0.5">Preview all variants combination</p>
                  </div>
                  {a0 && a1 ? (
                    <div className="overflow-auto rounded-lg border">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/40">
                            <th className="border-b border-r px-3 py-2 text-left text-muted-foreground font-medium">
                              {a0.name}&nbsp;\&nbsp;{a1.name}
                            </th>
                            {a1.values.map((v) => {
                              const hex = a1.name.toLowerCase() === "color" ? getColorHex(v) : null;
                              return (
                                <th key={v} className="border-b border-r last:border-r-0 px-3 py-2 text-center font-medium">
                                  <div className="flex flex-col items-center gap-1">
                                    {hex && <span className="h-6 w-6 rounded-full border border-border/60 block" style={{ backgroundColor: hex }} />}
                                    {v}
                                  </div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {a0.values.map((row) => (
                            <tr key={row} className="hover:bg-muted/20 transition-colors">
                              <td className="border-r px-3 py-2.5 bg-muted/20 font-semibold">{row}</td>
                              {a1.values.map((col) => (
                                <td key={col} className="border-r last:border-r-0 px-3 py-2.5 text-center font-mono text-[11px] text-muted-foreground">
                                  {genSku(form.name, [row, col])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {allVariants.slice(0, 12).map((combo, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-3 py-1.5 rounded-lg bg-muted/30 text-xs">
                          <span className="font-mono text-primary">{genSku(form.name, combo)}</span>
                          <span className="text-muted-foreground">{combo.join(" / ")}</span>
                        </div>
                      ))}
                      {allVariants.length > 12 && <p className="text-xs text-muted-foreground pl-1">+{allVariants.length - 12} more</p>}
                    </div>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-default">
                      <input type="checkbox" defaultChecked readOnly className="h-3.5 w-3.5 accent-primary" />
                      <span className="text-xs text-muted-foreground">Auto generate SKUs</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1.5">
                        <List className="h-3 w-3" /> Edit in List View
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                        onClick={() => set("attributes", form.attributes.map((a) => ({ ...a, values: [], input: "" })))}>
                        <Trash2 className="h-3 w-3" /> Clear All
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="rounded-xl border p-4 bg-card h-fit space-y-3 sticky top-4">
              <h4 className="font-semibold text-sm">Variant Summary</h4>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Attributes</span>
                  <span className="font-medium">{validAttrs.length}</span>
                </div>
                {validAttrs.map((a, i) => (
                  <div key={i} className="flex justify-between text-xs pl-2">
                    <span className="text-muted-foreground">{a.name}</span>
                    <span className="font-medium text-right max-w-[130px] truncate">{a.values.length} ({a.values.join(", ")})</span>
                  </div>
                ))}
                <div className="border-t pt-2.5 flex justify-between">
                  <span className="text-muted-foreground">Total Variants</span>
                  <span className="font-bold text-primary text-base">{allVariants.length}</span>
                </div>
              </div>
              {allVariants.length > 0 && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">All variants will be created with default pricing &amp; inventory.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground rounded-xl border bg-card">
            <Layers className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">Variants disabled</p>
            <p className="text-sm mt-1">Toggle "Manage Variants" above to add Size, Color etc.</p>
          </div>
        )}
      </div>
    );
  };

  const renderPricing = () => {
    const sp = parseFloat(form.sellingPrice || "0");
    const cp = parseFloat(form.costPrice || "0");
    const margin = sp > 0 ? ((sp - cp) / sp * 100).toFixed(1) : "0.0";
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-bold">Pricing</h3>
          <p className="text-sm text-muted-foreground">Set selling price, cost price, and tax rates</p>
        </div>
        <div className="grid grid-cols-2 gap-5">
          <div className="rounded-xl border p-5 space-y-4 bg-card">
            <h4 className="font-semibold text-sm">Price Details</h4>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Selling Price (₹) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" placeholder="0.00" value={form.sellingPrice}
                onChange={(e) => set("sellingPrice", e.target.value)} onBlur={() => form.sellingPrice && mark("pricing")} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cost Price (₹) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0" placeholder="0.00" value={form.costPrice}
                onChange={(e) => set("costPrice", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">MRP (₹) <span className="text-destructive">*</span></Label>
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
                  { label: "Selling Price", val: `₹${sp.toFixed(2)}`, bold: true, color: "" },
                  { label: "Cost Price",    val: `₹${cp.toFixed(2)}`, bold: false, color: "" },
                  { label: "Gross Margin",  val: `₹${(sp - cp).toFixed(2)}`, bold: true, color: "text-emerald-500" },
                  { label: "Margin %",      val: `${margin}%`, bold: true, color: "text-emerald-500" },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className={`${r.bold ? "font-bold" : ""} ${r.color}`}>{r.val}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-8">Enter selling & cost price to see margin</p>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderImages = () => (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-bold">Images</h3>
        <p className="text-sm text-muted-foreground">Upload product images</p>
      </div>
      <div className="rounded-xl border-2 border-dashed border-border p-16 flex flex-col items-center justify-center gap-3 bg-muted/10">
        <ImageIcon className="h-12 w-12 text-muted-foreground/30" />
        <p className="font-medium text-muted-foreground">Image upload coming soon</p>
        <p className="text-xs text-muted-foreground">Images can be added after product creation</p>
      </div>
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
          <Input placeholder="SEO title (defaults to product name)" value={form.seoTitle}
            onChange={(e) => set("seoTitle", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">SEO Description</Label>
          <Textarea placeholder="SEO meta description..." rows={3} value={form.seoDescription}
            onChange={(e) => set("seoDescription", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">Tags</Label>
          <div className="flex flex-wrap gap-1.5 items-center border rounded-lg p-2 min-h-[44px] bg-background cursor-text"
            onClick={(e) => (e.currentTarget.querySelector("input") as HTMLInputElement)?.focus()}>
            {form.tags.map((tag, i) => (
              <Badge key={i} variant="secondary" className="gap-1 pl-2 pr-1 h-6">
                {tag}
                <button onClick={() => set("tags", form.tags.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
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
          <p className="text-[10px] text-muted-foreground">Press Enter or comma to add a tag</p>
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
      <div className="rounded-xl border p-5 bg-card space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-sm">Has Variants</p>
            <p className="text-xs text-muted-foreground">Product has multiple variants (Size, Color, etc.)</p>
          </div>
          <Switch checked={form.hasVariants} onCheckedChange={(v) => set("hasVariants", v)} />
        </div>
        <div className="flex items-center justify-between border-t pt-4">
          <div>
            <p className="font-semibold text-sm">Track Inventory</p>
            <p className="text-xs text-muted-foreground">Monitor stock levels for this product</p>
          </div>
          <Switch checked={form.trackInventory} onCheckedChange={(v) => set("trackInventory", v)} />
        </div>
      </div>
    </div>
  );

  const content: Record<TabId, () => React.ReactNode> = {
    basic: renderBasic, variants: renderVariants, pricing: renderPricing,
    images: renderImages, seo: renderSeo, additional: renderAdditional,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Page header / breadcrumb */}
      <div className="px-6 py-4 border-b bg-background/80 backdrop-blur-sm shrink-0 sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm">
            <button onClick={() => router.push("/products")}
              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors font-medium">
              <ArrowLeft className="h-4 w-4" /> Products
            </button>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold text-foreground">Add New Product</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/products")} disabled={loading}>Cancel</Button>
            <Button variant="outline" onClick={() => submit("DRAFT")} disabled={loading} className="gap-1.5">
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Save as Draft
            </Button>
            <Button onClick={() => submit("ACTIVE")} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
              Save Product
            </Button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden max-w-[1400px] mx-auto w-full">
        {/* Sidebar */}
        <aside className="w-60 border-r bg-muted/10 p-3 flex flex-col gap-0.5 shrink-0 overflow-y-auto">
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
          <div className="mt-auto pt-4">
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
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            {content[tab]()}
          </div>
        </main>
      </div>
    </div>
  );
}
