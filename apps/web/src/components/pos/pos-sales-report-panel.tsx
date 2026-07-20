"use client";

import * as React from "react";
import { BarChart2, Loader2, RefreshCw, Receipt } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { formatNumber } from "@/lib/utils";

type Summary = {
  date: string;
  totalSales: number;
  totalRevenue: number;
  totalTax: number;
  totalDiscount: number;
  totalItems: number;
  byPaymentMethod: Record<string, number>;
  openingBalance?: number;
  income?: number;
  expenses?: number;
  cashExpenses?: number;
  supplierPayments?: number;
  cashSupplierPayments?: number;
  netIncome?: number;
  shift?: {
    id: string;
    scoped: boolean;
    status: string;
    openingTime: string;
    closingTime: string | null;
    shiftOpen: boolean;
  } | null;
  cash?: {
    openingFloat: number;
    cashSalesNet: number;
    cashExpenses: number;
    cashSupplierPayments: number;
    cashOut: number;
    refunds: number;
    expectedInDrawer: number;
  };
};

type ActiveShift = {
  id?: string;
  status?: string;
  openingCash?: number;
  openingTime?: string;
  summary?: {
    expectedCash: number;
    cashSales: number;
    cashExpenses: number;
    cashRefunds: number;
    openingCash?: number;
  };
};

type SaleRow = {
  id: string;
  invoiceNumber: string;
  total: number;
  invoiceDate: string;
  status: string;
  paymentMethod?: string;
  customer?: { firstName?: string; lastName?: string | null; phone?: string } | null;
  payments?: { method: string }[];
  _count?: { items: number };
};

export function PosSalesReportPanel({
  onBack,
  viewAll = false,
  onOpenSale,
}: {
  onBack: () => void;
  viewAll?: boolean;
  onOpenSale?: (saleId: string) => void;
}) {
  const { profile } = useShopWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = React.useState(today);
  const [loading, setLoading] = React.useState(true);
  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [sales, setSales] = React.useState<SaleRow[]>([]);
  const [activeShift, setActiveShift] = React.useState<ActiveShift | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [sumR, salesR, activeR] = await Promise.all([
        api.get<Summary>(`/pos/summary?date=${encodeURIComponent(date)}`),
        api.get<{ data?: SaleRow[] }>(`/pos/sales?limit=100&date=${encodeURIComponent(date)}`),
        api.get<ActiveShift | null>("/cash/active").catch(() => ({ data: null })),
      ]);
      setSummary(sumR.data ?? null);
      setSales(salesR.data?.data ?? []);
      setActiveShift(activeR.data ?? null);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load sales report");
    } finally {
      setLoading(false);
    }
  }, [date]);

  React.useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(); }, 20000);
    return () => clearInterval(timer);
  }, [load]);

  const income = summary?.income ?? summary?.totalRevenue ?? 0;
  const expenses = summary?.expenses ?? 0;
  const supplierPayments = summary?.supplierPayments ?? 0;
  const openingBalance = summary?.openingBalance ?? summary?.cash?.openingFloat ?? activeShift?.openingCash ?? 0;
  const netIncome = summary?.netIncome ?? income - expenses;
  const liveDrawer =
    activeShift?.status === "OPEN"
      ? (activeShift.summary?.expectedCash ?? summary?.cash?.expectedInDrawer ?? 0)
      : (summary?.cash?.expectedInDrawer ?? 0);
  const shiftLabel = summary?.shift?.scoped
    ? summary.shift.shiftOpen
      ? "Current shift (open)"
      : "Closed shift"
    : "No shift — calendar day";
  const shiftTime =
    summary?.shift?.openingTime
      ? `${new Date(summary.shift.openingTime).toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })} → ${
          summary.shift.closingTime
            ? new Date(summary.shift.closingTime).toLocaleTimeString("en-LK", { hour: "2-digit", minute: "2-digit" })
            : "now"
        }`
      : null;
  const avgBill = summary && summary.totalSales > 0
    ? income / summary.totalSales
    : 0;

  const payMethods = Object.entries(summary?.byPaymentMethod ?? {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-4 w-4" style={{ color: "#4f6ef7" }} />
          <h2 className="text-white font-bold text-base">
            {viewAll ? "Sales Report" : "My Sales Report"}
          </h2>
          <Badge className="text-[10px]" style={{ background: "rgba(79,110,247,0.15)", color: "var(--pos-violet-soft)" }}>
            {profile.label}
          </Badge>
          {!viewAll && (
            <Badge className="text-[10px]" style={{ background: "var(--pos-warn-bg)", color: "var(--pos-warn-soft)" }}>
              Own sales only
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-8 w-[140px] rounded-lg border-0 text-white text-xs"
            style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            className="h-8 gap-1.5"
            style={{ borderColor: "var(--pos-border)", color: "var(--pos-muted)", background: "transparent" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <button
            onClick={onBack}
            className="text-xs font-semibold px-3 h-8 rounded-lg"
            style={{ color: "var(--pos-muted)" }}
          >
            ← Back
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin" style={{ color: "#4f6ef7" }} />
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
          {/* Live drawer — shift scoped */}
          <div
            className="rounded-xl border p-4"
            style={{ background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.35)" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--pos-success-soft)" }}>
                  Cash in counter · {shiftLabel}
                </p>
                {shiftTime && (
                  <p className="text-[11px] mt-0.5" style={{ color: "var(--pos-muted)" }}>{shiftTime}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-2xl font-black tabular-nums" style={{ color: "#10b981" }}>
                  LKR {formatNumber(liveDrawer)}
                </p>
                <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>Expected in drawer</p>
              </div>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mt-4 pt-3 border-t" style={{ borderColor: "rgba(16,185,129,0.2)" }}>
              {[
                { label: "Opening", value: openingBalance, color: "var(--pos-success-soft)" },
                { label: "Cash sales", value: summary?.cash?.cashSalesNet ?? 0, color: "var(--pos-success-soft)" },
                { label: "Cash out", value: summary?.cash?.cashOut ?? 0, color: "#f87171" },
                { label: "Shift income", value: income, color: "#4f6ef7" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>{s.label}</p>
                  <p className="text-sm font-bold tabular-nums mt-0.5" style={{ color: s.color }}>
                    LKR {formatNumber(s.value)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Income vs expenses vs supplier (separate) — this shift only */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-xl border p-4" style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--pos-accent-soft)" }}>Shift income</p>
              <p className="text-xl font-bold tabular-nums mt-1" style={{ color: "#4f6ef7" }}>
                LKR {formatNumber(income)}
              </p>
              <p className="text-[10px] mt-1" style={{ color: "var(--pos-muted)" }}>
                {summary?.totalSales ?? 0} bills · {summary?.totalItems ?? 0} items
              </p>
            </div>
            <div className="rounded-xl border p-4" style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--pos-warn-soft)" }}>Shift expenses</p>
              <p className="text-xl font-bold tabular-nums mt-1" style={{ color: "var(--pos-warn)" }}>
                LKR {formatNumber(expenses)}
              </p>
              <p className="text-[10px] mt-1" style={{ color: "var(--pos-muted)" }}>
                Shop OpEx (cash {formatNumber(summary?.cashExpenses ?? 0)})
              </p>
            </div>
            <div className="rounded-xl border p-4" style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}>
              <p className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "#fca5a5" }}>Supplier payments</p>
              <p className="text-xl font-bold tabular-nums mt-1" style={{ color: "#ef4444" }}>
                LKR {formatNumber(supplierPayments)}
              </p>
              <p className="text-[10px] mt-1" style={{ color: "var(--pos-muted)" }}>
                Cash-out · not expense · cash {formatNumber(summary?.cashSupplierPayments ?? 0)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { label: "Net (income − expenses)", value: `LKR ${formatNumber(netIncome)}`, color: netIncome >= 0 ? "var(--pos-success-soft)" : "#f87171" },
              { label: "Bills", value: String(summary?.totalSales ?? 0), color: "var(--pos-success-soft)" },
              { label: "Avg bill", value: `LKR ${formatNumber(avgBill)}`, color: "var(--pos-violet-soft)" },
              { label: "Tax / discounts", value: `LKR ${formatNumber(summary?.totalTax ?? 0)} / ${formatNumber(summary?.totalDiscount ?? 0)}`, color: "var(--pos-warn-soft)" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border p-3"
                style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}
              >
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "var(--pos-muted)" }}>{s.label}</p>
                <p className="text-lg font-bold tabular-nums mt-1" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-3">
            <div
              className="rounded-xl border p-4 space-y-2"
              style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}
            >
              <p className="text-xs font-semibold" style={{ color: "var(--pos-accent-soft)" }}>Payment mix</p>
              {payMethods.length === 0 ? (
                <p className="text-xs" style={{ color: "var(--pos-muted-2)" }}>No payments</p>
              ) : (
                payMethods.map(([method, amt]) => (
                  <div key={method} className="flex justify-between text-xs">
                    <span style={{ color: "var(--pos-muted)" }}>{method.replace(/_/g, " ")}</span>
                    <span className="font-bold text-white tabular-nums">LKR {formatNumber(amt)}</span>
                  </div>
                ))
              )}
              <div className="pt-2 border-t space-y-1.5" style={{ borderColor: "var(--pos-border)" }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--pos-muted)" }}>Opening</span>
                  <span className="text-white tabular-nums">LKR {formatNumber(openingBalance)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--pos-muted)" }}>Income</span>
                  <span className="tabular-nums" style={{ color: "#4f6ef7" }}>LKR {formatNumber(income)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--pos-muted)" }}>Expenses</span>
                  <span className="tabular-nums" style={{ color: "var(--pos-warn)" }}>LKR {formatNumber(expenses)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "var(--pos-muted)" }}>Supplier paid</span>
                  <span className="tabular-nums" style={{ color: "#ef4444" }}>LKR {formatNumber(supplierPayments)}</span>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border overflow-hidden flex flex-col min-h-[280px]"
              style={{ background: "var(--pos-card)", borderColor: "var(--pos-border)" }}
            >
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "var(--pos-border)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--pos-accent-soft)" }}>
                  Bills · {shiftLabel}
                </p>
                <span className="text-[10px]" style={{ color: "var(--pos-muted)" }}>{sales.length} shown</span>
              </div>
              {sales.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center" style={{ color: "var(--pos-muted-2)" }}>
                  <Receipt className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">{viewAll ? "No sales this day" : "No bills by you this day"}</p>
                </div>
              ) : (
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: "var(--pos-muted)", borderBottom: "1px solid var(--pos-border)" }}>
                        <th className="text-left px-3 py-2 font-semibold">Invoice</th>
                        <th className="text-left px-3 py-2 font-semibold">Customer</th>
                        <th className="text-left px-3 py-2 font-semibold">Pay</th>
                        <th className="text-right px-3 py-2 font-semibold">Total</th>
                        <th className="text-right px-3 py-2 font-semibold">Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((s, i) => {
                        const cust = s.customer
                          ? `${s.customer.firstName ?? ""} ${s.customer.lastName ?? ""}`.trim() || s.customer.phone || "—"
                          : "Walk-in";
                        const pay = s.payments?.[0]?.method ?? s.paymentMethod ?? "—";
                        return (
                          <tr
                            key={s.id}
                            onClick={() => onOpenSale?.(s.id)}
                            className={onOpenSale ? "cursor-pointer hover:bg-white/5" : undefined}
                            style={{
                              borderBottom: "1px solid var(--pos-border)",
                              background: i % 2 === 0 ? "transparent" : "var(--pos-hover)",
                            }}
                          >
                            <td className="px-3 py-2 font-mono font-semibold text-white">{s.invoiceNumber}</td>
                            <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "var(--pos-muted)" }}>{cust}</td>
                            <td className="px-3 py-2" style={{ color: "var(--pos-muted)" }}>{pay}</td>
                            <td className="px-3 py-2 text-right font-bold text-white tabular-nums">
                              LKR {formatNumber(s.total)}
                            </td>
                            <td className="px-3 py-2 text-right" style={{ color: "var(--pos-muted)" }}>
                              {new Date(s.invoiceDate).toLocaleTimeString("en-LK", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
