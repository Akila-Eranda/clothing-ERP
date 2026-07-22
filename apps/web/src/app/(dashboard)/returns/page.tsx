"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, CheckCircle, Clock, XCircle, Package, RefreshCw, X, Loader2,
  Search, RotateCcw, DollarSign, ArrowLeftRight, ChevronRight, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { modalFooterButtonClass } from "@/components/ui/modal-footer";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber, cn } from "@/lib/utils";
import { useShopProfile } from "@/lib/use-shop-profile";
import { getReturnReasons } from "@/lib/shop-vertical";
import { ModuleGate } from "@/components/shop/module-gate";
type ReasonOption = { value: string; label: string };

function buildReasons(type: string | null | undefined): ReasonOption[] {
  return getReturnReasons(type).map((r) => ({ value: r.v, label: r.l }));
}

function reasonLabel(value: string, reasons: ReasonOption[]) {
  return reasons.find((r) => r.value === value)?.label ?? value;
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ExchangeItem { variantId: string; quantity: number; unitPrice: number; productName?: string; variantName?: string; sku?: string; }
interface ReturnRecord {
  id: string; returnNumber: string; reason: string; status: string;
  returnType: string; notes?: string;
  totalAmount: number; refundAmount: number; exchangeAmount: number;
  exchangeData?: ExchangeItem[] | null;
  restockItems: boolean; createdAt: string;
  originalSale?: { invoiceNumber: string } | null;
  items?: { id: string; variantId: string; quantity: number; unitPrice: number; totalAmount: number;
    variant?: { sku: string; product?: { name: string } | null } | null }[];
}
interface SaleLookup {
  id: string; invoiceNumber: string; total: number;
  customer?: { firstName: string; lastName?: string } | null;
  items: { id: string; variantId: string; productName: string; variantName: string; sku: string; quantity: number; unitPrice: number }[];
}
interface VariantLookup {
  id: string; sku: string; price: number;
  product: { name: string };
  size?: string | null; color?: string | null;
}

const STATUS_CFG: Record<string, { label: string; variant: string; icon: React.ElementType }> = {
  INITIATED:        { label: "Initiated",        variant: "warning", icon: Clock },
  APPROVED:         { label: "Approved",         variant: "success", icon: CheckCircle },
  REJECTED:         { label: "Rejected",         variant: "danger",  icon: XCircle },
  COMPLETED:        { label: "Completed",        variant: "default", icon: CheckCircle },
  REFUND_PROCESSED: { label: "Refund Processed", variant: "success", icon: DollarSign },
};

// ── Thermal bill printer (80mm) ──────────────────────────────────────────────
function printBill(record: ReturnRecord, reasons: ReasonOption[]) {
  const isExchange = record.returnType === "EXCHANGE";
  const fmt  = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = new Date(record.createdAt);
  const dateStr = date.toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
  const reason  = reasonLabel(record.reason, reasons);

  // Pad text to fill thermal width (32 chars usable at 10px Courier on 80mm)
  const pad = (left: string, right: string, width = 32) => {
    const gap = Math.max(1, width - left.length - right.length);
    return left + " ".repeat(gap) + right;
  };

  const returnItemRows = (record.items ?? []).map((item) => {
    const name = item.variant?.product?.name ?? "Unknown Item";
    const sku  = item.variant?.sku ?? "—";
    const qty  = item.quantity;
    const total = fmt(item.totalAmount);
    return `<div class="item-name">${name}</div>
            <div class="item-detail">${pad(`  ${sku}  x${qty}`, `LKR ${total}`)}</div>`;
  }).join('<div class="gap"></div>');

  const exchangeItemRows = (record.exchangeData ?? []).map((item) => {
    const name  = item.productName ?? "Unknown Item";
    const sku   = item.sku ?? "—";
    const qty   = item.quantity;
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
  body {
    font-family: 'Courier New', Courier, monospace;
    font-size: 10.5px;
    line-height: 1.4;
    width: 72mm;
    max-width: 72mm;
    color: #000;
    background: #fff;
  }
  .center { text-align: center; }
  .right  { text-align: right; }
  .bold   { font-weight: bold; }
  .pre    { white-space: pre; font-family: inherit; font-size: inherit; }
  .dash   { border-top: 1px dashed #000; margin: 3px 0; }
  .solid  { border-top: 1.5px solid #000; margin: 3px 0; }
  .dbl    { border-top: 3px double #000; margin: 4px 0; }
  .section { font-weight: bold; margin: 4px 0 2px; font-size: 10px; letter-spacing: 0.5px; }
  .exch-section { font-weight: bold; margin: 4px 0 2px; font-size: 10px; }
  .item-name   { font-size: 10.5px; word-break: break-word; font-weight: bold; margin-top: 3px; }
  .item-detail { font-size: 10px; white-space: pre; }
  .exch { font-style: italic; }
  .gap  { height: 1px; }
  .meta-row { display: flex; justify-content: space-between; font-size: 10px; line-height: 1.5; }
  .meta-label { font-weight: bold; }
  .total-row { display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; padding: 2px 0; }
  .grand-row  { display: flex; justify-content: space-between; font-size: 12px; font-weight: bold; padding: 3px 0; }
  .sig-table  { width: 100%; margin-top: 14px; }
  .sig-table td { width: 50%; text-align: center; font-size: 9px; padding-top: 20px; border-top: 1px solid #000; }
  .print-btn { display: block; margin: 10px auto; padding: 7px 20px; background: #111; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-family: sans-serif; }
  @media print { .print-btn { display: none !important; } }
</style></head><body>

<div class="center bold" style="font-size:15px;letter-spacing:3px;">HEXALYTE</div>
<div class="center" style="font-size:9px;letter-spacing:4px;">INNOVATION</div>
<div class="center" style="font-size:9px;margin-top:2px;">No. 45, Textile Road, Colombo 11</div>
<div class="center" style="font-size:9px;">Tel: 077 123 4567</div>
<div class="dbl"></div>
<div class="center bold" style="font-size:12px;letter-spacing:2px;">${isExchange ? "** EXCHANGE BILL **" : "** RETURN RECEIPT **"}</div>
<div class="dbl"></div>

<div class="meta-row"><span class="meta-label">${isExchange ? "Exchange No" : "Return No"}</span><span>${record.returnNumber}</span></div>
<div class="meta-row"><span class="meta-label">Invoice</span><span>${record.originalSale?.invoiceNumber ?? "—"}</span></div>
<div class="meta-row"><span class="meta-label">Date</span><span>${dateStr}</span></div>
<div class="meta-row"><span class="meta-label">Time</span><span>${timeStr}</span></div>
<div class="meta-row"><span class="meta-label">Reason</span><span>${reason}</span></div>
<div class="meta-row"><span class="meta-label">Status</span><span>${record.status}</span></div>
${record.notes ? `<div class="meta-row"><span class="meta-label">Notes</span><span style="max-width:55%;text-align:right;font-size:9px;">${record.notes}</span></div>` : ""}

<div class="dash"></div>
<div class="section">ITEMS RETURNED BY CUSTOMER</div>
<div class="dash"></div>
${returnItemRows || '<div style="font-size:10px;font-style:italic;">No items recorded</div>'}
<div class="dash"></div>
<div class="total-row"><span>Return Value</span><span>LKR ${fmt(record.totalAmount)}</span></div>

${isExchange ? `
<div class="dash"></div>
<div class="exch-section">&#9654; ITEMS GIVEN TO CUSTOMER</div>
<div class="dash"></div>
${exchangeItemRows || '<div style="font-size:10px;font-style:italic;">No exchange items</div>'}
<div class="dash"></div>
<div class="total-row"><span>Exchange Value</span><span>LKR ${fmt(record.exchangeAmount)}</span></div>
` : ""}

<div class="solid"></div>
<div class="grand-row"><span>${balanceLabel}</span><span>${balanceValue}</span></div>
<div class="solid"></div>

<div style="margin-top:6px;font-size:9px;text-align:center;">
  ${record.restockItems ? "&#10003; Items restocked to inventory" : "&#9675; Items not restocked"}
</div>

<table class="sig-table">
  <tr>
    <td>Staff</td>
    <td>Customer</td>
  </tr>
</table>

<div class="dash" style="margin-top:10px;"></div>
<div class="center" style="font-size:9px;margin-top:3px;">Thank you &amp; please keep this receipt</div>
<div class="center" style="font-size:9px;">${new Date().getFullYear()} &copy; Hexalyte Innovation</div>

<button class="print-btn" onclick="window.print()">&#128438; Print Receipt</button>
</body></html>`;

  const win = window.open("", "_blank");
  if (!win) { alert("Please allow popups to print the receipt."); return; }
  win.document.write(html);
  win.document.close();
  // Auto-trigger print after a short delay for rendering
  setTimeout(() => { try { win.print(); } catch (_) { /* user can click button */ } }, 400);
}

// ── Detail Modal ────────────────────────────────────────────────────────────
function DetailModal({ record, onClose, reasons }: { record: ReturnRecord; onClose: () => void; reasons: ReasonOption[] }) {
  const cfg = STATUS_CFG[record.status] ?? STATUS_CFG.INITIATED;
  const Icon = cfg.icon;
  const isExchange = record.returnType === "EXCHANGE";
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${isExchange ? "bg-violet-500/10" : "bg-primary/10"}`}>
              {isExchange ? <ArrowLeftRight className="h-4 w-4 text-violet-600" /> : <RotateCcw className="h-4 w-4 text-primary" />}
            </div>
            <div>
              <h2 className="font-bold font-mono text-sm">{record.returnNumber}</h2>
              <p className="text-xs text-muted-foreground">{record.originalSale?.invoiceNumber ?? "—"}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={cfg.variant as "success"|"warning"|"danger"|"default"} className="text-[10px] gap-1">
              <Icon className="h-3 w-3" />{cfg.label}
            </Badge>
            <button onClick={() => printBill(record, reasons)}
              className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 hover:bg-muted ${
                isExchange ? "text-violet-600 border-violet-200" : "text-primary border-primary/20"
              }`}>
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {(() => {
            const excDue = isExchange ? Math.max(0, (record.exchangeAmount ?? 0) - record.totalAmount) : 0;
            const netRef = isExchange ? Math.max(0, record.totalAmount - (record.exchangeAmount ?? 0)) : record.refundAmount;
            const balLabel = isExchange
              ? excDue > 0 ? "Collect from Customer" : netRef > 0 ? "Refund to Customer" : "Even Exchange"
              : "Refund to Customer";
            const balColor = isExchange && excDue > 0 ? "text-amber-600" : "text-emerald-600";
            const balBg    = isExchange && excDue > 0 ? "bg-amber-500/10" : "bg-emerald-500/10";
            return (
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-xl border bg-muted/10">
                  <p className="text-xs text-muted-foreground">Return Value</p>
                  <p className="font-bold text-sm">LKR {formatNumber(record.totalAmount)}</p>
                </div>
                {isExchange && (
                  <div className="p-3 rounded-xl border bg-violet-500/10">
                    <p className="text-xs text-muted-foreground">Exchange Value</p>
                    <p className="font-bold text-sm text-violet-600">LKR {formatNumber(record.exchangeAmount ?? 0)}</p>
                  </div>
                )}
                <div className={`p-3 rounded-xl border ${balBg}`}>
                  <p className="text-xs text-muted-foreground">{balLabel}</p>
                  <p className={`font-bold text-sm ${balColor}`}>LKR {formatNumber(isExchange ? (excDue > 0 ? excDue : netRef) : record.refundAmount)}</p>
                </div>
              </div>
            );
          })()}
          <div>
            <p className="text-xs font-semibold mb-2">Returned Items</p>
            <div className="rounded-xl border divide-y overflow-hidden">
              {(record.items ?? []).map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2.5 text-xs">
                  <div>
                    <p className="font-medium">{item.variant?.product?.name ?? "—"}</p>
                    <p className="text-muted-foreground font-mono">{item.variant?.sku ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p>Qty: {item.quantity}</p>
                    <p className="font-semibold">LKR {formatNumber(item.totalAmount)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {isExchange && (record.exchangeData ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 text-violet-600">Exchange Items (Given to Customer)</p>
              <div className="rounded-xl border border-violet-500/20 divide-y overflow-hidden">
                {(record.exchangeData ?? []).map((item, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-2.5 text-xs bg-violet-500/5">
                    <div>
                      <p className="font-medium">{item.productName ?? "—"}</p>
                      <p className="text-muted-foreground font-mono">{item.sku ?? "—"}</p>
                    </div>
                    <div className="text-right">
                      <p>Qty: {item.quantity}</p>
                      <p className="font-semibold text-violet-600">LKR {formatNumber(item.unitPrice * item.quantity)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {record.notes && (
            <div className="p-3 rounded-xl border bg-muted/10 text-xs">
              <p className="font-semibold mb-1">Notes</p>
              <p className="text-muted-foreground">{record.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Return / Exchange Modal — 4-step wizard ─────────────────────────────
const STEPS = ["Type", "Invoice", "Items", "Confirm"];

function NewReturnModal({ onClose, onSaved, initialInvoice, reasons }: { onClose: () => void; onSaved: () => void; initialInvoice?: string; reasons: ReasonOption[] }) {
  const [step, setStep]                   = useState(initialInvoice ? 1 : 0);
  const [mode, setMode]                   = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [invoiceSearch, setInvoiceSearch] = useState(initialInvoice ?? "");
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundSale, setFoundSale]         = useState<SaleLookup | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number }>>({});
  const [skuSearch, setSkuSearch]         = useState("");
  const [skuLoading, setSkuLoading]       = useState(false);
  const [exchangeItems, setExchangeItems] = useState<ExchangeItem[]>([]);
  const [reason, setReason]               = useState("");
  const [notes, setNotes]                 = useState("");
  const [restock, setRestock]             = useState(true);
  const [submitting, setSubmitting]       = useState(false);

  const searchInvoice = async (override?: string) => {
    const query = override ?? invoiceSearch;
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      const listRes = await api.get<{ data: any[] }>(`/sales?search=${encodeURIComponent(query)}&limit=5`);
      const list = (listRes.data?.data ?? listRes.data ?? []) as any[];
      if (list.length === 0) { toast.error("Invoice not found"); return; }
      const detailRes = await api.get<any>(`/sales/${list[0].id}`);
      const s = detailRes.data as any;
      const sale: SaleLookup = {
        id: s.id, invoiceNumber: s.invoiceNumber, total: s.total,
        customer: s.customer ? { firstName: s.customer.firstName, lastName: s.customer.lastName } : null,
        items: (s.items ?? []).map((item: any) => ({
          id: item.id, variantId: item.variantId,
          productName: item.productName ?? item.variant?.product?.name ?? "Unknown",
          variantName: item.variantName ?? "",
          sku: item.sku ?? item.variant?.sku ?? "",
          quantity: item.quantity, unitPrice: item.unitPrice,
        })),
      };
      setFoundSale(sale);
      const init: Record<string, { selected: boolean; quantity: number }> = {};
      sale.items.forEach((item) => { init[item.id] = { selected: true, quantity: item.quantity }; });
      setSelectedItems(init);
      setStep(2);
    } catch { toast.error("Invoice not found"); }
    finally { setSearchLoading(false); }
  };

  useEffect(() => {
    if (initialInvoice) searchInvoice(initialInvoice);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lookupSku = async () => {
    if (!skuSearch.trim()) return;
    setSkuLoading(true);
    try {
      const res = await api.get<VariantLookup>(`/pos/barcode/${encodeURIComponent(skuSearch)}`);
      const v = res.data;
      if (!v?.id) { toast.error("SKU not found"); return; }
      const exists = exchangeItems.find((i) => i.variantId === v.id);
      if (exists) {
        setExchangeItems((p) => p.map((i) => i.variantId === v.id ? { ...i, quantity: i.quantity + 1 } : i));
      } else {
        setExchangeItems((p) => [...p, {
          variantId: v.id, quantity: 1, unitPrice: v.price,
          productName: v.product.name,
          variantName: [v.size, v.color].filter(Boolean).join(" / ") || undefined,
          sku: v.sku,
        }]);
      }
      setSkuSearch("");
      toast.success(`Added: ${v.product.name}`);
    } catch { toast.error("SKU not found"); }
    finally { setSkuLoading(false); }
  };

  const returnTotal   = foundSale
    ? foundSale.items.filter((i) => selectedItems[i.id]?.selected).reduce((s, i) => s + i.unitPrice * (selectedItems[i.id]?.quantity ?? 0), 0)
    : 0;
  const exchangeTotal = exchangeItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const balanceDue    = Math.max(0, exchangeTotal - returnTotal);
  const refundDue     = mode === "RETURN" ? returnTotal : Math.max(0, returnTotal - exchangeTotal);

  const canNext = () => {
    if (step === 0) return true;
    if (step === 1) return !!foundSale;
    if (step === 2) {
      const hasReturn = foundSale?.items.some((i) => selectedItems[i.id]?.selected && (selectedItems[i.id]?.quantity ?? 0) > 0);
      if (!hasReturn) return false;
      if (mode === "EXCHANGE" && exchangeItems.length === 0) return false;
      return true;
    }
    return true;
  };

  const submit = async () => {
    if (!foundSale || !reason) { toast.error("Select a reason"); return; }
    const items = foundSale.items
      .filter((i) => selectedItems[i.id]?.selected && (selectedItems[i.id]?.quantity ?? 0) > 0)
      .map((i) => ({ variantId: i.variantId, quantity: selectedItems[i.id].quantity, unitPrice: i.unitPrice }));
    setSubmitting(true);
    try {
      await api.post("/returns", {
        originalSaleId: foundSale.id, reason, notes: notes || undefined,
        restockItems: restock, items, returnType: mode,
        ...(mode === "EXCHANGE" ? { exchangeItems } : {}),
      });
      toast.success(mode === "EXCHANGE" ? "Exchange created successfully" : "Return created successfully");
      onSaved(); onClose();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setSubmitting(false); }
  };

  const isExchange = mode === "EXCHANGE";
  const accent = isExchange ? "violet" : "primary";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-lg max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${isExchange ? "bg-violet-500/10" : "bg-primary/10"}`}>
              {isExchange ? <ArrowLeftRight className={`h-4 w-4 text-violet-600`} /> : <RotateCcw className="h-4 w-4 text-primary" />}
            </div>
            <div>
              <h2 className="font-bold text-sm leading-tight">
                {step === 0 ? "New Request" : isExchange ? "Exchange" : "Return / Refund"}
              </h2>
              <p className="text-[10px] text-muted-foreground">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {/* Step dots */}
        <div className="flex items-center gap-0 px-6 pt-3 pb-1 shrink-0">
          {STEPS.map((label, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className={`flex items-center justify-center h-6 w-6 rounded-full text-[10px] font-bold border-2 transition-all ${
                i < step ? (isExchange ? "bg-violet-600 border-violet-600 text-white" : "bg-primary border-primary text-white")
                : i === step ? (isExchange ? "border-violet-600 text-violet-600" : "border-primary text-primary")
                : "border-muted-foreground/30 text-muted-foreground/40"
              }`}>{i < step ? "✓" : i + 1}</div>
              <p className={`text-[9px] ml-1 font-medium ${i === step ? (isExchange ? "text-violet-600" : "text-primary") : "text-muted-foreground/50"}`}>{label}</p>
              {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 ${i < step ? (isExchange ? "bg-violet-400" : "bg-primary/60") : "bg-muted-foreground/20"}`} />}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* ── STEP 0: Choose type ── */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground mb-4">Select the type of request you want to create.</p>
              <button onClick={() => { setMode("RETURN"); setStep(1); }}
                className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all hover:border-primary ${mode === "RETURN" ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <RotateCcw className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-bold text-sm">Return &amp; Refund</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Customer returns items and receives a cash/credit refund. Stock is added back to inventory on approval.</p>
                </div>
              </button>
              <button onClick={() => { setMode("EXCHANGE"); setStep(1); }}
                className={`w-full flex items-start gap-4 p-4 rounded-2xl border-2 text-left transition-all hover:border-violet-500 ${mode === "EXCHANGE" ? "border-violet-500 bg-violet-500/5" : "border-border"}`}>
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0 mt-0.5">
                  <ArrowLeftRight className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="font-bold text-sm text-violet-700">Exchange</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Customer returns items and receives different items in return. Any price difference is collected or refunded.</p>
                </div>
              </button>
            </div>
          )}

          {/* ── STEP 1: Find invoice ── */}
          {step === 1 && (
            <div className="space-y-4">
              <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${isExchange ? "bg-violet-500/10 text-violet-700" : "bg-primary/10 text-primary"}`}>
                {isExchange ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {isExchange ? "Exchange — Enter the original invoice number" : "Return — Enter the original invoice number"}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Invoice Number *</Label>
                <div className="flex gap-2">
                  <Input placeholder="e.g. INV-20240101-0001" value={invoiceSearch}
                    onChange={(e) => setInvoiceSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") searchInvoice(); }} autoFocus />
                  <Button variant="outline" onClick={() => searchInvoice()} disabled={searchLoading} className="shrink-0 gap-1.5">
                    {searchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                    Search
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">You can also navigate here directly from the Sales page using the "Process Return" action.</p>
              </div>
              {foundSale && (
                <div className="p-3 rounded-xl border bg-emerald-500/5 border-emerald-500/30 text-xs space-y-1">
                  <div className="flex items-center gap-1.5"><CheckCircle className="h-3.5 w-3.5 text-emerald-600" /><span className="font-bold text-emerald-700">{foundSale.invoiceNumber}</span></div>
                  <p className="text-muted-foreground">{foundSale.customer ? `${foundSale.customer.firstName} ${foundSale.customer.lastName ?? ""}`.trim() : "Walk-in"} · LKR {formatNumber(foundSale.total)}</p>
                  <p className="text-muted-foreground">{foundSale.items.length} item(s)</p>
                </div>
              )}
            </div>
          )}

          {/* ── STEP 2: Items ── */}
          {step === 2 && foundSale && (
            <div className="space-y-4">
              {/* Returned items */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <div className="h-5 w-5 rounded-md bg-red-500/10 flex items-center justify-center"><RotateCcw className="h-3 w-3 text-red-600" /></div>
                  <p className="text-xs font-bold">Items Customer is Returning</p>
                </div>
                <div className="rounded-xl border overflow-hidden divide-y">
                  {foundSale.items.map((item) => {
                    const sel = selectedItems[item.id] ?? { selected: false, quantity: 1 };
                    return (
                      <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 transition-opacity ${sel.selected ? "" : "opacity-40"}`}>
                        <input type="checkbox" checked={sel.selected}
                          onChange={(e) => setSelectedItems((p) => ({ ...p, [item.id]: { ...sel, selected: e.target.checked } }))}
                          className="h-3.5 w-3.5 accent-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground font-mono">{item.variantName} · {item.sku}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Input type="number" min={1} max={item.quantity} value={sel.quantity}
                            onChange={(e) => setSelectedItems((p) => ({ ...p, [item.id]: { ...sel, quantity: Math.min(item.quantity, parseInt(e.target.value) || 1) } }))}
                            className="w-14 h-7 text-xs text-center px-1" disabled={!sel.selected} />
                          <span className="text-[10px] text-muted-foreground">/{item.quantity}</span>
                        </div>
                        <span className="text-xs font-semibold shrink-0 w-20 text-right">LKR {formatNumber(item.unitPrice * (sel.selected ? sel.quantity : 0))}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-end text-xs">
                  <span className="text-muted-foreground mr-2">Return Value:</span>
                  <span className="font-bold">LKR {formatNumber(returnTotal)}</span>
                </div>
              </div>

              {/* Exchange items */}
              {isExchange && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-1.5">
                    <div className="h-5 w-5 rounded-md bg-violet-500/10 flex items-center justify-center"><ArrowLeftRight className="h-3 w-3 text-violet-600" /></div>
                    <p className="text-xs font-bold text-violet-700">Items to Give Customer (Exchange)</p>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Scan or type the SKU of each new item the customer will receive.</p>
                  <div className="flex gap-2">
                    <Input placeholder="Scan barcode / type SKU…" value={skuSearch}
                      onChange={(e) => setSkuSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") lookupSku(); }} />
                    <Button variant="outline" onClick={lookupSku} disabled={skuLoading}
                      className="shrink-0 gap-1.5 border-violet-300 text-violet-700 hover:bg-violet-50">
                      {skuLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Package className="h-3.5 w-3.5" />}
                      Add
                    </Button>
                  </div>
                  {exchangeItems.length === 0 && (
                    <div className="rounded-xl border border-dashed border-violet-300 bg-violet-500/5 p-4 text-center text-xs text-violet-500">
                      No exchange items added yet.<br/>Scan a barcode or type a SKU above.
                    </div>
                  )}
                  {exchangeItems.length > 0 && (
                    <div className="rounded-xl border border-violet-200 overflow-hidden divide-y">
                      {exchangeItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-violet-500/5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-violet-800">{item.productName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{item.variantName ? `${item.variantName} · ` : ""}{item.sku}</p>
                          </div>
                          <Input type="number" min={1} value={item.quantity}
                            onChange={(e) => setExchangeItems((p) => p.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                            className="w-14 h-7 text-xs text-center px-1 shrink-0" />
                          <span className="text-xs font-bold text-violet-700 w-20 text-right shrink-0">LKR {formatNumber(item.unitPrice * item.quantity)}</span>
                          <button onClick={() => setExchangeItems((p) => p.filter((_, i) => i !== idx))} className="p-1 hover:text-red-500 shrink-0">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {exchangeItems.length > 0 && (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      <div className="p-2.5 rounded-xl border bg-muted/10 text-center text-xs">
                        <p className="text-muted-foreground">Returning</p>
                        <p className="font-bold mt-0.5">LKR {formatNumber(returnTotal)}</p>
                      </div>
                      <div className="p-2.5 rounded-xl border bg-violet-500/10 text-center text-xs">
                        <p className="text-muted-foreground">Exchange</p>
                        <p className="font-bold mt-0.5 text-violet-700">LKR {formatNumber(exchangeTotal)}</p>
                      </div>
                      <div className={`p-2.5 rounded-xl border text-center text-xs ${balanceDue > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                        <p className="text-muted-foreground">{balanceDue > 0 ? "Collect" : "Refund"}</p>
                        <p className={`font-bold mt-0.5 ${balanceDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          LKR {formatNumber(balanceDue > 0 ? balanceDue : refundDue)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3: Confirm ── */}
          {step === 3 && foundSale && (
            <div className="space-y-4">
              {/* Summary card */}
              <div className={`rounded-xl border p-4 space-y-2 text-xs ${isExchange ? "bg-violet-500/5 border-violet-200" : "bg-primary/5"}`}>
                <p className="font-bold text-sm">{isExchange ? "Exchange Summary" : "Return Summary"}</p>
                <div className="flex justify-between"><span className="text-muted-foreground">Invoice</span><span className="font-mono font-semibold">{foundSale.invoiceNumber}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Items returning</span><span>{foundSale.items.filter((i) => selectedItems[i.id]?.selected).length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Return value</span><span className="font-bold">LKR {formatNumber(returnTotal)}</span></div>
                {isExchange && <>
                  <div className="flex justify-between"><span className="text-muted-foreground">Exchange items</span><span>{exchangeItems.length}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Exchange value</span><span className="font-bold text-violet-700">LKR {formatNumber(exchangeTotal)}</span></div>
                  <div className={`flex justify-between font-bold border-t pt-2 ${balanceDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                    <span>{balanceDue > 0 ? "Collect from customer" : "Refund to customer"}</span>
                    <span>LKR {formatNumber(balanceDue > 0 ? balanceDue : refundDue)}</span>
                  </div>
                </>}
                {!isExchange && (
                  <div className="flex justify-between font-bold border-t pt-2 text-emerald-600">
                    <span>Refund to customer</span>
                    <span>LKR {formatNumber(returnTotal)}</span>
                  </div>
                )}
              </div>

              {/* Reason */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reason for Return *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Select a reason…" /></SelectTrigger>
                  <SelectContent>{reasons.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any extra details…" rows={2}
                  className="w-full text-xs rounded-xl border bg-background px-3 py-2 outline-none focus:ring-1 ring-primary resize-none" />
              </div>

              {/* Restock */}
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                <div>
                  <p className="text-sm font-medium">Restock Returned Items on Approval</p>
                  <p className="text-xs text-muted-foreground">Items will be added back to inventory when this request is approved.</p>
                </div>
                <Switch checked={restock} onCheckedChange={setRestock} />
              </div>
            </div>
          )}
        </div>

        {/* Footer nav */}
        <div className={cn(modalFooterButtonClass, "flex items-center justify-between px-6 py-4 border-t bg-muted/10 shrink-0")}>
          <Button variant="outline" onClick={() => step === 0 ? onClose() : setStep((s) => s - 1)} disabled={submitting}>
            {step === 0 ? "Cancel" : "← Back"}
          </Button>
          {step < 3 ? (
            <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}
              className={isExchange ? "bg-violet-600 hover:bg-violet-700" : ""}>
              Next →
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting || !reason}
              className={`gap-1.5 min-w-[150px] ${isExchange ? "bg-violet-600 hover:bg-violet-700" : ""}`}>
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : isExchange ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {submitting ? "Submitting…" : isExchange ? "Create Exchange" : "Create Return"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const profile = useShopProfile();
  const reasons = useMemo(() => buildReasons(profile.type), [profile.type]);
  const [returns, setReturns]             = useState<ReturnRecord[]>([]);
  const [loading, setLoading]             = useState(true);
  const [addOpen, setAddOpen]             = useState(false);
  const [initialInvoice, setInitialInvoice] = useState<string | undefined>();
  const [detailRecord, setDetailRecord]   = useState<ReturnRecord | null>(null);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: ReturnRecord[] }>("/returns?limit=200");
      setReturns((res.data?.data ?? res.data ?? []) as ReturnRecord[]);
    } catch { toast.error("Failed to load returns"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchReturns();
    // Pre-fill from sales page navigation (?invoice=INV-xxx)
    if (typeof window !== "undefined") {
      const inv = new URLSearchParams(window.location.search).get("invoice");
      if (inv) { setInitialInvoice(inv); setAddOpen(true); }
    }
  }, [fetchReturns]);

  const updateStatus = async (id: string, status: string, label: string) => {
    try {
      await api.put(`/returns/${id}/status`, { status });
      if (status === "APPROVED") {
        toast.success("Return approved — stock restored to inventory");
      } else {
        toast.success(`Marked as ${label}`);
      }
      fetchReturns();
    } catch { toast.error("Failed to update status"); }
  };

  const totalRefunded = returns
    .filter((r) => r.status === "REFUND_PROCESSED" || r.status === "COMPLETED")
    .reduce((s, r) => s + r.refundAmount, 0);

  const STATS = [
    { label: "Total",         value: returns.length,                                                   color: "text-foreground",   bg: "bg-muted/40",         icon: RotateCcw, tint: "border-slate-200/70 bg-gradient-to-br from-slate-50 to-white dark:border-slate-500/20 dark:from-slate-500/10 dark:to-transparent" },
    { label: "Exchanges",     value: returns.filter((r) => r.returnType === "EXCHANGE").length,        color: "text-violet-600",   bg: "bg-violet-500/15",    icon: ArrowLeftRight, tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Pending",       value: returns.filter((r) => r.status === "INITIATED").length,           color: "text-amber-600",    bg: "bg-amber-500/15",     icon: Clock, tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
    { label: "Total Refunded",value: `LKR ${formatNumber(totalRefunded)}`,                             color: "text-blue-600",     bg: "bg-blue-500/15",      icon: DollarSign, tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
  ];

  const columns: ColumnDef<ReturnRecord>[] = [
    {
      accessorKey: "returnNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="ID" />,
      cell: ({ row }) => {
        const isExchange = row.original.returnType === "EXCHANGE";
        return (
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center h-5 w-5 rounded-md text-[9px] font-bold ${isExchange ? "bg-violet-500/10 text-violet-600" : "bg-primary/10 text-primary"}`}>
              {isExchange ? "EX" : "RT"}
            </span>
            <OpenRecordButton
              onClick={() => setDetailRecord(row.original)}
              className="font-mono text-xs"
              title="View details"
            >
              {row.original.returnNumber}
            </OpenRecordButton>
          </div>
        );
      },
    },
    {
      accessorKey: "returnType",
      header: () => null,
      cell: () => null,
      enableHiding: true,
      enableSorting: false,
    },
    {
      id: "invoice",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
      cell: ({ row }) => <span className="font-mono text-xs text-muted-foreground">{row.original.originalSale?.invoiceNumber ?? "—"}</span>,
    },
    {
      id: "items",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Package className="h-3 w-3" />{row.original.items?.length ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "reason",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Reason" />,
      cell: ({ row }) => {
        const r = reasons.find((r) => r.value === row.original.reason);
        return <span className="text-xs text-muted-foreground">{r?.label ?? row.original.reason}</span>;
      },
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
      cell: ({ row }) => {
        const isExchange = row.original.returnType === "EXCHANGE";
        const excDue = isExchange ? Math.max(0, (row.original.exchangeAmount ?? 0) - row.original.totalAmount) : 0;
        const netRef = isExchange ? Math.max(0, row.original.totalAmount - (row.original.exchangeAmount ?? 0)) : 0;
        return (
          <div>
            <p className="text-sm font-bold">LKR {formatNumber(row.original.totalAmount)}</p>
            {isExchange && excDue > 0 && (
              <p className="text-[10px] text-amber-600">collect LKR {formatNumber(excDue)}</p>
            )}
            {isExchange && netRef > 0 && (
              <p className="text-[10px] text-emerald-600">refund LKR {formatNumber(netRef)}</p>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" })}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => {
        const cfg = STATUS_CFG[row.original.status] ?? STATUS_CFG.INITIATED;
        const Icon = cfg.icon;
        return (
          <Badge variant={cfg.variant as "success"|"warning"|"danger"|"default"} className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center gap-1">
            <Icon className="h-3 w-3" />{cfg.label}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => {
        const s = row.original.status;
        const isExchange = row.original.returnType === "EXCHANGE";
        const moreActions = [
          { text: isExchange ? "Print Exchange Bill" : "Print Return Receipt", function: () => printBill(row.original, reasons) },
        ];
        if (s === "INITIATED") {
          moreActions.push({ text: "Approve",        function: () => updateStatus(row.original.id, "APPROVED", "Approved") });
          moreActions.push({ text: "Reject",         function: () => updateStatus(row.original.id, "REJECTED", "Rejected") });
        }
        if (s === "APPROVED") {
          if (isExchange) {
            moreActions.push({ text: "Mark Completed", function: () => updateStatus(row.original.id, "COMPLETED", "Completed") });
          } else {
            moreActions.push({ text: "Process Refund", function: () => updateStatus(row.original.id, "REFUND_PROCESSED", "Refund Processed") });
          }
        }
        return (
          <TableActionsRow
            showAction={{ action: () => setDetailRecord(row.original), tooltip: "View Details" }}
            dropMoreActions={moreActions}
          />
        );
      },
    },
  ];

  return (
    <ModuleGate module="returns">
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Returns & Exchanges</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">Manage product returns, refunds, and exchanges</p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <Button variant="outline" onClick={fetchReturns} className="gap-1.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <div className="hidden sm:block h-6 w-px bg-slate-200 dark:bg-white/10 mx-0.5" aria-hidden />
          <Button onClick={() => setAddOpen(true)} className="gap-1.5">
            <Plus className="h-[18px] w-[18px]" /> New Request
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {STATS.map((s) => (
          <Card
            key={s.label}
            className={`rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}
          >
            <CardContent className="h-[68px] p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className={`${typeof s.value === "string" ? "text-lg" : "text-[22px]"} font-bold leading-none tabular-nums`}>{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Table */}
      <ClientSideTable
        data={returns}
        columns={columns}
        searchableColumns={[{ id: "returnNumber", title: "Return / Exchange ID" }]}
        filterableColumns={[
          {
            id: "status", title: "Status",
            options: [
              { label: "Initiated",        value: "INITIATED" },
              { label: "Approved",         value: "APPROVED" },
              { label: "Rejected",         value: "REJECTED" },
              { label: "Completed",        value: "COMPLETED" },
              { label: "Refund Processed", value: "REFUND_PROCESSED" },
            ],
          },
          {
            id: "returnType", title: "Type",
            options: [
              { label: "Return", value: "RETURN" },
              { label: "Exchange", value: "EXCHANGE" },
            ],
          },
        ]}
        isShowExportButtons={{ isShow: true, fileName: "returns-exchanges-export" }}
      />

      {/* Modals */}
      {addOpen && (
        <NewReturnModal
          onClose={() => { setAddOpen(false); setInitialInvoice(undefined); }}
          onSaved={() => fetchReturns()}
          initialInvoice={initialInvoice}
          reasons={reasons}
        />
      )}
      {detailRecord && <DetailModal record={detailRecord} onClose={() => setDetailRecord(null)} reasons={reasons} />}
    </div>
    </ModuleGate>
  );
}
