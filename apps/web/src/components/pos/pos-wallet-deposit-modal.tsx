"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Delete, Loader2, PiggyBank, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { withManagerApproval, ManagerApprovalCancelled } from "@/lib/cash-approval";
import { formatNumber } from "@/lib/utils";
import { isValidCardLast4 } from "@/lib/card-last4";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [500, 1000, 2000, 5000];
const KEYS = ["7", "8", "9", "4", "5", "6", "1", "2", "3", "0", ".", "DEL"];

interface PosWalletDepositModalProps {
  customerId: string;
  customerName: string;
  walletBalance: number;
  onClose: () => void;
  onDone?: (result: { walletBalance: number | null }) => void;
}

/** Deposit money into a customer's wallet (advance) from the POS. Uses the same API as the Customers page top-up. */
export function PosWalletDepositModal({ customerId, customerName, walletBalance, onClose, onDone }: PosWalletDepositModalProps) {
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState<"CASH" | "CARD">("CASH");
  const [last4, setLast4] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState<{ amount: number; balance: number | null } | null>(null);

  const press = (k: string) => {
    setAmount((prev) => {
      if (k === "DEL") return prev.slice(0, -1);
      if (k === "." && prev.includes(".")) return prev;
      if (prev.includes(".") && prev.split(".")[1].length >= 2) return prev;
      return prev + k;
    });
  };

  const submit = React.useCallback(async () => {
    const amt = Math.round(parseFloat(amount) * 100) / 100;
    if (!(amt > 0)) { toast.error("Enter a valid amount"); return; }
    if (method === "CARD" && !isValidCardLast4(last4)) { toast.error("Enter the last 4 digits of the card"); return; }
    setBusy(true);
    try {
      await withManagerApproval(`Approve wallet deposit of LKR ${formatNumber(amt)} (${method})`, (headers) =>
        api.post(`/customers/${customerId}/wallet/topup`, {
          amount: amt,
          kind: "FUNDED",
          paymentMethod: method,
          ...(method === "CARD" ? { cardLast4: last4 } : {}),
          description: `POS wallet deposit — ${customerName}`,
        }, headers ? { headers } : undefined));
      let balance: number | null = null;
      try {
        const c = await api.get<{ walletBalance?: number }>(`/customers/${customerId}`);
        balance = c.data?.walletBalance ?? null;
      } catch { /* informational only */ }
      onDone?.({ walletBalance: balance });
      setDone({ amount: amt, balance });
    } catch (e: unknown) {
      toast.error(e instanceof ManagerApprovalCancelled ? "Deposit not approved. Nothing was recorded." : (e as Error).message || "Deposit failed");
    } finally {
      setBusy(false);
    }
  }, [amount, method, last4, customerId, customerName, onDone]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const shell = "fixed inset-0 z-[200] flex items-center justify-center p-4";

  if (done) {
    return (
      <div className={shell} style={{ background: "var(--pos-overlay)" }}>
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm rounded-2xl border shadow-2xl p-6 text-center space-y-3"
          style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }} role="dialog" aria-modal="true">
          <CheckCircle2 className="h-12 w-12 mx-auto" style={{ color: "var(--pos-success-soft)" }} />
          <p className="text-white font-bold text-lg">Wallet deposit recorded</p>
          <p className="text-3xl font-bold tabular-nums" style={{ color: "var(--pos-success-soft)" }}>LKR {formatNumber(done.amount)}</p>
          <p className="text-xs" style={{ color: "var(--pos-muted)" }}>{customerName}</p>
          {done.balance != null && (
            <p className="text-sm" style={{ color: "var(--pos-text-soft)" }}>Wallet now: <span className="font-bold">LKR {formatNumber(done.balance)}</span></p>
          )}
          <Button autoFocus onClick={onClose} className="w-full h-11 font-bold" style={{ background: "var(--pos-accent-grad)" }}>OK</Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={shell} style={{ background: "var(--pos-overlay)" }}>
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden max-h-[92vh] flex flex-col"
        style={{ background: "var(--pos-panel)", borderColor: "var(--pos-border)" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0" style={{ borderColor: "var(--pos-border)" }}>
          <div className="flex items-center gap-2">
            <PiggyBank className="h-5 w-5" style={{ color: "var(--pos-success-soft)" }} />
            <span className="text-white font-bold">Wallet Deposit</span>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close">
            <X className="h-4 w-4 text-white/60" />
          </button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          <div className="rounded-xl p-3 text-center" style={{ background: "var(--pos-input)", border: "1px solid var(--pos-border)" }}>
            <p className="text-xs font-semibold" style={{ color: "var(--pos-text-soft)" }}>{customerName}</p>
            <p className="text-[11px]" style={{ color: "var(--pos-muted)" }}>Wallet now LKR {formatNumber(walletBalance)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(["CASH", "CARD"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMethod(m)}
                className="h-9 rounded-xl text-sm font-semibold"
                style={{
                  background: method === m ? "rgba(var(--pos-accent-rgb),0.2)" : "var(--pos-card)",
                  border: `1px solid ${method === m ? "rgba(var(--pos-accent-rgb),0.5)" : "var(--pos-border)"}`,
                  color: method === m ? "#a5b4fc" : "var(--pos-muted)",
                }}>
                {m === "CASH" ? "Cash" : "Card"}
              </button>
            ))}
          </div>
          {method === "CARD" && (
            <Input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
              inputMode="numeric" maxLength={4} placeholder="Card last 4 digits" aria-label="Card last 4 digits"
              className="font-mono tracking-widest bg-[var(--pos-input)] border-[var(--pos-border)]" />
          )}
          <div className="space-y-1.5">
            <Label className="text-white/70 text-xs">Amount (LKR)</Label>
            <Input type="text" inputMode="decimal" value={amount}
              onChange={(e) => {
                const v = e.target.value.replace(/[^\d.]/g, "");
                const parts = v.split(".");
                setAmount(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join("")}` : v);
              }}
              placeholder="0.00" autoFocus
              className="h-11 text-lg font-semibold tabular-nums bg-[var(--pos-input)] border-[var(--pos-border)]" />
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {KEYS.map((k) => (
              <button key={k} type="button" onClick={() => press(k)}
                className="h-10 rounded-lg text-sm font-bold flex items-center justify-center active:scale-[0.98]"
                style={{ background: k === "DEL" ? "rgba(239,68,68,0.18)" : "var(--pos-input)", color: k === "DEL" ? "#f87171" : "#ffffff" }}>
                {k === "DEL" ? <Delete className="h-4 w-4" /> : k}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button key={p} type="button" onClick={() => setAmount(String(p))}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold hover:bg-white/10"
                style={{ background: "var(--pos-card)", border: "1px solid var(--pos-border)", color: "var(--pos-muted)" }}>
                {formatNumber(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-5 pt-0 shrink-0 space-y-2">
          <Button onClick={() => void submit()} disabled={busy || !(parseFloat(amount) > 0)}
            className="w-full h-11 gap-2 font-bold" style={{ background: "var(--pos-accent-grad)" }}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PiggyBank className="h-4 w-4" />}
            Deposit LKR {parseFloat(amount) > 0 ? formatNumber(parseFloat(amount)) : "—"}
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full text-white/60 hover:text-white hover:bg-white/5">Cancel</Button>
        </div>
      </motion.div>
    </div>
  );
}
