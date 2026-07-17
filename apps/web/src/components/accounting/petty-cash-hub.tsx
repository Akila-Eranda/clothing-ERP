"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calculator, FileText, Loader2, Plus, RefreshCw, Wallet,
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

type Tab = "book" | "claims" | "reports";

type Fund = {
  id: string;
  code: string;
  name: string;
  floatAmount: number;
  currentBalance: number;
  isActive: boolean;
};

type BookLine = {
  id: string;
  type: string;
  txnDate: string;
  description: string;
  category?: string | null;
  amount: number;
  signedAmount: number;
  balanceAfter: number;
  journalEntryId?: string | null;
};

type Claim = {
  id: string;
  claimantName: string;
  description: string;
  amount: number;
  category?: string | null;
  status: string;
  claimDate: string;
  fundId?: string | null;
  reimbursement?: { id: string } | null;
};

type Report = {
  period: { startDate: string; endDate: string };
  funds: Array<{
    id: string;
    code: string;
    name: string;
    floatAmount: number;
    currentBalance: number;
    shortfall: number;
  }>;
  transactions: {
    disbursements: number;
    replenishments: number;
    openings: number;
    byCategory: Array<{ category: string; amount: number }>;
  };
  claims: {
    total: number;
    totalAmount: number;
    byStatus: Record<string, { count: number; amount: number }>;
  };
  reimbursements: { count: number; total: number };
};

function monthStart() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), 1).toISOString().slice(0, 10);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function fmt(d?: string | null) {
  if (!d) return "—";
  return String(d).slice(0, 10);
}

export function PettyCashHub({ initialTab = "book" }: { initialTab?: Tab }) {
  useShopWorkspace();
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => setTab(initialTab), [initialTab]);

  const tabs: { id: Tab; label: string; icon: typeof Wallet }[] = [
    { id: "book", label: "Petty Cash Book", icon: Wallet },
    { id: "claims", label: "Expense Entry", icon: FileText },
    { id: "reports", label: "Reports", icon: Calculator },
  ];

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Petty Cash</h1>
        <p className="text-sm text-muted-foreground">
          Imprest funds, disbursements, expense claims, and reimbursements — linked to Cash & Bank
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

      {tab === "book" && <BookPanel />}
      {tab === "claims" && <ClaimsPanel />}
      {tab === "reports" && <ReportsPanel />}
    </div>
  );
}

function BookPanel() {
  const [funds, setFunds] = useState<Fund[]>([]);
  const [fundId, setFundId] = useState("");
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [lines, setLines] = useState<BookLine[]>([]);
  const [fund, setFund] = useState<Fund | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [fundOpen, setFundOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  const [newCode, setNewCode] = useState("PC01");
  const [newName, setNewName] = useState("Main Petty Cash");
  const [newFloat, setNewFloat] = useState("5000");

  const [expAmt, setExpAmt] = useState("");
  const [expDesc, setExpDesc] = useState("");
  const [expCat, setExpCat] = useState("");

  const loadFunds = useCallback(async () => {
    try {
      const res = await api.get<Fund[]>("/accounting/petty-cash/funds?includeInactive=true");
      const list = Array.isArray(res.data) ? res.data : [];
      setFunds(list);
      if (!fundId && list.length) setFundId(list[0].id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load funds");
    }
  }, [fundId]);

  const loadBook = useCallback(async () => {
    if (!fundId) {
      setLines([]);
      setFund(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await api.get<{ fund: Fund; lines: BookLine[] }>(
        `/accounting/petty-cash/book?fundId=${fundId}&startDate=${start}&endDate=${end}`,
      );
      setFund(res.data?.fund ?? null);
      setLines(Array.isArray(res.data?.lines) ? res.data.lines : []);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load book");
    } finally {
      setLoading(false);
    }
  }, [fundId, start, end]);

  useEffect(() => {
    void loadFunds();
  }, [loadFunds]);

  useEffect(() => {
    void loadBook();
  }, [loadBook]);

  const createFund = async () => {
    setBusy(true);
    try {
      const res = await api.post<Fund>("/accounting/petty-cash/funds", {
        code: newCode,
        name: newName,
        floatAmount: parseFloat(newFloat) || 0,
        openingBalance: parseFloat(newFloat) || 0,
        linkBankAccount: true,
      });
      toast.success("Petty cash fund created");
      setFundId(res.data?.id ?? "");
      setFundOpen(false);
      await loadFunds();
      await loadBook();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const disburse = async () => {
    if (!fundId || !expDesc || !expAmt) {
      toast.error("Amount and description required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/accounting/petty-cash/disbursements", {
        fundId,
        amount: parseFloat(expAmt),
        description: expDesc,
        category: expCat || undefined,
        postToGl: true,
      });
      toast.success("Disbursement recorded");
      setExpAmt("");
      setExpDesc("");
      setExpCat("");
      setExpenseOpen(false);
      await loadFunds();
      await loadBook();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Disbursement failed");
    } finally {
      setBusy(false);
    }
  };

  const replenish = async () => {
    if (!fundId) return;
    setBusy(true);
    try {
      await api.post("/accounting/petty-cash/replenish", { fundId, postToGl: true });
      toast.success("Fund replenished to float");
      await loadFunds();
      await loadBook();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Replenish failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 justify-end">
        <Button size="sm" variant="outline" onClick={() => setFundOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> {!funds.length ? "Create fund" : "New fund"}
        </Button>
        <Button size="sm" onClick={() => setExpenseOpen(true)} disabled={!fundId} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Quick expense
        </Button>
      </div>

      <Dialog open={fundOpen} onOpenChange={setFundOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create petty cash fund</DialogTitle>
            <DialogDescription>Sets float and opening balance, optionally linked to a bank account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Code</Label>
              <Input className="h-9" value={newCode} onChange={(e) => setNewCode(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input className="h-9" value={newName} onChange={(e) => setNewName(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Float</Label>
              <Input className="h-9" type="number" value={newFloat} onChange={(e) => setNewFloat(e.target.value)} disabled={busy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" disabled={busy} onClick={() => void createFund()} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Quick expense</DialogTitle>
            <DialogDescription>Record a disbursement from the selected fund.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input className="h-9" type="number" value={expAmt} onChange={(e) => setExpAmt(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Description</Label>
              <Input className="h-9" value={expDesc} onChange={(e) => setExpDesc(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input className="h-9" value={expCat} onChange={(e) => setExpCat(e.target.value)} disabled={busy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" disabled={busy || !fundId} onClick={() => void disburse()} className="gap-1.5">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Record disbursement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Fund</Label>
            <Select value={fundId} onValueChange={setFundId}>
              <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Select fund" /></SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="h-9 w-40" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="h-9 w-40" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button size="sm" variant="outline" className="h-9" onClick={() => void loadBook()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          <Button size="sm" className="h-9" disabled={busy || !fundId} onClick={() => void replenish()}>
            Replenish to float
          </Button>
        </CardContent>
      </Card>

      {fund && (
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { label: "Float", value: fund.floatAmount },
            { label: "Balance", value: fund.currentBalance },
            { label: "Shortfall", value: Math.max(0, fund.floatAmount - fund.currentBalance) },
          ].map((c) => (
            <Card key={c.label}>
              <CardContent className="p-4">
                <p className="text-[10px] uppercase text-muted-foreground">{c.label}</p>
                <p className="text-xl font-bold tabular-nums mt-1">LKR {formatNumber(c.value)}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
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
                  {lines.map((l) => (
                    <tr key={l.id} className="border-b border-border/40">
                      <td className="px-4 py-2.5">{fmt(l.txnDate)}</td>
                      <td className="px-4 py-2.5"><Badge variant="outline" className="text-[10px]">{l.type}</Badge></td>
                      <td className="px-4 py-2.5">
                        {l.description}
                        {l.category && <span className="text-muted-foreground text-xs ml-1">({l.category})</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">
                        {l.signedAmount > 0 ? formatNumber(l.signedAmount) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-rose-700">
                        {l.signedAmount < 0 ? formatNumber(Math.abs(l.signedAmount)) : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{formatNumber(l.balanceAfter)}</td>
                    </tr>
                  ))}
                  {!lines.length && (
                    <tr>
                      <td colSpan={6} className="text-center text-muted-foreground py-10">
                        {fundId ? "No transactions in period" : "Create a fund to start"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
    </div>
  );
}

function ClaimsPanel() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [funds, setFunds] = useState<Fund[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [fundId, setFundId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, fRes] = await Promise.all([
        api.get<Claim[]>("/accounting/expense-claims"),
        api.get<Fund[]>("/accounting/petty-cash/funds"),
      ]);
      setClaims(Array.isArray(cRes.data) ? cRes.data : []);
      const list = Array.isArray(fRes.data) ? fRes.data : [];
      setFunds(list);
      if (!fundId && list.length) setFundId(list[0].id);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load claims");
    } finally {
      setLoading(false);
    }
  }, [fundId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async (submit: boolean) => {
    if (!name || !desc || !amount) {
      toast.error("Claimant, description, and amount required");
      return;
    }
    setBusy(true);
    try {
      await api.post("/accounting/expense-claims", {
        claimantName: name,
        description: desc,
        amount: parseFloat(amount),
        category: category || undefined,
        fundId: fundId || undefined,
        submit,
      });
      toast.success(submit ? "Claim submitted" : "Draft claim saved");
      setName("");
      setAmount("");
      setDesc("");
      setCategory("");
      setClaimOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: "submit" | "approve" | "reject" | "cancel") => {
    setBusy(true);
    try {
      await api.post(`/accounting/expense-claims/${id}/${action}`, action === "reject" ? { reason: "Rejected" } : {});
      toast.success(`Claim ${action}d`);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const reimburse = async (claim: Claim) => {
    setBusy(true);
    try {
      await api.post("/accounting/reimbursements", {
        claimId: claim.id,
        fundId: claim.fundId || fundId || undefined,
        payFromPettyCash: true,
        postToGl: true,
      });
      toast.success("Claim reimbursed from petty cash");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Reimbursement failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setClaimOpen(true)} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New expense claim
        </Button>
      </div>

      <Dialog open={claimOpen} onOpenChange={setClaimOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New expense claim</DialogTitle>
            <DialogDescription>Save a draft or submit for approval.</DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Claimant</Label>
              <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Amount</Label>
              <Input className="h-9" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Input className="h-9" value={category} onChange={(e) => setCategory(e.target.value)} disabled={busy} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Pay from fund</Label>
              <Select value={fundId} onValueChange={setFundId} disabled={busy}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Pay from fund" /></SelectTrigger>
                <SelectContent>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.code} — {f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Description</Label>
              <Input className="h-9" value={desc} onChange={(e) => setDesc(e.target.value)} disabled={busy} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void create(false)}>Save draft</Button>
            <Button size="sm" disabled={busy} onClick={() => void create(true)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Submit claim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Claimant</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">Amount</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {claims.map((c) => (
                  <tr key={c.id} className="border-b border-border/40">
                    <td className="px-4 py-2.5">{fmt(c.claimDate)}</td>
                    <td className="px-4 py-2.5">{c.claimantName}</td>
                    <td className="px-4 py-2.5">
                      {c.description}
                      {c.category && <span className="text-xs text-muted-foreground ml-1">({c.category})</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.amount)}</td>
                    <td className="px-4 py-2.5"><Badge className="text-[10px]">{c.status}</Badge></td>
                    <td className="px-4 py-2.5">
                      <div className="flex justify-end gap-1 flex-wrap">
                        {c.status === "DRAFT" && (
                          <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => void act(c.id, "submit")}>Submit</Button>
                        )}
                        {(c.status === "DRAFT" || c.status === "SUBMITTED") && (
                          <>
                            <Button variant="ghost" size="sm" className="h-8" disabled={busy} onClick={() => void act(c.id, "approve")}>Approve</Button>
                            <Button variant="outline" size="sm" className="h-8" disabled={busy} onClick={() => void act(c.id, "reject")}>Reject</Button>
                          </>
                        )}
                        {c.status === "APPROVED" && (
                          <Button size="sm" className="h-8" disabled={busy} onClick={() => void reimburse(c)}>Reimburse</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!claims.length && (
                  <tr>
                    <td colSpan={6} className="text-center text-muted-foreground py-10">No expense claims yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsPanel() {
  const [start, setStart] = useState(monthStart());
  const [end, setEnd] = useState(today());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get<Report>(
        `/accounting/petty-cash/report?startDate=${start}&endDate=${end}`,
      );
      setReport(res.data ?? null);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" className="h-9 w-40" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" className="h-9 w-40" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <Button size="sm" className="h-9" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load report"}
          </Button>
        </CardContent>
      </Card>

      {report && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Disbursements", value: report.transactions.disbursements },
              { label: "Replenishments", value: report.transactions.replenishments },
              { label: "Claims amount", value: report.claims.totalAmount },
              { label: "Reimbursed", value: report.reimbursements.total },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="p-4">
                  <p className="text-[10px] uppercase text-muted-foreground">{c.label}</p>
                  <p className="text-xl font-bold tabular-nums mt-1">LKR {formatNumber(c.value)}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b"><h3 className="text-sm font-semibold">Fund status</h3></div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                      <th className="text-left px-4 py-2">Fund</th>
                      <th className="text-right px-4 py-2">Float</th>
                      <th className="text-right px-4 py-2">Balance</th>
                      <th className="text-right px-4 py-2">Shortfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.funds.map((f) => (
                      <tr key={f.id} className="border-b border-border/40">
                        <td className="px-4 py-2">{f.code} — {f.name}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(f.floatAmount)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(f.currentBalance)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(f.shortfall)}</td>
                      </tr>
                    ))}
                    {!report.funds.length && (
                      <tr><td colSpan={4} className="text-center text-muted-foreground py-8">No funds</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="px-4 py-3 border-b"><h3 className="text-sm font-semibold">Spend by category</h3></div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-[10px] uppercase text-muted-foreground">
                      <th className="text-left px-4 py-2">Category</th>
                      <th className="text-right px-4 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.transactions.byCategory.map((r) => (
                      <tr key={r.category} className="border-b border-border/40">
                        <td className="px-4 py-2">{r.category}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatNumber(r.amount)}</td>
                      </tr>
                    ))}
                    {!report.transactions.byCategory.length && (
                      <tr><td colSpan={2} className="text-center text-muted-foreground py-8">No disbursements</td></tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4">
              <h3 className="text-sm font-semibold mb-3">Claims by status</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(report.claims.byStatus).map(([status, v]) => (
                  <Badge key={status} variant="outline" className="text-xs py-1 px-2">
                    {status}: {v.count} · LKR {formatNumber(v.amount)}
                  </Badge>
                ))}
                {!Object.keys(report.claims.byStatus).length && (
                  <p className="text-sm text-muted-foreground">No claims in period</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
