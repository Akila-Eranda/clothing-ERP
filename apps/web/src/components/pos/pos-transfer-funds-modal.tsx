"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Loader2, RefreshCw, X, Landmark, Monitor } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type OpenShift = {
  id: string;
  openingCash: number;
  expectedCash: number;
  cashierId: string;
  cashierName?: string;
  counterId?: string | null;
  counterName?: string | null;
  counterCode?: string | null;
};

type TransferSource = "SAFE" | "REGISTER";

const AMOUNT_PRESETS = [1000, 2000, 5000, 10000];

interface PosTransferFundsModalProps {
  onClose: () => void;
  onTransferred?: () => void;
}

export function PosTransferFundsModal({ onClose, onTransferred }: PosTransferFundsModalProps) {
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [shifts, setShifts] = React.useState<OpenShift[]>([]);
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const [from, setFrom] = React.useState<TransferSource>("SAFE");
  const [toRegisterId, setToRegisterId] = React.useState("");
  const [fromRegisterId, setFromRegisterId] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [reason, setReason] = React.useState("");
  const sourceTouchedRef = React.useRef(false);

  const pickSource = React.useCallback((next: TransferSource) => {
    sourceTouchedRef.current = true;
    setFrom(next);
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [openRes, activeRes] = await Promise.all([
        api.get<OpenShift[]>("/cash/open-shifts"),
        api.get<{ id: string } | null>("/cash/active").catch(() => ({ data: null })),
      ]);
      const list = Array.isArray(openRes.data) ? openRes.data : [];
      setShifts(list);
      const active = activeRes.data?.id ?? null;
      setActiveId(active);
      setFromRegisterId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        return active && list.some((s) => s.id === active) ? active : list[0]?.id ?? "";
      });
      setToRegisterId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        const prefer = list.find((s) => s.id !== active) ?? list[0];
        return prefer?.id ?? "";
      });
      // Two or more tills open — cashier-to-cashier is the common case.
      if (!sourceTouchedRef.current && list.length >= 2) setFrom("REGISTER");
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to load open shifts");
      setShifts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const destinations = React.useMemo(() => {
    if (from === "SAFE") return shifts;
    return shifts.filter((s) => s.id !== fromRegisterId);
  }, [shifts, from, fromRegisterId]);

  const sourceShift = React.useMemo(
    () => shifts.find((s) => s.id === fromRegisterId) ?? null,
    [shifts, fromRegisterId],
  );

  const destShift = React.useMemo(
    () => shifts.find((s) => s.id === toRegisterId) ?? null,
    [shifts, toRegisterId],
  );

  React.useEffect(() => {
    if (from === "REGISTER" && toRegisterId === fromRegisterId) {
      const next = shifts.find((s) => s.id !== fromRegisterId);
      setToRegisterId(next?.id ?? "");
    }
  }, [from, fromRegisterId, toRegisterId, shifts]);

  const shiftLabel = (s: OpenShift) => {
    const counter = s.counterName || s.counterCode || "Counter";
    const cashier = s.cashierName || "Cashier";
    return `${counter} · ${cashier}`;
  };

  const submit = React.useCallback(async () => {
    const amt = Math.round(parseFloat(amount) * 100) / 100;
    if (!(amt > 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!toRegisterId) {
      toast.error("Select a destination cashier");
      return;
    }
    if (from === "REGISTER") {
      if (!fromRegisterId) {
        toast.error("Select a source till");
        return;
      }
      if (sourceShift && amt > sourceShift.expectedCash + 0.001) {
        toast.error(`Source till only has LKR ${formatNumber(sourceShift.expectedCash)}`);
        return;
      }
    }

    setBusy(true);
    try {
      const res = await api.post<{ message?: string }>("/cash/transfer", {
        toRegisterId,
        amount: amt,
        from,
        fromRegisterId: from === "REGISTER" ? fromRegisterId : undefined,
        reason: reason.trim() || undefined,
      });
      toast.success(res.data?.message || `Transferred LKR ${formatNumber(amt)}`);
      setAmount("");
      setReason("");
      onTransferred?.();
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Transfer failed");
    } finally {
      setBusy(false);
    }
  }, [amount, toRegisterId, from, fromRegisterId, sourceShift, reason, onTransferred, load]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "var(--pos-overlay)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--pos-border)" }}>
          <div className="flex items-center gap-2">
            <ArrowLeftRight className="h-5 w-5" style={{ color: "var(--pos-accent)" }} />
            <span className="text-white font-bold">Transfer Funds</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading || busy}
              className="p-1.5 rounded hover:bg-white/10 disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 text-white/60 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10">
              <X className="h-4 w-4 text-white/60" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--pos-accent)" }} />
          </div>
        ) : shifts.length === 0 ? (
          <div className="p-6 text-center space-y-3">
            <p className="text-sm" style={{ color: "var(--pos-muted)" }}>
              No open cashier shifts on this branch. Open a shift first, then transfer float.
            </p>
            <Button variant="ghost" onClick={onClose} className="w-full text-white/60">
              Close
            </Button>
          </div>
        ) : (
          <>
            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs uppercase tracking-wide">Source</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => pickSource("SAFE")}
                    className="flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-all"
                    style={{
                      background: from === "SAFE" ? "rgba(var(--pos-accent-rgb),0.2)" : "var(--pos-card)",
                      border: `1px solid ${from === "SAFE" ? "rgba(var(--pos-accent-rgb),0.5)" : "var(--pos-border)"}`,
                      color: from === "SAFE" ? "#a5b4fc" : "var(--pos-muted)",
                    }}
                  >
                    <Landmark className="h-4 w-4" /> From safe
                  </button>
                  <button
                    type="button"
                    onClick={() => pickSource("REGISTER")}
                    disabled={shifts.length < 2}
                    className="flex items-center justify-center gap-2 h-10 rounded-xl text-sm font-semibold transition-all disabled:opacity-40"
                    style={{
                      background: from === "REGISTER" ? "rgba(var(--pos-accent-rgb),0.2)" : "var(--pos-card)",
                      border: `1px solid ${from === "REGISTER" ? "rgba(var(--pos-accent-rgb),0.5)" : "var(--pos-border)"}`,
                      color: from === "REGISTER" ? "#a5b4fc" : "var(--pos-muted)",
                    }}
                  >
                    <Monitor className="h-4 w-4" /> From till
                  </button>
                </div>
              </div>

              {from === "REGISTER" && (
                <div className="space-y-1.5">
                  <Label className="text-white/70 text-xs">From till</Label>
                  <select
                    value={fromRegisterId}
                    onChange={(e) => setFromRegisterId(e.target.value)}
                    className="w-full h-10 rounded-xl px-3 text-sm outline-none"
                    style={{
                      background: "var(--pos-input)",
                      border: "1px solid var(--pos-border)",
                      color: "var(--pos-text)",
                    }}
                  >
                    {shifts.map((s) => (
                      <option key={s.id} value={s.id}>
                        {shiftLabel(s)} · LKR {formatNumber(s.expectedCash)}
                        {s.id === activeId ? " (this till)" : ""}
                      </option>
                    ))}
                  </select>
                  {sourceShift && (
                    <p className="text-[11px]" style={{ color: "var(--pos-muted)" }}>
                      Available in drawer: LKR {formatNumber(sourceShift.expectedCash)}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">To cashier</Label>
                <select
                  value={toRegisterId}
                  onChange={(e) => setToRegisterId(e.target.value)}
                  className="w-full h-10 rounded-xl px-3 text-sm outline-none"
                  style={{
                    background: "var(--pos-input)",
                    border: "1px solid var(--pos-border)",
                    color: "var(--pos-text)",
                  }}
                >
                  {destinations.length === 0 ? (
                    <option value="">No destination available</option>
                  ) : (
                    destinations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {shiftLabel(s)} · expected LKR {formatNumber(s.expectedCash)}
                        {s.id === activeId ? " (this till)" : ""}
                      </option>
                    ))
                  )}
                </select>
                {destShift && (
                  <p className="text-[11px]" style={{ color: "var(--pos-muted)" }}>
                    Opening float was LKR {formatNumber(destShift.openingCash)}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Amount (LKR)</Label>
                <Input
                  type="number"
                  min={0.01}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="h-11 text-lg font-semibold tabular-nums bg-[var(--pos-input)] border-[var(--pos-border)]"
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {AMOUNT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(String(p))}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-white/10"
                      style={{
                        background: "var(--pos-card)",
                        border: "1px solid var(--pos-border)",
                        color: "var(--pos-muted)",
                      }}
                    >
                      {formatNumber(p)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-white/70 text-xs">Reason (optional)</Label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Mid-day float top-up"
                  className="bg-[var(--pos-input)] border-[var(--pos-border)]"
                  maxLength={200}
                />
              </div>
            </div>

            <div className="p-5 pt-0 shrink-0 space-y-2">
              <Button
                onClick={() => void submit()}
                disabled={busy || !toRegisterId || !(parseFloat(amount) > 0)}
                className="w-full h-11 gap-2 font-bold"
                style={{ background: "var(--pos-accent-grad)" }}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
                Transfer LKR {parseFloat(amount) > 0 ? formatNumber(parseFloat(amount)) : "—"}
              </Button>
              <Button variant="ghost" onClick={onClose} className="w-full text-white/60 hover:text-white hover:bg-white/5">
                Cancel
              </Button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}
