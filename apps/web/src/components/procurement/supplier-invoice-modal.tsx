"use client";

import { useState } from "react";
import { X, FileText, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";

type Supplier = { id: string; name: string };

interface Props {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
  suppliers: Supplier[];
}

export function SupplierInvoiceModal({ open, onClose, onPosted, suppliers }: Props) {
  const [supplierId, setSupplierId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [total, setTotal] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setInvoiceNumber(""); setTotal(""); };
  const handleClose = () => { reset(); onClose(); };

  const submit = async () => {
    if (!supplierId || !invoiceNumber.trim() || !total) {
      toast.error("Supplier, invoice # and total required");
      return;
    }
    const amount = parseFloat(total);
    if (isNaN(amount) || amount <= 0) { toast.error("Enter a valid total"); return; }
    setBusy(true);
    try {
      await api.post("/procurement/supplier-invoices", {
        supplierId,
        invoiceNumber: invoiceNumber.trim(),
        subtotal: amount,
        post: true,
      });
      toast.success("Supplier invoice posted");
      reset();
      onPosted();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Invoice create failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-md border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b">
          <div className="h-9 w-9 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-indigo-500" />
          </div>
          <div>
            <h2 className="text-base font-bold">Post Supplier Invoice</h2>
            <p className="text-xs text-muted-foreground">Record a payable invoice from a supplier</p>
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
            <Label className="text-xs font-semibold">Invoice # <span className="text-destructive">*</span></Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="INV-001" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Total (LKR) <span className="text-destructive">*</span></Label>
            <Input type="number" min="0.01" value={total} onChange={(e) => setTotal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()} placeholder="0.00" />
          </div>
        </div>

        <div className={modalBarFooterClass}>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Post Invoice
          </Button>
        </div>
      </div>
    </div>
  );
}
