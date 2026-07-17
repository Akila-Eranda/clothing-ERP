"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Skull, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";

export type LotActionMode = "dispose" | "adjust";

export type LotActionTarget = {
  id: string;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  availableQty: number;
  daysToExpiry?: number | null;
  variant: { sku: string; name: string; product: { name: string } };
};

interface Props {
  open: boolean;
  mode: LotActionMode;
  lot: LotActionTarget | null;
  onClose: () => void;
  onDone: () => void;
}

export function LotActionModal({ open, mode, lot, onClose, onDone }: Props) {
  const { user } = useAuthStore();
  const adminBypass = bypassesWorkflowApproval(user?.role);
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !lot) return;
    if (mode === "dispose") {
      setQuantity(String(Math.max(0, lot.availableQty)));
      setNotes("Expired / damaged write-off");
    } else {
      setQuantity(String(lot.quantity));
      setNotes("");
    }
  }, [open, lot, mode]);

  if (!open || !lot) return null;

  const title = mode === "dispose" ? "Dispose Lot" : "Adjust Lot Qty";
  const submitLabel = mode === "dispose" ? "Dispose" : "Set Quantity";

  const submit = async () => {
    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    if (mode === "dispose") {
      if (qty < 1) {
        toast.error("Dispose quantity must be at least 1");
        return;
      }
      if (qty > lot.availableQty) {
        toast.error(`Cannot dispose more than available (${lot.availableQty})`);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await api.post<{ status?: string; message?: string }>("/inventory/lots/adjust", {
        lotId: lot.id,
        quantity: qty,
        movementType: mode === "dispose" ? "DAMAGE" : "ADJUSTMENT",
        notes: notes.trim() || undefined,
      });
      const status = res.data?.status;
      if (status === "noop") {
        toast.info(res.data?.message ?? "No change");
      } else if (status === "applied" || adminBypass) {
        toast.success(mode === "dispose" ? "Lot disposed" : "Lot quantity updated");
      } else {
        toast.success("Submitted for approval — check Workflows");
      }
      onDone();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Lot action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b">
          <div
            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
              mode === "dispose" ? "bg-red-500/10" : "bg-amber-500/10"
            }`}
          >
            {mode === "dispose" ? (
              <Skull className="h-4 w-4 text-red-500" />
            ) : (
              <RotateCcw className="h-4 w-4 text-amber-500" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">{title}</h2>
            <p className="text-xs text-muted-foreground truncate">
              {lot.variant.product.name} · {lot.batchNumber ?? lot.id.slice(0, 8)}
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

        <div className="p-5 space-y-4">
          <div className="rounded-xl border bg-muted/20 px-3 py-2.5 text-xs space-y-1">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">SKU</span>
              <span className="font-mono">{lot.variant.sku}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">On hand / Available</span>
              <span className="font-semibold">
                {lot.quantity} / {lot.availableQty}
              </span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Expiry</span>
              <span>
                {lot.expiryDate
                  ? new Date(lot.expiryDate).toLocaleDateString("en-LK")
                  : "—"}
                {lot.daysToExpiry != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    ({lot.daysToExpiry < 0
                      ? `${Math.abs(lot.daysToExpiry)}d overdue`
                      : `${lot.daysToExpiry}d left`})
                  </span>
                )}
              </span>
            </div>
          </div>

          {mode === "dispose" && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <p>
                Removes stock as Damage write-off from this lot and branch inventory.
                {!adminBypass && " May require workflow approval."}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">
              {mode === "dispose" ? "Qty to dispose" : "New lot quantity"}
            </Label>
            <Input
              type="number"
              min={0}
              max={mode === "dispose" ? lot.availableQty : undefined}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-9"
            />
            {mode === "adjust" && (
              <p className="text-[10px] text-muted-foreground">
                Sets this lot to the exact quantity (delta applied to branch stock).
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Reason / notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional reason"
              className="text-sm resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t bg-muted/10">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant={mode === "dispose" ? "destructive" : "default"}
            onClick={submit}
            disabled={loading}
            className="gap-1.5"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
