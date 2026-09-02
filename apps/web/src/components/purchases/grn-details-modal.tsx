"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Building2, Calendar, ClipboardPlus, FileText, Hash,
  Loader2, PackageCheck, Phone, Printer, ShoppingBag, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { printGrnReceipt } from "@/lib/grn-receipt-print";
import { useAuthStore } from "@/stores/auth-store";
import { HEX_BTN } from "@/lib/app-button-classes";

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

function InfoRow({ icon: Icon, label, value, valueClass }: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" strokeWidth={1.75} />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className={cn("text-sm font-medium break-words", valueClass)}>{value}</p>
      </div>
    </div>
  );
}

function SectionTableHeader({ icon: Icon, title, badge }: {
  icon: React.ElementType;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-t-xl">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
      </div>
      {badge}
    </div>
  );
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
  const [tab, setTab] = useState<"overview" | "items">("overview");
  const { settings: receiptSettings } = useReceiptSettings();
  const userName = useAuthStore((s) => s.user?.name);

  useEffect(() => {
    if (!grnId) {
      setGrn(null);
      return;
    }
    setTab("overview");
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
    if (!grn) return { lines: 0, received: 0, rejected: 0, value: 0 };
    return {
      lines: grn.items.length,
      received: grn.items.reduce((s, i) => s + i.receivedQty, 0),
      rejected: grn.items.reduce((s, i) => s + (i.rejectedQty || 0), 0),
      value: grn.items.reduce((s, i) => s + i.receivedQty * i.unitCost, 0),
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

  const MAIN_TABS = [
    { id: "overview" as const, label: "Overview" },
    { id: "items" as const, label: `Items (${totals.lines})` },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-6xl border overflow-hidden max-h-[94vh] flex flex-col">
        <div className="px-5 sm:px-6 pt-5 pb-0 border-b shrink-0 bg-card/50">
          {loading || !grn ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
                    <PackageCheck className="h-5 w-5 text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight">
                      GRN Details{" "}
                      <span className="text-muted-foreground font-semibold font-mono">( {grn.grnNumber} )</span>
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {grn.supplier.name} · {fmtDate(grn.receivedAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="h-7 rounded-full px-3 text-xs font-bold">
                    {sourceLabel(grn.source)}
                  </Badge>
                  <Badge
                    variant={grn.status === "POSTED" ? "softSuccess" : "secondary"}
                    className="h-7 rounded-full px-3 text-xs font-bold"
                  >
                    {grn.status}
                  </Badge>
                  <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mt-4 pb-3">
                {MAIN_TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-semibold transition-colors",
                      tab === t.id
                        ? "bg-primary/10 text-primary border border-primary/20"
                        : "text-muted-foreground hover:bg-muted",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {!loading && grn && tab === "overview" && (
            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 rounded-xl border bg-card p-5">
                  <InfoRow icon={Calendar} label="Received" value={fmtDate(grn.receivedAt)} />
                  <InfoRow icon={Building2} label="Supplier" value={grn.supplier.name} />
                  <InfoRow icon={Phone} label="Contact" value={[grn.supplier.contactPerson, grn.supplier.phone].filter(Boolean).join(" · ") || "—"} />
                  <InfoRow
                    icon={ShoppingBag}
                    label="Purchase order"
                    value={grn.purchase?.poNumber
                      ? <span className="font-mono text-xs">{grn.purchase.poNumber}</span>
                      : "—"}
                  />
                  <InfoRow icon={Hash} label="Invoice ref" value={grn.supplierInvoiceRef || "—"} />
                  <InfoRow icon={FileText} label="Source" value={sourceLabel(grn.source)} />
                  <InfoRow icon={Hash} label="GRN ID" value={<span className="font-mono text-xs">{grn.id.slice(0, 10)}</span>} />
                  <InfoRow icon={PackageCheck} label="Status" value={grn.status} valueClass={grn.status === "POSTED" ? "text-emerald-600" : undefined} />
                </div>

                <div className="rounded-xl border bg-card p-4 h-fit">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Quick totals</p>
                    <span className="text-[10px] font-bold text-muted-foreground">LKR</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Lines</span><span className="font-semibold tabular-nums">{totals.lines}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Received qty</span><span className="font-semibold tabular-nums text-emerald-600">{totals.received}</span></div>
                    {totals.rejected > 0 && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Rejected qty</span><span className="font-semibold tabular-nums text-red-600">{totals.rejected}</span></div>
                    )}
                    <div className="flex justify-between pt-2 border-t font-bold">
                      <span>Total value</span>
                      <span className="tabular-nums text-emerald-700">{fmtMoney(totals.value)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
                <div className="space-y-5 min-w-0">
                  <div className="rounded-xl border overflow-hidden bg-card">
                    <SectionTableHeader
                      icon={PackageCheck}
                      title="Received Items"
                      badge={totals.rejected > 0 ? (
                        <span className="text-[10px] font-bold bg-white/20 px-2 py-0.5 rounded-full">
                          Rejected: {totals.rejected}
                        </span>
                      ) : undefined}
                    />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[640px]">
                        <thead>
                          <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {["#", "Product", "Ordered", "Received", "Rejected", "Unit", "Total"].map((h, i) => (
                              <th key={h} className={cn("px-3 py-2.5 font-semibold", i >= 2 ? "text-right" : "text-left")}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {grn.items.map((item, i) => (
                            <tr key={item.id} className="hover:bg-muted/20">
                              <td className="px-3 py-3 text-xs text-muted-foreground">{i + 1}</td>
                              <td className="px-3 py-3">
                                <p className="text-xs font-medium">{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</p>
                                <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>
                                {(item.batchNumber || item.expiryDate) && (
                                  <p className="text-[10px] text-muted-foreground mt-0.5">
                                    {item.batchNumber ? `Batch ${item.batchNumber}` : ""}
                                    {item.batchNumber && item.expiryDate ? " · " : ""}
                                    {item.expiryDate ? `Exp ${fmtDay(item.expiryDate)}` : ""}
                                  </p>
                                )}
                              </td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums text-muted-foreground">{item.orderedQty || "—"}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums font-semibold text-emerald-700">{item.receivedQty}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums">{item.rejectedQty || "—"}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums">{fmtMoney(item.unitCost)}</td>
                              <td className="px-3 py-3 text-xs text-right font-bold tabular-nums">{fmtMoney(item.receivedQty * item.unitCost)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border bg-card p-4 h-fit space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Summary</p>
                    <p className="font-bold tabular-nums text-emerald-700">{fmtMoney(totals.value)}</p>
                  </div>
                  <div className="space-y-2 text-sm border-t pt-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="text-right truncate max-w-[140px]">{grn.supplier.name}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">PO</span><span className="font-mono text-xs">{grn.purchase?.poNumber ?? "—"}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Lines</span><span>{totals.lines}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Received</span><span className="text-emerald-600">{totals.received}</span></div>
                  </div>
                  <Link
                    href={`/suppliers/${grn.supplier.id}`}
                    className="text-xs text-primary font-semibold hover:underline inline-block border-t pt-3"
                  >
                    View supplier profile
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm text-muted-foreground min-h-[48px]">{grn.notes?.trim() || "—"}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Reference</p>
                  <p className="text-sm flex items-center gap-2"><ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />{grn.purchase?.poNumber ?? "No linked PO"}</p>
                  <p className="text-sm flex items-center gap-2 mt-1"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{grn.supplier.name}</p>
                  {!grn.purchase && (grn.source === "QUICK" || grn.source === "DIRECT") && (
                    <p className="text-xs text-muted-foreground mt-2">
                      Create a purchase order from this GRN for records and supplier invoices.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {!loading && grn && tab === "items" && (
            <div className="p-5 sm:p-6">
              <div className="rounded-xl border overflow-hidden bg-card">
                <SectionTableHeader icon={PackageCheck} title="All Received Items" />
                <div className="divide-y">
                  {grn.items.map((item, i) => (
                    <div key={item.id} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-muted/20">
                      <div className="min-w-0">
                        <p className="font-medium">{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.sku}</p>
                        {(item.batchNumber || item.expiryDate) && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {item.batchNumber ? `Batch ${item.batchNumber}` : ""}
                            {item.batchNumber && item.expiryDate ? " · " : ""}
                            {item.expiryDate ? `Exp ${fmtDay(item.expiryDate)}` : ""}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p className="text-xs text-muted-foreground">Rcvd {item.receivedQty}{item.rejectedQty ? ` · Rej ${item.rejectedQty}` : ""}</p>
                        <p className="font-bold tabular-nums text-emerald-700">{fmtMoney(item.receivedQty * item.unitCost)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-card/80 px-5 sm:px-6 py-4 flex flex-wrap items-center justify-end gap-2">
          {grn?.purchase?.id && (
            <Button variant="outline" className="gap-1.5" asChild>
              <Link href={`/purchases/${grn.purchase.id}`}>
                <FileText className="h-3.5 w-3.5" />
                Open PO {grn.purchase.poNumber}
              </Link>
            </Button>
          )}
          {grn && (
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() => void handlePrint()}
              disabled={printing}
            >
              {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              Thermal Print
            </Button>
          )}
          {grn && !grn.purchase && (grn.source === "QUICK" || grn.source === "DIRECT") && (
            <Button
              className={`gap-1.5 ${HEX_BTN}`}
              onClick={() => {
                onClose();
                router.push(`/purchases/new?fromGrn=${grn.id}`);
              }}
            >
              <ClipboardPlus className="h-3.5 w-3.5" />
              Create PO from GRN
              <ArrowRight className="h-3.5 w-3.5 opacity-80" />
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
