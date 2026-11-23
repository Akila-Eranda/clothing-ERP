"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type History = {
  counter: { id: string; name: string; code: string };
  cashInDrawer: number;
  shifts: {
    id: string; cashierName: string; status: string; openingTime: string; closingTime: string | null;
    openingCash: number; expectedCash: number; actualCash: number | null; variance: number | null;
    clearedAt: string | null; clearedAmount: number | null;
    breakdown: { cashSales: number; cashRefunds: number; withdrawals: number; deposits: number; expenses: number; transfersIn: number; transfersOut: number };
  }[];
  handovers: {
    id: string; createdAt: string; expectedCash: number; countedCash: number; variance: number; counted: boolean;
    fromCashierName: string | null; toCashierName: string | null; performedByName: string | null; authorizedByName: string | null;
  }[];
};

const dt = (s?: string | null) => (s ? new Date(s).toLocaleString([], { dateStyle: "short", timeStyle: "short" }) : "—");

/** Cashier shift, balance and handover history of one POS counter. */
export function CounterHistoryDialog({ counterId, onClose }: { counterId: string | null; onClose: () => void }) {
  const [data, setData] = React.useState<History | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!counterId) return;
    let alive = true;
    setData(null); setError(null);
    api.get<History>(`/cash/counters/${encodeURIComponent(counterId)}/history?limit=50`)
      .then((r) => { if (alive) setData(r.data ?? null); })
      .catch((e: unknown) => { if (alive) setError((e as Error).message || "Could not load history"); });
    return () => { alive = false; };
  }, [counterId]);

  return (
    <Dialog open={!!counterId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-4xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data ? `${data.counter.name} (${data.counter.code})` : "Counter history"}</DialogTitle>
          <DialogDescription>
            {data ? <>Cash in the drawer now: <b className="text-foreground">LKR {formatNumber(data.cashInDrawer)}</b></> : "Shifts, balances and handovers"}
          </DialogDescription>
        </DialogHeader>
        {!data && !error && <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {error && <p className="py-4 text-sm text-destructive-text" role="alert">{error}</p>}
        {data && (
          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-sm font-semibold">Handovers</h3>
              {data.handovers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No handovers yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 text-left">When</th><th className="px-2 py-2 text-left">From → To</th>
                        <th className="px-2 py-2 text-right">Expected</th><th className="px-2 py-2 text-right">Handed over</th>
                        <th className="px-2 py-2 text-right">Difference</th><th className="px-2 py-2 text-left">By / authorised</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.handovers.map((h) => (
                        <tr key={h.id} className="border-t">
                          <td className="px-2 py-1.5 whitespace-nowrap">{dt(h.createdAt)}</td>
                          <td className="px-2 py-1.5">{h.fromCashierName ?? "—"} → {h.toCashierName ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(h.expectedCash)}</td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(h.countedCash)}{h.counted ? "" : " (not counted)"}</td>
                          <td className={`px-2 py-1.5 text-right tabular-nums ${h.variance < 0 ? "text-destructive-text" : h.variance > 0 ? "text-success-text" : ""}`}>{formatNumber(h.variance)}</td>
                          <td className="px-2 py-1.5">{h.performedByName ?? "—"}{h.authorizedByName ? ` / ${h.authorizedByName}` : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section>
              <h3 className="mb-2 text-sm font-semibold">Shifts</h3>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-[11px] uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Cashier</th><th className="px-2 py-2 text-left">Opened / closed</th>
                      <th className="px-2 py-2 text-right">Opening</th><th className="px-2 py-2 text-right">Sales</th>
                      <th className="px-2 py-2 text-right">Out</th><th className="px-2 py-2 text-right">Expected</th>
                      <th className="px-2 py-2 text-right">Counted</th><th className="px-2 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-2 py-1.5">{s.cashierName}</td>
                        <td className="px-2 py-1.5 whitespace-nowrap">{dt(s.openingTime)} – {s.closingTime ? dt(s.closingTime) : "open"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(s.openingCash)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(s.breakdown.cashSales)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(s.breakdown.cashRefunds + s.breakdown.withdrawals + s.breakdown.expenses + s.breakdown.transfersOut)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatNumber(s.expectedCash)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{s.actualCash === null ? "—" : formatNumber(s.actualCash)}</td>
                        <td className="px-2 py-1.5">{s.clearedAt ? "Cleared" : s.status === "OPEN" ? "Open" : s.status === "PENDING_APPROVAL" ? "Pending approval" : "Closed"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
