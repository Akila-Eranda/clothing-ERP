"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Banknote, Loader2, PlayCircle, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/auth-store";

interface PosShiftGateProps {
  onShiftReady: () => void;
  onClose?: () => void;
}

export function PosShiftGate({ onShiftReady, onClose }: PosShiftGateProps) {
  const { user } = useAuthStore();
  const [checking, setChecking] = React.useState(true);
  const [openingCash, setOpeningCash] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get<{ status?: string } | null>("/cash/active");
        if (cancelled) return;
        if (res.data?.status === "OPEN") {
          onShiftReady();
          return;
        }
        if (res.data?.status === "PENDING_APPROVAL") {
          toast.error("Previous shift pending manager approval");
          onClose?.();
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

  const cashierName = user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : "Cashier";
  const today = new Date().toLocaleDateString("en-LK", { day: "2-digit", month: "2-digit", year: "numeric" });

  if (checking) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
        <Loader2 className="h-10 w-10 animate-spin text-white" />
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
          </div>
          <p className="text-xs text-white/40">Count your drawer float before starting sales.</p>
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
