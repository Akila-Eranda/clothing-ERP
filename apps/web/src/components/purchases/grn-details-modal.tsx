"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, ClipboardPlus, FileText, Loader2, Printer, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { printGrnReceipt } from "@/lib/grn-receipt-print";
import { useAuthStore } from "@/stores/auth-store";
import { HEX_BTN } from "@/lib/app-button-classes";
import { GrnSourceBadge, GrnStatusBadge } from "@/components/purchases/purchase-table-badges";

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
  return `LKR ${formatNumber(n)}`;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(d?: string | null) {
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

function amountInWords(amount: number) {
  return `Rupees ${formatNumber(amount)} only`;
}

interface Props {
  grnId: string | null;
  onClose: () => void;
}

export function GrnDetailsModal({ grnId, onClose }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [grn, setGrn] = useState<GrnDetails | null>(null);
  const { settings: receiptSettings } = useReceiptSettings();
  const userName = useAuthStore((s) => s.user?.name);

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

  const totals = useMemo(() => {
    if (!grn) return { lines: 0, received: 0, rejected: 0, value: 0, rejectedValue: 0 };
    return {
      lines: grn.items.length,
      received: grn.items.reduce((s, i) => s + i.receivedQty, 0),
      rejected: grn.items.reduce((s, i) => s + (i.rejectedQty || 0), 0),
      value: grn.items.reduce((s, i) => s + i.receivedQty * i.unitCost, 0),
      rejectedValue: grn.items.reduce((s, i) => s + (i.rejectedQty || 0) * i.unitCost, 0),
    };
  }, [grn]);

  const handlePrint = async () => {
    if (!grn) return;
    setPrinting(true);
    try {
      await printGrnReceipt({
        settings: receiptSettings,
        data: {
          grnNumber: grn.grnNumber,
          supplierName: grn.supplier.name,
          receivedAt: grn.receivedAt,
          notes: grn.notes,
          source: sourceLabel(grn.source),
          poNumber: grn.purchase?.poNumber ?? null,
          cashierName: userName ?? null,
          items: grn.items.map((i) => ({
            name: i.variantName && i.variantName !== "Default"
              ? `${i.productName} · ${i.variantName}`
              : i.productName,
            sku: i.sku,
            qty: i.receivedQty,
            unitCost: i.unitCost,
            lineTotal: i.receivedQty * i.unitCost,
            batchNumber: i.batchNumber,
            expiryDate: i.expiryDate,
          })),
        },
      });
      toast.success(`Printed ${grn.grnNumber}`);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Print failed");
    } finally {
      setPrinting(false);
    }
  };

  if (!grnId) return null;

  const shopAddress = [receiptSettings.address1, receiptSettings.address2].filter(Boolean).join(", ");
  const grnForLabel = grn?.purchase?.poNumber
    ? `Purchase Order ${grn.purchase.poNumber}`
    : `${sourceLabel(grn?.source ?? "")} goods receipt`;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-5xl border overflow-hidden max-h-[94vh] flex flex-col">
        {/* DreamsPOS-style page header */}
        <div className="shrink-0 border-b bg-card px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h4 className="text-lg font-bold text-foreground">Goods Received Note</h4>
            {grn && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{grn.grnNumber}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {grn && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => void handlePrint()}
                disabled={printing}
                title="Print"
              >
                {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onClose}>
              <ArrowLeft className="h-4 w-4" />
              Back to GRN
            </Button>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading || !grn ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <div className="rounded-xl border bg-card shadow-sm">
              <div className="p-5 sm:p-6 lg:p-8 space-y-0">
                {/* Logo + GRN meta */}
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 border-b pb-5 mb-5">
                  <div className="min-w-0">
                    {receiptSettings.logoUrl ? (
                      <img
                        src={receiptSettings.logoUrl}
                        alt={receiptSettings.shopName}
                        className="h-12 w-auto max-w-[160px] object-contain mb-2"
                      />
                    ) : (
                      <p className="text-xl font-extrabold tracking-tight text-foreground mb-1">
                        {receiptSettings.shopName}
                      </p>
                    )}
                    {receiptSettings.tagline && (
                      <p className="text-sm text-muted-foreground">{receiptSettings.tagline}</p>
                    )}
                    {shopAddress && <p className="text-sm text-muted-foreground mt-1">{shopAddress}</p>}
                    {receiptSettings.phone && (
                      <p className="text-sm text-muted-foreground">Phone: {receiptSettings.phone}</p>
                    )}
                  </div>
                  <div className="md:text-right shrink-0">
                    <h5 className="text-muted-foreground font-medium mb-1">
                      GRN No <span className="text-primary font-bold font-mono">#{grn.grnNumber}</span>
                    </h5>
                    <p className="text-sm mb-1">
                      <span className="font-medium text-muted-foreground">Received Date :</span>{" "}
                      <span className="text-foreground font-semibold">{fmtDate(grn.receivedAt)}</span>
                    </p>
                    <p className="text-sm mb-1">
                      <span className="font-medium text-muted-foreground">Received Time :</span>{" "}
                      <span className="text-foreground font-semibold">{fmtDateTime(grn.receivedAt)}</span>
                    </p>
                    {grn.purchase?.poNumber && (
                      <p className="text-sm">
                        <span className="font-medium text-muted-foreground">PO Number :</span>{" "}
                        <span className="text-foreground font-semibold font-mono">{grn.purchase.poNumber}</span>
                      </p>
                    )}
                  </div>
                </div>

                {/* From / To / Status */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 border-b pb-5 mb-5">
                  <div className="md:col-span-5">
                    <p className="text-foreground font-semibold mb-2">From</p>
                    <div>
                      <h4 className="text-base font-bold mb-1">{receiptSettings.shopName}</h4>
                      {shopAddress && <p className="text-sm text-muted-foreground mb-1">{shopAddress}</p>}
                      {receiptSettings.email && (
                        <p className="text-sm text-muted-foreground mb-1">
                          Email : <span className="text-foreground">{receiptSettings.email}</span>
                        </p>
                      )}
                      {receiptSettings.phone && (
                        <p className="text-sm text-muted-foreground">
                          Phone : <span className="text-foreground">{receiptSettings.phone}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="md:col-span-5">
                    <p className="text-foreground font-semibold mb-2">Supplier</p>
                    <div>
                      <h4 className="text-base font-bold mb-1">{grn.supplier.name}</h4>
                      {grn.supplier.contactPerson && (
                        <p className="text-sm text-muted-foreground mb-1">{grn.supplier.contactPerson}</p>
                      )}
                      {grn.supplier.email && (
                        <p className="text-sm text-muted-foreground mb-1">
                          Email : <span className="text-foreground">{grn.supplier.email}</span>
                        </p>
                      )}
                      {grn.supplier.phone && (
                        <p className="text-sm text-muted-foreground">
                          Phone : <span className="text-foreground">{grn.supplier.phone}</span>
                        </p>
                      )}
                      <Link
                        href={`/suppliers/${grn.supplier.id}`}
                        className="text-xs text-primary font-semibold hover:underline inline-block mt-2"
                      >
                        View supplier profile
                      </Link>
                    </div>
                  </div>
                  <div className="md:col-span-2">
                    <p className="text-sm font-medium text-muted-foreground mb-2">Receipt Status</p>
                    <div className="space-y-2">
                      <GrnStatusBadge status={grn.status} />
                      <GrnSourceBadge source={grn.source} />
                    </div>
                    {grn.supplierInvoiceRef && (
                      <div className="mt-3">
                        <p className="text-[11px] text-muted-foreground">Supplier Invoice</p>
                        <p className="text-sm font-semibold font-mono">{grn.supplierInvoiceRef}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* GRN For */}
                <p className="font-medium text-sm mb-4">
                  GRN For :{" "}
                  <span className="text-foreground font-semibold">{grnForLabel}</span>
                </p>

                {/* Items table — DreamsPOS thead-light style */}
                <div className="overflow-x-auto mb-5">
                  <table className="w-full text-sm min-w-[680px]">
                    <thead className="bg-muted/40 border-y">
                      <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2.5 font-semibold">Product</th>
                        <th className="px-3 py-2.5 font-semibold text-right w-20">Ordered</th>
                        <th className="px-3 py-2.5 font-semibold text-right w-20">Received</th>
                        <th className="px-3 py-2.5 font-semibold text-right w-20">Rejected</th>
                        <th className="px-3 py-2.5 font-semibold text-right w-28">Unit Cost</th>
                        <th className="px-3 py-2.5 font-semibold text-right w-28">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {grn.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-3 py-3">
                            <h6 className="text-sm font-semibold text-foreground">
                              {item.productName}
                              {item.variantName && item.variantName !== "Default" ? ` · ${item.variantName}` : ""}
                            </h6>
                            <p className="text-xs text-muted-foreground font-mono mt-0.5">{item.sku}</p>
                            {(item.batchNumber || item.expiryDate) && (
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                {item.batchNumber ? `Batch ${item.batchNumber}` : ""}
                                {item.batchNumber && item.expiryDate ? " · " : ""}
                                {item.expiryDate ? `Exp ${fmtDay(item.expiryDate)}` : ""}
                              </p>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-muted-foreground">
                            {item.orderedQty || "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums text-emerald-700">
                            {item.receivedQty}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums text-muted-foreground">
                            {item.rejectedQty || "—"}
                          </td>
                          <td className="px-3 py-3 text-right font-medium tabular-nums">
                            {fmtMoney(item.unitCost)}
                          </td>
                          <td className="px-3 py-3 text-right font-semibold tabular-nums">
                            {fmtMoney(item.receivedQty * item.unitCost)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Totals — right aligned like invoice */}
                <div className="flex justify-end border-b pb-5 mb-5">
                  <div className="w-full max-w-xs space-y-2 pe-1">
                    <div className="flex justify-between items-center border-b pb-2 text-sm">
                      <p className="text-muted-foreground">Line Items</p>
                      <p className="font-semibold tabular-nums">{totals.lines}</p>
                    </div>
                    <div className="flex justify-between items-center border-b pb-2 text-sm">
                      <p className="text-muted-foreground">Units Received</p>
                      <p className="font-semibold tabular-nums text-emerald-700">{totals.received}</p>
                    </div>
                    {totals.rejected > 0 && (
                      <div className="flex justify-between items-center border-b pb-2 text-sm">
                        <p className="text-muted-foreground">Units Rejected</p>
                        <p className="font-semibold tabular-nums text-red-600">{totals.rejected}</p>
                      </div>
                    )}
                    {totals.rejectedValue > 0 && (
                      <div className="flex justify-between items-center border-b pb-2 text-sm">
                        <p className="text-muted-foreground">Rejected Value</p>
                        <p className="font-semibold tabular-nums text-red-600">{fmtMoney(totals.rejectedValue)}</p>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1">
                      <h5 className="font-bold">Total Amount</h5>
                      <h5 className="font-bold text-primary tabular-nums">{fmtMoney(totals.value)}</h5>
                    </div>
                    <p className="text-xs text-muted-foreground pt-1">
                      Amount in Words : {amountInWords(totals.value)}
                    </p>
                  </div>
                </div>

                {/* Notes + signature */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-b pb-5 mb-5">
                  <div className="space-y-4">
                    <div>
                      <h6 className="font-semibold text-sm mb-1">Terms and Conditions</h6>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Goods received are subject to inspection. Discrepancies must be reported within
                        48 hours of receipt. Rejected quantities are excluded from stock valuation.
                      </p>
                    </div>
                    <div>
                      <h6 className="font-semibold text-sm mb-1">Notes</h6>
                      <p className="text-sm text-muted-foreground">
                        {grn.notes?.trim() || "Please quote GRN number when raising supplier invoices."}
                      </p>
                    </div>
                  </div>
                  <div className="md:text-right">
                    <div className="border-t border-dashed border-border mt-8 md:mt-16 pt-3 inline-block md:float-right w-full max-w-[200px]">
                      <h6 className="text-sm font-semibold">{userName ?? "Store Manager"}</h6>
                      <p className="text-xs text-muted-foreground">Received By</p>
                    </div>
                  </div>
                </div>

                {/* Footer — centered like invoice */}
                <div className="text-center space-y-2 pt-2">
                  {receiptSettings.logoUrl ? (
                    <img
                      src={receiptSettings.logoUrl}
                      alt={receiptSettings.shopName}
                      className="h-10 w-auto mx-auto object-contain opacity-80"
                    />
                  ) : (
                    <p className="text-base font-bold text-foreground">{receiptSettings.shopName}</p>
                  )}
                  <p className="text-sm text-muted-foreground">
                    {receiptSettings.footerText || "Thank you for your supply."}
                  </p>
                  <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {receiptSettings.phone && (
                      <p>Phone : <span className="text-foreground">{receiptSettings.phone}</span></p>
                    )}
                    {receiptSettings.email && (
                      <p>Email : <span className="text-foreground">{receiptSettings.email}</span></p>
                    )}
                    {receiptSettings.website && (
                      <p>Web : <span className="text-foreground">{receiptSettings.website}</span></p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom actions — DreamsPOS print buttons */}
        {grn && (
          <div className="shrink-0 border-t bg-card/80 px-5 sm:px-6 py-4 flex flex-wrap items-center justify-center gap-2">
            <Button className="gap-2" onClick={() => void handlePrint()} disabled={printing}>
              {printing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print GRN
            </Button>
            {grn.purchase?.id && (
              <Button variant="outline" className="gap-2" asChild>
                <Link href={`/purchases/${grn.purchase.id}`}>
                  <FileText className="h-4 w-4" />
                  Open PO {grn.purchase.poNumber}
                </Link>
              </Button>
            )}
            {!grn.purchase && (grn.source === "QUICK" || grn.source === "DIRECT") && (
              <Button
                variant="outline"
                className={cn("gap-2", HEX_BTN)}
                onClick={() => {
                  onClose();
                  router.push(`/purchases/new?fromGrn=${grn.id}`);
                }}
              >
                <ClipboardPlus className="h-4 w-4" />
                Create PO from GRN
                <ArrowRight className="h-4 w-4 opacity-80" />
              </Button>
            )}
            <Button variant="secondary" onClick={onClose}>Close</Button>
          </div>
        )}
      </div>
    </div>
  );
}
