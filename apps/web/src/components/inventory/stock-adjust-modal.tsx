"use client";

import { useState, useEffect } from "react";
import { X, ArrowUpDown, Loader2, Plus, Minus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";

export interface InventoryItem {
  id: string;
  variantId: string;
  quantity: number;
  reorderPoint?: number | null;
  variant: {
    id: string;
    name: string;
    sku: string;
    product: { id: string; name: string; category?: { name: string } | null };
  };
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdjusted: () => void;
  item?: InventoryItem | null;
}

const MOVEMENT_TYPES = [
  { value: "ADJUSTMENT", label: "Manual Adjustment", icon: RotateCcw, desc: "Set stock to exact quantity" },
  { value: "PURCHASE",   label: "Purchase / Restock", icon: Plus,        desc: "Add stock from purchase" },
  { value: "RETURN",     label: "Customer Return",    icon: Plus,        desc: "Add stock from return" },
  { value: "SALE",       label: "Sale Correction",    icon: Minus,       desc: "Deduct stock (correction)" },
  { value: "TRANSFER_OUT", label: "Transfer Out",     icon: Minus,       desc: "Move stock to another branch" },
  { value: "DAMAGE",     label: "Damage / Write-off", icon: Minus,       desc: "Remove damaged stock" },
];

export function StockAdjustModal({ open, onClose, onAdjusted, item }: Props) {
  const [movementType, setMovementType] = useState("ADJUSTMENT");
  const [quantity, setQuantity]         = useState("");
  const [notes, setNotes]               = useState("");
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    if (open) {
      setMovementType("ADJUSTMENT");
      setQuantity(item ? String(item.quantity) : "");
      setNotes("");
    }
  }, [open, item]);

  const handleClose = () => { onClose(); };

  const submit = async () => {
    if (!item) return;
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) { toast.error("Enter a valid quantity"); return; }
    setLoading(true);
    try {
      await api.post("/inventory/adjust", {
        variantId: item.variantId,
        quantity: qty,
        movementType,
        notes: notes || undefined,
      });
      toast.success("Stock adjusted successfully");
      onAdjusted();
      handleClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Adjustment failed");
    } finally { setLoading(false); }
  };

  if (!open || !item) return null;

  const selected = MOVEMENT_TYPES.find((m) => m.value === movementType);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ArrowUpDown className="h-4.5 w-4.5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold">Stock Adjustment</h2>
            <p className="text-xs text-muted-foreground truncate">{item.variant.product.name} — {item.variant.name}</p>
          </div>
          <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors shrink-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Current stock */}
          <div className="flex gap-3">
            <div className="flex-1 rounded-xl bg-muted/30 border p-3 text-center">
              <p className="text-xs text-muted-foreground">Current Stock</p>
              <p className="text-2xl font-black mt-0.5">{item.quantity}</p>
            </div>
            <div className="flex-1 rounded-xl bg-muted/30 border p-3 text-center">
              <p className="text-xs text-muted-foreground">SKU</p>
              <p className="text-sm font-mono font-bold mt-1 truncate">{item.variant.sku}</p>
            </div>
          </div>

          {/* Movement type */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Movement Type</Label>
            <Select value={movementType} onValueChange={setMovementType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MOVEMENT_TYPES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    <span className="font-medium">{m.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected && (
              <p className="text-[11px] text-muted-foreground">{selected.desc}</p>
            )}
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {movementType === "ADJUSTMENT" ? "New Total Quantity" : "Quantity"}
            </Label>
            <Input
              type="number" min={0} placeholder="0" value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              autoFocus
            />
            {movementType !== "ADJUSTMENT" && quantity && !isNaN(parseInt(quantity)) && (
              <p className="text-[11px] text-muted-foreground">
                New total:{" "}
                <span className="font-semibold text-foreground">
                  {["SALE","TRANSFER_OUT","DAMAGE"].includes(movementType)
                    ? Math.max(0, item.quantity - parseInt(quantity))
                    : item.quantity + parseInt(quantity)}
                </span>
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea rows={2} placeholder="Reason for adjustment..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={handleClose} disabled={loading}>Cancel</Button>
          <Button onClick={submit} disabled={loading} className="gap-1.5 min-w-[120px]">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
            Apply Adjustment
          </Button>
        </div>
      </div>
    </div>
  );
}
