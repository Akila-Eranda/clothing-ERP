"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Loader2, Plus, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { modalBarFooterClass } from "@/components/ui/modal-footer";
import { parseApiList } from "@/lib/parse-api-list";
import { applyAdvanceProblem, defaultAdvanceToApply, paymentSplit } from "@/lib/supplier-advance";
import { useSubmitKey } from "@/lib/submit-key";
import { SupplierSearchSelect } from "@/components/purchases/supplier-search-select";
import { parseSupplierPage, supplierBrowsePath, SUPPLIER_PRELOAD_LIMIT } from "@/lib/supplier-search";

type Supplier = { id: string; code?: string | null; phone?: string | null; name: string; balance?: number; outstandingBalance?: number; advanceBalance?: number };
type AdvanceEntry = { id: string; type: "ADVANCE_IN" | "APPLIED"; amount: number; balanceAfter: number; createdAt: string; notes?: string | null };
type UnpaidPo = { id: string; poNumber: string; dueAmount: number; dueDate: string };
type Payment = {
  id: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt: string;
  poSummary?: string | null;
  supplier: { id: string; code?: string; name: string };
  invoice?: { invoiceNumber: string } | null;
  purchase?: { poNumber: string } | null;
  allocations?: { purchase?: { poNumber: string } | null }[];
};
type BankAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  bankName?: string | null;
  currentBalance?: number;
  isActive?: boolean;
};

const METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "UPI", label: "UPI" },
  { value: "CARD", label: "Card" },
];

const BANK_TYPES = new Set(["CURRENT", "SAVINGS"]);

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

export default function SupplierPaymentsPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierTotal, setSupplierTotal] = useState<number | null>(null);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unpaidPos, setUnpaidPos] = useState<UnpaidPo[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPos, setLoadingPos] = useState(false);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ start: monthStart(), end: today() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Overpayment: keep the excess as the supplier's advance (off unless the user asks).
  const [keepAdvance, setKeepAdvance] = useState(false);
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [applying, setApplying] = useState(false);
  const applyKey = useSubmitKey();
  const [form, setForm] = useState({
    supplierId: "",
    amount: "",
    method: "CASH",
    paidAt: today(),
    reference: "",
    notes: "",
    chequeDueDate: "",
    bankAccountId: "",
  });

  const bankOptions = useMemo(
    () => banks.filter((b) => b.isActive !== false && BANK_TYPES.has(b.type)),
    [banks],
  );
  const selectedBank = useMemo(
    () => bankOptions.find((b) => b.id === form.bankAccountId) ?? null,
    [bankOptions, form.bankAccountId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [supplierRes, paymentRes, dashboardRes, bankRes] = await Promise.all([
        api.get<unknown>(supplierBrowsePath(SUPPLIER_PRELOAD_LIMIT)),
        api.get<{ payments: Payment[] }>(
          `/suppliers/ap/payments?startDate=${range.start}&endDate=${range.end}&limit=500`,
        ),
        api.get<{ kpis?: { totalOutstanding?: number } }>("/suppliers/ap/dashboard"),
        api.get<BankAccount[] | { data: BankAccount[] }>("/accounting/bank-accounts").catch(() => ({ data: [] })),
      ]);
      const supplierPage = parseSupplierPage<Supplier>(supplierRes);
      setSuppliers(supplierPage.rows.length ? supplierPage.rows : parseApiList<Supplier>(supplierRes));
      setSupplierTotal(supplierPage.total);
      setTotalOutstanding(dashboardRes.data?.kpis?.totalOutstanding ?? 0);
      setPayments(paymentRes.data?.payments ?? []);
      const bankList = parseApiList<BankAccount>(bankRes.data);
      setBanks(bankList);
      setForm((f) => {
        if (f.bankAccountId && bankList.some((b) => b.id === f.bankAccountId)) return f;
        const first = bankList.find((b) => b.isActive !== false && BANK_TYPES.has(b.type));
        return first ? { ...f, bankAccountId: first.id } : f;
      });
    } catch (error) {
      toast.error((error as Error).message || "Failed to load supplier payments");
    } finally {
      setLoading(false);
    }
  }, [range.end, range.start]);

  useEffect(() => { void load(); }, [load]);

  const loadUnpaid = useCallback(async (supplierId: string) => {
    if (!supplierId) {
      setUnpaidPos([]);
      setSelected(new Set());
      return;
    }
    setLoadingPos(true);
    try {
      const res = await api.get<{ purchaseOrders: UnpaidPo[]; totalDue: number }>(
        `/suppliers/${supplierId}/ap/unpaid-pos`,
      );
      const rows = res.data?.purchaseOrders ?? [];
      setUnpaidPos(rows);
      setSelected(new Set(rows.map((r) => r.id)));
      const due = rows.reduce((s, r) => s + r.dueAmount, 0);
      setForm((f) => ({ ...f, amount: due > 0 ? due.toFixed(2) : "" }));
    } catch (error) {
      toast.error((error as Error).message || "Failed to load unpaid POs");
      setUnpaidPos([]);
      setSelected(new Set());
    } finally {
      setLoadingPos(false);
    }
  }, []);

  const selectedDue = useMemo(
    () => unpaidPos.filter((p) => selected.has(p.id)).reduce((s, p) => s + p.dueAmount, 0),
    [unpaidPos, selected],
  );
  const allSelected = unpaidPos.length > 0 && selected.size === unpaidPos.length;
  const totalPaid = payments.reduce((sum, payment) => sum + payment.amount, 0);

  const togglePo = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, amount: selectedDue > 0 ? selectedDue.toFixed(2) : "" }));
  }, [selectedDue, open]);

  // Payable and advance side by side + the advance history (reloaded whenever the supplier list reloads,
  // i.e. after every payment and every advance application).
  const [advanceInfo, setAdvanceInfo] = useState<{ outstanding: number; advanceBalance?: number; entries: AdvanceEntry[] } | null>(null);
  useEffect(() => {
    if (!form.supplierId) { setAdvanceInfo(null); return; }
    let alive = true;
    api.get<{ outstanding: number; advanceBalance?: number; entries: AdvanceEntry[] }>(`/suppliers/${form.supplierId}/ap/advance`)
      .then((r) => { if (alive) setAdvanceInfo({ outstanding: r.data?.outstanding ?? 0, advanceBalance: r.data?.advanceBalance, entries: r.data?.entries ?? [] }); })
      .catch(() => { if (alive) setAdvanceInfo(null); });
    return () => { alive = false; };
  }, [form.supplierId, suppliers]);

  const advanceOfSupplier = advanceInfo?.advanceBalance
    ?? suppliers.find((x) => x.id === form.supplierId)?.advanceBalance
    ?? 0;
  const split = paymentSplit(Number(form.amount), selectedDue);

  // Offer the whole usable advance whenever the supplier or the selection changes.
  useEffect(() => {
    setAdvanceAmount(defaultAdvanceToApply(advanceOfSupplier, selectedDue) > 0 ? defaultAdvanceToApply(advanceOfSupplier, selectedDue).toFixed(2) : "");
  }, [advanceOfSupplier, selectedDue, form.supplierId]);

  const applyAdvance = async () => {
    const amount = Number(advanceAmount);
    const problem = applyAdvanceProblem(amount, advanceOfSupplier, selectedDue, selected.size);
    if (problem) { toast.error(problem); return; }
    setApplying(true);
    try {
      // The same key on a retry (double click / lost response) applies nothing twice.
      const r = await api.post<{ applied: number; advanceBalance: number; outstanding: number; replayed?: boolean }>(
        `/suppliers/${form.supplierId}/ap/advance/apply`,
        { amount, purchaseIds: [...selected], clientRequestId: applyKey.current() },
      );
      applyKey.reset();
      toast.success(`Advance applied: LKR ${formatNumber(r.data.applied)} · advance left LKR ${formatNumber(r.data.advanceBalance)} · balance due LKR ${formatNumber(r.data.outstanding)}`);
      await load();
      await loadUnpaid(form.supplierId);
    } catch (error) {
      toast.error((error as Error).message || "Could not apply the advance");
    } finally {
      setApplying(false);
    }
  };

  const submit = async () => {
    const amount = Number(form.amount);
    if (!form.supplierId || !Number.isFinite(amount) || amount <= 0 || !form.paidAt) {
      toast.error("Supplier, amount and payment date are required");
      return;
    }
    // Nothing to select (no unpaid PO) is fine only when the whole payment is kept as supplier advance.
    if (selected.size === 0 && !(keepAdvance && unpaidPos.length === 0)) {
      toast.error("Select at least one unpaid purchase order");
      return;
    }
    if (amount > selectedDue + 0.01 && !keepAdvance) {
      toast.error(`Amount exceeds selected balance due (LKR ${formatNumber(selectedDue)}). Tick "Keep the excess as supplier advance" to overpay.`);
      return;
    }
    if (form.method === "CHEQUE" && !form.reference.trim()) {
      toast.error("Cheque number is required");
      return;
    }
    if (form.method === "CHEQUE" && !form.chequeDueDate.trim()) {
      toast.error("Cheque due date is required");
      return;
    }
    if ((form.method === "CHEQUE" || form.method === "BANK_TRANSFER") && !form.bankAccountId) {
      toast.error("Select your company bank account");
      return;
    }
    setSaving(true);
    try {
      const result = await api.post<{ supplierBalance: number; poSummary?: string; advanceAmount?: number; advanceBalance?: number | null }>(
        `/suppliers/${form.supplierId}/ap/payment`,
        {
          amount,
          method: form.method,
          paidAt: form.paidAt,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
          ...(keepAdvance ? { allowAdvance: true } : {}),
          ...(selected.size > 0 ? { purchaseIds: [...selected] } : {}),
          ...(form.method === "CHEQUE" || form.method === "BANK_TRANSFER"
            ? {
                bankAccountId: form.bankAccountId,
                chequeBankAccountId: form.bankAccountId,
                chequeBankName: selectedBank?.bankName || selectedBank?.name || undefined,
              }
            : {}),
          ...(form.method === "CHEQUE"
            ? {
                chequeNumber: form.reference.trim(),
                chequeDueDate: form.chequeDueDate.trim(),
              }
            : {}),
        },
      );
      toast.success(
        `Payment recorded${result.data.poSummary ? ` · ${result.data.poSummary}` : ""}. Balance due: LKR ${formatNumber(result.data.supplierBalance ?? 0)}${
          (result.data.advanceAmount ?? 0) > 0 ? ` · Advance kept: LKR ${formatNumber(result.data.advanceAmount ?? 0)} (available LKR ${formatNumber(result.data.advanceBalance ?? 0)})` : ""
        }`,
      );
      setKeepAdvance(false);
      setOpen(false);
      setForm((f) => ({
        supplierId: "",
        amount: "",
        method: "CASH",
        paidAt: today(),
        reference: "",
        notes: "",
        chequeDueDate: "",
        bankAccountId: f.bankAccountId,
      }));
      setUnpaidPos([]);
      setSelected(new Set());
      await load();
    } catch (error) {
      toast.error((error as Error).message || "Failed to record supplier payment");
    } finally {
      setSaving(false);
    }
  };

  const historyLabel = (payment: Payment) =>
    payment.poSummary
    || payment.allocations?.map((a) => a.purchase?.poNumber).filter(Boolean).join(", ")
    || payment.purchase?.poNumber
    || payment.invoice?.invoiceNumber
    || "—";

  return (
    <div className="page-shell">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight">Supplier Payments</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Settle purchase order dues — AP cash-out, not an operating expense
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void load()} className="h-10 rounded-[12px] gap-1.5 px-3.5">
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <div className="hidden sm:block h-6 w-px bg-border mx-0.5" />
          <Button onClick={() => setOpen(true)} className="h-10 rounded-[12px] gap-1.5 px-4">
            <Plus className="h-[18px] w-[18px]" /> Record Payment
          </Button>
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        {[
          { label: "Paid in Period", value: totalPaid, icon: Banknote },
          { label: "Payment Count", value: payments.length, icon: Wallet, count: true },
          {
            label: "Open Supplier Balance",
            value: totalOutstanding,
            icon: Banknote,
          },
        ].map((item) => (
          <Card key={item.label} className="rounded-xl">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
                <item.icon className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-lg">
                  {item.count ? item.value : `LKR ${formatNumber(item.value)}`}
                </p>
                <p className="text-xs text-muted-foreground">{item.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="rounded-xl">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="w-36" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="w-36" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-3 pr-4">Payment Date</th>
                  <th className="py-3 pr-4">Supplier</th>
                  <th className="py-3 pr-4">Purchase Orders</th>
                  <th className="py-3 pr-4">Method</th>
                  <th className="py-3 pr-4">Reference</th>
                  <th className="py-3 text-right">Amount Paid</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b last:border-0">
                    <td className="py-3 pr-4">{new Date(payment.paidAt).toLocaleDateString("en-LK")}</td>
                    <td className="py-3 pr-4 font-medium">{payment.supplier.name}</td>
                    <td className="py-3 pr-4">{historyLabel(payment)}</td>
                    <td className="py-3 pr-4">{payment.method.replace(/_/g, " ")}</td>
                    <td className="py-3 pr-4 text-muted-foreground">{payment.reference || "—"}</td>
                    <td className="py-3 text-right font-bold">LKR {formatNumber(payment.amount)}</td>
                  </tr>
                ))}
                {!loading && payments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-muted-foreground">
                      No supplier payments in this period
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="bg-background rounded-2xl border shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b shrink-0">
              <h2 className="font-bold">Record Supplier Payment</h2>
              <p className="text-xs text-muted-foreground mt-0.5">FIFO allocate across selected unpaid POs</p>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-1.5">
                <Label>Supplier *</Label>
                <SupplierSearchSelect
                  suppliers={suppliers}
                  value={form.supplierId}
                  totalSuppliers={supplierTotal}
                  loading={loading}
                  onChange={(supplierId) => {
                    setForm((f) => ({ ...f, supplierId, amount: "" }));
                    void loadUnpaid(supplierId);
                  }}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Unpaid Purchase Orders *</Label>
                  {unpaidPos.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-blue-600 hover:underline"
                      onClick={() =>
                        setSelected(allSelected ? new Set() : new Set(unpaidPos.map((p) => p.id)))
                      }
                    >
                      {allSelected ? "Clear all" : "Select all"}
                    </button>
                  )}
                </div>
                {loadingPos ? (
                  <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading POs…
                  </div>
                ) : !form.supplierId ? (
                  <p className="text-xs text-muted-foreground">Select a supplier first</p>
                ) : unpaidPos.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No unpaid received POs for this supplier</p>
                ) : (
                  <div className="rounded-xl border max-h-44 overflow-y-auto divide-y">
                    {unpaidPos.map((po) => (
                      <label key={po.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40">
                        <input
                          type="checkbox"
                          checked={selected.has(po.id)}
                          onChange={() => togglePo(po.id)}
                          className="rounded border"
                        />
                        <span className="font-mono text-xs flex-1">{po.poNumber}</span>
                        <span className="text-sm font-semibold">LKR {formatNumber(po.dueAmount)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-xl bg-muted/50 p-3 flex justify-between text-sm">
                <span>Balance Due (selected)</span>
                <strong data-testid="selected-due">LKR {formatNumber(selectedDue)}</strong>
              </div>
              {form.supplierId && (
                <div className="rounded-xl border border-success/30 bg-success/5 p-3 space-y-2 text-sm" data-testid="supplier-advance-panel">
                  {advanceInfo && (
                    <div className="flex justify-between">
                      <span>Total payable (all bills)</span>
                      <strong data-testid="payable-outstanding">LKR {formatNumber(advanceInfo.outstanding)}</strong>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Supplier advance available</span>
                    <strong data-testid="advance-available">LKR {formatNumber(advanceOfSupplier)}</strong>
                  </div>
                  {advanceOfSupplier > 0.009 && selected.size > 0 && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Use advance on the selected bills (LKR)</Label>
                        <Input
                          type="number" min="0.01" step="0.01" className="w-44" aria-label="Advance to apply"
                          value={advanceAmount}
                          onChange={(e) => setAdvanceAmount(e.target.value)}
                        />
                      </div>
                      <Button type="button" size="sm" variant="outline" disabled={applying || saving} onClick={() => void applyAdvance()} data-testid="apply-advance">
                        {applying && <Loader2 className="h-4 w-4 animate-spin" />} Apply advance
                      </Button>
                    </div>
                  )}
                  {advanceInfo && advanceInfo.entries.length > 0 && (
                    <details className="text-xs" data-testid="advance-history">
                      <summary className="cursor-pointer text-muted-foreground">Advance history ({advanceInfo.entries.length})</summary>
                      <div className="mt-1 max-h-40 overflow-y-auto divide-y divide-border">
                        {advanceInfo.entries.map((e) => (
                          <div key={e.id} className="flex justify-between gap-2 py-1 tabular-nums" data-testid="advance-history-row">
                            <span>{new Date(e.createdAt).toLocaleString()} · {e.type === "ADVANCE_IN" ? "Kept from payment" : "Applied to bill"}</span>
                            <span>{e.amount >= 0 ? "+" : "−"}LKR {formatNumber(Math.abs(e.amount))} → LKR {formatNumber(e.balanceAfter)}</span>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Amount Paid *</Label>
                  <Input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Payment Date *</Label>
                  <Input
                    type="date"
                    value={form.paidAt}
                    onChange={(e) => setForm((f) => ({ ...f, paidAt: e.target.value }))}
                  />
                </div>
              </div>

              {split.excess > 0.009 && (
                <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm space-y-2" data-testid="overpayment-box">
                  <p>
                    This is <strong>LKR {formatNumber(split.excess)}</strong> more than the selected bills owe
                    (LKR {formatNumber(split.toBills)} pays the bills).
                  </p>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={keepAdvance} onChange={(e) => setKeepAdvance(e.target.checked)} data-testid="keep-advance" />
                    <span>Keep the excess as supplier advance (use it on a future bill)</span>
                  </label>
                </div>
              )}
              {unpaidPos.length === 0 && form.supplierId && !loadingPos && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={keepAdvance} onChange={(e) => setKeepAdvance(e.target.checked)} data-testid="keep-advance-only" />
                  <span>Nothing is payable: keep this whole payment as supplier advance</span>
                </label>
              )}

              <div className="space-y-1.5">
                <Label>Payment Method</Label>
                <Select value={form.method} onValueChange={(method) => setForm((f) => ({ ...f, method }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {METHODS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>{form.method === "CHEQUE" ? "Cheque Number *" : "Reference"}</Label>
                <Input
                  value={form.reference}
                  onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                  placeholder={form.method === "CHEQUE" ? "Cheque number" : "Optional"}
                />
              </div>

              {form.method === "CHEQUE" && (
                <div className="space-y-1.5">
                  <Label>Cheque Date *</Label>
                  <Input
                    type="date"
                    value={form.chequeDueDate}
                    min="2000-01-01"
                    max="2099-12-31"
                    onChange={(e) => setForm((f) => ({ ...f, chequeDueDate: e.target.value }))}
                  />
                  <p className="text-[10px] text-muted-foreground">Future (post-dated) cheque dates are allowed.</p>
                </div>
              )}

              {(form.method === "CHEQUE" || form.method === "BANK_TRANSFER") && (
                <div className="space-y-1.5">
                  <Label>Our bank account *</Label>
                  <Select
                    value={form.bankAccountId || "_none"}
                    onValueChange={(bankAccountId) =>
                      setForm((f) => ({ ...f, bankAccountId: bankAccountId === "_none" ? "" : bankAccountId }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select bank account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">
                        {bankOptions.length === 0 ? "No banks — add in Accounting → Banks" : "Select bank account…"}
                      </SelectItem>
                      {bankOptions.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.code} · {b.name}
                          {b.bankName ? ` (${b.bankName})` : ""}
                          {typeof b.currentBalance === "number" ? ` — LKR ${formatNumber(b.currentBalance)}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedBank && (
                    <p className="text-[11px] text-muted-foreground">
                      Pays from {selectedBank.bankName || selectedBank.name}
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <div className={modalBarFooterClass}>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
              <Button onClick={() => void submit()} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Record Payment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}