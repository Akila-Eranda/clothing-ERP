"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock,
  FileCheck,
  Loader2,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClientSideTable } from "@/components/table/client-side-table";
import { DataTableColumnHeader } from "@/components/table/data-table-column-header";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type ChequeDirection = "RECEIVED" | "ISSUED";
type ChequeStatus =
  | "RECEIVED"
  | "ISSUED"
  | "DEPOSITED"
  | "CLEARED"
  | "BOUNCED"
  | "CANCELLED";

type BankAccount = {
  id: string;
  code: string;
  name: string;
  currentBalance: number;
};

type Cheque = {
  id: string;
  chequeNumber: string;
  direction: ChequeDirection;
  status: ChequeStatus;
  amount: number;
  bankName?: string | null;
  partyName?: string | null;
  partyType?: string | null;
  dueDate?: string | null;
  issueDate?: string | null;
  notes?: string | null;
  clearedAt?: string | null;
  bouncedAt?: string | null;
  createdAt?: string;
  bankAccount?: { id: string; name: string; code: string } | null;
  bankAccountId?: string | null;
};

type Dashboard = {
  outstandingCount: number;
  outstandingAmount: number;
  overdueCount: number;
  dueSoonCount: number;
  bouncedCount: number;
  clearedCount: number;
  receivedOpen: { count: number; amount: number };
  issuedOpen: { count: number; amount: number };
};

type FilterTab = "all" | "received" | "issued" | "overdue" | "bounced";

const STATUS_META: Record<
  ChequeStatus,
  { label: string; variant: "warning" | "info" | "success" | "secondary" | "danger" | "outline" }
> = {
  RECEIVED: { label: "Received", variant: "info" },
  ISSUED: { label: "Issued", variant: "warning" },
  DEPOSITED: { label: "Deposited", variant: "secondary" },
  CLEARED: { label: "Cleared", variant: "success" },
  BOUNCED: { label: "Bounced", variant: "danger" },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function isOverdue(c: Cheque) {
  if (!c.dueDate) return false;
  if (["CLEARED", "BOUNCED", "CANCELLED"].includes(c.status)) return false;
  return new Date(c.dueDate) < new Date();
}

function sourceLabel(notes?: string | null) {
  const m = notes?.match(/\[source:([^:\]]+):([^\]]+)\]/);
  if (!m) return null;
  return m[1];
}

export function ChequesHub() {
  const { profile } = useShopWorkspace();
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [tab, setTab] = useState<FilterTab>("all");
  const [statusFilter, setStatusFilter] = useState<string>("_all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<Cheque | null>(null);
  const [clearBankId, setClearBankId] = useState("");

  const [dir, setDir] = useState<ChequeDirection>("RECEIVED");
  const [num, setNum] = useState("");
  const [amt, setAmt] = useState("");
  const [party, setParty] = useState("");
  const [bankName, setBankName] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [bankId, setBankId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, cRes, bRes] = await Promise.all([
        api.get<Dashboard>("/accounting/cheques/dashboard"),
        api.get<{ data: Cheque[] }>("/accounting/cheques?limit=200"),
        api.get<BankAccount[]>("/accounting/bank-accounts"),
      ]);
      setDash(dRes.data ?? null);
      setCheques(cRes.data?.data ?? []);
      setBanks(Array.isArray(bRes.data) ? bRes.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load cheques");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let rows = cheques;
    if (tab === "received") rows = rows.filter((c) => c.direction === "RECEIVED");
    if (tab === "issued") rows = rows.filter((c) => c.direction === "ISSUED");
    if (tab === "overdue") rows = rows.filter(isOverdue);
    if (tab === "bounced") rows = rows.filter((c) => c.status === "BOUNCED");
    if (statusFilter !== "_all") rows = rows.filter((c) => c.status === statusFilter);
    return rows;
  }, [cheques, tab, statusFilter]);

  const resetForm = () => {
    setDir("RECEIVED");
    setNum("");
    setAmt("");
    setParty("");
    setBankName("");
    setDueDate("");
    setBankId("");
    setNotes("");
  };

  const createCheque = async () => {
    const amount = parseFloat(amt);
    if (!num.trim() || !(amount > 0)) {
      toast.error("Cheque number and amount are required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/accounting/cheques", {
        direction: dir,
        chequeNumber: num.trim(),
        amount,
        partyName: party.trim() || undefined,
        bankName: bankName.trim() || undefined,
        dueDate: dueDate || undefined,
        bankAccountId: bankId || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success("Cheque registered");
      setRegisterOpen(false);
      resetForm();
      void load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to register cheque");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: ChequeStatus, bankAccountId?: string) => {
    setBusyId(id);
    try {
      await api.put(`/accounting/cheques/${id}/status`, { status, bankAccountId });
      toast.success(`Cheque marked ${status.toLowerCase()}`);
      setClearTarget(null);
      void load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Status update failed");
    } finally {
      setBusyId(null);
    }
  };

  const openClear = (c: Cheque) => {
    setClearTarget(c);
    setClearBankId(c.bankAccountId || c.bankAccount?.id || banks[0]?.id || "");
  };

  const columns = useMemo<ColumnDef<Cheque>[]>(
    () => [
      {
        id: "cheque",
        accessorKey: "chequeNumber",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Cheque" />,
        cell: ({ row }) => {
          const c = row.original;
          const src = sourceLabel(c.notes);
          return (
            <div>
              <p className="text-sm font-medium font-mono">{c.chequeNumber}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                {c.direction === "RECEIVED" ? (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600">
                    <ArrowDownLeft className="h-3 w-3" /> In
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600">
                    <ArrowUpRight className="h-3 w-3" /> Out
                  </span>
                )}
                {src && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1">
                    {src}
                  </Badge>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "party",
        accessorFn: (c) => c.partyName ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Party" />,
        cell: ({ row }) => (
          <div>
            <p className="text-sm">{row.original.partyName ?? "—"}</p>
            {row.original.partyType && (
              <p className="text-[10px] text-muted-foreground">{row.original.partyType}</p>
            )}
          </div>
        ),
      },
      {
        id: "due",
        accessorFn: (c) => c.dueDate ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Due" />,
        cell: ({ row }) => {
          const overdue = isOverdue(row.original);
          return (
            <span className={`text-sm tabular-nums ${overdue ? "text-red-600 font-medium" : ""}`}>
              {fmtDate(row.original.dueDate)}
              {overdue && <span className="block text-[10px]">Overdue</span>}
            </span>
          );
        },
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status] ?? STATUS_META.RECEIVED;
          return (
            <Badge variant={meta.variant} className="text-[10px]">
              {meta.label}
            </Badge>
          );
        },
      },
      {
        id: "amount",
        accessorKey: "amount",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Amount" />,
        cell: ({ row }) => (
          <span className="text-sm font-semibold tabular-nums">
            LKR {formatNumber(row.original.amount)}
          </span>
        ),
      },
      {
        id: "bank",
        accessorFn: (c) => c.bankAccount?.name ?? c.bankName ?? "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Bank" />,
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.bankAccount?.name ?? row.original.bankName ?? "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => {
          const c = row.original;
          const busy = busyId === c.id;
          const open = !["CLEARED", "BOUNCED", "CANCELLED"].includes(c.status);
          return (
            <div className="flex flex-wrap gap-1 justify-end">
              {open && c.status !== "DEPOSITED" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!!busyId}
                  onClick={() => setStatus(c.id, "DEPOSITED", c.bankAccountId || banks[0]?.id)}
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Deposit"}
                </Button>
              )}
              {open && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!!busyId}
                  onClick={() => openClear(c)}
                >
                  Clear
                </Button>
              )}
              {open && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs text-red-600"
                  disabled={!!busyId}
                  onClick={() => setStatus(c.id, "BOUNCED")}
                >
                  Bounce
                </Button>
              )}
              {open && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  disabled={!!busyId}
                  onClick={() => setStatus(c.id, "CANCELLED")}
                >
                  Cancel
                </Button>
              )}
            </div>
          );
        },
      },
    ],
    [banks, busyId],
  );

  const kpis = [
    {
      label: "Outstanding",
      value: dash ? `LKR ${formatNumber(dash.outstandingAmount)}` : "—",
      sub: dash ? `${dash.outstandingCount} open` : "",
      icon: FileCheck,
      color: "text-violet-600",
      bg: "bg-violet-500/10",
    },
    {
      label: "Receivable",
      value: dash ? `LKR ${formatNumber(dash.receivedOpen.amount)}` : "—",
      sub: dash ? `${dash.receivedOpen.count} in` : "",
      icon: ArrowDownLeft,
      color: "text-emerald-600",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Payable",
      value: dash ? `LKR ${formatNumber(dash.issuedOpen.amount)}` : "—",
      sub: dash ? `${dash.issuedOpen.count} out` : "",
      icon: ArrowUpRight,
      color: "text-amber-600",
      bg: "bg-amber-500/10",
    },
    {
      label: "Due soon",
      value: String(dash?.dueSoonCount ?? "—"),
      sub: "next 7 days",
      icon: Clock,
      color: "text-blue-600",
      bg: "bg-blue-500/10",
    },
    {
      label: "Overdue",
      value: String(dash?.overdueCount ?? "—"),
      sub: "past due date",
      icon: AlertTriangle,
      color: "text-red-600",
      bg: "bg-red-500/10",
    },
    {
      label: "Cleared",
      value: String(dash?.clearedCount ?? "—"),
      sub: dash ? `${dash.bouncedCount} bounced` : "",
      icon: CheckCircle2,
      color: "text-teal-600",
      bg: "bg-teal-500/10",
    },
  ];

  const tabs: { id: FilterTab; label: string }[] = [
    { id: "all", label: "All" },
    { id: "received", label: "Received" },
    { id: "issued", label: "Issued" },
    { id: "overdue", label: "Overdue" },
    { id: "bounced", label: "Bounced" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cheques</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {profile.label} · Register, deposit & clear cheques from sales, expenses, credit & suppliers
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Refresh
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setRegisterOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Register cheque
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-4 flex items-start gap-3">
              <div className={`p-2 rounded-xl ${k.bg} ${k.color} shrink-0`}>
                <k.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground font-medium">{k.label}</p>
                <p className="text-sm font-bold tabular-nums truncate mt-0.5">{k.value}</p>
                {k.sub && <p className="text-[10px] text-muted-foreground mt-0.5">{k.sub}</p>}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 h-8 rounded-lg text-xs font-semibold transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">All statuses</SelectItem>
            {Object.keys(STATUS_META).map((s) => (
              <SelectItem key={s} value={s}>
                {STATUS_META[s as ChequeStatus].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && !cheques.length ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <ClientSideTable
          data={filtered}
          columns={columns}
          pageCount={Math.ceil(filtered.length / 15) || 1}
          searchableColumns={[
            { id: "cheque", title: "Cheque" },
            { id: "party", title: "Party" },
            { id: "status", title: "Status" },
            { id: "bank", title: "Bank" },
          ]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "cheques" }}
        />
      )}

      {registerOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !saving) setRegisterOpen(false);
          }}
        >
          <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-violet-500/10 text-violet-600">
                  <Banknote className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-bold text-sm">Register cheque</h2>
                  <p className="text-[11px] text-muted-foreground">Manual entry for off-system cheques</p>
                </div>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-lg hover:bg-muted"
                onClick={() => !saving && setRegisterOpen(false)}
              >
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Direction</Label>
                  <Select value={dir} onValueChange={(v) => setDir(v as ChequeDirection)}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RECEIVED">Received (in)</SelectItem>
                      <SelectItem value="ISSUED">Issued (out)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Cheque # *</Label>
                  <Input className="h-9" value={num} onChange={(e) => setNum(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Amount (LKR) *</Label>
                  <Input
                    type="number"
                    min={0.01}
                    step="0.01"
                    className="h-9"
                    value={amt}
                    onChange={(e) => setAmt(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Due date</Label>
                  <Input type="date" className="h-9" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Party</Label>
                <Input
                  className="h-9"
                  placeholder="Customer / supplier name"
                  value={party}
                  onChange={(e) => setParty(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Cheque bank</Label>
                  <Input
                    className="h-9"
                    placeholder="e.g. BOC"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Our bank account</Label>
                  <Select value={bankId || "_none"} onValueChange={(v) => setBankId(v === "_none" ? "" : v)}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {banks.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes</Label>
                <Input className="h-9" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-muted/10">
              <Button variant="outline" size="sm" disabled={saving} onClick={() => setRegisterOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void createCheque()} className="gap-1.5 min-w-[110px]">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileCheck className="h-3.5 w-3.5" />}
                Register
              </Button>
            </div>
          </div>
        </div>
      )}

      {clearTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busyId) setClearTarget(null);
          }}
        >
          <div className="bg-background rounded-2xl shadow-2xl border w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b">
              <h2 className="font-bold text-sm">Clear cheque {clearTarget.chequeNumber}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                LKR {formatNumber(clearTarget.amount)} ·{" "}
                {clearTarget.direction === "RECEIVED" ? "Credits bank" : "Debits bank"}
              </p>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Bank account *</Label>
                <Select value={clearBankId || "_none"} onValueChange={(v) => setClearBankId(v === "_none" ? "" : v)}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select bank" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Select account</SelectItem>
                    {banks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.name} (LKR {formatNumber(b.currentBalance)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t bg-muted/10">
              <Button variant="outline" size="sm" disabled={!!busyId} onClick={() => setClearTarget(null)}>
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={!!busyId || !clearBankId}
                className="gap-1.5"
                onClick={() => void setStatus(clearTarget.id, "CLEARED", clearBankId)}
              >
                {busyId === clearTarget.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                )}
                Clear
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
