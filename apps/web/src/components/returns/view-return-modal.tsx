"use client";

import { useState, useEffect, useMemo } from "react";
import {
  X, CheckCircle, Clock, XCircle, Package, RotateCcw, DollarSign,
  ArrowLeftRight, Printer, Calendar, Hash, FileText, User, Receipt,
  ShoppingBag, Loader2, Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";

type ReasonOption = { value: string; label: string };

export interface ExchangeItem {
  variantId: string;
  quantity: number;
  unitPrice: number;
  productName?: string;
  variantName?: string;
  sku?: string;
}

export interface ReturnRecord {
  id: string;
  returnNumber: string;
  reason: string;
  status: string;
  returnType: string;
  notes?: string;
  totalAmount: number;
  refundAmount: number;
  exchangeAmount: number;
  exchangeData?: ExchangeItem[] | null;
  restockItems: boolean;
  createdAt: string;
  originalSale?: {
    invoiceNumber: string;
    total?: number;
    customer?: { firstName: string; lastName?: string | null } | null;
  } | null;
  items?: {
    id: string;
    variantId: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    variant?: { sku: string; product?: { name: string } | null } | null;
  }[];
}

const STATUS_CFG: Record<string, { label: string; variant: "softSuccess" | "softWarning" | "softDanger" | "secondary" | "softInfo"; icon: React.ElementType }> = {
  INITIATED: { label: "Initiated", variant: "softWarning", icon: Clock },
  APPROVED: { label: "Approved", variant: "softSuccess", icon: CheckCircle },
  REJECTED: { label: "Rejected", variant: "softDanger", icon: XCircle },
  COMPLETED: { label: "Completed", variant: "softInfo", icon: CheckCircle },
  REFUND_PROCESSED: { label: "Refund Processed", variant: "softSuccess", icon: DollarSign },
};

function reasonLabel(value: string, reasons: ReasonOption[]) {
  return reasons.find((r) => r.value === value)?.label ?? value;
}

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

export function printReturnBill(record: ReturnRecord, reasons: ReasonOption[]) {
  const isExchange = record.returnType === "EXCHANGE";
  const fmt = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = new Date(record.createdAt);
  const dateStr = date.toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
  const reason = reasonLabel(record.reason, reasons);

  const pad = (left: string, right: string, width = 32) => {
    const gap = Math.max(1, width - left.length - right.length);
    return left + " ".repeat(gap) + right;
  };

  const returnItemRows = (record.items ?? []).map((item) => {
    const name = item.variant?.product?.name ?? "Unknown Item";
    const sku = item.variant?.sku ?? "—";
    const qty = item.quantity;
    const total = fmt(item.totalAmount);
    return `<div class="item-name">${name}</div>
            <div class="item-detail">${pad(`  ${sku}  x${qty}`, `LKR ${total}`)}</div>`;
  }).join('<div class="gap"></div>');

  const exchangeItemRows = (record.exchangeData ?? []).map((item) => {
    const name = item.productName ?? "Unknown Item";
    const sku = item.sku ?? "—";
    const qty = item.quantity;
    const total = fmt(item.unitPrice * item.quantity);
    return `<div class="item-name exch">${name}</div>
            <div class="item-detail">${pad(`  ${sku}  x${qty}`, `LKR ${total}`)}</div>`;
  }).join('<div class="gap"></div>');

  const balanceLabel = isExchange
    ? record.refundAmount > 0
      ? "REFUND TO CUSTOMER"
      : record.exchangeAmount > record.totalAmount
        ? "BALANCE DUE"
        : "NO BALANCE DUE"
    : "TOTAL REFUND";
  const balanceValue = isExchange
    ? record.refundAmount > 0
      ? `LKR ${fmt(record.refundAmount)}`
      : record.exchangeAmount > record.totalAmount
        ? `LKR ${fmt(record.exchangeAmount - record.totalAmount)}`
        : "LKR 0.00"
    : `LKR ${fmt(record.refundAmount)}`;

  const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<title>${isExchange ? "EXC" : "RET"}-${record.returnNumber}</title>
<style>
  @page { size: 80mm auto; margin: 3mm 2mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Courier New', Courier, monospace; font-size: 10.5px; line-height: 1.4; width: 72mm; max-width: 72mm; color: #000; background: #fff; }
  .center { text-align: center; }
  .bold { font-weight: bold; }
  .dash { border-top: 1px dashed #000; margin: 3px 0; }
  .solid { border-top: 1.5px solid #000; margin: 3px 0; }
  .dbl { border-top: 3px double #000; margin: 4px 0; }
  .section { font-weight: bold; margin: 4px 0 2px; font-size: 10px; }
  .item-name { font-size: 10.5px; word-break: break-word; font-weight: bold; margin-top: 3px; }
  .item-detail { font-size: 10px; white-space: pre; }
  .meta-row { display: flex; justify-content: space-between; font-size: 10px; line-height: 1.5; }
  .total-row { display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; padding: 2px 0; }
  .grand-row { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; padding: 3px 0; }
  .print-btn { display: block; margin: 10px auto; padding: 7px 20px; background: #111; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; }
  @media print { .print-btn { display: none !important; } }
</style></head><body>
<div class="center bold" style="font-size:15px;letter-spacing:3px;">HEXALYTE</div>
<div class="dbl"></div>
<div class="center bold" style="font-size:12px;">${isExchange ? "** EXCHANGE BILL **" : "** RETURN RECEIPT **"}</div>
<div class="dbl"></div>
<div class="meta-row"><span>${isExchange ? "Exchange No" : "Return No"}</span><span>${record.returnNumber}</span></div>
<div class="meta-row"><span>Invoice</span><span>${record.originalSale?.invoiceNumber ?? "—"}</span></div>
<div class="meta-row"><span>Date</span><span>${dateStr}</span></div>
<div class="meta-row"><span>Time</span><span>${timeStr}</span></div>
<div class="meta-row"><span>Reason</span><span>${reason}</span></div>
<div class="meta-row"><span>Status</span><span>${record.status}</span></div>
<div class="dash"></div>
<div class="section">ITEMS RETURNED</div>
<div class="dash"></div>
${returnItemRows || '<div>No items</div>'}
<div class="dash"></div>
<div class="total-row"><span>Return Value</span><span>LKR ${fmt(record.totalAmount)}</span></div>
${isExchange ? `
<div class="dash"></div>
<div class="section">ITEMS GIVEN</div>
<div class="dash"></div>
${exchangeItemRows || '<div>No exchange items</div>'}
<div class="dash"></div>
<div class="total-row"><span>Exchange Value</span><span>LKR ${fmt(record.exchangeAmount)}</span></div>
` : ""}
<div class="solid"></div>
<div class="grand-row"><span>${balanceLabel}</span><span>${balanceValue}</span></div>
<button class="print-btn" onclick="window.print()">Print</button>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { toast.error("Please allow popups to print the receipt."); return; }
  win.document.write(html);
  win.document.close();
  setTimeout(() => { try { win.print(); } catch { /* ignore */ } }, 400);
}

export function ViewReturnModal({
  record,
  onClose,
  reasons,
  onStatusUpdate,
}: {
  record: ReturnRecord | null;
  onClose: () => void;
  reasons: ReasonOption[];
  onStatusUpdate?: (id: string, status: string, label: string) => void;
}) {
  const [detail, setDetail] = useState<ReturnRecord | null>(record);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"overview" | "exchange">("overview");

  useEffect(() => {
    if (!record) { setDetail(null); return; }
    setTab("overview");
    setLoading(true);
    api.get<ReturnRecord>(`/returns/${record.id}`)
      .then((r) => setDetail(r.data ?? record))
      .catch(() => setDetail(record))
      .finally(() => setLoading(false));
  }, [record]);

  const data = detail ?? record;
  const isExchange = data?.returnType === "EXCHANGE";

  const amounts = useMemo(() => {
    if (!data) return { excDue: 0, netRef: 0, balLabel: "", balAmount: 0, balColor: "" };
    const excDue = isExchange ? Math.max(0, (data.exchangeAmount ?? 0) - data.totalAmount) : 0;
    const netRef = isExchange ? Math.max(0, data.totalAmount - (data.exchangeAmount ?? 0)) : data.refundAmount;
    const balLabel = isExchange
      ? excDue > 0 ? "Collect from Customer" : netRef > 0 ? "Refund to Customer" : "Even Exchange"
      : "Refund to Customer";
    const balAmount = isExchange ? (excDue > 0 ? excDue : netRef) : data.refundAmount;
    const balColor = isExchange && excDue > 0 ? "text-amber-600" : "text-emerald-600";
    return { excDue, netRef, balLabel, balAmount, balColor };
  }, [data, isExchange]);

  if (!record || !data) return null;

  const cfg = STATUS_CFG[data.status] ?? STATUS_CFG.INITIATED;
  const StatusIcon = cfg.icon;
  const customerName = data.originalSale?.customer
    ? `${data.originalSale.customer.firstName} ${data.originalSale.customer.lastName ?? ""}`.trim()
    : "Walk-in customer";

  const MAIN_TABS = [
    { id: "overview" as const, label: "Overview" },
    ...(isExchange ? [{ id: "exchange" as const, label: `Exchange Items (${(data.exchangeData ?? []).length})` }] : []),
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
                  <div className={cn(
                    "h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                    isExchange ? "bg-violet-500/10" : "bg-primary/10",
                  )}>
                    {isExchange
                      ? <ArrowLeftRight className="h-5 w-5 text-violet-600" />
                      : <RotateCcw className="h-5 w-5 text-primary" />}
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold leading-tight">
                      {isExchange ? "Exchange" : "Return"} Details{" "}
                      <span className="text-muted-foreground font-semibold font-mono">( {data.returnNumber} )</span>
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Invoice {data.originalSale?.invoiceNumber ?? "—"} · {customerName}
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
                  <InfoRow icon={Calendar} label="Date" value={fmtDate(data.createdAt)} />
                  <InfoRow icon={User} label="Customer" value={customerName} />
                  <InfoRow icon={Receipt} label="Original invoice" value={<span className="font-mono text-xs">{data.originalSale?.invoiceNumber ?? "—"}</span>} />
                  <InfoRow icon={Tag} label="Type" value={isExchange ? "Exchange" : "Return & Refund"} valueClass={isExchange ? "text-violet-600" : undefined} />
                  <InfoRow icon={FileText} label="Reason" value={reasonLabel(data.reason, reasons)} />
                  <InfoRow icon={CheckCircle} label="Status" value={cfg.label} />
                  <InfoRow icon={Hash} label="Request ID" value={<span className="font-mono text-xs">{data.id.slice(0, 10)}</span>} />
                  <InfoRow
                    icon={Package}
                    label="Restock"
                    value={data.restockItems ? "Items restocked on approval" : "Items not restocked"}
                    valueClass={data.restockItems ? "text-emerald-600" : "text-muted-foreground"}
                  />
                </div>

                <div className="rounded-xl border bg-card p-4 h-fit">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">Quick totals</p>
                    <span className="text-[10px] font-bold text-muted-foreground">LKR</span>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">Return value</span><span className="font-semibold tabular-nums">{fmtMoney(data.totalAmount)}</span></div>
                    {isExchange && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Exchange value</span><span className="font-semibold tabular-nums text-violet-600">{fmtMoney(data.exchangeAmount ?? 0)}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">Items returned</span><span className="font-semibold tabular-nums">{data.items?.length ?? 0}</span></div>
                    {isExchange && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Items given</span><span className="font-semibold tabular-nums">{(data.exchangeData ?? []).length}</span></div>
                    )}
                    <div className="flex justify-between pt-2 border-t font-bold">
                      <span>{amounts.balLabel}</span>
                      <span className={cn("tabular-nums", amounts.balColor)}>{fmtMoney(amounts.balAmount)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
                <div className="space-y-5 min-w-0">
                  <div className="rounded-xl border overflow-hidden bg-card">
                    <SectionTableHeader icon={RotateCcw} title="Returned Items" />
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {["#", "Product", "SKU", "Qty", "Unit", "Total"].map((h, i) => (
                              <th key={h} className={cn("px-3 py-2.5 font-semibold", i >= 3 ? "text-right" : "text-left")}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(data.items ?? []).length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No items recorded</td></tr>
                          ) : (data.items ?? []).map((item, i) => (
                            <tr key={item.id ?? i} className="hover:bg-muted/20">
                              <td className="px-3 py-3 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-3 py-3 text-xs font-medium">{item.variant?.product?.name ?? "—"}</td>
                              <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{item.variant?.sku ?? "—"}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums">{item.quantity}</td>
                              <td className="px-3 py-3 text-xs text-right tabular-nums">{fmtMoney(item.unitPrice)}</td>
                              <td className="px-3 py-3 text-xs text-right font-bold tabular-nums">{fmtMoney(item.totalAmount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {isExchange && (
                    <div className="rounded-xl border overflow-hidden bg-card">
                      <SectionTableHeader icon={ArrowLeftRight} title="Exchange Items Given" />
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                              {["#", "Product", "SKU", "Qty", "Unit", "Total"].map((h, i) => (
                                <th key={h} className={cn("px-3 py-2.5 font-semibold", i >= 3 ? "text-right" : "text-left")}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {(data.exchangeData ?? []).length === 0 ? (
                              <tr><td colSpan={6} className="px-4 py-10 text-center text-muted-foreground text-sm">No exchange items</td></tr>
                            ) : (data.exchangeData ?? []).map((item, i) => (
                              <tr key={i} className="hover:bg-muted/20 bg-violet-500/[0.03]">
                                <td className="px-3 py-3 text-muted-foreground text-xs">{i + 1}</td>
                                <td className="px-3 py-3 text-xs font-medium">{item.productName ?? "—"}</td>
                                <td className="px-3 py-3 text-xs font-mono text-muted-foreground">{item.sku ?? "—"}</td>
                                <td className="px-3 py-3 text-xs text-right tabular-nums">{item.quantity}</td>
                                <td className="px-3 py-3 text-xs text-right tabular-nums">{fmtMoney(item.unitPrice)}</td>
                                <td className="px-3 py-3 text-xs text-right font-bold tabular-nums text-violet-700">{fmtMoney(item.unitPrice * item.quantity)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border bg-card p-4 h-fit space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Summary</p>
                    <p className={cn("font-bold tabular-nums", amounts.balColor)}>{fmtMoney(amounts.balAmount)}</p>
                  </div>
                  <div className="space-y-2 text-sm border-t pt-3">
                    <div className="flex justify-between"><span className="text-muted-foreground">Return value</span><span className="tabular-nums">{fmtMoney(data.totalAmount)}</span></div>
                    {isExchange && (
                      <div className="flex justify-between"><span className="text-muted-foreground">Exchange value</span><span className="tabular-nums text-violet-600">{fmtMoney(data.exchangeAmount ?? 0)}</span></div>
                    )}
                    <div className="flex justify-between"><span className="text-muted-foreground">Invoice total</span><span className="tabular-nums">{fmtMoney(data.originalSale?.total ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Items returned</span><span>{data.items?.length ?? 0}</span></div>
                  </div>
                  <p className={cn("text-sm font-bold border-t pt-3", amounts.balColor)}>
                    {amounts.balLabel}: {fmtMoney(amounts.balAmount)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Notes</p>
                  <p className="text-sm text-muted-foreground min-h-[48px]">{data.notes?.trim() || "—"}</p>
                </div>
                <div className="rounded-xl border bg-card p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Reference</p>
                  <p className="text-sm flex items-center gap-2"><ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />{data.originalSale?.invoiceNumber ?? "—"}</p>
                  <p className="text-sm flex items-center gap-2 mt-1"><User className="h-3.5 w-3.5 text-muted-foreground" />{customerName}</p>
                </div>
              </div>
            </div>
          )}

          {!loading && tab === "exchange" && isExchange && (
            <div className="p-5 sm:p-6">
              <div className="rounded-xl border overflow-hidden bg-card">
                <SectionTableHeader icon={ArrowLeftRight} title="Exchange Items Given to Customer" />
                <div className="divide-y">
                  {(data.exchangeData ?? []).length === 0 ? (
                    <p className="text-center text-muted-foreground py-12 text-sm">No exchange items</p>
                  ) : (data.exchangeData ?? []).map((item, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <p className="font-medium">{item.productName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground font-mono">{item.sku ?? "—"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Qty {item.quantity}</p>
                        <p className="font-bold text-violet-700 tabular-nums">{fmtMoney(item.unitPrice * item.quantity)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t bg-card/80 px-5 sm:px-6 py-4 flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            className="gap-1.5"
            onClick={() => printReturnBill(data, reasons)}
          >
            <Printer className="h-3.5 w-3.5" />
            {isExchange ? "Print Exchange Bill" : "Print Receipt"}
          </Button>
          {data.status === "INITIATED" && onStatusUpdate && (
            <>
              <Button
                variant="outline"
                className="gap-1.5 text-emerald-700 border-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10"
                onClick={() => { onStatusUpdate(data.id, "APPROVED", "Approved"); onClose(); }}
              >
                <CheckCircle className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 text-red-700 border-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-500/10"
                onClick={() => { onStatusUpdate(data.id, "REJECTED", "Rejected"); onClose(); }}
              >
                <XCircle className="h-3.5 w-3.5" /> Reject
              </Button>
            </>
          )}
          {data.status === "APPROVED" && onStatusUpdate && (
            <Button
              variant="default"
              className="gap-1.5"
              onClick={() => {
                const next = isExchange ? "COMPLETED" : "REFUND_PROCESSED";
                const label = isExchange ? "Completed" : "Refund Processed";
                onStatusUpdate(data.id, next, label);
                onClose();
              }}
            >
              <DollarSign className="h-3.5 w-3.5" />
              {isExchange ? "Mark Completed" : "Process Refund"}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
