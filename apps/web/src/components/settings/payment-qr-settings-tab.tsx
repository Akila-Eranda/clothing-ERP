"use client";

import { invalidatePosQrCache } from "@/lib/pos-qr-cache";
import * as React from "react";
import { Loader2, Plus, QrCode, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api, tokenStorage } from "@/lib/api";
import { canManageBankAccounts, permissionsFromToken } from "@/lib/bank-account";
import { BankAccountsCard, type BankAccountRow } from "@/components/settings/bank-accounts-card";
import { parseApiList } from "@/lib/parse-api-list";
import { postFile, resolvePublicAssetUrl } from "@/lib/upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type QrRow = {
  id: string;
  label: string;
  mode: "STATIC" | "DYNAMIC";
  imageUrl: string | null;
  branchId: string | null;
  bankAccountId: string;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  hasPayload: boolean;
  merchantName: string | null;
  bankAccount?: { id: string; name: string; code?: string | null; bankName?: string | null } | null;
};
type BankOpt = { id: string; name: string; code?: string | null; bankName?: string | null; isActive?: boolean };
type BranchOpt = { id: string; name: string; code?: string };
type PosFeeSettings = { qrFeeThreshold: number; qrFeePercent: number };

type Draft = {
  id?: string;
  label: string;
  bankAccountId: string;
  mode: "STATIC" | "DYNAMIC";
  merchantPayload: string;
  branchId: string;
  isDefault: boolean;
  isActive: boolean;
};

const EMPTY: Draft = { label: "", bankAccountId: "", mode: "STATIC", merchantPayload: "", branchId: "", isDefault: false, isActive: true };
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Settings → QR payments: bank QR codes shown at the POS for QR payments. */
export function PaymentQrSettingsTab({ showBankAccounts = true }: { showBankAccounts?: boolean } = {}) {
  const [rows, setRows] = React.useState<QrRow[]>([]);
  const [banks, setBanks] = React.useState<BankOpt[]>([]);
  const [bankRows, setBankRows] = React.useState<BankAccountRow[]>([]);
  // Hides controls only; the API enforces accounting:create / accounting:update on every change.
  const canManage = React.useMemo(() => canManageBankAccounts(permissionsFromToken(tokenStorage.getAccess())), []);
  const [branches, setBranches] = React.useState<BranchOpt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [uploadingId, setUploadingId] = React.useState<string | null>(null);
  const [feeSettings, setFeeSettings] = React.useState<PosFeeSettings | null>(null);
  const [feeThresholdInput, setFeeThresholdInput] = React.useState("");
  const [feePercentInput, setFeePercentInput] = React.useState("");
  const [feeSaving, setFeeSaving] = React.useState<"threshold" | "percent" | null>(null);

  const load = React.useCallback(async () => {
    invalidatePosQrCache(); // QA-002: the POS must re-read the QR list after any admin change
    setLoading(true);
    setLoadError(null);
    try {
      const [q, b, br] = await Promise.all([
        api.get<QrRow[]>("/payment-qr"),
        api.get<BankOpt[]>(`/accounting/bank-accounts${canManage ? "?includeInactive=true" : ""}`).catch(() => ({ data: [] as BankOpt[] })),
        api.get<BranchOpt[]>("/branches?limit=50").catch(() => ({ data: [] as BranchOpt[] })),
      ]);
      const settings = await api.get<PosFeeSettings>("/tenants/pos-settings");
      setRows(Array.isArray(q.data) ? q.data : []);
      const allBanks = parseApiList<BankAccountRow & BankOpt>(b.data);
      setBankRows(allBanks);
      setBanks(allBanks.filter((x) => x.isActive !== false));
      setBranches(parseApiList<BranchOpt>(br.data));
      setFeeSettings(settings.data);
      setFeeThresholdInput(String(settings.data.qrFeeThreshold));
      setFeePercentInput(String(settings.data.qrFeePercent));
    } catch (e: unknown) {
      setLoadError((e as Error).message || "Could not load QR codes");
    } finally {
      setLoading(false);
    }
  }, [canManage]);

  React.useEffect(() => { void load(); }, [load]);

  const saveFee = async (field: "threshold" | "percent") => {
    const raw = field === "threshold" ? feeThresholdInput : feePercentInput;
    const value = Number(raw);
    const valid = /^\d+(\.\d{1,2})?$/.test(raw);
    if (!valid || !Number.isFinite(value) || value < 0 || (field === "percent" && value > 20)) {
      toast.error(field === "threshold"
        ? "Enter a non-negative LKR amount with at most 2 decimal places"
        : "Enter a fee between 0 and 20% with at most 2 decimal places");
      return;
    }
    setFeeSaving(field);
    try {
      const body = field === "threshold" ? { qrFeeThreshold: value } : { qrFeePercent: value };
      const response = await api.put<PosFeeSettings>("/tenants/pos-settings", body);
      setFeeSettings(response.data);
      setFeeThresholdInput(String(response.data.qrFeeThreshold));
      setFeePercentInput(String(response.data.qrFeePercent));
      toast.success(`${field === "threshold" ? "QR fee threshold" : "QR fee percentage"} saved`);
    } catch (e: unknown) {
      toast.error((e as Error).message || "Could not save QR fee settings");
    } finally {
      setFeeSaving(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.label.trim()) { toast.error("Enter a label"); return; }
    if (!draft.bankAccountId) { toast.error("Choose the bank account that receives QR payments"); return; }
    if (!draft.id && draft.mode === "DYNAMIC" && !draft.merchantPayload.trim()) { toast.error("A dynamic QR needs the QR text from your bank"); return; }
    setSaving(true);
    try {
      const body = {
        label: draft.label.trim(),
        bankAccountId: draft.bankAccountId,
        mode: draft.mode,
        // Only when typed: on edit an empty box keeps the saved QR text.
        ...(draft.merchantPayload.trim() ? { merchantPayload: draft.merchantPayload.trim() } : {}),
        branchId: draft.branchId,
        isDefault: draft.isDefault,
        ...(draft.id ? { isActive: draft.isActive } : {}),
      };
      if (draft.id) await api.put(`/payment-qr/${draft.id}`, body);
      else await api.post("/payment-qr", body);
      toast.success("QR code saved");
      setDraft(null);
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (row: QrRow, file: File | undefined) => {
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) { toast.error("QR image must be PNG, JPG or WebP"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("QR image must be 2 MB or smaller"); return; }
    setUploadingId(row.id);
    try {
      await postFile(`/payment-qr/${row.id}/image`, file);
      toast.success("QR image uploaded");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Upload failed");
    } finally {
      setUploadingId(null);
    }
  };

  const toggleActive = async (row: QrRow, isActive: boolean) => {
    try {
      await api.put(`/payment-qr/${row.id}`, { isActive });
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, isActive } : r)));
    } catch (e: unknown) {
      toast.error((e as Error).message || "Update failed");
    }
  };

  const removeImage = async (row: QrRow) => {
    if (!window.confirm(`Remove the QR image for ${row.label}?`)) return;
    setUploadingId(row.id);
    try {
      await api.delete(`/payment-qr/${row.id}/image`);
      toast.success("QR image removed");
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message || "Remove failed");
    } finally {
      setUploadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">QR payment fee</CardTitle>
          <CardDescription>
            For QR payments above the threshold, the bank deducts this percentage from the gross QR amount.
            The customer still pays the normal bill amount. Defaults: LKR 5,000 and 1%.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="accounts-qr-fee-threshold">Threshold (LKR)</Label>
            <Input
              id="accounts-qr-fee-threshold"
              inputMode="decimal"
              value={feeThresholdInput}
              disabled={!feeSettings || !canManage || feeSaving !== null}
              onChange={(e) => setFeeThresholdInput(e.target.value.replace(/[^\d.]/g, ""))}
              className="w-40"
            />
            <p className="text-[11px] text-muted-foreground">No fee at or below this amount.</p>
          </div>
          <Button size="sm" variant="outline" disabled={!canManage || feeSaving !== null} onClick={() => void saveFee("threshold")}>
            {feeSaving === "threshold" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save threshold
          </Button>
          <div className="space-y-1">
            <Label htmlFor="accounts-qr-fee-percent">Fee (%)</Label>
            <Input
              id="accounts-qr-fee-percent"
              inputMode="decimal"
              value={feePercentInput}
              disabled={!feeSettings || !canManage || feeSaving !== null}
              onChange={(e) => setFeePercentInput(e.target.value.replace(/[^\d.]/g, ""))}
              className="w-28"
            />
            <p className="text-[11px] text-muted-foreground">Allowed range: 0–20%.</p>
          </div>
          <Button size="sm" variant="outline" disabled={!canManage || feeSaving !== null} onClick={() => void saveFee("percent")}>
            {feeSaving === "percent" && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Save percentage
          </Button>
        </CardContent>
      </Card>
      {showBankAccounts && (
        <BankAccountsCard accounts={bankRows} qrCodes={rows} canManage={canManage} loading={loading} onChanged={load} />
      )}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><QrCode className="h-4 w-4" /> QR payments</CardTitle>
            <CardDescription>
              Bank QR codes the POS shows when a customer pays by QR. Each code belongs to the bank account that receives the money.
              Static codes show your uploaded QR image; dynamic codes add the bill amount to your bank&apos;s QR text (LankaQR / EMVCo).
            </CardDescription>
          </div>
          <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setDraft({ ...EMPTY, bankAccountId: banks[0]?.id ?? "" })} disabled={loading || !!loadError}>
            <Plus className="h-4 w-4" /> Add QR code
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}. Managing QR codes needs accounting permissions.</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No QR codes yet. Add one, then upload its image.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => (
                <div key={r.id} className="rounded-xl border p-3 flex gap-3" style={{ opacity: r.isActive ? 1 : 0.6 }}>
                  <div className="h-24 w-24 shrink-0 rounded-lg border bg-white flex items-center justify-center overflow-hidden">
                    {r.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={resolvePublicAssetUrl(r.imageUrl)} alt={`${r.label} QR`} className="h-full w-full object-contain" />
                    ) : (
                      <QrCode className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-sm truncate">{r.label}{r.isDefault ? <span className="ml-1.5 text-[10px] font-medium text-primary">DEFAULT</span> : null}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {r.bankAccount?.name ?? "—"}{r.bankAccount?.bankName ? ` · ${r.bankAccount.bankName}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {r.mode === "DYNAMIC" ? "Dynamic (amount in QR)" : "Static image"}
                      {r.branchId ? ` · ${branches.find((b) => b.id === r.branchId)?.name ?? "one branch"}` : " · all branches"}
                    </p>
                    {r.merchantName && <p className="text-[11px] text-muted-foreground truncate">Merchant: {r.merchantName}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <label className="inline-flex">
                        <input
                          type="file"
                          accept={IMAGE_TYPES.join(",")}
                          className="sr-only"
                          aria-label={`Upload QR image for ${r.label}`}
                          onChange={(e) => { void uploadImage(r, e.target.files?.[0]); e.target.value = ""; }}
                          disabled={uploadingId === r.id}
                        />
                        <span className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs hover:bg-muted">
                          {uploadingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                          {r.imageUrl ? "Replace image" : "Upload image"}
                        </span>
                      </label>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs"
                        onClick={() => setDraft({
                          id: r.id, label: r.label, bankAccountId: r.bankAccountId, mode: r.mode, merchantPayload: "",
                          branchId: r.branchId ?? "", isDefault: r.isDefault, isActive: r.isActive,
                        })}
                      >
                        Edit
                      </Button>
                      {r.imageUrl && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive"
                          onClick={() => void removeImage(r)}
                          disabled={uploadingId === r.id}
                        >
                          <Trash2 className="h-3 w-3" /> Remove image
                        </Button>
                      )}
                      <label className="inline-flex items-center gap-1.5 text-xs">
                        <Switch checked={r.isActive} onCheckedChange={(v) => void toggleActive(r, v)} aria-label={`${r.label} active`} />
                        Active
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {draft && (
        <Card id="qr-code-form">
          <CardHeader>
            <CardTitle className="text-base">{draft.id ? "Edit QR code" : "New QR code"}</CardTitle>
            <CardDescription>Upload the image after saving. Only the shop&apos;s own active bank accounts can be chosen.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="qr-label">Label *</Label>
              <Input id="qr-label" value={draft.label} maxLength={80} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. BOC LankaQR" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="qr-bank">Receiving bank account *</Label>
              <select id="qr-bank" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.bankAccountId} onChange={(e) => setDraft({ ...draft, bankAccountId: e.target.value })}>
                <option value="">{banks.length ? "Select…" : "No bank accounts — add one in Accounting → Banking"}</option>
                {banks.map((b) => <option key={b.id} value={b.id}>{b.name}{b.bankName ? ` · ${b.bankName}` : ""}{b.code ? ` (${b.code})` : ""}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qr-mode">Type</Label>
              <select id="qr-mode" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as Draft["mode"] })}>
                <option value="STATIC">Static — show the uploaded QR image</option>
                <option value="DYNAMIC">Dynamic — QR with the exact bill amount</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qr-branch">Branch</Label>
              <select id="qr-branch" className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={draft.branchId} onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}>
                <option value="">All branches</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="qr-payload">QR text (EMVCo / LankaQR){draft.mode === "DYNAMIC" ? " *" : " — optional"}</Label>
              <textarea
                id="qr-payload"
                className="min-h-[72px] w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
                maxLength={512}
                value={draft.merchantPayload}
                onChange={(e) => setDraft({ ...draft, merchantPayload: e.target.value })}
                placeholder={draft.id ? "Leave empty to keep the saved QR text" : "000201010211…6304ABCD (scan your bank QR with a QR reader app and paste the text)"}
              />
              <p className="text-[11px] text-muted-foreground">The text is checked (format and checksum) before it is saved. It is never shown at the POS.</p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={draft.isDefault} onCheckedChange={(v) => setDraft({ ...draft, isDefault: v })} /> Default at the POS
            </label>
            {draft.id && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.isActive} onCheckedChange={(v) => setDraft({ ...draft, isActive: v })} /> Active
              </label>
            )}
            <div className="flex gap-2 sm:col-span-2">
              <Button onClick={() => void save()} disabled={saving} className="gap-1.5">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
