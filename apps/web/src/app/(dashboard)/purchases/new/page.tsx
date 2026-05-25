"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────
interface Supplier {
  id: string; name: string; phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null; contactPerson?: string | null;
}
interface VariantOpt {
  variantId: string; productName: string; variantName: string; sku: string;
  size?: string | null; color?: string | null; costPrice: number; taxRate: number;
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
  const searchRef = useRef<HTMLInputElement>(null);

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
      color: v.color ?? undefined, unitCost: v.costPrice, taxRate: v.taxRate,
    } : it));
    setSearchQ((p) => p.map((q, i) => i === idx ? `${v.productName} — ${v.variantName}` : q));
    setSearchOpen(null);
  };

  const filteredVariants = (q: string) => {
    if (!q) return allVariants.slice(0, 30);
    const lq = q.toLowerCase();
    return allVariants.filter((v) =>
      v.productName.toLowerCase().includes(lq) || v.sku.toLowerCase().includes(lq) || v.variantName.toLowerCase().includes(lq)
    ).slice(0, 20);
  };

  // ── Summary ────────────────────────────────────────────────────────────
  const subtotal  = items.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
  const totalDisc = items.reduce((s, i) => s + i.discount, 0);
  const totalTax  = items.reduce((s, i) => s + calcItem(i).tax, 0);
  const grandTotal = subtotal - totalDisc + totalTax;
  const totalQty   = items.reduce((s, i) => s + i.orderedQty, 0);

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = async (sendNow: boolean) => {
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
      if (sendNow) {
        await api.put(`/purchases/${res.data.id}/status`, { status: "CONFIRMED" });
      }
      toast.success("Purchase order created");
      router.push(`/purchases/${res.data.id}`);
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to create PO"); }
    finally { setSaving(false); }
  };

  const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ── */}
      <div className="sticky top-0 z-20 bg-background border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => router.push("/purchases")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-base font-bold">Create Purchase Order</h1>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <span className="cursor-pointer hover:underline" onClick={() => router.push("/purchases")}>Purchases</span>
              <ChevronRight className="h-3 w-3" /><span>Purchase Orders</span>
              <ChevronRight className="h-3 w-3" /><span className="text-foreground">Create Purchase Order</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => router.push("/purchases")}>Cancel</Button>
          <Button variant="outline" size="sm" disabled={saving} onClick={() => submit(false)}>Save as Draft</Button>
          <Button size="sm" disabled={saving} onClick={() => submit(true)} className="bg-primary gap-1.5">
            Save &amp; Send PO
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-[1400px] mx-auto">

        {/* ── Top 4-column section ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_280px] gap-4">

          {/* PO Details */}
          <div className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Purchase Order Details</h3>
            <div>
              <label className="text-xs text-muted-foreground">PO Number</label>
              <Input value="Auto-generated" disabled className="mt-1 text-xs bg-muted/30" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground">Order Date</label>
                <Input type="date" defaultValue={new Date().toISOString().split("T")[0]} className="mt-1 text-xs" readOnly />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Expected Date</label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} className="mt-1 text-xs" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Reference</label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="REF-XXXXXX" className="mt-1 text-xs" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Payment Terms</label>
              <select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                className="mt-1 w-full text-xs border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                {PAYMENT_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                placeholder="Notes for the supplier..."
                className="mt-1 w-full text-xs border rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>

          {/* Supplier */}
          <div className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Supplier Information</h3>
            <div className="flex gap-2">
              <select value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)}
                className="flex-1 text-xs border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                <option value="">Select supplier...</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            {supplier ? (
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                    {supplier.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{supplier.name}</p>
                    {supplier.contactPerson && <p className="text-xs text-muted-foreground">{supplier.contactPerson}</p>}
                  </div>
                </div>
                {supplier.phone    && <p className="text-xs text-muted-foreground flex gap-2">📞 {supplier.phone}</p>}
                {supplier.email    && <p className="text-xs text-muted-foreground flex gap-2">✉️ {supplier.email}</p>}
                {supplier.address  && <p className="text-xs text-muted-foreground flex gap-2">📍 {supplier.address}{supplier.city ? `, ${supplier.city}` : ""}</p>}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">Select a supplier to see details</div>
            )}
          </div>

          {/* Other Info */}
          <div className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Other Information</h3>
            <div>
              <label className="text-xs text-muted-foreground">Currency</label>
              <select className="mt-1 w-full text-xs border rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring">
                <option>LKR – Sri Lankan Rupee</option>
                <option>USD – US Dollar</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Attachment</label>
              <div className="mt-1 border-2 border-dashed rounded-lg p-4 text-center text-xs text-muted-foreground hover:bg-muted/20 cursor-pointer">
                <p className="font-medium">Drag &amp; drop files here or <span className="text-primary">Browse Files</span></p>
                <p className="text-[10px] mt-1">PDF, JPG, PNG (Max. 5MB)</p>
              </div>
            </div>
          </div>

          {/* Order Summary */}
          <div className="border rounded-xl p-4 space-y-3 bg-muted/10">
            <h3 className="font-semibold text-sm">Order Summary</h3>
            <div className="space-y-2 text-sm">
              {[
                ["Sub Total",     `LKR ${fmt(subtotal)}`],
                ["Discount",      `LKR ${fmt(totalDisc)}`],
                ["Tax (VAT)",     `LKR ${fmt(totalTax)}`],
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{label}</span>
                  <span>{val}</span>
                </div>
              ))}
              <div className="border-t pt-2 flex justify-between font-bold">
                <span>Total Amount</span>
                <span className="text-primary">LKR {fmt(grandTotal)}</span>
              </div>
              <div className="mt-3 rounded-lg bg-background border p-2 space-y-1.5">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Amount Paid</span><span>LKR 0.00</span>
                </div>
                <div className="flex justify-between text-xs font-semibold text-red-500">
                  <span>Amount Due</span><span>LKR {fmt(grandTotal)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Items ── */}
        <div className="border rounded-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-semibold text-sm">Items</h3>
            <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={addRow}>
              <Plus className="h-3.5 w-3.5" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/30 border-b">
                <tr>
                  <th className="px-3 py-2 text-left w-6">#</th>
                  <th className="px-3 py-2 text-left min-w-[200px]">Item *</th>
                  <th className="px-3 py-2 text-left w-28">SKU</th>
                  <th className="px-3 py-2 text-left w-28">Variant</th>
                  <th className="px-3 py-2 text-right w-20">Ordered Qty</th>
                  <th className="px-3 py-2 text-right w-28">Unit Cost</th>
                  <th className="px-3 py-2 text-right w-24">Discount</th>
                  <th className="px-3 py-2 text-right w-24">Tax (%)</th>
                  <th className="px-3 py-2 text-right w-28">Amount</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const { total } = calcItem(item);
                  const q = searchQ[idx] ?? "";
                  return (
                    <tr key={idx} className="border-b hover:bg-muted/10">
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>

                      {/* Item search */}
                      <td className="px-3 py-2 relative">
                        <div className="relative">
                          <div className="flex items-center gap-1 border rounded-md px-2 py-1.5 bg-background cursor-pointer"
                            onClick={() => setSearchOpen(searchOpen === idx ? null : idx)}>
                            {item.variantId ? (
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{item.productName}</p>
                                <p className="text-muted-foreground text-[10px]">{item.sku}</p>
                              </div>
                            ) : (
                              <span className="text-muted-foreground flex-1">Search by product name / SKU</span>
                            )}
                            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
                          </div>
                          {searchOpen === idx && (
                            <div className="absolute top-full left-0 z-50 w-72 bg-background border rounded-lg shadow-lg mt-1">
                              <div className="p-2 border-b">
                                <input autoFocus
                                  value={q}
                                  onChange={(e) => setSearchQ((p) => p.map((x, i) => i === idx ? e.target.value : x))}
                                  placeholder="Search..."
                                  className="w-full text-xs px-2 py-1.5 border rounded focus:outline-none focus:ring-1 focus:ring-ring"
                                />
                              </div>
                              <div className="max-h-48 overflow-y-auto">
                                {filteredVariants(q).length === 0 && (
                                  <p className="px-3 py-4 text-center text-muted-foreground text-xs">No variants found</p>
                                )}
                                {filteredVariants(q).map((v) => (
                                  <div key={v.variantId} onClick={() => selectVariant(idx, v)}
                                    className="px-3 py-2 hover:bg-muted/50 cursor-pointer flex items-center gap-2">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-medium truncate">{v.productName}</p>
                                      <p className="text-muted-foreground text-[10px]">{v.sku} · {v.variantName}</p>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground shrink-0">Stock: {v.stock}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-2 font-mono text-muted-foreground">{item.sku || "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{item.variantName || "—"}</td>
                      <td className="px-3 py-2">
                        <input type="number" min={1} value={item.orderedQty}
                          onChange={(e) => updateItem(idx, "orderedQty", Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-16 text-right text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step="0.01" value={item.unitCost}
                          onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)}
                          className="w-24 text-right text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} step="0.01" value={item.discount}
                          onChange={(e) => updateItem(idx, "discount", parseFloat(e.target.value) || 0)}
                          className="w-20 text-right text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min={0} max={100} step="0.1" value={item.taxRate}
                          onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)}
                          className="w-16 text-right text-xs border rounded px-2 py-1 bg-background focus:outline-none focus:ring-1 focus:ring-ring" />
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{fmt(total)}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeRow(idx)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={10} className="py-10 text-center text-muted-foreground text-xs">
                    No items added. Click <strong>+ Add Item</strong> to begin.
                  </td></tr>
                )}
              </tbody>
              {items.length > 0 && (
                <tfoot className="bg-muted/20 border-t font-semibold text-xs">
                  <tr>
                    <td colSpan={4} className="px-3 py-2">Total Items: {items.length}</td>
                    <td className="px-3 py-2 text-right">{totalQty}</td>
                    <td />
                    <td className="px-3 py-2 text-right">{fmt(totalDisc)}</td>
                    <td className="px-3 py-2 text-right">{fmt(totalTax)}</td>
                    <td className="px-3 py-2 text-right">{fmt(grandTotal)}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          {items.length > 0 && (
            <div className="px-4 py-2 border-t">
              <button onClick={addRow} className="text-xs text-primary hover:underline flex items-center gap-1">
                <Plus className="h-3 w-3" /> Add New Row
              </button>
            </div>
          )}
        </div>

        {/* ── Bottom actions ── */}
        <div className="flex items-center justify-between pt-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" className="rounded" />
            Save as Draft
          </label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/purchases")}>Cancel</Button>
            <Button variant="outline" disabled={saving} onClick={() => submit(false)}>Save as Draft</Button>
            <Button disabled={saving} onClick={() => submit(true)}>Save &amp; Send PO</Button>
          </div>
        </div>
      </div>

      {/* Close search on outside click */}
      {searchOpen !== null && (
        <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(null)} />
      )}
    </div>
  );
}
