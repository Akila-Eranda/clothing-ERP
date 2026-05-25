"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Plus, CheckCircle, Clock, XCircle, Package, RefreshCw, X, Loader2,
  Search, RotateCcw, DollarSign, ArrowLeftRight, ChevronRight, Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

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

const REASONS: { value: string; label: string }[] = [
  { value: "DEFECTIVE",             label: "Defective Product" },
  { value: "WRONG_ITEM",            label: "Wrong Item" },
  { value: "SIZE_ISSUE",            label: "Size Issue" },
  { value: "CUSTOMER_CHANGED_MIND", label: "Customer Changed Mind" },
  { value: "DAMAGED",               label: "Damaged" },
  { value: "OTHER",                 label: "Other" },
];

const STATUS_CFG: Record<string, { label: string; variant: string; icon: React.ElementType }> = {
  INITIATED:        { label: "Initiated",        variant: "warning", icon: Clock },
  APPROVED:         { label: "Approved",         variant: "success", icon: CheckCircle },
  REJECTED:         { label: "Rejected",         variant: "danger",  icon: XCircle },
  COMPLETED:        { label: "Completed",        variant: "default", icon: CheckCircle },
  REFUND_PROCESSED: { label: "Refund Processed", variant: "success", icon: DollarSign },
};

// ── Thermal bill printer (80mm) ──────────────────────────────────────────────
function printBill(record: ReturnRecord) {
  const isExchange = record.returnType === "EXCHANGE";
  const fmt  = (n: number) => n.toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = new Date(record.createdAt);
  const dateStr = date.toLocaleDateString("en-LK", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
  const reason  = REASONS.find((r) => r.value === record.reason)?.label ?? record.reason;

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
function DetailModal({ record, onClose }: { record: ReturnRecord; onClose: () => void }) {
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
            <button onClick={() => printBill(record)}
              className={`p-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 hover:bg-muted ${
                isExchange ? "text-violet-600 border-violet-200" : "text-primary border-primary/20"
              }`}>
              <Printer className="h-3.5 w-3.5" /> Print
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
            <div className={`p-3 rounded-xl border ${isExchange ? "bg-emerald-500/10" : "bg-blue-500/10"}`}>
              <p className="text-xs text-muted-foreground">{isExchange ? "Balance Due" : "Refund"}</p>
              <p className={`font-bold text-sm ${isExchange ? "text-emerald-600" : "text-blue-600"}`}>LKR {formatNumber(record.refundAmount)}</p>
            </div>
          </div>
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

// ── New Return / Exchange Modal ─────────────────────────────────────────────
function NewReturnModal({ onClose, onSaved, initialInvoice }: { onClose: () => void; onSaved: () => void; initialInvoice?: string }) {
  const [mode, setMode]                   = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [invoiceSearch, setInvoiceSearch] = useState(initialInvoice ?? "");
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundSale, setFoundSale]         = useState<SaleLookup | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number }>>({});
  const [reason, setReason]               = useState("");
  const [notes, setNotes]                 = useState("");
  const [restock, setRestock]             = useState(true);
  const [submitting, setSubmitting]       = useState(false);

  // Exchange items
  const [skuSearch, setSkuSearch]           = useState("");
  const [skuLoading, setSkuLoading]         = useState(false);
  const [exchangeItems, setExchangeItems]   = useState<ExchangeItem[]>([]);

  const searchInvoice = async (override?: string) => {
    const query = override ?? invoiceSearch;
    if (!query.trim()) return;
    setSearchLoading(true);
    try {
      const listRes = await api.get<{ data: any[] }>(`/pos/sales?search=${encodeURIComponent(query)}&limit=1`);
      const list = (listRes.data?.data ?? listRes.data ?? []) as any[];
      if (list.length === 0) { toast.error("Invoice not found"); return; }
      const detailRes = await api.get<any>(`/pos/sales/${list[0].id}`);
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
    } catch { toast.error("Invoice not found"); }
    finally { setSearchLoading(false); }
  };

  // Auto-search when pre-filled from sales page
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

  const returnTotal    = foundSale
    ? foundSale.items.filter((i) => selectedItems[i.id]?.selected).reduce((s, i) => s + i.unitPrice * (selectedItems[i.id]?.quantity ?? 0), 0)
    : 0;
  const exchangeTotal  = exchangeItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  const balanceDue     = Math.max(0, exchangeTotal - returnTotal);
  const refundDue      = mode === "RETURN" ? returnTotal : Math.max(0, returnTotal - exchangeTotal);

  const submit = async () => {
    if (!foundSale) { toast.error("Select a sale first"); return; }
    if (!reason) { toast.error("Select a reason"); return; }
    const items = foundSale.items
      .filter((i) => selectedItems[i.id]?.selected && (selectedItems[i.id]?.quantity ?? 0) > 0)
      .map((i) => ({ variantId: i.variantId, quantity: selectedItems[i.id].quantity, unitPrice: i.unitPrice }));
    if (!items.length) { toast.error("Select at least one item"); return; }
    if (mode === "EXCHANGE" && !exchangeItems.length) { toast.error("Add at least one exchange item"); return; }
    setSubmitting(true);
    try {
      await api.post("/returns", {
        originalSaleId: foundSale.id, reason, notes: notes || undefined,
        restockItems: restock, items, returnType: mode,
        ...(mode === "EXCHANGE" ? { exchangeItems } : {}),
      });
      toast.success(mode === "EXCHANGE" ? "Exchange created" : "Return created");
      onSaved(); onClose();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-xl flex items-center justify-center ${mode === "EXCHANGE" ? "bg-violet-500/10" : "bg-primary/10"}`}>
              {mode === "EXCHANGE" ? <ArrowLeftRight className="h-4 w-4 text-violet-600" /> : <RotateCcw className="h-4 w-4 text-primary" />}
            </div>
            <h2 className="font-bold">New Return / Exchange</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border p-1 gap-1 bg-muted/30">
            {(["RETURN", "EXCHANGE"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-2 rounded-lg transition-all ${
                  mode === m ? (m === "EXCHANGE" ? "bg-violet-600 text-white" : "bg-primary text-white") : "text-muted-foreground hover:text-foreground"
                }`}>
                {m === "EXCHANGE" ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {m === "EXCHANGE" ? "Exchange" : "Return / Refund"}
              </button>
            ))}
          </div>

          {/* Invoice search */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Invoice Number *</Label>
            <div className="flex gap-2">
              <Input placeholder="INV-20240101-0001" value={invoiceSearch}
                onChange={(e) => setInvoiceSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchInvoice(); }} autoFocus />
              <Button variant="outline" onClick={searchInvoice} disabled={searchLoading} className="shrink-0 gap-1.5">
                {searchLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                Find
              </Button>
            </div>
          </div>

          {foundSale && (
            <>
              <div className="p-3 rounded-xl border bg-emerald-500/5 border-emerald-500/20 text-xs">
                <p className="font-semibold text-emerald-600">{foundSale.invoiceNumber}</p>
                <p className="text-muted-foreground">
                  {foundSale.customer ? `${foundSale.customer.firstName} ${foundSale.customer.lastName ?? ""}`.trim() : "Walk-in"}
                  {" · LKR "}{formatNumber(foundSale.total)}
                </p>
              </div>

              {/* Return items */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Items to Return *</Label>
                <div className="rounded-xl border overflow-hidden divide-y">
                  {foundSale.items.map((item) => {
                    const sel = selectedItems[item.id] ?? { selected: false, quantity: 1 };
                    return (
                      <div key={item.id} className={`flex items-center gap-3 px-3 py-2.5 ${sel.selected ? "" : "opacity-40"}`}>
                        <input type="checkbox" checked={sel.selected}
                          onChange={(e) => setSelectedItems((p) => ({ ...p, [item.id]: { ...sel, selected: e.target.checked } }))}
                          className="h-3.5 w-3.5 accent-primary" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.variantName} · {item.sku}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[10px] text-muted-foreground">Qty:</span>
                          <Input type="number" min={1} max={item.quantity} value={sel.quantity}
                            onChange={(e) => setSelectedItems((p) => ({ ...p, [item.id]: { ...sel, quantity: Math.min(item.quantity, parseInt(e.target.value) || 1) } }))}
                            className="w-14 h-6 text-xs text-center p-1" disabled={!sel.selected} />
                          <span className="text-[10px] text-muted-foreground">/{item.quantity}</span>
                        </div>
                        <span className="text-xs font-semibold shrink-0">LKR {formatNumber(item.unitPrice * (sel.selected ? sel.quantity : 0))}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exchange items */}
              {mode === "EXCHANGE" && (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold text-violet-600">Exchange Items (Give to Customer) *</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Scan / enter SKU…" value={skuSearch}
                      onChange={(e) => setSkuSearch(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") lookupSku(); }} />
                    <Button variant="outline" onClick={lookupSku} disabled={skuLoading} className="shrink-0 gap-1.5">
                      {skuLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                      Add
                    </Button>
                  </div>
                  {exchangeItems.length > 0 && (
                    <div className="rounded-xl border border-violet-500/20 overflow-hidden divide-y">
                      {exchangeItems.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-3 px-3 py-2.5 bg-violet-500/5">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-violet-700">{item.productName}</p>
                            <p className="text-[10px] text-muted-foreground font-mono">{item.sku}</p>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Input type="number" min={1} value={item.quantity}
                              onChange={(e) => setExchangeItems((p) => p.map((x, i) => i === idx ? { ...x, quantity: parseInt(e.target.value) || 1 } : x))}
                              className="w-14 h-6 text-xs text-center p-1" />
                          </div>
                          <span className="text-xs font-semibold text-violet-600 shrink-0">LKR {formatNumber(item.unitPrice * item.quantity)}</span>
                          <button onClick={() => setExchangeItems((p) => p.filter((_, i) => i !== idx))} className="p-1 hover:text-red-500">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Exchange summary */}
                  {exchangeItems.length > 0 && (
                    <div className="flex gap-3 text-xs">
                      <div className="flex-1 p-2.5 rounded-lg border bg-muted/10 text-center">
                        <p className="text-muted-foreground">Return Value</p>
                        <p className="font-bold">LKR {formatNumber(returnTotal)}</p>
                      </div>
                      <div className="flex items-center text-muted-foreground"><ChevronRight className="h-4 w-4" /></div>
                      <div className="flex-1 p-2.5 rounded-lg border bg-violet-500/10 text-center">
                        <p className="text-muted-foreground">Exchange Value</p>
                        <p className="font-bold text-violet-600">LKR {formatNumber(exchangeTotal)}</p>
                      </div>
                      <div className="flex items-center text-muted-foreground"><ChevronRight className="h-4 w-4" /></div>
                      <div className={`flex-1 p-2.5 rounded-lg border text-center ${balanceDue > 0 ? "bg-red-500/10" : "bg-emerald-500/10"}`}>
                        <p className="text-muted-foreground">{balanceDue > 0 ? "Balance Due" : "Refund Due"}</p>
                        <p className={`font-bold ${balanceDue > 0 ? "text-red-600" : "text-emerald-600"}`}>
                          LKR {formatNumber(balanceDue > 0 ? balanceDue : refundDue)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reason */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reason *</Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger><SelectValue placeholder="Select reason…" /></SelectTrigger>
                  <SelectContent>{REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes</Label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                  placeholder="Additional details…" rows={2}
                  className="w-full text-xs rounded-xl border bg-background px-3 py-2 outline-none focus:ring-1 ring-primary resize-none" />
              </div>

              {/* Restock toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl border bg-muted/10">
                <div>
                  <p className="text-sm font-medium">Restock Returned Items</p>
                  <p className="text-xs text-muted-foreground">Add returned items back to inventory</p>
                </div>
                <Switch checked={restock} onCheckedChange={setRestock} />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !foundSale}
            className={`gap-1.5 min-w-[140px] ${mode === "EXCHANGE" ? "bg-violet-600 hover:bg-violet-700" : ""}`}>
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : mode === "EXCHANGE" ? <ArrowLeftRight className="h-3.5 w-3.5" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {mode === "EXCHANGE" ? "Create Exchange" : "Create Return"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ReturnsPage() {
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
    { label: "Total",         value: returns.length,                                                   color: "text-foreground",   bg: "bg-muted/40",         icon: RotateCcw },
    { label: "Exchanges",     value: returns.filter((r) => r.returnType === "EXCHANGE").length,        color: "text-violet-500",   bg: "bg-violet-500/10",    icon: ArrowLeftRight },
    { label: "Pending",       value: returns.filter((r) => r.status === "INITIATED").length,           color: "text-amber-500",    bg: "bg-amber-500/10",     icon: Clock },
    { label: "Total Refunded",value: `LKR ${formatNumber(totalRefunded)}`,                             color: "text-blue-500",     bg: "bg-blue-500/10",      icon: DollarSign },
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
            <span className="font-mono text-xs font-medium">{row.original.returnNumber}</span>
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
        const r = REASONS.find((r) => r.value === row.original.reason);
        return <span className="text-xs text-muted-foreground">{r?.label ?? row.original.reason}</span>;
      },
    },
    {
      accessorKey: "totalAmount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Value" />,
      cell: ({ row }) => {
        const isExchange = row.original.returnType === "EXCHANGE";
        return (
          <div>
            <p className="text-sm font-bold">LKR {formatNumber(row.original.totalAmount)}</p>
            {isExchange && row.original.refundAmount > 0 && (
              <p className="text-[10px] text-emerald-600">+LKR {formatNumber(row.original.refundAmount)} back</p>
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
          <Badge variant={cfg.variant as "success"|"warning"|"danger"|"default"} className="text-[10px] gap-1">
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
          { text: "View Details", function: () => setDetailRecord(row.original) },
          { text: isExchange ? "Print Exchange Bill" : "Print Return Receipt", function: () => printBill(row.original) },
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
        return <TableActionsRow dropMoreActions={moreActions} />;
      },
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Returns & Exchanges</h1>
          <p className="text-sm text-muted-foreground">Manage product returns, refunds, and exchanges</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchReturns} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Request
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {STATS.map((s) => (
          <Card key={s.label}><CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
            <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Table */}
      <ClientSideTable
        data={returns}
        columns={columns}
        pageCount={Math.ceil(returns.length / 10)}
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
        />
      )}
      {detailRecord && <DetailModal record={detailRecord} onClose={() => setDetailRecord(null)} />}
    </div>
  );
}
