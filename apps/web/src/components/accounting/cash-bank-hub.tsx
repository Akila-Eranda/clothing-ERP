"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  ArrowLeftRight, ArrowDownCircle, ArrowUpCircle, Banknote, BookOpen, Building2,
  Landmark, LayoutGrid, Loader2, Plus, RefreshCw, Scale, Wallet,
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
import { ClientSideTable, DataTableColumnHeader } from "@/components/table";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useShopWorkspace } from "@/lib/use-shop-profile";

type Tab = "accounts" | "cash" | "bank" | "recon";

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

export function CashBankHub({ initialTab = "accounts" }: { initialTab?: Tab }) {
  useShopWorkspace();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [bookAccountId, setBookAccountId] = useState<string | undefined>();

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const tabs: { id: Tab; label: string; icon: typeof BookOpen }[] = [
    { id: "accounts", label: "Accounts", icon: LayoutGrid },
    { id: "cash", label: "Cash Book", icon: BookOpen },
    { id: "bank", label: "Bank Book", icon: Landmark },
    { id: "recon", label: "Reconciliation", icon: Scale },
  ];

  const openBook = (accountId: string) => {
    setBookAccountId(accountId);
    setTab("bank");
  };

  return (
    <div className="page-shell w-full">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] md:text-3xl font-bold tracking-tight leading-tight">Cash & Bank</h1>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            Liquidity overview · cash book · bank ledger · statement reconciliation
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 p-1 rounded-[14px] border bg-muted/40 w-fit max-w-full">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-[10px] text-sm font-semibold transition-all ${
                active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/60"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "accounts" && (
        <AccountsOverviewPanel onOpenBook={openBook} onReconcile={() => setTab("recon")} />
      )}
      {tab === "cash" && <CashBookPanel />}
      {tab === "bank" && <BankBookPanel initialAccountId={bookAccountId} />}
      {tab === "recon" && <ReconciliationPanel />}
    </div>
  );
}

/* ── Accounts overview (KPI strip + account cards) ── */

const CASH_TYPES = ["CASH_IN_HAND", "PETTY_CASH"];
const BANK_TYPES = ["CURRENT", "SAVINGS"];

function typeLabel(t: string) {
  switch (t) {
    case "CASH_IN_HAND": return "Cash in hand";
    case "PETTY_CASH": return "Petty cash";
    case "CURRENT": return "Current";
    case "SAVINGS": return "Savings";
    default: return t.replace(/_/g, " ").toLowerCase();
  }
}

function AccountsOverviewPanel({
  onOpenBook,
  onReconcile,
}: {
  onOpenBook: (accountId: string) => void;
  onReconcile: () => void;
}) {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [loading, setLoading] = useState(true);

  // quick transaction dialog
  const [txnAccount, setTxnAccount] = useState<BankAccount | null>(null);
  const [txnType, setTxnType] = useState<"DEPOSIT" | "WITHDRAWAL">("DEPOSIT");
  const [txnAmt, setTxnAmt] = useState("");
  const [txnDesc, setTxnDesc] = useState("");
  const [txnDate, setTxnDate] = useState(today());
  const [txnBusy, setTxnBusy] = useState(false);

  // transfer dialog
  const [xferFrom, setXferFrom] = useState<BankAccount | null>(null);
  const [xferTo, setXferTo] = useState("");
  const [xferAmt, setXferAmt] = useState("");
  const [xferDesc, setXferDesc] = useState("");
  const [xferBusy, setXferBusy] = useState(false);

  // add account dialog
  const [addOpen, setAddOpen] = useState(false);
  const [baCode, setBaCode] = useState("");
  const [baName, setBaName] = useState("");
  const [baType, setBaType] = useState("CURRENT");
  const [baBank, setBaBank] = useState("");
  const [baOpen, setBaOpen] = useState("0");
  const [baGl, setBaGl] = useState("");
  const [baBusy, setBaBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a] = await Promise.all([
        api.get<BankAccount[]>("/accounting/bank-accounts"),
        api.get<{ data: GlAccount[] }>("/accounting/accounts?flat=true"),
      ]);
      setBanks(Array.isArray(b.data) ? b.data : []);
      setGlAccounts(a.data?.data ?? []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const cashAccounts  = useMemo(() => banks.filter((b) => CASH_TYPES.includes(b.type)), [banks]);
  const bankAccounts  = useMemo(() => banks.filter((b) => BANK_TYPES.includes(b.type)), [banks]);
  const otherAccounts = useMemo(
    () => banks.filter((b) => !CASH_TYPES.includes(b.type) && !BANK_TYPES.includes(b.type)),
    [banks],
  );

  const cashTotal  = cashAccounts.reduce((s, b) => s + b.currentBalance, 0);
  const bankTotal  = bankAccounts.reduce((s, b) => s + b.currentBalance, 0);
  const otherTotal = otherAccounts.reduce((s, b) => s + b.currentBalance, 0);
  const totalLiquidity = cashTotal + bankTotal + otherTotal;

  const openTxn = (b: BankAccount, type: "DEPOSIT" | "WITHDRAWAL") => {
    setTxnAccount(b);
    setTxnType(type);
    setTxnAmt("");
    setTxnDesc("");
    setTxnDate(today());
  };

  const postTxn = async () => {
    const amt = parseFloat(txnAmt);
    if (!txnAccount || !(amt > 0)) {
      toast.error("Amount required");
      return;
    }
    setTxnBusy(true);
    try {
      await api.post("/accounting/bank-transactions", {
        bankAccountId: txnAccount.id,
        type: txnType,
        amount: amt,
        txnDate,
        description: txnDesc || undefined,
      });
      toast.success(txnType === "DEPOSIT" ? "Money in recorded" : "Money out recorded");
      setTxnAccount(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Post failed");
    } finally {
      setTxnBusy(false);
    }
  };

  const transfer = async () => {
    const amt = parseFloat(xferAmt);
    if (!xferFrom || !xferTo || !(amt > 0)) {
      toast.error("Destination and amount required");
      return;
    }
    setXferBusy(true);
    try {
      await api.post("/accounting/bank-transfers", {
        fromAccountId: xferFrom.id,
        toAccountId: xferTo,
        amount: amt,
        description: xferDesc || undefined,
      });
      toast.success("Transfer completed");
      setXferFrom(null);
      setXferTo("");
      setXferAmt("");
      setXferDesc("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Transfer failed");
    } finally {
      setXferBusy(false);
    }
  };

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
      toast.success("Account created");
      setAddOpen(false);
      setBaCode(""); setBaName(""); setBaBank(""); setBaOpen("0"); setBaGl("");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBaBusy(false);
    }
  };

  const summaryRows = [
    {
      label: "Total Liquidity",
      value: `LKR ${formatNumber(totalLiquidity)}`,
      sub: `${banks.length} accounts`,
      icon: Wallet,
      color: "text-blue-600",
      bg: "bg-blue-500/15",
      tint: "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-500/20 dark:from-blue-500/10 dark:to-transparent",
    },
    {
      label: "Cash on Hand",
      value: `LKR ${formatNumber(cashTotal)}`,
      sub: `${cashAccounts.length} registers`,
      icon: Banknote,
      color: "text-emerald-600",
      bg: "bg-emerald-500/15",
      tint: "border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent",
    },
    {
      label: "Bank Balances",
      value: `LKR ${formatNumber(bankTotal)}`,
      sub: `${bankAccounts.length} accounts`,
      icon: Landmark,
      color: "text-indigo-600",
      bg: "bg-indigo-500/15",
      tint: "border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-transparent",
    },
    ...(otherAccounts.length
      ? [{
          label: "Other",
          value: `LKR ${formatNumber(otherTotal)}`,
          sub: `${otherAccounts.length} accounts`,
          icon: Wallet,
          color: "text-teal-600",
          bg: "bg-teal-500/15",
          tint: "border-teal-200/70 bg-gradient-to-br from-teal-50 to-white dark:border-teal-500/20 dark:from-teal-500/10 dark:to-transparent",
        }]
      : [{
          label: "Quick Actions",
          value: "Ready",
          sub: "In · Out · Transfer",
          icon: ArrowLeftRight,
          color: "text-amber-600",
          bg: "bg-amber-500/15",
          tint: "border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent",
        }]),
  ];

  const accountCard = (b: BankAccount) => {
    const negative = b.currentBalance < 0;
    const isCash = CASH_TYPES.includes(b.type);
    return (
      <Card
        key={b.id}
        className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150"
      >
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => onOpenBook(b.id)}
                title="Open account book"
                className="text-sm font-semibold text-left text-foreground hover:text-primary hover:underline underline-offset-2 truncate block max-w-full"
              >
                {b.name}
              </button>
              <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                {typeLabel(b.type)}{b.bankName ? ` · ${b.bankName}` : ""} · <span className="font-mono">{b.code}</span>
              </p>
            </div>
            <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${isCash ? "bg-emerald-500/15 text-emerald-600" : "bg-indigo-500/15 text-indigo-600"}`}>
              {isCash ? <Banknote className="h-[18px] w-[18px]" /> : <Landmark className="h-[18px] w-[18px]" />}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Balance</p>
            <p className={`text-xl font-bold tabular-nums leading-tight ${negative ? "text-red-600" : "text-foreground"}`}>
              LKR {formatNumber(b.currentBalance)}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-auto">
            <button
              type="button"
              onClick={() => openTxn(b, "DEPOSIT")}
              className="inline-flex items-center justify-center gap-1 h-9 rounded-[10px] text-xs font-semibold bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-600/15 hover:bg-emerald-500/15 transition-colors"
            >
              <ArrowDownCircle className="h-3.5 w-3.5" /> In
            </button>
            <button
              type="button"
              onClick={() => openTxn(b, "WITHDRAWAL")}
              className="inline-flex items-center justify-center gap-1 h-9 rounded-[10px] text-xs font-semibold bg-red-500/10 text-red-600 ring-1 ring-red-600/15 hover:bg-red-500/15 transition-colors"
            >
              <ArrowUpCircle className="h-3.5 w-3.5" /> Out
            </button>
            <button
              type="button"
              onClick={() => { setXferFrom(b); setXferTo(""); setXferAmt(""); setXferDesc(""); }}
              className="inline-flex items-center justify-center gap-1 h-9 rounded-[10px] text-xs font-semibold bg-muted text-muted-foreground ring-1 ring-border hover:text-foreground transition-colors"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" /> Move
            </button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const section = (id: string, title: string, icon: ReactNode, tone: string, accounts: BankAccount[]) => (
    <div id={id} className="rounded-[18px] border bg-card overflow-hidden shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
        <div className="flex items-center gap-2.5">
          <div className={`h-8 w-8 rounded-[10px] flex items-center justify-center ${tone}`}>{icon}</div>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <Badge variant="secondary" className="h-6 rounded-full px-2.5 text-[11px] font-semibold">{accounts.length}</Badge>
      </div>
      <div className="p-4">
        {accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No accounts yet — add one to get started</p>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {accounts.map(accountCard)}
          </div>
        )}
      </div>
    </div>
  );

  if (loading) {
    return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={() => void load()} className="h-10 rounded-[12px] gap-1.5 text-sm">
          <RefreshCw className="h-[18px] w-[18px]" /> Refresh
        </Button>
        <Button variant="outline" onClick={onReconcile} className="h-10 rounded-[12px] gap-1.5 text-sm">
          <Scale className="h-[18px] w-[18px]" /> Reconcile
        </Button>
        <Button onClick={() => setAddOpen(true)} className="h-10 rounded-[12px] gap-1.5 text-sm">
          <Plus className="h-[18px] w-[18px]" /> Add Account
        </Button>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {summaryRows.map((s) => (
          <Card
            key={s.label}
            className={`rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:-translate-y-0.5 hover:shadow-[0_4px_14px_rgba(15,23,42,0.07)] transition-all duration-150 ${s.tint}`}
          >
            <CardContent className="h-[72px] p-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-[12px] flex items-center justify-center shrink-0 ${s.bg}`}>
                <s.icon className={`h-[18px] w-[18px] ${s.color}`} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none tabular-nums truncate">{s.value}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1 truncate">{s.label}</p>
                <p className="text-[10px] text-muted-foreground/80 truncate">{s.sub}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        {section("cash-registers", "Cash registers", <Banknote className="h-4 w-4" />, "bg-emerald-500/15 text-emerald-600", cashAccounts)}
        {section("bank-accounts", "Bank accounts", <Landmark className="h-4 w-4" />, "bg-indigo-500/15 text-indigo-600", bankAccounts)}
        {otherAccounts.length > 0 &&
          section("other-accounts", "Other accounts", <Wallet className="h-4 w-4" />, "bg-teal-500/15 text-teal-600", otherAccounts)}
      </div>

      {/* ── Money in / out dialog ── */}
      <Dialog open={!!txnAccount} onOpenChange={(o) => { if (!o) setTxnAccount(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {txnType === "DEPOSIT" ? "Money in" : "Money out"} — {txnAccount?.name}
            </DialogTitle>
            <DialogDescription>
              {txnType === "DEPOSIT"
                ? "Record a deposit into this account."
                : "Record a withdrawal from this account."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" className="h-9" placeholder="0.00" value={txnAmt} onChange={(e) => setTxnAmt(e.target.value)} disabled={txnBusy} autoFocus />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date</Label>
              <Input type="date" className="h-9" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} disabled={txnBusy} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Description</Label>
              <Input className="h-9" placeholder="Optional" value={txnDesc} onChange={(e) => setTxnDesc(e.target.value)} disabled={txnBusy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={txnBusy} onClick={() => setTxnAccount(null)}>Cancel</Button>
            <Button onClick={() => void postTxn()} disabled={txnBusy} className="gap-1.5">
              {txnBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : txnType === "DEPOSIT" ? <ArrowDownCircle className="h-3.5 w-3.5" /> : <ArrowUpCircle className="h-3.5 w-3.5" />}
              {txnType === "DEPOSIT" ? "Record in" : "Record out"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Transfer dialog ── */}
      <Dialog open={!!xferFrom} onOpenChange={(o) => { if (!o) setXferFrom(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Transfer from {xferFrom?.name}</DialogTitle>
            <DialogDescription>Move money to another cash or bank account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">To account</Label>
              <Select value={xferTo || "_none"} onValueChange={(v) => setXferTo(v === "_none" ? "" : v)} disabled={xferBusy}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select account…</SelectItem>
                  {banks.filter((b) => b.id !== xferFrom?.id).map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input type="number" className="h-9" placeholder="0.00" value={xferAmt} onChange={(e) => setXferAmt(e.target.value)} disabled={xferBusy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="h-9" placeholder="Optional" value={xferDesc} onChange={(e) => setXferDesc(e.target.value)} disabled={xferBusy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" disabled={xferBusy} onClick={() => setXferFrom(null)}>Cancel</Button>
            <Button onClick={() => void transfer()} disabled={xferBusy} className="gap-1.5">
              {xferBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowLeftRight className="h-3.5 w-3.5" />}
              Transfer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add account dialog ── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>New cash / bank account</DialogTitle>
            <DialogDescription>Optionally link to a GL account.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input className="h-9" placeholder="e.g. BANK-001" value={baCode} onChange={(e) => setBaCode(e.target.value)} disabled={baBusy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="h-9" placeholder="e.g. Main Bank" value={baName} onChange={(e) => setBaName(e.target.value)} disabled={baBusy} />
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
            <Button variant="outline" disabled={baBusy} onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={() => void createBank()} disabled={baBusy} className="gap-1.5">
              {baBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

  const cashRows = useMemo(
    () => (book?.entries ?? []).map((e, i) => ({ ...e, id: e.id ?? `cb-${i}` })),
    [book],
  );

  const cashColumns = useMemo<ColumnDef<CashEntry & { id: string }>[]>(
    () => [
      {
        id: "entryDate",
        accessorFn: (e) => fmt(e.entryDate),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{fmt(row.original.entryDate)}</span>
        ),
      },
      {
        id: "type",
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] rounded-full">{row.original.type}</Badge>
        ),
      },
      {
        id: "description",
        accessorKey: "description",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => <span>{row.original.description}</span>,
      },
      {
        id: "debit",
        accessorKey: "debit",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Debit" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-emerald-600">
            {row.original.debit ? formatNumber(row.original.debit) : ""}
          </span>
        ),
      },
      {
        id: "credit",
        accessorKey: "credit",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Credit" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-red-600">
            {row.original.credit ? formatNumber(row.original.credit) : ""}
          </span>
        ),
      },
      {
        id: "balance",
        accessorFn: (e) => e.balanceAfter ?? 0,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">{formatNumber(row.original.balanceAfter ?? 0)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 w-40 rounded-[12px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 w-40 rounded-[12px]" />
          </div>
          <Button variant="outline" className="h-10 rounded-[12px] gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Load
          </Button>
          <Badge variant="secondary" className="h-7 rounded-full px-2.5 text-[11px] font-semibold self-center">
            {book?.source ?? "—"}
          </Badge>
        </div>
        <Button onClick={() => setCashEntryOpen(true)} disabled={busy} className="h-10 rounded-[12px] gap-1.5">
          {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Plus className="h-[18px] w-[18px]" />}
          Add entry
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card className="rounded-[18px] border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent">
          <CardContent className="h-[72px] p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-[12px] bg-emerald-500/15 flex items-center justify-center shrink-0">
              <ArrowDownCircle className="h-[18px] w-[18px] text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tabular-nums truncate">LKR {formatNumber(book?.opening ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground font-medium mt-1">Opening balance</p>
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-[18px] border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-transparent">
          <CardContent className="h-[72px] p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-[12px] bg-indigo-500/15 flex items-center justify-center shrink-0">
              <Wallet className="h-[18px] w-[18px] text-indigo-600" />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-none tabular-nums truncate">LKR {formatNumber(book?.closing ?? 0)}</p>
              <p className="text-[11px] text-muted-foreground font-medium mt-1">Closing balance</p>
            </div>
          </CardContent>
        </Card>
      </div>

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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ClientSideTable
          fillHeight={false}
          data={cashRows}
          columns={cashColumns}
          pageCount={Math.max(1, Math.ceil(cashRows.length / 10))}
          searchableColumns={[
            { id: "description", title: "Description" },
            { id: "type", title: "Type" },
          ]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "cash-book" }}
        />
      )}
    </div>
  );
}

function BankBookPanel({ initialAccountId }: { initialAccountId?: string }) {
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [glAccounts, setGlAccounts] = useState<GlAccount[]>([]);
  const [accountId, setAccountId] = useState(initialAccountId ?? "");
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialAccountId) setAccountId(initialAccountId);
  }, [initialAccountId]);
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

  const bankColumns = useMemo<ColumnDef<BankBookEntry>[]>(
    () => [
      {
        id: "txnDate",
        accessorFn: (e) => fmt(e.txnDate),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{fmt(row.original.txnDate)}</span>
        ),
      },
      {
        id: "type",
        accessorKey: "type",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
        cell: ({ row }) => (
          <Badge variant="outline" className="text-[10px] rounded-full">{row.original.type}</Badge>
        ),
      },
      {
        id: "description",
        accessorFn: (e) => e.description || e.reference || "",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
        cell: ({ row }) => <span>{row.original.description || row.original.reference || "—"}</span>,
      },
      {
        id: "in",
        accessorFn: (e) => (e.inflow ? e.amount : 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="In" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-emerald-600">
            {row.original.inflow ? formatNumber(row.original.amount) : ""}
          </span>
        ),
      },
      {
        id: "out",
        accessorFn: (e) => (!e.inflow ? e.amount : 0),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Out" />,
        cell: ({ row }) => (
          <span className="tabular-nums text-red-600">
            {!row.original.inflow ? formatNumber(row.original.amount) : ""}
          </span>
        ),
      },
      {
        id: "balanceAfter",
        accessorKey: "balanceAfter",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Balance" />,
        cell: ({ row }) => (
          <span className="tabular-nums font-medium">{formatNumber(row.original.balanceAfter)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1 min-w-[200px]">
            <Label className="text-xs">Account</Label>
            <Select value={accountId || "_none"} onValueChange={(v) => setAccountId(v === "_none" ? "" : v)}>
              <SelectTrigger className="h-10 rounded-[12px]"><SelectValue placeholder="Select account…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Select account…</SelectItem>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.code} — {b.name} ({formatNumber(b.currentBalance)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="h-10 w-40 rounded-[12px]" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="h-10 w-40 rounded-[12px]" />
          </div>
          <Button variant="outline" className="h-10 rounded-[12px] gap-1.5" onClick={() => void loadBook()} disabled={loading || !accountId}>
            <RefreshCw className={`h-[18px] w-[18px] ${loading ? "animate-spin" : ""}`} /> Load
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setNewAccountOpen(true)} disabled={baBusy} className="h-10 rounded-[12px] gap-1.5">
            <Plus className="h-[18px] w-[18px]" /> Account
          </Button>
          <Button variant="outline" onClick={() => setTxnOpen(true)} disabled={txnBusy || !accountId} className="h-10 rounded-[12px] gap-1.5">
            <Banknote className="h-[18px] w-[18px]" /> Post
          </Button>
          <Button onClick={() => setTransferOpen(true)} disabled={xferBusy || !accountId} className="h-10 rounded-[12px] gap-1.5">
            <ArrowLeftRight className="h-[18px] w-[18px]" /> Transfer
          </Button>
        </div>
      </div>

      {book && (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
          <Card className="rounded-[18px] border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent">
            <CardContent className="h-[72px] p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-[12px] bg-emerald-500/15 flex items-center justify-center shrink-0">
                <ArrowDownCircle className="h-[18px] w-[18px] text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none tabular-nums truncate">LKR {formatNumber(book.opening)}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">Opening</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[18px] border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-transparent">
            <CardContent className="h-[72px] p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-[12px] bg-indigo-500/15 flex items-center justify-center shrink-0">
                <Wallet className="h-[18px] w-[18px] text-indigo-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none tabular-nums truncate">LKR {formatNumber(book.closing)}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">Closing</p>
              </div>
            </CardContent>
          </Card>
          <Card className="rounded-[18px] border-amber-200/70 bg-gradient-to-br from-amber-50 to-white shadow-[0_2px_10px_rgba(15,23,42,0.04)] dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent col-span-2 xl:col-span-1">
            <CardContent className="h-[72px] p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-[12px] bg-amber-500/15 flex items-center justify-center shrink-0">
                <Landmark className="h-[18px] w-[18px] text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-lg font-bold leading-none truncate">{book.account.name}</p>
                <p className="text-[11px] text-muted-foreground font-medium mt-1">
                  {book.account.glAccountId ? "GL linked" : "No GL link"} · {book.entries.length} txns
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ClientSideTable
          fillHeight={false}
          data={book?.entries ?? []}
          columns={bankColumns}
          pageCount={Math.max(1, Math.ceil((book?.entries?.length ?? 0) / 10))}
          searchableColumns={[
            { id: "description", title: "Description" },
            { id: "type", title: "Type" },
          ]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "bank-ledger" }}
        />
      )}
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

  const reconColumns = useMemo<ColumnDef<Recon>[]>(
    () => [
      {
        id: "account",
        accessorFn: (r) => `${r.bankAccount?.code ?? ""} ${r.bankAccount?.name ?? ""}`,
        header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
        cell: ({ row }) => (
          <span>
            {row.original.bankAccount?.code} — {row.original.bankAccount?.name}
          </span>
        ),
      },
      {
        id: "date",
        accessorFn: (r) => fmt(r.statementDate),
        header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{fmt(row.original.statementDate)}</span>
        ),
      },
      {
        id: "statement",
        accessorKey: "statementBalance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Statement" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.statementBalance)}</span>
        ),
      },
      {
        id: "system",
        accessorKey: "systemBalance",
        header: ({ column }) => <DataTableColumnHeader column={column} title="System" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.systemBalance)}</span>
        ),
      },
      {
        id: "diff",
        accessorKey: "difference",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Diff" />,
        cell: ({ row }) => (
          <span className="tabular-nums">{formatNumber(row.original.difference)}</span>
        ),
      },
      {
        id: "status",
        accessorKey: "status",
        header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
        cell: ({ row }) => <Badge className="text-[10px] rounded-full">{row.original.status}</Badge>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 rounded-[10px]"
            onClick={() => void openRecon(row.original.id)}
          >
            Open
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4">
      <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)]">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b bg-muted/30">
          <div className="h-8 w-8 rounded-[10px] bg-amber-500/15 text-amber-600 flex items-center justify-center">
            <Scale className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-semibold">Start reconciliation</h3>
        </div>
        <CardContent className="p-4">
          <div className="grid sm:grid-cols-4 gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs">Bank account</Label>
              <Select value={bankId || "_none"} onValueChange={(v) => setBankId(v === "_none" ? "" : v)}>
                <SelectTrigger className="h-10 rounded-[12px]"><SelectValue placeholder="Select…" /></SelectTrigger>
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
              <Input type="date" value={stmtDate} onChange={(e) => setStmtDate(e.target.value)} className="h-10 rounded-[12px]" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Statement balance</Label>
              <Input type="number" value={stmtBal} onChange={(e) => setStmtBal(e.target.value)} className="h-10 rounded-[12px]" />
            </div>
            <Button onClick={() => void start()} disabled={busy} className="h-10 rounded-[12px] gap-1.5">
              {busy ? <Loader2 className="h-[18px] w-[18px] animate-spin" /> : <Building2 className="h-[18px] w-[18px]" />}
              Start
            </Button>
          </div>
        </CardContent>
      </Card>

      {active && (
        <Card className="rounded-[18px] shadow-[0_2px_10px_rgba(15,23,42,0.04)] overflow-hidden">
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm">
                  {active.bankAccount?.code} — {active.bankAccount?.name}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Statement {fmt(active.statementDate)} · Diff{" "}
                  <span className={Math.abs(active.difference) < 0.01 ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                    {formatNumber(active.difference)}
                  </span>
                  {" · "}
                  <Badge className="text-[10px] rounded-full">{active.status}</Badge>
                </p>
              </div>
              {active.status === "DRAFT" && (
                <div className="flex gap-2">
                  <Button variant="outline" className="h-10 rounded-[12px]" onClick={() => void cancel()} disabled={busy}>
                    Cancel
                  </Button>
                  <Button className="h-10 rounded-[12px]" onClick={() => void complete()} disabled={busy}>
                    Complete ({matched.size} matched)
                  </Button>
                </div>
              )}
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <Card className="rounded-[14px] border-indigo-200/70 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-500/20 dark:from-indigo-500/10 dark:to-transparent">
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Statement</p>
                  <p className="text-lg font-bold tabular-nums mt-1">{formatNumber(active.statementBalance)}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[14px] border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-white dark:border-emerald-500/20 dark:from-emerald-500/10 dark:to-transparent">
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">System</p>
                  <p className="text-lg font-bold tabular-nums mt-1">{formatNumber(active.systemBalance)}</p>
                </CardContent>
              </Card>
              <Card className="rounded-[14px] border-amber-200/70 bg-gradient-to-br from-amber-50 to-white dark:border-amber-500/20 dark:from-amber-500/10 dark:to-transparent">
                <CardContent className="p-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Unmatched</p>
                  <p className="text-lg font-bold tabular-nums mt-1">{unmatched.length}</p>
                </CardContent>
              </Card>
            </div>

            {active.status === "DRAFT" && (
              <div className="rounded-[14px] border overflow-hidden">
                <div className="px-3 py-2.5 bg-muted/30 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Tick transactions on the statement
                </div>
                {unmatched.length === 0 ? (
                  <p className="text-sm text-muted-foreground p-4">No unreconciled transactions</p>
                ) : (
                  <div className="divide-y max-h-72 overflow-y-auto">
                    {unmatched.map((t) => (
                      <label
                        key={t.id}
                        className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/20 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={matched.has(t.id)}
                          onChange={() => toggleMatch(t.id)}
                          className="rounded"
                        />
                        <span className="text-muted-foreground w-24 shrink-0">{fmt(t.txnDate)}</span>
                        <Badge variant="outline" className="text-[10px] rounded-full">{t.type}</Badge>
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

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ClientSideTable
          fillHeight={false}
          data={recons}
          columns={reconColumns}
          pageCount={Math.max(1, Math.ceil(recons.length / 10))}
          searchableColumns={[
            { id: "account", title: "Account" },
            { id: "status", title: "Status" },
          ] as { id: keyof Recon; title: string }[]}
          filterableColumns={[]}
          isShowExportButtons={{ isShow: true, fileName: "bank-reconciliations" }}
        />
      )}
    </div>
  );
}
