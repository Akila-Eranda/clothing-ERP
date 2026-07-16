"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Package, Plus, Printer, Search, ScanLine, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";

// ── Types ──────────────────────────────────────────────────────────────────
interface Supplier {
  id: string; name: string; phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null; contactPerson?: string | null;
}
interface VariantOpt {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  size?: string | null;
  color?: string | null;
  // Optional fields may be returned by /pos/products depending on backend phase.
  imageUrl?: string | null;
  sellingPrice?: number | null;
  unitPrice?: number | null;
  availableStock?: number | null;
  reservedStock?: number | null;
  minStock?: number | null;
  status?: string | null;
  leadTimeDays?: number | null;
  lastPurchaseDate?: string | null;
  lastPurchaseQty?: number | null;
  soldAfterLastPurchase?: number | null;
  lastBuyingPrice?: number | null;
  supplierId?: string | null;
  supplierProductCode?: string | null;

  costPrice: number;
  taxRate?: number;
  stock: number;
}
interface LineItem {
  variantId: string; productName: string; variantName: string; sku: string;
  size?: string | null; color?: string | null;
  barcode?: string | null;
  imageUrl?: string | null;
  orderedQty: number;
  unitCost: number;
  discount: number;
  taxRate: number;
}

function calcItem(i: LineItem) {
  const line    = i.unitCost * i.orderedQty;
  const taxable = line - i.discount;
  const tax     = (taxable * i.taxRate) / 100;
  return { line, taxable, tax, total: taxable + tax };
}

const PAYMENT_TERMS = ["Immediate", "15 Days", "30 Days", "45 Days", "60 Days", "90 Days"];

// ── Page ───────────────────────────────────────────────────────────────────
export default function CreatePOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const adminBypass = bypassesWorkflowApproval(user?.role);

  const [suppliers,    setSuppliers]    = useState<Supplier[]>([]);
  const [allVariants,  setAllVariants]  = useState<VariantOpt[]>([]);
  const [supplierId,   setSupplierId]   = useState("");
  const [supplier,     setSupplier]     = useState<Supplier | null>(null);
  const [expectedDate, setExpectedDate] = useState("");
  const [reference,    setReference]    = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30 Days");
  const [notes,        setNotes]        = useState("");
  const [items,        setItems]        = useState<LineItem[]>([]);
  const [saving,       setSaving]       = useState(false);
  const [fromGrnId, setFromGrnId] = useState<string | null>(null);
  const [fromGrnNumber, setFromGrnNumber] = useState<string | null>(null);
  const [grnPrefillLoading, setGrnPrefillLoading] = useState(false);

  // item search
  const [searchQ,      setSearchQ]      = useState<string[]>([]);   // per-row search query
  const [searchOpen,   setSearchOpen]   = useState<number | null>(null);

  // Large product search + row selection (UI-only).
  const [productSearchQ, setProductSearchQ] = useState("");
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [selectedRowIdx, setSelectedRowIdx] = useState<number | null>(null);

  useEffect(() => {
    api.get<{ data: Supplier[] }>("/suppliers?limit=200").then((r) =>
      setSuppliers(r.data?.data ?? (r.data as unknown as Supplier[]) ?? [])
    ).catch(() => {});
    api.get<VariantOpt[]>("/pos/products").then((r) =>
      setAllVariants(Array.isArray(r.data) ? r.data : [])
    ).catch(() => {});
  }, []);

  const handleSupplierChange = useCallback((id: string) => {
    setSupplierId(id);
    setSupplier(suppliers.find((s) => s.id === id) ?? null);
  }, [suppliers]);

  // Prefill supplier from ?supplier=
  useEffect(() => {
    const prefill = searchParams.get("supplier");
    if (prefill && suppliers.length && suppliers.some((s) => s.id === prefill)) {
      handleSupplierChange(prefill);
    }
  }, [searchParams, suppliers, handleSupplierChange]);

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
        notes?: string | null;
        supplierInvoiceRef?: string | null;
        purchase?: { id: string; poNumber: string } | null;
        supplier: { id: string; name?: string };
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
        setSupplier({ id: g.supplier.id, name: g.supplier.name ?? "Supplier" });
        setReference(g.supplierInvoiceRef || g.grnNumber);
        setNotes(
          g.notes
            ? `${g.notes}\n(Created from ${g.grnNumber} — stock already received)`
            : `Created from ${g.grnNumber} — stock already received by cashier`,
        );
        setPaymentTerms("Immediate");
        setExpectedDate(new Date().toISOString().slice(0, 10));
        const lines = g.items
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
          }));
        setItems(lines);
        setSearchQ(lines.map(() => ""));
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

  // Keep supplier object in sync when suppliers load after GRN prefill
  useEffect(() => {
    if (!fromGrnId || !supplierId || !suppliers.length) return;
    const s = suppliers.find((x) => x.id === supplierId);
    if (s) setSupplier(s);
  }, [fromGrnId, supplierId, suppliers]);

  const variantById = useMemo(() => {
    return new Map(allVariants.map((v) => [v.variantId, v]));
  }, [allVariants]);

  // ── Items logic ────────────────────────────────────────────────────────
  const addRow = () => {
    setItems((p) => [
      ...p,
      {
        variantId: "",
        productName: "",
        variantName: "",
        sku: "",
        size: undefined,
        color: undefined,
        barcode: undefined,
        imageUrl: undefined,
        orderedQty: 1,
        unitCost: 0,
        discount: 0,
        taxRate: 0,
      },
    ]);
    setSearchQ((p) => [...p, ""]);
    setSearchOpen(items.length);
  };

  const removeRow = (idx: number) => {
    setItems((p) => p.filter((_, i) => i !== idx));
    setSearchQ((p) => p.filter((_, i) => i !== idx));
    setSearchOpen(null);
    setSelectedRowIdx((cur) => {
      if (cur === null) return cur;
      if (cur === idx) return null;
      if (cur > idx) return cur - 1;
      return cur;
    });
  };

  const updateItem = <K extends keyof LineItem>(idx: number, key: K, val: LineItem[K]) => {
    setItems((p) => p.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  };

  const selectVariant = (idx: number, v: VariantOpt) => {
    setItems((p) => p.map((it, i) => i === idx ? {
      ...it, variantId: v.variantId, productName: v.productName,
      variantName: v.variantName,
      sku: v.sku,
      size: v.size ?? undefined,
      color: v.color ?? undefined,
      barcode: v.barcode ?? undefined,
      imageUrl: v.imageUrl ?? undefined,
      unitCost: v.costPrice,
      taxRate: v.taxRate ?? 0,
    } : it));
    setSearchQ((p) => p.map((q, i) => i === idx ? "" : q));
    setSearchOpen(null);
  };

  const clearVariant = (idx: number) => {
    setItems((p) => p.map((it, i) => i === idx ? {
      variantId: "", productName: "", variantName: "", sku: "",
      size: undefined,
      color: undefined,
      barcode: undefined,
      imageUrl: undefined,
      orderedQty: it.orderedQty,
      unitCost: 0,
      discount: it.discount,
      taxRate: 0,
    } : it));
    setSearchQ((p) => p.map((q, i) => i === idx ? "" : q));
    setSearchOpen(idx);
  };

  const filteredVariants = (q: string) => {
    const base = (() => {
      if (!q) return allVariants.slice(0, 30);
      const lq = q.toLowerCase();
      return allVariants.filter((v) =>
        v.productName.toLowerCase().includes(lq)
        || v.sku.toLowerCase().includes(lq)
        || v.variantName.toLowerCase().includes(lq)
        || (v.barcode?.toLowerCase().includes(lq) ?? false)
        || (v.supplierProductCode?.toLowerCase().includes(lq) ?? false)
      );
    })();

    // If backend includes supplier linkage per variant, filter accordingly.
    // If not present, keep original behavior (don't hide products).
    const supplierFiltered =
      supplierId && base.some((v) => v.supplierId)
        ? base.filter((v) => (v.supplierId ? v.supplierId === supplierId : false))
        : base;

    return supplierFiltered.slice(0, 20);
  };

  const resolveVariantByCode = async (code: string): Promise<VariantOpt | null> => {
    const trimmed = code.trim();
    if (!trimmed) return null;
    const local = allVariants.find((v) =>
      v.sku.toLowerCase() === trimmed.toLowerCase()
      || v.barcode?.toLowerCase() === trimmed.toLowerCase()
    );
    if (local) return local;
    try {
      const res = await api.get<{
        variantId: string; productName: string; variantName: string; sku: string;
        barcode?: string;
        costPrice: number;
        stock: number;
        size?: string;
        color?: string;
        imageUrl?: string | null;
        sellingPrice?: number | null;
        availableStock?: number | null;
        reservedStock?: number | null;
        leadTimeDays?: number | null;
        lastPurchaseDate?: string | null;
        lastPurchaseQty?: number | null;
        soldAfterLastPurchase?: number | null;
        lastBuyingPrice?: number | null;
        supplierId?: string | null;
        supplierProductCode?: string | null;
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
        size: d.size,
        color: d.color,
        imageUrl: d.imageUrl ?? undefined,
        sellingPrice: d.sellingPrice ?? undefined,
        availableStock: d.availableStock ?? undefined,
        reservedStock: d.reservedStock ?? undefined,
        leadTimeDays: d.leadTimeDays ?? undefined,
        lastPurchaseDate: d.lastPurchaseDate ?? undefined,
        lastPurchaseQty: d.lastPurchaseQty ?? undefined,
        soldAfterLastPurchase: d.soldAfterLastPurchase ?? undefined,
        lastBuyingPrice: d.lastBuyingPrice ?? undefined,
        supplierId: d.supplierId ?? undefined,
        supplierProductCode: d.supplierProductCode ?? undefined,
      };
    } catch {
      return null;
    }
  };

  const handleItemSearchKeyDown = async (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setSearchOpen(null);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = (searchQ[idx] ?? "").trim();
    if (!q) return;

    const matches = filteredVariants(q);
    if (matches.length === 1) {
      selectVariant(idx, matches[0]);
      return;
    }
    if (matches.length > 1) {
      selectVariant(idx, matches[0]);
      return;
    }

    const resolved = await resolveVariantByCode(q);
    if (resolved) {
      selectVariant(idx, resolved);
      toast.success(`Added ${resolved.productName}`);
    } else {
      toast.error(`Product not found: ${q}`);
    }
  };

  const addVariantToItems = (v: VariantOpt) => {
    const newIdx = items.length;
    setItems((p) => [
      ...p,
      {
        variantId: v.variantId,
        productName: v.productName,
        variantName: v.variantName,
        sku: v.sku,
        size: v.size ?? undefined,
        color: v.color ?? undefined,
        barcode: v.barcode ?? undefined,
        imageUrl: v.imageUrl ?? undefined,
        orderedQty: 1,
        unitCost: v.costPrice,
        discount: 0,
        taxRate: v.taxRate ?? 0,
      },
    ]);
    setSearchQ((p) => [...p, ""]);
    setSearchOpen(null);
    setSelectedRowIdx(newIdx);

    // Close big search UI.
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

    const q = (productSearchQ ?? "").trim();
    if (!q) return;
    const matches = filteredVariants(q);
    if (matches.length) {
      addVariantToItems(matches[0]);
      return;
    }

    const resolved = await resolveVariantByCode(q);
    if (resolved) {
      toast.success(`Added ${resolved.productName}`);
      addVariantToItems(resolved);
    } else {
      toast.error(`Product not found: ${q}`);
    }
  };

  // ── Summary ────────────────────────────────────────────────────────────
  const subtotal  = items.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
  const totalDisc = items.reduce((s, i) => s + i.discount, 0);
  const totalTax  = items.reduce((s, i) => s + calcItem(i).tax, 0);
  const grandTotal = subtotal - totalDisc + totalTax;
  const totalQty   = items.reduce((s, i) => s + i.orderedQty, 0);

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = async (submitForApproval: boolean) => {
    if (!supplierId) { toast.error("Please select a supplier"); return; }
    if (!items.length) { toast.error("Add at least one item"); return; }
    if (items.some((i) => !i.variantId)) { toast.error("All rows must have a product selected"); return; }
    setSaving(true);
    try {
      const payload = {
        supplierId, expectedDate: expectedDate || undefined,
        notes: notes || undefined, reference: reference || undefined, paymentTerms,
        fromGrnId: fromGrnId || undefined,
        items: items.map((i) => ({
          variantId: i.variantId, productName: i.productName, variantName: i.variantName,
          sku: i.sku, orderedQty: i.orderedQty, unitCost: i.unitCost,
          discount: i.discount, taxRate: i.taxRate,
        })),
      };
      const res = await api.post<{ id: string }>("/purchases", payload);
      if (fromGrnId) {
        toast.success(
          fromGrnNumber
            ? `PO created & linked to ${fromGrnNumber} (already received)`
            : "PO created and linked to GRN",
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
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to create PO"); }
    finally { setSaving(false); }
  };

  const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const selectedItem = selectedRowIdx !== null ? items[selectedRowIdx] : null;
  const selectedVariant = selectedItem ? variantById.get(selectedItem.variantId) : undefined;
  const bigMatches = productSearchOpen ? filteredVariants(productSearchQ).slice(0, 15) : [];
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="min-h-screen bg-muted/20 pb-32 sm:pb-28">
      {/* Header */}
      <div className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="mx-auto flex w-full items-center gap-3 px-3 py-3 sm:px-6 sm:py-3.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5"
            onClick={() => router.push("/purchases")}
            disabled={saving}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold sm:text-lg">
              {fromGrnId ? "Create PO from GRN" : "Create Purchase Order"}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="rounded-full border bg-muted/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground sm:text-xs">
                Auto PO #
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:text-xs ${
                  fromGrnId
                    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700"
                    : "border-amber-500/20 bg-amber-500/10 text-amber-700"
                }`}
              >
                {fromGrnId ? "From GRN" : "Draft"}
              </span>
            </div>
          </div>
          <div className="hidden shrink-0 text-right md:block">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Grand total</p>
            <p className="text-sm font-bold tabular-nums text-primary">LKR {fmt(grandTotal)}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full space-y-4 px-3 py-4 sm:space-y-5 sm:px-6 sm:py-6">
        {grnPrefillLoading && (
          <div className="rounded-xl border bg-card p-4 text-sm text-muted-foreground">Loading GRN details…</div>
        )}
        {fromGrnId && fromGrnNumber && !grnPrefillLoading && (
          <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-300 sm:text-xs">
                Stock already posted
              </p>
              <p className="mt-0.5 text-sm">
                Creating PO from <span className="font-mono font-bold">{fromGrnNumber}</span> — no second stock add.
              </p>
            </div>
            <span className="w-fit shrink-0 rounded-full border bg-background/80 px-2.5 py-1 font-mono text-xs">
              {fromGrnNumber}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:gap-5">
          {/* Main */}
          <div className="min-w-0 space-y-4 sm:space-y-5">
            {/* Supplier */}
            <section className="space-y-4 rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
              <div>
                <h2 className="text-sm font-semibold">1. Supplier & terms</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Who you are ordering from</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
                  <label className="text-xs font-semibold text-muted-foreground">Supplier *</label>
                  <select
                    value={supplierId}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Choose a supplier…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  {supplier && (
                    <div className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                      <p className="font-semibold text-foreground">{supplier.name}</p>
                      <p className="mt-0.5 truncate">
                        {[supplier.contactPerson, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Expected delivery</label>
                  <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="h-10" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Payment terms</label>
                  <select
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Reference</label>
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="REF-…" className="h-10" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Currency</label>
                  <Input value="LKR" disabled className="h-10 bg-muted/40" />
                </div>

                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <label className="text-xs font-semibold text-muted-foreground">Notes</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Internal notes for this PO…"
                    className="w-full resize-none rounded-lg border bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            </section>

            {/* Items */}
            <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
              <div className="flex flex-col gap-3 border-b bg-muted/15 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4">
                <div className="min-w-0">
                  <h2 className="text-sm font-semibold">2. Purchase items</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">Search or scan, then set qty & cost</p>
                </div>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold tabular-nums text-primary">
                      {items.length} · qty {totalQty}
                    </span>
                  )}
                  <Button size="sm" onClick={addRow} disabled={saving} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Add row
                  </Button>
                </div>
              </div>

              {/* Search */}
              <div className="relative border-b px-3 py-3 sm:px-5">
                <Search className="pointer-events-none absolute left-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground sm:left-8" />
                <ScanLine className="pointer-events-none absolute right-6 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70 sm:right-8" />
                <input
                  value={productSearchQ}
                  onChange={(e) => {
                    setProductSearchQ(e.target.value);
                    setProductSearchOpen(true);
                  }}
                  onFocus={() => setProductSearchOpen(true)}
                  onKeyDown={handleBigSearchKeyDown}
                  placeholder="Search name, SKU, barcode… Enter to add"
                  className="h-11 w-full rounded-xl border bg-background pl-10 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {productSearchOpen && productSearchQ.trim() && (
                  <div className="absolute left-3 right-3 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-background shadow-xl sm:left-5 sm:right-5">
                    <div className="max-h-64 overflow-y-auto">
                      {bigMatches.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
                          No match — press Enter to scan barcode/SKU
                        </p>
                      ) : (
                        bigMatches.map((v) => (
                          <button
                            key={v.variantId}
                            type="button"
                            onClick={() => addVariantToItems(v)}
                            className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50 sm:px-4"
                          >
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/30">
                              {v.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={v.imageUrl} alt={v.productName} className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-4 w-4 text-muted-foreground/60" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium">{v.productName}</p>
                              <p className="truncate text-xs text-muted-foreground">
                                <span className="font-mono">{v.sku}</span>
                                {v.variantName ? ` · ${v.variantName}` : ""}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs font-semibold tabular-nums">LKR {v.costPrice.toLocaleString()}</p>
                              <p className="text-[10px] tabular-nums text-muted-foreground">Stock {v.stock}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mobile / tablet cards */}
              <div className="divide-y lg:hidden">
                {items.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-muted-foreground">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                      <Package className="h-6 w-6 opacity-40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">No items yet</p>
                      <p className="mt-1 text-xs">Search above or add a blank row</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={addRow} disabled={saving} className="mt-1 gap-1.5">
                      <Plus className="h-3.5 w-3.5" /> Add first item
                    </Button>
                  </div>
                ) : (
                  items.map((item, idx) => {
                    const v = item.variantId ? variantById.get(item.variantId) : undefined;
                    const { total } = calcItem(item);
                    const q = searchQ[idx] ?? "";
                    const matches = searchOpen === idx ? filteredVariants(q) : [];
                    const stock = v?.stock ?? null;
                    const selected = selectedRowIdx === idx;

                    return (
                      <div
                        key={idx}
                        onClick={() => setSelectedRowIdx(idx)}
                        className={`space-y-3 p-3 sm:p-4 ${selected ? "bg-primary/5" : ""}`}
                      >
                        {item.variantId ? (
                          <div className="flex items-start gap-3">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/30">
                              {item.imageUrl || v?.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={item.imageUrl || v?.imageUrl || ""} alt={item.productName} className="h-full w-full object-cover" />
                              ) : (
                                <Package className="h-5 w-5 text-muted-foreground/60" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold leading-snug">{item.productName}</p>
                              <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                {item.sku}{item.variantName ? ` · ${item.variantName}` : ""}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Stock {stock ?? "—"}
                                {item.size ? ` · ${item.size}` : ""}
                                {item.color ? ` · ${item.color}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); clearVariant(idx); }}
                                className="text-[11px] font-semibold text-primary hover:underline"
                              >
                                Change
                              </button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeRow(idx); }}
                                className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                                aria-label="Remove row"
                                disabled={saving}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <input
                              value={q}
                              onChange={(e) => setSearchQ((p) => p.map((x, i) => (i === idx ? e.target.value : x)))}
                              onFocus={() => setSearchOpen(idx)}
                              onKeyDown={(e) => handleItemSearchKeyDown(idx, e)}
                              placeholder="Search or scan…"
                              className="h-10 w-full rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                            {searchOpen === idx && (
                              <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-background shadow-xl">
                                <div className="max-h-48 overflow-y-auto">
                                  {matches.length === 0 ? (
                                    <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                      {q ? "No match — press Enter" : "Type to search"}
                                    </p>
                                  ) : matches.map((vv) => (
                                    <button
                                      key={vv.variantId}
                                      type="button"
                                      onClick={() => selectVariant(idx, vv)}
                                      className="flex w-full items-center justify-between gap-2 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{vv.productName}</p>
                                        <p className="truncate text-xs text-muted-foreground">{vv.sku} · {vv.variantName}</p>
                                      </div>
                                      <span className="shrink-0 text-xs font-semibold tabular-nums">LKR {vv.costPrice.toLocaleString()}</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" onClick={(e) => e.stopPropagation()}>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Qty</label>
                            <input
                              type="number"
                              min={1}
                              value={item.orderedQty}
                              onChange={(e) => updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Cost</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Discount</label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase text-muted-foreground">Tax %</label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={item.taxRate}
                              onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)}
                              className="h-9 w-full rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between border-t pt-2 text-sm">
                          <span className="text-xs text-muted-foreground">Line total</span>
                          <span className="font-bold tabular-nums text-primary">LKR {fmt(total)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[860px] text-sm">
                  <thead className="border-b bg-muted/40">
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left font-semibold">Product</th>
                      <th className="px-3 py-3 text-right font-semibold">Stock</th>
                      <th className="px-3 py-3 text-right font-semibold">Qty</th>
                      <th className="px-3 py-3 text-right font-semibold">Buying</th>
                      <th className="px-3 py-3 text-right font-semibold">Disc</th>
                      <th className="px-3 py-3 text-right font-semibold">Tax %</th>
                      <th className="px-3 py-3 text-right font-semibold">Total</th>
                      <th className="w-12 px-2 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item, idx) => {
                      const v = item.variantId ? variantById.get(item.variantId) : undefined;
                      const { total } = calcItem(item);
                      const q = searchQ[idx] ?? "";
                      const matches = searchOpen === idx ? filteredVariants(q) : [];
                      const stock = v?.stock ?? null;
                      const status = v?.status ?? (stock !== null ? (stock <= 0 ? "out_of_stock" : stock < 5 ? "low_stock" : "in_stock") : "unknown");
                      const statusPill =
                        status === "in_stock"
                          ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                          : status === "low_stock"
                            ? "bg-amber-500/10 text-amber-700 border-amber-500/20"
                            : "bg-rose-500/10 text-rose-700 border-rose-500/20";

                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedRowIdx(idx)}
                          className={`cursor-pointer align-top transition-colors hover:bg-muted/15 ${
                            selectedRowIdx === idx ? "bg-primary/5 ring-1 ring-inset ring-primary/25" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            {item.variantId ? (
                              <div className="flex min-w-0 items-start gap-3">
                                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/30">
                                  {item.imageUrl || v?.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl || v?.imageUrl || ""} alt={item.productName} className="h-full w-full object-cover" />
                                  ) : (
                                    <Package className="h-4 w-4 text-muted-foreground/60" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-medium">{item.productName}</p>
                                  <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                                    {item.sku}{item.variantName ? ` · ${item.variantName}` : ""}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                                    {status !== "unknown" && (
                                      <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-semibold ${statusPill}`}>
                                        {status.replaceAll("_", " ")}
                                      </span>
                                    )}
                                    {(item.size || item.color) && (
                                      <span className="rounded-full border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {[item.size, item.color].filter(Boolean).join(" · ")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); clearVariant(idx); }}
                                  className="shrink-0 text-[11px] font-semibold text-primary hover:underline"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <div className="relative" onClick={(e) => e.stopPropagation()}>
                                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                                <input
                                  value={q}
                                  onChange={(e) => setSearchQ((p) => p.map((x, i) => (i === idx ? e.target.value : x)))}
                                  onFocus={() => setSearchOpen(idx)}
                                  onKeyDown={(e) => handleItemSearchKeyDown(idx, e)}
                                  placeholder="Search name, SKU, or scan…"
                                  className="h-9 w-full rounded-lg border bg-background pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                                {searchOpen === idx && (
                                  <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border bg-background shadow-xl">
                                    <div className="max-h-52 overflow-y-auto">
                                      {matches.length === 0 ? (
                                        <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                                          {q ? "No match — press Enter" : "Type to search"}
                                        </p>
                                      ) : matches.map((vv) => (
                                        <button
                                          key={vv.variantId}
                                          type="button"
                                          onClick={() => selectVariant(idx, vv)}
                                          className="flex w-full items-center gap-3 border-b px-3 py-2.5 text-left last:border-0 hover:bg-muted/50"
                                        >
                                          <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium">{vv.productName}</p>
                                            <p className="truncate text-xs text-muted-foreground">{vv.sku} · {vv.variantName}</p>
                                          </div>
                                          <div className="shrink-0 text-right">
                                            <p className="text-xs font-semibold tabular-nums">LKR {vv.costPrice.toLocaleString()}</p>
                                            <p className="text-[10px] tabular-nums text-muted-foreground">Stock {vv.stock}</p>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">{stock ?? "—"}</td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={1}
                              value={item.orderedQty}
                              onChange={(e) => updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="h-9 w-[4.5rem] rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                              className="h-9 w-24 rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                              className="h-9 w-20 rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={item.taxRate}
                              onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)}
                              className="h-9 w-16 rounded-lg border bg-background px-2 text-right text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-3 text-right font-bold tabular-nums text-primary whitespace-nowrap">{fmt(total)}</td>
                          <td className="px-2 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => removeRow(idx)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Remove row"
                              disabled={saving}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}

                    {items.length === 0 && (
                      <tr>
                        <td colSpan={8} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/50">
                              <Package className="h-6 w-6 opacity-40" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">No items yet</p>
                              <p className="mt-1 text-xs">Use search above or add a row</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={addRow} disabled={saving} className="mt-1 gap-1.5">
                              <Plus className="h-3.5 w-3.5" /> Add first item
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {items.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/10 px-4 py-3 text-sm sm:px-5">
                  <span className="text-xs text-muted-foreground sm:text-sm">
                    {items.length} line{items.length === 1 ? "" : "s"} · {totalQty} units
                  </span>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm">
                    <span className="tabular-nums text-muted-foreground">Sub <strong className="text-foreground">LKR {fmt(subtotal)}</strong></span>
                    {totalDisc > 0 && (
                      <span className="tabular-nums text-emerald-600">Disc −LKR {fmt(totalDisc)}</span>
                    )}
                    <span className="font-bold tabular-nums text-primary">Total LKR {fmt(grandTotal)}</span>
                  </div>
                </div>
              )}
            </section>

            {/* Selected details — mobile/tablet only (sidebar on xl) */}
            <section className="space-y-3 rounded-2xl border bg-background p-4 shadow-sm xl:hidden sm:p-5">
              <div>
                <h2 className="text-sm font-semibold">Selected product</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Tap a row to see stock context</p>
              </div>
              {!selectedItem ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  No row selected
                </p>
              ) : (
                <SelectedProductPanel item={selectedItem} variant={selectedVariant} supplierName={supplier?.name} />
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-4 xl:sticky xl:top-24">
            <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
              <h3 className="text-sm font-semibold">Summary</h3>
              <div className="mt-3 space-y-2.5 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Products</span>
                  <span className="font-semibold tabular-nums">{items.length}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Quantity</span>
                  <span className="font-semibold tabular-nums">{totalQty}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-semibold tabular-nums">LKR {fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Discount</span>
                  <span className="font-semibold tabular-nums text-emerald-600">− LKR {fmt(totalDisc)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Tax</span>
                  <span className="font-semibold tabular-nums">LKR {fmt(totalTax)}</span>
                </div>
                <div className="flex justify-between gap-3 border-t pt-2.5">
                  <span className="font-bold">Grand total</span>
                  <span className="font-bold tabular-nums text-primary">LKR {fmt(grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="hidden rounded-2xl border bg-background p-4 shadow-sm xl:block sm:p-5">
              <h3 className="text-sm font-semibold">Selected product</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">Click a table row</p>
              <div className="mt-3">
                {!selectedItem ? (
                  <p className="rounded-xl border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                    No row selected
                  </p>
                ) : (
                  <SelectedProductPanel item={selectedItem} variant={selectedVariant} supplierName={supplier?.name} compact />
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-background p-4 shadow-sm sm:p-5">
              <h3 className="text-sm font-semibold">Order info</h3>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Created by</span>
                  <span className="truncate font-semibold">{user?.name ?? "—"}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Date</span>
                  <span className="font-semibold tabular-nums">{todayIso}</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-6 sm:py-3">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <div className="md:hidden">
              <p className="text-[10px] text-muted-foreground">Total</p>
              <p className="text-sm font-bold tabular-nums text-primary">LKR {fmt(grandTotal)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push("/purchases")} disabled={saving}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => submit(false)}
                disabled={saving || !supplierId || items.length === 0}
                className="hidden sm:inline-flex"
              >
                Save draft
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => submit(false)}
              disabled={saving || !supplierId || items.length === 0}
              className="flex-1 sm:hidden"
            >
              Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              disabled={saving || items.length === 0}
              className="hidden gap-1.5 md:inline-flex"
            >
              <Printer className="h-4 w-4" />
              Print
            </Button>
            {fromGrnId ? (
              <Button
                size="sm"
                onClick={() => submit(false)}
                disabled={saving || !supplierId || items.length === 0 || grnPrefillLoading}
                className="flex-1 gap-1.5 bg-emerald-600 hover:bg-emerald-700 sm:flex-none"
              >
                <FileText className="h-4 w-4" />
                <span className="truncate">Create & link GRN</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => submit(true)}
                disabled={saving || !supplierId || items.length === 0}
                className="flex-1 gap-1.5 sm:flex-none"
              >
                <FileText className="h-4 w-4" />
                Create PO
              </Button>
            )}
          </div>
        </div>
      </div>

      {(searchOpen !== null || (productSearchOpen && productSearchQ.trim())) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => {
            setSearchOpen(null);
            setProductSearchOpen(false);
          }}
        />
      )}
    </div>
  );
}

function SelectedProductPanel({
  item,
  variant,
  supplierName,
  compact,
}: {
  item: LineItem;
  variant?: VariantOpt;
  supplierName?: string;
  compact?: boolean;
}) {
  const rows: [string, string | number][] = [
    ["Barcode", variant?.barcode ?? item.barcode ?? "—"],
    ["Stock", variant?.stock ?? "—"],
    ["Available", variant?.availableStock ?? "—"],
    ["Reserved", variant?.reservedStock ?? "—"],
    ["Last PO", variant?.lastPurchaseDate ?? "—"],
    ["Last qty", variant?.lastPurchaseQty ?? "—"],
    ["Sold after", variant?.soldAfterLastPurchase ?? "—"],
    ["Last cost", variant?.lastBuyingPrice ?? "—"],
    ["Selling", variant?.sellingPrice ?? variant?.unitPrice ?? "—"],
    ["Supplier", supplierName ?? "—"],
    ["Lead days", variant?.leadTimeDays ?? "—"],
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/30 ${compact ? "h-12 w-12" : "h-14 w-14"}`}>
          {(item.imageUrl || variant?.imageUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.imageUrl || variant?.imageUrl || ""} alt={item.productName} className="h-full w-full object-cover" />
          ) : (
            <Package className="h-5 w-5 text-muted-foreground/60" />
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{item.productName}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{item.sku}</p>
          {item.variantName && <p className="truncate text-xs text-muted-foreground">{item.variantName}</p>}
        </div>
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}`}>
        {rows.map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-lg border bg-muted/10 px-2.5 py-2">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-0.5 truncate text-xs font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
