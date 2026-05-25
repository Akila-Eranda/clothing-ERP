"use client";

import { useState, useEffect } from "react";
import { X, ShoppingBag, Plus, Trash2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  const [suppliers, setSuppliers]       = useState<Supplier[]>([]);
  const [variants, setVariants]         = useState<VariantOpt[]>([]);
  const [supplierId, setSupplierId]     = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [notes, setNotes]               = useState("");
  const [items, setItems]               = useState<LineItem[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<{ data: Supplier[] }>("/suppliers?limit=200").then((r) => setSuppliers(r.data?.data ?? (r.data as unknown as Supplier[]) ?? [])).catch(() => {});
    api.get<VariantOpt[]>("/pos/products").then((r) => setVariants(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (!open) { setSupplierId(""); setExpectedDate(""); setNotes(""); setItems([]); setProductSearch(""); }
  }, [open]);

  const filteredVariants = variants.filter((v) => {
    const q = productSearch.toLowerCase();
    return v.productName.toLowerCase().includes(q) ||
      v.variantName.toLowerCase().includes(q) ||
      v.sku.toLowerCase().includes(q);
  });

  const addItem = (v: VariantOpt) => {
    if (items.some((i) => i.variantId === v.variantId)) {
      toast.error("Variant already added"); return;
    }
    setItems((prev) => [
      ...prev,
      {
        variantId: v.variantId, productName: v.productName,
        variantName: v.variantName, sku: v.sku,
        orderedQty: 1, unitCost: v.costPrice || 0, taxRate: 0,
      },
    ]);
    setProductSearch("");
  };

  const updateItem = (idx: number, key: keyof LineItem, val: string | number) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [key]: val } : it));

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const subtotal  = items.reduce((s, i) => s + i.unitCost * i.orderedQty, 0);
  const taxTotal  = items.reduce((s, i) => s + (i.unitCost * i.orderedQty * i.taxRate) / 100, 0);
  const grandTotal = subtotal + taxTotal;

  const submit = async () => {
    if (!supplierId)    { toast.error("Select a supplier"); return; }
    if (items.length === 0) { toast.error("Add at least one item"); return; }
    if (items.some((i) => !i.orderedQty || i.orderedQty < 1)) { toast.error("All items need quantity ≥ 1"); return; }
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
      onCreated();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create PO");
    } finally { setLoading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-3xl border overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold">New Purchase Order</h2>
            <p className="text-xs text-muted-foreground">Create a PO to restock inventory from a supplier</p>
          </div>
          <button onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Supplier + Date */}
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

          {/* Product search */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold">Add Products <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input placeholder="Search product name or SKU…" className="pl-9 text-sm" value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)} />
            </div>
            {productSearch && (
              <div className="border rounded-xl overflow-hidden max-h-44 overflow-y-auto bg-background shadow-lg">
                {filteredVariants.slice(0, 10).map((v) => (
                  <button key={v.variantId} onClick={() => addItem(v)}
                    className="w-full px-4 py-2.5 text-left hover:bg-muted/50 flex items-center justify-between gap-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{v.productName} {v.variantName !== "Default" && <span className="text-muted-foreground">— {v.variantName}</span>}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{v.sku} · Stock: {v.stock}</p>
                    </div>
                    <Plus className="h-3.5 w-3.5 text-primary shrink-0" />
                  </button>
                ))}
                {filteredVariants.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No products found</p>
                )}
              </div>
            )}
          </div>

          {/* Items table */}
          {items.length > 0 && (
            <div className="rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/30">
                  <tr>
                    {["Product", "SKU", "Qty", "Unit Cost (₹)", "Tax %", "Total", ""].map((h) => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="px-3 py-2">
                        <p className="font-medium text-xs leading-tight">{item.productName}</p>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{item.sku}</td>
                      <td className="px-3 py-2 w-16">
                        <Input type="number" min={1} value={item.orderedQty} className="h-7 text-xs px-2 w-16"
                          onChange={(e) => updateItem(idx, "orderedQty", parseInt(e.target.value) || 1)} />
                      </td>
                      <td className="px-3 py-2 w-24">
                        <Input type="number" min={0} step={0.01} value={item.unitCost} className="h-7 text-xs px-2 w-24"
                          onChange={(e) => updateItem(idx, "unitCost", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-2 w-16">
                        <Input type="number" min={0} max={100} value={item.taxRate} className="h-7 text-xs px-2 w-16"
                          onChange={(e) => updateItem(idx, "taxRate", parseFloat(e.target.value) || 0)} />
                      </td>
                      <td className="px-3 py-2 text-xs font-semibold whitespace-nowrap">
                        ₹{(item.unitCost * item.orderedQty).toFixed(2)}
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-destructive/10 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="bg-muted/20 px-4 py-2.5 flex justify-end gap-6 text-xs">
                <span>Subtotal: <strong>₹{subtotal.toFixed(2)}</strong></span>
                <span>Tax: <strong>₹{taxTotal.toFixed(2)}</strong></span>
                <span className="text-base font-bold text-primary">Total: ₹{grandTotal.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea rows={2} placeholder="Internal notes for this PO…" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || items.length === 0} className="gap-1.5 min-w-[140px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShoppingBag className="h-3.5 w-3.5" />}
            Create Purchase Order
          </Button>
        </div>
      </div>
    </div>
  );
}
