"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Search, ScanLine, Package } from "lucide-react";
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
  variantId: string; productName: string; variantName: string; sku: string;
  barcode?: string;
  size?: string | null; color?: string | null; costPrice: number; taxRate?: number;
  stock: number;
}
interface LineItem {
  variantId: string; productName: string; variantName: string; sku: string;
  size?: string | null; color?: string | null;
  orderedQty: number; unitCost: number; discount: number; taxRate: number;
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

  // item search
  const [searchQ,      setSearchQ]      = useState<string[]>([]);   // per-row search query
  const [searchOpen,   setSearchOpen]   = useState<number | null>(null);

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

  // ── Items logic ────────────────────────────────────────────────────────
  const addRow = () => {
    setItems((p) => [...p, { variantId: "", productName: "", variantName: "", sku: "", orderedQty: 1, unitCost: 0, discount: 0, taxRate: 0 }]);
    setSearchQ((p) => [...p, ""]);
    setSearchOpen(items.length);
  };

  const removeRow = (idx: number) => {
    setItems((p) => p.filter((_, i) => i !== idx));
    setSearchQ((p) => p.filter((_, i) => i !== idx));
    setSearchOpen(null);
  };

  const updateItem = <K extends keyof LineItem>(idx: number, key: K, val: LineItem[K]) => {
    setItems((p) => p.map((it, i) => i === idx ? { ...it, [key]: val } : it));
  };

  const selectVariant = (idx: number, v: VariantOpt) => {
    setItems((p) => p.map((it, i) => i === idx ? {
      ...it, variantId: v.variantId, productName: v.productName,
      variantName: v.variantName, sku: v.sku, size: v.size ?? undefined,
      color: v.color ?? undefined, unitCost: v.costPrice, taxRate: v.taxRate ?? 0,
    } as LineItem : it));
    setSearchQ((p) => p.map((q, i) => i === idx ? "" : q));
    setSearchOpen(null);
  };

  const clearVariant = (idx: number) => {
    setItems((p) => p.map((it, i) => i === idx ? {
      variantId: "", productName: "", variantName: "", sku: "",
      orderedQty: it.orderedQty, unitCost: 0, discount: it.discount, taxRate: 0,
    } as LineItem : it));
    setSearchQ((p) => p.map((q, i) => i === idx ? "" : q));
    setSearchOpen(idx);
  };

  const filteredVariants = (q: string) => {
    if (!q) return allVariants.slice(0, 30);
    const lq = q.toLowerCase();
    return allVariants.filter((v) =>
      v.productName.toLowerCase().includes(lq)
      || v.sku.toLowerCase().includes(lq)
      || v.variantName.toLowerCase().includes(lq)
      || (v.barcode?.toLowerCase().includes(lq) ?? false)
    ).slice(0, 20);
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
        barcode?: string; costPrice: number; stock: number; size?: string; color?: string;
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
        items: items.map((i) => ({
          variantId: i.variantId, productName: i.productName, variantName: i.variantName,
          sku: i.sku, orderedQty: i.orderedQty, unitCost: i.unitCost,
          discount: i.discount, taxRate: i.taxRate,
        })),
      };
      const res = await api.post<{ id: string }>("/purchases", payload);
      if (submitForApproval) {
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

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="p-6 space-y-6">

        {/* ── Top section: 3 columns ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_300px] gap-5">

          {/* ── PO Details ── */}
          <div className="bg-background border rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="font-semibold text-base border-b pb-2">Purchase Order Details</h3>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">PO Number</label>
              <Input value="Auto-generated" disabled className="mt-1.5 bg-muted/40 text-sm" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Order Date</label>
                <Input type="date" defaultValue={new Date().toISOString().split("T")[0]} className="mt-1.5 text-sm" readOnly />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Expected Delivery</label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="mt-1.5 text-sm" />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reference</label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. REF-2026-001" className="mt-1.5 text-sm" />
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Payment Terms</label>
              <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                className="mt-1.5 w-full text-sm border rounded-lg px-3 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Internal Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Notes visible to your team only..."
                className="mt-1.5 w-full text-sm border rounded-lg px-3 py-2.5 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {/* ── Supplier ── */}
          <div className="bg-background border rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="font-semibold text-base border-b pb-2">Supplier</h3>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Select Supplier *</label>
              <select value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)}
                className="mt-1.5 w-full text-sm border rounded-lg px-3 py-2.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Choose a supplier...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {supplier ? (
              <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-base shrink-0">
                    {supplier.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{supplier.name}</p>
                    {supplier.contactPerson && <p className="text-xs text-muted-foreground">{supplier.contactPerson}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  {supplier.phone   && <p className="text-xs text-muted-foreground flex items-center gap-2">📞 {supplier.phone}</p>}
                  {supplier.email   && <p className="text-xs text-muted-foreground flex items-center gap-2">✉️ {supplier.email}</p>}
                  {supplier.address && <p className="text-xs text-muted-foreground flex items-center gap-2">📍 {supplier.address}{supplier.city ? `, ${supplier.city}` : ""}</p>}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border-2 border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">Select a supplier to see their details</p>
              </div>
            )}
          </div>

          {/* ── Order Summary ── */}
          <div className="bg-background border rounded-2xl p-6 shadow-sm flex flex-col gap-4">
            <h3 className="font-semibold text-base border-b pb-2">Order Summary</h3>

            <div className="space-y-3 flex-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sub Total</span>
                <span className="font-medium">LKR {fmt(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span className="font-medium text-green-600">− LKR {fmt(totalDisc)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax (VAT)</span>
                <span className="font-medium">LKR {fmt(totalTax)}</span>
              </div>
            </div>

            <div className="border-t pt-3">
              <div className="flex justify-between items-center">
                <span className="font-bold text-base">Total</span>
                <span className="font-bold text-xl text-primary">LKR {fmt(grandTotal)}</span>
              </div>
            </div>

            <div className="rounded-xl bg-muted/30 p-4 space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Amount Paid</span><span>LKR 0.00</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-red-500">
                <span>Amount Due</span><span>LKR {fmt(grandTotal)}</span>
              </div>
            </div>

            <div className="pt-1 space-y-2">
              <Button className="w-full gap-2" disabled={saving} onClick={() => submit(true)}>
                {adminBypass ? "Save & Confirm Order" : "Save & Submit for Approval"}
              </Button>
              <Button variant="outline" className="w-full" disabled={saving} onClick={() => submit(false)}>
                Save as Draft
              </Button>
              {!adminBypass && (
                <p className="text-[11px] text-muted-foreground text-center leading-snug px-1">
                  After submit, Branch Manager then Accountant must approve before receiving stock.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Items table ── */}
        <div className="bg-background border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b bg-muted/20">
            <div className="flex items-center gap-2.5">
              <h3 className="font-semibold text-base">Order Items</h3>
              {items.length > 0 && (
                <span className="text-xs bg-primary/10 text-primary font-semibold px-2 py-0.5 rounded-full tabular-nums">
                  {items.length}
                </span>
              )}
            </div>
            <Button size="sm" onClick={addRow} className="gap-1.5">
              <Plus className="h-4 w-4" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed min-w-[920px]">
              <colgroup>
                <col className="w-10" />
                <col />
                <col className="w-[72px]" />
                <col className="w-[120px]" />
                <col className="w-[100px]" />
                <col className="w-[80px]" />
                <col className="w-[120px]" />
                <col className="w-11" />
              </colgroup>
              <thead className="bg-muted/40 border-b">
                <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2.5 text-left font-semibold">#</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Product</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Unit Cost</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Discount</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Tax %</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, idx) => {
                  const { total } = calcItem(item);
                  const q = searchQ[idx] ?? "";
                  const matches = searchOpen === idx ? filteredVariants(q) : [];
                  return (
                    <tr key={idx} className="hover:bg-muted/15 transition-colors align-top">
                      <td className="px-3 py-3 text-muted-foreground text-xs tabular-nums">{idx + 1}</td>

                      <td className="px-3 py-2.5">
                        {item.variantId ? (
                          <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium text-sm leading-snug truncate">{item.productName}</p>
                                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                                  {item.sku}
                                  {item.variantName ? ` · ${item.variantName}` : ""}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => clearVariant(idx)}
                                className="text-[11px] font-semibold text-primary hover:underline shrink-0"
                              >
                                Change
                              </button>
                            </div>
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
                            />
                            {searchOpen === idx && (
                              <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-xl shadow-xl mt-1 overflow-hidden">
                                <div className="max-h-52 overflow-y-auto">
                                  {matches.length === 0 ? (
                                    <p className="px-3 py-5 text-center text-muted-foreground text-xs">
                                      {q ? "No match — press Enter to scan barcode/SKU" : "Type to search products"}
                                    </p>
                                  ) : matches.map((v) => (
                                    <button
                                      key={v.variantId}
                                      type="button"
                                      onClick={() => selectVariant(idx, v)}
                                      className="w-full px-3 py-2.5 hover:bg-muted/50 text-left flex items-center gap-3 border-b last:border-0"
                                    >
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{v.productName}</p>
                                        <p className="text-muted-foreground text-xs truncate">
                                          {v.sku} · {v.variantName}
                                        </p>
                                      </div>
                                      <div className="text-right shrink-0">
                                        <p className="text-xs font-semibold tabular-nums">LKR {v.costPrice.toLocaleString()}</p>
                                        <p className="text-[10px] text-muted-foreground tabular-nums">Stock {v.stock}</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={1}
                          value={item.orderedQty}
                          onChange={(e) => updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value, 10) || 1))}
                          className="w-full text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.unitCost}
                          onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                          className="w-full text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.discount}
                          onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                          className="w-full text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-3 py-2.5">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.1"
                          value={item.taxRate}
                          onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)}
                          className="w-full text-right text-sm border rounded-lg px-2 py-2 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-sm tabular-nums whitespace-nowrap">
                        {fmt(total)}
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1.5 rounded-md hover:bg-destructive/10"
                          aria-label="Remove row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-14 text-center">
                      <div className="flex flex-col items-center gap-3 text-muted-foreground">
                        <div className="h-12 w-12 rounded-full bg-muted/50 flex items-center justify-center">
                          <Package className="h-6 w-6 opacity-40" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">No items yet</p>
                          <p className="text-xs mt-1">Search products, scan barcodes, or add a row manually.</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={addRow} className="gap-1.5 mt-1">
                          <Plus className="h-3.5 w-3.5" /> Add first item
                        </Button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot className="bg-muted/40 border-t">
                  <tr className="text-sm">
                    <td colSpan={2} className="px-3 py-3 font-semibold">
                      Totals <span className="text-muted-foreground font-normal">({items.length} items)</span>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">{totalQty}</td>
                    <td className="px-3 py-3 text-right text-xs text-muted-foreground tabular-nums">
                      {fmt(subtotal)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums text-green-600">
                      {fmt(totalDisc)}
                    </td>
                    <td className="px-3 py-3 text-right font-semibold tabular-nums">
                      {fmt(totalTax)}
                    </td>
                    <td className="px-3 py-3 text-right font-bold text-primary tabular-nums">
                      {fmt(grandTotal)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {items.length > 0 && (
            <div className="px-5 py-2.5 border-t bg-muted/10 text-[11px] text-muted-foreground">
              Tip: focus the product field and scan a barcode — press Enter to add by SKU/barcode.
            </div>
          )}
        </div>

      </div>

      {searchOpen !== null && (
        <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(null)} />
      )}
    </div>
  );
}
