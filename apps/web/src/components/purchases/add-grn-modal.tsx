"use client";

import { useCallback, useEffect, useState, type KeyboardEvent } from "react";
import {
  Loader2, Package, PackageCheck, Plus, Search, ScanLine, Trash2, X, Banknote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopProfile, hasBatchTracking, hasExpiryTracking } from "@/lib/use-shop-profile";

type Supplier = { id: string; name: string; phone?: string | null };

type OpenPo = {
  id: string;
  poNumber: string;
  status: string;
  supplier: { id: string; name: string };
};

type VariantOpt = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  barcode?: string;
  costPrice: number;
  stock: number;
  lastBuyingPrice?: number | null;
  imageUrl?: string | null;
};

type LineItem = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitCost: number;
  stock: number;
  expiryDate: string;
  batchNumber: string;
};

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function AddGrnModal({ open, onClose, onCreated }: Props) {
  const profile = useShopProfile();
  const showExpiry = hasExpiryTracking(profile);
  const showBatch = hasBatchTracking(profile);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allVariants, setAllVariants] = useState<VariantOpt[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(false);
  const [openPos, setOpenPos] = useState<OpenPo[]>([]);
  const [payNow, setPayNow] = useState(true);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("CASH");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [chequeBankName, setChequeBankName] = useState("");
  const [payReference, setPayReference] = useState("");

  const reset = useCallback(() => {
    setSupplierId("");
    setNotes("");
    setItems([]);
    setSearchQ("");
    setSearchOpen(false);
    setOpenPos([]);
    setPayNow(true);
    setPayAmount("");
    setPayMethod("CASH");
    setChequeNumber("");
    setChequeDueDate("");
    setChequeBankName("");
    setPayReference("");
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setBooting(true);
    Promise.all([
      api.get<{ data: Supplier[] }>("/suppliers?limit=200"),
      api.get<VariantOpt[]>("/pos/products?limit=2000"),
    ])
      .then(([supR, prodR]) => {
        setSuppliers(supR.data?.data ?? (supR.data as unknown as Supplier[]) ?? []);
        setAllVariants(Array.isArray(prodR.data) ? prodR.data : []);
      })
      .catch(() => toast.error("Failed to load GRN form data"))
      .finally(() => setBooting(false));
  }, [open, reset]);

  // Prefer supplier-assigned products + warn if open POs exist
  useEffect(() => {
    if (!open || !supplierId) {
      setOpenPos([]);
      return;
    }
    api
      .get<VariantOpt[]>(`/pos/products?supplierId=${encodeURIComponent(supplierId)}&limit=2000`)
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        if (list.length > 0) setAllVariants(list);
      })
      .catch(() => {});

    api
      .get<{ data: OpenPo[] }>("/purchases?limit=200")
      .then((r) => {
        const all = r.data?.data ?? (r.data as unknown as OpenPo[]) ?? [];
        const receivable = ["CONFIRMED", "SENT", "PARTIALLY_RECEIVED"];
        setOpenPos(
          all.filter((p) => p.supplier?.id === supplierId && receivable.includes(p.status)),
        );
      })
      .catch(() => setOpenPos([]));
  }, [open, supplierId]);

  const filtered = (() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return allVariants.slice(0, 25);
    return allVariants
      .filter(
        (v) =>
          v.productName.toLowerCase().includes(q)
          || v.sku.toLowerCase().includes(q)
          || v.variantName.toLowerCase().includes(q)
          || (v.barcode?.toLowerCase().includes(q) ?? false),
      )
      .slice(0, 20);
  })();

  const addVariant = (v: VariantOpt) => {
    const cost = v.lastBuyingPrice && v.lastBuyingPrice > 0 ? v.lastBuyingPrice : v.costPrice;
    const existing = items.findIndex((i) => i.variantId === v.variantId);
    if (existing >= 0) {
      setItems((p) =>
        p.map((it, i) => (i === existing ? { ...it, quantity: it.quantity + 1 } : it)),
      );
      toast.success(`Qty +1 · ${v.productName}`);
    } else {
      setItems((p) => [
        ...p,
        {
          variantId: v.variantId,
          productName: v.productName,
          variantName: v.variantName,
          sku: v.sku,
          quantity: 1,
          unitCost: cost,
          stock: v.stock,
          expiryDate: "",
          batchNumber: "",
        },
      ]);
      toast.success(`Added ${v.productName}`);
    }
    setSearchQ("");
    setSearchOpen(false);
  };

  const resolveByCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const local = allVariants.find(
      (v) =>
        v.sku.toLowerCase() === trimmed.toLowerCase()
        || v.barcode?.toLowerCase() === trimmed.toLowerCase(),
    );
    if (local) {
      addVariant(local);
      return;
    }
    try {
      const res = await api.get<{
        variantId: string;
        productName: string;
        variantName: string;
        sku: string;
        barcode?: string;
        costPrice: number;
        stock: number;
        lastBuyingPrice?: number | null;
      }>(`/pos/barcode/${encodeURIComponent(trimmed)}`);
      const d = res.data;
      addVariant({
        variantId: d.variantId,
        productName: d.productName,
        variantName: d.variantName,
        sku: d.sku,
        barcode: d.barcode,
        costPrice: d.costPrice,
        stock: d.stock,
        lastBuyingPrice: d.lastBuyingPrice,
      });
    } catch {
      toast.error(`Product not found: ${trimmed}`);
    }
  };

  const onSearchKeyDown = async (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setSearchOpen(false);
      return;
    }
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = searchQ.trim();
    if (!q) return;
    if (filtered.length === 1) {
      addVariant(filtered[0]);
      return;
    }
    if (filtered.length > 1) {
      addVariant(filtered[0]);
      return;
    }
    await resolveByCode(q);
  };

  const updateLine = <K extends keyof LineItem>(idx: number, key: K, val: LineItem[K]) => {
    setItems((p) => p.map((it, i) => (i === idx ? { ...it, [key]: val } : it)));
  };

  const removeLine = (idx: number) => setItems((p) => p.filter((_, i) => i !== idx));

  const grandTotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  useEffect(() => {
    if (payNow && grandTotal > 0) {
      setPayAmount(String(Math.round(grandTotal * 100) / 100));
    }
  }, [payNow, grandTotal]);

  const submit = async () => {
    if (!supplierId) {
      toast.error("Select a supplier");
      return;
    }
    if (!items.length) {
      toast.error("Add at least one product");
      return;
    }
    if (items.some((i) => i.quantity < 1 || i.unitCost < 0)) {
      toast.error("Check quantities and costs");
      return;
    }
    if (payNow) {
      const amt = parseFloat(payAmount);
      if (!(amt > 0)) {
        toast.error("Enter payment amount");
        return;
      }
      if (payMethod === "CHEQUE" && !chequeNumber.trim()) {
        toast.error("Cheque number is required");
        return;
      }
    }
    if (openPos.length > 0) {
      const names = openPos.map((p) => p.poNumber).join(", ");
      const ok = window.confirm(
        `This supplier has open PO(s): ${names}.\n\nBest practice: open the PO and use Receive Items.\n\nContinue with Quick GRN anyway?`,
      );
      if (!ok) return;
    }
    setLoading(true);
    try {
      const res = await api.post<{ grnNumber: string }>("/procurement/grn/quick", {
        supplierId,
        notes: notes || undefined,
        lines: items.map((i) => ({
          variantId: i.variantId,
          quantity: i.quantity,
          unitCost: i.unitCost,
          ...(showExpiry && i.expiryDate ? { expiryDate: i.expiryDate } : {}),
          ...(showBatch && i.batchNumber.trim() ? { batchNumber: i.batchNumber.trim() } : {}),
        })),
        ...(payNow
          ? {
              payment: {
                amount: parseFloat(payAmount),
                method: payMethod,
                reference: payReference.trim() || undefined,
                notes: "Paid on Quick GRN",
                ...(payMethod === "CHEQUE"
                  ? {
                      chequeNumber: chequeNumber.trim(),
                      chequeDueDate: chequeDueDate || undefined,
                      chequeBankName: chequeBankName.trim() || undefined,
                    }
                  : {}),
              },
            }
          : {}),
      });
      toast.success(
        payNow
          ? `GRN posted & supplier paid: ${res.data?.grnNumber ?? "OK"}`
          : `GRN posted: ${res.data?.grnNumber ?? "OK"}`,
      );
      onCreated();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to post GRN");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl border overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <PackageCheck className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Quick GRN (no PO)</h2>
            <p className="text-xs text-muted-foreground">
              Exception only — prefer Create PO → Receive for planned purchases
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {booting ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Supplier + notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">
                  Supplier <span className="text-destructive">*</span>
                </label>
                <select
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                  className="w-full h-10 rounded-lg border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Select supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.phone ? ` · ${s.phone}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold">Notes</label>
                <Input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional note…"
                  className="h-10"
                />
              </div>
            </div>

            {openPos.length > 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm space-y-2">
                <p className="font-semibold text-amber-800 dark:text-amber-300 text-xs">
                  Open purchase order(s) found for this supplier
                </p>
                <p className="text-xs text-amber-700/90 dark:text-amber-400/90">
                  Best option: receive against the PO instead of Quick GRN (avoids double stock / mismatched invoices).
                </p>
                <div className="flex flex-wrap gap-2">
                  {openPos.slice(0, 5).map((p) => (
                    <a
                      key={p.id}
                      href={`/purchases/${p.id}`}
                      className="text-xs font-mono font-semibold text-blue-600 hover:underline bg-background/70 px-2 py-1 rounded border"
                    >
                      {p.poNumber} · {p.status.replace(/_/g, " ")}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Product search */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold">Add products</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <ScanLine className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/70 pointer-events-none" />
                <input
                  value={searchQ}
                  onChange={(e) => {
                    setSearchQ(e.target.value);
                    setSearchOpen(true);
                  }}
                  onFocus={() => setSearchOpen(true)}
                  onKeyDown={onSearchKeyDown}
                  placeholder="Search name, SKU, or scan barcode… press Enter"
                  className="w-full pl-10 pr-10 py-2.5 text-sm border rounded-xl bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {searchOpen && searchQ.trim() && (
                  <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-xl shadow-xl mt-1.5 overflow-hidden">
                    <div className="max-h-52 overflow-y-auto">
                      {filtered.length === 0 ? (
                        <p className="px-4 py-5 text-center text-xs text-muted-foreground">
                          No match — press Enter for barcode lookup
                        </p>
                      ) : (
                        filtered.map((v) => (
                          <button
                            key={v.variantId}
                            type="button"
                            onClick={() => addVariant(v)}
                            className="w-full px-4 py-2.5 hover:bg-muted/50 text-left flex items-center gap-3 border-b last:border-0"
                          >
                            <div className="h-8 w-8 rounded-lg bg-muted/30 flex items-center justify-center shrink-0">
                              <Package className="h-3.5 w-3.5 text-muted-foreground/60" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{v.productName}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                <span className="font-mono">{v.sku}</span>
                                {v.variantName ? ` · ${v.variantName}` : ""}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-xs font-semibold tabular-nums">
                                LKR {(v.lastBuyingPrice && v.lastBuyingPrice > 0
                                  ? v.lastBuyingPrice
                                  : v.costPrice
                                ).toLocaleString()}
                              </p>
                              <p className="text-[10px] text-muted-foreground">Stock {v.stock}</p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Lines table */}
            <div className="border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
                <p className="text-xs font-semibold">
                  Lines {items.length > 0 ? `· ${items.length} products · Qty ${totalQty}` : ""}
                </p>
                {items.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs"
                    onClick={() => {
                      setSearchOpen(true);
                      setSearchQ("");
                    }}
                  >
                    <Plus className="h-3 w-3" /> Add more
                  </Button>
                )}
              </div>

              {items.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No products yet</p>
                  <p className="text-xs mt-0.5">Search or scan to add stock lines</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead className="bg-muted/30 border-b">
                      <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 text-left font-semibold">Product</th>
                        <th className="px-3 py-2 text-right font-semibold w-20">Stock</th>
                        <th className="px-3 py-2 text-right font-semibold w-24">Qty</th>
                        <th className="px-3 py-2 text-right font-semibold w-28">Unit Cost</th>
                        {showExpiry && (
                          <th className="px-3 py-2 text-left font-semibold w-36">Expiry</th>
                        )}
                        {showBatch && (
                          <th className="px-3 py-2 text-left font-semibold w-28">Batch</th>
                        )}
                        <th className="px-3 py-2 text-right font-semibold w-28">Total</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item, idx) => (
                        <tr key={item.variantId}>
                          <td className="px-3 py-2.5">
                            <p className="font-medium text-sm truncate">{item.productName}</p>
                            <p className="text-xs text-muted-foreground font-mono truncate">
                              {item.sku}
                              {item.variantName ? ` · ${item.variantName}` : ""}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-right text-muted-foreground tabular-nums text-xs">
                            {item.stock}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                updateLine(idx, "quantity", Math.max(1, parseInt(e.target.value, 10) || 1))
                              }
                              className="w-20 text-right text-sm border rounded-lg px-2 py-1.5 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={item.unitCost}
                              onChange={(e) =>
                                updateLine(idx, "unitCost", parseFloat(e.target.value) || 0)
                              }
                              className="w-28 text-right text-sm border rounded-lg px-2 py-1.5 bg-background tabular-nums focus:outline-none focus:ring-2 focus:ring-ring"
                            />
                          </td>
                          {showExpiry && (
                            <td className="px-3 py-2.5">
                              <input
                                type="date"
                                value={item.expiryDate}
                                onChange={(e) => updateLine(idx, "expiryDate", e.target.value)}
                                className="w-36 text-sm border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                            </td>
                          )}
                          {showBatch && (
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                value={item.batchNumber}
                                placeholder="Optional"
                                onChange={(e) => updateLine(idx, "batchNumber", e.target.value)}
                                className="w-28 text-sm border rounded-lg px-2 py-1.5 bg-background font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                              />
                            </td>
                          )}
                          <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-emerald-700">
                            {(item.quantity * item.unitCost).toLocaleString("en-LK", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              className="text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10"
                              aria-label="Remove"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {items.length > 0 && (
                <div className="px-4 py-3 border-t bg-muted/10 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Grand Total</span>
                  <span className="font-bold text-emerald-700 tabular-nums">
                    LKR {grandTotal.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              )}
            </div>

            <div className="rounded-xl border p-4 space-y-3 bg-muted/10">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={payNow}
                    onChange={(e) => setPayNow(e.target.checked)}
                    className="h-4 w-4 rounded border-border"
                  />
                  <Banknote className="h-4 w-4 text-emerald-600" />
                  Pay supplier now
                </label>
                <span className="text-xs text-muted-foreground">
                  GRN total:{" "}
                  <span className="font-bold text-foreground">
                    LKR {grandTotal.toLocaleString("en-LK", { minimumFractionDigits: 2 })}
                  </span>
                </span>
              </div>
              {payNow && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Amount (LKR)</label>
                    <Input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="h-9"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Method</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value)}
                      className="w-full h-9 rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="CASH">Cash</option>
                      <option value="CARD">Card</option>
                      <option value="BANK_TRANSFER">Bank</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Reference</label>
                    <Input
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="Optional"
                      className="h-9"
                    />
                  </div>
                  {payMethod === "CHEQUE" && (
                    <>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Cheque # *</label>
                        <Input value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} className="h-9 font-mono" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Due date</label>
                        <Input type="date" value={chequeDueDate} onChange={(e) => setChequeDueDate(e.target.value)} className="h-9" />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Bank</label>
                        <Input value={chequeBankName} onChange={(e) => setChequeBankName(e.target.value)} className="h-9" />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {showExpiry
                ? "Expiry date is optional. When set, stock posts to inventory lots for FEFO. "
                : ""}
              To receive against a PO, open it and use{" "}
              <span className="font-medium text-foreground">Receive Items</span>.
            </p>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t bg-muted/10 shrink-0">
          <div className="min-w-0 text-sm">
            <span className="text-muted-foreground">Total</span>{" "}
            <span className="font-bold tabular-nums">
              LKR {grandTotal.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            {payNow && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                <Banknote className="h-3 w-3" /> Paying supplier
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={loading || booting || !supplierId || items.length === 0}
              className="gap-2 min-w-[170px] h-[42px] font-semibold text-white border-0 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 shadow-[0_2px_12px_rgba(16,185,129,0.35)] hover:shadow-[0_4px_16px_rgba(16,185,129,0.45)] active:scale-[0.98] transition-all disabled:from-emerald-600/40 disabled:to-teal-600/40 disabled:text-white/70 disabled:shadow-none"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
              {payNow ? "Post GRN & Pay" : "Post GRN"}
            </Button>
          </div>
        </div>
      </div>

      {searchOpen && searchQ.trim() && (
        <div className="fixed inset-0 z-40" onClick={() => setSearchOpen(false)} />
      )}
    </div>
  );
}
