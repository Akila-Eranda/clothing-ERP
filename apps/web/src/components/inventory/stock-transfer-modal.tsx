"use client";

import { useState, useEffect, useMemo } from "react";
import { X, ArrowLeftRight, Plus, Trash2, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { InventoryItem } from "@/components/inventory/stock-adjust-modal";

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
  const [branches, setBranches] = useState<Branch[]>([]);
  const [toBranchId, setToBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.get<{ data: Branch[] } | Branch[]>("/branches?limit=100")
      .then((r) => setBranches(r.data?.data ?? (r.data as unknown as Branch[]) ?? []))
      .catch(() => toast.error("Failed to load branches"));
  }, [open]);

  useEffect(() => {
    if (!open) {
      setToBranchId("");
      setNotes("");
      setItems([]);
      setSearch("");
    }
  }, [open]);

  const destinationBranches = useMemo(
    () => branches.filter((b) => b.id !== currentBranchId),
    [branches, currentBranchId],
  );

  const filteredStock = useMemo(() => {
    const q = search.toLowerCase();
    return stock.filter(
      (s) =>
        s.quantity > 0 &&
        (s.variant.product.name.toLowerCase().includes(q) ||
          s.variant.name.toLowerCase().includes(q) ||
          s.variant.sku.toLowerCase().includes(q)),
    );
  }, [stock, search]);

  const addItem = (row: InventoryItem) => {
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
    setLoading(true);
    try {
      await api.post("/inventory/transfers", {
        toBranchId,
        notes: notes || undefined,
        items: items.map((i) => ({ variantId: i.variantId, requestedQty: i.requestedQty })),
      });
      toast.success("Stock transfer created");
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
            <p className="text-xs text-muted-foreground">Move stock from this branch to another location</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Destination Branch</Label>
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
            <Label className="text-xs font-semibold">Add Items</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search products or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-36 overflow-y-auto rounded-lg border divide-y">
              {filteredStock.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No stock items found</p>
              ) : (
                filteredStock.slice(0, 30).map((row) => {
                  const avail = Math.max(0, row.quantity - (row.reservedQty ?? 0));
                  const added = items.some((i) => i.variantId === row.variantId);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      disabled={added}
                      onClick={() => addItem(row)}
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/40 disabled:opacity-50 text-sm"
                    >
                      <div className="min-w-0">
                        <p className="font-medium truncate">{row.variant.product.name}</p>
                        <p className="text-[10px] text-muted-foreground">{row.variant.sku} · avail {avail}</p>
                      </div>
                      {!added && <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-600" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {items.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold">Transfer Items ({items.length})</Label>
              <div className="rounded-lg border divide-y">
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

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading || !items.length || !toBranchId} className="gap-1.5 min-w-[140px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
            Create Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}
