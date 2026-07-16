"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Building2, BookOpen, FileCheck, Landmark, Loader2, Plus, RefreshCw, Scale, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatNumber } from "@/lib/utils";

type AgingBuckets = Record<string, { count: number; amount: number }>;

type APData = {
  total: number;
  invoiceDueTotal?: number;
  purchaseOrderDueTotal?: number;
  buckets?: AgingBuckets;
  suppliers: { id: string; name: string; balance: number }[];
  unpaidPurchaseOrders: { poNumber: string; balanceDue: number; supplier: { name: string } }[];
};

type ARData = {
  total: number;
  count: number;
  buckets?: AgingBuckets;
  customers: {
    id: string; code: string; firstName: string; lastName: string;
    phone: string; creditBalance: number; creditLimit: number;
    bucket?: string; daysPastDue?: number;
  }[];
};

type BankAccount = {
  id: string; code: string; name: string; type: string;
  bankName?: string | null; currentBalance: number; currency: string;
};

type Cheque = {
  id: string; chequeNumber: string; direction: string; status: string;
  amount: number; partyName?: string | null; bankName?: string | null;
  dueDate?: string | null; bankAccount?: { name: string; code: string } | null;
};

type CashBookEntry = {
  entryDate: string; type: string; description: string;
  debit: number; credit: number; balanceAfter?: number;
};

type Recon = {
  id: string; statementDate: string; statementBalance: number;
  systemBalance: number; difference: number; status: string;
  bankAccount?: { name: string; code: string };
};

const BUCKET_LABELS: Record<string, string> = {
  current: "Current",
  "1_30": "1–30",
  "31_60": "31–60",
  "61_90": "61–90",
  "90_plus": "90+",
};

function AgingStrip({ buckets }: { buckets?: AgingBuckets }) {
  if (!buckets) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
      {Object.entries(BUCKET_LABELS).map(([key, label]) => (
        <div key={key} className="rounded-lg border px-3 py-2 bg-muted/20">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
          <div className="text-sm font-semibold tabular-nums">{formatNumber(buckets[key]?.amount ?? 0)}</div>
          <div className="text-[10px] text-muted-foreground">{buckets[key]?.count ?? 0} items</div>
        </div>
      ))}
    </div>
  );
}

export default function FinanceHubPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [loading, setLoading] = useState(true);
  const [ap, setAp] = useState<APData | null>(null);
  const [ar, setAr] = useState<ARData | null>(null);
  const [banks, setBanks] = useState<BankAccount[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [cashBook, setCashBook] = useState<{ opening: number; closing: number; source: string; entries: CashBookEntry[] } | null>(null);
  const [recons, setRecons] = useState<Recon[]>([]);
  const [cbStart, setCbStart] = useState(monthStart);
  const [cbEnd, setCbEnd] = useState(today);

  // Bank form
  const [baCode, setBaCode] = useState("");
  const [baName, setBaName] = useState("");
  const [baBank, setBaBank] = useState("");
  const [baOpen, setBaOpen] = useState("0");
  const [baBusy, setBaBusy] = useState(false);

  // Cheque form
  const [chDir, setChDir] = useState("RECEIVED");
  const [chNum, setChNum] = useState("");
  const [chAmt, setChAmt] = useState("");
  const [chParty, setChParty] = useState("");
  const [chBankId, setChBankId] = useState("");
  const [chBusy, setChBusy] = useState(false);

  // Recon form
  const [rcBankId, setRcBankId] = useState("");
  const [rcDate, setRcDate] = useState(today);
  const [rcBal, setRcBal] = useState("");
  const [rcBusy, setRcBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apR, arR, bankR, chR, cbR, rcR] = await Promise.all([
        api.get<APData>("/accounting/accounts-payable"),
        api.get<ARData>("/accounting/accounts-receivable"),
        api.get<BankAccount[]>("/accounting/bank-accounts"),
        api.get<{ data: Cheque[] }>("/accounting/cheques?limit=50"),
        api.get<{ opening: number; closing: number; source: string; entries: CashBookEntry[] }>(
          `/accounting/cash-book?startDate=${cbStart}&endDate=${cbEnd}`,
        ),
        api.get<Recon[]>("/accounting/bank-reconciliations"),
      ]);
      setAp(apR.data ?? null);
      setAr(arR.data ?? null);
      setBanks(Array.isArray(bankR.data) ? bankR.data : []);
      setCheques(chR.data?.data ?? []);
      setCashBook(cbR.data ?? null);
      setRecons(Array.isArray(rcR.data) ? rcR.data : []);
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Failed to load finance data");
    } finally {
      setLoading(false);
    }
  }, [cbStart, cbEnd]);

  useEffect(() => { load(); }, [load]);

  const createBank = async () => {
    if (!baCode || !baName) { toast.error("Code and name required"); return; }
    setBaBusy(true);
    try {
      await api.post("/accounting/bank-accounts", {
        code: baCode,
        name: baName,
        bankName: baBank || undefined,
        openingBalance: parseFloat(baOpen) || 0,
      });
      toast.success("Bank account created");
      setBaCode(""); setBaName(""); setBaBank(""); setBaOpen("0");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Create failed");
    } finally {
      setBaBusy(false);
    }
  };

  const createCheque = async () => {
    if (!chNum || !chAmt) { toast.error("Cheque number and amount required"); return; }
    setChBusy(true);
    try {
      await api.post("/accounting/cheques", {
        direction: chDir,
        chequeNumber: chNum,
        amount: parseFloat(chAmt),
        partyName: chParty || undefined,
        bankAccountId: chBankId || undefined,
      });
      toast.success("Cheque registered");
      setChNum(""); setChAmt(""); setChParty("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Cheque failed");
    } finally {
      setChBusy(false);
    }
  };

  const setChequeStatus = async (id: string, status: string, bankAccountId?: string) => {
    try {
      await api.put(`/accounting/cheques/${id}/status`, { status, bankAccountId });
      toast.success(`Cheque marked ${status}`);
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Status update failed");
    }
  };

  const startRecon = async () => {
    if (!rcBankId || rcBal === "") { toast.error("Select account and statement balance"); return; }
    setRcBusy(true);
    try {
      await api.post("/accounting/bank-reconciliations", {
        bankAccountId: rcBankId,
        statementDate: rcDate,
        statementBalance: parseFloat(rcBal),
      });
      toast.success("Reconciliation started");
      setRcBal("");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Recon failed");
    } finally {
      setRcBusy(false);
    }
  };

  const completeRecon = async (id: string) => {
    try {
      await api.post(`/accounting/bank-reconciliations/${id}/complete`, { matchedTxnIds: [] });
      toast.success("Reconciliation completed");
      load();
    } catch (e: unknown) {
      toast.error((e as Error).message ?? "Complete failed");
    }
  };

  if (loading && !ap) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Finance Hub</h1>
          <p className="text-sm text-muted-foreground">AP / AR aging, cash book, banks, cheques & reconciliation</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Accounts Payable</div>
            <div className="text-xl font-semibold tabular-nums">{formatNumber(ap?.total ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Accounts Receivable</div>
            <div className="text-xl font-semibold tabular-nums">{formatNumber(ar?.total ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Bank balances</div>
            <div className="text-xl font-semibold tabular-nums">
              {formatNumber(banks.reduce((s, b) => s + b.currentBalance, 0))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Cash book closing</div>
            <div className="text-xl font-semibold tabular-nums">{formatNumber(cashBook?.closing ?? 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="ap">
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="ap"><Scale className="h-3.5 w-3.5 mr-1.5" />Payable</TabsTrigger>
          <TabsTrigger value="ar"><Wallet className="h-3.5 w-3.5 mr-1.5" />Receivable</TabsTrigger>
          <TabsTrigger value="cash"><BookOpen className="h-3.5 w-3.5 mr-1.5" />Cash Book</TabsTrigger>
          <TabsTrigger value="banks"><Landmark className="h-3.5 w-3.5 mr-1.5" />Banks</TabsTrigger>
          <TabsTrigger value="cheques"><FileCheck className="h-3.5 w-3.5 mr-1.5" />Cheques</TabsTrigger>
          <TabsTrigger value="recon"><Building2 className="h-3.5 w-3.5 mr-1.5" />Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="ap" className="space-y-4 mt-4">
          <AgingStrip buckets={ap?.buckets} />
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Supplier</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(ap?.suppliers ?? []).map((s) => (
                  <tr key={s.id} className="border-t">
                    <td className="px-3 py-2">{s.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(s.balance)}</td>
                  </tr>
                ))}
                {!ap?.suppliers?.length && (
                  <tr><td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">No outstanding payables</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="ar" className="space-y-4 mt-4">
          <AgingStrip buckets={ar?.buckets} />
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Bucket</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {(ar?.customers ?? []).map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">{c.firstName} {c.lastName} <span className="text-xs text-muted-foreground">({c.code})</span></td>
                    <td className="px-3 py-2"><Badge variant="outline">{BUCKET_LABELS[c.bucket ?? ""] ?? c.bucket ?? "—"}</Badge></td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.creditBalance)}</td>
                  </tr>
                ))}
                {!ar?.customers?.length && (
                  <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No outstanding receivables</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="cash" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={cbStart} onChange={(e) => setCbStart(e.target.value)} className="w-40" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={cbEnd} onChange={(e) => setCbEnd(e.target.value)} className="w-40" />
            </div>
            <Button size="sm" onClick={() => load()}>Load</Button>
            <Badge variant="secondary">{cashBook?.source ?? "—"}</Badge>
            <span className="text-sm text-muted-foreground ml-auto">
              Opening {formatNumber(cashBook?.opening ?? 0)} → Closing {formatNumber(cashBook?.closing ?? 0)}
            </span>
          </div>
          <div className="rounded-lg border overflow-hidden max-h-[420px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground sticky top-0">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                  <th className="px-3 py-2 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {(cashBook?.entries ?? []).map((e, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-3 py-1.5 whitespace-nowrap">{String(e.entryDate).slice(0, 10)}</td>
                    <td className="px-3 py-1.5 text-xs">{e.type}</td>
                    <td className="px-3 py-1.5">{e.description}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{e.debit ? formatNumber(e.debit) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{e.credit ? formatNumber(e.credit) : "—"}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatNumber(e.balanceAfter ?? 0)}</td>
                  </tr>
                ))}
                {!cashBook?.entries?.length && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No cash movements in range</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="banks" className="space-y-4 mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-lg border p-4 space-y-3">
              <h3 className="font-medium text-sm flex items-center gap-2"><Plus className="h-4 w-4" /> New bank account</h3>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Code" value={baCode} onChange={(e) => setBaCode(e.target.value)} />
                <Input placeholder="Name" value={baName} onChange={(e) => setBaName(e.target.value)} />
                <Input placeholder="Bank name" value={baBank} onChange={(e) => setBaBank(e.target.value)} />
                <Input placeholder="Opening balance" type="number" value={baOpen} onChange={(e) => setBaOpen(e.target.value)} />
              </div>
              <Button size="sm" onClick={createBank} disabled={baBusy}>
                {baBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create
              </Button>
            </div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Account</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {banks.map((b) => (
                    <tr key={b.id} className="border-t">
                      <td className="px-3 py-2">
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-muted-foreground">{b.code}{b.bankName ? ` · ${b.bankName}` : ""}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{b.type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(b.currentBalance)}</td>
                    </tr>
                  ))}
                  {!banks.length && (
                    <tr><td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">No bank accounts yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="cheques" className="space-y-4 mt-4">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium text-sm">Register cheque</h3>
            <div className="grid sm:grid-cols-5 gap-2">
              <Select value={chDir} onValueChange={setChDir}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RECEIVED">Received</SelectItem>
                  <SelectItem value="ISSUED">Issued</SelectItem>
                </SelectContent>
              </Select>
              <Input placeholder="Cheque #" value={chNum} onChange={(e) => setChNum(e.target.value)} />
              <Input placeholder="Amount" type="number" value={chAmt} onChange={(e) => setChAmt(e.target.value)} />
              <Input placeholder="Party name" value={chParty} onChange={(e) => setChParty(e.target.value)} />
              <Select value={chBankId || "_none"} onValueChange={(v) => setChBankId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Bank account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No bank</SelectItem>
                  {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={createCheque} disabled={chBusy}>
              {chBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Register
            </Button>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Cheque</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {cheques.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="px-3 py-2">
                      <div className="font-medium">{c.chequeNumber}</div>
                      <div className="text-xs text-muted-foreground">{c.direction}</div>
                    </td>
                    <td className="px-3 py-2">{c.partyName ?? "—"}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{c.status}</Badge></td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(c.amount)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {c.status !== "DEPOSITED" && c.status !== "CLEARED" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setChequeStatus(c.id, "DEPOSITED", c.bankAccount ? undefined : chBankId || banks[0]?.id)}>
                            Deposit
                          </Button>
                        )}
                        {c.status !== "CLEARED" && c.status !== "BOUNCED" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setChequeStatus(c.id, "CLEARED", banks[0]?.id)}>
                            Clear
                          </Button>
                        )}
                        {c.status !== "BOUNCED" && c.status !== "CLEARED" && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => setChequeStatus(c.id, "BOUNCED")}>
                            Bounce
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!cheques.length && (
                  <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No cheques</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="recon" className="space-y-4 mt-4">
          <div className="rounded-lg border p-4 space-y-3">
            <h3 className="font-medium text-sm">Start reconciliation</h3>
            <div className="grid sm:grid-cols-4 gap-2">
              <Select value={rcBankId || "_none"} onValueChange={(v) => setRcBankId(v === "_none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Bank account" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Select account</SelectItem>
                  {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({formatNumber(b.currentBalance)})</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={rcDate} onChange={(e) => setRcDate(e.target.value)} />
              <Input type="number" placeholder="Statement balance" value={rcBal} onChange={(e) => setRcBal(e.target.value)} />
              <Button onClick={startRecon} disabled={rcBusy}>
                {rcBusy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Start
              </Button>
            </div>
          </div>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Statement</th>
                  <th className="px-3 py-2 text-right">System</th>
                  <th className="px-3 py-2 text-right">Diff</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {recons.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.bankAccount?.name ?? "—"}</td>
                    <td className="px-3 py-2">{String(r.statementDate).slice(0, 10)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.statementBalance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.systemBalance)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.difference)}</td>
                    <td className="px-3 py-2"><Badge variant="outline">{r.status}</Badge></td>
                    <td className="px-3 py-2">
                      {r.status === "DRAFT" && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => completeRecon(r.id)}>
                          Complete
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {!recons.length && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No reconciliations yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
