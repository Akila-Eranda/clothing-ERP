"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp, ShoppingCart, DollarSign, Percent, RefreshCw, X, Package, Loader2,
  User, CalendarDays, CreditCard, Hash, ClipboardList,
  Banknote, Receipt, ArrowUpRight, type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { cn, formatNumber } from "@/lib/utils";
import { ColumnDef } from "@tanstack/react-table";
import { ClientSideTable, DataTableColumnHeader, TableActionsRow, OpenRecordButton } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useReceiptSettings } from "@/lib/use-receipt-settings";

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
function fmtTime(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" });
}
function isoDay(d: Date) {
  return d.toISOString().split("T")[0];
}
function shiftDay(base: string, delta: number) {
  const d = new Date(`${base}T12:00:00`);
  d.setDate(d.getDate() + delta);
  return isoDay(d);
}

function methodLabel(method?: string | null) {
  if (!method) return "—";
  const key = method.toUpperCase();
  const map: Record<string, string> = {
    CASH: "Cash",
    CARD: "Card",
    UPI: "UPI",
    WALLET: "Wallet",
    BANK_TRANSFER: "Bank transfer",
    QR: "QR",
  };
  return map[key] ?? method.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
}

function methodTone(method?: string | null) {
  const key = (method ?? "").toUpperCase();
  if (key === "CASH") return "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300";
  if (key === "CARD") return "bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-300";
  if (key === "BANK_TRANSFER") return "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300";
  if (key === "UPI" || key === "QR") return "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300";
  if (key === "WALLET") return "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300";
  return "bg-muted text-muted-foreground border-border";
}

function methodBarColor(method?: string | null) {
  const key = (method ?? "").toUpperCase();
  if (key === "CASH") return "bg-emerald-500";
  if (key === "CARD") return "bg-blue-500";
  if (key === "BANK_TRANSFER") return "bg-sky-500";
  if (key === "UPI" || key === "QR") return "bg-violet-500";
  if (key === "WALLET") return "bg-amber-500";
  return "bg-slate-400";
}

function paymentLabel(sale: Sale): { label: string; paid: boolean; className: string } {
  const remaining = Math.max(0, (sale.total ?? 0) - (sale.amountPaid ?? 0));
  const status = (sale.paymentStatus ?? "").toUpperCase();
  if (status === "PENDING" || remaining > 0.009) {
    return {
      label: remaining > 0 && (sale.amountPaid ?? 0) > 0 ? "Partial" : "Unpaid",
      paid: false,
      className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
    };
  }
  if (status === "REFUNDED" || sale.status === "REFUNDED") {
    return {
      label: "Refunded",
      paid: false,
      className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
    };
  }
  return {
    label: "Paid",
    paid: true,
    className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
  };
}

function statusBadgeClass(status: string) {
  const s = status?.toUpperCase();
  if (s === "COMPLETED") return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30";
  if (s === "REFUNDED") return "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30";
  if (s === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30";
  return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30";
}

// ── Sale detail modal ─────────────────────────────────────────────────────
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
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-3 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden">
        <div className="relative shrink-0 overflow-hidden border-b">
          <div
            className="absolute inset-0 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 80% 120% at 0% 0%, rgba(16,185,129,0.18), transparent 55%), radial-gradient(ellipse 60% 80% at 100% 0%, rgba(59,130,246,0.12), transparent 50%), linear-gradient(180deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
            }}
          />
          <div className="relative flex items-start justify-between gap-4 px-5 sm:px-6 py-5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-1.5">
                Sale document
              </p>
              <h2 className="font-bold text-xl sm:text-2xl tracking-tight font-mono">
                {loading ? "…" : sale?.invoiceNumber}
              </h2>
              <p className="text-sm text-muted-foreground mt-1 truncate">
                {loading ? "Loading…" : (
                  <>
                    {sale?.customer?.name ?? shopLabel}
                    <span className="mx-1.5 text-border">·</span>
                    {fmtDateTime(sale?.invoiceDate)}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {sale && pay && (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${pay.className}`}>
                  {pay.label}
                </span>
              )}
              {sale && (
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold capitalize ${statusBadgeClass(sale.status)}`}>
                  {sale.status?.toLowerCase()}
                </span>
              )}
              <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : !sale ? (
          <div className="flex justify-center py-16 text-sm text-muted-foreground">Sale not found</div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
              <div className="flex flex-col lg:flex-row gap-5">
                <div className="flex-1 min-w-0 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <MetaCard icon={User} label="Customer" value={customerName} />
                    <MetaCard icon={CreditCard} label="Method" value={methodLabel(sale.paymentMethod)} />
                    <MetaCard
                      icon={User}
                      label="Cashier"
                      value={sale.cashier ? `${sale.cashier.firstName} ${sale.cashier.lastName}` : "—"}
                    />
                    <MetaCard icon={Package} label="Line items" value={String(items.length)} />
                  </div>

                  <section className="rounded-2xl border overflow-hidden bg-card/40">
                    <header className="px-4 py-3 border-b flex items-center justify-between bg-muted/30">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Items</h3>
                      <span className="text-[11px] tabular-nums text-muted-foreground">{items.length}</span>
                    </header>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-2.5 text-left font-semibold w-10">#</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Product</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Qty</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Unit</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {items.length === 0 ? (
                            <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground text-xs">No items</td></tr>
                          ) : items.map((item, i) => (
                            <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                              <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-4 py-3">
                                <p className="font-semibold text-sm leading-tight">{item.productName}</p>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {[item.sku, item.variantName].filter(Boolean).join(" · ")}
                                </p>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums">{item.quantity}</td>
                              <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap text-muted-foreground">{fmtMoney(item.unitPrice)}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{fmtMoney(item.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="rounded-2xl border overflow-hidden bg-card/40">
                    <header className="px-4 py-3 border-b flex items-center justify-between gap-2 bg-emerald-600/90 text-white">
                      <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                        <ClipboardList className="h-3.5 w-3.5" />
                        Payments
                      </span>
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-bold bg-white/15 border border-white/25">
                        {pay?.label?.toUpperCase() ?? "—"}
                      </span>
                    </header>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/20 text-[11px] uppercase tracking-wide text-muted-foreground">
                            <th className="px-4 py-2.5 text-left font-semibold w-10">#</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Method</th>
                            <th className="px-4 py-2.5 text-left font-semibold">Reference</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.map((p, i) => (
                            <tr key={p.id ?? `${p.method}-${i}`} className="border-b last:border-0">
                              <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="px-4 py-3 font-medium">{methodLabel(p.method)}</td>
                              <td className="px-4 py-3 text-muted-foreground text-xs">{p.reference || "—"}</td>
                              <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{fmtMoney(p.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {sale.notes?.trim() ? (
                    <div className="rounded-2xl border px-4 py-3.5 bg-muted/20">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Note</p>
                      <p className="text-sm text-foreground/85 leading-relaxed">{sale.notes.trim()}</p>
                    </div>
                  ) : null}
                </div>

                <aside className="w-full lg:w-72 shrink-0">
                  <div className="rounded-2xl border p-4 space-y-3 sticky top-0 bg-gradient-to-b from-card to-muted/20">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Settlement</p>
                      <Hash className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <p className="text-3xl font-bold tracking-tight tabular-nums leading-none">{fmtMoney(sale.total)}</p>
                    <p className="text-xs text-muted-foreground">Invoice total</p>
                    <div className="border-t pt-3 space-y-2.5">
                      <TotRow label="Subtotal" value={fmtMoney(sale.subtotal)} />
                      {sale.discountAmount > 0 && <TotRow label="Discount" value={`−${fmtMoney(sale.discountAmount)}`} muted />}
                      <TotRow label="Tax" value={fmtMoney(sale.taxAmount)} />
                      <TotRow label="Paid" value={fmtMoney(sale.amountPaid || 0)} />
                      <TotRow label="Remaining" value={fmtMoney(remaining)} accent={!pay?.paid && remaining > 0} />
                      {sale.changeDue > 0 && <TotRow label="Change" value={fmtMoney(sale.changeDue)} muted />}
                    </div>
                  </div>
                </aside>
              </div>
            </div>

            <div className={modalBarFooterClass}>
              {sale.status !== "REFUNDED" && (
                <Button
                  variant="outline"
                  className="border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-500/30 dark:text-blue-300 dark:hover:bg-blue-500/10"
                  onClick={() => onReturn(sale.invoiceNumber)}
                >
                  Process return
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

function MetaCard({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card/50 px-3.5 py-3 flex items-start gap-3 min-w-0">
      <span className="h-8 w-8 rounded-lg bg-muted/80 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-none">{label}</p>
        <p className="text-sm font-semibold mt-1 truncate">{value}</p>
      </div>
    </div>
  );
}

function TotRow({
  label,
  value,
  muted,
  accent,
}: {
  label: string;
  value: string;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className={cn(
      "flex items-center justify-between gap-3 text-sm",
      muted && "text-emerald-600 dark:text-emerald-400",
      accent && "text-rose-600 dark:text-rose-400 font-semibold",
    )}>
      <span className={accent ? "" : "text-muted-foreground"}>{label}</span>
      <span className="tabular-nums whitespace-nowrap font-medium">{value}</span>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────
export default function SalesPage() {
  const router = useRouter();
  const today = isoDay(new Date());
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dateFilter, setDateFilter] = useState(today);
  const [viewId, setViewId] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ data: Sale[] }>(`/pos/sales?limit=200${dateFilter ? `&date=${dateFilter}` : ""}`);
      setSales((res.data?.data ?? res.data ?? []) as Sale[]);
    } catch {
      toast.error("Failed to load sales");
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get<Summary>(`/pos/summary?date=${dateFilter}`);
      setSummary(res.data);
    } catch { /* silent */ }
  }, [dateFilter]);

  useEffect(() => { void fetchSales(); void fetchSummary(); }, [fetchSales, fetchSummary]);

  const avgOrder = summary && summary.totalSales > 0
    ? Math.round(summary.totalRevenue / summary.totalSales)
    : 0;

  const dateLabel = useMemo(() => {
    if (dateFilter === today) return "Today";
    if (dateFilter === shiftDay(today, -1)) return "Yesterday";
    return fmtDate(dateFilter);
  }, [dateFilter, today]);

  const paymentMix = useMemo(() => {
    const entries = Object.entries(summary?.byPaymentMethod ?? {});
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    return entries
      .map(([method, amount]) => ({
        method,
        amount,
        pct: Math.round((amount / total) * 100),
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [summary]);

  const paymentMethodsInData = useMemo(() => {
    const fromSummary = Object.keys(summary?.byPaymentMethod ?? {});
    const fromRows = sales.map((s) => s.paymentMethod).filter(Boolean);
    return Array.from(new Set([...fromSummary, ...fromRows])).sort();
  }, [summary, sales]);

  const columns: ColumnDef<Sale>[] = [
    {
      id: "invoice",
      accessorFn: (s) =>
        `${s.invoiceNumber} ${s.customer?.name ?? "Walk-in"} ${s.customer?.phone ?? ""}`.trim(),
      header: ({ column }) => <DataTableColumnHeader column={column} title="Invoice" />,
      cell: ({ row }) => (
        <div className="min-w-0" data-cell-wrap>
          <OpenRecordButton
            onClick={() => setViewId(row.original.id)}
            className="font-mono text-xs"
            title="View sale"
          >
            {row.original.invoiceNumber}
          </OpenRecordButton>
          <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
            {fmtTime(row.original.invoiceDate)}
          </p>
        </div>
      ),
    },
    {
      id: "customer",
      accessorFn: (s) => s.customer?.name ?? "Walk-in",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Customer" />,
      cell: ({ row }) => (
        <div className="min-w-0" data-cell-wrap>
          <p className="text-sm font-medium truncate">{row.original.customer?.name ?? "Walk-in"}</p>
          {row.original.customer?.phone ? (
            <p className="text-[10px] text-muted-foreground font-mono">{row.original.customer.phone}</p>
          ) : (
            <p className="text-[10px] text-muted-foreground">No phone</p>
          )}
        </div>
      ),
    },
    {
      id: "items",
      accessorFn: (s) => s._count?.items ?? 0,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Items" />,
      cell: ({ row }) => (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium tabular-nums">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          {row.original._count?.items ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "paymentMethod",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Method" />,
      cell: ({ row }) => (
        <span className={cn(
          "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
          methodTone(row.original.paymentMethod),
        )}>
          {methodLabel(row.original.paymentMethod)}
        </span>
      ),
    },
    {
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
      cell: ({ row }) => (
        <span className="text-sm font-semibold tabular-nums">{fmtMoney(row.original.total)}</span>
      ),
    },
    {
      id: "payStatus",
      accessorFn: (s) => paymentLabel(s).label,
      header: ({ column }) => <DataTableColumnHeader column={column} title="Payment" />,
      cell: ({ row }) => {
        const pay = paymentLabel(row.original);
        return (
          <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold", pay.className)}>
            {pay.label}
          </span>
        );
      },
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
      cell: ({ row }) => (
        <Badge
          variant={row.original.status === "COMPLETED" ? "success" : row.original.status === "REFUNDED" ? "danger" : "warning"}
          className="h-6 rounded-full px-2.5 text-[11px] font-semibold inline-flex items-center capitalize"
        >
          {row.original.status?.toLowerCase()}
        </Badge>
      ),
    },
    {
      id: "actions",
      enableSorting: false,
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

  const datePresets = [
    { key: "today", label: "Today", value: today },
    { key: "yesterday", label: "Yesterday", value: shiftDay(today, -1) },
  ] as const;

  return (
    <div className="page-shell gap-5">
      {/* Hero day board */}
      <section className="relative overflow-hidden rounded-2xl border bg-card">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 90% at 0% 0%, rgba(16,185,129,0.16), transparent 50%), radial-gradient(ellipse 50% 70% at 100% 10%, rgba(59,130,246,0.10), transparent 45%), linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--background)) 100%)",
          }}
        />
        <div className="relative p-5 sm:p-6 flex flex-col gap-5">
          <div className="flex items-start justify-between flex-wrap gap-4">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground mb-2">
                <Receipt className="h-3.5 w-3.5" />
                Sales ledger
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-none">Sales</h1>
              <p className="text-sm text-muted-foreground mt-2">
                {dateLabel}
                {summary ? (
                  <>
                    <span className="mx-1.5 text-border">·</span>
                    Tax {fmtMoney(summary.totalTax)}
                  </>
                ) : null}
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <div className="inline-flex items-center rounded-xl border bg-background/80 backdrop-blur-sm p-0.5">
                {datePresets.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setDateFilter(p.value)}
                    className={cn(
                      "h-9 px-3.5 rounded-[10px] text-xs font-semibold transition-colors",
                      dateFilter === p.value
                        ? "bg-emerald-600 text-white shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border bg-background/80 text-sm cursor-pointer hover:bg-muted/40 transition-colors">
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
                onClick={() => { void fetchSales(); void fetchSummary(); }}
                className="gap-1.5 bg-background/80"
              >
                <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-5 rounded-2xl border bg-background/70 backdrop-blur-sm p-5 flex flex-col justify-between min-h-[140px]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Revenue</p>
                <span className="h-8 w-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 inline-flex items-center justify-center">
                  <DollarSign className="h-4 w-4" />
                </span>
              </div>
              <div>
                <p className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums leading-none mt-3">
                  {fmtMoney(summary?.totalRevenue ?? 0)}
                </p>
                <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  {summary?.totalSales ?? 0} completed order{(summary?.totalSales ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-3 gap-3">
              {[
                { label: "Orders", value: String(summary?.totalSales ?? 0), icon: ShoppingCart, tone: "text-blue-600 dark:text-blue-400 bg-blue-500/12" },
                { label: "Avg order", value: fmtMoney(avgOrder), icon: TrendingUp, tone: "text-sky-600 dark:text-sky-400 bg-sky-500/12" },
                { label: "Discounts", value: fmtMoney(summary?.totalDiscount ?? 0), icon: Percent, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/12" },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl border bg-background/70 backdrop-blur-sm p-4 flex flex-col justify-between min-h-[140px]">
                  <span className={cn("h-8 w-8 rounded-xl inline-flex items-center justify-center", s.tone)}>
                    <s.icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-lg sm:text-xl font-bold tabular-nums leading-none truncate">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-1.5">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {paymentMix.length > 0 && (
            <div className="rounded-2xl border bg-background/60 backdrop-blur-sm p-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground inline-flex items-center gap-1.5">
                  <Banknote className="h-3.5 w-3.5" />
                  Payment mix
                </p>
              </div>
              <div className="h-2.5 rounded-full overflow-hidden flex bg-muted/60">
                {paymentMix.map((m) => (
                  <div
                    key={m.method}
                    className={cn("h-full first:rounded-l-full last:rounded-r-full", methodBarColor(m.method))}
                    style={{ width: `${Math.max(m.pct, 2)}%` }}
                    title={`${methodLabel(m.method)} ${m.pct}%`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                {paymentMix.map((m) => (
                  <div key={m.method} className="inline-flex items-center gap-2 text-xs">
                    <span className={cn("h-2 w-2 rounded-full", methodBarColor(m.method))} />
                    <span className="text-muted-foreground">{methodLabel(m.method)}</span>
                    <span className="font-semibold tabular-nums">{fmtMoney(m.amount)}</span>
                    <span className="text-muted-foreground tabular-nums">{m.pct}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Transactions */}
      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Transactions</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              {loading ? "Loading…" : `${sales.length} sale${sales.length === 1 ? "" : "s"} on ${dateLabel.toLowerCase()}`}
            </p>
          </div>
        </div>

        <ClientSideTable
          data={sales}
          columns={columns}
          searchableColumns={[{ id: "invoice", title: "Invoice / customer" }]}
          filterableColumns={[
            {
              id: "status",
              title: "Status",
              options: [
                { label: "Completed", value: "COMPLETED" },
                { label: "Refunded", value: "REFUNDED" },
                { label: "Pending", value: "PENDING" },
              ],
            },
            {
              id: "paymentMethod",
              title: "Method",
              options: (paymentMethodsInData.length
                ? paymentMethodsInData
                : ["CASH", "CARD", "BANK_TRANSFER", "UPI", "WALLET", "QR"]
              ).map((m) => ({ label: methodLabel(m), value: m })),
            },
            {
              id: "payStatus",
              title: "Payment",
              options: [
                { label: "Paid", value: "Paid" },
                { label: "Partial", value: "Partial" },
                { label: "Unpaid", value: "Unpaid" },
                { label: "Refunded", value: "Refunded" },
              ],
            },
          ]}
          isShowExportButtons={{ isShow: true, fileName: `sales-${dateFilter}` }}
        />
      </section>

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
