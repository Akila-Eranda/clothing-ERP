"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  X, ShoppingBag, CheckCircle2, Clock, XCircle, Package, FileText,
  Calendar, Hash, Truck, Loader2, PackageCheck, Ban, Send,
  Building2, Phone, Mail, MapPin, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import type { PurchaseOrder } from "@/components/purchases/receive-items-modal";

export interface POItem {
  id: string;
  variantId: string;
  productName: string;
  variantName: string;
  sku: string;
  orderedQty: number;
  receivedQty: number;
  rejectedQty: number;
  unitCost: number;
  discount: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  variant?: { size?: string | null; color?: string | null; images?: string[] };
}

export interface FullPurchaseOrder extends PurchaseOrder {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  paidAmount: number;
  reference?: string | null;
  paymentTerms?: string | null;
  receivedDate?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  supplier: {
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
  };
  items: POItem[];
}

const STATUS_CFG: Record<string, {
  label: string;
  variant: "softSuccess" | "softWarning" | "softDanger" | "secondary" | "softInfo";
  icon: React.ElementType;
}> = {
  DRAFT: { label: "Draft", variant: "secondary", icon: FileText },
  PENDING_APPROVAL: { label: "Pending Approval", variant: "softWarning", icon: Clock },
  CONFIRMED: { label: "Ordered", variant: "softInfo", icon: Truck },
  SENT: { label: "Ordered", variant: "softInfo", icon: Truck },
  PARTIALLY_RECEIVED: { label: "Partial", variant: "softWarning", icon: Package },
  RECEIVED: { label: "Received", variant: "softSuccess", icon: CheckCircle2 },
  CANCELLED: { label: "Cancelled", variant: "softDanger", icon: XCircle },
};

const RECEIVABLE = ["CONFIRMED", "SENT", "PARTIALLY_RECEIVED"];
const ORDERABLE = ["DRAFT"];

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(n: number) {
  return `LKR ${formatNumber(n)}`;
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

function SectionTableHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-t-xl">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="text-xs font-bold uppercase tracking-wide">{title}</span>
    </div>
  );
}

export function ViewPOModal({
  po,
  onClose,
  onReceive,
  onStatusUpdate,
  showPrintLabels,
  printLabel,
}: {
  po: PurchaseOrder | null;
  onClose: () => void;
  onReceive?: (po: FullPurchaseOrder) => void;
  onStatusUpdate?: (po: FullPurchaseOrder, status: string) => void;
  showPrintLabels?: boolean;
  printLabel?: string;
}) {
  const [detail, setDetail] = useState<FullPurchaseOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "items">("overview");

  useEffect(() => {
    if (!po) { setDetail(null); return; }
    setTab("overview");
    setLoading(true);
    api.get<FullPurchaseOrder>(`/purchases/${po.id}`)
      .then((r) => setDetail(r.data ?? (po as FullPurchaseOrder)))
      .catch(() => setDetail(po as FullPurchaseOrder))
      .finally(() => setLoading(false));
  }, [po]);

  const data = detail ?? (po as FullPurchaseOrder | null);

  const totals = useMemo(() => {
    if (!data) return { items: 0, ordered: 0, received: 0, due: 0 };
    const items = data.items?.length ?? data._count?.items ?? 0;
    const ordered = (data.items ?? []).reduce((s, i) => s + i.orderedQty, 0);
    const received = (data.items ?? []).reduce((s, i) => s + i.receivedQty, 0);
    const due = (data.total ?? 0) - (data.paidAmount ?? 0);
    return { items, ordered, received, due };
  }, [data]);

  if (!po || !data) return null;

  const cfg = STATUS_CFG[data.status] ?? STATUS_CFG.DRAFT;
  const StatusIcon = cfg.icon;
  const canReceive = RECEIVABLE.includes(data.status);
  const canOrder = ORDERABLE.includes(data.status);
  const canCancel = data.status !== "CANCELLED" && data.status !== "RECEIVED";

  const MAIN_TABS = [
    { id: "overview" as const, label: "Overview" },
    { id: "items" as const, label: `Items (${totals.items})` },
  ];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-6xl border overflow-hidden max-h-[94vh] flex flex-col">
        <div className="px-5 sm:px-6 pt-5 pb-0 border-b shrink-0 bg-card/50">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <ShoppingBag className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight">
                      Purchase Order{" "}
                      <span className="text-muted-foreground font-semibold font-mono">( {data.poNumber} )</span>
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {data.supplier?.name ?? "—"} · {fmtDate(data.orderDate)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={cfg.variant} className="h-7 rounded-full px-3 text-xs font-bold gap-1">
                    <StatusIcon className="h-3.5 w-3.5" />
                    {cfg.label}
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
          {!loading && tab === "overview" && (
            <div className="p-5 sm:p-6 space-y-5">
              <div className="grid grid-cols-1 xl:grid-cols-[1fr_240px] gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-4 rounded-xl border bg-card p-5">
                  <InfoRow icon={Calendar} label="Order date" value={fmtDate(data.orderDate)} />
                  <InfoRow icon={Truck} label="Expected date" value={fmtDate(data.expectedDate)} />
                  <InfoRow icon={Building2} label="Supplier" value={data.supplier?.name ?? "—"} />
                  <InfoRow icon={Phone} label="Supplier phone" value={data.supplier?.phone ?? "—"} />
                  <InfoRow icon={Hash} label="Reference" value={data.reference ?? "—"} />
                  <InfoRow icon={FileText} label="Payment terms" value={data.paymentTerms ?? "—"} />
                  <InfoRow icon={CheckCircle2} label="Status" value={cfg.label} />
                  <InfoRow icon={Package} label="Received date" value={fmtDate(data.receivedDate)} />
                </div>

                <div className="rounded-xl border bg-card p-4 h-fit">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Quick totals</p>
                    <span className="text-[10px] font-bold text-muted-foreground">LKR</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="font-semibold tabular-nums">{fmtMoney(data.subtotal ?? data.total)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="font-semibold tabular-nums">{fmtMoney(data.discountAmount ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="font-semibold tabular-nums">{fmtMoney(data.taxAmount ?? 0)}</span></div>
                    <div className="flex justify-between pt-2 border-t font-bold">
                      <span>Total</span>
                      <span className="tabular-nums text-primary">{fmtMoney(data.total)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-600"><span>Paid</span><span className="tabular-nums">{fmtMoney(data.paidAmount ?? 0)}</span></div>
                    <div className="flex justify-between text-red-600 font-bold"><span>Amount due</span><span className="tabular-nums">{fmtMoney(totals.due)}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
                <div className="space-y-5 min-w-0">
                  <div className="rounded-xl border overflow-hidden bg-card">
                    <SectionTableHeader icon={Package} title="Order Items" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {["#", "Product", "SKU", "Ordered", "Received", "Unit", "Total"].map((h, i) => (
                              <th key={h} className={cn("px-3 py-2.5 font-semibold", i >= 3 ? "text-right" : "text-left")}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(data.items ?? []).length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground text-sm">No items</td></tr>
                          ) : (data.items ?? []).map((item, i) => (
                            <tr key={item.id} className="hover:bg-muted/20">
                              <td className="px-3 py-3 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-3 py-3 text-xs font-medium">{item.productName}{item.variantName ? ` · ${item.variantName}` : ""}</td>
                              <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{item.sku}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums font-semibold">{item.orderedQty}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums text-emerald-600">{item.receivedQty}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums">{fmtMoney(item.unitCost)}</td>
                              <td className="px-3 py-3 text-xs text-right font-bold tabular-nums">{fmtMoney(item.total)}</td>
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
                    <p className="font-bold tabular-nums text-primary">{fmtMoney(data.total)}</p>
                  </div>
                  <div className="space-y-2 text-sm border-t pt-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Line items</span><span>{totals.items}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Qty ordered</span><span className="tabular-nums">{totals.ordered}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Qty received</span><span className="tabular-nums text-emerald-600">{totals.received}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Amount due</span><span className="tabular-nums text-red-600 font-bold">{fmtMoney(totals.due)}</span></div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm text-muted-foreground min-h-[48px]">{data.notes?.trim() || "—"}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Supplier</p>
                  <p className="text-sm font-medium flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-muted-foreground" />{data.supplier?.name}</p>
                  {data.supplier?.phone && <p className="text-sm flex items-center gap-2 mt-1"><Phone className="h-3.5 w-3.5 text-muted-foreground" />{data.supplier.phone}</p>}
                  {data.supplier?.email && <p className="text-sm flex items-center gap-2 mt-1"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{data.supplier.email}</p>}
                  {data.supplier?.address && <p className="text-sm flex items-center gap-2 mt-1"><MapPin className="h-3.5 w-3.5 text-muted-foreground" />{data.supplier.address}{data.supplier.city ? `, ${data.supplier.city}` : ""}</p>}
                </div>
              </div>
            </div>
          )}

          {!loading && tab === "items" && (
            <div className="p-5 sm:p-6">
              <div className="rounded-xl border overflow-hidden bg-card">
                <SectionTableHeader icon={Package} title="All Order Items" />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[700px]">
                    <thead>
                      <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {["#", "Product", "SKU", "Variant", "Ordered", "Received", "Rejected", "Unit Cost", "Discount", "Tax", "Amount"].map((h, i) => (
                          <th key={h} className={cn("px-3 py-2.5 font-semibold whitespace-nowrap", i >= 4 ? "text-right" : "text-left")}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(data.items ?? []).map((item, i) => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="px-3 py-3 text-xs text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-3 text-xs font-medium">{item.productName}</td>
                          <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{item.sku}</td>
                          <td className="px-3 py-3 text-xs">{item.variantName || "—"}</td>
                          <td className="px-3 py-3 text-xs text-right tabular-nums font-semibold">{item.orderedQty}</td>
                          <td className="px-3 py-3 text-xs text-right tabular-nums text-emerald-600">{item.receivedQty}</td>
                          <td className="px-3 py-3 text-xs text-right tabular-nums">{item.rejectedQty || "—"}</td>
                          <td className="px-3 py-3 text-xs text-right tabular-nums">{fmtMoney(item.unitCost)}</td>
                          <td className="px-3 py-3 text-xs text-right tabular-nums">{fmtMoney(item.discount ?? 0)}</td>
                          <td className="px-3 py-3 text-xs text-right tabular-nums">{fmtMoney(item.taxAmount ?? 0)}</td>
                          <td className="px-3 py-3 text-xs text-right font-bold tabular-nums">{fmtMoney(item.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-card/80 px-5 sm:px-6 py-4 flex flex-wrap items-center justify-end gap-2">
          {canReceive && onReceive && (
            <Button className="gap-1.5" onClick={() => { onReceive(data); onClose(); }}>
              <PackageCheck className="h-3.5 w-3.5" /> Receive Items
            </Button>
          )}
          <Button variant="outline" className="gap-1.5" asChild>
            <Link href={`/purchases/${data.id}/grn`}>
              <Package className="h-3.5 w-3.5" /> GRN History
            </Link>
          </Button>
          {showPrintLabels && (
            <Button variant="outline" className="gap-1.5" asChild>
              <Link href={`/purchases/${data.id}/print-tags`}>
                <Tag className="h-3.5 w-3.5" /> {printLabel ?? "Print Labels"}
              </Link>
            </Button>
          )}
          <Button variant="outline" className="gap-1.5" asChild>
            <Link href={`/purchases/${data.id}`}>
              <FileText className="h-3.5 w-3.5" /> Full Page
            </Link>
          </Button>
          {canOrder && onStatusUpdate && (
            <Button
              variant="outline"
              className="gap-1.5 text-blue-700 border-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-500/10"
              onClick={() => { onStatusUpdate(data, "CONFIRMED"); onClose(); }}
            >
              <Send className="h-3.5 w-3.5" /> Mark as Ordered
            </Button>
          )}
          {canCancel && onStatusUpdate && (
            <Button
              variant="outline"
              className="gap-1.5 text-red-700 border-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-500/10"
              onClick={() => { onStatusUpdate(data, "CANCELLED"); onClose(); }}
            >
              <Ban className="h-3.5 w-3.5" /> Cancel PO
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
