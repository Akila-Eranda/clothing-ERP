"use client";

import * as React from "react";
import { Landmark, Loader2, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BankDetailsFields } from "@/components/accounting/bank-details-fields";
import { postFile, resolvePublicAssetUrl } from "@/lib/upload";
import {
  accountTypeNeedsBankDetails,
  bankDetailProblems,
  cleanText,
  EMPTY_BANK_DETAILS,
  maskAccountNumber,
  missingBankDetails,
  type BankDetailKey,
  type BankDetailsInput,
} from "@/lib/bank-account";

export type BankAccountRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  isActive: boolean;
  updatedAt: string;
  currentBalance?: number;
};
export type QrLink = { id: string; label: string; bankAccountId: string; imageUrl?: string | null; isActive: boolean; isDefault: boolean };

const TYPES: { value: string; label: string }[] = [
  { value: "CURRENT", label: "Current account" },
  { value: "SAVINGS", label: "Savings account" },
  { value: "CASH_IN_HAND", label: "Cash in hand" },
  { value: "PETTY_CASH", label: "Petty cash" },
];

type Form = { id?: string; updatedAt?: string; code: string; name: string; type: string; isActive: boolean; details: BankDetailsInput };
const EMPTY_FORM: Form = { code: "", name: "", type: "CURRENT", isActive: true, details: EMPTY_BANK_DETAILS };

/**
 * Settings → QR payments → Bank accounts: administrators add, edit, enable / disable the bank accounts that receive
 * QR payments. The five details (bank, account number, holder, branch, branch code) are what the customer sees on the
 * Customer Display together with the QR. The API enforces the permissions and the rules; controls are hidden for
 * users who cannot manage accounts.
 */
export function BankAccountsCard({
  accounts, qrCodes, canManage, loading, onChanged,
}: {
  accounts: BankAccountRow[];
  qrCodes: QrLink[];
  canManage: boolean;
  loading: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [form, setForm] = React.useState<Form | null>(null);
  const [errors, setErrors] = React.useState<Partial<Record<BankDetailKey | "code" | "name", string>>>({});
  const [saving, setSaving] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [qrFile, setQrFile] = React.useState<File | null>(null);
  const [removeQr, setRemoveQr] = React.useState(false);
  const [qrPreviewUrl, setQrPreviewUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!qrFile) {
      setQrPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(qrFile);
    setQrPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [qrFile]);

  const qrFor = (id: string) => qrCodes.filter((q) => q.bankAccountId === id);

  const openEdit = (a: BankAccountRow) => {
    setErrors({});
    setQrFile(null);
    setRemoveQr(false);
    setForm({
      id: a.id, updatedAt: a.updatedAt, code: a.code, name: a.name, type: a.type, isActive: a.isActive,
      details: {
        bankName: a.bankName ?? "", accountNumber: a.accountNumber ?? "", accountHolderName: a.accountHolderName ?? "",
        branchName: a.branchName ?? "", branchCode: a.branchCode ?? "",
      },
    });
  };

  const save = async () => {
    if (!form) return;
    const requireAll = accountTypeNeedsBankDetails(form.type);
    const problems: Partial<Record<BankDetailKey | "code" | "name", string>> = { ...bankDetailProblems(form.details, { requireAll }) };
    if (!form.id && !cleanText(form.code)) problems.code = "Code is required";
    if (!cleanText(form.name)) problems.name = "Display name is required";
    setErrors(problems);
    if (Object.keys(problems).length) { toast.error("Please fix the highlighted fields"); return; }
    setSaving(true);
    try {
      const details = Object.fromEntries(Object.entries(form.details).map(([k, v]) => [k, cleanText(v)]));
      let savedId = form.id;
      if (form.id) {
        await api.put(`/accounting/bank-accounts/${form.id}`, { name: cleanText(form.name), isActive: form.isActive, ...details, expectedUpdatedAt: form.updatedAt });
        toast.success("Bank account updated");
      } else {
        const created = await api.post<BankAccountRow>("/accounting/bank-accounts", { code: cleanText(form.code), name: cleanText(form.name), type: form.type, ...details });
        savedId = created.data.id;
        toast.success("Bank account added");
      }
      if (savedId) {
        const qr = qrFor(savedId)[0];
        if (removeQr && qr) await api.delete(`/payment-qr/${qr.id}/image`);
        if (qrFile) {
          let qrId = qr?.id;
          if (!qrId) {
            const createdQr = await api.post<{ id: string }>("/payment-qr", {
              label: `${cleanText(form.name)} QR`,
              bankAccountId: savedId,
              mode: "STATIC",
              isDefault: true,
            });
            qrId = createdQr.data.id;
          }
          await postFile(`/payment-qr/${qrId}/image`, qrFile);
        }
      }
      setForm(null);
      setQrFile(null);
      setRemoveQr(false);
      await onChanged();
    } catch (e: unknown) {
      const msg = (e as Error).message || "Save failed";
      toast.error(msg);
      if (/changed by someone else/i.test(msg)) await onChanged();        // reload so the next edit starts from the latest values
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (a: BankAccountRow, isActive: boolean) => {
    const used = qrFor(a.id).filter((q) => q.isActive);
    if (!isActive && used.length && !window.confirm(`${used.length} QR code${used.length > 1 ? "s" : ""} use this account (${used.map((q) => q.label).join(", ")}). They will stop appearing at the POS. Disable it?`)) return;
    setBusyId(a.id);
    try {
      await api.put(`/accounting/bank-accounts/${a.id}`, { isActive, expectedUpdatedAt: a.updatedAt });
      toast.success(isActive ? "Bank account enabled" : "Bank account disabled");
      await onChanged();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Update failed");
      await onChanged();
    } finally {
      setBusyId(null);
    }
  };

  const makeDefault = async (q: QrLink) => {
    setBusyId(q.bankAccountId);
    try {
      await api.put(`/payment-qr/${q.id}`, { isDefault: true });
      toast.success(`${q.label} is now the default QR code`);
      await onChanged();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const f = form;
  const requireAll = f ? accountTypeNeedsBankDetails(f.type) : false;
  const formQr = f?.id ? qrFor(f.id)[0] : undefined;

  return (
    <Card data-testid="bank-accounts-card">
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4" /> Bank accounts</CardTitle>
          <CardDescription>
            The accounts that receive QR payments. The customer sees the bank, account number, account holder, branch and branch code
            on the Customer Display together with the QR. {canManage ? "Disabled accounts stop appearing at the POS." : "Only administrators can change bank accounts."}
          </CardDescription>
        </div>
        {canManage && (
          <Button size="sm" className="gap-1.5 shrink-0" data-testid="bank-account-add" onClick={() => { setErrors({}); setForm(EMPTY_FORM); }} disabled={loading}>
            <Plus className="h-4 w-4" /> Add bank account
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 px-6 py-12 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Landmark className="h-6 w-6" />
            </div>
            <p className="font-semibold text-foreground">No bank accounts yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              {canManage ? "Add a bank account to manage balances and receive QR payments." : "No bank accounts are available for this shop."}
            </p>
            {canManage && (
              <Button className="mt-5 gap-1.5" onClick={() => { setErrors({}); setForm(EMPTY_FORM); }} disabled={loading}>
                <Plus className="h-4 w-4" /> Add bank account
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {accounts.map((a) => {
              const missing = accountTypeNeedsBankDetails(a.type) ? missingBankDetails(a) : [];
              const qrs = qrFor(a.id);
              const activeQr = qrs.filter((q) => q.isActive);
              return (
                <div key={a.id} data-testid="bank-account-row" data-code={a.code} data-active={a.isActive ? "true" : "false"} className={`flex min-h-[245px] flex-col rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${a.isActive ? "bg-card" : "bg-muted/30"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Landmark className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-foreground">{a.name}</p>
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.bankName || "Bank account"} · {a.code}</p>
                      </div>
                    </div>
                    <Badge variant={a.isActive ? "success" : "neutral"}>{a.isActive ? "Active" : "Disabled"}</Badge>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1.5">
                    <Badge variant={activeQr.some((q) => q.imageUrl) ? "success" : "neutral"}>
                      {activeQr.some((q) => q.imageUrl) ? "QR configured" : "QR not configured"}
                    </Badge>
                    {missing.length > 0 && <Badge variant="warning" title={`Missing: ${missing.join(", ")}`}>Details incomplete</Badge>}
                  </div>

                  <div className="mt-4 space-y-2 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Branch</span>
                      <span className="text-right font-medium">{[a.branchName, a.branchCode].filter(Boolean).join(" · ") || "—"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Account holder</span>
                      <span className="max-w-[60%] truncate text-right font-medium">{a.accountHolderName || "—"}</span>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <span className="text-muted-foreground">Account number</span>
                      <span className="font-mono text-right text-xs font-medium" data-testid="bank-account-number">{a.accountNumber ? (canManage ? a.accountNumber : maskAccountNumber(a.accountNumber)) : "—"}</span>
                    </div>
                  </div>

                  <div className="mt-auto border-t pt-4">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Current balance</p>
                    <p className="mt-0.5 text-xl font-bold tabular-nums text-foreground">
                      LKR {Number(a.currentBalance ?? 0).toLocaleString("en-LK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>

                  {canManage && (
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <Button size="sm" variant="outline" className="gap-1.5" data-testid="bank-account-edit" onClick={() => openEdit(a)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Switch checked={a.isActive} disabled={busyId === a.id} aria-label={`${a.isActive ? "Disable" : "Enable"} ${a.name}`} data-testid="bank-account-toggle" onCheckedChange={(v) => void toggle(a, v)} />
                        {a.isActive ? "Enabled" : "Disabled"}
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!f} onOpenChange={(o) => { if (!o && !saving) setForm(null); }}>
        <DialogContent className="max-w-xl" data-testid="bank-account-dialog">
          <DialogHeader>
            <DialogTitle>{f?.id ? "Edit bank account" : "Add bank account"}</DialogTitle>
            <DialogDescription>
              {requireAll ? "All details are required: the customer sees them with the QR payment." : "Cash accounts need no bank details."}
            </DialogDescription>
          </DialogHeader>
          {f && (
            <div className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="bank-form-code">Code *</Label>
                  <Input id="bank-form-code" data-testid="bank-form-code" value={f.code} disabled={!!f.id || saving} maxLength={20} placeholder="e.g. BOC1" autoComplete="off"
                    onChange={(e) => setForm({ ...f, code: e.target.value })} aria-invalid={errors.code ? true : undefined} />
                  {errors.code && <p className="text-xs text-red-600" role="alert">{errors.code}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bank-form-name">Display name *</Label>
                  <Input id="bank-form-name" data-testid="bank-form-name" value={f.name} disabled={saving} maxLength={80} placeholder="e.g. BOC Current" autoComplete="off"
                    onChange={(e) => setForm({ ...f, name: e.target.value })} aria-invalid={errors.name ? true : undefined} />
                  {errors.name && <p className="text-xs text-red-600" role="alert">{errors.name}</p>}
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bank-form-type">Account type</Label>
                  <select id="bank-form-type" data-testid="bank-form-type" className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60" value={f.type} disabled={!!f.id || saving}
                    onChange={(e) => setForm({ ...f, type: e.target.value })}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <BankDetailsFields idPrefix="bank-form" value={f.details} errors={errors} required={requireAll} disabled={saving} onChange={(details) => setForm({ ...f, details })} />
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label htmlFor="bank-form-active">Account status</Label>
                  <p className="text-xs text-muted-foreground">Disabled accounts are hidden from POS QR selection.</p>
                </div>
                <Switch id="bank-form-active" checked={f.isActive} disabled={saving} onCheckedChange={(isActive) => setForm({ ...f, isActive })} />
              </div>
              <div className="space-y-2 rounded-lg border p-3">
                <div>
                  <Label>QR payment image</Label>
                  <p className="text-xs text-muted-foreground">PNG, JPG or WebP, up to 2 MB. Stored in this shop&apos;s tenant files.</p>
                </div>
                {(qrPreviewUrl || formQr?.imageUrl) && !removeQr && (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrPreviewUrl ?? resolvePublicAssetUrl(formQr?.imageUrl ?? "")} alt={`${f.name} QR`} className="h-24 w-24 rounded border bg-white object-contain" />
                    {formQr?.imageUrl && !qrPreviewUrl && (
                      <Button type="button" size="sm" variant="outline" onClick={() => setRemoveQr(true)} disabled={saving}>
                        <Trash2 className="h-3.5 w-3.5" /> Remove QR image
                      </Button>
                    )}
                  </div>
                )}
                {removeQr && <p className="text-xs text-destructive">The current QR image will be removed when you save.</p>}
                <label className="inline-flex">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    data-testid="bank-form-qr-image"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { toast.error("QR image must be PNG, JPG or WebP"); return; }
                      if (file.size > 2 * 1024 * 1024) { toast.error("QR image must be 2 MB or smaller"); return; }
                      setQrFile(file);
                      setRemoveQr(false);
                    }}
                    disabled={saving}
                  />
                  <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 text-xs hover:bg-muted">
                    <Upload className="h-3.5 w-3.5" /> {formQr?.imageUrl ? "Replace QR image" : "Upload QR image"}
                  </span>
                </label>
                {qrFile && <p className="text-xs text-muted-foreground truncate">Selected: {qrFile.name}</p>}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" disabled={saving} onClick={() => setForm(null)}>Cancel</Button>
            <Button data-testid="bank-form-save" disabled={saving} onClick={() => void save()} className="gap-1.5">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {f?.id ? "Save changes" : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
