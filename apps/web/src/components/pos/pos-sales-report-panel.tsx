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

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [sumR, salesR] = await Promise.all([
        api.get<Summary>(`/pos/summary?date=${encodeURIComponent(date)}`),
        api.get<{ data?: SaleRow[] }>(`/pos/sales?limit=100&date=${encodeURIComponent(date)}`),
      ]);
      setSummary(sumR.data ?? null);
      setSales(salesR.data?.data ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load sales report");
    } finally {
      setLoading(false);
    }
  }, [date]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const avgBill = summary && summary.totalSales > 0
    ? summary.totalRevenue / summary.totalSales
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
          <Badge className="text-[10px]" style={{ background: "rgba(79,110,247,0.15)", color: "#c4b5fd" }}>
            {profile.label}
          </Badge>
          {!viewAll && (
            <Badge className="text-[10px]" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
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
            style={{ background: "#1a2b4a", border: "1px solid #1e3356" }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            className="h-8 gap-1.5"
            style={{ borderColor: "#1e3356", color: "#6a8ab8", background: "transparent" }}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <button
            onClick={onBack}
            className="text-xs font-semibold px-3 h-8 rounded-lg"
            style={{ color: "#6a8ab8" }}
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
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {[
              { label: "Revenue", value: `LKR ${formatNumber(summary?.totalRevenue ?? 0)}`, color: "#4f6ef7" },
              { label: "Bills", value: String(summary?.totalSales ?? 0), color: "#34d399" },
              { label: "Items sold", value: String(summary?.totalItems ?? 0), color: "#fbbf24" },
              { label: "Avg bill", value: `LKR ${formatNumber(avgBill)}`, color: "#c4b5fd" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-xl border p-3"
                style={{ background: "#162338", borderColor: "#1e3356" }}
              >
                <p className="text-[10px] uppercase tracking-wide" style={{ color: "#6a8ab8" }}>{s.label}</p>
                <p className="text-lg font-bold tabular-nums mt-1" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-3">
            <div
              className="rounded-xl border p-4 space-y-2"
              style={{ background: "#162338", borderColor: "#1e3356" }}
            >
              <p className="text-xs font-semibold" style={{ color: "#93c5fd" }}>Payment mix</p>
              {payMethods.length === 0 ? (
                <p className="text-xs" style={{ color: "#4a6a8a" }}>No payments</p>
              ) : (
                payMethods.map(([method, amt]) => (
                  <div key={method} className="flex justify-between text-xs">
                    <span style={{ color: "#6a8ab8" }}>{method.replace(/_/g, " ")}</span>
                    <span className="font-bold text-white tabular-nums">LKR {formatNumber(amt)}</span>
                  </div>
                ))
              )}
              <div className="pt-2 border-t space-y-1.5" style={{ borderColor: "#1e3356" }}>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "#6a8ab8" }}>Tax</span>
                  <span className="text-white tabular-nums">LKR {formatNumber(summary?.totalTax ?? 0)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span style={{ color: "#6a8ab8" }}>Discounts</span>
                  <span className="tabular-nums" style={{ color: "#fbbf24" }}>
                    LKR {formatNumber(summary?.totalDiscount ?? 0)}
                  </span>
                </div>
              </div>
            </div>

            <div
              className="rounded-xl border overflow-hidden flex flex-col min-h-[280px]"
              style={{ background: "#162338", borderColor: "#1e3356" }}
            >
              <div className="px-4 py-2.5 border-b flex items-center justify-between" style={{ borderColor: "#1e3356" }}>
                <p className="text-xs font-semibold" style={{ color: "#93c5fd" }}>
                  Bills · {date}
                </p>
                <span className="text-[10px]" style={{ color: "#6a8ab8" }}>{sales.length} shown</span>
              </div>
              {sales.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center" style={{ color: "#4a6a8a" }}>
                  <Receipt className="h-10 w-10 mb-2 opacity-30" />
                  <p className="text-sm">{viewAll ? "No sales this day" : "No bills by you this day"}</p>
                </div>
              ) : (
                <div className="overflow-y-auto flex-1">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ color: "#6a8ab8", borderBottom: "1px solid #1e3356" }}>
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
                              borderBottom: "1px solid #1a2b3a",
                              background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                            }}
                          >
                            <td className="px-3 py-2 font-mono font-semibold text-white">{s.invoiceNumber}</td>
                            <td className="px-3 py-2 truncate max-w-[120px]" style={{ color: "#6a8ab8" }}>{cust}</td>
                            <td className="px-3 py-2" style={{ color: "#6a8ab8" }}>{pay}</td>
                            <td className="px-3 py-2 text-right font-bold text-white tabular-nums">
                              LKR {formatNumber(s.total)}
                            </td>
                            <td className="px-3 py-2 text-right" style={{ color: "#6a8ab8" }}>
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
