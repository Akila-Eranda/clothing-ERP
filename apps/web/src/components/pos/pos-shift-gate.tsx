"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Banknote, Loader2, PlayCircle, X, AlertTriangle, CheckCircle2, Monitor, Building2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatNumber } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useBranchStore } from "@/stores/branch-store";
import { useBranchContext } from "@/components/branch/branch-provider";
import { bypassesWorkflowApproval, isWorkflowApproverRole } from "@/lib/workflow-access";
import { readPosCounterId, writePosCounterId, clearPosCounterId } from "@/lib/pos-counter";

interface PosShiftGateProps {
  onShiftReady: () => void;
  onClose?: () => void;
}

type CounterRow = { id: string; name: string; code: string; sortOrder?: number };

export function PosShiftGate({ onShiftReady, onClose }: PosShiftGateProps) {
  const { user } = useAuthStore();
  const { branches, ready: branchReady } = useBranchContext();
  const { activeBranchId, activeBranchName, setBranch } = useBranchStore();
  const [checking, setChecking] = React.useState(true);
  const [pendingApproval, setPendingApproval] = React.useState(false);
  const [pendingRegisterId, setPendingRegisterId] = React.useState<string | null>(null);
  const [approving, setApproving] = React.useState(false);
  const [openingCash, setOpeningCash] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [suggested, setSuggested] = React.useState<number | null>(null);
  const [counters, setCounters] = React.useState<CounterRow[]>([]);
  const [counterId, setCounterId] = React.useState("");
  const [existingOpen, setExistingOpen] = React.useState(false);
  const onShiftReadyRef = React.useRef(onShiftReady);
  onShiftReadyRef.current = onShiftReady;
  const canApprove =
    bypassesWorkflowApproval(user?.role) || isWorkflowApproverRole(user?.role);

  const loadForBranch = React.useCallback(async (branchId: string | null) => {
    setChecking(true);
    setPendingApproval(false);
    setPendingRegisterId(null);
    setExistingOpen(false);
    setSuggested(null);
    try {
      if (!branchId) {
        setCounters([]);
        setCounterId("");
        return;
      }
      const countersRes = await api.get<CounterRow[]>("/cash/counters").catch(() => ({ data: [] as CounterRow[] }));
      const list = Array.isArray(countersRes.data) ? countersRes.data : [];
      setCounters(list);

      let selected = readPosCounterId();
      if (!selected || !list.some((c) => c.id === selected)) {
        selected = list.length === 1 ? list[0].id : "";
      }
      setCounterId(selected);
      if (selected) writePosCounterId(selected);
      else clearPosCounterId();

      if (!selected) return;

      const [activeRes, suggestRes] = await Promise.all([
        api.get<{ id?: string; status?: string; variance?: number; counterId?: string } | null>(
          `/cash/active?counterId=${encodeURIComponent(selected)}`,
        ),
        api.get<{ suggestedOpening: number | null }>("/cash/opening-suggestion").catch(() => ({ data: null })),
      ]);
      if (suggestRes.data?.suggestedOpening != null) {
        setSuggested(suggestRes.data.suggestedOpening);
        setOpeningCash((prev) => (prev === "" ? String(suggestRes.data!.suggestedOpening) : prev));
      }
      if (activeRes.data?.status === "OPEN") {
        if (activeRes.data.counterId) {
          writePosCounterId(activeRes.data.counterId);
          setCounterId(activeRes.data.counterId);
        }
        setExistingOpen(true);
        return;
      }
      if (activeRes.data?.status === "PENDING_APPROVAL") {
        setPendingApproval(true);
        setPendingRegisterId(activeRes.data.id ?? null);
      }
    } catch {
      /* show open form */
    } finally {
      setChecking(false);
    }
  }, []);

  React.useEffect(() => {
    if (!branchReady) {
      setChecking(true);
      return;
    }
    void loadForBranch(activeBranchId);
  }, [branchReady, activeBranchId, loadForBranch]);

  const checkCounterActive = React.useCallback(async (next: string) => {
    if (!next) {
      setExistingOpen(false);
      return;
    }
    try {
      const activeRes = await api.get<{ id?: string; status?: string; variance?: number; counterId?: string } | null>(
        `/cash/active?counterId=${encodeURIComponent(next)}`,
      );
      if (activeRes.data?.status === "OPEN") {
        if (activeRes.data.counterId) writePosCounterId(activeRes.data.counterId);
        setExistingOpen(true);
        return;
      }
      setExistingOpen(false);
      if (activeRes.data?.status === "PENDING_APPROVAL") {
        setPendingApproval(true);
        setPendingRegisterId(activeRes.data.id ?? null);
      } else {
        setPendingApproval(false);
        setPendingRegisterId(null);
      }
    } catch {
      setExistingOpen(false);
    }
  }, []);

  const handleBranchChange = (branchId: string) => {
    const b = branches.find((x) => x.id === branchId);
    if (!b || b.id === activeBranchId) return;
    setBranch(b.id, b.name);
    setCounterId("");
    setExistingOpen(false);
    setOpeningCash("");
    // loadForBranch runs via activeBranchId effect after setBranch clears counter
  };

  const handleCounterChange = (next: string) => {
    setCounterId(next);
    if (next) writePosCounterId(next);
    else clearPosCounterId();
    setExistingOpen(false);
    void checkCounterActive(next);
  };

  const handleContinueExisting = () => {
    if (!counterId) {
      toast.error("Select a cashier counter");
      return;
    }
    writePosCounterId(counterId);
    onShiftReady();
  };

  const handleStart = async () => {
    if (!activeBranchId) {
      toast.error("Select a branch");
      return;
    }
    if (!counterId) {
      toast.error("Select a cashier counter");
      return;
    }
    if (existingOpen) {
      handleContinueExisting();
      return;
    }
    const amount = parseFloat(openingCash);
    if (!Number.isFinite(amount) || amount < 0) {
      toast.error("Enter opening cash amount");
      return;
    }
    setSubmitting(true);
    try {
      writePosCounterId(counterId);
      await api.post("/cash/open", { openingCash: amount, counterId });
      toast.success("Shift started");
      onShiftReady();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Failed to start shift");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePending = async () => {
    if (!pendingRegisterId) {
      toast.error("Pending shift not found — open Cash Management to approve");
      return;
    }
    setApproving(true);
    try {
      await api.put(`/cash/${pendingRegisterId}/approve`);
      toast.success("Variance approved — you can start a new shift");
      setPendingApproval(false);
      setPendingRegisterId(null);
      setExistingOpen(false);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Approval failed");
    } finally {
      setApproving(false);
    }
  };

  const cashierName = user?.name ?? "Cashier";
  const today = new Date().toLocaleDateString("en-LK", { day: "2-digit", month: "2-digit", year: "numeric" });
  const FLOAT_PRESETS = [5000, 10000, 15000, 20000];
  const selectedCounter = counters.find((c) => c.id === counterId);
  const branchLabel = activeBranchName ?? branches.find((b) => b.id === activeBranchId)?.name ?? "Branch";

  if (!branchReady || checking) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ background: "var(--pos-overlay)" }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-10 w-10 animate-spin" style={{ color: "#ffffff" }} data-pos-on-accent="" />
          <p className="text-sm text-white/70">Loading branch & counters…</p>
        </div>
      </div>
    );
  }

  if (pendingApproval) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "var(--pos-overlay)" }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
          style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
        >
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(245,158,11,0.15)" }}>
                <AlertTriangle className="h-6 w-6 text-amber-400" />
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Variance pending approval</h2>
                <p className="text-xs" style={{ color: "var(--pos-muted)" }}>Manager must approve before a new shift</p>
              </div>
            </div>
            {canApprove ? (
              <Button
                onClick={() => void handleApprovePending()}
                disabled={approving}
                className="w-full h-11 gap-2 font-bold"
                style={{ background: "var(--pos-success-grad)" }}
              >
                {approving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Approve variance
              </Button>
            ) : (
              <p className="text-sm text-amber-300/90">Ask a manager to approve in Cash Management.</p>
            )}
            {onClose && (
              <Button type="button" variant="outline" className="w-full" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "var(--pos-overlay)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "var(--pos-border)" }}>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(16,185,129,0.15)" }}>
              <Banknote className="h-5 w-5" style={{ color: "var(--pos-success-soft)" }} />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">
                {existingOpen ? "Continue cash shift" : "Start cash shift"}
              </h2>
              <p className="text-xs" style={{ color: "var(--pos-muted)" }}>
                Select branch & counter before sales
              </p>
            </div>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10">
              <X className="h-4 w-4" style={{ color: "var(--pos-muted)" }} />
            </button>
          )}
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-white/50 text-xs">Cashier</p>
              <p className="text-white font-semibold truncate">{cashierName}</p>
            </div>
            <div>
              <p className="text-white/50 text-xs">Date</p>
              <p className="text-white font-semibold">{today}</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" /> Branch
            </Label>
            {branches.length <= 1 ? (
              <div
                className="w-full h-11 px-3 rounded-xl text-sm text-white flex items-center"
                style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
              >
                {branchLabel}
              </div>
            ) : (
              <select
                value={activeBranchId ?? ""}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="w-full h-11 px-3 rounded-xl text-sm text-white outline-none"
                style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
              >
                <option value="">Select branch…</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="space-y-2">
            <Label className="text-white/70 flex items-center gap-1.5">
              <Monitor className="h-3.5 w-3.5" /> Cashier counter
            </Label>
            <select
              value={counterId}
              disabled={!activeBranchId || counters.length === 0}
              onChange={(e) => handleCounterChange(e.target.value)}
              className="w-full h-11 px-3 rounded-xl text-sm text-white outline-none disabled:opacity-50"
              style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}
            >
              <option value="">
                {!activeBranchId
                  ? "Select branch first…"
                  : counters.length === 0
                    ? "No counters for this branch"
                    : "Select counter…"}
              </option>
              {counters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
            {selectedCounter && (
              <p className="text-[10px]" style={{ color: "var(--pos-muted)" }}>
                Sales on this terminal will use {selectedCounter.name}
                {branchLabel ? ` · ${branchLabel}` : ""}
              </p>
            )}
            {counters.length === 0 && activeBranchId && (
              <p className="text-[10px] text-amber-300/90">
                Add counters in Cash → Counters for this branch.
              </p>
            )}
          </div>

          {existingOpen ? (
            <div
              className="rounded-xl px-3 py-2.5 text-xs space-y-1"
              style={{ background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.35)" }}
            >
              <p className="font-semibold text-emerald-300">Open shift found on this counter</p>
              <p style={{ color: "var(--pos-muted)" }}>Continue to sell on the selected branch & counter.</p>
            </div>
          ) : (
            <>
              {suggested != null && (
                <p className="text-[10px]" style={{ color: "var(--pos-success-soft)" }}>
                  Suggested from last close: LKR {formatNumber(suggested)}
                </p>
              )}
              <div className="space-y-2">
                <Label className="text-white/70">Opening amount (LKR)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  placeholder="10,000.00"
                  value={openingCash}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    const parts = v.split(".");
                    const cleaned = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : v;
                    setOpeningCash(cleaned);
                  }}
                  onFocus={(e) => e.target.select()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleStart();
                    }
                    if (e.key === "Escape" && onClose) {
                      e.preventDefault();
                      onClose();
                    }
                  }}
                  className="h-12 text-lg font-bold bg-[var(--pos-input)] border-[var(--pos-border)]"
                />
                <div className="flex flex-wrap gap-2">
                  {FLOAT_PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setOpeningCash(String(p))}
                      className="px-2.5 py-1 text-[10px] rounded-lg border font-medium transition-all"
                      style={{
                        background: openingCash === String(p) ? "var(--pos-success)" : "var(--pos-card)",
                        borderColor: openingCash === String(p) ? "var(--pos-success)" : "var(--pos-border)",
                        color: openingCash === String(p) ? "#fff" : "var(--pos-muted)",
                      }}
                    >
                      {formatNumber(p)}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-white/40">Count your drawer float before starting sales. Cash sales auto-track in drawer.</p>
            </>
          )}

          <Button
            onClick={() => void handleStart()}
            disabled={submitting || !activeBranchId || !counterId}
            data-pos-accent=""
            className="pos-cta w-full h-11 gap-2 font-bold"
            style={{ background: "var(--pos-success-grad)", color: "#ffffff" }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {existingOpen ? "Continue Shift" : "Start Shift"}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
