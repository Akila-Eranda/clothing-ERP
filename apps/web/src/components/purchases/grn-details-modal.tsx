"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardPlus, FileText, Loader2, PackageCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";

export type GrnDetails = {
  id: string;
  grnNumber: string;
  source: string;
  status: string;
  receivedAt: string;
  notes?: string | null;
  supplierInvoiceRef?: string | null;
  supplier: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    contactPerson?: string | null;
  };
  purchase?: { id: string; poNumber: string } | null;
  items: {
    id: string;
    variantId: string;
    productName: string;
    variantName: string;
    sku: string;
    orderedQty: number;
    receivedQty: number;
    rejectedQty: number;
    unitCost: number;
    batchNumber?: string | null;
    expiryDate?: string | null;
    manufactureDate?: string | null;
  }[];
};

function sourceLabel(src: string) {
  if (src === "FROM_PO") return "From PO";
  if (src === "QUICK") return "Quick";
  if (src === "DIRECT") return "Direct";
  return src;
}

function fmtMoney(n: number) {
  return n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDay(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

interface Props {
  grnId: string | null;
  onClose: () => void;
}

export function GrnDetailsModal({ grnId, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [grn, setGrn] = useState<GrnDetails | null>(null);

  useEffect(() => {
    if (!grnId) {
      setGrn(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    api
      .get<GrnDetails>(`/procurement/grn/${grnId}`)
      .then((r) => {
        if (!cancelled) setGrn(r.data);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          toast.error((e as Error).message ?? "Failed to load GRN details");
          onClose();
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only refetch when grnId changes
  }, [grnId]);

  if (!grnId) return null;

  const totalQty = grn?.items.reduce((s, i) => s + i.receivedQty, 0) ?? 0;
  const totalValue = grn?.items.reduce((s, i) => s + i.receivedQty * i.unitCost, 0) ?? 0;
  const rejectedQty = grn?.items.reduce((s, i) => s + (i.rejectedQty || 0), 0) ?? 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="panel-edge w-full max-w-3xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border shrink-0 bg-muted/30">
          <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
            <PackageCheck className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold font-mono">
                {grn?.grnNumber ?? "GRN Details"}
              </h2>
              {grn && (
                <>
                  <Badge variant="outline" className="text-[10px]">
                    {sourceLabel(grn.source)}
                  </Badge>
                  <Badge
                    variant={grn.status === "POSTED" ? "success" : "secondary"}
                    className="text-[10px]"
                  >
                    {grn.status}
                  </Badge>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Goods receipt details
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading || !grn ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Meta cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-xl border bg-muted/15 p-4 space-y-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Supplier</p>
                <p className="font-semibold">{grn.supplier.name}</p>
                {(grn.supplier.contactPerson || grn.supplier.phone) && (
                  <p className="text-xs text-muted-foreground">
                    {[grn.supplier.contactPerson, grn.supplier.phone].filter(Boolean).join(" · ")}
                  </p>
                )}
                <Link
                  href={`/suppliers/${grn.supplier.id}`}
                  className="text-xs text-primary font-semibold hover:underline inline-block"
                >
                  View supplier
                </Link>
              </div>

              <div className="rounded-xl border bg-muted/15 p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Received</span>
                  <span className="font-medium tabular-nums">{fmtDate(grn.receivedAt)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">PO</span>
                  {grn.purchase?.poNumber ? (
                    <Link
                      href={`/purchases/${grn.purchase.id}`}
                      className="font-mono text-xs text-blue-500 font-semibold hover:underline"
                    >
                      {grn.purchase.poNumber}
                    </Link>
                  ) : (
                    <span className="font-medium">—</span>
                  )}
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Invoice Ref</span>
                  <span className="font-medium">{grn.supplierInvoiceRef || "—"}</span>
                </div>
                {grn.notes && (
                  <div className="pt-2 border-t">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Notes</p>
                    <p className="text-xs">{grn.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Lines</p>
                <p className="text-lg font-bold tabular-nums">{grn.items.length}</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Received Qty</p>
                <p className="text-lg font-bold tabular-nums text-emerald-700">{totalQty}</p>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Value</p>
                <p className="text-lg font-bold tabular-nums">LKR {fmtMoney(totalValue)}</p>
              </div>
            </div>

            {/* Items */}
            <div className="border rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
                <p className="text-xs font-semibold">Received items</p>
                {rejectedQty > 0 && (
                  <span className="text-[10px] font-semibold text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                    Rejected: {rejectedQty}
                  </span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead className="bg-muted/30 border-b">
                    <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2 text-left font-semibold">Product</th>
                      <th className="px-3 py-2 text-right font-semibold w-20">Ordered</th>
                      <th className="px-3 py-2 text-right font-semibold w-20">Received</th>
                      <th className="px-3 py-2 text-right font-semibold w-20">Rejected</th>
                      <th className="px-3 py-2 text-right font-semibold w-28">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-semibold w-28">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {grn.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2.5">
                          <p className="font-medium text-sm truncate">{item.productName}</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">
                            {item.sku}
                            {item.variantName ? ` · ${item.variantName}` : ""}
                          </p>
                          {(item.batchNumber || item.expiryDate) && (
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                              {item.batchNumber ? `Batch ${item.batchNumber}` : ""}
                              {item.batchNumber && item.expiryDate ? " · " : ""}
                              {item.expiryDate ? `Exp ${fmtDay(item.expiryDate)}` : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {item.orderedQty || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-emerald-700">
                          {item.receivedQty}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {item.rejectedQty || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {fmtMoney(item.unitCost)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                          {fmtMoney(item.receivedQty * item.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-4 py-3 border-t bg-muted/10 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Grand Total</span>
                <span className="font-bold text-emerald-700 tabular-nums">
                  LKR {fmtMoney(totalValue)}
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-6 py-4 border-t border-border bg-muted/40 shrink-0">
          <div className="min-w-0">
            {!grn?.purchase && grn && (grn.source === "QUICK" || grn.source === "DIRECT") ? (
              <p className="text-xs text-muted-foreground leading-relaxed max-w-sm">
                Create a purchase order from this GRN for records and supplier invoices.
              </p>
            ) : (
              <span />
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0 sm:ml-auto">
            <Button variant="ghost" onClick={onClose} className="h-10 px-4">
              Close
            </Button>
            {grn?.purchase?.id && (
              <Button variant="outline" asChild className="h-10 gap-2">
                <Link href={`/purchases/${grn.purchase.id}`}>
                  <FileText className="h-4 w-4" />
                  Open PO {grn.purchase.poNumber}
                </Link>
              </Button>
            )}
            {grn && !grn.purchase && (grn.source === "QUICK" || grn.source === "DIRECT") && (
              <Button
                size="lg"
                className="h-11 gap-2.5 px-5 rounded-[10px] shadow-button font-semibold"
                onClick={() => {
                  onClose();
                  router.push(`/purchases/new?fromGrn=${grn.id}`);
                }}
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/15">
                  <ClipboardPlus className="h-4 w-4" />
                </span>
                Create PO from GRN
                <ArrowRight className="h-4 w-4 opacity-80" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
