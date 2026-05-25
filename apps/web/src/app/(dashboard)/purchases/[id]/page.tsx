"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Package, CheckCircle2, XCircle,
  Clock, Printer, Download, Ban, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { ReceiveItemsModal } from "@/components/purchases/receive-items-modal";

// ── Types ──────────────────────────────────────────────────────────────────
interface POItem {
  id: string; variantId: string; productName: string; variantName: string; sku: string;
  orderedQty: number; receivedQty: number; rejectedQty: number;
  unitCost: number; discount: number; taxRate: number; taxAmount: number; total: number;
  variant?: { size?: string | null; color?: string | null; images?: string[] };
}
interface Supplier {
  id: string; name: string; phone?: string | null; email?: string | null;
  address?: string | null; city?: string | null;
}
interface PO {
  id: string; poNumber: string; status: string;
  orderDate: string; expectedDate?: string | null; receivedDate?: string | null;
  subtotal: number; taxAmount: number; discountAmount: number; total: number; paidAmount: number;
  notes?: string | null; reference?: string | null; paymentTerms?: string | null;
  createdAt: string; updatedAt: string; createdBy?: string | null;
  supplier: Supplier;
  items: POItem[];
  _count?: { items: number };
}

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { label: string; color: string; variant: "success" | "secondary" | "info" | "danger" | "warning" }> = {
  DRAFT:              { label: "Draft",     color: "text-amber-600 bg-amber-50 border-amber-200",     variant: "secondary" },
  CONFIRMED:          { label: "Ordered",   color: "text-blue-600 bg-blue-50 border-blue-200",         variant: "info" },
  SENT:               { label: "Ordered",   color: "text-blue-600 bg-blue-50 border-blue-200",         variant: "info" },
  PARTIALLY_RECEIVED: { label: "Partial",   color: "text-orange-600 bg-orange-50 border-orange-200",   variant: "warning" },
  RECEIVED:           { label: "Received",  color: "text-emerald-600 bg-emerald-50 border-emerald-200", variant: "success" },
  CANCELLED:          { label: "Cancelled", color: "text-red-600 bg-red-50 border-red-200",             variant: "danger" },
};

function fmt(n: number) {
  return `LKR ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "2-digit" });
}


// ── Status timeline ────────────────────────────────────────────────────────
function StatusTimeline({ status, orderDate }: { status: string; orderDate: string }) {
  const steps = [
    { key: "CONFIRMED",          label: "Ordered",            icon: CheckCircle2 },
    { key: "PARTIALLY_RECEIVED", label: "Partially Received", icon: Package },
    { key: "RECEIVED",           label: "Completed",          icon: CheckCircle2 },
    { key: "CANCELLED",          label: "Cancelled",          icon: XCircle },
  ];
  const order = ["DRAFT","CONFIRMED","SENT","PARTIALLY_RECEIVED","RECEIVED","CANCELLED"];
  const currentIdx = order.indexOf(status);

  return (
    <div className="flex items-start gap-2">
      {steps.map((step, i) => {
        const stepIdx = order.indexOf(step.key);
        const active = status === step.key || (status === "SENT" && step.key === "CONFIRMED");
        const done = currentIdx > stepIdx && status !== "CANCELLED";
        const Icon = step.icon;
        return (
          <div key={step.key} className="flex flex-col items-center gap-1 flex-1">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all
              ${active ? "bg-primary border-primary text-white" :
                done ? "bg-primary/20 border-primary/40 text-primary" :
                "bg-muted border-muted-foreground/20 text-muted-foreground"}`}>
              <Icon className="h-4 w-4" />
            </div>
            <p className={`text-[10px] font-medium text-center leading-tight
              ${active ? "text-primary" : done ? "text-primary/70" : "text-muted-foreground"}`}>
              {step.label}
            </p>
            <p className="text-[9px] text-muted-foreground">{active ? fmtDate(orderDate) : "—"}</p>
          </div>
        );
      })}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────
export default function PODetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [po,       setPo]       = useState<PO | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [acting,   setActing]   = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get<PO>(`/purchases/${id}`);
      setPo(res.data);
    } catch { toast.error("Failed to load purchase order"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const updateStatus = async (status: string) => {
    if (!po) return;
    setActing(true);
    try {
      await api.put(`/purchases/${po.id}/status`, { status });
      toast.success(`Status updated to ${STATUS_MAP[status]?.label ?? status}`);
      load();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed to update status"); }
    finally { setActing(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
    </div>
  );

  if (!po) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <Package className="h-12 w-12 text-muted-foreground/40" />
      <p className="text-muted-foreground">Purchase order not found</p>
      <Button variant="outline" onClick={() => router.push("/purchases")}>Back to Purchases</Button>
    </div>
  );

  const statusConf = STATUS_MAP[po.status] ?? STATUS_MAP.DRAFT;
  const canReceive = ["CONFIRMED", "SENT", "PARTIALLY_RECEIVED"].includes(po.status);
  const canCancel  = !["RECEIVED", "CANCELLED"].includes(po.status);
  const amountDue  = po.total - po.paidAmount;

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="p-6 space-y-5">

        {/* ── Top 3-column ── */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_280px] gap-4">

          {/* PO info */}
          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusConf.color}`}>
                {statusConf.label}
              </span>
              <div className="flex gap-2 ml-auto">
                {canReceive && (
                  <Button size="sm" className="gap-1.5" onClick={() => setReceiveOpen(true)}>
                    <Package className="h-3.5 w-3.5" /> Receive Items
                  </Button>
                )}
                <Button variant="outline" size="sm" className="gap-1.5"
                  onClick={() => router.push(`/purchases/${po.id}/print-tags`)}>
                  <Tag className="h-3.5 w-3.5" /> Print Tags
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Printer className="h-3.5 w-3.5" /> Print
                </Button>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Download className="h-3.5 w-3.5" /> Download
                </Button>
              </div>
            </div>
            <h2 className="text-2xl font-bold font-mono">{po.poNumber}</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              {[
                ["Order Date",     fmtDate(po.orderDate)],
                ["Expected Date",  fmtDate(po.expectedDate)],
                ["Reference",      po.reference ?? "—"],
                ["Payment Terms",  po.paymentTerms ?? "—"],
              ].map(([label, val]) => (
                <div key={label}>
                  <p className="text-muted-foreground">{label}</p>
                  <p className="font-semibold mt-0.5">{val}</p>
                </div>
              ))}
            </div>
            {po.notes && (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="text-xs mt-0.5">{po.notes}</p>
              </div>
            )}
          </div>

          {/* Supplier */}
          <div className="border rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm text-muted-foreground">Supplier</h3>
            <div className="flex items-start gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm shrink-0">
                {po.supplier.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="space-y-1.5 text-sm">
                <p className="font-bold text-base">{po.supplier.name}</p>
                {po.supplier.phone   && <p className="text-xs text-muted-foreground">📞 {po.supplier.phone}</p>}
                {po.supplier.email   && <p className="text-xs text-muted-foreground">✉️ {po.supplier.email}</p>}
                {po.supplier.address && (
                  <p className="text-xs text-muted-foreground">📍 {po.supplier.address}{po.supplier.city ? `, ${po.supplier.city}` : ""}</p>
                )}
              </div>
            </div>
          </div>

          {/* Financial summary */}
          <div className="border rounded-xl p-4 space-y-2">
            {[
              ["Sub Total",    fmt(po.subtotal),         "text-foreground"],
              ["Discount",     fmt(po.discountAmount),   "text-foreground"],
              ["Tax",          fmt(po.taxAmount),        "text-foreground"],
            ].map(([label, val, cls]) => (
              <div key={label} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{label}</span>
                <span className={cls}>{val}</span>
              </div>
            ))}
            <div className="border-t pt-2 flex justify-between font-bold">
              <span>Total Amount</span>
              <span className="text-primary text-lg">{fmt(po.total)}</span>
            </div>
            <div className="mt-2 rounded-lg bg-muted/30 p-2.5 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Amount Paid
                </span>
                <span>{fmt(po.paidAmount)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold text-red-500">
                <span>Amount Due</span>
                <span>{fmt(amountDue)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Items ── */}
        <div className="border rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center gap-2">
            <h3 className="font-semibold text-sm">Items</h3>
            <span className="text-xs text-muted-foreground">({po.items?.length ?? po._count?.items ?? 0})</span>
          </div>
          <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/20">
                  <tr>
                    {["#", "Item", "SKU", "Variant", "Unit", "Ordered Qty", "Unit Cost (LKR)", "Discount", "Tax (18%)", "Amount (LKR)"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(po.items ?? []).map((item, i) => (
                    <tr key={item.id} className="border-t hover:bg-muted/10">
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="h-8 w-8 rounded bg-muted/50 flex items-center justify-center shrink-0">
                            {item.variant?.images?.[0] ? (
                              <img src={item.variant.images[0]} alt="" className="h-full w-full object-cover rounded" />
                            ) : (
                              <Package className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                          <div>
                            <p className="font-medium text-xs">{item.productName}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{item.sku}</td>
                      <td className="px-3 py-2.5 text-xs">{item.variantName}</td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">Pcs</td>
                      <td className="px-3 py-2.5 font-semibold text-xs">{item.orderedQty}</td>
                      <td className="px-3 py-2.5 text-xs">{item.unitCost.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-xs">{(item.discount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 text-xs">{item.taxAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-2.5 font-semibold text-xs">{item.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted/20 border-t font-bold text-xs">
                  <tr>
                    <td colSpan={5} className="px-3 py-2">Total Items: {po.items?.length ?? 0}</td>
                    <td className="px-3 py-2">{po.items?.reduce((s, i) => s + i.orderedQty, 0) ?? 0}</td>
                    <td colSpan={2} />
                    <td colSpan={2} className="px-3 py-2 text-right">{po.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
        </div>

        {/* ── Bottom section ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">


          {/* Other info */}
          <div className="border rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-3">Other Information</h3>
            <div className="space-y-2 text-xs">
              {[
                ["Created By",      po.createdBy ?? "System"],
                ["Created On",      new Date(po.createdAt).toLocaleString()],
                ["Last Updated On", new Date(po.updatedAt).toLocaleString()],
              ].map(([label, val]) => (
                <div key={label} className="flex gap-4">
                  <span className="text-muted-foreground w-32 shrink-0">{label}</span>
                  <span className="font-medium">{val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Order status timeline */}
          <div className="border rounded-xl p-4">
            <h3 className="font-semibold text-sm mb-3">Order Status</h3>
            <StatusTimeline status={po.status} orderDate={po.orderDate} />
          </div>
        </div>

        {/* ── Footer actions ── */}
        <div className="flex justify-end gap-3 pt-2 border-t">
          {po.status === "DRAFT" && (
            <Button variant="outline" size="sm" disabled={acting} onClick={() => updateStatus("CONFIRMED")}>
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Mark as Ordered
            </Button>
          )}
          {canCancel && (
            <Button variant="destructive" size="sm" disabled={acting} onClick={() => updateStatus("CANCELLED")}>
              <Ban className="h-3.5 w-3.5 mr-1.5" /> Cancel Order
            </Button>
          )}
        </div>
      </div>

      {/* Receive Items Modal */}
      {receiveOpen && (
        <ReceiveItemsModal
          po={po}
          onClose={() => setReceiveOpen(false)}
          onReceived={() => { setReceiveOpen(false); load(); toast.success("Items received"); }}
        />
      )}
    </div>
  );
}
