"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bankFormProblem, EMPTY_BANK_FORM, isBankFormEmpty, type CustomerBankForm } from "@/lib/customer-bank";

type Saved = { bankName: string; accountNumber: string; accountHolderName: string; branchName: string | null; branchCode: string | null } | null;

/** Admin-only tab of the customer screen: bank name, account number, holder, branch and branch code. */
export function CustomerBankDetails({ customerId }: { customerId: string }) {
  const [form, setForm] = React.useState<CustomerBankForm>(EMPTY_BANK_FORM);
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);

  const apply = React.useCallback((d: Saved) => {
    setForm(d ? { bankName: d.bankName, accountNumber: d.accountNumber, accountHolderName: d.accountHolderName, branchName: d.branchName ?? "", branchCode: d.branchCode ?? "" } : EMPTY_BANK_FORM);
  }, []);

  React.useEffect(() => {
    let alive = true;
    setLoaded(false);
    api.get<Saved>(`/customers/${customerId}/bank-details`)
      .then((r) => { if (alive) { apply(r.data ?? null); setLoaded(true); } })
      .catch((e: unknown) => { if (alive) { setError((e as Error).message || "Could not load the bank details"); setLoaded(true); } });
    return () => { alive = false; };
  }, [customerId, apply]);

  const set = (k: keyof CustomerBankForm) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    const problem = bankFormProblem(form);
    if (problem) { setError(problem); return; }
    setError(null);
    setSaving(true);
    try {
      const r = await api.put<Saved>(`/customers/${customerId}/bank-details`, form);
      apply(r.data ?? null);
      setSavedAt(new Date().toLocaleTimeString());
      toast.success(isBankFormEmpty(form) ? "Bank details removed" : "Bank details saved");
    } catch (e) {
      setError((e as Error).message || "Could not save the bank details");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const field = (id: string, label: string, key: keyof CustomerBankForm, required = false, extra: { inputMode?: "text" | "numeric"; maxLength?: number } = {}) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{label}{required && <span className="text-destructive-text"> *</span>}</Label>
      <Input id={id} value={form[key]} onChange={set(key)} disabled={saving} maxLength={extra.maxLength ?? 100} inputMode={extra.inputMode} autoComplete="off" />
    </div>
  );

  return (
    <div className="space-y-3" data-testid="customer-bank-details">
      <p className="text-xs text-muted-foreground">
        Bank account of this customer (for example for paying out a refund or credit). Visible and editable by shop admins only.
        Leave every field empty and save to remove the details.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("bank-name", "Bank name", "bankName", true)}
        {field("bank-account-number", "Account number", "accountNumber", true, { maxLength: 60 })}
        {field("bank-account-holder", "Account holder name", "accountHolderName", true)}
        {field("bank-branch", "Branch", "branchName")}
        {field("bank-branch-code", "Branch code", "branchCode", false, { maxLength: 20 })}
      </div>
      {error && <p role="alert" className="text-sm text-destructive-text">{error}</p>}
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={() => void save()} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save bank details
        </Button>
        {savedAt && <span className="text-xs text-muted-foreground">Saved {savedAt}</span>}
      </div>
    </div>
  );
}
