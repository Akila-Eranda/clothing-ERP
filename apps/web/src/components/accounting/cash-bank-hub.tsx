"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight, BookOpen, Building2, Landmark, Loader2, Plus, RefreshCw,
} from "lucide-react";
import { X } from "lucide-react";
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

type Tab = "cash" | "bank" | "recon";

type BankAccount = {
  id: string;
  code: string;
  name: string;
  type: string;
  bankName?: string | null;
  currentBalance: number;
  openingBalance: number;
  glAccountId?: string | null;
  isActive: boolean;
};

type CashEntry = {
  id?: string;
  entryDate: string;
  type: string;
  description: string;
  debit: number;
  credit: number;
  balanceAfter?: number;
};

type BankBookEntry = {
  id: string;
  txnDate: string;
  type: string;
  description?: string | null;
  reference?: string | null;
  amount: number;
  status: string;
  inflow: boolean;
  balanceAfter: number;
};

type GlAccount = { id: string; code: string; name: string; type: string };

type Recon = {
  id: string;
  statementDate: string;
  statementBalance: number;
  systemBalance: number;
  difference: number;
  status: string;
  bankAccount?: { code: string; name: string };
  unmatchedTxns?: BankTxn[];
  matchedTxns?: BankTxn[];
};

type BankTxn = {
  id: string;
  txnDate: string;
  type: string;
  amount: number;
  description?: string | null;
  reference?: string | null;
  status: string;
};

function fmt(d?: string | null) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function CashBankHub({ initialTab = "cash" }: { initialTab?: Tab }) {
  useShopWorkspace();
  const [tab, setTab] = useState<Tab>(initialTab);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: "cash", label: "Cash Book", icon: BookOpen },
    { id: "bank", label: "Bank Book", icon: Landmark },
    { id: "recon", label: "Reconciliation", icon: Building2 },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Cash & Bank</h1>
        <p className="text-sm text-muted-foreground">
          Cash book, bank ledger, transfers, and statement reconciliation
        </p>
      </div>

      <div className="flex flex-wrap gap-1 border-b pb-px">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                active
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "cash" && <CashBookPanel />}
      {tab === "bank" && <BankBookPanel />}
      {tab === "recon" && <ReconciliationPanel />}
    </div>
  );
}

function CashBookPanel() {
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [loading, setLoading] = useState(true);
  const [book, setBook] = useState<{
    opening: number;
    closing: number;
    source: string;
    entries: CashEntry[];
  } | null>(null);
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState("RECEIPT");
  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<"debit" | "credit">("debit");
  const [contraId, setContraId] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [cashEntryOpen, setCashEntryOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cb, acc] = await Promise.all([
        api.get<{ opening: number; closing: number; source: string; entries: CashEntry[] }>(
          `/accounting/cash-book?startDate=${start}&endDate=${end}`,
        ),
        api.get<{ data: GlAccount[] }>("/accounting/accounts?flat=true"),
      ]);
      setBook(cb.data ?? null);
      setGlAccounts(acc.data?.data ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load cash book");
    } finally {
      setLoading(false);
    }
  }, [start, end]);

  useEffect(() => {
    void load();
  }, [load]);

  const append = async () => {
    const amt = parseFloat(amount);
    if (!desc.trim() || !(amt > 0)) {
      toast.error("Description and amount required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/accounting/cash-book", {
        type,
        description: desc,
        entryDate,
        debit: side === "debit" ? amt : 0,
        credit: side === "credit" ? amt : 0,
        contraGlAccountId: contraId || undefined,
        postToGl: Boolean(contraId),
      });
      toast.success("Cash entry added");
      setDesc("");
      setAmount("");
      await load();
      setCashEntryOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to append");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-40" />
          </div>
          <Button size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Load
          </Button>
          <Badge variant="secondary" className="text-[10px]">{book?.source ?? "—"}</Badge>
          <span className="text-sm text-muted-foreground ml-auto">
            Opening {formatNumber(book?.opening ?? 0)} → Closing {formatNumber(book?.closing ?? 0)}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Plus className="h-4 w-4" /> Manual cash entry
            </h3>
            <Button size="sm" onClick={() => setCashEntryOpen(true)} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add entry
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Enter details in a modal, then submit to the cash book.
          </p>
        </CardContent>
      </Card>

      <Dialog open={cashEntryOpen} onOpenChange={setCashEntryOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manual cash entry</DialogTitle>
            <DialogDescription>
              Optionally link a GL contra account (posts a journal).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid sm:grid-cols-6 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} className="h-9" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={type} onValueChange={setType} disabled={busy}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="RECEIPT">Receipt</SelectItem>
                    <SelectItem value="PAYMENT">Payment</SelectItem>
                    <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Description</Label>
                <Input value={desc} onChange={(e) => setDesc(e.target.value)} className="h-9" disabled={busy} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Side</Label>
                <Select value={side} onValueChange={(v: "debit" | "credit") => setSide(v)} disabled={busy}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="debit">Debit (in)</SelectItem>
                    <SelectItem value="credit">Credit (out)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9"
                  disabled={busy}
                />
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3 items-end">
              <div className="space-y-1">
                <Label className="text-xs">GL contra (optional — posts journal)</Label>
                <Select
                  value={contraId || "_none"}
                  onValueChange={(v) => setContraId(v === "_none" ? "" : v)}
                  disabled={busy}
                >
                  <SelectTrigger className="h-9"><SelectValue placeholder="No GL post" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No GL post</SelectItem>
                    {glAccounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={busy} onClick={() => setCashEntryOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void append()} disabled={busy} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !book?.entries?.length ? (
            <p className="text-center text-sm text-muted-foreground py-12">No cash movements in range</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Description</th>
                    <th className="text-right px-4 py-3">Debit</th>
                    <th className="text-right px-4 py-3">Credit</th>
                    <th className="text-right px-4 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {book.entries.map((e, i) => (
                    <tr key={e.id ?? i} className="border-b border-border/40">
                      <td className="px-4 py-2.5 text-muted-foreground">{fmt(e.entryDate)}</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{e.type}</Badge></td>
                      <td className="px-4 py-2.5">{e.description}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{e.debit ? formatNumber(e.debit) : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{e.credit ? formatNumber(e.credit) : ""}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(e.balanceAfter ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BankBookPanel() {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [accountId, setAccountId] = useState("");
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [loading, setLoading] = useState(false);
  const [book, setBook] = useState<{
    account: BankAccount;
    opening: number;
    closing: number;
    entries: BankBookEntry[];
  } | null>(null);

  const [baCode, setBaCode] = useState("");
  const [baName, setBaName] = useState("");
  const [baType, setBaType] = useState("CURRENT");
  const [baBank, setBaBank] = useState("");
  const [baOpen, setBaOpen] = useState("0");
  const [baGl, setBaGl] = useState("");
  const [baBusy, setBaBusy] = useState(false);

  const [txnType, setTxnType] = useState("DEPOSIT");
  const [txnAmt, setTxnAmt] = useState("");
  const [txnDesc, setTxnDesc] = useState("");
  const [txnDate, setTxnDate] = useState(today());
  const [txnBusy, setTxnBusy] = useState(false);

  const [xferTo, setXferTo] = useState("");
  const [xferAmt, setXferAmt] = useState("");
  const [xferDesc, setXferDesc] = useState("");
  const [xferBusy, setXferBusy] = useState(false);

  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [txnOpen, setTxnOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  const loadBanks = useCallback(async () => {
    try {
      const [b, a] = await Promise.all([
        api.get<BankAccount[]>("/accounting/bank-accounts"),
        api.get<{ data: GlAccount[] }>("/accounting/accounts?flat=true"),
      ]);
      const list = Array.isArray(b.data) ? b.data : [];
      setBanks(list);
      setGlAccounts(a.data?.data ?? []);
      if (!accountId && list[0]) setAccountId(list[0].id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load banks");
    }
  }, [accountId]);

  const loadBook = useCallback(async () => {
    if (!accountId) return;
    setLoading(true);
    try {
      const res = await api.get<{
        account: BankAccount;
        opening: number;
        closing: number;
        entries: BankBookEntry[];
      }>(`/accounting/bank-accounts/${accountId}/book?startDate=${start}&endDate=${end}`);
      setBook(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load bank book");
    } finally {
      setLoading(false);
    }
  }, [accountId, start, end]);

  useEffect(() => {
    void loadBanks();
  }, [loadBanks]);

  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  const createBank = async () => {
    if (!baCode || !baName) {
      toast.error("Code and name required");
      return;
    }
    setBaBusy(true);
    try {
      await api.post("/accounting/bank-accounts", {
        code: baCode,
        name: baName,
        type: baType,
        bankName: baBank || undefined,
        openingBalance: parseFloat(baOpen) || 0,
        glAccountId: baGl || undefined,
      });
      toast.success("Bank account created");
      setNewAccountOpen(false);
      setBaCode("");
      setBaName("");
      setBaBank("");
      setBaOpen("0");
      setBaGl("");
      await loadBanks();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBaBusy(false);
    }
  };

  const postTxn = async () => {
    const amt = parseFloat(txnAmt);
    if (!accountId || !(amt > 0)) {
      toast.error("Select account and amount");
      return;
    }
    setTxnBusy(true);
    try {
      await api.post("/accounting/bank-transactions", {
        bankAccountId: accountId,
        type: txnType,
        amount: amt,
        txnDate,
        description: txnDesc || undefined,
      });
      toast.success("Transaction posted");
      setTxnOpen(false);
      setTxnAmt("");
      setTxnDesc("");
      await loadBanks();
      await loadBook();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Post failed");
    } finally {
      setTxnBusy(false);
    }
  };

  const transfer = async () => {
    const amt = parseFloat(xferAmt);
    if (!accountId || !xferTo || !(amt > 0)) {
      toast.error("From, to, and amount required");
      return;
    }
    setXferBusy(true);
    try {
      await api.post("/accounting/bank-transfers", {
        fromAccountId: accountId,
        toAccountId: xferTo,
        amount: amt,
        description: xferDesc || undefined,
      });
      toast.success("Transfer completed");
      setTransferOpen(false);
      setXferAmt("");
      setXferDesc("");
      await loadBanks();
      await loadBook();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setXferBusy(false);
    }
  };

  const otherBanks = useMemo(() => banks.filter((b) => b.id !== accountId), [banks, accountId]);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">New account</h3>
              <Button size="sm" onClick={() => setNewAccountOpen(true)} disabled={baBusy} className="gap-1.5">
                {baBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Fill the details in a modal.</p>
          </CardContent>
        </Card>

        <Dialog open={newAccountOpen} onOpenChange={setNewAccountOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>New bank account</DialogTitle>
              <DialogDescription>Optionally link to a GL account.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Code</Label>
                <Input className="h-9" placeholder="e.g. CASH-001" value={baCode} onChange={(e) => setBaCode(e.target.value)} disabled={baBusy} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input className="h-9" placeholder="e.g. Petty Cash" value={baName} onChange={(e) => setBaName(e.target.value)} disabled={baBusy} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={baType} onValueChange={setBaType} disabled={baBusy}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CURRENT">Current</SelectItem>
                    <SelectItem value="SAVINGS">Savings</SelectItem>
                    <SelectItem value="CASH_IN_HAND">Cash in hand</SelectItem>
                    <SelectItem value="PETTY_CASH">Petty cash</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bank name</Label>
                <Input className="h-9" placeholder="Optional" value={baBank} onChange={(e) => setBaBank(e.target.value)} disabled={baBusy} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Opening balance</Label>
                <Input className="h-9" type="number" placeholder="0" value={baOpen} onChange={(e) => setBaOpen(e.target.value)} disabled={baBusy} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">GL link</Label>
                <Select value={baGl || "_none"} onValueChange={(v) => setBaGl(v === "_none" ? "" : v)} disabled={baBusy}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="No GL link" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No GL link</SelectItem>
                    {glAccounts.filter((a) => a.type === "ASSET").map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} — {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" disabled={baBusy} onClick={() => setNewAccountOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void createBank()} disabled={baBusy} className="gap-1.5">
                {baBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold">Accounts</h3>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {banks.map((b) => (
                <button
                  key={b.id}
                  onClick={() => setAccountId(b.id)}
                  className={`w-full flex justify-between items-center px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                    accountId === b.id ? "bg-primary/10 border border-primary/30" : "hover:bg-muted border border-transparent"
                  }`}
                >
                  <span>
                    <span className="font-mono text-xs mr-2">{b.code}</span>
                    {b.name}
                    <Badge variant="outline" className="ml-2 text-[9px]">{b.type}</Badge>
                  </span>
                  <span className="tabular-nums font-medium">{formatNumber(b.currentBalance)}</span>
                </button>
              ))}
              {!banks.length && <p className="text-xs text-muted-foreground py-4 text-center">No bank accounts yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-9 w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9 w-40" />
          </div>
          <Button size="sm" className="h-9" onClick={() => void loadBook()} disabled={loading || !accountId}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Load book
          </Button>
          {book && (
            <span className="text-sm text-muted-foreground ml-auto">
              Opening {formatNumber(book.opening)} → Closing {formatNumber(book.closing)}
              {book.account.glAccountId ? " · GL linked" : " · No GL"}
            </span>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Deposit / Withdrawal</h3>
              <Button
                size="sm"
                onClick={() => setTxnOpen(true)}
                disabled={txnBusy || !accountId}
                className="gap-1.5"
              >
                {txnBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Post
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Select type, amount, and description in a modal.</p>
          </CardContent>
        </Card>

        <Dialog open={txnOpen} onOpenChange={setTxnOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Post bank transaction</DialogTitle>
              <DialogDescription>Posts deposit/withdrawal into the selected bank account.</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select value={txnType} onValueChange={setTxnType} disabled={txnBusy}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEPOSIT">Deposit</SelectItem>
                    <SelectItem value="WITHDRAWAL">Withdrawal</SelectItem>
                    <SelectItem value="FEE">Bank fee</SelectItem>
                    <SelectItem value="INTEREST">Interest</SelectItem>
                    <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date</Label>
                <Input type="date" className="h-9" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} disabled={txnBusy} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input type="number" className="h-9" placeholder="0" value={txnAmt} onChange={(e) => setTxnAmt(e.target.value)} disabled={txnBusy} />
              </div>
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Description</Label>
                <Input className="h-9" placeholder="Optional" value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} disabled={txnBusy} />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" disabled={txnBusy} onClick={() => setTxnOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void postTxn()} disabled={txnBusy || !accountId} className="gap-1.5">
                {txnBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Post
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ArrowLeftRight className="h-4 w-4" /> Transfer
              </h3>
              <Button size="sm" onClick={() => setTransferOpen(true)} disabled={xferBusy || !accountId} className="gap-1.5">
                {xferBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
                Transfer
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Choose destination account and amount in a modal.</p>
          </CardContent>
        </Card>

        <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Transfer between bank accounts</DialogTitle>
              <DialogDescription>Transfers from the currently selected account.</DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">To account</Label>
                <Select value={xferTo || "_none"} onValueChange={(v) => setXferTo(v === "_none" ? "" : v)} disabled={xferBusy}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="To account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">To account…</SelectItem>
                    {otherBanks.map((b) => (
                      <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Amount</Label>
                <Input type="number" className="h-9" placeholder="0" value={xferAmt} onChange={(e) => setXferAmt(e.target.value)} disabled={xferBusy} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input className="h-9" placeholder="Optional" value={xferDesc} onChange={(e) => setXferDesc(e.target.value)} disabled={xferBusy} />
              </div>
            </div>

            <DialogFooter className="gap-2 pt-2">
              <Button variant="outline" disabled={xferBusy} onClick={() => setTransferOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" onClick={() => void transfer()} disabled={xferBusy || !accountId} className="gap-1.5">
                {xferBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
                Transfer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !book?.entries?.length ? (
            <p className="text-center text-sm text-muted-foreground py-12">No transactions in range</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-left px-4 py-3">Type</th>
                    <th className="text-left px-4 py-3">Description</th>
                    <th className="text-right px-4 py-3">In</th>
                    <th className="text-right px-4 py-3">Out</th>
                    <th className="text-right px-4 py-3">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {book.entries.map((e) => (
                    <tr key={e.id} className="border-b border-border/40">
                      <td className="px-4 py-2.5 text-muted-foreground">{fmt(e.txnDate)}</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{e.type}</Badge></td>
                      <td className="px-4 py-2.5">{e.description || e.reference || "—"}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-600">
                        {e.inflow ? formatNumber(e.amount) : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-red-600">
                        {!e.inflow ? formatNumber(e.amount) : ""}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(e.balanceAfter)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReconciliationPanel() {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [recons, setRecons] = useState<Recon[]>([]);
  const [bankId, setBankId] = useState("");
  const [stmtDate, setStmtDate] = useState(today());
  const [stmtBal, setStmtBal] = useState("");
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Recon | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([
        api.get<BankAccount[]>("/accounting/bank-accounts"),
        api.get<Recon[]>("/accounting/bank-reconciliations"),
      ]);
      setBanks(Array.isArray(b.data) ? b.data : []);
      setRecons(Array.isArray(r.data) ? r.data : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const start = async () => {
    if (!bankId || stmtBal === "") {
      toast.error("Select account and statement balance");
      return;
    }
    setBusy(true);
    try {
      const res = await api.post<Recon>("/accounting/bank-reconciliations", {
        bankAccountId: bankId,
        statementDate: stmtDate,
        statementBalance: parseFloat(stmtBal),
      });
      toast.success("Reconciliation started");
      setStmtBal("");
      setActive(res.data);
      setMatched(new Set());
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Start failed");
    } finally {
      setBusy(false);
    }
  };

  const openRecon = async (id: string) => {
    try {
      const res = await api.get<Recon>(`/accounting/bank-reconciliations/${id}`);
      setActive(res.data);
      setMatched(new Set((res.data.matchedTxns ?? []).map((t) => t.id)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to open");
    }
  };

  const toggleMatch = (id: string) => {
    setMatched((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const complete = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api.post(`/accounting/bank-reconciliations/${active.id}/complete`, {
        matchedTxnIds: [...matched],
      });
      toast.success("Reconciliation completed");
      setActive(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Complete failed");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await api.post(`/accounting/bank-reconciliations/${active.id}/cancel`);
      toast.success("Cancelled");
      setActive(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  const unmatched = active?.unmatchedTxns ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Start reconciliation</h3>
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Bank account</Label>
              <Select value={bankId || "_none"} onValueChange={(v) => setBankId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select account</SelectItem>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.code} — {b.name} ({formatNumber(b.currentBalance)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Statement date</Label>
              <Input type="date" value={stmtDate} onChange={(e) => setStmtDate(e.target.value)} className="h-9" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Statement balance</Label>
              <Input type="number" value={stmtBal} onChange={(e) => setStmtBal(e.target.value)} className="h-9" />
            </div>
            <Button onClick={() => void start()} disabled={busy} className="h-9 gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Building2 className="h-3.5 w-3.5" />}
              Start
            </Button>
          </div>
        </CardContent>
      </Card>

      {active && (
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm">
                  {active.bankAccount?.code} — {active.bankAccount?.name}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Statement {fmt(active.statementDate)} · Diff{" "}
                  <span className={Math.abs(active.difference) < 0.01 ? "text-emerald-600" : "text-amber-600"}>
                    {formatNumber(active.difference)}
                  </span>
                  {" · "}
                  <Badge className="text-[10px]">{active.status}</Badge>
                </p>
              </div>
              {active.status === "DRAFT" && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => void cancel()} disabled={busy}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void complete()} disabled={busy}>
                    Complete ({matched.size} matched)
                  </Button>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              <div className="rounded-lg border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Statement</p>
                <p className="font-semibold tabular-nums">{formatNumber(active.statementBalance)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">System</p>
                <p className="font-semibold tabular-nums">{formatNumber(active.systemBalance)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-[10px] uppercase text-muted-foreground">Unmatched</p>
                <p className="font-semibold tabular-nums">{unmatched.length}</p>
              </div>
            </div>

            {active.status === "DRAFT" && (
              <div className="rounded-xl border overflow-hidden">
                <div className="px-3 py-2 bg-muted/30 text-[10px] font-semibold uppercase text-muted-foreground">
                  Tick transactions on the statement
                </div>
                {unmatched.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">No unreconciled transactions</p>
                ) : (
                  <div className="divide-y max-h-72 overflow-y-auto">
                    {unmatched.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/20 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={matched.has(t.id)}
                          onChange={() => toggleMatch(t.id)}
                          className="rounded"
                        />
                        <span className="text-muted-foreground w-24 shrink-0">{fmt(t.txnDate)}</span>
                        <Badge variant="outline" className="text-[10px]">{t.type}</Badge>
                        <span className="flex-1 truncate">{t.description || t.reference || "—"}</span>
                        <span className="tabular-nums font-medium">{formatNumber(t.amount)}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                    <th className="text-left px-4 py-3">Account</th>
                    <th className="text-left px-4 py-3">Date</th>
                    <th className="text-right px-4 py-3">Statement</th>
                    <th className="text-right px-4 py-3">System</th>
                    <th className="text-right px-4 py-3">Diff</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {recons.map((r) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="px-4 py-2.5">{r.bankAccount?.code} — {r.bankAccount?.name}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{fmt(r.statementDate)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.statementBalance)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.systemBalance)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(r.difference)}</td>
                      <td className="px-4 py-2.5"><Badge className="text-[10px]">{r.status}</Badge></td>
                      <td className="px-4 py-2.5 text-right">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => void openRecon(r.id)}>
                          Open
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!recons.length && (
                    <tr>
                      <td colSpan={7} className="text-center text-muted-foreground py-10 text-sm">
                        No reconciliations yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
