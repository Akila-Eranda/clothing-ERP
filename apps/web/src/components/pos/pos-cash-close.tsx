"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Banknote, Loader2, StopCircle, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_DENOMINATIONS } from "@/components/cash/denomination-input";

const VARIANCE_THRESHOLD = 500;

interface ActiveShift {
  id: string;
  openingCash: number;
  summary?: { expectedCash: number; cashSales: number; cashExpenses: number; cashRefunds: number };
}

interface PosCashCloseProps {
  onClosed: (result: { needsApproval?: boolean; variance?: number }) => void;
  onCancel: () => void;
}

export function PosCashClose({ onClosed, onCancel }: PosCashCloseProps) {
  const [loading, setLoading] = React.useState(true);
  const [closing, setClosing] = React.useState(false);
  const [active, setActive] = React.useState<ActiveShift | null>(null);
  const [denominations, setDenominations] = React.useState<Record<string, number>>({});
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<ActiveShift | null>("/cash/active");
        if (!cancelled) setActive(res.data ?? null);
      } catch {
        if (!cancelled) setActive(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const actualTotal = React.useMemo(
    () => Object.entries(denominations).reduce((s, [d, q]) => s + parseFloat(d) * (Number(q) || 0), 0),
    [denominations],
  );
  const expected = active?.summary?.expectedCash ?? 0;
  const variance = actualTotal > 0 ? Math.round((actualTotal - expected) * 100) / 100 : 0;
  const needsApproval = Math.abs(variance) > VARIANCE_THRESHOLD;

  const setCount = (denom: number, qty: string) => {
    const n = Math.max(0, parseInt(qty, 10) || 0);
    setDenominations((prev) => ({ ...prev, [String(denom)]: n }));
  };

  const handleClose = async () => {
    if (!active) return;
    if (actualTotal <= 0) {
      toast.error("Enter physical cash count");
      return;
    }
    setClosing(true);
    try {
      const res = await api.post<{ needsApproval?: boolean; variance?: number }>(
        `/cash/${active.id}/close`,
        { actualCash: actualTotal, denominations, notes: notes || undefined },
      );
      const needs = res.data?.needsApproval;
      const v = res.data?.variance ?? variance;
      if (needs) {
        toast.warning(`Shift closed — variance LKR ${formatNumber(Math.abs(v))} pending manager approval`);
      } else {
        toast.success("Cash shift closed successfully");
      }
      onClosed({ needsApproval: needs, variance: v });
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to close shift");
    } finally {
      setClosing(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    );
  }

  if (!active) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
        <div className="rounded-2xl border p-6 text-center max-w-sm w-full" style={{ background: "#0f1f3a", borderColor: "#1e3356" }}>
          <p className="text-white text-sm mb-4">No open cash shift to close.</p>
          <Button onClick={onCancel} className="w-full">Back</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-lg rounded-2xl border shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: "#0f1f3a", borderColor: "#1e3356" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "#1e3356" }}>
          <div className="flex items-center gap-2">
            <StopCircle className="h-5 w-5" style={{ color: "#ef4444" }} />
            <span className="text-white font-bold">Close Cash Shift</span>
          </div>
          <button type="button" onClick={onCancel} className="p-1 rounded hover:bg-white/10">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-xl p-3 text-sm space-y-1.5" style={{ background: "#162338", border: "1px solid #1e3356" }}>
            {[
              ["Opening float", active.openingCash],
              ["Cash sales", active.summary?.cashSales ?? 0],
              ["Cash out", active.summary?.cashExpenses ?? 0],
              ["Refunds", active.summary?.cashRefunds ?? 0],
            ].map(([label, val]) => (
              <div key={String(label)} className="flex justify-between">
                <span style={{ color: "#6a8ab8" }}>{label}</span>
                <span className="text-white font-semibold tabular-nums">LKR {formatNumber(Number(val))}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t font-bold" style={{ borderColor: "#1e3356" }}>
              <span style={{ color: "#10b981" }}>Expected in drawer</span>
              <span style={{ color: "#10b981" }} className="tabular-nums">LKR {formatNumber(expected)}</span>
            </div>
          </div>

          <div>
            <Label className="text-white/70 text-xs uppercase tracking-wide">Physical count</Label>
            <div className="mt-2 space-y-2">
              {DEFAULT_DENOMINATIONS.map((denom) => {
                const qty = denominations[String(denom)] ?? 0;
                const line = denom * qty;
                return (
                  <div key={denom} className="flex items-center gap-2 text-sm">
                    <span className="w-14 font-mono shrink-0" style={{ color: "#6a8ab8" }}>{denom.toLocaleString()}</span>
                    <span style={{ color: "#4a6a8a" }}>×</span>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 w-20 text-center bg-[#1a2b4a] border-[#1e3356] text-white"
                      value={qty || ""}
                      placeholder="0"
                      onChange={(e) => setCount(denom, e.target.value)}
                    />
                    <span className="flex-1 text-right font-semibold tabular-nums text-white">
                      {line > 0 ? formatNumber(line) : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t" style={{ borderColor: "#1e3356" }}>
              <span className="text-white font-semibold">Actual total</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: "#4f6ef7" }}>LKR {formatNumber(actualTotal)}</span>
            </div>
          </div>

          {actualTotal > 0 && (
            <div className="rounded-xl p-3 text-sm" style={{ background: variance < 0 ? "rgba(239,68,68,0.1)" : "rgba(16,185,129,0.08)", border: `1px solid ${variance < 0 ? "rgba(239,68,68,0.3)" : "rgba(16,185,129,0.25)"}` }}>
              <div className="flex justify-between">
                <span style={{ color: "#6a8ab8" }}>Variance</span>
                <span className="font-bold tabular-nums" style={{ color: variance < 0 ? "#ef4444" : "#10b981" }}>
                  {variance >= 0 ? "+" : ""}{formatNumber(variance)}
                </span>
              </div>
              {needsApproval && (
                <p className="text-xs mt-2 flex items-center gap-1" style={{ color: "#f59e0b" }}>
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Manager approval required (over LKR {VARIANCE_THRESHOLD})
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="End of day notes…"
              className="bg-[#1a2b4a] border-[#1e3356] text-white"
            />
          </div>
        </div>

        <div className="p-5 pt-0 shrink-0 space-y-2">
          <Button
            onClick={() => void handleClose()}
            disabled={closing || actualTotal <= 0}
            className="w-full h-11 gap-2 font-bold"
            style={{ background: "linear-gradient(135deg,#ef4444,#dc2626)" }}
          >
            {closing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Close Shift
          </Button>
          <Button variant="ghost" onClick={onCancel} className="w-full text-white/60 hover:text-white hover:bg-white/5">
            Cancel
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
