"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRightLeft, ChevronDown, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { WarehouseRecord } from "@/components/warehouse/add-warehouse-modal";

interface StockRow {
  id: string;
  quantity: number;
  reservedQty: number;
  availableQty: number;
  variant: {
    id?: string;
    sku: string;
    name: string;
    product: { name: string };
  };
  variantId?: string;
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
  warehouses: WarehouseRecord[];
  defaultFromId?: string;
}

export function WarehouseTransferModal({ open, onClose, onCreated, warehouses, defaultFromId }: Props) {
  const [fromWh, setFromWh] = useState("");
  const [toWh, setToWh] = useState("");
  const [notes, setNotes] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [stockLoading, setStockLoading] = useState(false);
  const [items, setItems] = useState<LineItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setFromWh("");
      setToWh("");
      setNotes("");
      setStock([]);
      setItems([]);
      setPickerOpen(false);
      setPickerSearch("");
      return;
    }
    setFromWh(defaultFromId || warehouses[0]?.id || "");
  }, [open, defaultFromId, warehouses]);

  useEffect(() => {
    if (!open || !fromWh) {
      setStock([]);
      return;
    }
    setStockLoading(true);
    api.get<StockRow[]>(`/warehouses/${fromWh}/stock`)
      .then((r) => setStock(Array.isArray(r.data) ? r.data : []))
      .catch(() => {
        setStock([]);
        toast.error("Failed to load warehouse stock");
      })
      .finally(() => setStockLoading(false));
  }, [open, fromWh]);

  useEffect(() => {
    if (!pickerOpen) return;
    const closeOnOutside = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setPickerSearch("");
      }
    };
    document.addEventListener("mousedown", closeOnOutside);
    return () => document.removeEventListener("mousedown", closeOnOutside);
  }, [pickerOpen]);

  const availableStock = useMemo(() => {
    const taken = new Set(items.map((i) => i.variantId));
    const q = pickerSearch.trim().toLowerCase();
    return stock
      .map((s) => {
        const variantId = s.variantId || s.variant.id || "";
        return {
          variantId,
          productName: s.variant.product.name,
          variantName: s.variant.name,
          sku: s.variant.sku,
          available: s.availableQty ?? Math.max(0, (s.quantity ?? 0) - (s.reservedQty ?? 0)),
        };
      })
      .filter((s) => s.variantId && !taken.has(s.variantId) && s.available > 0)
      .filter((s) => {
        if (!q) return true;
        return (
          s.productName.toLowerCase().includes(q) ||
          s.variantName.toLowerCase().includes(q) ||
          s.sku.toLowerCase().includes(q)
        );
      });
  }, [stock, items, pickerSearch]);

  const addItem = (row: (typeof availableStock)[number]) => {
    setItems((prev) => [
      ...prev,
      {
        variantId: row.variantId,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.sku,
        available: row.available,
        requestedQty: 1,
      },
    ]);
    setPickerOpen(false);
    setPickerSearch("");
  };

  const submit = async () => {
    if (!fromWh || !toWh) { toast.error("Select from and to warehouses"); return; }
    if (fromWh === toWh) { toast.error("From and to must be different"); return; }
    if (!items.length) { toast.error("Add at least one item"); return; }
    const bad = items.find((i) => i.requestedQty < 1 || i.requestedQty > i.available);
    if (bad) {
      toast.error(`Invalid qty for ${bad.sku} (max ${bad.available})`);
      return;
    }

    setLoading(true);
    try {
      await api.post("/warehouses/transfers", {
        fromWarehouseId: fromWh,
        toWarehouseId: toWh,
        notes: notes.trim() || undefined,
        items: items.map((i) => ({
          variantId: i.variantId,
          requestedQty: i.requestedQty,
        })),
      });
      toast.success("Transfer created");
      onCreated();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Transfer failed");
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
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <ArrowRightLeft className="h-4 w-4 text-amber-600" />
          </div>
          <div>
            <h2 className="text-base font-bold">Warehouse Transfer</h2>
            <p className="text-xs text-muted-foreground">Move stock between warehouse locations</p>
          </div>
          <button type="button" onClick={onClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">From *</Label>
              <Select value={fromWh} onValueChange={(v) => { setFromWh(v); setItems([]); }}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">To *</Label>
              <Select value={toWh} onValueChange={setToWh}>
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  {warehouses.filter((w) => w.id !== fromWh).map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Items *</Label>
            <div className="relative" ref={pickerRef}>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between h-10"
                disabled={!fromWh || stockLoading}
                onClick={() => setPickerOpen((v) => !v)}
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  {stockLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  {stockLoading ? "Loading stock…" : "Add product from stock"}
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
              {pickerOpen && (
                <div className="absolute z-20 mt-1 w-full rounded-xl border bg-background shadow-lg overflow-hidden">
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        className="h-8 pl-8 text-xs"
                        placeholder="Search product / SKU…"
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        autoFocus
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {availableStock.length === 0 ? (
                      <p className="px-3 py-6 text-center text-xs text-muted-foreground">No available stock</p>
                    ) : (
                      availableStock.slice(0, 40).map((s) => (
                        <button
                          key={s.variantId}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-0"
                          onClick={() => addItem(s)}
                        >
                          <p className="text-sm font-medium truncate">{s.productName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">
                            {s.sku} · {s.variantName} · avail {s.available}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 border-b text-[10px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Product</th>
                      <th className="px-3 py-2 text-right">Avail</th>
                      <th className="px-3 py-2 text-right w-24">Qty</th>
                      <th className="px-2 py-2 w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((item) => (
                      <tr key={item.variantId}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-xs">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{item.available}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={1}
                            max={item.available}
                            className="h-8 text-xs text-right"
                            value={item.requestedQty}
                            onChange={(e) => {
                              const n = parseInt(e.target.value, 10) || 1;
                              setItems((prev) =>
                                prev.map((x) =>
                                  x.variantId === item.variantId
                                    ? { ...x, requestedQty: Math.min(item.available, Math.max(1, n)) }
                                    : x,
                                ),
                              );
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <button
                            type="button"
                            className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                            onClick={() => setItems((prev) => prev.filter((x) => x.variantId !== item.variantId))}
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
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes</Label>
            <Textarea
              rows={2}
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="min-w-[140px] gap-1.5">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRightLeft className="h-3.5 w-3.5" />}
            Create Transfer
          </Button>
        </div>
      </div>
    </div>
  );
}
