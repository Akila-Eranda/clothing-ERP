"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Scale, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { bypassesWorkflowApproval } from "@/lib/workflow-access";

export interface PoStockBalanceTarget {
  variantId: string;
  productName: string;
  variantName?: string | null;
  barcode?: string | null;
  systemStock: number;
}

const REASONS = ["Physical count", "Damaged", "Expired", "Missing / Theft", "Data entry error", "Other"] as const;

interface Props {
  open: boolean;
  target: PoStockBalanceTarget | null;
  onClose: () => void;
  /** Called with the new on-hand quantity when the adjustment was applied directly (not sent for approval). */
  onBalanced: (variantId: string, newQty: number) => void;
}

export function PoStockBalanceModal({ open, target, onClose, onBalanced }: Props) {
  const { user } = useAuthStore();
  const adminBypass = bypassesWorkflowApproval(user?.role);
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState<string>(REASONS[0]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && target) {
      setCounted(String(target.systemStock));
      setReason(REASONS[0]);
      setNotes("");
    }
  }, [open, target]);

  const countedNum = useMemo(() => {
    const n = parseFloat(counted);
    return Number.isFinite(n) ? n : NaN;
  }, [counted]);

  if (!open || !target) return null;

  const diff = Number.isFinite(countedNum) ? Math.round((countedNum - target.systemStock) * 1000) / 1000 : 0;

  const submit = async () => {
    if (!Number.isFinite(countedNum) || countedNum < 0) {
      toast.error("Enter a valid physical count");
      return;
    }
    if (diff === 0) {
      toast.info("Stock already balanced");
      onClose();
      return;
    }
    setSaving(true);
    try {
      const endpoint = adminBypass ? "/inventory/adjust" : "/inventory/adjust/request";
      await api.post(endpoint, {
        variantId: target.variantId,
        quantity: countedNum,
        movementType: "ADJUSTMENT",
        referenceType: "PO_STOCK_BALANCE",
        notes: [`Stock balance (PO): ${reason}`, `System ${target.systemStock} → Counted ${countedNum}`, notes.trim()]
          .filter(Boolean)
          .join(" · "),
      });
      if (adminBypass) {
        toast.success(`Stock balanced: ${target.systemStock} → ${countedNum}`);
        onBalanced(target.variantId, countedNum);
      } else {
        toast.success("Stock balance submitted for approval — check Workflows");
      }
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Stock balance failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border bg-background shadow-2xl">
        <div className="flex items-center gap-3 border-b px-6 py-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Scale className="h-4 w-4 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold">Stock Balance</h2>
            <p className="truncate text-xs text-muted-foreground">
              {target.productName}
              {target.variantName && target.variantName !== "Default" ? ` — ${target.variantName}` : ""}
              {target.barcode ? ` · ${target.barcode}` : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="shrink-0 rounded-lg p-1.5 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl border bg-muted/30 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">System Stock</p>
              <p className="mt-0.5 text-xl font-black tabular-nums">{target.systemStock}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3 text-center">
              <p className="text-[11px] text-muted-foreground">Counted</p>
              <p className="mt-0.5 text-xl font-black tabular-nums">{Number.isFinite(countedNum) ? countedNum : "—"}</p>
            </div>
            <div
              className={cn(
                "rounded-xl border p-3 text-center",
                diff > 0 && "border-emerald-500/30 bg-emerald-500/10",
                diff < 0 && "border-rose-500/30 bg-rose-500/10",
                diff === 0 && "bg-muted/30",
              )}
            >
              <p className="text-[11px] text-muted-foreground">Difference</p>
              <p
                className={cn(
                  "mt-0.5 text-xl font-black tabular-nums",
                  diff > 0 && "text-emerald-600 dark:text-emerald-400",
                  diff < 0 && "text-rose-600 dark:text-rose-400",
                )}
              >
                {diff > 0 ? `+${diff}` : diff}
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Physical Count (actual stock on shelf)</Label>
            <Input
              type="number"
              min={0}
              step="any"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void submit(); } }}
              autoFocus
            />
            {target.systemStock < 0 && (
              <button
                type="button"
                className="text-[11px] font-semibold text-rose-600 underline"
                onClick={() => setCounted("0")}
              >
                Set to 0 (clear minus {target.systemStock})
              </button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Reason</Label>
            <div className="flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    reason === r ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. counted before ordering" />
          </div>

          {!adminBypass && (
            <p className="text-[11px] text-muted-foreground">This adjustment will be sent for manager approval.</p>
          )}
        </div>

        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving} className="min-w-[130px] gap-1.5">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Scale className="h-3.5 w-3.5" />}
            Balance Stock
          </Button>
        </div>
      </div>
    </div>
  );
}
