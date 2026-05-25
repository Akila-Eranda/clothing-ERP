"use client";

import { useState, useEffect, useMemo } from "react";
import { X, ShoppingBag, Plus, Trash2, Loader2, Search, ChevronRight, CheckCircle2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface Supplier { id: string; name: string; contactPerson?: string | null; phone: string; }
interface VariantOpt {
  variantId: string; productName: string; variantName: string; sku: string;
  unitPrice: number; costPrice: number; category: string; color?: string; size?: string; stock: number;
}

interface LineItem {
  variantId: string; productName: string; variantName: string; sku: string;
  orderedQty: number; unitCost: number; taxRate: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  prefillVariantId?: string;
}

export function CreatePOModal({ open, onClose, onCreated, prefillVariantId }: Props) {
  const [suppliers, setSuppliers]             = useState<Supplier[]>([]);
  const [allVariants, setAllVariants]         = useState<VariantOpt[]>([]);
  const [supplierId, setSupplierId]           = useState("");
  const [expectedDate, setExpectedDate]       = useState("");
  const [notes, setNotes]                     = useState("");
  const [items, setItems]                     = useState<LineItem[]>([]);
  const [productSearch, setProductSearch]     = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [loading, setLoading]                 = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<{ data: Supplier[] }>("/suppliers?limit=200")
      .then((r) => setSuppliers(r.data?.data ?? (r.data as unknown as Supplier[]) ?? []))
      .catch(() => {});
    api.get<VariantOpt[]>("/pos/products")
      .then((r) => setAllVariants(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSupplierId(""); setExpectedDate(""); setNotes("");
      setItems([]); setProductSearch(""); setSelectedProduct(null);
    }
  }, [open]);

  const productGroups = useMemo(() => {
    const map = new Map<string, VariantOpt[]>();
    allVariants.forEach((v) => {
      if (!map.has(v.productName)) map.set(v.productName, []);
      map.get(v.productName)!.push(v);
    });
    return map;
  }, [allVariants]);

  const filteredProducts = useMemo(() => {
    const q = productSearch.toLowerCase();
    return Array.from(productGroups.entries()).filter(([name, vars]) =>
      name.toLowerCase().includes(q) || vars.some((v) => v.sku.toLowerCase().includes(q))
    );
  }, [productGroups, productSearch]);

  const selectedVariants = selectedProduct ? (productGroups.get(selectedProduct) ?? []) : [];

  const addItem = (v: VariantOpt) => {
    if (items.some((i) => i.variantId === v.variantId)) return;
    setItems((prev) => [
      ...prev,
      { variantId: v.variantId, productName: v.productName, variantName: v.variantName,
        sku: v.sku, orderedQty: 1, unitCost: v.costPrice || 0, taxRate: 0 },
    ]);
  };

  const addAllVariants = () => {
    const toAdd = selectedVariants.filter((v) => !items.some((i) => i.variantId === v.variantId));
    if (!toAdd.length) { toast.error("All variants already added"); return; }
    setItems((prev) => [
      ...prev,
      ...toAdd.map((v) => ({ variantId: v.variantId, productName: v.productName,
        variantName: v.variantName, sku: v.sku, orderedQty: 1, unitCost: v.costPrice || 0, taxRate: 0 })),
    ]);
    toast.success(`Added ${toAdd.length} variant${toAdd.length > 1 ? "s" : ""}`);
  };

  const updateItem = (idx: number, key: keyof LineItem, val: string | number) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const subtotal   = items.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
  const taxTotal   = items.reduce((s, i) => s + (i.unitCost * i.orderedQty * i.taxRate) / 100, 0);
  const grandTotal = subtotal + taxTotal;

  const submit = async () => {
    if (!supplierId)    { toast.error("Select a supplier"); return; }
    if (!items.length)  { toast.error("Add at least one item"); return; }
    if (items.some((i) => i.orderedQty < 1)) { toast.error("All items need quantity ≥ 1"); return; }
    setLoading(true);
    try {
      await api.post("/purchases", {
        supplierId,
        expectedDate: expectedDate || undefined,
        notes: notes || undefined,
        items: items.map((i) => ({
          variantId: i.variantId, productName: i.productName, variantName: i.variantName,
          sku: i.sku, orderedQty: i.orderedQty, unitCost: i.unitCost, taxRate: i.taxRate,
        })),
      });
      toast.success("Purchase order created");
      onCreated(); onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create PO");
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-5xl border overflow-hidden max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">New Purchase Order</h2>
            <p className="text-xs text-muted-foreground">Select products → choose variants → set quantities</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Top bar: Supplier + Date */}
          <div className="px-6 py-4 border-b shrink-0">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Supplier <span className="text-destructive">*</span></Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        <span className="font-medium">{s.name}</span>
                        {s.contactPerson && <span className="text-muted-foreground ml-2 text-xs">— {s.contactPerson}</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Expected Delivery Date</Label>
                <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
              </div>
            </div>
          </div>

          {/* Three-column product picker */}
          <div className="flex-1 overflow-hidden flex min-h-0">

            {/* Col 1: Product search list */}
            <div className="w-56 shrink-0 border-r flex flex-col">
              <div className="p-3 border-b shrink-0">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input placeholder="Search products…" className="pl-8 h-8 text-xs"
                    value={productSearch} onChange={(e) => { setProductSearch(e.target.value); setSelectedProduct(null); }} />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredProducts.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-6">No products found</p>
                )}
                {filteredProducts.map(([name, vars]) => {
                  const addedCount = vars.filter((v) => items.some((i) => i.variantId === v.variantId)).length;
                  return (
                    <button key={name} onClick={() => setSelectedProduct(name)}
                      className={`w-full text-left px-3 py-2.5 border-b flex items-center gap-2 hover:bg-muted/50 transition-colors ${selectedProduct === name ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}>
                      <Package className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium leading-tight truncate">{name}</p>
                        <p className="text-[10px] text-muted-foreground">{vars.length} variant{vars.length > 1 ? "s" : ""}</p>
                      </div>
                      {addedCount > 0 && (
                        <Badge className="text-[9px] h-4 px-1 shrink-0">{addedCount}</Badge>
                      )}
                      <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Col 2: Variant picker for selected product */}
            <div className="w-64 shrink-0 border-r flex flex-col bg-muted/10">
              {!selectedProduct ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <Package className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">Select a product to see its variants</p>
                </div>
              ) : (
                <>
                  <div className="px-3 py-2.5 border-b shrink-0 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold truncate">{selectedProduct}</p>
                      <p className="text-[10px] text-muted-foreground">{selectedVariants.length} variant{selectedVariants.length > 1 ? "s" : ""}</p>
                    </div>
                    <button onClick={addAllVariants}
                      className="text-[10px] font-medium text-primary hover:underline whitespace-nowrap shrink-0">
                      + Add All
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    {selectedVariants.map((v) => {
                      const added = items.some((i) => i.variantId === v.variantId);
                      return (
                        <button key={v.variantId} onClick={() => addItem(v)}
                          disabled={added}
                          className={`w-full text-left px-3 py-2.5 border-b flex items-center gap-2 transition-colors
                            ${added ? "opacity-50 cursor-default bg-emerald-500/5" : "hover:bg-muted/50"}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium leading-tight">
                              {v.variantName === "Default" ? v.productName : v.variantName}
                            </p>
                            <p className="text-[10px] text-muted-foreground font-mono">{v.sku}</p>
                            <div className="flex gap-2 mt-0.5">
                              <span className="text-[10px] text-muted-foreground">Stock: <strong>{v.stock}</strong></span>
                              {v.color && <span className="text-[10px] text-muted-foreground">{v.color}</span>}
                              {v.size && <span className="text-[10px] text-muted-foreground">{v.size}</span>}
                            </div>
                          </div>
                          {added
                            ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            : <Plus className="h-3.5 w-3.5 text-primary shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Col 3: PO Line items */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
              <div className="px-4 py-2.5 border-b shrink-0 flex items-center justify-between">
                <p className="text-xs font-semibold">Order Items</p>
                {items.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{items.length} line{items.length > 1 ? "s" : ""}</span>
                )}
              </div>
              {items.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
                  <ShoppingBag className="h-8 w-8 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">No items added yet.<br />Select variants from the left panel.</p>
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 sticky top-0">
                      <tr>
                        {["Product / Variant", "SKU", "Qty", "Cost (₹)", "Tax%", "Total", ""].map((h) => (
                          <th key={h} className="text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, idx) => (
                        <tr key={idx} className="border-t hover:bg-muted/20">
                          <td className="px-2 py-1.5 max-w-[130px]">
                            <p className="font-medium leading-tight truncate">{item.productName}</p>
                            {item.variantName !== "Default" && (
                              <p className="text-[10px] text-muted-foreground truncate">{item.variantName}</p>
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap">{item.sku}</td>
                          <td className="px-2 py-1.5">
                            <Input type="number" min={1} value={item.orderedQty} className="h-6 text-xs px-1.5 w-14"
                              onChange={(e) => updateItem(idx, "orderedQty", parseInt(e.target.value) || 1)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" min={0} step={0.01} value={item.unitCost} className="h-6 text-xs px-1.5 w-20"
                              onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)} />
                          </td>
                          <td className="px-2 py-1.5">
                            <Input type="number" min={0} max={100} value={item.taxRate} className="h-6 text-xs px-1.5 w-14"
                              onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)} />
                          </td>
                          <td className="px-2 py-1.5 font-semibold whitespace-nowrap">
                            ₹{(item.unitCost * item.orderedQty).toFixed(0)}
                          </td>
                          <td className="px-2 py-1.5">
                            <button onClick={() => removeItem(idx)} className="p-0.5 rounded hover:bg-destructive/10 text-destructive">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="border-t bg-muted/20 px-4 py-2 flex justify-end gap-5 text-xs sticky bottom-0">
                    <span>Subtotal: <strong>₹{subtotal.toFixed(2)}</strong></span>
                    <span>Tax: <strong>₹{taxTotal.toFixed(2)}</strong></span>
                    <span className="text-sm font-bold text-primary">₹{grandTotal.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="px-6 py-3 border-t shrink-0">
            <Textarea rows={1} placeholder="Internal notes for this PO… (optional)"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              className="text-xs resize-none" />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-3 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !items.length} className="gap-1.5 min-w-[160px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="h-3.5 w-3.5" />}
            Create Purchase Order {items.length > 0 && `(${items.length})`}
          </Button>
        </div>
      </div>
    </div>
  );
}
