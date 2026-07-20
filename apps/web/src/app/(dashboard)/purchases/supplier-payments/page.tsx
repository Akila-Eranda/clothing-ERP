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

type Supplier = { id: string; code?: string; name: string; balance?: number; outstandingBalance?: number };
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
  const [payments, setPayments] = useState<Payment[]>([]);
  const [unpaidPos, setUnpaidPos] = useState<UnpaidPo[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadingPos, setLoadingPos] = useState(false);
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState({ start: monthStart(), end: today() });
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
      const [supplierRes, paymentRes, bankRes] = await Promise.all([
        api.get<{ data: Supplier[] }>("/suppliers?limit=500"),
        api.get<{ payments: Payment[] }>(
          `/suppliers/ap/payments?startDate=${range.start}&endDate=${range.end}&limit=500`,
        ),
        api.get<BankAccount[] | { data: BankAccount[] }>("/accounting/bank-accounts").catch(() => ({ data: [] })),
      ]);
      setSuppliers(supplierRes.data?.data ?? []);
      setPayments(paymentRes.data?.payments ?? []);
      const rawBanks = bankRes.data;
      const bankList = Array.isArray(rawBanks) ? rawBanks : rawBanks?.data ?? [];
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

  const submit = async () => {
    const amount = Number(form.amount);
    if (!form.supplierId || !Number.isFinite(amount) || amount <= 0 || !form.paidAt) {
      toast.error("Supplier, amount and payment date are required");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one unpaid purchase order");
      return;
    }
    if (amount > selectedDue + 0.01) {
      toast.error(`Amount exceeds selected balance due (LKR ${formatNumber(selectedDue)})`);
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
      const result = await api.post<{ supplierBalance: number; poSummary?: string }>(
        `/suppliers/${form.supplierId}/ap/payment`,
        {
          amount,
          method: form.method,
          paidAt: form.paidAt,
          reference: form.reference || undefined,
          notes: form.notes || undefined,
          purchaseIds: [...selected],
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
        `Payment recorded${result.data.poSummary ? ` · ${result.data.poSummary}` : ""}. Balance due: LKR ${formatNumber(result.data.supplierBalance ?? 0)}`,
      );
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
    <div className="p-4 md:p-5 space-y-4 max-w-[1600px] mx-auto">
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
            value: suppliers.reduce((s, x) => s + (x.outstandingBalance ?? x.balance ?? 0), 0),
            icon: Banknote,
          },
        ].map((item) => (
          <Card key={item.label} className="rounded-[18px]">
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

      <Card className="rounded-[18px]">
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
                <Select
                  value={form.supplierId}
                  onValueChange={(supplierId) => {
                    setForm((f) => ({ ...f, supplierId, amount: "" }));
                    void loadUnpaid(supplierId);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} — Due LKR {formatNumber(s.outstandingBalance ?? s.balance ?? 0)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
                <strong>LKR {formatNumber(selectedDue)}</strong>
              </div>

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
                  <Label>Cheque due date *</Label>
                  <Input
                    type="date"
                    value={form.chequeDueDate}
                    onChange={(e) => setForm((f) => ({ ...f, chequeDueDate: e.target.value }))}
                  />
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
