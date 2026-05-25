"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, ShoppingCart, DollarSign, RotateCcw, RefreshCw, Eye, X, Package, Loader2, User, CalendarDays, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────────
interface Sale {
  id: string; invoiceNumber: string; invoiceDate: string;
  status: string; total: number; paymentMethod: string;
  subtotal: number; taxAmount: number; discountAmount: number;
  amountPaid: number; changeDue: number;
  customer?: { id: string; name: string; phone: string } | null;
  cashier?: { firstName: string; lastName: string } | null;
  _count?: { items: number };
  items?: SaleItem[];
  payments?: { method: string; amount: number }[];
}
interface SaleItem {
  id: string; productName: string; variantName: string;
  sku: string; quantity: number; unitPrice: number; total: number;
}
interface Summary {
  totalSales: number; totalRevenue: number;
  totalTax: number; totalDiscount: number;
  byPaymentMethod: Record<string, number>;
}

// ── Sale detail modal ────────────────────────────────────────────────────
function SaleDetailModal({ saleId, onClose }: { saleId: string; onClose: () => void }) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Sale>(`/pos/sales/${saleId}`)
      .then((r) => setSale(r.data))
      .catch(() => toast.error("Failed to load sale"))
      .finally(() => setLoading(false));
  }, [saleId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="font-bold text-base">{sale?.invoiceNumber ?? "Loading…"}</h2>
            <p className="text-xs text-muted-foreground">{sale ? new Date(sale.invoiceDate).toLocaleString("en-LK") : ""}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : sale ? (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {/* Customer / Cashier */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl border bg-muted/10">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><User className="h-3 w-3" />Customer</div>
                <p className="text-sm font-semibold">{sale.customer?.name ?? "Walk-in"}</p>
                {sale.customer?.phone && <p className="text-xs text-muted-foreground">{sale.customer.phone}</p>}
              </div>
              <div className="p-3 rounded-xl border bg-muted/10">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1"><CreditCard className="h-3 w-3" />Payment</div>
                <p className="text-sm font-semibold capitalize">{sale.paymentMethod?.toLowerCase()}</p>
                {sale.cashier && <p className="text-xs text-muted-foreground">{sale.cashier.firstName} {sale.cashier.lastName}</p>}
              </div>
            </div>

            {/* Items */}
            {sale.items && sale.items.length > 0 && (
              <div className="rounded-xl border overflow-hidden">
                <div className="bg-muted/30 px-3 py-2 text-xs font-semibold text-muted-foreground">Items ({sale.items.length})</div>
                {sale.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between px-3 py-2.5 border-t text-sm">
                    <div>
                      <p className="font-medium text-xs">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">{item.variantName} · {item.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-semibold">LKR {formatNumber(item.total)}</p>
                      <p className="text-[10px] text-muted-foreground">x{item.quantity} @ LKR {formatNumber(item.unitPrice)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Totals */}
            <div className="rounded-xl border bg-muted/10 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>LKR {formatNumber(sale.subtotal)}</span></div>
              {sale.discountAmount > 0 && <div className="flex justify-between text-emerald-500"><span>Discount</span><span>-LKR {formatNumber(sale.discountAmount)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>LKR {formatNumber(sale.taxAmount)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1.5 mt-1.5">
                <span>Total</span><span className="text-primary">LKR {formatNumber(sale.total)}</span>
              </div>
              {sale.changeDue > 0 && <div className="flex justify-between text-emerald-500 text-xs"><span>Change</span><span>LKR {formatNumber(sale.changeDue)}</span></div>}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const today = new Date().toISOString().split("T")[0];
  const [sales, setSales]           = useState<Sale[]>([]);
  const [loading, setLoading]       = useState(true);
  const [summary, setSummary]       = useState<Summary | null>(null);
  const [dateFilter, setDateFilter] = useState(today);
  const [viewId, setViewId]         = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Sale[] }>(`/pos/sales?limit=200${dateFilter ? `&date=${dateFilter}` : ""}`);
      setSales((res.data?.data ?? res.data ?? []) as Sale[]);
    } catch { toast.error("Failed to load sales"); }
    finally { setLoading(false); }
  }, [dateFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get<Summary>(`/pos/summary?date=${dateFilter}`);
      setSummary(res.data);
    } catch { /* silent */ }
  }, [dateFilter]);

  useEffect(() => { fetchSales(); fetchSummary(); }, [fetchSales, fetchSummary]);

  const avgOrder = summary && summary.totalSales > 0
    ? Math.round(summary.totalRevenue / summary.totalSales)
    : 0;

  const STATS = [
    { label: "Total Revenue",   value: `LKR ${formatNumber(summary?.totalRevenue ?? 0)}`, icon: DollarSign,  color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Total Orders",    value: summary?.totalSales ?? 0,                       icon: ShoppingCart, color: "text-blue-500",    bg: "bg-blue-500/10" },
    { label: "Avg Order Value", value: `LKR ${formatNumber(avgOrder)}`,                   icon: TrendingUp,   color: "text-violet-500",  bg: "bg-violet-500/10" },
    { label: "Tax Collected",   value: `LKR ${formatNumber(summary?.totalTax ?? 0)}`,     icon: RotateCcw,    color: "text-amber-500",   bg: "bg-amber-500/10" },
  ];

  const columns: ColumnDef<Sale>[] = [
    {
      accessorKey: "invoiceNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
      cell: ({ row }) => <span className="font-mono text-xs font-medium text-primary">{row.original.invoiceNumber}</span>,
    },
    {
      id: "customer",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.customer?.name ?? "Walk-in"}</p>
          {row.original.customer?.phone && <p className="text-[10px] text-muted-foreground">{row.original.customer.phone}</p>}
        </div>
      ),
    },
    {
      id: "items",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <Package className="h-3 w-3" />{row.original._count?.items ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "paymentMethod",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Method" />,
      cell: ({ row }) => <span className="capitalize text-xs text-muted-foreground">{row.original.paymentMethod?.toLowerCase()}</span>,
    },
    {
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => <span className="text-sm font-semibold">LKR {formatNumber(row.original.total)}</span>,
    },
    {
      accessorKey: "invoiceDate",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Time" />,
      cell: ({ row }) => (
        <span className="text-xs text-muted-foreground">
          {new Date(row.original.invoiceDate).toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge variant={row.original.status === "COMPLETED" ? "success" : row.original.status === "REFUNDED" ? "danger" : "warning"}
          className="text-[10px] capitalize">{row.original.status?.toLowerCase()}</Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          showAction={{ action: () => setViewId(row.original.id) }}
          dropMoreActions={[
            { text: "View Details", function: () => setViewId(row.original.id) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold">Sales</h1>
          <p className="text-sm text-muted-foreground">View and manage all sales transactions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 border rounded-lg px-2.5 h-8">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
            <input type="date" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}
              className="text-xs bg-transparent border-0 outline-none text-foreground" />
          </div>
          <Button variant="outline" size="sm" onClick={() => { fetchSales(); fetchSummary(); }} className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
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

      {/* Payment breakdown */}
      {summary && Object.keys(summary.byPaymentMethod).length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {Object.entries(summary.byPaymentMethod).map(([method, amount]) => (
            <div key={method} className="flex items-center gap-2 px-3 py-1.5 rounded-full border bg-card text-xs">
              <span className="capitalize text-muted-foreground">{method.toLowerCase()}</span>
              <span className="font-bold">LKR {formatNumber(amount)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <ClientSideTable
        data={sales}
        columns={columns}
        pageCount={Math.ceil(sales.length / 10)}
        searchableColumns={[{ id: "invoiceNumber", title: "Invoice" }]}
        filterableColumns={[{
          id: "status", title: "Status",
          options: [
            { label: "Completed", value: "COMPLETED" },
            { label: "Refunded",  value: "REFUNDED" },
            { label: "Pending",   value: "PENDING" },
          ],
        }, {
          id: "paymentMethod", title: "Payment",
          options: [
            { label: "Cash",   value: "CASH" },
            { label: "Card",   value: "CARD" },
            { label: "UPI",    value: "UPI" },
            { label: "Wallet", value: "WALLET" },
          ],
        }]}
        isShowExportButtons={{ isShow: true, fileName: "sales-export" }}
      />

      {/* Sale detail modal */}
      {viewId && <SaleDetailModal saleId={viewId} onClose={() => setViewId(null)} />}
    </div>
  );
}
