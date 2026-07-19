"use client";

import * as React from "react";
import { Banknote, Loader2, RefreshCw, TrendingDown, Truck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { formatNumber } from "@/lib/utils";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";
import { PosRegisterSupplier } from "@/components/pos/pos-register-supplier";

const INPUT_CLS =
  "w-full h-10 rounded-xl px-3 text-sm text-white outline-none focus:border-[#4f6ef7] transition-colors";
const INPUT_STYLE = { background: "#1a2b4a", border: "1px solid #1e3356" } as const;

const PAY_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "UPI", label: "UPI" },
];

type Mode = "expense" | "supplier";

type ExpenseRow = {
  id: string;
  description: string;
  amount: number;
  date: string;
  categoryId?: string | null;
  paymentMethod: string;
};

type SupplierRow = {
  id: string;
  name: string;
  phone?: string | null;
  balance?: number;
  code?: string;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  paidAt: string;
  reference?: string | null;
  supplier?: { id: string; name: string; code?: string } | null;
};

export function PosQuickExpensePanel({
  onBack,
}: {
  onBack: () => void;
}) {
  const { profile } = useShopWorkspace();
  const today = new Date().toISOString().slice(0, 10);
  const [mode, setMode] = React.useState<Mode>("expense");
  const [busy, setBusy] = React.useState(false);

  // Shared payment fields
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("CASH");
  const [reference, setReference] = React.useState("");
  const [chequeDue, setChequeDue] = React.useState("");
  const [chequeBank, setChequeBank] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Shop expense fields
  const [description, setDescription] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [categoryId, setCategoryId] = React.useState("Other Expenses");
  const [recent, setRecent] = React.useState<ExpenseRow[]>([]);

  // Supplier payment fields
  const [suppliers, setSuppliers] = React.useState<SupplierRow[]>([]);
  const [supplierLoading, setSupplierLoading] = React.useState(false);
  const [supplierId, setSupplierId] = React.useState("");
  const [recentPayments, setRecentPayments] = React.useState<PaymentRow[]>([]);

  const selectedSupplier = React.useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  const loadRecent = React.useCallback(async () => {
    try {
      const res = await api.get<{ data: ExpenseRow[] }>("/accounting/expenses?limit=10");
      setRecent(res.data?.data ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  const loadSuppliers = React.useCallback(async () => {
    setSupplierLoading(true);
    try {
      const [supRes, payRes] = await Promise.all([
        api.get<{ data: SupplierRow[] } | SupplierRow[]>("/suppliers?limit=200"),
        api.get<{ payments: PaymentRow[] }>("/suppliers/ap/payments?limit=10"),
      ]);
      const raw = supRes.data;
      const list = Array.isArray(raw) ? raw : raw?.data ?? [];
      setSuppliers(
        [...list].sort((a, b) => (b.balance ?? 0) - (a.balance ?? 0) || a.name.localeCompare(b.name)),
      );
      setRecentPayments(payRes.data?.payments ?? []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load suppliers");
    } finally {
      setSupplierLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  React.useEffect(() => {
    if (mode === "supplier") void loadSuppliers();
  }, [mode, loadSuppliers]);

  const resetShared = () => {
    setAmount("");
    setReference("");
    setChequeDue("");
    setChequeBank("");
    setNotes("");
    setMethod("CASH");
  };

  const submitExpense = async () => {
    const amt = parseFloat(amount);
    if (!(amt > 0)) { toast.error("Enter a valid amount"); return; }
    if (!description.trim()) { toast.error("Description required"); return; }
    if (method === "CHEQUE" && !reference.trim()) {
      toast.error("Enter cheque number");
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
      setDescription("");
      setDate(today);
      setCategoryId("Other Expenses");
      resetShared();
      void loadRecent();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to record expense");
    } finally {
      setBusy(false);
    }
  };

  const submitSupplierPayment = async () => {
    const amt = parseFloat(amount);
    if (!supplierId) { toast.error("Select a supplier"); return; }
    if (!(amt > 0)) { toast.error("Enter a valid amount"); return; }
    if (method === "CHEQUE" && !reference.trim()) {
      toast.error("Enter cheque number");
      return;
    }
    if (method === "CHEQUE" && !chequeDue.trim()) {
      toast.error("Cheque due date is required");
      return;
    }
    const bal = selectedSupplier?.balance ?? 0;
    if (bal > 0 && amt > bal + 0.01) {
      toast.error(`Amount exceeds outstanding (LKR ${formatNumber(bal)})`);
      return;
    }

    setBusy(true);
    try {
      const res = await api.post<{ appliedTotal?: number }>(`/suppliers/${supplierId}/ap/payment`, {
        amount: amt,
        method,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        ...(method === "CHEQUE"
          ? {
              chequeNumber: reference.trim(),
              chequeDueDate: chequeDue.trim(),
              chequeBankName: chequeBank.trim() || undefined,
            }
          : {}),
      });
      const applied = res.data?.appliedTotal ?? amt;
      toast.success(`Supplier paid: LKR ${formatNumber(applied)} → ${selectedSupplier?.name ?? "supplier"}`);
      resetShared();
      setNotes("");
      void loadSuppliers();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Supplier payment failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden p-4 gap-3">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(245,158,11,0.15)" }}>
            <TrendingDown className="h-4 w-4" style={{ color: "#f59e0b" }} />
          </div>
          <h2 className="text-white font-bold text-base">Quick Expense</h2>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
            {profile.label}
          </span>
        </div>
        <button
          onClick={onBack}
          className="text-xs font-semibold px-3 h-8 rounded-lg transition-colors hover:bg-white/10"
          style={{ color: "#6a8ab8" }}
        >
          ← Back
        </button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1.5 shrink-0 p-1 rounded-xl" style={{ background: "#0f1f3a", border: "1px solid #1e3356" }}>
        {([
          { id: "expense" as const, label: "Shop Expense", icon: TrendingDown },
          { id: "supplier" as const, label: "Supplier Payment", icon: Truck },
        ]).map((tab) => {
          const active = mode === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMode(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-bold transition-all"
              style={{
                background: active ? "rgba(79,110,247,0.25)" : "transparent",
                color: active ? "#fff" : "#6a8ab8",
                border: active ? "1px solid rgba(79,110,247,0.4)" : "1px solid transparent",
              }}
            >
              <tab.icon className="h-3.5 w-3.5" style={{ color: active ? "#4f6ef7" : "#6a8ab8" }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-3 flex-1 min-h-0">
        {/* Form */}
        <div
          className="rounded-xl border p-4 space-y-3 overflow-y-auto min-h-0"
          style={{ background: "#162338", borderColor: "#1e3356" }}
        >
          <p className="text-[11px]" style={{ color: "#6a8ab8" }}>
            {mode === "expense"
              ? "Record shop expenses from the counter (petty cash, transport, etc.)."
              : "Pay supplier outstanding from the counter — applied FIFO across open bills."}
          </p>

          {mode === "supplier" && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Supplier *</label>
                <PosRegisterSupplier
                  disabled={busy}
                  onRegistered={(s) => {
                    setSuppliers((prev) => (prev.some((x) => x.id === s.id) ? prev : [{ ...s, balance: s.balance ?? 0 }, ...prev]));
                    setSupplierId(s.id);
                  }}
                />
              </div>
              <div className="flex gap-2">
                <select
                  value={supplierId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSupplierId(id);
                    const s = suppliers.find((x) => x.id === id);
                    if (s && (s.balance ?? 0) > 0 && !amount) {
                      setAmount(String(s.balance));
                    }
                  }}
                  disabled={supplierLoading || busy}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                >
                  <option value="">{supplierLoading ? "Loading…" : "Select supplier…"}</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}{(s.balance ?? 0) > 0 ? ` — due LKR ${formatNumber(s.balance!)}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => void loadSuppliers()}
                  disabled={supplierLoading || busy}
                  className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all hover:bg-white/10 disabled:opacity-50"
                  style={{ border: "1px solid #1e3356", color: "#6a8ab8" }}
                >
                  <RefreshCw className={`h-4 w-4 ${supplierLoading ? "animate-spin" : ""}`} />
                </button>
              </div>
              {selectedSupplier && (
                <div
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl"
                  style={{ background: "rgba(79,110,247,0.1)", border: "1px solid rgba(79,110,247,0.3)" }}
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white truncate">{selectedSupplier.name}</p>
                    <p className="text-[10px]" style={{ color: "#6a8ab8" }}>
                      {selectedSupplier.code ?? "—"}
                      {selectedSupplier.phone ? ` · ${selectedSupplier.phone}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[10px] font-semibold uppercase" style={{ color: "#6a8ab8" }}>Outstanding</p>
                    <p className="text-sm font-bold tabular-nums" style={{ color: (selectedSupplier.balance ?? 0) > 0 ? "#fbbf24" : "#10b981" }}>
                      LKR {formatNumber(selectedSupplier.balance ?? 0)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Amount (LKR) *</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={INPUT_CLS}
                style={INPUT_STYLE}
                autoFocus
              />
            </div>
            {mode === "expense" ? (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Date *</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Paid by</label>
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                >
                  {PAY_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {mode === "expense" && (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Description *</label>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Transport / Packing bags"
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Category</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Paid by</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value)}
                    className={INPUT_CLS}
                    style={INPUT_STYLE}
                  >
                    {PAY_METHODS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          )}

          {mode === "supplier" && (
            <div className="space-y-1.5">
              <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional note for this payment"
                className={INPUT_CLS}
                style={INPUT_STYLE}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>
              {method === "CHEQUE" ? "Cheque number *" : "Reference"}
            </label>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder={method === "CHEQUE" ? "Cheque number" : "Optional receipt / cheque no."}
              className={INPUT_CLS}
              style={INPUT_STYLE}
            />
          </div>

          {method === "CHEQUE" && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Cheque bank</label>
                <input
                  value={chequeBank}
                  onChange={(e) => setChequeBank(e.target.value)}
                  placeholder="e.g. BOC"
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold" style={{ color: "#6a8ab8" }}>Due date *</label>
                <input
                  type="date"
                  value={chequeDue}
                  onChange={(e) => setChequeDue(e.target.value)}
                  className={INPUT_CLS}
                  style={INPUT_STYLE}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => void (mode === "expense" ? submitExpense() : submitSupplierPayment())}
            disabled={busy}
            className="w-full h-12 gap-2 rounded-xl flex items-center justify-center text-sm font-bold transition-all hover:opacity-90 disabled:opacity-40"
            style={{
              background: mode === "expense"
                ? "linear-gradient(135deg,#f59e0b,#ea580c)"
                : "linear-gradient(135deg,#4f6ef7,#7c3aed)",
              color: "#fff",
            }}
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "expense" ? (
              <TrendingDown className="h-4 w-4" />
            ) : (
              <Banknote className="h-4 w-4" />
            )}
            {mode === "expense" ? "Record Expense" : "Pay Supplier"}
          </button>
        </div>

        {/* Recent list */}
        <div
          className="rounded-xl border p-4 overflow-y-auto min-h-0 flex flex-col"
          style={{ background: "#162338", borderColor: "#1e3356" }}
        >
          <p className="text-xs font-bold uppercase tracking-wide mb-3 shrink-0" style={{ color: "#6a8ab8" }}>
            {mode === "expense" ? "Recent expenses" : "Recent supplier payments"}
          </p>

          {mode === "expense" ? (
            recent.length === 0 ? (
              <p className="text-xs" style={{ color: "#4a6a8a" }}>No recent expenses</p>
            ) : (
              <div className="space-y-2">
                {recent.map((e) => (
                  <div
                    key={e.id}
                    className="rounded-xl border p-2.5"
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
            )
          ) : recentPayments.length === 0 ? (
            <p className="text-xs" style={{ color: "#4a6a8a" }}>No recent supplier payments</p>
          ) : (
            <div className="space-y-2">
              {recentPayments.map((p) => (
                <div
                  key={p.id}
                  className="rounded-xl border p-2.5"
                  style={{ background: "#0f1f3a", borderColor: "#1e3356" }}
                >
                  <div className="flex justify-between gap-2">
                    <p className="text-xs font-bold text-white truncate">{p.supplier?.name ?? "Supplier"}</p>
                    <p className="text-xs font-bold tabular-nums shrink-0" style={{ color: "#93c5fd" }}>
                      LKR {formatNumber(p.amount)}
                    </p>
                  </div>
                  <p className="text-[10px] mt-0.5" style={{ color: "#6a8ab8" }}>
                    {p.method}
                    {p.reference ? ` · ${p.reference}` : ""}
                    {" · "}
                    {new Date(p.paidAt).toLocaleDateString("en-LK", { day: "2-digit", month: "short" })}
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
