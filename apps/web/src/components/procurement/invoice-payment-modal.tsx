"use client";

import { useEffect, useState } from "react";
import { X, Wallet, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

export type PayableInvoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  paidAmount: number;
  supplier: { name: string };
};

type BankAccount = { id: string; name: string; code: string };

interface Props {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
  invoices: PayableInvoice[];
  banks: BankAccount[];
  /** Preselect an invoice (Pay button on a table row) */
  initialInvoiceId?: string;
}

export function InvoicePaymentModal({ open, onClose, onPaid, invoices, banks, initialInvoiceId }: Props) {
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [chequeDueDate, setChequeDueDate] = useState("");
  const [chequeBankName, setChequeBankName] = useState("");
  const [chequeBankAccountId, setChequeBankAccountId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const id = initialInvoiceId ?? "";
    setInvoiceId(id);
    const inv = invoices.find((i) => i.id === id);
    setAmount(inv ? Math.max(0, inv.total - inv.paidAmount).toFixed(2) : "");
  }, [open, initialInvoiceId, invoices]);

  const reset = () => {
    setAmount(""); setReference(""); setNotes("");
    setChequeDueDate(""); setChequeBankName(""); setChequeBankAccountId("");
    setMethod("CASH");
  };
  const handleClose = () => { reset(); onClose(); };

  const selected = invoices.find((i) => i.id === invoiceId);
  const due = selected ? Math.max(0, selected.total - selected.paidAmount) : 0;

  const submit = async () => {
    if (!invoiceId) { toast.error("Select an invoice"); return; }
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) { toast.error("Enter valid payment amount"); return; }
    if (method === "CHEQUE" && !reference.trim()) { toast.error("Cheque number required"); return; }
    setBusy(true);
    try {
      await api.post(`/procurement/supplier-invoices/${invoiceId}/pay`, {
        amount: amt,
        method,
        reference: reference || undefined,
        notes: notes || undefined,
        chequeNumber: method === "CHEQUE" ? reference : undefined,
        chequeDueDate: method === "CHEQUE" && chequeDueDate ? chequeDueDate : undefined,
        chequeBankName: method === "CHEQUE" && chequeBankName ? chequeBankName : undefined,
        chequeBankAccountId: method === "CHEQUE" && chequeBankAccountId ? chequeBankAccountId : undefined,
      });
      toast.success("Supplier payment recorded");
      reset();
      onPaid();
      onClose();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Invoice payment failed");
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-lg border overflow-hidden max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 px-6 py-4 border-b shrink-0">
          <div className="h-9 w-9 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Wallet className="h-4 w-4 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-base font-bold">Pay Supplier Invoice</h2>
            <p className="text-xs text-muted-foreground">Cash, bank transfer or cheque</p>
          </div>
          <button onClick={handleClose} className="ml-auto p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Invoice <span className="text-destructive">*</span></Label>
            <select
              className="w-full h-10 rounded-md border bg-background px-3 text-sm"
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                const inv = invoices.find((i) => i.id === e.target.value);
                setAmount(inv ? Math.max(0, inv.total - inv.paidAmount).toFixed(2) : "");
              }}
            >
              <option value="">Select invoice…</option>
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber} · {inv.supplier?.name ?? "Supplier"} · Due {formatNumber(Math.max(0, inv.total - inv.paidAmount))}
                </option>
              ))}
            </select>
            {selected && (
              <p className="text-[11px] text-muted-foreground">
                Total LKR {formatNumber(selected.total)} · Paid LKR {formatNumber(selected.paidAmount)} ·{" "}
                <span className="font-semibold text-amber-600">Due LKR {formatNumber(due)}</span>
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Amount (LKR) <span className="text-destructive">*</span></Label>
              <Input type="number" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Method</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="CASH">Cash</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              {method === "CHEQUE" ? <>Cheque # <span className="text-destructive">*</span></> : "Reference"}
            </Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)}
              placeholder={method === "CHEQUE" ? "Cheque number" : "Optional reference"} />
          </div>

          {method === "CHEQUE" && (
            <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Cheque due date</Label>
                  <Input type="date" value={chequeDueDate} onChange={(e) => setChequeDueDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Cheque bank</Label>
                  <Input value={chequeBankName} onChange={(e) => setChequeBankName(e.target.value)} placeholder="Bank name" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Company bank account</Label>
                <select
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                  value={chequeBankAccountId}
                  onChange={(e) => setChequeBankAccountId(e.target.value)}
                >
                  <option value="">Select account…</option>
                  {banks.map((b) => <option key={b.id} value={b.id}>{b.code} · {b.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t bg-muted/30 shrink-0">
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="gap-1.5">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />}
            Record Payment
          </Button>
        </div>
      </div>
    </div>
  );
}
