"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Printer, CheckCircle2, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { APP_NAME } from "@/lib/constants";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { variantTableColumns, formatVariantCell } from "@/lib/shop-vertical";
import { cn } from "@/lib/utils";

interface POItem {
  id: string; productName: string; variantName: string; sku: string;
  orderedQty: number; receivedQty: number; rejectedQty: number;
  unitCost: number; discount: number; taxRate: number; taxAmount: number; total: number;
  variant?: { color?: string | null; size?: string | null; material?: string | null; style?: string | null; barcode?: string | null };
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
const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GRNPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useShopWorkspace();
  const variantCols = variantTableColumns(profile);
  const variantHeader = variantCols.map((c) => c.label).join(" / ") || "Variant";
  const { settings: receiptSettings } = useReceiptSettings();
  const shopTitle = receiptSettings.shopName || APP_NAME;
  const router = useRouter();
  const [po, setPo] = useState<PO | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try { const res = await api.get<PO>(`/purchases/${id}`); setPo(res.data); }
    catch { toast.error("Failed to load PO"); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center min-h-screen text-foreground">Loading…</div>;
  if (!po) return <div className="flex items-center justify-center min-h-screen text-muted-foreground">PO not found</div>;

  const receivedItems = po.items.filter((i) => i.receivedQty > 0);
  const totalReceived = receivedItems.reduce((s, i) => s + i.receivedQty, 0);
  const totalRejected = po.items.reduce((s, i) => s + i.rejectedQty, 0);
  const grnNumber = `GRN-${po.poNumber.replace("PO-", "")}`;
  const receivedTotal = receivedItems.reduce((s, i) => s + i.receivedQty * i.unitCost, 0);

  const summaryCards = [
    {
      label: "Items Ordered",
      value: po.items.length,
      className: "bg-blue-500/10 text-blue-700 border-blue-500/25 dark:text-blue-300 dark:border-blue-400/30",
    },
    {
      label: "Units Received",
      value: totalReceived,
      className: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300 dark:border-emerald-400/30",
    },
    {
      label: "Units Rejected",
      value: totalRejected,
      className: totalRejected > 0
        ? "bg-red-500/10 text-red-700 border-red-500/25 dark:text-red-300 dark:border-red-400/30"
        : "bg-muted text-muted-foreground border-border",
    },
  ];

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; font-size: 12px; }
          .print-doc {
            max-width: 100% !important;
            width: 100% !important;
            padding: 10mm !important;
            background: white !important;
            color: black !important;
            border: none !important;
            box-shadow: none !important;
          }
          .print-doc * { color: inherit; }
          .stat-card { border-color: #ccc !important; background: #f8f8f8 !important; color: #111 !important; }
        }
      `}</style>

      <div className="min-h-screen bg-muted/30 text-foreground">
        {/* Screen toolbar */}
        <div className="no-print sticky top-0 z-40 bg-background border-b px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" className="shrink-0" onClick={() => router.push(`/purchases/${id}`)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-bold truncate">Goods Received Note</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">{grnNumber} · {po.supplier.name}</p>
            </div>
          </div>
          <Button onClick={() => window.print()} className="gap-2 shrink-0">
            <Printer className="h-4 w-4" />
            <span className="hidden sm:inline">Print GRN</span>
            <span className="sm:hidden">Print</span>
          </Button>
        </div>

        {/* GRN Document — full width */}
        <div className="print-doc w-full max-w-none mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
          <div className="rounded-2xl border bg-card text-card-foreground shadow-sm p-4 sm:p-6 lg:p-8 space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground">{shopTitle}</p>
                <p className="text-sm text-muted-foreground mt-0.5">Goods Received Note</p>
              </div>
              <div className="sm:text-right shrink-0">
                <p className="text-lg sm:text-xl font-bold text-foreground">{grnNumber}</p>
                <p className="text-sm text-muted-foreground">PO: {po.poNumber}</p>
                <p className="text-sm text-muted-foreground">Date: {fmtDate(po.receivedDate ?? po.updatedAt)}</p>
              </div>
            </div>

            <div className="border-t border-b border-border py-4 grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-1">Supplier</p>
                <p className="font-bold text-foreground">{po.supplier.name}</p>
                {po.supplier.phone && <p className="text-sm text-muted-foreground">{po.supplier.phone}</p>}
                {po.supplier.email && <p className="text-sm text-muted-foreground">{po.supplier.email}</p>}
                {po.supplier.address && (
                  <p className="text-sm text-muted-foreground">
                    {po.supplier.address}{po.supplier.city ? `, ${po.supplier.city}` : ""}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-sm">
                {[
                  ["PO Number", po.poNumber],
                  ["GRN Number", grnNumber],
                  ["Order Date", fmtDate(po.orderDate)],
                  ["Received Date", fmtDate(po.receivedDate ?? po.updatedAt)],
                  ["Reference", po.reference ?? "—"],
                  ["Payment Terms", po.paymentTerms ?? "—"],
                ].map(([label, val]) => (
                  <React.Fragment key={label}>
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">{val}</span>
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* Summary badges — theme tokens for dark + light */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {summaryCards.map(({ label, value, className }) => (
                <div
                  key={label}
                  className={cn("stat-card rounded-xl border p-4 text-center", className)}
                >
                  <p className="text-2xl font-bold tabular-nums">{value}</p>
                  <p className="text-xs mt-0.5 font-medium opacity-90">{label}</p>
                </div>
              ))}
            </div>

            {/* Items table */}
            <div className="border border-border rounded-xl overflow-hidden bg-background">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[720px]">
                  <thead className="bg-muted/50 border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2.5 text-left">#</th>
                      <th className="px-4 py-2.5 text-left">Product</th>
                      <th className="px-4 py-2.5 text-left">SKU / Barcode</th>
                      <th className="px-4 py-2.5 text-left">{variantHeader}</th>
                      <th className="px-4 py-2.5 text-right">Ordered</th>
                      <th className="px-4 py-2.5 text-right">Received</th>
                      <th className="px-4 py-2.5 text-right">Rejected</th>
                      <th className="px-4 py-2.5 text-right">Unit Cost</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {po.items.map((item, idx) => (
                      <tr key={item.id} className={cn(item.receivedQty === 0 && "opacity-50")}>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                        <td className="px-4 py-2.5 font-medium text-foreground">{item.productName}</td>
                        <td className="px-4 py-2.5">
                          <p className="font-mono text-xs text-foreground">{item.sku}</p>
                          {item.variant?.barcode && (
                            <p className="text-[10px] text-muted-foreground">{item.variant.barcode}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {formatVariantCell(item.variant, profile, item.variantName)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">{item.orderedQty}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={cn(
                            "font-semibold",
                            item.receivedQty > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
                          )}>
                            {item.receivedQty}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <span className={cn(
                            item.rejectedQty > 0 ? "text-red-600 dark:text-red-400 font-semibold" : "text-muted-foreground",
                          )}>
                            {item.rejectedQty}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-foreground">LKR {fmt(item.unitCost)}</td>
                        <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-foreground">
                          LKR {fmt(item.receivedQty * item.unitCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/40 border-t border-border text-sm font-semibold">
                    <tr>
                      <td colSpan={5} className="px-4 py-2.5 text-muted-foreground">Totals</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400">{totalReceived}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600 dark:text-red-400">{totalRejected}</td>
                      <td />
                      <td className="px-4 py-2.5 text-right tabular-nums text-foreground">LKR {fmt(receivedTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {po.notes && (
              <div className="border border-border rounded-xl p-4 bg-muted/20">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{po.notes}</p>
              </div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 pt-4">
              {["Received By", "Checked By", "Authorized By"].map((label) => (
                <div key={label} className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground mt-8">Signature / Date</p>
                </div>
              ))}
            </div>

            {/* Status watermark */}
            {po.status === "RECEIVED" && (
              <div className="flex justify-center pt-2">
                <div className="flex items-center gap-2 border-2 border-emerald-500/60 text-emerald-700 dark:text-emerald-400 rounded-lg px-4 py-2 bg-emerald-500/5">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-bold text-sm tracking-wide">FULLY RECEIVED</span>
                </div>
              </div>
            )}
            {po.status === "PARTIALLY_RECEIVED" && (
              <div className="flex justify-center pt-2">
                <div className="flex items-center gap-2 border-2 border-amber-500/60 text-amber-700 dark:text-amber-400 rounded-lg px-4 py-2 bg-amber-500/5">
                  <Package className="h-4 w-4" />
                  <span className="font-bold text-sm tracking-wide">PARTIALLY RECEIVED</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
