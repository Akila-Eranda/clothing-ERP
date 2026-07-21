"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { X, ArrowLeftRight, Plus, Trash2, Loader2, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { InventoryItem } from "@/components/inventory/stock-adjust-modal";
import { useBranchStore } from "@/stores/branch-store";
import { cn } from "@/lib/utils";

interface Branch {
  id: string;
  name: string;
  code?: string | null;
}

interface LineItem {
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  available: number;
  requestedQty: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  stock: InventoryItem[];
  currentBranchId?: string;
}

export function StockTransferModal({ open, onClose, onCreated, stock, currentBranchId }: Props) {
  const activeBranchId = useBranchStore((s) => s.activeBranchId);
  const fromBranchId = activeBranchId ?? currentBranchId;
  const [branches, setBranches] = useState<Branch[]>([]);
  const [toBranchId, setToBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    api.get<{ data: Branch[] } | Branch[]>("/branches?limit=100")
      .then((r) => {
        const raw = r.data?.data ?? r.data;
        setBranches(Array.isArray(raw) ? raw : []);
      })
      .catch(() => toast.error("Failed to load branches"));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setToBranchId("");
      setNotes("");
      setItems([]);
      setPickerSearch("");
      setSelectedIds(new Set());
    } else {
      setTimeout(() => searchRef.current?.focus(), 80);
    }
  }, [open]);

  const destinationBranches = useMemo(
    () => branches.filter((b) => b.id !== fromBranchId),
    [branches, fromBranchId],
  );

  const pickableStock = useMemo(
    () =>
      stock.filter((s) => {
        const available = Math.max(0, s.quantity - (s.reservedQty ?? 0));
        return available > 0 && !items.some((i) => i.variantId === s.variantId);
      }),
    [stock, items],
  );

  const filteredPickerStock = useMemo(() => {
    const q = pickerSearch.toLowerCase().trim();
    if (!q) return pickableStock;
    return pickableStock.filter(
      (s) =>
        s.variant.product.name.toLowerCase().includes(q) ||
        s.variant.name.toLowerCase().includes(q) ||
        s.variant.sku.toLowerCase().includes(q),
    );
  }, [pickableStock, pickerSearch]);

  const visiblePickerStock = filteredPickerStock.slice(0, 100);

  const toggleSelect = (variantId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  const selectAllVisible = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const row of visiblePickerStock) next.add(row.variantId);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const addSelected = () => {
    if (selectedIds.size === 0) {
      toast.error("Select at least one product");
      return;
    }
    const toAdd: LineItem[] = [];
    for (const row of pickableStock) {
      if (!selectedIds.has(row.variantId)) continue;
      const available = Math.max(0, row.quantity - (row.reservedQty ?? 0));
      if (available <= 0) continue;
      toAdd.push({
        variantId: row.variantId,
        productName: row.variant.product.name,
        variantName: row.variant.name,
        sku: row.variant.sku,
        available,
        requestedQty: 1,
      });
    }
    if (!toAdd.length) {
      toast.error("No available stock for selected items");
      return;
    }
    setItems((prev) => [...prev, ...toAdd]);
    setSelectedIds(new Set());
    setPickerSearch("");
    toast.success(`Added ${toAdd.length} product${toAdd.length === 1 ? "" : "s"}`);
  };

  const addOne = (row: InventoryItem) => {
    if (items.some((i) => i.variantId === row.variantId)) return;
    const available = Math.max(0, row.quantity - (row.reservedQty ?? 0));
    if (available <= 0) {
      toast.error("No available stock for this item");
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        variantId: row.variantId,
        productName: row.variant.product.name,
        variantName: row.variant.name,
        sku: row.variant.sku,
        available,
        requestedQty: 1,
      },
    ]);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(row.variantId);
      return next;
    });
  };

  const updateQty = (idx: number, qty: number) =>
    setItems((prev) =>
      prev.map((it, i) =>
        i === idx ? { ...it, requestedQty: Math.min(Math.max(1, qty), it.available) } : it,
      ),
    );

  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const submit = async () => {
    if (!toBranchId) {
      toast.error("Select a destination branch");
      return;
    }
    if (!items.length) {
      toast.error("Add at least one item");
      return;
    }
    if (toBranchId === fromBranchId) {
      toast.error("Cannot transfer to the same branch — select a different destination");
      return;
    }
    setLoading(true);
    try {
      await api.post("/inventory/transfers", {
        ...(fromBranchId ? { fromBranchId } : {}),
        toBranchId,
        notes: notes || undefined,
        items: items.map((i) => ({
          variantId: i.variantId,
          requestedQty: Number(i.requestedQty),
        })),
      });
      toast.success("Stock transfer submitted — waiting for manager/admin approval");
      onCreated();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to create transfer");
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-2xl border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <ArrowLeftRight className="h-4.5 w-4.5 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold">New Stock Transfer</h2>
            <p className="text-xs text-muted-foreground">Select multiple products and transfer quantities</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Destination Branch</Label>
            {fromBranchId && (
              <p className="text-[10px] text-muted-foreground">
                Transferring from active branch — stock shown is for this location only
              </p>
            )}
            <Select value={toBranchId} onValueChange={setToBranchId}>
              <SelectTrigger><SelectValue placeholder="Select branch..." /></SelectTrigger>
              <SelectContent>
                {destinationBranches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}{b.code ? ` (${b.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destinationBranches.length === 0 && (
              <p className="text-[11px] text-amber-600">Add another branch in Settings → Branches to transfer stock.</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs font-semibold">Select Products</Label>
              <span className="text-[10px] text-muted-foreground">
                {pickableStock.length} available · tick many, then Add
              </span>
            </div>

            <div className="rounded-xl border overflow-hidden">
              <div className="p-2 border-b bg-muted/20 space-y-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={searchRef}
                    className="pl-8 h-9 text-sm"
                    placeholder="Search name or SKU..."
                    value={pickerSearch}
                    onChange={(e) => setPickerSearch(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-8 text-xs" onClick={selectAllVisible} disabled={!visiblePickerStock.length}>
                    Select visible
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={clearSelection} disabled={!selectedIds.size}>
                    Clear
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs gap-1 ml-auto"
                    onClick={addSelected}
                    disabled={!selectedIds.size}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add selected ({selectedIds.size})
                  </Button>
                </div>
              </div>

              <div className="max-h-56 overflow-y-auto">
                {visiblePickerStock.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">
                    {pickableStock.length === 0 ? "All available items already added" : "No matching products"}
                  </p>
                ) : (
                  visiblePickerStock.map((row) => {
                    const avail = Math.max(0, row.quantity - (row.reservedQty ?? 0));
                    const checked = selectedIds.has(row.variantId);
                    return (
                      <div
                        key={row.id}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-2 border-b last:border-0 hover:bg-muted/40",
                          checked && "bg-emerald-500/5",
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSelect(row.variantId)}
                          className={cn(
                            "h-5 w-5 rounded border flex items-center justify-center shrink-0",
                            checked ? "bg-emerald-600 border-emerald-600 text-white" : "border-input bg-background",
                          )}
                          aria-label={checked ? "Deselect" : "Select"}
                        >
                          {checked ? <Check className="h-3 w-3" /> : null}
                        </button>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => toggleSelect(row.variantId)}
                        >
                          <p className="text-sm font-medium truncate">{row.variant.product.name}</p>
                          <p className="text-[10px] text-muted-foreground truncate">
                            {row.variant.name !== row.variant.product.name ? `${row.variant.name} · ` : ""}
                            {row.variant.sku} · avail {avail}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => addOne(row)}
                          className="h-7 px-2 rounded-md text-[11px] font-semibold text-emerald-700 hover:bg-emerald-500/10 shrink-0"
                          title="Add this product now"
                        >
                          + Add
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
              {filteredPickerStock.length > visiblePickerStock.length && (
                <p className="text-[10px] text-muted-foreground px-3 py-2 border-t bg-muted/10">
                  Showing {visiblePickerStock.length} of {filteredPickerStock.length} — type to narrow search
                </p>
              )}
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Transfer Items ({items.length})</Label>
                <button
                  type="button"
                  className="text-[11px] text-red-500 hover:underline"
                  onClick={() => setItems([])}
                >
                  Clear all
                </button>
              </div>
              <div className="rounded-lg border divide-y max-h-52 overflow-y-auto">
                {items.map((item, idx) => (
                  <div key={item.variantId} className="flex items-center gap-2 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">{item.sku} · max {item.available}</p>
                    </div>
                    <Input
                      type="number"
                      min={1}
                      max={item.available}
                      value={item.requestedQty}
                      onChange={(e) => updateQty(idx, parseInt(e.target.value, 10) || 1)}
                      className="w-20 h-8 text-center"
                    />
                    <button type="button" onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-muted">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea rows={2} placeholder="Reason or reference..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !items.length || !toBranchId} className="gap-1.5 min-w-[140px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
            Create Transfer ({items.length})
          </Button>
        </div>
      </div>
    </div>
  );
}
