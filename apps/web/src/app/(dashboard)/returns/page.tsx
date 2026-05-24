"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, CheckCircle, Clock, XCircle, Package, RefreshCw, X, Loader2, Search, AlertCircle, RotateCcw, DollarSign } from "lucide-react";
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
interface ReturnRecord {
  id: string; returnNumber: string; reason: string; status: string;
  notes?: string; totalAmount: number; refundAmount: number;
  restockItems: boolean; createdAt: string;
  originalSale?: { invoiceNumber: string } | null;
  items?: { id: string; variantId: string; quantity: number; unitPrice: number; totalAmount: number }[];
}
interface SaleLookup {
  id: string; invoiceNumber: string; total: number;
  customer?: { name: string } | null;
  items: { id: string; variantId: string; productName: string; variantName: string; sku: string; quantity: number; unitPrice: number }[];
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
  INITIATED:       { label: "Initiated",       variant: "warning", icon: Clock },
  APPROVED:        { label: "Approved",        variant: "success", icon: CheckCircle },
  REJECTED:        { label: "Rejected",        variant: "danger",  icon: XCircle },
  COMPLETED:       { label: "Completed",       variant: "default", icon: CheckCircle },
  REFUND_PROCESSED:{ label: "Refund Processed",variant: "success", icon: DollarSign },
};

// ── New Return Modal ────────────────────────────────────────────────────────
function NewReturnModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [foundSale, setFoundSale]         = useState<SaleLookup | null>(null);
  const [selectedItems, setSelectedItems] = useState<Record<string, { selected: boolean; quantity: number }>>({});
  const [reason, setReason]               = useState("");
  const [notes, setNotes]                 = useState("");
  const [restock, setRestock]             = useState(true);
  const [submitting, setSubmitting]       = useState(false);

  const searchInvoice = async () => {
    if (!invoiceSearch.trim()) return;
    setSearchLoading(true);
    try {
      const res = await api.get<{ data: SaleLookup[] }>(`/pos/sales?search=${encodeURIComponent(invoiceSearch)}&limit=1`);
      const list = (res.data?.data ?? res.data ?? []) as SaleLookup[];
      if (list.length === 0) { toast.error("Invoice not found"); return; }
      const sale = list[0];
      setFoundSale(sale);
      const init: Record<string, { selected: boolean; quantity: number }> = {};
      sale.items?.forEach((item) => { init[item.id] = { selected: true, quantity: item.quantity }; });
      setSelectedItems(init);
    } catch { toast.error("Search failed"); }
    finally { setSearchLoading(false); }
  };

  const submit = async () => {
    if (!foundSale) { toast.error("Select a sale first"); return; }
    if (!reason) { toast.error("Select a reason"); return; }
    const items = foundSale.items
      .filter((i) => selectedItems[i.id]?.selected && (selectedItems[i.id]?.quantity ?? 0) > 0)
      .map((i) => ({ variantId: i.variantId, quantity: selectedItems[i.id].quantity, unitPrice: i.unitPrice }));
    if (!items.length) { toast.error("Select at least one item"); return; }
    setSubmitting(true);
    try {
      await api.post("/returns", { originalSaleId: foundSale.id, reason, notes: notes || undefined, restockItems: restock, items });
      toast.success("Return created");
      onSaved(); onClose();
    } catch (e: unknown) { toast.error((e as Error).message ?? "Failed"); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <RotateCcw className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-bold">New Return / Refund</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
                <p className="text-muted-foreground">{foundSale.customer?.name ?? "Walk-in"} · ₹{formatNumber(foundSale.total)}</p>
              </div>

              {/* Items */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Select Items *</Label>
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
                        <span className="text-xs font-semibold shrink-0">₹{formatNumber(item.unitPrice * sel.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

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
                  <p className="text-sm font-medium">Restock Items</p>
                  <p className="text-xs text-muted-foreground">Add returned items back to inventory</p>
                </div>
                <Switch checked={restock} onCheckedChange={setRestock} />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t bg-muted/10 shrink-0">
          <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting || !foundSale} className="gap-1.5 min-w-[120px]">
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Create Return
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function ReturnsPage() {
  const [returns, setReturns]   = useState<ReturnRecord[]>([]);
  const [loading, setLoading]   = useState(true);
  const [addOpen, setAddOpen]   = useState(false);

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: ReturnRecord[] }>("/returns?limit=200");
      setReturns((res.data?.data ?? res.data ?? []) as ReturnRecord[]);
    } catch { toast.error("Failed to load returns"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchReturns(); }, [fetchReturns]);

  const updateStatus = async (id: string, status: string, label: string) => {
    try {
      await api.put(`/returns/${id}/status`, { status });
      toast.success(`Return ${label}`);
      fetchReturns();
    } catch { toast.error("Failed to update status"); }
  };

  const totalRefunded = returns
    .filter((r) => r.status === "REFUND_PROCESSED" || r.status === "COMPLETED")
    .reduce((s, r) => s + r.refundAmount, 0);

  const STATS = [
    { label: "Total Returns", value: returns.length,                                          color: "text-foreground",   bg: "bg-muted/40",       icon: RotateCcw },
    { label: "Pending",       value: returns.filter((r) => r.status === "INITIATED").length,  color: "text-amber-500",    bg: "bg-amber-500/10",   icon: Clock },
    { label: "Approved",      value: returns.filter((r) => r.status === "APPROVED").length,   color: "text-emerald-500",  bg: "bg-emerald-500/10", icon: CheckCircle },
    { label: "Total Refunded",value: `₹${formatNumber(totalRefunded)}`,                       color: "text-blue-500",     bg: "bg-blue-500/10",    icon: DollarSign },
  ];

  const columns: ColumnDef<ReturnRecord>[] = [
    {
      accessorKey: "returnNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Return ID" />,
      cell: ({ row }) => <span className="font-mono text-xs font-medium text-primary">{row.original.returnNumber}</span>,
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => <span className="text-sm font-bold">₹{formatNumber(row.original.totalAmount)}</span>,
    },
    {
      accessorKey: "createdAt",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
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
        const moreActions = [];
        if (s === "INITIATED") {
          moreActions.push({ text: "Approve",        function: () => updateStatus(row.original.id, "APPROVED",         "approved") });
          moreActions.push({ text: "Reject",         function: () => updateStatus(row.original.id, "REJECTED",         "rejected") });
        }
        if (s === "APPROVED") {
          moreActions.push({ text: "Process Refund", function: () => updateStatus(row.original.id, "REFUND_PROCESSED", "refund processed") });
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
          <h1 className="text-2xl font-bold">Returns & Refunds</h1>
          <p className="text-sm text-muted-foreground">Manage product returns and process refunds</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchReturns} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New Return
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
        searchableColumns={[
          { id: "returnNumber", title: "Return ID" },
        ]}
        filterableColumns={[{
          id: "status", title: "Status",
          options: [
            { label: "Initiated",        value: "INITIATED" },
            { label: "Approved",         value: "APPROVED" },
            { label: "Rejected",         value: "REJECTED" },
            { label: "Completed",        value: "COMPLETED" },
            { label: "Refund Processed", value: "REFUND_PROCESSED" },
          ],
        }]}
        isShowExportButtons={{ isShow: true, fileName: "returns-export" }}
      />

      {/* Modal */}
      {addOpen && <NewReturnModal onClose={() => setAddOpen(false)} onSaved={() => { fetchReturns(); setAddOpen(false); }} />}
    </div>
  );
}
