"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, ShoppingCart, DollarSign, RotateCcw, RefreshCw, X, Package, Loader2,
  User, CalendarDays, CreditCard, Hash, CheckCircle2, Wallet, ClipboardList, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { formatNumber } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { TableActionsRow } from "@/components/table/table-actions-row";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useReceiptSettings } from "@/lib/use-receipt-settings";
import { OpenRecordButton } from "@/components/table/open-record-button";

// ── Types ─────────────────────────────────────────────────────────────────
interface Sale {
  id: string; invoiceNumber: string; invoiceDate: string;
  status: string; total: number; paymentMethod: string;
  paymentStatus?: string;
  subtotal: number; taxAmount: number; discountAmount: number;
  amountPaid: number; changeDue: number;
  notes?: string | null;
  customer?: { id: string; name: string; phone: string } | null;
  cashier?: { firstName: string; lastName: string } | null;
  _count?: { items: number };
  items?: SaleItem[];
  payments?: { id?: string; method: string; amount: number; reference?: string | null; processedAt?: string }[];
}
interface SaleItem {
  id: string; productName: string; variantName: string;
  sku: string; quantity: number; unitPrice: number; total: number;
  discount?: number; taxAmount?: number;
}
interface Summary {
  totalSales: number; totalRevenue: number;
  totalTax: number; totalDiscount: number;
  byPaymentMethod: Record<string, number>;
}

function fmtMoney(n: number) {
  return `LKR ${formatNumber(n)}`;
}
function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-LK", { year: "numeric", month: "short", day: "2-digit" });
}
function fmtDateTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-LK", {
    year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

function paymentLabel(sale: Sale): { label: string; paid: boolean; className: string } {
  const remaining = Math.max(0, (sale.total ?? 0) - (sale.amountPaid ?? 0));
  const status = (sale.paymentStatus ?? "").toUpperCase();
  if (status === "PENDING" || remaining > 0.009) {
    return { label: remaining > 0 && (sale.amountPaid ?? 0) > 0 ? "Partial" : "Unpaid", paid: false, className: "bg-rose-50 text-rose-700 border-rose-200" };
  }
  if (status === "REFUNDED" || sale.status === "REFUNDED") {
    return { label: "Refunded", paid: false, className: "bg-rose-50 text-rose-700 border-rose-200" };
  }
  return { label: "Paid", paid: true, className: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

function statusBadgeClass(status: string) {
  const s = status?.toUpperCase();
  if (s === "COMPLETED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (s === "REFUNDED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (s === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-slate-50 text-slate-700 border-slate-200";
}

// ── Sale detail modal (PO-details layout) ─────────────────────────────────
function SaleDetailModal({
  saleId,
  onClose,
  onReturn,
}: {
  saleId: string;
  onClose: () => void;
  onReturn: (invoiceNumber: string) => void;
}) {
  const [sale, setSale] = useState<Sale | null>(null);
  const [loading, setLoading] = useState(true);
  const { settings: receiptSettings } = useReceiptSettings();

  useEffect(() => {
    setLoading(true);
    api.get<Sale>(`/pos/sales/${saleId}`)
      .then((r) => setSale(r.data))
      .catch(() => toast.error("Failed to load sale"))
      .finally(() => setLoading(false));
  }, [saleId]);

  const items = sale?.items ?? [];
  const payments = sale?.payments?.length
    ? sale.payments
    : sale
      ? [{ method: sale.paymentMethod, amount: sale.amountPaid || sale.total }]
      : [];
  const pay = sale ? paymentLabel(sale) : null;
  const remaining = sale ? Math.max(0, sale.total - (sale.amountPaid || 0)) : 0;
  const customerName = sale?.customer?.name ?? "Walk-in Customer";
  const shopLabel = receiptSettings.shopName || "Sales";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 py-4 border-b shrink-0">
          <div className="min-w-0">
            <h2 className="font-bold text-lg sm:text-xl tracking-tight">
              Sales Details
              {sale ? (
                <span className="font-semibold text-foreground/80">
                  {" "}( Invoice : {sale.invoiceNumber} )
                </span>
              ) : null}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">
              {loading ? "Loading…" : sale?.customer?.name ?? shopLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {sale && pay && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pay.className}`}>
                {pay.label}
              </span>
            )}
            {sale && (
              <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase ${statusBadgeClass(sale.status)}`}>
                {sale.status}
              </span>
            )}
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !sale ? (
          <div className="flex justify-center py-16 text-sm text-muted-foreground">Sale not found</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-4">
              <div className="flex flex-col lg:flex-row gap-4 lg:gap-5">
                {/* Main column */}
                <div className="flex-1 min-w-0 space-y-4">
                  {/* Metadata */}
                  <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5 text-sm">
                    <MetaRow icon={CalendarDays} label="Invoice date" value={fmtDateTime(sale.invoiceDate)} />
                    <MetaRow icon={User} label="Customer" value={customerName} />
                    <MetaRow icon={Hash} label="Invoice number" value={sale.invoiceNumber} mono />
                    <MetaRow icon={CreditCard} label="Payment method" value={(sale.paymentMethod || "—").toLowerCase()} capitalize />
                    <MetaRow icon={CheckCircle2} label="Status" value={sale.status} />
                    <MetaRow
                      icon={User}
                      label="Cashier"
                      value={sale.cashier ? `${sale.cashier.firstName} ${sale.cashier.lastName}` : "—"}
                    />
                    <MetaRow icon={Wallet} label="Payment status" value={pay?.label ?? "—"} />
                    <MetaRow icon={Package} label="Items" value={String(items.length)} />
                  </div>

                  {/* Items table */}
                  <div className="rounded-xl border overflow-hidden">
                    <div className="bg-blue-600 text-white px-3.5 py-2 text-xs font-bold tracking-wide uppercase flex items-center justify-between">
                      <span>Items ({items.length})</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 text-left font-semibold w-10">#</th>
                            <th className="px-3 py-2 text-left font-semibold">Product</th>
                            <th className="px-3 py-2 text-right font-semibold">Qty</th>
                            <th className="px-3 py-2 text-right font-semibold">Unit price</th>
                            <th className="px-3 py-2 text-right font-semibold">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.length === 0 ? (
                            <tr><td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-xs">No items</td></tr>
                          ) : items.map((item, i) => (
                            <tr key={item.id} className="border-b last:border-0">
                              <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-3 py-2.5">
                                <p className="font-semibold text-sm leading-tight">{item.productName}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {[item.sku, item.variantName].filter(Boolean).join(" · ")}
                                </p>
                              </td>
                              <td className="px-3 py-2.5 text-right tabular-nums">{item.quantity}</td>
                              <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtMoney(item.unitPrice)}</td>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">{fmtMoney(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Payments section (GRN analog) */}
                  <div className="rounded-xl border overflow-hidden">
                    <div className="bg-emerald-600 text-white px-3.5 py-2 text-xs font-bold tracking-wide uppercase flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5">
                        <ClipboardList className="h-3.5 w-3.5" />
                        Payments
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold border border-white/30 ${
                        pay?.paid ? "bg-white/20" : "bg-rose-500/80"
                      }`}>
                        {pay?.label?.toUpperCase() ?? "—"}
                      </span>
                    </div>
                    <div className="grid sm:grid-cols-3 gap-3 px-3.5 py-2.5 border-b bg-muted/20 text-xs">
                      <div>
                        <p className="text-muted-foreground">Invoice</p>
                        <p className="font-mono font-semibold mt-0.5">{sale.invoiceNumber}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid date</p>
                        <p className="font-semibold mt-0.5">{fmtDate(sale.invoiceDate)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Paid / Total</p>
                        <p className="font-semibold mt-0.5">{fmtMoney(sale.amountPaid || 0)} / {fmtMoney(sale.total)}</p>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/30 text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-3 py-2 text-left font-semibold w-10">#</th>
                            <th className="px-3 py-2 text-left font-semibold">Method</th>
                            <th className="px-3 py-2 text-left font-semibold">Reference</th>
                            <th className="px-3 py-2 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p, i) => (
                            <tr key={p.id ?? `${p.method}-${i}`} className="border-b last:border-0">
                              <td className="px-3 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-3 py-2.5 capitalize font-medium">{(p.method || "—").toLowerCase()}</td>
                              <td className="px-3 py-2.5 text-muted-foreground text-xs">{p.reference || "—"}</td>
                              <td className="px-3 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap">{fmtMoney(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Note */}
                  <div className="rounded-xl border px-3.5 py-3">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Sale note:</p>
                    <p className="text-sm text-foreground/80 min-h-[1.25rem]">{sale.notes?.trim() || "—"}</p>
                  </div>
                </div>

                {/* Right sidebar totals */}
                <div className="w-full lg:w-64 shrink-0 space-y-3">
                  <div className="rounded-xl border p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Quick totals</p>
                      <span className="text-[10px] font-semibold text-muted-foreground">LKR</span>
                    </div>
                    <TotRow label="Subtotal" value={fmtMoney(sale.subtotal)} />
                    {sale.discountAmount > 0 && <TotRow label="Discount" value={`-${fmtMoney(sale.discountAmount)}`} muted />}
                    <TotRow label="Tax" value={fmtMoney(sale.taxAmount)} />
                    <div className="border-t pt-2 space-y-2">
                      <TotRow label="Total payable" value={fmtMoney(sale.total)} bold />
                      <TotRow label="Total paid" value={fmtMoney(sale.amountPaid || 0)} />
                      <TotRow label="Total remaining" value={fmtMoney(remaining)} accent={!pay?.paid} />
                      {sale.changeDue > 0 && <TotRow label="Change due" value={fmtMoney(sale.changeDue)} muted />}
                    </div>
                  </div>

                  <div className="rounded-xl border p-3.5 space-y-2.5 text-sm">
                    <TotRow label="Subtotal" value={fmtMoney(sale.subtotal)} />
                    <TotRow label="Tax" value={fmtMoney(sale.taxAmount)} />
                    <TotRow label="Total payable" value={fmtMoney(sale.total)} bold />
                    <TotRow label="Total paid" value={fmtMoney(sale.amountPaid || 0)} />
                    <TotRow label="Total remaining" value={fmtMoney(remaining)} />
                    <div className="border-t pt-2 text-xs text-muted-foreground">
                      Invoice <span className="font-mono font-semibold text-foreground">{sale.invoiceNumber}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className={modalBarFooterClass}>
              {sale.status !== "REFUNDED" && (
                <Button
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50"
                  onClick={() => onReturn(sale.invoiceNumber)}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Process return
                </Button>
              )}
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MetaRow({
  icon: Icon,
  label,
  value,
  mono,
  capitalize,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  mono?: boolean;
  capitalize?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-none">{label}</p>
        <p className={`text-sm font-medium mt-0.5 truncate ${mono ? "font-mono text-xs" : ""} ${capitalize ? "capitalize" : ""}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function TotRow({
  label,
  value,
  bold,
  muted,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 text-sm ${bold ? "font-bold" : ""} ${muted ? "text-emerald-600" : ""} ${accent ? "text-rose-600 font-semibold" : ""}`}>
      <span className={bold || accent ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums whitespace-nowrap">{value}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const router = useRouter();
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
    { label: "Total Revenue",   value: `LKR ${formatNumber(summary?.totalRevenue ?? 0)}`, icon: DollarSign,  color: "text-emerald-600", bg: "bg-emerald-500/15", tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent" },
    { label: "Total Orders",    value: summary?.totalSales ?? 0,                       icon: ShoppingCart, color: "text-blue-600",    bg: "bg-blue-500/15", tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent" },
    { label: "Avg Order Value", value: `LKR ${formatNumber(avgOrder)}`,                   icon: TrendingUp,   color: "text-violet-600",  bg: "bg-violet-500/15", tint: "border-violet-200/70 bg-gradient-to-br from-violet-50 to-white dark:border-violet-500/20 dark:from-violet-500/10 dark:to-transparent" },
    { label: "Tax Collected",   value: `LKR ${formatNumber(summary?.totalTax ?? 0)}`,     icon: RotateCcw,    color: "text-amber-600",   bg: "bg-amber-500/15", tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent" },
  ];

  const columns: ColumnDef<Sale>[] = [
    {
      accessorKey: "invoiceNumber",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
      cell: ({ row }) => (
        <OpenRecordButton
          onClick={() => setViewId(row.original.id)}
          className="font-mono text-xs"
          title="View sale"
        >
          {row.original.invoiceNumber}
        </OpenRecordButton>
      ),
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
          className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center capitalize">{row.original.status?.toLowerCase()}</Badge>
      ),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <TableActionsRow
          showAction={{ action: () => setViewId(row.original.id), tooltip: "View Details" }}
          dropMoreActions={[
            ...(row.original.status !== "REFUNDED"
              ? [{ text: "Process Return / Exchange", function: () => router.push(`/returns?invoice=${row.original.invoiceNumber}`) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="page-shell">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Sales</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">View and manage all sales transactions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <label className="inline-flex items-center gap-2 h-10 px-3 rounded-[12px] border bg-background text-sm cursor-pointer hover:bg-muted/40 transition-colors">
            <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-full bg-transparent border-0 outline-none text-sm text-foreground leading-none [color-scheme:dark] dark:[color-scheme:dark]"
            />
          </label>
          <Button
            variant="outline"
            onClick={() => { fetchSales(); fetchSummary(); }}
            className="h-10 px-4 rounded-[12px] gap-2 text-sm font-medium shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
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
      <div className="overflow-y-auto" style={{ height: "calc(100vh - 240px)" }}>
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
      </div>

      {/* Sale detail modal */}
      {viewId && (
        <SaleDetailModal
          saleId={viewId}
          onClose={() => setViewId(null)}
          onReturn={(invoiceNumber) => {
            setViewId(null);
            router.push(`/returns?invoice=${invoiceNumber}`);
          }}
        />
      )}
    </div>
  );
}
