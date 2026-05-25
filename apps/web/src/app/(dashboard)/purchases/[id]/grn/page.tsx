"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, CheckCircle2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";

interface POItem {
  id: string; productName: string; variantName: string; sku: string;
  orderedQty: number; receivedQty: number; rejectedQty: number;
  unitCost: number; discount: number; taxRate: number; taxAmount: number; total: number;
  variant?: { color?: string | null; size?: string | null; barcode?: string | null };
}
interface PO {
  id: string; poNumber: string; status: string; orderDate: string;
  expectedDate?: string | null; receivedDate?: string | null;
  subtotal: number; discountAmount: number; taxAmount: number; total: number;
  notes?: string | null; reference?: string | null; paymentTerms?: string | null;
  createdAt: string; updatedAt: string;
  supplier: { name: string; phone?: string | null; email?: string | null; address?: string | null; city?: string | null };
  items: POItem[];
}

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmt = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GRNPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const res = await api.get<PO>(`/purchases/${id}`); setPo(res.data); }
    catch { toast.error("Failed to load PO"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading…</div>;
  if (!po) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">PO not found</div>;

  const receivedItems = po.items.filter((i) => i.receivedQty > 0);
  const totalReceived = receivedItems.reduce((s, i) => s + i.receivedQty, 0);
  const totalRejected = po.items.reduce((s, i) => s + i.rejectedQty, 0);
  const grnNumber = `GRN-${po.poNumber.replace("PO-", "")}`;

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; font-size: 12px; }
          .print-doc { max-width: 100% !important; padding: 10mm !important; }
        }
      `}</style>

      {/* Screen toolbar */}
      <div className="no-print bg-background border-b px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/purchases/${id}`)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-lg font-bold">Goods Received Note</h1>
            <p className="text-sm text-muted-foreground">{grnNumber} · {po.supplier.name}</p>
          </div>
        </div>
        <Button onClick={() => window.print()} className="gap-2">
          <Printer className="h-4 w-4" /> Print GRN
        </Button>
      </div>

      {/* GRN Document */}
      <div className="print-doc max-w-[900px] mx-auto p-8 space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <p className="text-2xl font-extrabold tracking-tight">FashionERP</p>
            <p className="text-sm text-muted-foreground mt-0.5">Goods Received Note</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">{grnNumber}</p>
            <p className="text-sm text-muted-foreground">PO: {po.poNumber}</p>
            <p className="text-sm text-muted-foreground">Date: {fmtDate(po.receivedDate ?? po.updatedAt)}</p>
          </div>
        </div>

        <div className="border-t border-b py-4 grid grid-cols-2 gap-6">
          {/* Supplier */}
          <div>
            <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-1">Supplier</p>
            <p className="font-bold">{po.supplier.name}</p>
            {po.supplier.phone   && <p className="text-sm text-muted-foreground">{po.supplier.phone}</p>}
            {po.supplier.email   && <p className="text-sm text-muted-foreground">{po.supplier.email}</p>}
            {po.supplier.address && <p className="text-sm text-muted-foreground">{po.supplier.address}{po.supplier.city ? `, ${po.supplier.city}` : ""}</p>}
          </div>
          {/* GRN Info */}
          <div className="grid grid-cols-2 gap-y-1 text-sm">
            {[
              ["PO Number",      po.poNumber],
              ["GRN Number",     grnNumber],
              ["Order Date",     fmtDate(po.orderDate)],
              ["Received Date",  fmtDate(po.receivedDate ?? po.updatedAt)],
              ["Reference",      po.reference ?? "—"],
              ["Payment Terms",  po.paymentTerms ?? "—"],
            ].map(([label, val]) => (
              <React.Fragment key={label}>
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{val}</span>
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Summary badges */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Items Ordered",  value: po.items.length,   color: "bg-blue-50 text-blue-700 border-blue-200" },
            { label: "Units Received", value: totalReceived,     color: "bg-green-50 text-green-700 border-green-200" },
            { label: "Units Rejected", value: totalRejected,     color: totalRejected > 0 ? "bg-red-50 text-red-700 border-red-200" : "bg-muted/30 text-muted-foreground border" },
          ].map(({ label, value, color }) => (
            <div key={label} className={`rounded-xl border p-4 text-center ${color}`}>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-xs mt-0.5 font-medium">{label}</p>
            </div>
          ))}
        </div>

        {/* Items table */}
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 text-left">#</th>
                <th className="px-4 py-2.5 text-left">Product</th>
                <th className="px-4 py-2.5 text-left">SKU / Barcode</th>
                <th className="px-4 py-2.5 text-left">Variant</th>
                <th className="px-4 py-2.5 text-right">Ordered</th>
                <th className="px-4 py-2.5 text-right">Received</th>
                <th className="px-4 py-2.5 text-right">Rejected</th>
                <th className="px-4 py-2.5 text-right">Unit Cost</th>
                <th className="px-4 py-2.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {po.items.map((item, idx) => (
                <tr key={item.id} className={item.receivedQty === 0 ? "opacity-40" : ""}>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="px-4 py-2.5 font-medium">{item.productName}</td>
                  <td className="px-4 py-2.5">
                    <p className="font-mono text-xs">{item.sku}</p>
                    {item.variant?.barcode && <p className="text-[10px] text-muted-foreground">{item.variant.barcode}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">
                    {[item.variant?.color, item.variant?.size].filter(Boolean).join(" / ") || item.variantName}
                  </td>
                  <td className="px-4 py-2.5 text-right">{item.orderedQty}</td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`font-semibold ${item.receivedQty > 0 ? "text-green-600" : "text-muted-foreground"}`}>{item.receivedQty}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={item.rejectedQty > 0 ? "text-red-500 font-semibold" : "text-muted-foreground"}>{item.rejectedQty}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">LKR {fmt(item.unitCost)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold">LKR {fmt(item.receivedQty * item.unitCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/20 border-t text-sm font-semibold">
              <tr>
                <td colSpan={5} className="px-4 py-2.5 text-muted-foreground">Totals</td>
                <td className="px-4 py-2.5 text-right text-green-600">{totalReceived}</td>
                <td className="px-4 py-2.5 text-right text-red-500">{totalRejected}</td>
                <td />
                <td className="px-4 py-2.5 text-right">LKR {fmt(receivedItems.reduce((s, i) => s + i.receivedQty * i.unitCost, 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {po.notes && (
          <div className="border rounded-xl p-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
            <p className="text-sm">{po.notes}</p>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-8 pt-6">
          {["Received By", "Checked By", "Authorized By"].map((label) => (
            <div key={label} className="border-t pt-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xs text-muted-foreground mt-6">Signature / Date</p>
            </div>
          ))}
        </div>

        {/* Status watermark */}
        {po.status === "RECEIVED" && (
          <div className="flex justify-center pt-2">
            <div className="flex items-center gap-2 border-2 border-green-500 text-green-600 rounded-lg px-4 py-2">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-bold text-sm tracking-wide">FULLY RECEIVED</span>
            </div>
          </div>
        )}
        {po.status === "PARTIALLY_RECEIVED" && (
          <div className="flex justify-center pt-2">
            <div className="flex items-center gap-2 border-2 border-yellow-500 text-yellow-600 rounded-lg px-4 py-2">
              <Package className="h-4 w-4" />
              <span className="font-bold text-sm tracking-wide">PARTIALLY RECEIVED</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
