"use client";

import * as React from "react";
import { Loader2, TrendingDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { formatNumber } from "@/lib/utils";

const CATEGORIES = [
  "Payroll", "Rent", "Utilities", "Marketing", "Operations",
  "Assets", "Logistics", "Maintenance", "Other",
];
const PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "UPI", label: "UPI" },
];

type ExpenseRow = {
  id: string;
  description: string;
  amount: number;
  date: string;
  categoryId?: string | null;
  paymentMethod: string;
};

export function PosQuickExpensePanel({
  onBack,
}: {
  onBack: () => void;
}) {
  const { profile } = useShopWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const [busy, setBusy] = React.useState(false);
  const [amount, setAmount] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [categoryId, setCategoryId] = React.useState("Operations");
  const [method, setMethod] = React.useState("CASH");
  const [reference, setReference] = React.useState("");
  const [chequeDue, setChequeDue] = React.useState("");
  const [chequeBank, setChequeBank] = React.useState("");
  const [recent, setRecent] = React.useState<ExpenseRow[]>([]);

  const loadRecent = React.useCallback(async () => {
    try {
      const res = await api.get<{ data: ExpenseRow[] }>("/accounting/expenses?limit=10");
      setRecent(res.data?.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  React.useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const submit = async () => {
    const amt = parseFloat(amount);
    if (!(amt > 0)) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!description.trim()) {
      toast.error("Description required");
      return;
    }
    if (method === "CHEQUE" && !reference.trim()) {
      toast.error("Enter cheque number in Reference");
      return;
    }

    setBusy(true);
    try {
      await api.post("/accounting/expenses", {
        amount: amt,
        description: description.trim(),
        date,
        categoryId: categoryId || undefined,
        paymentMethod: method,
        reference: reference.trim() || undefined,
        ...(method === "CHEQUE"
          ? {
              chequeNumber: reference.trim(),
              chequeDueDate: chequeDue || undefined,
              chequeBankName: chequeBank.trim() || undefined,
            }
          : {}),
      });
      toast.success(`Expense recorded: LKR ${formatNumber(amt)}`);
      setAmount("");
      setDescription("");
      setReference("");
      setChequeDue("");
      setChequeBank("");
      setDate(today);
      setCategoryId("Operations");
      setMethod("CASH");
      void loadRecent();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to record expense");
    } finally {
      setBusy(false);
    }
  };

  const fieldStyle = {
    background: "#1a2b4a",
    border: "1px solid #1e3356",
    color: "#fff",
  } as const;

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4" style={{ color: "#f59e0b" }} />
          <h2 className="text-white font-bold text-base">Quick Expense</h2>
          <Badge className="ml-1 text-[10px]" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
            {profile.label}
          </Badge>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 h-8 rounded-lg"
          style={{ color: "#6a8ab8" }}
        >
          ← Back
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 flex-1 min-h-0">
        <div
          className="rounded-xl border p-4 space-y-3 overflow-y-auto"
          style={{ background: "#162338", borderColor: "#1e3356" }}
        >
          <p className="text-[11px]" style={{ color: "#6a8ab8" }}>
            Record shop expenses from the counter (petty cash, transport, etc.).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Amount (LKR) *</label>
              <Input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-10 rounded-xl border-0 text-white"
                style={fieldStyle}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Date *</label>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-10 rounded-xl border-0 text-white"
                style={fieldStyle}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Description *</label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Transport / Packing bags"
              className="h-10 rounded-xl border-0 text-white"
              style={fieldStyle}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Category</label>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full h-10 rounded-xl text-sm px-3 outline-none"
                style={fieldStyle}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Paid by</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full h-10 rounded-xl text-sm px-3 outline-none"
                style={fieldStyle}
              >
                {PAY_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>
              {method === "CHEQUE" ? "Cheque number *" : "Reference"}
            </label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "CHEQUE" ? "Cheque number" : "Optional receipt / cheque no."}
              className="h-10 rounded-xl border-0 text-white"
              style={fieldStyle}
            />
          </div>

          {method === "CHEQUE" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Cheque bank</label>
                <Input
                  value={chequeBank}
                  onChange={(e) => setChequeBank(e.target.value)}
                  placeholder="e.g. BOC"
                  className="h-10 rounded-xl border-0 text-white"
                  style={fieldStyle}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Due date</label>
                <Input
                  type="date"
                  value={chequeDue}
                  onChange={(e) => setChequeDue(e.target.value)}
                  className="h-10 rounded-xl border-0 text-white"
                  style={fieldStyle}
                />
              </div>
            </div>
          )}

          <Button
            onClick={() => void submit()}
            disabled={busy}
            className="w-full h-10 gap-1.5"
            style={{ background: "linear-gradient(135deg,#f59e0b,#ea580c)", color: "#fff" }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
            Record Expense
          </Button>
        </div>

        <div
          className="rounded-xl border p-4 overflow-y-auto min-h-0"
          style={{ background: "#162338", borderColor: "#1e3356" }}
        >
          <p className="text-xs font-semibold mb-3" style={{ color: "#93c5fd" }}>Recent expenses</p>
          {recent.length === 0 ? (
            <p className="text-xs" style={{ color: "#4a6a8a" }}>No recent expenses</p>
          ) : (
            <div className="space-y-2">
              {recent.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border p-2.5"
                  style={{ background: "#0f1f3a", borderColor: "#1e3356" }}
                >
                  <div className="flex justify-between gap-2">
                    <p className="text-xs font-bold text-white truncate">{e.description}</p>
                    <p className="text-xs font-bold tabular-nums shrink-0" style={{ color: "#fbbf24" }}>
                      LKR {formatNumber(e.amount)}
                    </p>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: "#6a8ab8" }}>
                    {e.categoryId || "—"} · {e.paymentMethod} ·{" "}
                    {new Date(e.date).toLocaleDateString("en-LK", { day: "2-digit", month: "short" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
