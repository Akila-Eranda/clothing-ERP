"use client";

import * as React from "react";
import { X, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { CashMovementLedger, type CashMovement } from "@/components/cash/cash-movement-ledger";

interface ShiftDetail {
  id: string;
  openingCash: number;
  openingTime: string;
  closingTime?: string | null;
  expectedCash?: number | null;
  actualCash?: number | null;
  variance?: number | null;
  status: string;
  cashierName?: string;
  branch?: { name: string };
  summary?: {
    openingCash: number;
    cashSales: number;
    cashReceived: number;
    cashExpenses: number;
    cashRefunds: number;
    expectedCash: number;
  };
  movements?: CashMovement[];
}

export function ShiftDetailSheet({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const [loading, setLoading] = React.useState(true);
  const [shift, setShift] = React.useState<ShiftDetail | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await api.get<ShiftDetail>(`/cash/${shiftId}`);
        if (!cancelled) setShift(res.data ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [shiftId]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-background rounded-t-2xl sm:rounded-2xl shadow-2xl border w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div>
            <h2 className="font-bold text-sm">Shift Details</h2>
            <p className="text-xs text-muted-foreground">{shift?.cashierName ?? "—"} · {shift?.branch?.name ?? "Branch"}</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : shift ? (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Opened", new Date(shift.openingTime).toLocaleString("en-LK")],
                  ["Closed", shift.closingTime ? new Date(shift.closingTime).toLocaleString("en-LK") : "—"],
                  ["Expected", shift.expectedCash != null ? `LKR ${formatNumber(shift.expectedCash)}` : "—"],
                  ["Actual", shift.actualCash != null ? `LKR ${formatNumber(shift.actualCash)}` : "—"],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
                    <p className="font-semibold text-xs mt-0.5">{val}</p>
                  </div>
                ))}
              </div>
              {shift.variance != null && (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/50 border">
                  <span className="text-sm font-medium">Variance</span>
                  <Badge variant={shift.variance < 0 ? "destructive" : "success"}>
                    {shift.variance >= 0 ? "+" : ""}{formatNumber(shift.variance)}
                  </Badge>
                </div>
              )}
              {shift.summary && (
                <div className="space-y-1.5 text-sm border rounded-xl p-3">
                  {[
                    ["Cash sales", shift.summary.cashSales],
                    ["Cash received", shift.summary.cashReceived],
                    ["Expenses / out", shift.summary.cashExpenses],
                    ["Refunds", shift.summary.cashRefunds],
                  ].map(([label, val]) => (
                    <div key={String(label)} className="flex justify-between">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums font-medium">{formatNumber(Number(val))}</span>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Movement log</p>
                <CashMovementLedger movements={shift.movements ?? []} />
              </div>
            </>
          ) : (
            <p className="text-center text-muted-foreground py-8 text-sm">Shift not found</p>
          )}
        </div>
        <div className="px-5 py-3 border-t shrink-0">
          <Button variant="outline" className="w-full" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
}
