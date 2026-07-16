"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  FileText,
  Package,
  Plus,
  Search,
  ScanLine,
  Trash2,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";
import { useShopProfile } from "@/lib/use-shop-profile";
import { ShopType } from "@/lib/shop-profiles";

// ── Types ──────────────────────────────────────────────────────────────────
interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  contactPerson?: string | null;
}

interface VariantOpt {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  imageUrl?: string | null;
  costPrice: number;
  taxRate?: number;
  stock: number;
  supplierId?: string | null;
  supplierProductCode?: string | null;
  lastBuyingPrice?: number | null;
}

interface LineItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string | null;
  imageUrl?: string | null;
  orderedQty: number;
  unitCost: number;
  discount: number;
  taxRate: number;
  stock: number;
}

function calcItem(i: LineItem) {
  const line = i.unitCost * i.orderedQty;
  const taxable = line - i.discount;
  const tax = (taxable * i.taxRate) / 100;
  return { line, taxable, tax, total: taxable + tax };
}

const PAYMENT_TERMS = ["Immediate", "15 Days", "30 Days", "45 Days", "60 Days", "90 Days"];

const STEPS = [
  { id: 1, label: "Supplier", hint: "Who are you ordering from?" },
  { id: 2, label: "Items", hint: "Add products & quantities" },
  { id: 3, label: "Review", hint: "Check totals & create PO" },
] as const;

function fmt(n: number) {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function CreatePOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const profile = useShopProfile();
  const adminBypass = bypassesWorkflowApproval(user?.role);
  // Supermarket / grocery: keep PO simple — no size/color/tax columns
  const isSupermarket =
    profile.type === ShopType.GROCERY
    || profile.type === ShopType.GENERAL
    || profile.type === ShopType.HARDWARE
    || profile.type === ShopType.AGRICULTURE;

  const [step, setStep] = useState(1);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allVariants, setAllVariants] = useState<VariantOpt[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [reference, setReference] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30 Days");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);

  const [productSearchQ, setProductSearchQ] = useState("");
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [supplierFilterQ, setSupplierFilterQ] = useState("");
  const [fromGrnId, setFromGrnId] = useState<string | null>(null);
  const [fromGrnNumber, setFromGrnNumber] = useState<string | null>(null);
  const [grnPrefillLoading, setGrnPrefillLoading] = useState(false);

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  useEffect(() => {
    api
      .get<{ data: Supplier[] }>("/suppliers?limit=200")
      .then((r) => setSuppliers(r.data?.data ?? (r.data as unknown as Supplier[]) ?? []))
      .catch(() => {});
    api
      .get<VariantOpt[]>("/pos/products")
      .then((r) => setAllVariants(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, []);

  // Prefill supplier from ?supplier=
  useEffect(() => {
    const prefill = searchParams.get("supplier");
    if (prefill && suppliers.length) {
      if (suppliers.some((s) => s.id === prefill)) {
        setSupplierId(prefill);
      }
    }
  }, [searchParams, suppliers]);

  // Prefill entire form from Quick/Direct GRN (?fromGrn=)
  useEffect(() => {
    const grnId = searchParams.get("fromGrn");
    if (!grnId) return;
    let cancelled = false;
    setGrnPrefillLoading(true);
    api
      .get<{
        id: string;
        grnNumber: string;
        source: string;
        notes?: string | null;
        supplierInvoiceRef?: string | null;
        purchase?: { id: string; poNumber: string } | null;
        supplier: { id: string };
        items: {
          variantId: string;
          productName: string;
          variantName: string;
          sku: string;
          receivedQty: number;
          unitCost: number;
        }[];
      }>(`/procurement/grn/${grnId}`)
      .then((r) => {
        if (cancelled) return;
        const g = r.data;
        if (g.purchase?.id) {
          toast.info(`This GRN is already linked to ${g.purchase.poNumber}`);
          router.replace(`/purchases/${g.purchase.id}`);
          return;
        }
        setFromGrnId(g.id);
        setFromGrnNumber(g.grnNumber);
        setSupplierId(g.supplier.id);
        setReference(g.supplierInvoiceRef || g.grnNumber);
        setNotes(
          g.notes
            ? `${g.notes}\n(Created from ${g.grnNumber} — stock already received)`
            : `Created from ${g.grnNumber} — stock already received by cashier`,
        );
        setPaymentTerms("Immediate");
        setExpectedDate(new Date().toISOString().slice(0, 10));
        setItems(
          g.items
            .filter((i) => i.receivedQty > 0)
            .map((i) => ({
              variantId: i.variantId,
              productName: i.productName,
              variantName: i.variantName,
              sku: i.sku,
              orderedQty: i.receivedQty,
              unitCost: i.unitCost,
              discount: 0,
              taxRate: 0,
              stock: 0,
            })),
        );
        setStep(3);
        toast.success(`Loaded ${g.grnNumber} — review & create PO`);
      })
      .catch((e: unknown) => {
        if (!cancelled) toast.error((e as Error).message ?? "Failed to load GRN");
      })
      .finally(() => {
        if (!cancelled) setGrnPrefillLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchParams, router]);

  // When supplier changes, reload catalog filtered by supplier if assignments exist
  useEffect(() => {
    if (!supplierId) return;
    api
      .get<VariantOpt[]>(`/pos/products?supplierId=${encodeURIComponent(supplierId)}&limit=2000`)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        // If supplier filter returns empty (no assignments), keep full catalog
        if (list.length > 0) setAllVariants(list);
      })
      .catch(() => {});
  }, [supplierId]);

  const filteredSuppliers = useMemo(() => {
    const q = supplierFilterQ.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q)
        || (s.phone ?? "").toLowerCase().includes(q)
        || (s.contactPerson ?? "").toLowerCase().includes(q),
    );
  }, [suppliers, supplierFilterQ]);

  const filteredVariants = useCallback(
    (q: string) => {
      const base = (() => {
        if (!q.trim()) return allVariants.slice(0, 40);
        const lq = q.toLowerCase();
        return allVariants.filter(
          (v) =>
            v.productName.toLowerCase().includes(lq)
            || v.sku.toLowerCase().includes(lq)
            || v.variantName.toLowerCase().includes(lq)
            || (v.barcode?.toLowerCase().includes(lq) ?? false)
            || (v.supplierProductCode?.toLowerCase().includes(lq) ?? false),
        );
      })();
      return base.slice(0, 20);
    },
    [allVariants],
  );

  const resolveVariantByCode = async (code: string): Promise<VariantOpt | null> => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const local = allVariants.find(
      (v) =>
        v.sku.toLowerCase() === trimmed.toLowerCase()
        || v.barcode?.toLowerCase() === trimmed.toLowerCase(),
    );
    if (local) return local;
    try {
      const res = await api.get<{
        variantId: string;
        productName: string;
        variantName: string;
        sku: string;
        barcode?: string;
        costPrice: number;
        stock: number;
        imageUrl?: string | null;
        taxRate?: number;
        supplierId?: string | null;
        supplierProductCode?: string | null;
        lastBuyingPrice?: number | null;
      }>(`/pos/barcode/${encodeURIComponent(trimmed)}`);
      const d = res.data;
      return {
        variantId: d.variantId,
        productName: d.productName,
        variantName: d.variantName,
        sku: d.sku,
        barcode: d.barcode,
        costPrice: d.costPrice,
        stock: d.stock,
        imageUrl: d.imageUrl ?? undefined,
        taxRate: d.taxRate,
        supplierId: d.supplierId ?? undefined,
        supplierProductCode: d.supplierProductCode ?? undefined,
        lastBuyingPrice: d.lastBuyingPrice ?? undefined,
      };
    } catch {
      return null;
    }
  };

  const addVariantToItems = (v: VariantOpt) => {
    const existing = items.findIndex((i) => i.variantId === v.variantId);
    if (existing >= 0) {
      setItems((p) =>
        p.map((it, i) => (i === existing ? { ...it, orderedQty: it.orderedQty + 1 } : it)),
      );
      toast.success(`Qty updated for ${v.productName}`);
    } else {
      setItems((p) => [
        ...p,
        {
          variantId: v.variantId,
          productName: v.productName,
          variantName: v.variantName,
          sku: v.sku,
          barcode: v.barcode ?? undefined,
          imageUrl: v.imageUrl ?? undefined,
          orderedQty: 1,
          unitCost: v.lastBuyingPrice && v.lastBuyingPrice > 0 ? v.lastBuyingPrice : v.costPrice,
          discount: 0,
          taxRate: isSupermarket ? 0 : (v.taxRate ?? 0),
          stock: v.stock,
        },
      ]);
      toast.success(`Added ${v.productName}`);
    }
    setProductSearchOpen(false);
    setProductSearchQ("");
  };

  const handleBigSearchKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setProductSearchOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = productSearchQ.trim();
    if (!q) return;
    const matches = filteredVariants(q);
    if (matches.length) {
      addVariantToItems(matches[0]);
      return;
    }
    const resolved = await resolveVariantByCode(q);
    if (resolved) addVariantToItems(resolved);
    else toast.error(`Product not found: ${q}`);
  };

  const updateItem = <K extends keyof LineItem>(idx: number, key: K, val: LineItem[K]) => {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  };

  const removeRow = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const subtotal = items.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
  const totalDisc = items.reduce((s, i) => s + i.discount, 0);
  const totalTax = items.reduce((s, i) => s + calcItem(i).tax, 0);
  const grandTotal = subtotal - totalDisc + totalTax;
  const totalQty = items.reduce((s, i) => s + i.orderedQty, 0);

  const canGoStep2 = Boolean(supplierId);
  const canGoStep3 = items.length > 0 && items.every((i) => i.variantId && i.orderedQty >= 1);

  const goNext = () => {
    if (step === 1 && !canGoStep2) {
      toast.error("Please select a supplier");
      return;
    }
    if (step === 2 && !canGoStep3) {
      toast.error("Add at least one product");
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };

  const goBack = () => setStep((s) => Math.max(1, s - 1));

  const submit = async (submitForApproval: boolean) => {
    if (!supplierId) {
      toast.error("Please select a supplier");
      setStep(1);
      return;
    }
    if (!items.length) {
      toast.error("Add at least one item");
      setStep(2);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        supplierId,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        reference: reference || undefined,
        paymentTerms,
        fromGrnId: fromGrnId || undefined,
        items: items.map((i) => ({
          variantId: i.variantId,
          productName: i.productName,
          variantName: i.variantName,
          sku: i.sku,
          orderedQty: i.orderedQty,
          unitCost: i.unitCost,
          discount: i.discount,
          taxRate: i.taxRate,
        })),
      };
      const res = await api.post<{ id: string }>("/purchases", payload);
      if (fromGrnId) {
        toast.success(
          fromGrnNumber
            ? `PO created & linked to ${fromGrnNumber} (already received)`
            : "PO created and linked to GRN (already received)",
        );
      } else if (submitForApproval) {
        await api.post(`/purchases/${res.data.id}/submit-approval`);
        toast.success(
          adminBypass
            ? "Purchase order created and confirmed"
            : "Purchase order submitted for approval",
        );
      } else {
        toast.success("Purchase order saved as draft");
      }
      router.push(`/purchases/${res.data.id}`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create PO");
    } finally {
      setSaving(false);
    }
  };

  const bigMatches = productSearchOpen ? filteredVariants(productSearchQ) : [];

  return (
    <div className="min-h-screen bg-muted/30 pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 shrink-0"
            onClick={() => (step === 1 ? router.push("/purchases") : goBack())}
            disabled={saving}
          >
            <ArrowLeft className="h-4 w-4" />
            {step === 1 ? "Back" : "Previous"}
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold truncate">
              {fromGrnId ? "Create PO from GRN" : "Create Purchase Order"}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fromGrnId
                ? `Stock already received via ${fromGrnNumber ?? "GRN"} — create PO for records`
                : STEPS[step - 1].hint}
            </p>
          </div>
          <span className={`text-xs font-semibold border px-2.5 py-1 rounded-full shrink-0 ${
            fromGrnId
              ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
              : "bg-amber-500/10 text-amber-700 border-amber-500/20"
          }`}>
            {fromGrnId ? "From GRN" : "Draft"}
          </span>
        </div>

        {/* Step indicator */}
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-4">
          <div className="flex items-center gap-2">
            {STEPS.map((s, idx) => {
              const done = step > s.id;
              const active = step === s.id;
              return (
                <React.Fragment key={s.id}>
                  {idx > 0 && (
                    <div className={`h-px flex-1 ${done || active ? "bg-primary/40" : "bg-border"}`} />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (s.id < step) setStep(s.id);
                      else if (s.id === 2 && canGoStep2) setStep(2);
                      else if (s.id === 3 && canGoStep2 && canGoStep3) setStep(3);
                    }}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors shrink-0 ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : done
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] ${
                        active
                          ? "bg-primary-foreground/20"
                          : done
                            ? "bg-primary text-primary-foreground"
                            : "bg-background"
                      }`}
                    >
                      {done ? <Check className="h-3 w-3" /> : s.id}
                    </span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-6">
        {grnPrefillLoading && (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">
            Loading GRN details…
          </div>
        )}
        {fromGrnId && fromGrnNumber && !grnPrefillLoading && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-900 p-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-wide">
                Cashier already posted stock
              </p>
              <p className="text-sm mt-1">
                Creating PO from <span className="font-mono font-bold">{fromGrnNumber}</span>.
                Supplier, items, qty &amp; cost are filled — no second stock add.
              </p>
            </div>
            <span className="text-xs font-mono bg-background/80 border px-2.5 py-1 rounded-full">
              {fromGrnNumber}
            </span>
          </div>
        )}
        {/* ─── STEP 1: Supplier ─────────────────────────────────────────── */}
        {step === 1 && (
          <div className="bg-background border rounded-2xl shadow-sm p-5 sm:p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Truck className="h-4 w-4 text-primary" />
                Supplier & order details
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Choose the supplier first, then set delivery and payment terms.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Supplier <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={supplierFilterQ}
                  onChange={(e) => setSupplierFilterQ(e.target.value)}
                  placeholder="Search suppliers by name or phone…"
                  className="h-10 pl-10"
                />
              </div>
              <div className="border rounded-xl overflow-hidden max-h-56 overflow-y-auto divide-y">
                {filteredSuppliers.length === 0 ? (
                  <p className="px-4 py-8 text-center text-xs text-muted-foreground">No suppliers found</p>
                ) : (
                  filteredSuppliers.map((s) => {
                    const selected = supplierId === s.id;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => setSupplierId(s.id)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                          selected ? "bg-primary/5" : "hover:bg-muted/40"
                        }`}
                      >
                        <span
                          className={`h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selected ? "border-primary bg-primary" : "border-muted-foreground/40"
                          }`}
                        >
                          {selected && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[s.contactPerson, s.phone, s.city].filter(Boolean).join(" · ") || "—"}
                          </p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {supplier && (
              <div className="rounded-xl border bg-muted/20 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Selected</p>
                  <p className="font-semibold">{supplier.name}</p>
                </div>
                {supplier.phone && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Phone</p>
                    <p className="font-medium">{supplier.phone}</p>
                  </div>
                )}
                {supplier.email && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Email</p>
                    <p className="font-medium truncate">{supplier.email}</p>
                  </div>
                )}
                {(supplier.address || supplier.city) && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Address</p>
                    <p className="font-medium">{[supplier.address, supplier.city].filter(Boolean).join(", ")}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Expected Delivery</label>
                <Input
                  type="date"
                  value={expectedDate}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="h-10"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Payment Terms</label>
                <select
                  value={paymentTerms}
                  onChange={(e) => setPaymentTerms(e.target.value)}
                  className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Reference Number</label>
                <Input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="e.g. REF-2026-001"
                  className="h-10"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Internal notes for this PO…"
                  className="w-full text-sm border rounded-lg px-3 py-2.5 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            </div>
          </div>
        )}

        {/* ─── STEP 2: Items ────────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="bg-background border rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold flex items-center gap-2">
                    <Package className="h-4 w-4 text-primary" />
                    Add products
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Search by name, SKU, or scan barcode. {supplier ? `Supplier: ${supplier.name}` : ""}
                  </p>
                </div>
                {items.length > 0 && (
                  <span className="text-xs bg-primary/10 text-primary font-semibold px-2.5 py-1 rounded-full tabular-nums">
                    {items.length} item{items.length === 1 ? "" : "s"}
                  </span>
                )}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                <input
                  value={productSearchQ}
                  onChange={(e) => {
                    setProductSearchQ(e.target.value);
                    setProductSearchOpen(true);
                  }}
                  onFocus={() => setProductSearchOpen(true)}
                  onKeyDown={handleBigSearchKeyDown}
                  placeholder="Search product, SKU, barcode… press Enter"
                  className="w-full pl-10 pr-10 py-3 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  autoFocus
                />
                {productSearchOpen && productSearchQ.trim() && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-xl shadow-xl mt-2 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {bigMatches.length === 0 ? (
                        <p className="px-4 py-6 text-center text-muted-foreground text-xs">
                          No match — press Enter to try barcode/SKU lookup
                        </p>
                      ) : (
                        bigMatches.map((v) => (
                          <button
                            key={v.variantId}
                            type="button"
                            onClick={() => addVariantToItems(v)}
                            className="w-full px-4 py-3 hover:bg-muted/50 text-left flex items-center gap-3 border-b last:border-0"
                          >
                            <div className="h-9 w-9 rounded-lg bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                              {v.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.imageUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-4 w-4 text-muted-foreground/60" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm truncate">{v.productName}</p>
                              <p className="text-muted-foreground text-xs truncate">
                                <span className="font-mono">{v.sku}</span>
                                {v.variantName && v.variantName !== "Default" ? ` · ${v.variantName}` : ""}
                                {v.barcode ? ` · ${v.barcode}` : ""}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-semibold tabular-nums">
                                LKR {(v.lastBuyingPrice && v.lastBuyingPrice > 0 ? v.lastBuyingPrice : v.costPrice).toLocaleString()}
                              </p>
                              <p className="text-[10px] text-muted-foreground tabular-nums">Stock {v.stock}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b bg-muted/20 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Order lines</h3>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1.5 h-8"
                  onClick={() => {
                    const el = document.querySelector<HTMLInputElement>("input[placeholder*='Search product']");
                    el?.focus();
                    setProductSearchOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> Add more
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground">
                  <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                    <Package className="h-6 w-6 opacity-40" />
                  </div>
                  <p className="text-sm font-medium text-foreground">No items yet</p>
                  <p className="text-xs mt-1">Search above to add your first product</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-muted/40 border-b">
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 text-left font-semibold">Product</th>
                        <th className="px-4 py-3 text-right font-semibold w-24">Stock</th>
                        <th className="px-4 py-3 text-right font-semibold w-28">Qty</th>
                        <th className="px-4 py-3 text-right font-semibold w-32">Unit Cost</th>
                        {!isSupermarket && (
                          <>
                            <th className="px-4 py-3 text-right font-semibold w-28">Discount</th>
                            <th className="px-4 py-3 text-right font-semibold w-24">Tax %</th>
                          </>
                        )}
                        <th className="px-4 py-3 text-right font-semibold w-32">Total</th>
                        <th className="px-4 py-3 w-12" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item, idx) => {
                        const { total } = calcItem(item);
                        return (
                          <tr key={item.variantId} className="align-middle">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className="h-10 w-10 rounded-lg bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                                  {item.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                                  ) : (
                                    <Package className="h-4 w-4 text-muted-foreground/60" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="font-medium text-sm truncate">{item.productName}</p>
                                  <p className="text-xs text-muted-foreground font-mono truncate">
                                    {item.sku}
                                    {item.variantName && item.variantName !== "Default"
                                      ? ` · ${item.variantName}`
                                      : ""}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                              {item.stock}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={1}
                                value={item.orderedQty}
                                onChange={(e) =>
                                  updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value, 10) || 1))
                                }
                                className="w-20 text-right text-sm border rounded-lg px-2 py-1.5 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                            </td>
                            <td className="px-4 py-3 text-right">
                              <input
                                type="number"
                                min={0}
                                step="0.01"
                                value={item.unitCost}
                                onChange={(e) =>
                                  updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)
                                }
                                className="w-28 text-right text-sm border rounded-lg px-2 py-1.5 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                            </td>
                            {!isSupermarket && (
                              <>
                                <td className="px-4 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={item.discount}
                                    onChange={(e) =>
                                      updateItem(idx, "discount", parseFloat(e.target.value) || 0)
                                    }
                                    className="w-24 text-right text-sm border rounded-lg px-2 py-1.5 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.1"
                                    value={item.taxRate}
                                    onChange={(e) =>
                                      updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)
                                    }
                                    className="w-20 text-right text-sm border rounded-lg px-2 py-1.5 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                                  />
                                </td>
                              </>
                            )}
                            <td className="px-4 py-3 text-right font-semibold text-primary tabular-nums">
                              {fmt(total)}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                className="text-muted-foreground hover:text-destructive p-1.5 rounded-md hover:bg-destructive/10"
                                aria-label="Remove"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {items.length > 0 && (
                <div className="px-5 py-3 border-t bg-muted/10 flex flex-wrap items-center justify-end gap-6 text-sm">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Subtotal</div>
                    <div className="font-semibold tabular-nums">LKR {fmt(subtotal)}</div>
                  </div>
                  {!isSupermarket && (
                    <>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Discount</div>
                        <div className="font-semibold text-green-600 tabular-nums">− LKR {fmt(totalDisc)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Tax</div>
                        <div className="font-semibold tabular-nums">LKR {fmt(totalTax)}</div>
                      </div>
                    </>
                  )}
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Grand Total</div>
                    <div className="font-bold text-primary tabular-nums">LKR {fmt(grandTotal)}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── STEP 3: Review ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="bg-background border rounded-2xl shadow-sm p-5 sm:p-6 space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Review & create
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-muted/15 p-4 space-y-2">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Supplier</p>
                  <p className="font-semibold">{supplier?.name ?? "—"}</p>
                  {supplier?.phone && (
                    <p className="text-xs text-muted-foreground">{supplier.phone}</p>
                  )}
                  <button
                    type="button"
                    className="text-xs text-primary font-semibold hover:underline"
                    onClick={() => setStep(1)}
                  >
                    Change supplier
                  </button>
                </div>
                <div className="rounded-xl border bg-muted/15 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Expected</span>
                    <span className="font-medium">
                      {expectedDate
                        ? new Date(expectedDate).toLocaleDateString("en-LK", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-medium">{paymentTerms}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">Reference</span>
                    <span className="font-medium">{reference || "—"}</span>
                  </div>
                  {notes && (
                    <div className="pt-2 border-t">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                      <p className="text-xs">{notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b bg-muted/20 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Items ({items.length}) · Qty {totalQty}
                </h3>
                <button
                  type="button"
                  className="text-xs text-primary font-semibold hover:underline"
                  onClick={() => setStep(2)}
                >
                  Edit items
                </button>
              </div>
              <div className="divide-y">
                {items.map((item) => {
                  const { total } = calcItem(item);
                  return (
                    <div key={item.variantId} className="px-5 py-3 flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{item.productName}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {item.sku}
                          {item.variantName ? ` · ${item.variantName}` : ""}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground shrink-0">
                        {item.orderedQty} × {fmt(item.unitCost)}
                      </div>
                      <div className="text-right text-sm font-semibold tabular-nums w-28 shrink-0">
                        LKR {fmt(total)}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="px-5 py-4 border-t bg-muted/10 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium tabular-nums">LKR {fmt(subtotal)}</span>
                </div>
                {!isSupermarket && (
                  <>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="font-medium text-green-600 tabular-nums">− LKR {fmt(totalDisc)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span className="font-medium tabular-nums">LKR {fmt(totalTax)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between text-base pt-2 border-t">
                  <span className="font-bold">Grand Total</span>
                  <span className="font-bold text-primary tabular-nums">LKR {fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => (step === 1 ? router.push("/purchases") : goBack())}
            disabled={saving}
          >
            {step === 1 ? "Cancel" : "Back"}
          </Button>

          <div className="flex items-center gap-2">
            {step < 3 ? (
              <Button onClick={goNext} disabled={saving} className="gap-2">
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            ) : fromGrnId ? (
              <Button
                onClick={() => submit(false)}
                disabled={saving || !canGoStep2 || !canGoStep3 || grnPrefillLoading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <FileText className="h-4 w-4" />
                Create PO & Link GRN
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => submit(false)}
                  disabled={saving || !canGoStep2 || !canGoStep3}
                >
                  Save Draft
                </Button>
                <Button
                  onClick={() => submit(true)}
                  disabled={saving || !canGoStep2 || !canGoStep3}
                  className="gap-2"
                >
                  <FileText className="h-4 w-4" />
                  {adminBypass ? "Create & Confirm" : "Submit for Approval"}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {productSearchOpen && productSearchQ.trim() && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setProductSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}
