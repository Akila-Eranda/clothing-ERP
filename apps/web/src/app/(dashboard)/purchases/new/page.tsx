"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, FileText, Package, Paperclip, Plus, Printer, Search, ScanLine, Trash2, Upload } from "lucide-react";
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
    <div className="min-h-screen bg-muted/30 pb-28">
      {/* Top Header */}
      <div className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b">
        <div className="max-w-[1800px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 shrink-0"
              onClick={() => router.push("/purchases")}
              disabled={saving}
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <div className="min-w-0">
              <h1 className="text-lg font-bold truncate">
                {fromGrnId ? "Create PO from GRN" : "Create Purchase Order"}
              </h1>
              <div className="mt-1 flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">PO Number</span>
                <span className="text-xs font-mono bg-muted/50 border px-2 py-0.5 rounded-full">Auto-generated</span>
                <span className={`text-xs font-semibold border px-2 py-0.5 rounded-full ${
                  fromGrnId
                    ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20"
                    : "bg-amber-500/10 text-amber-700 border-amber-500/20"
                }`}>
                  {fromGrnId ? "From GRN" : "Draft"}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1800px] mx-auto p-6 space-y-6">
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
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-6 items-start">
          {/* Main */}
          <div className="space-y-6">
            {/* Section 01: Supplier Information */}
            <div className="bg-background border rounded-2xl shadow-sm p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Supplier Information</h2>
                  <p className="text-xs text-muted-foreground mt-1">Supplier, delivery, payment terms & notes</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Supplier *</label>
                  <select
                    value={supplierId}
                    onChange={(e) => handleSupplierChange(e.target.value)}
                    className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Choose a supplier…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>

                  {supplier && (
                    <div className="rounded-xl border bg-muted/20 p-3 space-y-1">
                      <p className="text-sm font-semibold">{supplier.name}</p>
                      {supplier.contactPerson && <p className="text-xs text-muted-foreground">{supplier.contactPerson}</p>}
                      {(supplier.phone || supplier.email) && (
                        <div className="pt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          {supplier.phone && <span className="inline-flex items-center gap-2">📞 {supplier.phone}</span>}
                          {supplier.email && <span className="inline-flex items-center gap-2">✉️ {supplier.email}</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>

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
                    {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
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

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Currency</label>
                  <Input value="LKR" disabled className="h-10 bg-muted/40" />
                </div>

                <div className="space-y-2">
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

            {/* Section 02: Product Search */}
            <div className="bg-background border rounded-2xl shadow-sm p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Product Search</h2>
                  <p className="text-xs text-muted-foreground mt-1">Search by product name, SKU, barcode, supplier product code</p>
                </div>
                <Button size="sm" variant="outline" className="gap-1.5" onClick={addRow} disabled={saving}>
                  <Plus className="h-4 w-4" /> Add Row
                </Button>
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
                  placeholder="Type to search… press Enter to add"
                  className="w-full pl-10 pr-10 py-3 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />

                {productSearchOpen && productSearchQ.trim() && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-xl shadow-xl mt-2 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {bigMatches.length === 0 ? (
                        <p className="px-4 py-6 text-center text-muted-foreground text-xs">
                          No match — press Enter to scan barcode/SKU
                        </p>
                      ) : (
                        bigMatches.map((v) => {
                          return (
                            <button
                              key={v.variantId}
                              type="button"
                              onClick={() => addVariantToItems(v)}
                              className="w-full px-4 py-3 hover:bg-muted/50 text-left flex items-center gap-3 border-b last:border-0"
                            >
                              <div className="h-9 w-9 rounded-lg bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                                {v.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={v.imageUrl} alt={v.productName} className="h-full w-full object-cover" />
                                ) : (
                                  <Package className="h-4 w-4 text-muted-foreground/60" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm truncate">{v.productName}</p>
                                <p className="text-muted-foreground text-xs truncate">
                                  <span className="font-mono">{v.sku}</span>
                                  {v.variantName ? ` · ${v.variantName}` : ""}
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-xs font-semibold tabular-nums">LKR {v.costPrice.toLocaleString()}</p>
                                <p className="text-[10px] text-muted-foreground tabular-nums">Stock {v.stock}</p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Section 03: Purchase Items Table */}
            <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b bg-muted/20">
                <div>
                  <h2 className="text-sm font-semibold">Purchase Items</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select a row to see detailed stock & supplier context
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {items.length > 0 && (
                    <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full tabular-nums">
                      {items.length} products
                    </span>
                  )}
                  <Button size="sm" onClick={addRow} disabled={saving} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[1280px]">
                  <thead className="bg-muted/40 border-b">
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 text-left font-semibold w-[280px]">Product</th>
                      <th className="px-4 py-3 text-left font-semibold w-[110px]">SKU</th>
                      <th className="px-4 py-3 text-left font-semibold w-[110px]">Storage</th>
                      <th className="px-4 py-3 text-left font-semibold w-[100px]">Color</th>
                      <th className="px-4 py-3 text-right font-semibold w-[130px]">Current Stock</th>
                      <th className="px-4 py-3 text-left font-semibold w-[140px]">Last PO Date</th>
                      <th className="px-4 py-3 text-right font-semibold w-[120px]">Last PO Qty</th>
                      <th className="px-4 py-3 text-right font-semibold w-[160px]">Sold After Last PO</th>
                      <th className="px-4 py-3 text-right font-semibold w-[120px]">Order Qty</th>
                      <th className="px-4 py-3 text-right font-semibold w-[140px]">Buying Price</th>
                      <th className="px-4 py-3 text-right font-semibold w-[120px]">Discount</th>
                      <th className="px-4 py-3 text-right font-semibold w-[110px]">Tax %</th>
                      <th className="px-4 py-3 text-right font-semibold w-[140px]">Total</th>
                      <th className="px-4 py-3 w-[70px] text-right" />
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
                          ? "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20"
                          : status === "low_stock"
                            ? "bg-amber-500/10 text-amber-700 border border-amber-500/20"
                            : "bg-rose-500/10 text-rose-700 border border-rose-500/20";

                      const storageLabel = item.size ?? null;
                      const colorLabel = item.color ?? null;
                      return (
                        <tr
                          key={idx}
                          onClick={() => setSelectedRowIdx(idx)}
                          className={[
                            "align-top hover:bg-muted/15 transition-colors cursor-pointer",
                            selectedRowIdx === idx ? "ring-2 ring-primary/30 bg-primary/5" : "",
                          ].join(" ")}
                        >
                          {/* Product */}
                          <td className="px-4 py-3">
                            {item.variantId ? (
                              <div className="flex items-start gap-3 min-w-0">
                                <div className="h-12 w-12 rounded-xl bg-muted/30 overflow-hidden shrink-0 flex items-center justify-center">
                                  {item.imageUrl || v?.imageUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={item.imageUrl || v?.imageUrl || ""} alt={item.productName} className="h-full w-full object-cover" />
                                  ) : (
                                    <Package className="h-5 w-5 text-muted-foreground/60" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="font-medium text-sm leading-snug truncate">{item.productName}</p>
                                  <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                                    {item.sku}
                                    {item.variantName ? ` · ${item.variantName}` : ""}
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/15 tabular-nums">
                                      {item.sku}
                                    </span>
                                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusPill}`}>
                                      {status === "unknown" ? "—" : status.replaceAll("_", " ")}
                                    </span>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/50 border text-muted-foreground">
                                      {storageLabel ?? "—"}
                                    </span>
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-muted/50 border text-muted-foreground">
                                      {colorLabel ?? "—"}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    clearVariant(idx);
                                  }}
                                  className="text-[11px] font-semibold text-primary hover:underline shrink-0"
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                                <ScanLine className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/70 pointer-events-none" />
                                <input
                                  value={q}
                                  onChange={(e) => setSearchQ((p) => p.map((x, i) => i === idx ? e.target.value : x))}
                                  onFocus={() => setSearchOpen(idx)}
                                  onKeyDown={(e) => handleItemSearchKeyDown(idx, e)}
                                  placeholder="Search name, SKU, or scan barcode…"
                                  className="w-full pl-8 pr-8 py-2 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                                  onClick={(e) => e.stopPropagation()}
                                />
                                {searchOpen === idx && (
                                  <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-xl shadow-xl mt-1 overflow-hidden">
                                    <div className="max-h-52 overflow-y-auto">
                                      {matches.length === 0 ? (
                                        <p className="px-3 py-5 text-center text-muted-foreground text-xs">
                                          {q ? "No match — press Enter to scan barcode/SKU" : "Type to search products"}
                                        </p>
                                      ) : matches.map((vv) => (
                                        <button
                                          key={vv.variantId}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            selectVariant(idx, vv);
                                          }}
                                          className="w-full px-3 py-2.5 hover:bg-muted/50 text-left flex items-center gap-3 border-b last:border-0"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <p className="font-medium text-sm truncate">{vv.productName}</p>
                                            <p className="text-muted-foreground text-xs truncate">
                                              {vv.sku} · {vv.variantName}
                                            </p>
                                          </div>
                                          <div className="text-right shrink-0">
                                            <p className="text-xs font-semibold tabular-nums">LKR {vv.costPrice.toLocaleString()}</p>
                                            <p className="text-[10px] text-muted-foreground tabular-nums">Stock {vv.stock}</p>
                                          </div>
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </td>

                          {/* SKU */}
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/50 border text-xs font-mono tabular-nums">
                              {item.sku || "—"}
                            </span>
                          </td>

                          {/* Storage */}
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/50 border text-xs text-muted-foreground">
                              {item.size ?? "—"}
                            </span>
                          </td>

                          {/* Color */}
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted/50 border text-xs text-muted-foreground">
                              {item.color ?? "—"}
                            </span>
                          </td>

                          {/* Current Stock */}
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-semibold tabular-nums">
                              {stock === null ? "—" : stock}
                            </span>
                          </td>

                          {/* Last PO Date */}
                          <td className="px-4 py-3">
                            <span className="text-xs text-muted-foreground">{v?.lastPurchaseDate ?? "-"}</span>
                          </td>

                          {/* Last PO Qty */}
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs text-muted-foreground tabular-nums">{v?.lastPurchaseQty ?? "-"}</span>
                          </td>

                          {/* Sold After Last PO */}
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs text-muted-foreground tabular-nums">{v?.soldAfterLastPurchase ?? "-"}</span>
                          </td>

                          {/* Order Qty */}
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={1}
                              value={item.orderedQty}
                              onChange={(e) => updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value, 10) || 1))}
                              className="w-24 text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>

                          {/* Buying Price */}
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                              className="w-28 text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>

                          {/* Discount */}
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.discount}
                              onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                              className="w-24 text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>

                          {/* Tax % (kept to preserve existing functionality) */}
                          <td className="px-4 py-3 text-right">
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.1"
                              value={item.taxRate}
                              onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)}
                              className="w-20 text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </td>

                          {/* Total */}
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-bold text-primary tabular-nums whitespace-nowrap">
                              {fmt(total)}
                            </span>
                          </td>

                          {/* Delete */}
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeRow(idx);
                              }}
                              className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10"
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
                        <td colSpan={14} className="py-16 text-center">
                          <div className="flex flex-col items-center gap-3 text-muted-foreground">
                            <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                              <Package className="h-6 w-6 opacity-40" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">No items yet</p>
                              <p className="text-xs mt-1">Use the product search above or add a row.</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={addRow} disabled={saving} className="gap-1.5 mt-1">
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
                <div className="px-6 py-3 border-t bg-muted/10">
                  <div className="flex items-center justify-between text-sm">
                    <div className="text-muted-foreground">
                      Totals <span className="text-muted-foreground font-normal">({items.length} items)</span>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Subtotal</div>
                        <div className="font-semibold tabular-nums">LKR {fmt(subtotal)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Discount</div>
                        <div className="font-semibold text-green-600 tabular-nums">− LKR {fmt(totalDisc)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Tax</div>
                        <div className="font-semibold tabular-nums">LKR {fmt(totalTax)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Grand Total</div>
                        <div className="font-bold text-primary tabular-nums">LKR {fmt(grandTotal)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Section 04: Selected Product Details */}
            <div className="bg-background border rounded-2xl shadow-sm p-6 space-y-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-semibold">Selected Product Details</h2>
                  <p className="text-xs text-muted-foreground mt-1">Read-only snapshot for the selected row</p>
                </div>
              </div>

              {!selectedItem ? (
                <div className="rounded-xl border border-dashed p-8 text-center">
                  <p className="text-sm text-muted-foreground">Click a row in the items table to view details.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="flex items-center gap-4">
                    <div className="h-16 w-16 rounded-2xl bg-muted/30 overflow-hidden flex items-center justify-center">
                      {(selectedItem.imageUrl || selectedVariant?.imageUrl) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={selectedItem.imageUrl || selectedVariant?.imageUrl || ""}
                          alt={selectedItem.productName}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <Package className="h-7 w-7 text-muted-foreground/60" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{selectedItem.productName}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{selectedItem.sku}</p>
                      <p className="text-xs text-muted-foreground mt-1">{selectedItem.variantName ? selectedItem.variantName : "—"}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {[
                      ["Barcode", selectedVariant?.barcode ?? selectedItem.barcode ?? "-"],
                      ["Current Stock", selectedVariant?.stock ?? "-"],
                      ["Available Stock", selectedVariant?.availableStock ?? "-"],
                      ["Reserved Stock", selectedVariant?.reservedStock ?? "-"],
                      ["Last Purchase Date", selectedVariant?.lastPurchaseDate ?? "-"],
                      ["Last Purchase Qty", selectedVariant?.lastPurchaseQty ?? "-"],
                      ["Sold After Last Purchase", selectedVariant?.soldAfterLastPurchase ?? "-"],
                      ["Last Buying Price", selectedVariant?.lastBuyingPrice ?? "-"],
                    ].map(([label, value]) => (
                      <div key={label} className="space-y-1">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                        <div className="text-sm font-semibold tabular-nums">{value ?? "-"}</div>
                      </div>
                    ))}
                  </div>

                  <div className="md:col-span-2 border rounded-2xl p-4 bg-muted/10">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        ["Current Buying Price", selectedItem.unitCost ?? 0],
                        ["Selling Price", selectedVariant?.sellingPrice ?? selectedVariant?.unitPrice ?? "-"],
                        ["Supplier", supplier?.name ?? "-"],
                        ["Lead Time", selectedVariant?.leadTimeDays ?? "-"],
                      ].map(([label, value]) => (
                        <div key={label} className="space-y-1">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
                          <div className="text-sm font-semibold tabular-nums">{value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            <div className="sticky top-24 space-y-6">
              {/* Sticky Summary Card */}
              <div className="bg-background border rounded-2xl shadow-sm p-6">
                <h3 className="text-sm font-semibold">Summary</h3>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Products</span>
                    <span className="font-semibold tabular-nums">{items.length}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Quantity</span>
                    <span className="font-semibold tabular-nums">{totalQty}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold tabular-nums">LKR {fmt(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Discount</span>
                    <span className="font-semibold text-green-600 tabular-nums">− LKR {fmt(totalDisc)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-semibold tabular-nums">LKR {fmt(totalTax)}</span>
                  </div>
                  <div className="pt-2 border-t flex items-center justify-between">
                    <span className="font-bold">Grand Total</span>
                    <span className="font-bold text-primary tabular-nums">LKR {fmt(grandTotal)}</span>
                  </div>
                </div>
              </div>

              {/* Attachments */}
              <div className="bg-background border rounded-2xl shadow-sm p-6">
                <h3 className="text-sm font-semibold">Attachments</h3>
                <p className="text-xs text-muted-foreground mt-1">Upload supplier quotation and other documents</p>
                <div className="mt-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                      <Upload className="h-3.5 w-3.5" /> Upload Supplier Quotation
                    </label>
                    <input type="file" className="w-full text-sm" />
                    <p className="text-[11px] text-muted-foreground">Backend upload is not enabled for this screen.</p>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                      <Paperclip className="h-3.5 w-3.5" /> Upload Other Documents
                    </label>
                    <input type="file" className="w-full text-sm" />
                  </div>
                </div>
              </div>

              {/* Order Information */}
              <div className="bg-background border rounded-2xl shadow-sm p-6">
                <h3 className="text-sm font-semibold">Order Information</h3>
                <div className="mt-4 grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Created By</span>
                    <span className="font-semibold">{user?.name ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Branch</span>
                    <span className="font-semibold">{user?.branchId ?? "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Warehouse</span>
                    <span className="font-semibold">—</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Date</span>
                    <span className="font-semibold tabular-nums">{todayIso}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Footer */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t">
        <div className="max-w-[1800px] mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/purchases")} disabled={saving}>
              Cancel
            </Button>
            <Button variant="outline" onClick={() => submit(false)} disabled={saving || !supplierId || items.length === 0}>
              Save Draft
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => {
                window.print();
              }}
              disabled={saving || items.length === 0}
              className="gap-2"
            >
              <Printer className="h-4 w-4" />
              Print Preview
            </Button>
            {fromGrnId ? (
              <Button
                onClick={() => submit(false)}
                disabled={saving || !supplierId || items.length === 0 || grnPrefillLoading}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                <FileText className="h-4 w-4" />
                Create PO & Link GRN
              </Button>
            ) : (
              <Button onClick={() => submit(true)} disabled={saving || !supplierId || items.length === 0} className="gap-2">
                <FileText className="h-4 w-4" />
                Create Purchase Order
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
