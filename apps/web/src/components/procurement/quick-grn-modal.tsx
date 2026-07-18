"use client";

import { useState } from "react";
import { X, Zap, Loader2, PackageCheck, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Supplier = { id: string; name: string };
type VariantOpt = { id: string; sku: string; name: string; costPrice: number; product: { name: string } };

interface Props {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
  suppliers: Supplier[];
  showExpiry: boolean;
  showBatch: boolean;
}

export function QuickGrnModal({ open, onClose, onPosted, suppliers, showExpiry, showBatch }: Props) {
  const [supplierId, setSupplierId] = useState("");
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [expiry, setExpiry] = useState("");
  const [batch, setBatch] = useState("");
  const [variant, setVariant] = useState<VariantOpt | null>(null);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const reset = () => {
    setSku(""); setVariant(null); setQty("1"); setCost(""); setExpiry(""); setBatch("");
  };
  const handleClose = () => { reset(); onClose(); };

  const lookupSku = async () => {
    if (!sku.trim()) return;
    setLookingUp(true);
    try {
      const r = await api.get<{
        id: string; sku: string; name: string; costPrice?: number;
        productName?: string; product?: { name: string };
      }>(`/pos/barcode/${encodeURIComponent(sku.trim())}`);
      const v = r.data;
      if (!v?.id) {
        toast.error("SKU / barcode not found");
        setVariant(null);
        return;
      }
      const found: VariantOpt = {
        id: v.id,
        sku: v.sku,
        name: v.name,
        costPrice: v.costPrice ?? 0,
        product: { name: v.productName ?? v.product?.name ?? "Product" },
      };
      setVariant(found);
      setCost(String(found.costPrice || 0));
      toast.success(`${found.product.name} — ${found.name}`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Lookup failed");
    } finally {
      setLookingUp(false);
    }
  };

  const submit = async () => {
    if (!supplierId) { toast.error("Select supplier"); return; }
    if (!variant) { toast.error("Lookup a product first"); return; }
    const q = parseInt(qty, 10);
    const c = parseFloat(cost);
    if (!q || q < 1 || isNaN(c)) { toast.error("Enter valid qty and cost"); return; }
    setBusy(true);
    try {
      const res = await api.post<{ grnNumber: string }>("/procurement/grn/quick", {
        supplierId,
        lines: [{
          variantId: variant.id,
          quantity: q,
          unitCost: c,
          ...(showExpiry && expiry ? { expiryDate: expiry } : {}),
          ...(showBatch && batch.trim() ? { batchNumber: batch.trim() } : {}),
        }],
      });
      toast.success(`Quick GRN posted: ${(res.data as { grnNumber?: string })?.grnNumber ?? "OK"}`);
      reset();
      onPosted();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Quick GRN failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <div className="h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-amber-500" />
          </div>
          <div>
            <h2 className="text-base font-bold">Quick GRN</h2>
            <p className="text-xs text-muted-foreground">
              Walk-in cash purchases only — receive against the PO when one exists
            </p>
          </div>
          <button onClick={handleClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Supplier <span className="text-destructive">*</span></Label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Product <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input
                placeholder="Scan / enter SKU or barcode"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && lookupSku()}
                autoFocus
              />
              <Button variant="outline" onClick={lookupSku} disabled={lookingUp} className="gap-1.5 shrink-0">
                {lookingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Lookup
              </Button>
            </div>
            {variant && (
              <div className="rounded-lg border bg-emerald-500/5 border-emerald-500/30 px-3 py-2">
                <p className="text-xs font-semibold text-emerald-600">
                  {variant.product.name} — {variant.name}
                </p>
                <p className="text-[11px] text-muted-foreground font-mono">{variant.sku}</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Quantity <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Unit Cost <span className="text-destructive">*</span></Label>
              <Input type="number" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            {showExpiry && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Expiry Date</Label>
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
            )}
            {showBatch && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Batch #</Label>
                <Input value={batch} onChange={(e) => setBatch(e.target.value)} placeholder="Optional" className="font-mono" />
              </div>
            )}
          </div>
        </div>

        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PackageCheck className="h-3.5 w-3.5" />}
            Post Quick GRN
          </Button>
        </div>
      </div>
    </div>
  );
}
