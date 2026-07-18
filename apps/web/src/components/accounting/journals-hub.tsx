"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2, Eye, FilePlus2, Loader2, Pencil, Printer, RefreshCw,
  Send, ShieldCheck, Sparkles, Trash2, X, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";
import { useAuthStore } from "@/stores/auth-store";

type JournalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "POSTED" | "VOID";

type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
};

type JournalLine = {
  id?: string;
  type: "DEBIT" | "CREDIT";
  amount: number;
  description?: string | null;
  debitAccountId?: string | null;
  creditAccountId?: string | null;
  debitAccount?: { id: string; code: string; name: string } | null;
  creditAccount?: { id: string; code: string; name: string } | null;
};

type JournalEntry = {
  id: string;
  entryNumber: string;
  description: string;
  date: string;
  status: JournalStatus;
  isPosted: boolean;
  referenceId?: string | null;
  referenceType?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  postedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  lines: JournalLine[];
  debitTotal?: number;
  creditTotal?: number;
  balanced?: boolean;
};

type FormLine = {
  accountId: string;
  side: "DEBIT" | "CREDIT";
  amount: string;
  description: string;
};

const STATUS_META: Record<JournalStatus, { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-slate-100 text-slate-700" },
  PENDING_APPROVAL: { label: "Pending", className: "bg-amber-100 text-amber-800" },
  APPROVED: { label: "Approved", className: "bg-blue-100 text-blue-800" },
  POSTED: { label: "Posted", className: "bg-emerald-100 text-emerald-800" },
  VOID: { label: "Void", className: "bg-red-100 text-red-800" },
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function StatusBadge({ status }: { status: JournalStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.DRAFT;
  return <Badge className={`text-[10px] border-0 ${m.className}`}>{m.label}</Badge>;
}

function emptyLine(): FormLine {
  return { accountId: "", side: "DEBIT", amount: "", description: "" };
}

function JournalFormModal({
  accounts,
  edit,
  onClose,
  onSaved,
}: {
  accounts: Account[];
  edit?: JournalEntry | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [desc, setDesc] = useState(edit?.description ?? "");
  const [date, setDate] = useState(edit ? fmtDate(edit.date) : today);
  const [refId, setRefId] = useState(edit?.referenceId ?? "");
  const [lines, setLines] = useState<FormLine[]>(() => {
    if (!edit?.lines?.length) {
      return [
        { accountId: "", side: "DEBIT", amount: "", description: "" },
        { accountId: "", side: "CREDIT", amount: "", description: "" },
      ];
    }
    return edit.lines.map((l) => ({
      accountId: (l.type === "DEBIT" ? l.debitAccountId : l.creditAccountId) ?? "",
      side: l.type,
      amount: String(l.amount),
      description: l.description ?? "",
    }));
  });
  const [saving, setSaving] = useState(false);

  const debitTotal = lines
    .filter((l) => l.side === "DEBIT")
    .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const creditTotal = lines
    .filter((l) => l.side === "CREDIT")
    .reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
  const balanced = Math.abs(debitTotal - creditTotal) < 0.01 && debitTotal > 0;

  const buildPayload = (action?: "DRAFT" | "SUBMIT" | "POST") => {
    const glLines = lines
      .filter((l) => l.accountId && parseFloat(l.amount) > 0)
      .map((l) => ({
        accountId: l.accountId,
        side: l.side,
        amount: parseFloat(l.amount),
        description: l.description || undefined,
      }));
    return {
      description: desc,
      date,
      referenceId: refId || undefined,
      glLines,
      ...(action ? { action } : {}),
    };
  };

  const save = async (action: "DRAFT" | "SUBMIT" | "POST") => {
    if (!desc.trim() || !date) {
      toast.error("Fill description and date");
      return;
    }
    if (!balanced) {
      toast.error("Debits must equal credits");
      return;
    }
    setSaving(true);
    try {
      if (edit) {
        await api.put(`/accounting/journal-entries/${edit.id}`, buildPayload());
        if (action === "SUBMIT") {
          await api.post(`/accounting/journal-entries/${edit.id}/submit`);
        } else if (action === "POST") {
          await api.post(`/accounting/journal-entries/${edit.id}/post`);
        }
        toast.success(action === "DRAFT" ? "Draft saved" : action === "SUBMIT" ? "Submitted" : "Posted");
      } else {
        await api.post("/accounting/journal-entries", buildPayload(action));
        toast.success(
          action === "DRAFT" ? "Draft created" : action === "SUBMIT" ? "Submitted for approval" : "Journal posted",
        );
      }
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to save journal");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-3xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-bold">
                {edit ? `Edit ${edit.entryNumber}` : "New Journal Entry"}
              </DialogTitle>
              <DialogDescription>
                Create or update a journal voucher. Debits must equal credits.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs font-semibold">Description *</Label>
              <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Accrue monthly rent" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Date *</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Reference</Label>
              <Input value={refId} onChange={(e) => setRefId(e.target.value)} placeholder="Optional ref #" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">GL Lines *</Label>
              <Button variant="outline" size="sm" onClick={() => setLines((p) => [...p, emptyLine()])}>
                + Add Line
              </Button>
            </div>
            <div className="rounded-xl border overflow-hidden divide-y">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-muted/30 text-[10px] font-semibold text-muted-foreground">
                <span className="col-span-5">Account</span>
                <span className="col-span-2">Side</span>
                <span className="col-span-2">Amount</span>
                <span className="col-span-2">Note</span>
                <span className="col-span-1" />
              </div>
              {lines.map((line, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 px-3 py-2 items-center">
                  <div className="col-span-5">
                    <Select
                      value={line.accountId}
                      onValueChange={(v) =>
                        setLines((p) => p.map((l, j) => (j === i ? { ...l, accountId: v } : l)))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select account…" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.code} — {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={line.side}
                      onValueChange={(v: "DEBIT" | "CREDIT") =>
                        setLines((p) => p.map((l, j) => (j === i ? { ...l, side: v } : l)))
                      }
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DEBIT">Debit</SelectItem>
                        <SelectItem value="CREDIT">Credit</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input
                      className="h-8 text-xs"
                      type="number"
                      step="0.01"
                      value={line.amount}
                      onChange={(e) =>
                        setLines((p) => p.map((l, j) => (j === i ? { ...l, amount: e.target.value } : l)))
                      }
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      className="h-8 text-xs"
                      value={line.description}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((l, j) => (j === i ? { ...l, description: e.target.value } : l)),
                        )
                      }
                    />
                  </div>
                  <button
                    className="col-span-1 flex justify-center hover:text-red-500"
                    onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                    disabled={lines.length <= 2}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-xs">
              <span className={balanced ? "text-emerald-600 font-medium" : "text-red-600 font-medium"}>
                {balanced ? "Balanced" : "Out of balance"} — Dr {formatNumber(debitTotal)} / Cr{" "}
                {formatNumber(creditTotal)}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => save("DRAFT")} disabled={saving || !balanced}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Draft"}
          </Button>
          <Button variant="outline" onClick={() => save("SUBMIT")} disabled={saving || !balanced}>
            <Send className="h-3.5 w-3.5 mr-1" /> Submit
          </Button>
          <Button onClick={() => save("POST")} disabled={saving || !balanced} className="min-w-[100px]">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Post"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JournalViewModal({
  entry,
  onClose,
  onEdit,
  onChanged,
}: {
  entry: JournalEntry;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const user = useAuthStore((s) => s.user);
  const canApprove =
    user?.role === "admin" || user?.role === "manager" || user?.role === "super_admin";

  const debitTotal =
    entry.debitTotal ??
    entry.lines.filter((l) => l.type === "DEBIT").reduce((s, l) => s + Number(l.amount), 0);
  const creditTotal =
    entry.creditTotal ??
    entry.lines.filter((l) => l.type === "CREDIT").reduce((s, l) => s + Number(l.amount), 0);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(ok);
      onChanged();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const printVoucher = () => {
    const html = printRef.current?.innerHTML;
    if (!html) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><title>${entry.entryNumber}</title>
      <style>
        body{font-family:Georgia,serif;padding:32px;color:#111}
        h1{font-size:20px;margin:0 0 4px} .meta{color:#555;font-size:12px;margin-bottom:20px}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left}
        th{font-size:11px;text-transform:uppercase;color:#666}
        .num{text-align:right;font-variant-numeric:tabular-nums}
        .totals{margin-top:16px;font-weight:600}
        @media print{button{display:none}}
      </style></head><body>${html}<script>window.print()</script></body></html>`);
    w.document.close();
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-2xl w-full max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <DialogTitle className="font-bold">{entry.entryNumber}</DialogTitle>
            <StatusBadge status={entry.status} />
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <Button variant="ghost" size="sm" onClick={printVoucher}>
              <Printer className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div ref={printRef}>
            <h1>Journal Voucher — {entry.entryNumber}</h1>
            <div className="meta space-y-1 text-sm text-muted-foreground mb-4">
              <div>
                <span className="font-medium text-foreground">{entry.description}</span>
              </div>
              <div>
                Date: {fmtDate(entry.date)} · Status: {entry.status}
                {entry.referenceId ? ` · Ref: ${entry.referenceId}` : ""}
              </div>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase text-muted-foreground border-b">
                  <th className="py-2">Account</th>
                  <th className="py-2">Note</th>
                  <th className="py-2 text-right">Debit</th>
                  <th className="py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map((l) => {
                  const acct = l.type === "DEBIT" ? l.debitAccount : l.creditAccount;
                  return (
                    <tr key={l.id ?? `${l.type}-${acct?.id}-${l.amount}`} className="border-b border-border/50">
                      <td className="py-2">
                        {acct?.code} — {acct?.name}
                      </td>
                      <td className="py-2 text-muted-foreground">{l.description || "—"}</td>
                      <td className="py-2 text-right tabular-nums">
                        {l.type === "DEBIT" ? formatNumber(Number(l.amount)) : ""}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {l.type === "CREDIT" ? formatNumber(Number(l.amount)) : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="totals flex justify-end gap-8 text-sm mt-3 font-semibold">
              <span>Dr {formatNumber(debitTotal)}</span>
              <span>Cr {formatNumber(creditTotal)}</span>
            </div>
          </div>

          {entry.voidReason && (
            <p className="text-xs text-red-600">Void reason: {entry.voidReason}</p>
          )}
        </div>

        <DialogFooter className="flex flex-wrap justify-end gap-2 px-6 py-4 border-t bg-muted/10">
          {entry.status === "DRAFT" && (
            <>
              <Button variant="outline" size="sm" onClick={onEdit} disabled={busy}>
                <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => api.post(`/accounting/journal-entries/${entry.id}/submit`), "Submitted")
                }
              >
                <Send className="h-3.5 w-3.5 mr-1" /> Submit
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => api.post(`/accounting/journal-entries/${entry.id}/post`), "Posted")
                }
              >
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Post
              </Button>
            </>
          )}
          {entry.status === "PENDING_APPROVAL" && canApprove && (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => api.post(`/accounting/journal-entries/${entry.id}/reject`, {}), "Rejected")
                }
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => api.post(`/accounting/journal-entries/${entry.id}/approve`), "Approved")
                }
              >
                <ShieldCheck className="h-3.5 w-3.5 mr-1" /> Approve
              </Button>
            </>
          )}
          {entry.status === "APPROVED" && (
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                run(() => api.post(`/accounting/journal-entries/${entry.id}/post`), "Posted")
              }
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Post to GL
            </Button>
          )}
          {entry.status !== "VOID" && (
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Void reason (optional)") ?? undefined;
                run(
                  () => api.post(`/accounting/journal-entries/${entry.id}/void`, { reason }),
                  "Voided",
                );
              }}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Void
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function JournalsHub() {
  useShopWorkspace();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<string>("ALL");
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<JournalEntry | null>(null);
  const [viewEntry, setViewEntry] = useState<JournalEntry | null>(null);
  const autoGenTried = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({ limit: "50" });
      if (status !== "ALL") qs.set("status", status);
      if (q.trim()) qs.set("q", q.trim());
      const [jRes, aRes] = await Promise.all([
        api.get<{ data: JournalEntry[] }>(`/accounting/journal-entries?${qs}`),
        api.get<{ flat?: Account[]; data?: Account[] } | Account[]>(
          "/accounting/accounts?flat=true&includeInactive=false",
        ),
      ]);
      setEntries(jRes.data?.data ?? (Array.isArray(jRes.data) ? (jRes.data as JournalEntry[]) : []));
      const raw = aRes.data as { flat?: Account[]; data?: Account[] } | Account[];
      const list = Array.isArray(raw)
        ? raw
        : raw?.flat ?? raw?.data ?? [];
      setAccounts(list.filter((a) => a.isActive !== false));
    } catch {
      toast.error("Failed to load journals");
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  useEffect(() => {
    void load();
  }, [load]);

  const generateFromTransactions = async () => {
    setGenerating(true);
    try {
      await api.post("/accounting/bootstrap", {});
      const res = await api.post<{
        journalsPosted: number;
        alreadyPostedOrSkipped: number;
        sales: number;
        grns: number;
        expenses: number;
        supplierPayments: number;
      }>("/accounting/backfill?limit=500", {});
      const d = res.data;
      toast.success(
        `Generated ${d?.journalsPosted ?? 0} journals from ` +
          `${d?.sales ?? 0} sales, ${d?.grns ?? 0} GRNs, ${d?.expenses ?? 0} expenses`,
      );
      await load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to generate journals");
    } finally {
      setGenerating(false);
    }
  };

  // First visit with empty ledger — auto-generate once
  useEffect(() => {
    if (loading || generating || autoGenTried.current) return;
    if (entries.length > 0) return;
    if (status !== "ALL" || q.trim()) return;
    autoGenTried.current = true;
    void generateFromTransactions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, entries.length, status, q]);

  const openView = async (id: string) => {
    try {
      const res = await api.get<JournalEntry>(`/accounting/journal-entries/${id}`);
      setViewEntry(res.data);
    } catch {
      toast.error("Failed to load journal");
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) c[e.status] = (c[e.status] ?? 0) + 1;
    return c;
  }, [entries]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">GL Journals</h1>
          <p className="text-sm text-muted-foreground">
            Double-entry journal vouchers — draft, approve, post, and print
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void generateFromTransactions()}
            disabled={generating}
            className="gap-1.5"
          >
            {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Generate from sales
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditEntry(null);
              setFormOpen(true);
            }}
          >
            <FilePlus2 className="h-3.5 w-3.5 mr-1" /> New Journal
          </Button>
        </div>
      </div>

      {!loading && entries.length === 0 && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardContent className="p-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">No journal entries yet</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Auto-create balanced GL journals from past POS sales, GRNs, expenses, and payments.
              </p>
            </div>
            <Button size="sm" onClick={() => void generateFromTransactions()} disabled={generating} className="gap-1.5">
              {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Generate journals now
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <Input
          className="max-w-xs h-9"
          placeholder="Search number or description…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void load()}
        />
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[160px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="DRAFT">Draft</SelectItem>
            <SelectItem value="PENDING_APPROVAL">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="POSTED">Posted</SelectItem>
            <SelectItem value="VOID">Void</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-[11px] text-muted-foreground">
          {Object.entries(counts)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" · ") || "No entries"}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              No journal entries yet. Create one to start posting GL activity.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <th className="text-left px-4 py-3 font-semibold">Number</th>
                    <th className="text-left px-4 py-3 font-semibold">Date</th>
                    <th className="text-left px-4 py-3 font-semibold">Description</th>
                    <th className="text-left px-4 py-3 font-semibold">Status</th>
                    <th className="text-right px-4 py-3 font-semibold">Lines</th>
                    <th className="text-right px-4 py-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono text-xs font-medium">{e.entryNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(e.date)}</td>
                      <td className="px-4 py-3 max-w-[280px] truncate">{e.description}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{e.lines?.length ?? 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => void openView(e.id)}>
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {e.status === "DRAFT" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              onClick={async () => {
                                const res = await api.get<JournalEntry>(
                                  `/accounting/journal-entries/${e.id}`,
                                );
                                setEditEntry(res.data);
                                setFormOpen(true);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {formOpen && (
        <JournalFormModal
          accounts={accounts}
          edit={editEntry}
          onClose={() => {
            setFormOpen(false);
            setEditEntry(null);
          }}
          onSaved={() => void load()}
        />
      )}

      {viewEntry && (
        <JournalViewModal
          entry={viewEntry}
          onClose={() => setViewEntry(null)}
          onEdit={() => {
            setEditEntry(viewEntry);
            setViewEntry(null);
            setFormOpen(true);
          }}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
