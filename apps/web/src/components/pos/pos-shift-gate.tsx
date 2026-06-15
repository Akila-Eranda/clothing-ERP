"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Banknote, Loader2, PlayCircle, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";

interface PosShiftGateProps {
  onShiftReady: () => void;
  onClose?: () => void;
}

export function PosShiftGate({ onShiftReady, onClose }: PosShiftGateProps) {
  const { user } = useAuthStore();
  const [checking, setChecking] = React.useState(true);
  const [pendingApproval, setPendingApproval] = React.useState(false);
  const [openingCash, setOpeningCash] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [suggested, setSuggested] = React.useState<number | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [activeRes, suggestRes] = await Promise.all([
          api.get<{ status?: string; variance?: number } | null>("/cash/active"),
          api.get<{ suggestedOpening: number | null }>("/cash/opening-suggestion").catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        if (suggestRes.data?.suggestedOpening != null) {
          setSuggested(suggestRes.data.suggestedOpening);
          setOpeningCash(String(suggestRes.data.suggestedOpening));
        }
        if (activeRes.data?.status === "OPEN") {
          onShiftReady();
          return;
        }
        if (activeRes.data?.status === "PENDING_APPROVAL") {
          setPendingApproval(true);
          return;
        }
      } catch {
        /* no active shift — show open form */
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, [onShiftReady, onClose]);

  const handleStart = async () => {
    const amount = parseFloat(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter opening cash amount");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/cash/open", { openingCash: amount });
      toast.success("Shift started");
      onShiftReady();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to start shift");
    } finally {
      setSubmitting(false);
    }
  };

  const cashierName = user?.name ?? "Cashier";
  const today = new Date().toLocaleDateString("en-LK", { day: "2-digit", month: "2-digit", year: "numeric" });
  const FLOAT_PRESETS = [5000, 10000, 15000, 20000];

  if (checking) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
        <Loader2 className="h-10 w-10 animate-spin text-white" />
      </div>
    );
  }

  if (pendingApproval) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
          style={{ background: "#0f1f3a", borderColor: "#1e3356" }}
        >
          <div className="px-5 py-4 border-b flex items-center gap-2" style={{ borderColor: "#1e3356" }}>
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="text-white font-bold">Awaiting Manager Approval</span>
          </div>
          <div className="p-5 space-y-4 text-sm">
            <p className="text-white/80">
              Your previous cash shift has a variance pending manager approval. You cannot start a new shift until it is approved.
            </p>
            <p className="text-xs" style={{ color: "#6a8ab8" }}>
              Ask your branch manager to approve from Cash Management or Workflows.
            </p>
            {onClose && (
              <Button onClick={onClose} variant="outline" className="w-full border-[#1e3356] text-white/70">
                Exit POS
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: "#0f1f3a", borderColor: "#1e3356" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#1e3356" }}>
          <div className="flex items-center gap-2">
            <Banknote className="h-5 w-5" style={{ color: "#10b981" }} />
            <span className="text-white font-bold">Opening Cash</span>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10">
              <X className="h-4 w-4 text-white/60" />
            </button>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-white/50 text-xs">Cashier</p>
              <p className="text-white font-semibold">{cashierName}</p>
            </div>
            <div>
              <p className="text-white/50 text-xs">Date</p>
              <p className="text-white font-semibold">{today}</p>
            </div>
          </div>
          {suggested != null && (
            <p className="text-[10px] text-emerald-400/80">Suggested from last close: LKR {formatNumber(suggested)}</p>
          )}
          <div className="space-y-2">
            <Label className="text-white/70">Opening amount (LKR)</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              autoFocus
              placeholder="10,000.00"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              className="h-12 text-lg font-bold bg-[#1a2b4a] border-[#1e3356] text-white"
            />
            <div className="flex flex-wrap gap-2">
              {FLOAT_PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setOpeningCash(String(p))}
                  className="px-2.5 py-1 text-[10px] rounded-lg border font-medium transition-all"
                  style={{
                    background: openingCash === String(p) ? "#10b981" : "#162338",
                    borderColor: openingCash === String(p) ? "#10b981" : "#1e3356",
                    color: openingCash === String(p) ? "#fff" : "#6a8ab8",
                  }}
                >
                  {formatNumber(p)}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-white/40">Count your drawer float before starting sales. Cash sales auto-track in drawer.</p>
          <Button
            onClick={() => void handleStart()}
            disabled={submitting}
            className="w-full h-11 gap-2 font-bold"
            style={{ background: "linear-gradient(135deg,#10b981,#059669)" }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Start Shift
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
