"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Package, Plus, RotateCcw, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { parseApiList, parsePosProducts } from "@/lib/parse-api-list";

type Supplier = { id: string; name: string };
type OpenPo = { id: string; poNumber: string; supplierId: string; status: string };
type VariantOpt = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  costPrice: number;
};

type LineItem = {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  quantity: number;
  unitCost: number;
};

const REASONS = [
  { value: "DAMAGED", label: "Damaged goods" },
  { value: "WRONG_ITEM", label: "Wrong item received" },
  { value: "EXPIRED", label: "Expired / near expiry" },
  { value: "QUALITY", label: "Quality issue" },
  { value: "OVERSTOCK", label: "Overstock return" },
  { value: "OTHER", label: "Other" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function AddPurchaseReturnModal({ open, onClose, onSaved }: Props) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [variants, setVariants] = useState<VariantOpt[]>([]);
  const [openPos, setOpenPos] = useState<OpenPo[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [purchaseId, setPurchaseId] = useState("");
  const [reason, setReason] = useState("DAMAGED");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [searchQ, setSearchQ] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [booting, setBooting] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = useCallback(() => {
    setSupplierId("");
    setPurchaseId("");
    setReason("DAMAGED");
    setNotes("");
    setItems([]);
    setSearchQ("");
    setSearchOpen(false);
    setOpenPos([]);
    setVariants([]);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
      return;
    }
    setBooting(true);
    api.get<{ data: Supplier[] }>("/suppliers?limit=200")
      .then((r) => setSuppliers(parseApiList<Supplier>(r.data)))
      .catch(() => toast.error("Failed to load suppliers"))
      .finally(() => setBooting(false));
  }, [open, reset]);

  useEffect(() => {
    if (!open || !supplierId) {
      setVariants([]);
      setOpenPos([]);
      setPurchaseId("");
      return;
    }
    Promise.all([
      api.get<VariantOpt[]>(`/pos/products?supplierId=${encodeURIComponent(supplierId)}&limit=2000`),
      api.get<{ data: OpenPo[] }>("/purchases?limit=100"),
    ])
      .then(([prodR, poR]) => {
        setVariants(parsePosProducts<VariantOpt>(prodR));
        const pos = parseApiList<OpenPo & { supplier?: { id: string } }>(poR.data)
          .filter((p) => (p.supplierId === supplierId || p.supplier?.id === supplierId)
            && ["CONFIRMED", "SENT", "PARTIALLY_RECEIVED", "RECEIVED"].includes(p.status));
        setOpenPos(pos);
      })
      .catch(() => toast.error("Failed to load supplier products"));
  }, [open, supplierId]);

  const filtered = useMemo(() => {
    const q = searchQ.trim().toLowerCase();
    if (!q) return variants.slice(0, 12);
    return variants.filter((v) =>
      v.productName.toLowerCase().includes(q)
      || v.variantName.toLowerCase().includes(q)
      || v.sku.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [variants, searchQ]);

  const addLine = (v: VariantOpt) => {
    setItems((prev) => {
      const i = prev.findIndex((x) => x.variantId === v.variantId);
      if (i >= 0) {
        const next = [...prev];
        next[i] = { ...next[i]!, quantity: next[i]!.quantity + 1 };
        return next;
      }
      return [...prev, {
        variantId: v.variantId,
        productName: v.productName,
        variantName: v.variantName,
        sku: v.sku,
        quantity: 1,
        unitCost: v.costPrice ?? 0,
      }];
    });
    setSearchQ("");
    setSearchOpen(false);
  };

  const updateQty = (variantId: string, quantity: number) => {
    setItems((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, quantity: Math.max(1, quantity) } : l)));
  };

  const updateCost = (variantId: string, unitCost: number) => {
    setItems((prev) => prev.map((l) => (l.variantId === variantId ? { ...l, unitCost: Math.max(0, unitCost) } : l)));
  };

  const removeLine = (variantId: string) => {
    setItems((prev) => prev.filter((l) => l.variantId !== variantId));
  };

  const lineTotal = items.reduce((s, i) => s + i.quantity * i.unitCost, 0);

  const submit = async () => {
    if (!supplierId) { toast.error("Select a supplier"); return; }
    if (items.length === 0) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      await api.post("/procurement/supplier-returns", {
        supplierId,
        purchaseId: purchaseId || undefined,
        reason: REASONS.find((r) => r.value === reason)?.label ?? reason,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({
          variantId: i.variantId,
          productName: i.productName,
          sku: i.sku,
          quantity: i.quantity,
          unitCost: i.unitCost,
        })),
      });
      toast.success("Purchase return saved as draft");
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create return");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10">
            <RotateCcw className="h-5 w-5 text-orange-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">New Purchase Return</h2>
            <p className="text-xs text-muted-foreground">Return goods to supplier — stock deducted when posted</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {booting ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Supplier *</Label>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                  >
                    <option value="">Select supplier…</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Link PO (optional)</Label>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    value={purchaseId}
                    onChange={(e) => setPurchaseId(e.target.value)}
                    disabled={!supplierId}
                  >
                    <option value="">No PO link</option>
                    {openPos.map((p) => (
                      <option key={p.id} value={p.id}>{p.poNumber}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Return reason</Label>
                  <select
                    className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Notes</Label>
                  <Input
                    placeholder="Optional notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold">Add products</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder={supplierId ? "Search product name or SKU…" : "Select supplier first"}
                    value={searchQ}
                    disabled={!supplierId}
                    onChange={(e) => { setSearchQ(e.target.value); setSearchOpen(true); }}
                    onFocus={() => setSearchOpen(true)}
                  />
                  {searchOpen && supplierId && filtered.length > 0 && (
                    <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-xl border bg-popover shadow-lg">
                      {filtered.map((v) => (
                        <button
                          key={v.variantId}
                          type="button"
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-muted"
                          onClick={() => addLine(v)}
                        >
                          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">
                            {v.productName} · {v.variantName}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">{v.sku}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {items.length > 0 && (
                <div className="overflow-hidden rounded-xl border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left">Product</th>
                        <th className="px-3 py-2 text-right w-24">Qty</th>
                        <th className="px-3 py-2 text-right w-28">Unit cost</th>
                        <th className="px-3 py-2 text-right w-24">Amount</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((line) => (
                        <tr key={line.variantId}>
                          <td className="px-3 py-2">
                            <p className="font-medium text-xs">{line.productName}</p>
                            <p className="text-[11px] text-muted-foreground font-mono">{line.sku}</p>
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={1}
                              className="h-8 text-right"
                              value={line.quantity}
                              onChange={(e) => updateQty(line.variantId, parseInt(e.target.value, 10) || 1)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <Input
                              type="number"
                              min={0}
                              step="0.01"
                              className="h-8 text-right"
                              value={line.unitCost}
                              onChange={(e) => updateCost(line.variantId, parseFloat(e.target.value) || 0)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums text-xs">
                            {(line.quantity * line.unitCost).toLocaleString("en-LK", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-2 py-2">
                            <button type="button" onClick={() => removeLine(line.variantId)} className="rounded p-1 text-muted-foreground hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex justify-between border-t bg-muted/20 px-4 py-2.5 text-sm font-bold">
                    <span>Credit total</span>
                    <span className="text-primary tabular-nums">LKR {lineTotal.toLocaleString("en-LK", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className={cn(modalBarFooterClass, "shrink-0")}>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || booting} className="min-w-[140px] gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save Draft
          </Button>
        </div>
      </div>
    </div>
  );
}
